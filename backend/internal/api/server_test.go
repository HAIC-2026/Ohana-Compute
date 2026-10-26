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
	"github.com/chokevin/hawaii-resilience-map/backend/internal/official"
)

type alertReaderStub struct {
	snapshot nws.Snapshot
	err      error
}

type officialReaderStub struct {
	tsunami       official.TsunamiRisk
	flood         official.FloodRisk
	wildfire      official.WildfireRisk
	shelters      official.OpenShelters
	err           error
	lastLatitude  float64
	lastLongitude float64
}

func (stub *officialReaderStub) TsunamiRisk(
	_ context.Context,
	latitude float64,
	longitude float64,
) (official.TsunamiRisk, error) {
	stub.lastLatitude = latitude
	stub.lastLongitude = longitude
	return stub.tsunami, stub.err
}

func (stub *officialReaderStub) FloodRisk(
	_ context.Context,
	latitude float64,
	longitude float64,
) (official.FloodRisk, error) {
	stub.lastLatitude = latitude
	stub.lastLongitude = longitude
	return stub.flood, stub.err
}

func (stub *officialReaderStub) WildfireRisk(
	_ context.Context,
	latitude float64,
	longitude float64,
) (official.WildfireRisk, error) {
	stub.lastLatitude = latitude
	stub.lastLongitude = longitude
	return stub.wildfire, stub.err
}

func (stub *officialReaderStub) OpenShelters(
	_ context.Context,
	latitude float64,
	longitude float64,
) (official.OpenShelters, error) {
	stub.lastLatitude = latitude
	stub.lastLongitude = longitude
	return stub.shelters, stub.err
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
		Official:       &officialReaderStub{},
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
		Alerts:   alertReaderStub{err: errors.New("upstream unavailable")},
		Official: &officialReaderStub{},
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

	server := NewServer(Config{
		Alerts:   alertReaderStub{},
		Official: &officialReaderStub{},
	})
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

func TestRiskEndpointValidatesAndPassesCoordinates(t *testing.T) {
	t.Parallel()

	officialStub := &officialReaderStub{
		flood: official.FloodRisk{Classification: "undetermined"},
	}
	server := NewServer(Config{
		Alerts:   alertReaderStub{},
		Official: officialStub,
	})

	valid := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		valid,
		httptest.NewRequest(
			http.MethodGet,
			"/api/v1/risk/flood?lat=21.2966614&lon=-157.6886009",
			nil,
		),
	)
	if valid.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", valid.Code, valid.Body.String())
	}
	if officialStub.lastLatitude != 21.2966614 || officialStub.lastLongitude != -157.6886009 {
		t.Fatalf(
			"unexpected coordinates: %f,%f",
			officialStub.lastLatitude,
			officialStub.lastLongitude,
		)
	}

	invalid := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		invalid,
		httptest.NewRequest(
			http.MethodGet,
			"/api/v1/risk/flood?lat=not-a-number&lon=-157.6",
			nil,
		),
	)
	if invalid.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", invalid.Code, invalid.Body.String())
	}
}

func TestOfficialEndpointFailsClosed(t *testing.T) {
	t.Parallel()

	server := NewServer(Config{
		Alerts: alertReaderStub{},
		Official: &officialReaderStub{
			err: errors.New("ArcGIS unavailable"),
		},
	})
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		response,
		httptest.NewRequest(
			http.MethodGet,
			"/api/v1/risk/tsunami?lat=21.29&lon=-157.68",
			nil,
		),
	)
	if response.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d: %s", response.Code, response.Body.String())
	}
}
