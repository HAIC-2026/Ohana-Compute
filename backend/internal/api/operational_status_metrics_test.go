package api

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/operationalstatus"
	"github.com/prometheus/client_golang/prometheus"
)

type operationalStatusReaderStub struct {
	snapshot operationalstatus.Snapshot
	err      error
}

func (stub operationalStatusReaderStub) Snapshot(
	context.Context,
	float64,
	float64,
) (operationalstatus.Snapshot, error) {
	return stub.snapshot, stub.err
}

func TestOperationalStatusEndpointReturnsBoundedSnapshotAndMetrics(t *testing.T) {
	t.Parallel()
	registry := prometheus.NewRegistry()
	snapshot := operationalstatus.Snapshot{
		SchemaVersion: operationalstatus.SchemaVersion,
		GeneratedAt:   time.Date(2026, 10, 27, 8, 0, 0, 0, time.UTC),
		Status:        "partial",
		Domains: []operationalstatus.DomainStatus{
			{Domain: "evacuation_order", Status: "unavailable"},
			{Domain: "road_transport", Status: "unavailable"},
			{
				Domain: "shelter", Status: "reported_live",
				Shelters: []operationalstatus.ShelterFact{{
					ID: "private-product-id", Name: "Facility name must not be a label",
				}},
			},
			{Domain: "transit_paratransit", Status: "unavailable"},
			{Domain: "utility_outage", Status: "unavailable"},
			{Domain: "wildfire", Status: "unavailable"},
		},
	}
	server := NewServer(Config{
		Alerts: alertReaderStub{}, Cyclones: cycloneReaderStub{},
		TsunamiProducts: tsunamiProductReaderStub{}, Official: &officialReaderStub{},
		Community: &communityReaderStub{}, Transportation: &transportationReaderStub{},
		OperationalStatus: operationalStatusReaderStub{snapshot: snapshot},
		Registry:          registry,
	})

	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		response,
		httptest.NewRequest(
			http.MethodGet,
			"/api/v1/planning/live-status?lat=21.3&lon=-157.8",
			nil,
		),
	)
	if response.Code != http.StatusOK ||
		!strings.Contains(response.Body.String(), "reported_live") {
		t.Fatalf("unexpected response %d: %s", response.Code, response.Body.String())
	}

	metrics := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		metrics,
		httptest.NewRequest(http.MethodGet, "/metrics", nil),
	)
	body := metrics.Body.String()
	if !strings.Contains(
		body,
		`hawaii_resilience_operational_status_domains_total{domain="shelter",status="reported_live"} 1`,
	) {
		t.Fatalf("missing bounded shelter metric: %s", body)
	}
	for _, private := range []string{
		"private-product-id",
		"Facility name must not be a label",
		"21.3",
		"-157.8",
	} {
		if strings.Contains(body, private) {
			t.Fatalf("metrics exposed private or unbounded value %q", private)
		}
	}
}

func TestOperationalStatusEndpointFailsClosed(t *testing.T) {
	t.Parallel()
	server := NewServer(Config{
		Alerts: alertReaderStub{}, Cyclones: cycloneReaderStub{},
		TsunamiProducts: tsunamiProductReaderStub{}, Official: &officialReaderStub{},
		Community: &communityReaderStub{}, Transportation: &transportationReaderStub{},
		OperationalStatus: operationalStatusReaderStub{
			err: errors.New("upstream details"),
		},
	})
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		response,
		httptest.NewRequest(
			http.MethodGet,
			"/api/v1/planning/live-status?lat=21.3&lon=-157.8",
			nil,
		),
	)
	if response.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d: %s", response.Code, response.Body.String())
	}
	if strings.Contains(response.Body.String(), "upstream details") {
		t.Fatalf("response leaked internal error: %s", response.Body.String())
	}
}

func TestOperationalStatusEndpointRejectsInvalidCoordinates(t *testing.T) {
	t.Parallel()
	server := NewServer(Config{
		Alerts: alertReaderStub{}, Cyclones: cycloneReaderStub{},
		TsunamiProducts: tsunamiProductReaderStub{}, Official: &officialReaderStub{},
		Community: &communityReaderStub{}, Transportation: &transportationReaderStub{},
		OperationalStatus: operationalStatusReaderStub{},
	})
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		response,
		httptest.NewRequest(
			http.MethodGet,
			"/api/v1/planning/live-status?lat=private&lon=-157.8",
			nil,
		),
	)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", response.Code, response.Body.String())
	}
}
