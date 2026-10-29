package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/catalog"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/nws"
)

func TestSourceHealthUnknownExpiryFailureAndRecovery(t *testing.T) {
	health := newSourceHealth()
	now := time.Date(2026, 10, 28, 12, 0, 0, 0, time.UTC)
	health.now = func() time.Time { return now }
	read := func() map[string]sourceHealthRow {
		t.Helper()
		response := httptest.NewRecorder()
		health.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/", nil))
		if response.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("health must not be cached")
		}
		var snapshot struct {
			Sources []sourceHealthRow `json:"sources"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &snapshot); err != nil {
			t.Fatal(err)
		}
		if len(snapshot.Sources) != len(catalog.All()) {
			t.Fatal("every catalog source must be represented")
		}
		rows := make(map[string]sourceHealthRow)
		for _, row := range snapshot.Sources {
			rows[row.ID] = row
		}
		return rows
	}
	if read()["nws-hi-alerts"].Status != "not_observed" {
		t.Fatal("never queried must remain unknown")
	}
	if read()["usgs-hans"].Status != "not_integrated" {
		t.Fatal("disabled contracts must not look healthy")
	}
	at, until := now.Format(time.RFC3339), now.Add(time.Minute).Format(time.RFC3339)
	health.record("nws-hi-alerts", "fresh", at, until)
	if read()["nws-hi-alerts"].Status != "fresh" {
		t.Fatal("successful provenance must be visible")
	}
	now = now.Add(2 * time.Minute)
	if read()["nws-hi-alerts"].Status != "stale" {
		t.Fatal("freshness must expire without a new request")
	}
	health.record("nws-hi-alerts", "error", "", "")
	row := read()["nws-hi-alerts"]
	if row.Status != "error" || row.RetrievedAt.Format(time.RFC3339) != at {
		t.Fatal("failure must preserve last successful retrieval")
	}
	health.record("nws", "fresh", now.Format(time.RFC3339), now.Add(time.Minute).Format(time.RFC3339))
	if read()["nws-hi-alerts"].Status != "fresh" {
		t.Fatal("event-trigger aliases must recover the same source")
	}
	health.record("unbounded-source-name", "fresh", at, until)
	if len(health.states) != 1 {
		t.Fatal("unknown labels must not enter process state")
	}
	health.record("usgs_hans", "unavailable", now.Format(time.RFC3339), "")
	if !health.states["usgs-hans"].RetrievedAt.IsZero() {
		t.Fatal("unavailable product timestamps are not successful retrievals")
	}
}

func TestSourceHealthObservesPublicProvenanceOnly(t *testing.T) {
	health := newSourceHealth()
	now := time.Now().UTC()
	next := http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writeJSON(writer, http.StatusOK, map[string]any{
			"source": map[string]any{
				"id": "hhs-empower", "status": "fresh",
				"retrieved_at": now, "fresh_until": now.Add(time.Hour),
			},
			"resident": "DO-NOT-RETAIN",
		})
	})
	handler := health.observeRequests(next)
	for _, path := range []string{
		"/api/v1/identity/session",
		"/api/v1/collaboration/plans",
	} {
		handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, path, nil))
	}
	if len(health.states) != 0 {
		t.Fatal("private routes must never be observed")
	}
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/v1/community/profile?lat=20&lon=-155", nil))
	response := httptest.NewRecorder()
	health.ServeHTTP(response, nil)
	if !strings.Contains(response.Body.String(), now.Format("2006-01-02")) ||
		strings.Contains(response.Body.String(), "DO-NOT-RETAIN") ||
		strings.Contains(response.Body.String(), "?lat=") {
		t.Fatal("health must retain provenance only")
	}
}

func TestSourceHealthEndpointWiredToActualServer(t *testing.T) {
	now := time.Now().UTC()
	server := NewServer(Config{
		Alerts: alertReaderStub{snapshot: nws.Snapshot{Source: nws.SourceStatus{
			ID: "nws-hi-alerts", Status: "fresh", RetrievedAt: now, FreshUntil: now.Add(time.Minute),
		}}},
		Cyclones: cycloneReaderStub{}, TsunamiProducts: tsunamiProductReaderStub{},
		Official: &officialReaderStub{}, Community: &communityReaderStub{},
		Transportation: &transportationReaderStub{},
	})
	server.Handler().ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/v1/events", nil))
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/v1/sources/health", nil))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"status":"fresh"`) {
		t.Fatalf("expected observed provenance, got %s", response.Body.String())
	}
	failed := newSourceHealth()
	handler := failed.observeRequests(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writeAPIError(writer, http.StatusBadGateway, "source unavailable", "nws-hi-alerts")
	}))
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/v1/events", nil))
	if failed.states["nws-hi-alerts"].Status != "error" {
		t.Fatal("failed actual requests must be visible")
	}
}

func TestSourceHealthConcurrentObservations(t *testing.T) {
	health := newSourceHealth()
	now := time.Now().UTC()
	var group sync.WaitGroup
	for range 20 {
		group.Add(1)
		go func() {
			defer group.Done()
			health.record("ptwc", "fresh", now.Format(time.RFC3339), now.Add(time.Minute).Format(time.RFC3339))
			health.ServeHTTP(httptest.NewRecorder(), nil)
		}()
	}
	group.Wait()
}

func TestAggregateFailureObservationsSurviveAbsentResponseProvenance(t *testing.T) {
	health := newSourceHealth()
	handler := health.observeRequests(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		for _, source := range []string{"nws", "ptwc", "usgs_comcat"} {
			observeSourceFailure(writer, source, "error")
		}
		writeAPIError(writer, http.StatusBadGateway, "event-trigger sources unavailable", "event-triggers")
	}))
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/v1/planning/event-triggers", nil))
	for _, id := range []string{"nws-hi-alerts", "ptwc-cap", "usgs-comcat"} {
		if health.states[id].Status != "error" {
			t.Fatalf("source failure was lost: %s", id)
		}
	}
}
