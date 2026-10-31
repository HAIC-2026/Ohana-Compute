package main

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/api"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/community"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/eventtriggers"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/operationalstatus"
)

type lifecycleEventFixture struct{}

func (lifecycleEventFixture) Snapshot(context.Context) (eventtriggers.Snapshot, error) {
	return eventtriggers.Snapshot{
		SchemaVersion: eventtriggers.SchemaVersion, Status: "complete",
		Triggers: []eventtriggers.Trigger{},
	}, nil
}

func lifecycleFixtureConfig() api.Config {
	fixtures := fixtureSources{}
	return api.Config{
		Alerts: fixtures, Cyclones: fixtures, TsunamiProducts: fixtures,
		Official: fixtures, Transportation: fixtures,
		Community:         community.NewClient(fixtureArcGIS{}, fixtureCensus{}),
		EventTriggers:     lifecycleEventFixture{},
		OperationalStatus: operationalstatus.NewService(operationalstatus.Config{Shelters: fixtures}),
		Logger:            slog.New(slog.NewTextHandler(io.Discard, nil)),
	}
}

type lifecycleFixtureResponse struct {
	SchemaVersion  string    `json:"schema_version"`
	GeneratedAt    time.Time `json:"generated_at"`
	ShelterContext struct {
		State       string `json:"state"`
		Coverage    string `json:"coverage"`
		RetrievedAt string `json:"retrieved_at"`
		Items       []struct {
			ItemID string `json:"item_id"`
			Name   string `json:"name"`
			Facts  struct {
				Status   string `json:"reported_status"`
				Capacity int    `json:"reported_capacity"`
			} `json:"facts"`
			SourceUpdatedAt *string `json:"source_updated_at"`
			SourceExpiresAt *string `json:"source_expires_at"`
			Digest          string  `json:"content_digest"`
		} `json:"items"`
	} `json:"shelter_context"`
}

func requestLifecycleFixture(t *testing.T, handler http.Handler, mode string) lifecycleFixtureResponse {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, "/api/v1/lifecycle/evidence?lat=21.3&lon=-157.8", nil)
	request.Header.Set(lifecycleFixtureHeader, mode)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("fixture %s: %d %s", mode, recorder.Code, recorder.Body.String())
	}
	var response lifecycleFixtureResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.SchemaVersion != "lifecycle-evidence.v1" {
		t.Fatalf("fixture bypassed real evidence endpoint: %s", recorder.Body.String())
	}
	return response
}

func TestLifecycleFixtureSelectionIsRequestLocal(t *testing.T) {
	t.Parallel()
	handler := lifecycleFixtureHandler(lifecycleFixtureConfig(), time.Now)
	baseline := requestLifecycleFixture(t, handler, "baseline").ShelterContext.Items[0]
	if baseline.ItemID != "fixture-live-shelter" || baseline.Name != "Fixture reported open shelter" ||
		baseline.Facts.Status != "OPEN" || baseline.Facts.Capacity != 85 {
		t.Fatalf("baseline facts changed: %+v", baseline)
	}
	for _, test := range []struct {
		mode, state, coverage string
		count                 int
	}{
		{"baseline", "fresh", "complete", 1},
		{"changed", "fresh", "complete", 1},
		{"empty", "fresh", "complete", 0},
		{"unavailable", "unavailable", "unavailable", 1},
		{"partial", "fresh", "partial", 1},
		{"stale", "stale", "complete", 1},
	} {
		t.Run(test.mode, func(t *testing.T) {
			t.Parallel()
			for range 3 {
				projection := requestLifecycleFixture(t, handler, test.mode).ShelterContext
				if projection.State != test.state || projection.Coverage != test.coverage ||
					len(projection.Items) != test.count {
					t.Fatalf("incorrect %s projection: %+v", test.mode, projection)
				}
				if test.count == 0 {
					continue
				}
				item := projection.Items[0]
				if item.SourceUpdatedAt != nil || item.SourceExpiresAt != nil {
					t.Fatal("fixture invented source observation timestamps")
				}
				if test.mode == "changed" {
					if item.ItemID != baseline.ItemID || item.Name != "Fixture revised shelter report" ||
						item.Facts.Status != "CLOSED" || item.Facts.Capacity != 65 ||
						item.Digest == baseline.Digest {
						t.Fatalf("semantic change did not change claim: %+v", item)
					}
				} else if item.Digest != baseline.Digest {
					t.Fatalf("%s changed semantic claim digest", test.mode)
				}
			}
		})
	}
}

func TestLifecycleFixtureRetrievalChurnAndScope(t *testing.T) {
	t.Parallel()
	now := time.Now().UTC()
	handler := lifecycleFixtureHandler(lifecycleFixtureConfig(), func() time.Time { return now })
	first := requestLifecycleFixture(t, handler, "baseline")
	if !first.GeneratedAt.Equal(now) {
		t.Fatalf("fixture snapshot used inconsistent clock: got %s want %s", first.GeneratedAt, now)
	}
	now = now.Add(time.Minute)
	second := requestLifecycleFixture(t, handler, "baseline")
	if !second.GeneratedAt.Equal(now) {
		t.Fatalf("fixture snapshot did not advance configured clock: got %s want %s", second.GeneratedAt, now)
	}
	if first.ShelterContext.RetrievedAt == second.ShelterContext.RetrievedAt ||
		first.ShelterContext.Items[0].Digest != second.ShelterContext.Items[0].Digest {
		t.Fatal("retrieval churn altered source facts or digest")
	}
	unknown := requestLifecycleFixture(t, handler, "not-a-fixture")
	if len(unknown.ShelterContext.Items) != 1 {
		t.Fatal("unknown header failed to use default readers")
	}
	request := httptest.NewRequest(http.MethodGet, "/api/v1/planning/live-status?lat=21.3&lon=-157.8", nil)
	request.Header.Set(lifecycleFixtureHeader, "empty")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), "fixture-live-shelter") {
		t.Fatalf("lifecycle selector affected another route: %d %s", recorder.Code, recorder.Body.String())
	}
	productionHandler := api.NewServer(lifecycleFixtureConfig()).Handler()
	production := requestLifecycleFixture(t, productionHandler, "empty")
	if len(production.ShelterContext.Items) != 1 {
		t.Fatal("production API must ignore the test-only selector")
	}
}
