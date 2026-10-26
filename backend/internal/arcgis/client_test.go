package arcgis

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
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
