package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/eventtriggers"
)

type eventTriggerReaderStub struct {
	snapshot eventtriggers.Snapshot
	err      error
}

func (stub eventTriggerReaderStub) Snapshot(context.Context) (eventtriggers.Snapshot, error) {
	return stub.snapshot, stub.err
}

func TestEventTriggerEndpointReturnsSnapshot(t *testing.T) {
	t.Parallel()
	server := NewServer(Config{
		Alerts: alertReaderStub{}, Cyclones: cycloneReaderStub{},
		TsunamiProducts: tsunamiProductReaderStub{}, Official: &officialReaderStub{},
		Community: &communityReaderStub{}, Transportation: &transportationReaderStub{},
		EventTriggers: eventTriggerReaderStub{snapshot: eventtriggers.Snapshot{
			SchemaVersion: eventtriggers.SchemaVersion, Status: "partial",
			CountyOrderNotice: eventtriggers.CountyUnavailable,
		}},
	})
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		response,
		httptest.NewRequest(http.MethodGet, "/api/v1/planning/event-triggers", nil),
	)
	if response.Code != http.StatusOK ||
		!strings.Contains(response.Body.String(), eventtriggers.CountyUnavailable) {
		t.Fatalf("unexpected response %d: %s", response.Code, response.Body.String())
	}
}

func TestEventTriggerEndpointReturns502WhenAllSourcesFail(t *testing.T) {
	t.Parallel()
	server := NewServer(Config{
		Alerts: alertReaderStub{}, Cyclones: cycloneReaderStub{},
		TsunamiProducts: tsunamiProductReaderStub{}, Official: &officialReaderStub{},
		Community: &communityReaderStub{}, Transportation: &transportationReaderStub{},
		EventTriggers: eventTriggerReaderStub{err: eventtriggers.ErrNoOperationalSources},
	})
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		response,
		httptest.NewRequest(http.MethodGet, "/api/v1/planning/event-triggers", nil),
	)
	if response.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d: %s", response.Code, response.Body.String())
	}
}
