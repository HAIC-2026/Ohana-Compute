package arcgis

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sync"
	"time"
)

type FeatureCollection struct {
	Type     string    `json:"type"`
	Features []Feature `json:"features"`
}

type Feature struct {
	Type       string          `json:"type"`
	ID         any             `json:"id,omitempty"`
	Geometry   json.RawMessage `json:"geometry"`
	Properties map[string]any  `json:"properties"`
}

type SourceStatus struct {
	ID                   string     `json:"id"`
	Authority            string     `json:"authority"`
	URL                  string     `json:"url"`
	UpstreamLastModified string     `json:"upstream_last_modified,omitempty"`
	RetrievedAt          time.Time  `json:"retrieved_at"`
	RefreshAttemptedAt   *time.Time `json:"refresh_attempted_at,omitempty"`
	FreshUntil           time.Time  `json:"fresh_until"`
	Status               string     `json:"status"`
}

type Result struct {
	Collection FeatureCollection `json:"collection"`
	Source     SourceStatus      `json:"source"`
	Warnings   []string          `json:"warnings,omitempty"`
}

type Request struct {
	SourceID  string
	Authority string
	URL       string
	Params    url.Values
	CacheTTL  time.Duration
}

type Config struct {
	HTTPClient *http.Client
	UserAgent  string
	Now        func() time.Time
}

type cacheEntry struct {
	result Result
}

type Client struct {
	httpClient *http.Client
	userAgent  string
	now        func() time.Time

	mu    sync.RWMutex
	cache map[string]cacheEntry
}

type responseEnvelope struct {
	Type     string       `json:"type"`
	Features []rawFeature `json:"features"`
	Error    *arcGISError `json:"error"`
}

type rawFeature struct {
	Type       string          `json:"type"`
	ID         any             `json:"id,omitempty"`
	Geometry   json.RawMessage `json:"geometry"`
	Properties map[string]any  `json:"properties"`
	Attributes map[string]any  `json:"attributes"`
}

type arcGISError struct {
	Code    int      `json:"code"`
	Message string   `json:"message"`
	Details []string `json:"details"`
}

func NewClient(config Config) *Client {
	httpClient := config.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 12 * time.Second}
	}
	userAgent := config.UserAgent
	if userAgent == "" {
		userAgent = "HawaiiResilienceAtlas/0.1 (https://github.com/chokevin/hawaii-resilience-map)"
	}
	now := config.Now
	if now == nil {
		now = time.Now
	}
	return &Client{
		httpClient: httpClient,
		userAgent:  userAgent,
		now:        now,
		cache:      make(map[string]cacheEntry),
	}
}

func (client *Client) Query(ctx context.Context, query Request) (Result, error) {
	if query.SourceID == "" || query.Authority == "" || query.URL == "" {
		return Result{}, fmt.Errorf("ArcGIS query requires source ID, authority, and URL")
	}
	if query.CacheTTL <= 0 {
		return Result{}, fmt.Errorf("ArcGIS query for %s requires a positive cache TTL", query.SourceID)
	}

	params := cloneValues(query.Params)
	if params.Get("f") == "" {
		params.Set("f", "geojson")
	}
	requestURL, err := buildURL(query.URL, params)
	if err != nil {
		return Result{}, fmt.Errorf("build ArcGIS query URL: %w", err)
	}

	now := client.now().UTC()
	if cached, ok := client.fresh(requestURL, now); ok {
		return cached, nil
	}
	stale, hasStale := client.cached(requestURL)

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return Result{}, fmt.Errorf("create ArcGIS request: %w", err)
	}
	request.Header.Set("Accept", "application/geo+json, application/json")
	request.Header.Set("User-Agent", client.userAgent)

	response, err := client.httpClient.Do(request)
	if err != nil {
		return staleOrError(stale, hasStale, now, fmt.Errorf("request %s: %w", query.SourceID, err))
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, response.Body)
		return staleOrError(
			stale,
			hasStale,
			now,
			fmt.Errorf("%s returned HTTP %d", query.SourceID, response.StatusCode),
		)
	}

	var envelope responseEnvelope
	decoder := json.NewDecoder(io.LimitReader(response.Body, 16<<20))
	if err := decoder.Decode(&envelope); err != nil {
		return staleOrError(stale, hasStale, now, fmt.Errorf("decode %s: %w", query.SourceID, err))
	}
	if envelope.Error != nil {
		return staleOrError(
			stale,
			hasStale,
			now,
			fmt.Errorf(
				"%s ArcGIS error %d: %s",
				query.SourceID,
				envelope.Error.Code,
				envelope.Error.Message,
			),
		)
	}

	collectionType := envelope.Type
	if collectionType == "" {
		collectionType = "FeatureCollection"
	}
	features := make([]Feature, 0, len(envelope.Features))
	for _, raw := range envelope.Features {
		properties := raw.Properties
		if properties == nil {
			properties = raw.Attributes
		}
		featureType := raw.Type
		if featureType == "" {
			featureType = "Feature"
		}
		features = append(features, Feature{
			Type:       featureType,
			ID:         raw.ID,
			Geometry:   raw.Geometry,
			Properties: properties,
		})
	}
	result := Result{
		Collection: FeatureCollection{
			Type:     collectionType,
			Features: features,
		},
		Source: SourceStatus{
			ID:                   query.SourceID,
			Authority:            query.Authority,
			URL:                  query.URL,
			UpstreamLastModified: response.Header.Get("Last-Modified"),
			RetrievedAt:          now,
			FreshUntil:           now.Add(query.CacheTTL),
			Status:               "fresh",
		},
	}
	client.store(requestURL, result)
	return cloneResult(result), nil
}

func buildURL(rawURL string, params url.Values) (string, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}
	merged := parsed.Query()
	for key, values := range params {
		merged.Del(key)
		for _, value := range values {
			merged.Add(key, value)
		}
	}
	parsed.RawQuery = merged.Encode()
	return parsed.String(), nil
}

func cloneValues(values url.Values) url.Values {
	result := make(url.Values, len(values))
	for key, items := range values {
		result[key] = append([]string(nil), items...)
	}
	return result
}

func (client *Client) fresh(key string, now time.Time) (Result, bool) {
	client.mu.RLock()
	defer client.mu.RUnlock()
	entry, ok := client.cache[key]
	if !ok || !now.Before(entry.result.Source.FreshUntil) {
		return Result{}, false
	}
	return cloneResult(entry.result), true
}

func (client *Client) cached(key string) (Result, bool) {
	client.mu.RLock()
	defer client.mu.RUnlock()
	entry, ok := client.cache[key]
	if !ok {
		return Result{}, false
	}
	return cloneResult(entry.result), true
}

func (client *Client) store(key string, result Result) {
	client.mu.Lock()
	defer client.mu.Unlock()
	client.cache[key] = cacheEntry{result: cloneResult(result)}
}

func staleOrError(stale Result, ok bool, now time.Time, refreshErr error) (Result, error) {
	if !ok {
		return Result{}, refreshErr
	}
	lastRetrievedAt := stale.Source.RetrievedAt
	stale.Source.Status = "stale"
	stale.Source.RefreshAttemptedAt = &now
	stale.Warnings = []string{
		fmt.Sprintf(
			"%s refresh failed; serving the last valid snapshot from %s: %v",
			stale.Source.ID,
			lastRetrievedAt.Format(time.RFC3339),
			refreshErr,
		),
	}
	return stale, nil
}

func cloneResult(result Result) Result {
	result.Collection.Features = append([]Feature(nil), result.Collection.Features...)
	for index := range result.Collection.Features {
		feature := &result.Collection.Features[index]
		feature.Geometry = append(json.RawMessage(nil), feature.Geometry...)
		properties := make(map[string]any, len(feature.Properties))
		for key, value := range feature.Properties {
			properties[key] = value
		}
		feature.Properties = properties
	}
	result.Warnings = append([]string(nil), result.Warnings...)
	if result.Source.RefreshAttemptedAt != nil {
		refreshAttemptedAt := *result.Source.RefreshAttemptedAt
		result.Source.RefreshAttemptedAt = &refreshAttemptedAt
	}
	return result
}
