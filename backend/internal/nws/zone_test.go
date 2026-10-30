package nws

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/geoapplicability"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

func zoneFixture(zone Zone, geometry string) string {
	return `{
		"type":"Feature",
		"id":"` + zone.URL + `",
		"geometry":` + geometry + `,
		"properties":{
			"@id":"` + zone.URL + `",
			"id":"` + zone.ID + `",
			"type":"public",
			"effectiveDate":"2026-01-01T00:00:00Z",
			"expirationDate":"2200-01-01T00:00:00Z"
		}
	}`
}

func zoneResponse(status int, body string, headers map[string]string) *http.Response {
	header := make(http.Header)
	for key, value := range headers {
		header.Set(key, value)
	}
	return &http.Response{
		StatusCode: status,
		Header:     header,
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}

func testZoneClient(
	now func() time.Time,
	transport roundTripFunc,
) *ZoneClient {
	return NewZoneClient(ZoneConfig{
		HTTPClient: &http.Client{Transport: transport},
		CacheTTL:   time.Hour,
		Now:        now,
	})
}

func rectangleRingJSON(steps, xOffset int) string {
	var coordinates strings.Builder
	appendPoint := func(x, y int) {
		if coordinates.Len() > 0 {
			coordinates.WriteByte(',')
		}
		coordinates.WriteByte('[')
		coordinates.WriteString(strconv.FormatFloat(float64(x)/float64(steps)+float64(xOffset), 'f', 6, 64))
		coordinates.WriteByte(',')
		coordinates.WriteString(strconv.FormatFloat(float64(y)/float64(steps), 'f', 6, 64))
		coordinates.WriteByte(']')
	}
	for index := 0; index <= steps; index++ {
		appendPoint(index, 0)
	}
	for index := 1; index <= steps; index++ {
		appendPoint(steps, index)
	}
	for index := steps - 1; index >= 0; index-- {
		appendPoint(index, steps)
	}
	for index := steps - 1; index >= 0; index-- {
		appendPoint(0, index)
	}
	return coordinates.String()
}

func TestZoneClientFetchesValidatesAndClassifiesPreparedGeometry(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 30, 20, 0, 0, 0, time.UTC)
	zone := Zone{
		URL: "https://api.weather.gov/zones/forecast/HIZ006",
		ID:  "HIZ006", Type: "forecast",
	}
	body := zoneFixture(
		zone,
		`{"type":"GeometryCollection","geometries":[
			{"type":"Polygon","coordinates":[[[0,0],[2,0],[2,2],[0,2],[0,0]]]},
			{"type":"MultiPolygon","coordinates":[[[[4,0],[6,0],[6,2],[4,2],[4,0]]]]}
		]}`,
	)
	client := testZoneClient(func() time.Time { return now }, func(request *http.Request) (*http.Response, error) {
		if request.URL.String() != zone.URL ||
			request.Header.Get("Accept") != "application/geo+json" ||
			request.Header.Get("User-Agent") == "" {
			t.Fatalf("unsafe zone request: %#v", request)
		}
		return zoneResponse(http.StatusOK, body, map[string]string{
			"Content-Type":  "application/geo+json",
			"Last-Modified": "Thu, 16 Apr 2026 16:31:20 GMT",
		}), nil
	})
	client.refresh(context.Background(), zone)
	sent := "2026-10-30T19:00:00Z"
	for _, test := range []struct {
		name  string
		point geoapplicability.Point
		want  geoapplicability.Evaluation
	}{
		{"first member", geoapplicability.Point{Longitude: "1", Latitude: "1"}, geoapplicability.Evaluation{Result: "inside", Reason: "strict_interior"}},
		{"second member", geoapplicability.Point{Longitude: "5", Latitude: "1"}, geoapplicability.Evaluation{Result: "inside", Reason: "strict_interior"}},
		{"boundary", geoapplicability.Point{Longitude: "2", Latitude: "1"}, geoapplicability.Evaluation{Result: "unknown", Reason: "boundary"}},
		{"outside", geoapplicability.Point{Longitude: "3", Latitude: "1"}, geoapplicability.Evaluation{Result: "outside", Reason: "strict_exterior"}},
	} {
		t.Run(test.name, func(t *testing.T) {
			got := client.EvaluateZones([]Zone{zone}, &sent, test.point)
			if got.Result != test.want.Result || got.Reason != test.want.Reason ||
				got.Coverage != ZoneCoverageComplete || len(got.Zones) != 1 ||
				got.Zones[0].SourceRevision == nil || got.Zones[0].State != "fresh" {
				t.Fatalf("EvaluateZones() = %#v, want %#v", got, test.want)
			}
		})
	}
}

func TestZoneClientConditionalCacheAndStaleFailureFailClosed(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 30, 20, 0, 0, 0, time.UTC)
	zone := Zone{
		URL: "https://api.weather.gov/zones/forecast/HIZ006",
		ID:  "HIZ006", Type: "forecast",
	}
	requests := 0
	client := testZoneClient(func() time.Time { return now }, func(request *http.Request) (*http.Response, error) {
		requests++
		switch requests {
		case 1:
			return zoneResponse(
				http.StatusOK,
				zoneFixture(zone, `{"type":"Polygon","coordinates":[[[0,0],[2,0],[2,2],[0,2],[0,0]]]}`),
				map[string]string{
					"Content-Type":  "application/geo+json",
					"Last-Modified": "Thu, 16 Apr 2026 16:31:20 GMT",
					"Cache-Control": "public, max-age=600",
				},
			), nil
		case 2:
			if request.Header.Get("If-Modified-Since") == "" {
				t.Fatal("conditional validator omitted")
			}
			return zoneResponse(http.StatusNotModified, "", map[string]string{
				"Cache-Control": "public, max-age=120",
			}), nil
		default:
			return nil, errors.New("offline")
		}
	})
	client.refresh(context.Background(), zone)
	first := client.entry(zone.URL)
	firstRevision := first.revision
	if want := now.Add(10 * time.Minute); !first.freshUntil.Equal(want) {
		t.Fatalf("200 freshness deadline = %s, want source-capped %s", first.freshUntil, want)
	}
	now = now.Add(2 * time.Hour)
	client.refresh(context.Background(), zone)
	if entry := client.entry(zone.URL); entry.state != "fresh" ||
		entry.revision != firstRevision || !entry.retrievedAt.Equal(now) ||
		!entry.freshUntil.Equal(now.Add(2*time.Minute)) {
		t.Fatalf("304 did not refresh validated cache: %#v", entry)
	}
	now = now.Add(2 * time.Hour)
	client.refresh(context.Background(), zone)
	sent := "2026-10-30T19:00:00Z"
	got := client.EvaluateZones(
		[]Zone{zone},
		&sent,
		geoapplicability.Point{Longitude: "1", Latitude: "1"},
	)
	if got.Result != "unknown" || got.Reason != ZoneReasonIncomplete ||
		got.Coverage != ZoneCoveragePartial || got.Zones[0].State != "stale" {
		t.Fatalf("stale geometry produced a definitive result: %#v", got)
	}
}

func TestZoneFreshnessTTLFailClosedParsing(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 30, 20, 0, 0, 0, time.UTC)
	for _, test := range []struct {
		name            string
		headers         map[string]string
		previousHeaders map[string]string
		want            time.Duration
	}{
		{"source cap with age", map[string]string{"Cache-Control": "public, max-age=600", "Age": "90"}, nil, 510 * time.Second},
		{"configured cap", map[string]string{"Cache-Control": "max-age=999999"}, nil, time.Hour},
		{"no store", map[string]string{"Cache-Control": "no-store"}, nil, 0},
		{"no store overrides max age", map[string]string{"Cache-Control": "max-age=600, no-store"}, nil, 0},
		{"malformed max age", map[string]string{"Cache-Control": "max-age=tomorrow"}, nil, 0},
		{"duplicate max age", map[string]string{"Cache-Control": "max-age=600, max-age=300"}, nil, 0},
		{"malformed age", map[string]string{"Cache-Control": "max-age=600", "Age": "old"}, nil, 0},
		{"expires", map[string]string{"Expires": now.Add(20 * time.Minute).Format(http.TimeFormat)}, nil, 20 * time.Minute},
		{"304 inherits max age", nil, map[string]string{"Cache-Control": "max-age=600"}, 10 * time.Minute},
		{"304 inherits no cache", nil, map[string]string{"Cache-Control": "no-cache"}, 0},
		{"304 age updates inherited max age", map[string]string{"Age": "90"}, map[string]string{"Cache-Control": "max-age=600"}, 510 * time.Second},
	} {
		t.Run(test.name, func(t *testing.T) {
			headers := func(values map[string]string) http.Header {
				header := make(http.Header)
				for key, value := range values {
					header.Set(key, value)
				}
				return header
			}
			previous := updatedZoneFreshnessPolicy(
				headers(test.previousHeaders),
				zoneFreshnessPolicy{},
			)
			current := headers(test.headers)
			policy := updatedZoneFreshnessPolicy(current, previous)
			if got := policy.ttl(current, now, time.Hour); got != test.want {
				t.Fatalf("zone freshness TTL = %s, want %s", got, test.want)
			}
		})
	}
}

func TestZoneAggregationNeverTurnsPartialCoverageIntoOutside(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 30, 20, 0, 0, 0, time.UTC)
	client := testZoneClient(func() time.Time { return now }, func(*http.Request) (*http.Response, error) {
		return nil, errors.New("unused")
	})
	sent := "2026-10-30T19:00:00Z"
	zones := []Zone{
		{URL: "https://api.weather.gov/zones/forecast/HIZ006", ID: "HIZ006", Type: "forecast"},
		{URL: "https://api.weather.gov/zones/forecast/HIZ007", ID: "HIZ007", Type: "forecast"},
	}
	valid, err := prepareZoneResponse(
		zones[0],
		[]byte(zoneFixture(zones[0], `{"type":"Polygon","coordinates":[[[0,0],[2,0],[2,2],[0,2],[0,0]]]}`)),
	)
	if err != nil {
		t.Fatal(err)
	}
	valid.state, valid.retrievedAt, valid.freshUntil = "fresh", now, now.Add(time.Hour)
	client.store(zones[0].URL, valid)
	client.store(zones[1].URL, zoneCacheEntry{
		state: "unavailable", zone: zones[1], reason: "http_503",
		retrievedAt: now, freshUntil: now.Add(time.Minute),
	})
	outside := client.EvaluateZones(
		zones,
		&sent,
		geoapplicability.Point{Longitude: "3", Latitude: "1"},
	)
	if outside.Result != "unknown" || outside.Reason != ZoneReasonIncomplete {
		t.Fatalf("partial coverage became outside: %#v", outside)
	}
	inside := client.EvaluateZones(
		zones,
		&sent,
		geoapplicability.Point{Longitude: "1", Latitude: "1"},
	)
	if inside.Result != "inside" || inside.Coverage != ZoneCoveragePartial ||
		len(inside.Zones) != 2 {
		t.Fatalf("known union interior was lost: %#v", inside)
	}
}

func TestZoneResponseRejectsMisbindingMalformedAndUnsupportedContent(t *testing.T) {
	t.Parallel()
	zone := Zone{
		URL: "https://api.weather.gov/zones/forecast/HIZ006",
		ID:  "HIZ006", Type: "forecast",
	}
	validGeometry := `{"type":"Polygon","coordinates":[[[0,0],[2,0],[2,2],[0,2],[0,0]]]}`
	for _, test := range []struct {
		name string
		body string
	}{
		{"identity", strings.Replace(zoneFixture(zone, validGeometry), `"id":"HIZ006"`, `"id":"HIZ007"`, 1)},
		{"duplicate", strings.Replace(zoneFixture(zone, validGeometry), `"type":"Feature"`, `"type":"Feature","type":"Feature"`, 1)},
		{"unsupported", zoneFixture(zone, `{"type":"Point","coordinates":[0,0]}`)},
		{"nested collection", zoneFixture(zone, `{"type":"GeometryCollection","geometries":[{"type":"GeometryCollection","geometries":[]}]}`)},
		{"bad dates", strings.Replace(zoneFixture(zone, validGeometry), `"expirationDate":"2200-01-01T00:00:00Z"`, `"expirationDate":"2025-01-01T00:00:00Z"`, 1)},
	} {
		t.Run(test.name, func(t *testing.T) {
			if _, err := prepareZoneResponse(zone, []byte(test.body)); err == nil {
				t.Fatal("invalid zone response was accepted")
			}
		})
	}
}

func TestZoneRevisionCanonicalizesWhitespaceAndBindsSourceTime(t *testing.T) {
	t.Parallel()
	zone := Zone{
		URL: "https://api.weather.gov/zones/forecast/HIZ006",
		ID:  "HIZ006", Type: "forecast",
	}
	compact := zoneFixture(zone, `{"type":"Polygon","coordinates":[[[0,0],[2,0],[2,2],[0,2],[0,0]]]}`)
	pretty := strings.ReplaceAll(compact, `,`, ",\n")
	left, err := prepareZoneResponse(zone, []byte(compact))
	if err != nil {
		t.Fatal(err)
	}
	right, err := prepareZoneResponse(zone, []byte(pretty))
	if err != nil {
		t.Fatal(err)
	}
	if left.revision != right.revision {
		t.Fatalf("whitespace changed revision: %s != %s", left.revision, right.revision)
	}
	now := time.Date(2026, 10, 30, 20, 0, 0, 0, time.UTC)
	left.state, left.retrievedAt, left.freshUntil = "fresh", now, now.Add(time.Hour)
	client := testZoneClient(func() time.Time { return now }, func(*http.Request) (*http.Response, error) {
		return nil, errors.New("unused")
	})
	client.store(zone.URL, left)
	before := "2025-12-31T23:59:59Z"
	got := client.EvaluateZones(
		[]Zone{zone},
		&before,
		geoapplicability.Point{Longitude: "1", Latitude: "1"},
	)
	if got.Result != "unknown" || got.Zones[0].Reason != "source_time_mismatch" {
		t.Fatalf("historical product was paired with current zone geometry: %#v", got)
	}
}

func TestZonePrefetchDeduplicatesAndBoundsBackgroundRequests(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 30, 20, 0, 0, 0, time.UTC)
	zone := Zone{
		URL: "https://api.weather.gov/zones/forecast/HIZ006",
		ID:  "HIZ006", Type: "forecast",
	}
	var mutex sync.Mutex
	requests := 0
	done := make(chan struct{})
	client := testZoneClient(func() time.Time { return now }, func(*http.Request) (*http.Response, error) {
		mutex.Lock()
		requests++
		mutex.Unlock()
		select {
		case <-done:
		default:
			close(done)
		}
		return zoneResponse(
			http.StatusOK,
			zoneFixture(zone, `{"type":"Polygon","coordinates":[[[0,0],[2,0],[2,2],[0,2],[0,0]]]}`),
			map[string]string{"Content-Type": "application/geo+json"},
		), nil
	})
	client.PrefetchZones([]ZoneRequest{{Zone: zone}, {Zone: zone}})
	client.PrefetchZones([]ZoneRequest{{Zone: zone}})
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("background prefetch did not run")
	}
	time.Sleep(20 * time.Millisecond)
	mutex.Lock()
	defer mutex.Unlock()
	if requests != 1 {
		t.Fatalf("duplicate prefetch requests = %d, want 1", requests)
	}
}

func TestZoneClientCanonicalizesCacheAndEvidenceIdentity(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 30, 20, 0, 0, 0, time.UTC)
	canonical := Zone{
		URL: "https://api.weather.gov/zones/forecast/HIZ006",
		ID:  "HIZ006", Type: "forecast",
	}
	encoded := Zone{
		URL: "https://api.weather.gov/zones/forecast/HIZ%30%30%36",
		ID:  "HIZ006", Type: "forecast",
	}
	requests := 0
	var mutex sync.Mutex
	done := make(chan struct{})
	client := testZoneClient(func() time.Time { return now }, func(request *http.Request) (*http.Response, error) {
		mutex.Lock()
		requests++
		mutex.Unlock()
		if request.URL.String() != canonical.URL {
			t.Fatalf("fetch URL = %s, want canonical %s", request.URL, canonical.URL)
		}
		select {
		case <-done:
		default:
			close(done)
		}
		return zoneResponse(
			http.StatusOK,
			zoneFixture(canonical, `{"type":"Polygon","coordinates":[[[0,0],[2,0],[2,2],[0,2],[0,0]]]}`),
			map[string]string{"Content-Type": "application/geo+json"},
		), nil
	})
	client.PrefetchZones([]ZoneRequest{{Zone: encoded}, {Zone: canonical}})
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("canonical zone prefetch did not run")
	}
	time.Sleep(20 * time.Millisecond)
	sent := "2026-10-30T19:00:00Z"
	got := client.EvaluateZones(
		[]Zone{encoded, canonical},
		&sent,
		geoapplicability.Point{Longitude: "1", Latitude: "1"},
	)
	mutex.Lock()
	defer mutex.Unlock()
	if requests != 1 || got.Result != "inside" || len(got.Zones) != 1 ||
		got.Zones[0].URL != canonical.URL {
		t.Fatalf("canonical identity was duplicated or lost: requests=%d evidence=%#v", requests, got)
	}
	incomplete := client.EvaluateZones(
		[]Zone{canonical, {
			URL: "https://example.test/zones/forecast/HIZ007",
			ID:  "HIZ007", Type: "forecast",
		}},
		&sent,
		geoapplicability.Point{Longitude: "3", Latitude: "1"},
	)
	if incomplete.Result != "unknown" || incomplete.Coverage != ZoneCoveragePartial {
		t.Fatalf("invalid cache identity produced false outside: %#v", incomplete)
	}
}

func TestZoneClientRejectsRedirectsWithoutFollowingProductControlledHosts(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 30, 20, 0, 0, 0, time.UTC)
	zone := Zone{
		URL: "https://api.weather.gov/zones/forecast/HIZ006",
		ID:  "HIZ006", Type: "forecast",
	}
	requests := 0
	client := testZoneClient(func() time.Time { return now }, func(request *http.Request) (*http.Response, error) {
		requests++
		if request.URL.String() != zone.URL {
			t.Fatalf("request escaped canonical zone URL: %s", request.URL)
		}
		return zoneResponse(http.StatusMovedPermanently, "", map[string]string{
			"Location": "https://example.test/private",
		}), nil
	})
	client.refresh(context.Background(), zone)
	if requests != 1 {
		t.Fatalf("redirect was followed: %d requests", requests)
	}
	sent := "2026-10-30T19:00:00Z"
	got := client.EvaluateZones(
		[]Zone{zone},
		&sent,
		geoapplicability.Point{Longitude: "1", Latitude: "1"},
	)
	if got.Result != "unknown" || got.Zones[0].Reason != "http_301" {
		t.Fatalf("redirect did not fail closed: %#v", got)
	}
}

func TestZonePreparationHardBoundsCountySizedTopologyWork(t *testing.T) {
	t.Parallel()
	zone := Zone{
		URL: "https://api.weather.gov/zones/county/HIC001",
		ID:  "HIC001", Type: "county",
	}
	const steps = 2000
	body := zoneFixture(
		zone,
		`{"type":"Polygon","coordinates":[[`+rectangleRingJSON(steps, 0)+`]]}`,
	)
	if _, err := prepareZoneResponse(zone, []byte(body)); !errors.Is(err, geoapplicability.ErrTooComplex) {
		t.Fatalf("county-sized topology error = %v, want ErrTooComplex", err)
	}
}

func TestZonePreparationSharesTopologyBudgetAcrossGeometryCollection(t *testing.T) {
	t.Parallel()
	const steps = 625
	raw := json.RawMessage(
		`{"type":"GeometryCollection","geometries":[` +
			`{"type":"Polygon","coordinates":[[` + rectangleRingJSON(steps, 0) + `]]},` +
			`{"type":"Polygon","coordinates":[[` + rectangleRingJSON(steps, 2) + `]]}` +
			`]}`,
	)
	if _, _, err := prepareZoneGeometry(raw); !errors.Is(err, geoapplicability.ErrTooComplex) {
		t.Fatalf("collection topology error = %v, want shared-budget ErrTooComplex", err)
	}
}

func TestZoneClientConditionallyBacksOffUnchangedTooComplexGeometry(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 30, 20, 0, 0, 0, time.UTC)
	zone := Zone{
		URL: "https://api.weather.gov/zones/county/HIC001",
		ID:  "HIC001", Type: "county",
	}
	requests := 0
	client := testZoneClient(func() time.Time { return now }, func(request *http.Request) (*http.Response, error) {
		requests++
		switch requests {
		case 1:
			return zoneResponse(
				http.StatusOK,
				zoneFixture(
					zone,
					`{"type":"Polygon","coordinates":[[`+rectangleRingJSON(2000, 0)+`]]}`,
				),
				map[string]string{
					"Content-Type":  "application/geo+json",
					"Cache-Control": "max-age=60",
					"ETag":          `"complex-v1"`,
				},
			), nil
		case 2:
			if request.Header.Get("If-None-Match") != `"complex-v1"` {
				t.Fatalf("too-complex validator omitted: %q", request.Header.Get("If-None-Match"))
			}
			return nil, errors.New("temporary network failure")
		case 3:
			if request.Header.Get("If-None-Match") != `"complex-v1"` {
				t.Fatalf("validator lost after failure: %q", request.Header.Get("If-None-Match"))
			}
			return zoneResponse(http.StatusNotModified, "", map[string]string{
				"Cache-Control": "max-age=60",
			}), nil
		case 4:
			if request.Header.Get("If-None-Match") != `"complex-v1"` {
				t.Fatalf("changed-revision validator omitted: %q", request.Header.Get("If-None-Match"))
			}
			return zoneResponse(
				http.StatusOK,
				zoneFixture(zone, `{"type":"Polygon","coordinates":[[[0,0],[2,0],[2,2],[0,2],[0,0]]]}`),
				map[string]string{
					"Content-Type":  "application/geo+json",
					"Cache-Control": "max-age=60",
					"ETag":          `"complex-v2"`,
				},
			), nil
		default:
			return nil, errors.New("unexpected request")
		}
	})
	client.refresh(context.Background(), zone)
	first := client.entry(zone.URL)
	if first.reason != "too_complex" || first.etag != `"complex-v1"` ||
		len(first.prepared) != 0 {
		t.Fatalf("too-complex response did not retain only validators: %#v", first)
	}
	now = now.Add(2 * time.Minute)
	client.refresh(context.Background(), zone)
	failed := client.entry(zone.URL)
	if failed.reason != "request_failed" || !failed.tooComplex ||
		failed.etag != `"complex-v1"` || len(failed.prepared) != 0 {
		t.Fatalf("transient failure discarded deterministic validators: %#v", failed)
	}
	now = now.Add(16 * time.Minute)
	client.refresh(context.Background(), zone)
	unchanged := client.entry(zone.URL)
	if unchanged.reason != "too_complex" || unchanged.state != "unavailable" ||
		len(unchanged.prepared) != 0 || requests != 3 {
		t.Fatalf("304 changed too-complex evidence or repeated validation: %#v requests=%d", unchanged, requests)
	}
	now = now.Add(2 * time.Minute)
	client.refresh(context.Background(), zone)
	changed := client.entry(zone.URL)
	if changed.state != "fresh" || changed.reason != "" ||
		len(changed.prepared) != 1 || changed.etag != `"complex-v2"` ||
		requests != 4 {
		t.Fatalf("changed revision was not retried and accepted: %#v", changed)
	}
}
