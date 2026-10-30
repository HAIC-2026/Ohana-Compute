package nws

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/geoapplicability"
)

const (
	MaxZoneResponseBytes = 2 << 20
	MaxZoneVertices      = 8192
	ZoneValidationWork   = 5_000_000
	MaxZonePrefetch      = 256
)

const (
	ZoneCoverageComplete = "complete"
	ZoneCoveragePartial  = "partial"
	ZoneCoveragePending  = "pending"

	ZoneReasonIncomplete = "zone_incomplete"
	ZoneReasonPending    = "zone_pending"
)

type ZoneRequest struct {
	Zone Zone
}

type ZonePrefetcher interface {
	PrefetchZones([]ZoneRequest)
}

type ZoneEvidence struct {
	URL            string  `json:"url"`
	ID             string  `json:"id"`
	Type           string  `json:"type"`
	SourceRevision *string `json:"source_revision"`
	Effective      *string `json:"effective"`
	Expires        *string `json:"expires"`
	RetrievedAt    *string `json:"retrieved_at"`
	FreshUntil     *string `json:"fresh_until"`
	State          string  `json:"state"`
	Result         string  `json:"result"`
	Reason         string  `json:"reason"`
}

type ZoneApplicability struct {
	Result   string         `json:"result"`
	Reason   string         `json:"reason"`
	Coverage string         `json:"coverage"`
	Zones    []ZoneEvidence `json:"zones"`
}

type ZoneConfig struct {
	HTTPClient *http.Client
	UserAgent  string
	CacheTTL   time.Duration
	Now        func() time.Time
}

type ZoneClient struct {
	httpClient *http.Client
	userAgent  string
	cacheTTL   time.Duration
	now        func() time.Time
	semaphore  chan struct{}

	mu    sync.RWMutex
	cache map[string]zoneCacheEntry
}

type zoneCacheEntry struct {
	state        string
	zone         Zone
	prepared     []*geoapplicability.Prepared
	revision     string
	effective    string
	expires      string
	retrievedAt  time.Time
	freshUntil   time.Time
	freshness    zoneFreshnessPolicy
	etag         string
	lastModified string
	reason       string
}

type zoneFeature struct {
	Type       string          `json:"type"`
	ID         string          `json:"id"`
	Geometry   json.RawMessage `json:"geometry"`
	Properties zoneProperties  `json:"properties"`
}

type zoneProperties struct {
	URL        string `json:"@id"`
	ID         string `json:"id"`
	Type       string `json:"type"`
	Effective  string `json:"effectiveDate"`
	Expiration string `json:"expirationDate"`
}

type zoneGeometry struct {
	Type        string            `json:"type"`
	Coordinates json.RawMessage   `json:"coordinates"`
	Geometries  []json.RawMessage `json:"geometries"`
}

type zoneFreshnessPolicy struct {
	noCache bool
	maxAge  *int64
	expires time.Time
}

func NewZoneClient(config ZoneConfig) *ZoneClient {
	base := config.HTTPClient
	if base == nil {
		base = &http.Client{Timeout: 10 * time.Second}
	}
	copy := *base
	copy.CheckRedirect = func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	}
	if copy.Timeout <= 0 || copy.Timeout > 10*time.Second {
		copy.Timeout = 10 * time.Second
	}
	userAgent := config.UserAgent
	if userAgent == "" {
		userAgent = "HawaiiResilienceAtlas/0.1 (https://github.com/chokevin/hawaii-resilience-map)"
	}
	cacheTTL := config.CacheTTL
	if cacheTTL <= 0 || cacheTTL > 24*time.Hour {
		cacheTTL = 24 * time.Hour
	}
	now := config.Now
	if now == nil {
		now = time.Now
	}
	return &ZoneClient{
		httpClient: &copy,
		userAgent:  userAgent,
		cacheTTL:   cacheTTL,
		now:        now,
		semaphore:  make(chan struct{}, 4),
		cache:      make(map[string]zoneCacheEntry),
	}
}

func (client *ZoneClient) PrefetchZones(requests []ZoneRequest) {
	unique := make(map[string]Zone)
	for _, request := range requests {
		if len(unique) >= MaxZonePrefetch {
			break
		}
		if canonicalZoneURL(request.Zone) == "" {
			continue
		}
		unique[request.Zone.URL] = request.Zone
	}
	now := client.now().UTC()
	for _, zone := range unique {
		if !client.markPending(zone, now) {
			continue
		}
		go client.prefetch(zone)
	}
}

func (client *ZoneClient) markPending(zone Zone, now time.Time) bool {
	client.mu.Lock()
	defer client.mu.Unlock()
	entry, ok := client.cache[zone.URL]
	if ok && entry.state == "pending" {
		return false
	}
	if ok && now.Before(entry.freshUntil) {
		return false
	}
	entry.state = "pending"
	entry.zone = zone
	client.cache[zone.URL] = entry
	return true
}

func (client *ZoneClient) prefetch(zone Zone) {
	client.semaphore <- struct{}{}
	defer func() { <-client.semaphore }()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	client.refresh(ctx, zone)
}

func (client *ZoneClient) refresh(ctx context.Context, zone Zone) {
	existing := client.entry(zone.URL)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, canonicalZoneURL(zone), nil)
	if err != nil {
		client.fail(zone, existing, "request_failed")
		return
	}
	request.Header.Set("Accept", "application/geo+json")
	request.Header.Set("User-Agent", client.userAgent)
	if existing.etag != "" {
		request.Header.Set("If-None-Match", existing.etag)
	} else if existing.lastModified != "" {
		request.Header.Set("If-Modified-Since", existing.lastModified)
	}
	response, err := client.httpClient.Do(request)
	if err != nil {
		client.fail(zone, existing, "request_failed")
		return
	}
	defer response.Body.Close()
	now := client.now().UTC()
	if response.StatusCode == http.StatusNotModified && len(existing.prepared) > 0 {
		freshness := updatedZoneFreshnessPolicy(response.Header, existing.freshness)
		freshnessTTL := freshness.ttl(response.Header, now, client.cacheTTL)
		existing.state = "fresh"
		existing.retrievedAt = now
		existing.freshUntil = now.Add(freshnessTTL)
		existing.freshness = freshness
		existing.reason = ""
		client.store(zone.URL, existing)
		return
	}
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, response.Body)
		client.fail(zone, existing, "http_"+strconv.Itoa(response.StatusCode))
		return
	}
	mediaType, _, err := mime.ParseMediaType(response.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/geo+json" {
		client.fail(zone, existing, "invalid_content_type")
		return
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, MaxZoneResponseBytes+1))
	if err != nil || len(body) > MaxZoneResponseBytes {
		client.fail(zone, existing, "too_large")
		return
	}
	entry, err := prepareZoneResponse(zone, body)
	if err != nil {
		reason := "invalid_payload"
		if errors.Is(err, geoapplicability.ErrTooComplex) {
			reason = "too_complex"
		}
		client.fail(zone, existing, reason)
		return
	}
	entry.state = "fresh"
	entry.zone = zone
	entry.retrievedAt = now
	entry.freshness = updatedZoneFreshnessPolicy(response.Header, zoneFreshnessPolicy{})
	entry.freshUntil = now.Add(entry.freshness.ttl(response.Header, now, client.cacheTTL))
	entry.etag = boundedHeader(response.Header.Get("ETag"))
	entry.lastModified = boundedHeader(response.Header.Get("Last-Modified"))
	client.store(zone.URL, entry)
}

func (client *ZoneClient) fail(zone Zone, existing zoneCacheEntry, reason string) {
	if len(existing.prepared) > 0 {
		existing.state = "stale"
		existing.reason = reason
		client.store(zone.URL, existing)
		return
	}
	client.store(zone.URL, zoneCacheEntry{
		state:       "unavailable",
		zone:        zone,
		retrievedAt: client.now().UTC(),
		freshUntil:  client.now().UTC().Add(15 * time.Minute),
		reason:      reason,
	})
}

func (client *ZoneClient) entry(key string) zoneCacheEntry {
	client.mu.RLock()
	defer client.mu.RUnlock()
	return client.cache[key]
}

func (client *ZoneClient) store(key string, entry zoneCacheEntry) {
	client.mu.Lock()
	defer client.mu.Unlock()
	client.cache[key] = entry
}

func (client *ZoneClient) EvaluateZones(
	zones []Zone,
	productSent *string,
	point geoapplicability.Point,
) ZoneApplicability {
	if len(zones) == 0 {
		return ZoneApplicability{
			Result: geoapplicability.ResultUnknown, Reason: geoapplicability.ReasonNoPolygon,
			Coverage: ZoneCoveragePartial, Zones: []ZoneEvidence{},
		}
	}
	now := client.now().UTC()
	seen := make(map[string]struct{})
	evidence := make([]ZoneEvidence, 0, len(zones))
	anyInside := false
	anyBoundary := false
	incomplete := false
	pending := false
	for _, zone := range zones {
		if _, ok := seen[zone.URL]; ok {
			continue
		}
		seen[zone.URL] = struct{}{}
		entry := client.entry(zone.URL)
		member := zoneEvidence(zone, entry)
		if entry.state == "pending" && len(entry.prepared) == 0 {
			member.State = "pending"
			member.Reason = ZoneReasonPending
			pending = true
			incomplete = true
			evidence = append(evidence, member)
			continue
		}
		if len(entry.prepared) == 0 || entry.state != "fresh" || !now.Before(entry.freshUntil) {
			member.State = "stale"
			if len(entry.prepared) == 0 {
				member.State = "unavailable"
			}
			member.Reason = firstNonEmpty(entry.reason, ZoneReasonIncomplete)
			incomplete = true
			evidence = append(evidence, member)
			continue
		}
		if !zoneTimeContains(entry, productSent) {
			member.Reason = "source_time_mismatch"
			incomplete = true
			evidence = append(evidence, member)
			continue
		}
		evaluation := evaluatePrepared(entry.prepared, point)
		member.Result = evaluation.Result
		member.Reason = evaluation.Reason
		evidence = append(evidence, member)
		if evaluation.Result == geoapplicability.ResultInside {
			anyInside = true
		} else if evaluation.Reason == geoapplicability.ReasonBoundary {
			anyBoundary = true
		} else if evaluation.Result != geoapplicability.ResultOutside {
			incomplete = true
		}
	}
	if anyInside {
		return ZoneApplicability{
			Result: geoapplicability.ResultInside, Reason: geoapplicability.ReasonStrictInterior,
			Coverage: coverage(incomplete, pending), Zones: evidence,
		}
	}
	if incomplete {
		reason := ZoneReasonIncomplete
		if pending {
			reason = ZoneReasonPending
		}
		return ZoneApplicability{
			Result: geoapplicability.ResultUnknown, Reason: reason,
			Coverage: coverage(true, pending), Zones: evidence,
		}
	}
	if anyBoundary {
		return ZoneApplicability{
			Result: geoapplicability.ResultUnknown, Reason: geoapplicability.ReasonBoundary,
			Coverage: ZoneCoverageComplete, Zones: evidence,
		}
	}
	return ZoneApplicability{
		Result: geoapplicability.ResultOutside, Reason: geoapplicability.ReasonStrictExterior,
		Coverage: ZoneCoverageComplete, Zones: evidence,
	}
}

func coverage(incomplete, pending bool) string {
	if pending {
		return ZoneCoveragePending
	}
	if incomplete {
		return ZoneCoveragePartial
	}
	return ZoneCoverageComplete
}

func zoneEvidence(zone Zone, entry zoneCacheEntry) ZoneEvidence {
	result := ZoneEvidence{
		URL: zone.URL, ID: zone.ID, Type: zone.Type, State: entry.state,
		Result: geoapplicability.ResultUnknown, Reason: firstNonEmpty(entry.reason, ZoneReasonIncomplete),
	}
	if entry.revision != "" {
		result.SourceRevision = stringPointer(entry.revision)
	}
	if entry.effective != "" {
		result.Effective = stringPointer(entry.effective)
	}
	if entry.expires != "" {
		result.Expires = stringPointer(entry.expires)
	}
	if !entry.retrievedAt.IsZero() {
		result.RetrievedAt = stringPointer(entry.retrievedAt.Format(time.RFC3339))
	}
	if !entry.freshUntil.IsZero() {
		result.FreshUntil = stringPointer(entry.freshUntil.Format(time.RFC3339))
	}
	return result
}

func evaluatePrepared(
	prepared []*geoapplicability.Prepared,
	point geoapplicability.Point,
) geoapplicability.Evaluation {
	boundary := false
	for _, member := range prepared {
		evaluation := member.Evaluate(point)
		if evaluation.Result == geoapplicability.ResultInside {
			return evaluation
		}
		if evaluation.Reason == geoapplicability.ReasonBoundary {
			boundary = true
		} else if evaluation.Result != geoapplicability.ResultOutside {
			return evaluation
		}
	}
	if boundary {
		return geoapplicability.Evaluation{
			Result: geoapplicability.ResultUnknown, Reason: geoapplicability.ReasonBoundary,
		}
	}
	return geoapplicability.Evaluation{
		Result: geoapplicability.ResultOutside, Reason: geoapplicability.ReasonStrictExterior,
	}
}

func prepareZoneResponse(zone Zone, body []byte) (zoneCacheEntry, error) {
	if err := rejectDuplicateJSONKeys(body); err != nil {
		return zoneCacheEntry{}, err
	}
	var feature zoneFeature
	if err := json.Unmarshal(body, &feature); err != nil {
		return zoneCacheEntry{}, err
	}
	canonical := canonicalZoneURL(zone)
	if feature.Type != "Feature" || feature.ID != canonical ||
		feature.Properties.URL != canonical || feature.Properties.ID != zone.ID {
		return zoneCacheEntry{}, errors.New("zone identity mismatch")
	}
	effective, err := time.Parse(time.RFC3339, feature.Properties.Effective)
	if err != nil {
		return zoneCacheEntry{}, errors.New("invalid effective date")
	}
	expiration, err := time.Parse(time.RFC3339, feature.Properties.Expiration)
	if err != nil || !expiration.After(effective) {
		return zoneCacheEntry{}, errors.New("invalid expiration date")
	}
	prepared, vertices, err := prepareZoneGeometry(feature.Geometry)
	if err != nil {
		return zoneCacheEntry{}, err
	}
	if vertices == 0 || vertices > MaxZoneVertices {
		return zoneCacheEntry{}, errors.New("zone vertex limit exceeded")
	}
	var geometryValue any
	decoder := json.NewDecoder(bytes.NewReader(feature.Geometry))
	decoder.UseNumber()
	if err := decoder.Decode(&geometryValue); err != nil {
		return zoneCacheEntry{}, err
	}
	revisionSource := struct {
		URL        string `json:"url"`
		ID         string `json:"id"`
		Effective  string `json:"effective"`
		Expiration string `json:"expiration"`
		Geometry   any    `json:"geometry"`
	}{
		URL: canonical, ID: zone.ID, Effective: feature.Properties.Effective,
		Expiration: feature.Properties.Expiration, Geometry: geometryValue,
	}
	canonicalRevision, _ := json.Marshal(revisionSource)
	digest := sha256.Sum256(canonicalRevision)
	return zoneCacheEntry{
		prepared: prepared, revision: hex.EncodeToString(digest[:]),
		effective: feature.Properties.Effective, expires: feature.Properties.Expiration,
	}, nil
}

func prepareZoneGeometry(raw json.RawMessage) ([]*geoapplicability.Prepared, int, error) {
	var envelope zoneGeometry
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return nil, 0, err
	}
	budget := geoapplicability.NewValidationBudget(ZoneValidationWork)
	switch envelope.Type {
	case "Polygon", "MultiPolygon":
		vertices, err := countGeometryVertices(raw)
		if err != nil || vertices > MaxZoneVertices {
			return nil, vertices, firstError(err, errors.New("zone vertex limit exceeded"))
		}
		prepared, err := geoapplicability.PrepareWithBudget(envelope.Type, raw, budget)
		return []*geoapplicability.Prepared{prepared}, vertices, err
	case "GeometryCollection":
		if len(envelope.Geometries) == 0 || len(envelope.Geometries) > MaxListItems {
			return nil, 0, errors.New("invalid geometry collection")
		}
		prepared := make([]*geoapplicability.Prepared, 0, len(envelope.Geometries))
		vertices := 0
		for _, member := range envelope.Geometries {
			var item zoneGeometry
			if err := json.Unmarshal(member, &item); err != nil ||
				(item.Type != "Polygon" && item.Type != "MultiPolygon") {
				return nil, vertices, errors.New("unsupported geometry collection member")
			}
			count, err := countGeometryVertices(member)
			vertices += count
			if err != nil || vertices > MaxZoneVertices {
				return nil, vertices, firstError(err, errors.New("zone vertex limit exceeded"))
			}
			value, err := geoapplicability.PrepareWithBudget(item.Type, member, budget)
			if err != nil {
				return nil, vertices, err
			}
			prepared = append(prepared, value)
		}
		return prepared, vertices, nil
	default:
		return nil, 0, errors.New("unsupported zone geometry")
	}
}

func countGeometryVertices(raw json.RawMessage) (int, error) {
	var envelope zoneGeometry
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return 0, err
	}
	var value any
	decoder := json.NewDecoder(bytes.NewReader(envelope.Coordinates))
	decoder.UseNumber()
	if err := decoder.Decode(&value); err != nil {
		return 0, err
	}
	var count func(any) (int, error)
	count = func(candidate any) (int, error) {
		values, ok := candidate.([]any)
		if !ok {
			return 0, errors.New("invalid coordinates")
		}
		if len(values) == 2 {
			if _, left := values[0].(json.Number); left {
				if _, right := values[1].(json.Number); right {
					return 1, nil
				}
			}
		}
		total := 0
		for _, child := range values {
			childCount, err := count(child)
			if err != nil {
				return 0, err
			}
			total += childCount
			if total > MaxZoneVertices {
				return total, nil
			}
		}
		return total, nil
	}
	return count(value)
}

func zoneTimeContains(entry zoneCacheEntry, productSent *string) bool {
	if productSent == nil {
		return false
	}
	sent, err := time.Parse(time.RFC3339Nano, *productSent)
	if err != nil {
		return false
	}
	effective, err := time.Parse(time.RFC3339, entry.effective)
	if err != nil {
		return false
	}
	expiration, err := time.Parse(time.RFC3339, entry.expires)
	return err == nil && !sent.Before(effective) && sent.Before(expiration)
}

func canonicalZoneURL(zone Zone) string {
	expected, ok := parseZone(zone.URL)
	if !ok || expected != zone {
		return ""
	}
	return "https://api.weather.gov/zones/" + zone.Type + "/" + zone.ID
}

func boundedHeader(value string) string {
	if len(value) > MaxIdentityBytes || strings.ContainsAny(value, "\r\n") {
		return ""
	}
	return value
}

func updatedZoneFreshnessPolicy(
	header http.Header,
	previous zoneFreshnessPolicy,
) zoneFreshnessPolicy {
	policy := previous
	cacheControl := strings.Join(header.Values("Cache-Control"), ",")
	if cacheControl != "" {
		policy = zoneFreshnessPolicy{}
		directives := strings.Split(cacheControl, ",")
		for _, rawDirective := range directives {
			name, _, _ := strings.Cut(strings.TrimSpace(rawDirective), "=")
			switch strings.ToLower(strings.TrimSpace(name)) {
			case "no-cache", "no-store":
				policy.noCache = true
				return policy
			}
		}
		for _, rawDirective := range directives {
			directive := strings.TrimSpace(rawDirective)
			name, value, hasValue := strings.Cut(directive, "=")
			if strings.EqualFold(strings.TrimSpace(name), "max-age") {
				if !hasValue {
					policy.noCache = true
					return policy
				}
				seconds, err := strconv.ParseInt(strings.Trim(strings.TrimSpace(value), `"`), 10, 64)
				if err != nil || seconds < 0 || policy.maxAge != nil {
					policy.noCache = true
					policy.maxAge = nil
					return policy
				}
				policy.maxAge = &seconds
			}
		}
	}
	if rawExpires := header.Get("Expires"); rawExpires != "" {
		expires, err := http.ParseTime(rawExpires)
		if err != nil {
			policy.noCache = true
			policy.expires = time.Time{}
			return policy
		}
		policy.expires = expires
	}
	return policy
}

func (policy zoneFreshnessPolicy) ttl(
	header http.Header,
	now time.Time,
	maximum time.Duration,
) time.Duration {
	if policy.noCache {
		return 0
	}
	if policy.maxAge != nil {
		age, ok := boundedAge(header.Get("Age"))
		if !ok || *policy.maxAge <= age {
			return 0
		}
		seconds := *policy.maxAge - age
		if seconds >= int64(maximum/time.Second) {
			return maximum
		}
		return time.Duration(seconds) * time.Second
	}
	if !policy.expires.IsZero() {
		return minDuration(maxDuration(policy.expires.Sub(now), 0), maximum)
	}
	return maximum
}

func boundedAge(value string) (int64, bool) {
	if value == "" {
		return 0, true
	}
	seconds, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	return seconds, err == nil && seconds >= 0
}

func minDuration(left, right time.Duration) time.Duration {
	if left < right {
		return left
	}
	return right
}

func maxDuration(left, right time.Duration) time.Duration {
	if left > right {
		return left
	}
	return right
}

func rejectDuplicateJSONKeys(body []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	var scan func() error
	scan = func() error {
		token, err := decoder.Token()
		if err != nil {
			return err
		}
		delimiter, ok := token.(json.Delim)
		if !ok {
			return nil
		}
		switch delimiter {
		case '{':
			seen := make(map[string]struct{})
			for decoder.More() {
				keyToken, err := decoder.Token()
				if err != nil {
					return err
				}
				key, ok := keyToken.(string)
				if !ok {
					return errors.New("invalid object key")
				}
				if _, duplicate := seen[key]; duplicate {
					return fmt.Errorf("duplicate JSON key %q", key)
				}
				seen[key] = struct{}{}
				if err := scan(); err != nil {
					return err
				}
			}
			_, err = decoder.Token()
			return err
		case '[':
			for decoder.More() {
				if err := scan(); err != nil {
					return err
				}
			}
			_, err = decoder.Token()
			return err
		default:
			return errors.New("invalid JSON delimiter")
		}
	}
	if err := scan(); err != nil {
		return err
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return errors.New("trailing JSON")
	}
	return nil
}

func stringPointer(value string) *string { return &value }

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func firstError(err error, fallback error) error {
	if err != nil {
		return err
	}
	return fallback
}
