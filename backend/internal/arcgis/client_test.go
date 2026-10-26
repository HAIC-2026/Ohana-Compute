package arcgis

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestQueryCachesGeoJSON(t *testing.T) {
	t.Parallel()

	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requests.Add(1)
		if request.URL.Query().Get("f") != "geojson" {
			t.Error("expected GeoJSON request")
		}

		writer.Header().Set("Content-Type", "application/geo+json")
		_, _ = writer.Write([]byte(`{
			"type":"FeatureCollection",
			"features":[{
				"type":"Feature",
				"geometry":{"type":"Point","coordinates":[-157.68,21.29]},
				"properties":{"risk_rating":"Medium"}
			}]
		}`))
	}))
	defer server.Close()

	now := time.Date(2026, 10, 26, 18, 0, 0, 0, time.UTC)
	client := NewClient(Config{Now: func() time.Time { return now }})
	query := Request{
		SourceID:  "fire-risk",
		Authority: "Hawaiʻi DLNR",
		URL:       server.URL,
		Params:    url.Values{"geometry": {"-157.68,21.29"}},
		CacheTTL:  time.Hour,
	}

	first, err := client.Query(context.Background(), query)
	if err != nil {
		t.Fatalf("query failed: %v", err)
	}
	second, err := client.Query(context.Background(), query)
	if err != nil {
		t.Fatalf("cached query failed: %v", err)
	}

	if requests.Load() != 1 {
		t.Fatalf("expected one request, got %d", requests.Load())
	}
	if len(first.Collection.Features) != 1 || second.Source.Status != "fresh" {
		t.Fatalf("unexpected results: %#v %#v", first, second)
	}
}

func TestQueryCoalescesConcurrentCacheMisses(t *testing.T) {
	t.Parallel()

	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requests.Add(1)
		time.Sleep(25 * time.Millisecond)
		_, _ = writer.Write([]byte(`{"type":"FeatureCollection","features":[]}`))
	}))
	defer server.Close()

	client := NewClient(Config{})
	query := Request{
		SourceID:  "shared-source",
		Authority: "Test",
		URL:       server.URL,
		CacheTTL:  time.Hour,
	}

	var waitGroup sync.WaitGroup
	errors := make(chan error, 50)
	for range 50 {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			_, err := client.Query(context.Background(), query)
			errors <- err
		}()
	}
	waitGroup.Wait()
	close(errors)

	for err := range errors {
		if err != nil {
			t.Fatalf("concurrent query failed: %v", err)
		}
	}
	if requests.Load() != 1 {
		t.Fatalf("expected one coalesced upstream request, got %d", requests.Load())
	}
}

func TestQueryBoundsCacheEntries(t *testing.T) {
	t.Parallel()

	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requests.Add(1)
		_, _ = writer.Write([]byte(`{"type":"FeatureCollection","features":[]}`))
	}))
	defer server.Close()

	now := time.Date(2026, 10, 26, 18, 0, 0, 0, time.UTC)
	client := NewClient(Config{
		MaxCacheEntries: 2,
		Now:             func() time.Time { return now },
	})
	query := Request{
		SourceID:  "bounded-source",
		Authority: "Test",
		URL:       server.URL,
		CacheTTL:  time.Hour,
	}

	for _, geometry := range []string{"a", "b", "c"} {
		query.Params = url.Values{"geometry": {geometry}}
		if _, err := client.Query(context.Background(), query); err != nil {
			t.Fatalf("query %q failed: %v", geometry, err)
		}
		now = now.Add(time.Second)
	}
	if len(client.cache) != 2 {
		t.Fatalf("expected bounded cache size 2, got %d", len(client.cache))
	}

	query.Params = url.Values{"geometry": {"a"}}
	if _, err := client.Query(context.Background(), query); err != nil {
		t.Fatalf("reloading evicted entry failed: %v", err)
	}
	if requests.Load() != 4 {
		t.Fatalf("expected evicted entry to reload, got %d upstream requests", requests.Load())
	}
}

func TestQueryReturnsExplicitStaleResult(t *testing.T) {
	t.Parallel()

	var fail atomic.Bool
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if fail.Load() {
			http.Error(writer, "unavailable", http.StatusServiceUnavailable)
			return
		}
		_, _ = writer.Write([]byte(`{"type":"FeatureCollection","features":[]}`))
	}))
	defer server.Close()

	now := time.Date(2026, 10, 26, 18, 0, 0, 0, time.UTC)
	client := NewClient(Config{Now: func() time.Time { return now }})
	query := Request{
		SourceID:  "test-source",
		Authority: "Test",
		URL:       server.URL,
		CacheTTL:  time.Minute,
	}
	if _, err := client.Query(context.Background(), query); err != nil {
		t.Fatalf("prime cache: %v", err)
	}
	now = now.Add(2 * time.Minute)
	fail.Store(true)

	result, err := client.Query(context.Background(), query)
	if err != nil {
		t.Fatalf("expected stale result, got %v", err)
	}
	if result.Source.Status != "stale" || len(result.Warnings) != 1 {
		t.Fatalf("expected explicit stale warning, got %#v", result)
	}
	if result.Source.RefreshAttemptedAt == nil ||
		!result.Source.RefreshAttemptedAt.Equal(now) {
		t.Fatalf("expected refresh attempt timestamp, got %#v", result.Source)
	}
}

func TestQueryRejectsArcGISErrorEnvelope(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		_, _ = writer.Write([]byte(`{"error":{"code":400,"message":"Invalid query","details":[]}}`))
	}))
	defer server.Close()

	client := NewClient(Config{})
	_, err := client.Query(context.Background(), Request{
		SourceID:  "broken-source",
		Authority: "Test",
		URL:       server.URL,
		CacheTTL:  time.Minute,
	})
	if err == nil || !strings.Contains(err.Error(), "ArcGIS error 400") {
		t.Fatalf("expected ArcGIS error, got %v", err)
	}
}

func TestQueryNormalizesEsriJSONAttributes(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		_, _ = writer.Write([]byte(`{
				"features":[{
					"attributes":{"FIPS":"15003000120","RPL_THEMES":0.1185}
				}]
			}`))
	}))
	defer server.Close()

	client := NewClient(Config{})
	result, err := client.Query(context.Background(), Request{
		SourceID:  "cdc-svi",
		Authority: "CDC",
		URL:       server.URL,
		Params:    url.Values{"f": {"json"}},
		CacheTTL:  time.Hour,
	})
	if err != nil {
		t.Fatalf("query failed: %v", err)
	}
	if result.Collection.Features[0].Properties["FIPS"] != "15003000120" {
		t.Fatalf("attributes were not normalized: %#v", result.Collection.Features[0])
	}
}
