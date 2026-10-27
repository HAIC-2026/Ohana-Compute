package usgs

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestRecentEventsNormalizesAndCaches(t *testing.T) {
	t.Parallel()

	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requests.Add(1)
		if request.URL.Query().Get("minlatitude") != "18" ||
			request.URL.Query().Get("maxlongitude") != "-154" {
			t.Fatalf("missing bounded Hawaiʻi query: %s", request.URL.RawQuery)
		}
		_, _ = writer.Write([]byte(`{
			"metadata":{"generated":1793059200000},
			"features":[{"id":"hv123","properties":{
				"title":"M 6.8 - Hawaii region",
				"url":"https://earthquake.usgs.gov/earthquakes/eventpage/hv123",
				"time":1793058000000,"updated":1793058600000,
				"mag":6.8,"type":"earthquake","tsunami":1,"status":"reviewed"
			}}]
		}`))
	}))
	defer server.Close()

	now := time.Date(2026, 10, 27, 8, 0, 0, 0, time.UTC)
	client := NewClient(Config{
		HTTPClient: server.Client(), ComCatURL: server.URL,
		Now: func() time.Time { return now },
	})
	first, err := client.RecentEvents(context.Background())
	if err != nil {
		t.Fatalf("RecentEvents returned error: %v", err)
	}
	second, err := client.RecentEvents(context.Background())
	if err != nil {
		t.Fatalf("cached RecentEvents returned error: %v", err)
	}
	if requests.Load() != 1 {
		t.Fatalf("expected one request, got %d", requests.Load())
	}
	if len(first.Events) != 1 || !first.Events[0].Tsunami || first.Events[0].Magnitude != 6.8 {
		t.Fatalf("unexpected normalized event: %#v", first.Events)
	}
	if second.Source.Status != "fresh" {
		t.Fatalf("expected fresh cached source: %#v", second.Source)
	}
}

func TestRecentEventsReturnsExplicitStaleSnapshot(t *testing.T) {
	t.Parallel()

	var fail atomic.Bool
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		if fail.Load() {
			http.Error(writer, "down", http.StatusServiceUnavailable)
			return
		}
		_, _ = writer.Write([]byte(`{"metadata":{"generated":1793059200000},"features":[]}`))
	}))
	defer server.Close()

	now := time.Date(2026, 10, 27, 8, 0, 0, 0, time.UTC)
	client := NewClient(Config{
		HTTPClient: server.Client(), ComCatURL: server.URL,
		CacheTTL: time.Minute, Now: func() time.Time { return now },
	})
	if _, err := client.RecentEvents(context.Background()); err != nil {
		t.Fatalf("prime cache: %v", err)
	}
	now = now.Add(2 * time.Minute)
	fail.Store(true)
	snapshot, err := client.RecentEvents(context.Background())
	if err != nil {
		t.Fatalf("expected stale fallback, got %v", err)
	}
	if snapshot.Source.Status != "stale" ||
		len(snapshot.Warnings) != 1 ||
		!strings.Contains(snapshot.Warnings[0], "refresh failed") {
		t.Fatalf("expected explicit stale snapshot: %#v", snapshot)
	}
}

func TestRecentEventsFailsWithoutCache(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		http.Error(writer, "down", http.StatusServiceUnavailable)
	}))
	defer server.Close()
	client := NewClient(Config{HTTPClient: server.Client(), ComCatURL: server.URL})
	if _, err := client.RecentEvents(context.Background()); err == nil {
		t.Fatal("expected failure without cache")
	}
}
