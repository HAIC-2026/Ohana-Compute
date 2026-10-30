package main

import (
	"context"
	"net/http"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/api"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/eventtriggers"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/hans"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/official"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/operationalstatus"
)

const lifecycleFixtureHeader = "X-Lifecycle-Fixture"

type lifecycleShelterFixture struct {
	mode string
	now  func() time.Time
}

func (fixture lifecycleShelterFixture) OpenShelters(
	ctx context.Context,
	latitude, longitude float64,
) (official.OpenShelters, error) {
	result, err := (fixtureSources{}).OpenShelters(ctx, latitude, longitude)
	if err != nil {
		return result, err
	}
	now := fixture.now().UTC()
	result.Sources[0].RetrievedAt = now.Add(-time.Minute)
	result.Sources[0].FreshUntil = now.Add(4 * time.Minute)
	switch fixture.mode {
	case "changed":
		result.Shelters[0].Name = "Fixture revised shelter report"
		result.Shelters[0].Status = "CLOSED"
		result.Shelters[0].Capacity = intPointer(65)
	case "empty":
		result.Shelters = []official.Shelter{}
	case "partial":
		result.QueryPartial = true
	case "unavailable", "stale":
		result.Sources[0].Status = "stale"
		result.Sources[0].RetrievedAt = now.Add(-10 * time.Minute)
		result.Sources[0].FreshUntil = now.Add(-5 * time.Minute)
		if fixture.mode == "unavailable" {
			result.Sources[0].RefreshAttemptedAt = &now
		}
	}
	return result, nil
}

// Fixture selection exists only in this test executable. Every request runs
// the real API projection; selectors never mutate shared readers or counters.
func lifecycleFixtureHandler(config api.Config, now func() time.Time) http.Handler {
	defaultHandler := api.NewServer(config).Handler()
	handlers := make(map[string]http.Handler)
	weatherHandlers := make(map[string]http.Handler)
	for _, mode := range []string{"baseline", "changed", "empty", "unavailable", "partial", "stale"} {
		fixtureConfig := config
		fixtureConfig.Registry = nil
		fixtureConfig.OperationalStatus = operationalstatus.NewService(operationalstatus.Config{
			Shelters: lifecycleShelterFixture{mode: mode, now: now},
			Now:      now,
		})
		handlers[mode] = api.NewServer(fixtureConfig).Handler()
	}
	for _, mode := range []string{"current", "changed", "cancel", "update", "ack", "error", "test", "exercise", "draft", "system", "expired", "null-times", "missing", "invalid-geometry", "stale", "partial", "empty", "unavailable"} {
		fixtureConfig := config
		fixtureConfig.Registry = nil
		fixtureConfig.EventTriggers = eventtriggers.NewService(eventtriggers.Config{
			NWS: weatherFixture{mode: mode}, PTWC: weatherFixture{mode: mode},
			ComCat: fixtureSources{}, HANS: hans.NewClient(nil),
			Now: func() time.Time { return time.Date(2026, 10, 30, 18, 0, 0, 0, time.UTC) },
		})
		weatherHandlers[mode] = api.NewServer(fixtureConfig).Handler()
	}
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodGet && (request.URL.Path == "/api/v1/lifecycle/evidence" || request.URL.Path == "/api/v1/planning/event-triggers") {
			if handler, ok := weatherHandlers[request.Header.Get(weatherFixtureHeader)]; ok {
				writer.Header().Add("Vary", weatherFixtureHeader)
				handler.ServeHTTP(writer, request)
				return
			}
		}
		if request.Method == http.MethodGet && request.URL.Path == "/api/v1/lifecycle/evidence" {
			if handler, ok := handlers[request.Header.Get(lifecycleFixtureHeader)]; ok {
				writer.Header().Add("Vary", lifecycleFixtureHeader)
				handler.ServeHTTP(writer, request)
				return
			}
		}
		defaultHandler.ServeHTTP(writer, request)
	})
}
