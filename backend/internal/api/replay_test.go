package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestReplayEndpointsAreStrictBoundedAndNoStore(t *testing.T) {
	server := NewServer(Config{
		Alerts:          alertReaderStub{},
		Cyclones:        cycloneReaderStub{},
		TsunamiProducts: tsunamiProductReaderStub{},
		Official:        &officialReaderStub{},
		Community:       &communityReaderStub{},
		Transportation:  &transportationReaderStub{},
	})

	catalogResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		catalogResponse,
		httptest.NewRequest(http.MethodGet, "/api/v1/planning/replays", nil),
	)
	if catalogResponse.Code != http.StatusOK {
		t.Fatalf("catalog status = %d: %s", catalogResponse.Code, catalogResponse.Body.String())
	}
	if got := catalogResponse.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("catalog cache control = %q", got)
	}
	if !strings.Contains(catalogResponse.Body.String(), "hi-wildfire-2023-lahaina") ||
		!strings.Contains(catalogResponse.Body.String(), "hi-tsunami-exercise-pacific-wave") {
		t.Fatalf("catalog missing representative fixtures: %s", catalogResponse.Body.String())
	}
	queryResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		queryResponse,
		httptest.NewRequest(http.MethodGet, "/api/v1/planning/replays?source_url=private", nil),
	)
	if queryResponse.Code != http.StatusBadRequest {
		t.Fatalf("catalog query status = %d, want 400", queryResponse.Code)
	}

	body := `{"schema_version":"historical-replay-request.v1","fixture_id":"hi-flood-2018-kauai-north-shore","standard":"current"}`
	runResponse := httptest.NewRecorder()
	runRequest := httptest.NewRequest(
		http.MethodPost,
		"/api/v1/planning/replays/run",
		strings.NewReader(body),
	)
	runRequest.Header.Set("Content-Type", "application/json")
	server.Handler().ServeHTTP(runResponse, runRequest)
	if runResponse.Code != http.StatusOK {
		t.Fatalf("run status = %d: %s", runResponse.Code, runResponse.Body.String())
	}
	if got := runResponse.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("run cache control = %q", got)
	}
	if !strings.Contains(runResponse.Body.String(), `"outcome":"warn"`) ||
		!strings.Contains(runResponse.Body.String(), `"outcome":"unavailable"`) {
		t.Fatalf("run did not preserve stale/unavailable states: %s", runResponse.Body.String())
	}
}

func TestReplayEndpointRejectsUnknownFieldsContentTypesAndUnknownFixtures(t *testing.T) {
	server := NewServer(Config{
		Alerts:          alertReaderStub{},
		Cyclones:        cycloneReaderStub{},
		TsunamiProducts: tsunamiProductReaderStub{},
		Official:        &officialReaderStub{},
		Community:       &communityReaderStub{},
		Transportation:  &transportationReaderStub{},
	})
	for _, test := range []struct {
		name        string
		contentType string
		body        string
		status      int
	}{
		{
			name:        "content type",
			contentType: "text/plain",
			body:        `{}`,
			status:      http.StatusUnsupportedMediaType,
		},
		{
			name:        "unknown field",
			contentType: "application/json",
			body:        `{"schema_version":"historical-replay-request.v1","fixture_id":"hi-hurricane-2018-lane","standard":"current","source_url":"https://example.test/private"}`,
			status:      http.StatusBadRequest,
		},
		{
			name:        "second object",
			contentType: "application/json",
			body:        `{"schema_version":"historical-replay-request.v1","fixture_id":"hi-hurricane-2018-lane","standard":"current"} {}`,
			status:      http.StatusBadRequest,
		},
		{
			name:        "unknown fixture",
			contentType: "application/json",
			body:        `{"schema_version":"historical-replay-request.v1","fixture_id":"private-free-text","standard":"current"}`,
			status:      http.StatusBadRequest,
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			request := httptest.NewRequest(
				http.MethodPost,
				"/api/v1/planning/replays/run",
				strings.NewReader(test.body),
			)
			request.Header.Set("Content-Type", test.contentType)
			server.Handler().ServeHTTP(response, request)
			if response.Code != test.status {
				t.Fatalf("status = %d, want %d: %s", response.Code, test.status, response.Body.String())
			}
		})
	}
}

func TestReplayMetricsUseOnlyControlledLabels(t *testing.T) {
	server := NewServer(Config{
		Alerts:          alertReaderStub{},
		Cyclones:        cycloneReaderStub{},
		TsunamiProducts: tsunamiProductReaderStub{},
		Official:        &officialReaderStub{},
		Community:       &communityReaderStub{},
		Transportation:  &transportationReaderStub{},
	})
	body := `{"schema_version":"historical-replay-request.v1","fixture_id":"hi-wildfire-2023-lahaina","standard":"current"}`
	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/v1/planning/replays/run",
		strings.NewReader(body),
	)
	request.Header.Set("Content-Type", "application/json")
	server.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("run status = %d: %s", response.Code, response.Body.String())
	}

	metricsResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		metricsResponse,
		httptest.NewRequest(http.MethodGet, "/metrics", nil),
	)
	metrics := metricsResponse.Body.String()
	if !strings.Contains(metrics, `hawaii_resilience_historical_replay_runs_total{fixture_category="historical_incident",hazard="wildfire",outcome="unavailable"} 1`) {
		t.Fatalf("controlled replay run metric missing:\n%s", metrics)
	}
	if !strings.Contains(metrics, `hawaii_resilience_historical_replay_checks_total{check_group="Model",fixture_category="historical_incident",hazard="wildfire",outcome="unavailable"} 1`) {
		t.Fatalf("controlled replay check metric missing:\n%s", metrics)
	}
	for _, private := range []string{
		"hi-wildfire-2023-lahaina",
		"Lahaina",
		"fsri.org",
		"replay-",
		"source_url",
	} {
		if strings.Contains(metrics, private) {
			t.Fatalf("metrics leaked %q:\n%s", private, metrics)
		}
	}
}
