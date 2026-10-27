package nws

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestActiveAlertsNormalizesAndCaches(t *testing.T) {
	t.Parallel()

	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requests.Add(1)
		if request.Header.Get("User-Agent") == "" {
			t.Error("expected User-Agent header")
		}
		writer.Header().Set("Content-Type", "application/geo+json")
		writer.Header().Set("ETag", `"alerts-v1"`)
		_, _ = writer.Write([]byte(`{
			"updated":"2026-10-26T16:00:00+00:00",
			"features":[{
				"id":"feature-id",
				"geometry":null,
				"properties":{
					"id":"alert-id",
					"areaDesc":"East Honolulu",
					"affectedZones":["zone-1"],
					"effective":"2026-10-26T15:00:00-10:00",
					"onset":"2026-10-26T16:00:00-10:00",
					"expires":"2026-10-26T18:00:00-10:00",
					"severity":"Severe",
					"certainty":"Likely",
					"urgency":"Immediate",
					"response":"Evacuate",
					"event":"Flash Flood Warning",
					"headline":"Flash Flood Warning issued for East Honolulu",
					"description":"Heavy rain is occurring.",
					"instruction":"Avoid flooded roads."
				}
			}]
		}`))
	}))
	defer server.Close()

	now := time.Date(2026, 10, 26, 17, 0, 0, 0, time.UTC)
	client := NewClient(Config{
		AlertsURL: server.URL,
		CacheTTL:  5 * time.Minute,
		Now:       func() time.Time { return now },
	})

	first, err := client.ActiveAlerts(context.Background())
	if err != nil {
		t.Fatalf("first request failed: %v", err)
	}
	second, err := client.ActiveAlerts(context.Background())
	if err != nil {
		t.Fatalf("cached request failed: %v", err)
	}

	if requests.Load() != 1 {
		t.Fatalf("expected one upstream request, got %d", requests.Load())
	}
	if len(first.Alerts) != 1 || first.Alerts[0].Hazard != "flood" {
		t.Fatalf("unexpected normalized alerts: %#v", first.Alerts)
	}
	if first.Alerts[0].ResponseType != "Evacuate" {
		t.Fatalf("expected CAP response type, got %#v", first.Alerts[0])
	}
	if first.Source.Status != "fresh" || second.Source.Status != "fresh" {
		t.Fatalf("expected fresh source statuses: %#v %#v", first.Source, second.Source)
	}
}

func TestActiveAlertsReturnsExplicitStaleSnapshot(t *testing.T) {
	t.Parallel()

	var fail atomic.Bool
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if fail.Load() {
			http.Error(writer, "unavailable", http.StatusServiceUnavailable)
			return
		}
		writer.Header().Set("Content-Type", "application/geo+json")
		_, _ = writer.Write([]byte(`{"updated":"2026-10-26T16:00:00Z","features":[]}`))
	}))
	defer server.Close()

	now := time.Date(2026, 10, 26, 17, 0, 0, 0, time.UTC)
	client := NewClient(Config{
		AlertsURL: server.URL,
		CacheTTL:  time.Minute,
		Now:       func() time.Time { return now },
	})

	if _, err := client.ActiveAlerts(context.Background()); err != nil {
		t.Fatalf("prime cache: %v", err)
	}
	now = now.Add(2 * time.Minute)
	fail.Store(true)

	snapshot, err := client.ActiveAlerts(context.Background())
	if err != nil {
		t.Fatalf("expected stale fallback, got error: %v", err)
	}
	if snapshot.Source.Status != "stale" {
		t.Fatalf("expected stale status, got %q", snapshot.Source.Status)
	}
	if snapshot.Source.RefreshAttemptedAt == nil ||
		!snapshot.Source.RefreshAttemptedAt.Equal(now) {
		t.Fatalf("expected refresh attempt timestamp, got %#v", snapshot.Source)
	}
	if len(snapshot.Warnings) != 1 || !strings.Contains(snapshot.Warnings[0], "refresh failed") {
		t.Fatalf("expected explicit warning, got %#v", snapshot.Warnings)
	}
}

func TestActiveAlertsFailsWithoutCache(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		http.Error(writer, "unavailable", http.StatusServiceUnavailable)
	}))
	defer server.Close()

	client := NewClient(Config{AlertsURL: server.URL})
	if _, err := client.ActiveAlerts(context.Background()); err == nil {
		t.Fatal("expected an upstream error when no cache exists")
	}
}
