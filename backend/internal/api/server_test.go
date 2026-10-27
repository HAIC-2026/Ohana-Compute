package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/arcgis"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/census"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/community"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/cphc"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/nws"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/official"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/ptwc"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/shelterplans"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/transportation"
)

type alertReaderStub struct {
	snapshot nws.Snapshot
	err      error
}

type cycloneReaderStub struct {
	snapshot cphc.Snapshot
	err      error
}

type tsunamiProductReaderStub struct {
	snapshot ptwc.Snapshot
	err      error
}

type transportationReaderStub struct {
	snapshot      transportation.Snapshot
	err           error
	lastLatitude  float64
	lastLongitude float64
}

type shelterPlanReaderStub struct {
	snapshot shelterplans.Snapshot
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

type communityReaderStub struct {
	acs     census.Profile
	svi     community.SVI
	empower community.EmPOWER
	risk    community.NationalRisk
	profile community.Profile
	err     error
	observe bool
}

func (stub *communityReaderStub) ACS(
	context.Context,
	float64,
	float64,
) (census.Profile, error) {
	return stub.acs, stub.err
}

func (stub *communityReaderStub) SVI(
	context.Context,
	float64,
	float64,
) (community.SVI, error) {
	return stub.svi, stub.err
}

func (stub *communityReaderStub) EmPOWER(
	context.Context,
	float64,
	float64,
) (community.EmPOWER, error) {
	return stub.empower, stub.err
}

func (stub *communityReaderStub) NationalRisk(
	context.Context,
	float64,
	float64,
) (community.NationalRisk, error) {
	return stub.risk, stub.err
}

func (stub *communityReaderStub) Profile(
	ctx context.Context,
	_ float64,
	_ float64,
) (community.Profile, error) {
	if stub.observe {
		for source, available := range map[string]bool{
			"acs-5-year":   stub.profile.ACS != nil,
			"cdc-svi-2022": stub.profile.SVI != nil,
			"hhs-empower":  stub.profile.EmPOWER != nil,
			"fema-nri":     stub.profile.NationalRisk != nil,
		} {
			outcome := "error"
			if available && stub.err == nil {
				outcome = "success"
			}
			community.ReportSourceObservation(ctx, community.SourceObservation{
				Source:   source,
				Outcome:  outcome,
				Duration: 25 * time.Millisecond,
			})
		}
	}
	return stub.profile, stub.err
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

func (stub cycloneReaderStub) ActiveCyclones(context.Context) (cphc.Snapshot, error) {
	return stub.snapshot, stub.err
}

func (stub tsunamiProductReaderStub) LatestProduct(context.Context) (ptwc.Snapshot, error) {
	return stub.snapshot, stub.err
}

func (stub *transportationReaderStub) PlannedClosures(
	_ context.Context,
	latitude float64,
	longitude float64,
) (transportation.Snapshot, error) {
	stub.lastLatitude = latitude
	stub.lastLongitude = longitude
	return stub.snapshot, stub.err
}

func (stub shelterPlanReaderStub) Snapshot(
	context.Context,
) (shelterplans.Snapshot, error) {
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
		Cyclones:        cycloneReaderStub{},
		TsunamiProducts: tsunamiProductReaderStub{},
		Official:        &officialReaderStub{},
		Community:       &communityReaderStub{},
		Transportation:  &transportationReaderStub{},
		AllowedOrigins:  []string{"http://127.0.0.1:3000"},
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
		Alerts:          alertReaderStub{err: errors.New("upstream unavailable")},
		Cyclones:        cycloneReaderStub{},
		TsunamiProducts: tsunamiProductReaderStub{},
		Official:        &officialReaderStub{},
		Community:       &communityReaderStub{},
		Transportation:  &transportationReaderStub{},
	})
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		response,
		httptest.NewRequest(http.MethodGet, "/api/v1/events", nil),
	)

	if response.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d: %s", response.Code, response.Body.String())
	}
	if strings.Contains(response.Body.String(), "ArcGIS unavailable") ||
		strings.Contains(response.Body.String(), "21.29") ||
		strings.Contains(response.Body.String(), "-157.68") {
		t.Fatalf("public error exposed upstream details: %s", response.Body.String())
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf(
			"expected errors to disable caching, got %q",
			response.Header().Get("Cache-Control"),
		)
	}
}

func TestLiveEventEndpointsReturnNormalizedFeeds(t *testing.T) {
	t.Parallel()

	server := NewServer(Config{
		Alerts: alertReaderStub{},
		Cyclones: cycloneReaderStub{snapshot: cphc.Snapshot{
			Source: cphc.SourceStatus{ID: "nhc-cphc-gis", Status: "fresh"},
		}},
		TsunamiProducts: tsunamiProductReaderStub{snapshot: ptwc.Snapshot{
			Source: ptwc.SourceStatus{ID: "ptwc-cap", Status: "fresh"},
		}},
		Official:       &officialReaderStub{},
		Community:      &communityReaderStub{},
		Transportation: &transportationReaderStub{},
	})

	for _, path := range []string{
		"/api/v1/events/hurricanes",
		"/api/v1/events/tsunami",
	} {
		response := httptest.NewRecorder()
		server.Handler().ServeHTTP(
			response,
			httptest.NewRequest(http.MethodGet, path, nil),
		)
		if response.Code != http.StatusOK {
			t.Fatalf("%s: expected 200, got %d: %s", path, response.Code, response.Body.String())
		}
	}
}

func TestLiveEventEndpointFailsClosed(t *testing.T) {
	t.Parallel()

	server := NewServer(Config{
		Alerts:          alertReaderStub{},
		Cyclones:        cycloneReaderStub{err: errors.New("CPHC unavailable")},
		TsunamiProducts: tsunamiProductReaderStub{},
		Official:        &officialReaderStub{},
		Community:       &communityReaderStub{},
		Transportation:  &transportationReaderStub{},
	})
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		response,
		httptest.NewRequest(http.MethodGet, "/api/v1/events/hurricanes", nil),
	)

	if response.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d: %s", response.Code, response.Body.String())
	}
}

func TestPlannedClosuresEndpointValidatesAndPassesCoordinates(t *testing.T) {
	t.Parallel()

	transportationStub := &transportationReaderStub{
		snapshot: transportation.Snapshot{
			Source: transportationSourceStatus(),
		},
	}
	server := NewServer(Config{
		Alerts:          alertReaderStub{},
		Cyclones:        cycloneReaderStub{},
		TsunamiProducts: tsunamiProductReaderStub{},
		Official:        &officialReaderStub{},
		Community:       &communityReaderStub{},
		Transportation:  transportationStub,
	})
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		response,
		httptest.NewRequest(
			http.MethodGet,
			"/api/v1/transportation/planned-closures?lat=21.3&lon=-157.8",
			nil,
		),
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	if transportationStub.lastLatitude != 21.3 || transportationStub.lastLongitude != -157.8 {
		t.Fatalf(
			"unexpected coordinates: %f,%f",
			transportationStub.lastLatitude,
			transportationStub.lastLongitude,
		)
	}
}

func transportationSourceStatus() arcgis.SourceStatus {
	return arcgis.SourceStatus{
		ID:        "hdot-planned-lane-closures",
		Authority: "Hawaiʻi Department of Transportation",
		Status:    "fresh",
	}
}

func TestSourcesEndpointIncludesPhases(t *testing.T) {
	t.Parallel()

	server := NewServer(Config{
		Alerts:          alertReaderStub{},
		Cyclones:        cycloneReaderStub{},
		TsunamiProducts: tsunamiProductReaderStub{},
		Official:        &officialReaderStub{},
		Community:       &communityReaderStub{},
		Transportation:  &transportationReaderStub{},
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

func TestShelterPlansEndpointReturnsCuratedProvenance(t *testing.T) {
	t.Parallel()

	retrievedAt := time.Date(2026, 10, 26, 0, 0, 0, 0, time.UTC)
	server := NewServer(Config{
		Alerts:          alertReaderStub{},
		Cyclones:        cycloneReaderStub{},
		TsunamiProducts: tsunamiProductReaderStub{},
		Official:        &officialReaderStub{},
		Community:       &communityReaderStub{},
		Transportation:  &transportationReaderStub{},
		ShelterPlans: shelterPlanReaderStub{snapshot: shelterplans.Snapshot{
			GeneratedAt: retrievedAt,
			Status:      "partial",
			Summary: shelterplans.Summary{
				JurisdictionsWithPublishedPlan: 1,
				PlanningJurisdictionsTotal:     4,
				PoliticalCountiesTotal:         5,
				OfficialFacilityRecords:        0,
				JurisdictionsRequiringReview:   4,
			},
			Jurisdictions: []shelterplans.JurisdictionPlan{
				{
					ID:               "honolulu",
					Name:             "City and County of Honolulu",
					Coverage:         "published",
					IngestionStatus:  "curated",
					ValidationStatus: "local_validation_required",
					PlanRecords: []shelterplans.PlanRecord{
						{
							ID:             "honolulu-handbook",
							Title:          "Emergency Shelter Handbook",
							Authority:      "Honolulu Department of Emergency Management",
							SourceURL:      "https://example.invalid/handbook.pdf",
							SourceStatus:   "published",
							RetrievedAt:    retrievedAt,
							FreshUntil:     retrievedAt.Add(90 * 24 * time.Hour),
							Freshness:      "fresh",
							OperationalUse: "planning_reference_only",
						},
					},
					FacilityRecords: []shelterplans.FacilityRecord{},
				},
			},
		}},
	})

	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		response,
		httptest.NewRequest(http.MethodGet, "/api/v1/shelter-plans", nil),
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var snapshot shelterplans.Snapshot
	if err := json.NewDecoder(response.Body).Decode(&snapshot); err != nil {
		t.Fatalf("decode shelter plan snapshot: %v", err)
	}
	if snapshot.Summary.OfficialFacilityRecords != 0 {
		t.Fatalf(
			"official facility records = %d, want 0",
			snapshot.Summary.OfficialFacilityRecords,
		)
	}
	if snapshot.Jurisdictions[0].PlanRecords[0].OperationalUse != "planning_reference_only" {
		t.Fatalf(
			"unexpected operational use: %+v",
			snapshot.Jurisdictions[0].PlanRecords[0],
		)
	}
}

func TestShelterPlansEndpointFailsClosed(t *testing.T) {
	t.Parallel()

	server := NewServer(Config{
		Alerts:          alertReaderStub{},
		Cyclones:        cycloneReaderStub{},
		TsunamiProducts: tsunamiProductReaderStub{},
		Official:        &officialReaderStub{},
		Community:       &communityReaderStub{},
		Transportation:  &transportationReaderStub{},
		ShelterPlans: shelterPlanReaderStub{
			err: errors.New("curated catalog unavailable"),
		},
	})
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		response,
		httptest.NewRequest(http.MethodGet, "/api/v1/shelter-plans", nil),
	)

	if response.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d: %s", response.Code, response.Body.String())
	}
	if strings.Contains(response.Body.String(), "curated catalog unavailable") {
		t.Fatalf("response leaked internal error: %s", response.Body.String())
	}
	if cacheControl := response.Header().Get("Cache-Control"); cacheControl != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", cacheControl)
	}
}

func TestRiskEndpointValidatesAndPassesCoordinates(t *testing.T) {
	t.Parallel()

	officialStub := &officialReaderStub{
		flood: official.FloodRisk{Classification: "undetermined"},
	}
	server := NewServer(Config{
		Alerts:          alertReaderStub{},
		Cyclones:        cycloneReaderStub{},
		TsunamiProducts: tsunamiProductReaderStub{},
		Official:        officialStub,
		Community:       &communityReaderStub{},
		Transportation:  &transportationReaderStub{},
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
		Alerts:          alertReaderStub{},
		Cyclones:        cycloneReaderStub{},
		TsunamiProducts: tsunamiProductReaderStub{},
		Official: &officialReaderStub{
			err: errors.New("ArcGIS unavailable"),
		},
		Community:      &communityReaderStub{},
		Transportation: &transportationReaderStub{},
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

func TestCommunityProfileEndpointReturnsPartialProfile(t *testing.T) {
	t.Parallel()

	server := NewServer(Config{
		Alerts:          alertReaderStub{},
		Cyclones:        cycloneReaderStub{},
		TsunamiProducts: tsunamiProductReaderStub{},
		Official:        &officialReaderStub{},
		Community: &communityReaderStub{
			profile: community.Profile{
				SVI:        &community.SVI{TractFIPS: "15003000120"},
				Disclaimer: "Aggregate planning data.",
			},
		},
		Transportation: &transportationReaderStub{},
	})
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		response,
		httptest.NewRequest(
			http.MethodGet,
			"/api/v1/community/profile?lat=21.29&lon=-157.68",
			nil,
		),
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var profile community.Profile
	if err := json.NewDecoder(response.Body).Decode(&profile); err != nil {
		t.Fatalf("decode profile: %v", err)
	}
	if profile.SVI == nil || profile.SVI.TractFIPS != "15003000120" {
		t.Fatalf("unexpected profile: %#v", profile)
	}
}

func TestBrowserTelemetryEndpointAggregatesBoundedMetrics(t *testing.T) {
	t.Parallel()

	server := NewServer(Config{
		Alerts:          alertReaderStub{},
		Cyclones:        cycloneReaderStub{},
		TsunamiProducts: tsunamiProductReaderStub{},
		Official:        &officialReaderStub{},
		Community:       &communityReaderStub{},
		Transportation:  &transportationReaderStub{},
	})
	body := `{
		"version": 1,
		"events": [
			{
				"kind": "interaction",
				"action": "hazard_select",
				"category": "button",
				"route": "home",
				"viewport": "large",
				"outcome": "success",
				"duration_ms": 12.5
			},
			{
				"kind": "interaction",
				"action": "field_packet_download",
				"category": "planning",
				"route": "home",
				"viewport": "large",
				"outcome": "success"
			},
			{
				"kind": "interaction",
				"action": "shelter_county_select",
				"category": "planning",
				"route": "home",
				"viewport": "large",
				"outcome": "success"
			}
		]
	}`
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/v1/telemetry/browser",
		strings.NewReader(body),
	)
	request.Header.Set("Content-Type", "text/plain;charset=UTF-8")
	request.RemoteAddr = "192.0.2.10:4321"
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d: %s", response.Code, response.Body.String())
	}

	metricsResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		metricsResponse,
		httptest.NewRequest(http.MethodGet, "/metrics", nil),
	)
	metricsBody := metricsResponse.Body.String()
	for _, metric := range []string{
		`hawaii_resilience_browser_events_total{action="hazard_select",category="button",kind="interaction",outcome="success",route="home",viewport="large"} 1`,
		`hawaii_resilience_browser_event_duration_seconds_count{action="hazard_select",category="button",kind="interaction",outcome="success",route="home",viewport="large"} 1`,
		`hawaii_resilience_browser_events_total{action="field_packet_download",category="planning",kind="interaction",outcome="success",route="home",viewport="large"} 1`,
		`hawaii_resilience_browser_events_total{action="shelter_county_select",category="planning",kind="interaction",outcome="success",route="home",viewport="large"} 1`,
		`hawaii_resilience_browser_telemetry_batches_total{outcome="accepted"} 1`,
	} {
		if !strings.Contains(metricsBody, metric) {
			t.Fatalf("metrics missing %q:\n%s", metric, metricsBody)
		}
	}
}

func TestBrowserTelemetryEndpointRejectsUnsafeOrOversizedPayloads(t *testing.T) {
	t.Parallel()

	newServer := func() *Server {
		return NewServer(Config{
			Alerts:          alertReaderStub{},
			Cyclones:        cycloneReaderStub{},
			TsunamiProducts: tsunamiProductReaderStub{},
			Official:        &officialReaderStub{},
			Community:       &communityReaderStub{},
			Transportation:  &transportationReaderStub{},
		})
	}
	tests := []struct {
		name        string
		contentType string
		body        []byte
		status      int
	}{
		{
			name:        "unknown action cannot become a metric label",
			contentType: "application/json",
			body: []byte(`{"version":1,"events":[{
				"kind":"interaction",
				"action":"typed address 123 Main Street",
				"category":"input",
				"route":"home",
				"viewport":"large",
				"outcome":"success"
			}]}`),
			status: http.StatusBadRequest,
		},
		{
			name:        "unknown fields fail closed",
			contentType: "application/json",
			body: []byte(`{"version":1,"events":[{
				"kind":"interaction",
				"action":"change",
				"category":"input",
				"route":"home",
				"viewport":"large",
				"outcome":"success",
				"input_value":"private"
			}]}`),
			status: http.StatusBadRequest,
		},
		{
			name:        "unsupported content type",
			contentType: "application/x-www-form-urlencoded",
			body:        []byte(`version=1`),
			status:      http.StatusUnsupportedMediaType,
		},
		{
			name:        "oversized body",
			contentType: "application/json",
			body: append(
				append(
					[]byte(`{"version":1,"events":[{"kind":"interaction","action":"`),
					bytes.Repeat([]byte("x"), maxTelemetryBodyBytes)...,
				),
				[]byte(`","category":"input","route":"home","viewport":"large","outcome":"success"}]}`)...,
			),
			status: http.StatusRequestEntityTooLarge,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			request := httptest.NewRequest(
				http.MethodPost,
				"/api/v1/telemetry/browser",
				bytes.NewReader(test.body),
			)
			request.Header.Set("Content-Type", test.contentType)
			request.RemoteAddr = "192.0.2.20:1234"
			response := httptest.NewRecorder()
			newServer().Handler().ServeHTTP(response, request)
			if response.Code != test.status {
				t.Fatalf(
					"expected %d, got %d: %s",
					test.status,
					response.Code,
					response.Body.String(),
				)
			}
		})
	}
}

func TestBrowserTelemetryEndpointRateLimitsByRemoteAddress(t *testing.T) {
	t.Parallel()

	server := NewServer(Config{
		Alerts:          alertReaderStub{},
		Cyclones:        cycloneReaderStub{},
		TsunamiProducts: tsunamiProductReaderStub{},
		Official:        &officialReaderStub{},
		Community:       &communityReaderStub{},
		Transportation:  &transportationReaderStub{},
		TelemetryRate:   1,
	})
	body := `{"version":1,"events":[{
		"kind":"page_load",
		"action":"hydration",
		"category":"page",
		"route":"home",
		"viewport":"small",
		"outcome":"success"
	}]}`
	for attempt, wantStatus := range []int{
		http.StatusAccepted,
		http.StatusTooManyRequests,
	} {
		request := httptest.NewRequest(
			http.MethodPost,
			"/api/v1/telemetry/browser",
			strings.NewReader(body),
		)
		request.Header.Set("Content-Type", "application/json")
		request.RemoteAddr = "192.0.2.30:9876"
		response := httptest.NewRecorder()
		server.Handler().ServeHTTP(response, request)
		if response.Code != wantStatus {
			t.Fatalf(
				"attempt %d: expected %d, got %d: %s",
				attempt+1,
				wantStatus,
				response.Code,
				response.Body.String(),
			)
		}
	}
}

func TestHTTPMetricsUseRoutePatternsAndResponseStatus(t *testing.T) {
	t.Parallel()

	server := NewServer(Config{
		Alerts:          alertReaderStub{},
		Cyclones:        cycloneReaderStub{},
		TsunamiProducts: tsunamiProductReaderStub{},
		Official:        &officialReaderStub{},
		Community:       &communityReaderStub{},
		Transportation:  &transportationReaderStub{},
	})
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		response,
		httptest.NewRequest(http.MethodGet, "/healthz?ignored=private", nil),
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", response.Code)
	}

	metricsResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		metricsResponse,
		httptest.NewRequest(http.MethodGet, "/metrics", nil),
	)
	metric := `hawaii_resilience_http_requests_total{method="GET",route="/healthz",status="200"} 1`
	if !strings.Contains(metricsResponse.Body.String(), metric) {
		t.Fatalf("metrics missing %q:\n%s", metric, metricsResponse.Body.String())
	}
}

func TestCommunityProfileMetricsExposeBoundedSourceHealth(t *testing.T) {
	t.Parallel()

	retrievedAt := time.Now().Add(-2 * time.Minute)
	server := NewServer(Config{
		Alerts:          alertReaderStub{},
		Cyclones:        cycloneReaderStub{},
		TsunamiProducts: tsunamiProductReaderStub{},
		Official:        &officialReaderStub{},
		Community: &communityReaderStub{
			observe: true,
			profile: community.Profile{
				ACS: &census.Profile{
					Source: census.SourceStatus{
						Status:      "fresh",
						RetrievedAt: retrievedAt,
					},
				},
				SVI: &community.SVI{
					Source: arcgis.SourceStatus{
						Status:      "stale",
						RetrievedAt: retrievedAt,
					},
				},
				EmPOWER: &community.EmPOWER{
					OxygenServicesAnyDME: community.ProtectedCount{
						Value:                  intPointer(11),
						MayRepresentMaskedCell: true,
					},
					Source: arcgis.SourceStatus{
						Status:      "fresh",
						RetrievedAt: retrievedAt,
					},
				},
				SourceErrors: []community.SourceError{{
					Source: "fema-nri",
					Error:  "unavailable",
				}},
				Disclaimer: "Aggregate planning data.",
			},
		},
		Transportation: &transportationReaderStub{},
	})
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		response,
		httptest.NewRequest(
			http.MethodGet,
			"/api/v1/community/profile?lat=21.29&lon=-157.68",
			nil,
		),
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	metricsResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		metricsResponse,
		httptest.NewRequest(http.MethodGet, "/metrics", nil),
	)
	metricsBody := metricsResponse.Body.String()
	for _, metric := range []string{
		`hawaii_resilience_afn_profile_responses_total{completeness="partial"} 1`,
		`hawaii_resilience_afn_source_requests_total{outcome="error",source="fema-nri"} 1`,
		`hawaii_resilience_afn_source_request_duration_seconds_count{outcome="success",source="acs-5-year"} 1`,
		`hawaii_resilience_afn_source_stale{source="cdc-svi-2022"} 1`,
		`hawaii_resilience_afn_privacy_masked_observations_total{field="oxygen_services_dme"} 1`,
		`hawaii_resilience_afn_source_retrieved_timestamp_seconds{source="acs-5-year"} `,
	} {
		if !strings.Contains(metricsBody, metric) {
			t.Fatalf("metrics missing %q:\n%s", metric, metricsBody)
		}
	}
}

func TestHTTPMetricsCoverEveryRegisteredEndpoint(t *testing.T) {
	t.Parallel()

	server := NewServer(Config{
		Alerts:          alertReaderStub{},
		Cyclones:        cycloneReaderStub{},
		TsunamiProducts: tsunamiProductReaderStub{},
		Official:        &officialReaderStub{},
		Community:       &communityReaderStub{},
		Transportation:  &transportationReaderStub{},
	})
	coordinateQuery := "?lat=21.29&lon=-157.68"
	requests := []struct {
		method      string
		path        string
		body        string
		contentType string
	}{
		{method: http.MethodGet, path: "/metrics"},
		{method: http.MethodGet, path: "/healthz"},
		{method: http.MethodGet, path: "/api/v1/sources"},
		{method: http.MethodGet, path: "/api/v1/events"},
		{method: http.MethodGet, path: "/api/v1/events/hurricanes"},
		{method: http.MethodGet, path: "/api/v1/events/tsunami"},
		{method: http.MethodGet, path: "/api/v1/risk/tsunami" + coordinateQuery},
		{method: http.MethodGet, path: "/api/v1/risk/flood" + coordinateQuery},
		{method: http.MethodGet, path: "/api/v1/risk/wildfire" + coordinateQuery},
		{method: http.MethodGet, path: "/api/v1/shelters/open" + coordinateQuery},
		{method: http.MethodGet, path: "/api/v1/shelter-plans"},
		{method: http.MethodGet, path: "/api/v1/community/acs" + coordinateQuery},
		{method: http.MethodGet, path: "/api/v1/community/svi" + coordinateQuery},
		{method: http.MethodGet, path: "/api/v1/community/empower" + coordinateQuery},
		{method: http.MethodGet, path: "/api/v1/community/fema-risk" + coordinateQuery},
		{method: http.MethodGet, path: "/api/v1/community/profile" + coordinateQuery},
		{method: http.MethodGet, path: "/api/v1/transportation/planned-closures" + coordinateQuery},
		{
			method:      http.MethodPost,
			path:        "/api/v1/telemetry/browser",
			body:        `{"version":1,"events":[]}`,
			contentType: "application/json",
		},
	}
	for _, item := range requests {
		request := httptest.NewRequest(item.method, item.path, strings.NewReader(item.body))
		request.RemoteAddr = "192.0.2.40:1234"
		if item.contentType != "" {
			request.Header.Set("Content-Type", item.contentType)
		}
		server.Handler().ServeHTTP(httptest.NewRecorder(), request)
	}

	metricsResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		metricsResponse,
		httptest.NewRequest(http.MethodGet, "/metrics", nil),
	)
	metricsBody := metricsResponse.Body.String()
	for _, route := range []string{
		"/metrics",
		"/healthz",
		"/api/v1/sources",
		"/api/v1/events",
		"/api/v1/events/hurricanes",
		"/api/v1/events/tsunami",
		"/api/v1/risk/tsunami",
		"/api/v1/risk/flood",
		"/api/v1/risk/wildfire",
		"/api/v1/shelters/open",
		"/api/v1/shelter-plans",
		"/api/v1/community/acs",
		"/api/v1/community/svi",
		"/api/v1/community/empower",
		"/api/v1/community/fema-risk",
		"/api/v1/community/profile",
		"/api/v1/transportation/planned-closures",
		"/api/v1/telemetry/browser",
	} {
		if !strings.Contains(metricsBody, `route="`+route+`"`) {
			t.Fatalf("HTTP metrics missing route %q:\n%s", route, metricsBody)
		}
	}
}

func intPointer(value int) *int {
	return &value
}
