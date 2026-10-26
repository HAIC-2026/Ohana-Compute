package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/nws"
)

type alertReaderStub struct {
	snapshot nws.Snapshot
	err      error
}

func (stub alertReaderStub) ActiveAlerts(context.Context) (nws.Snapshot, error) {
	return stub.snapshot, stub.err
}

func TestEventsEndpointReturnsProvenance(t *testing.T) {
	t.Parallel()

	server := NewServer(Config{
		Alerts: alertReaderStub{snapshot: nws.Snapshot{
			Alerts: []nws.Alert{{ID: "one", Hazard: "flood", Event: "Flood Warning"}},
			Source: nws.SourceStatus{
				ID:          "nws-hi-alerts",
				Authority:   "NOAA National Weather Service",
				Status:      "fresh",
				RetrievedAt: time.Date(2026, 10, 26, 17, 0, 0, 0, time.UTC),
			},
		}},
		AllowedOrigins: []string{"http://127.0.0.1:3000"},
	})

	request := httptest.NewRequest(http.MethodGet, "/api/v1/events", nil)
	request.Header.Set("Origin", "http://127.0.0.1:3000")
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	if response.Header().Get("Access-Control-Allow-Origin") != "http://127.0.0.1:3000" {
		t.Fatal("expected allowed CORS origin")
	}

	var snapshot nws.Snapshot
	if err := json.NewDecoder(response.Body).Decode(&snapshot); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(snapshot.Alerts) != 1 || snapshot.Source.ID != "nws-hi-alerts" {
		t.Fatalf("unexpected response: %#v", snapshot)
	}
}

func TestEventsEndpointFailsClosed(t *testing.T) {
	t.Parallel()

	server := NewServer(Config{
		Alerts: alertReaderStub{err: errors.New("upstream unavailable")},
	})
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		response,
		httptest.NewRequest(http.MethodGet, "/api/v1/events", nil),
	)

	if response.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d: %s", response.Code, response.Body.String())
	}
}

func TestSourcesEndpointIncludesPhases(t *testing.T) {
	t.Parallel()

	server := NewServer(Config{Alerts: alertReaderStub{}})
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		response,
		httptest.NewRequest(http.MethodGet, "/api/v1/sources", nil),
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", response.Code)
	}
	var body struct {
		Sources []struct {
			ID          string `json:"id"`
			Phase       string `json:"phase"`
			Integration string `json:"integration"`
		} `json:"sources"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(body.Sources) < 10 {
		t.Fatalf("expected comprehensive source catalog, got %d", len(body.Sources))
	}
	if body.Sources[0].ID != "nws-hi-alerts" || body.Sources[0].Integration != "integrated" {
		t.Fatalf("unexpected first source: %#v", body.Sources[0])
	}
}
