package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/arcgis"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/community"
	"github.com/prometheus/client_golang/prometheus"
)

type afnLayerStub struct {
	county string
	err    error
}

func (stub *afnLayerStub) AFNLayer(ctx context.Context, county string) (community.AFNLayer, error) {
	stub.county = county
	community.ReportSourceObservation(ctx, community.SourceObservation{Source: "census-tigerweb-tracts", Outcome: "success", Duration: time.Millisecond})
	community.ReportSourceObservation(ctx, community.SourceObservation{Source: "private-unbounded-tract-id", Outcome: "secret", Duration: time.Millisecond})
	return community.AFNLayer{
		Type: "FeatureCollection", Features: []arcgis.Feature{}, Status: "partial",
		Sources: []community.LayerSource{
			{SourceStatus: arcgis.SourceStatus{ID: "census-tigerweb-tracts", Status: "stale", RetrievedAt: time.Unix(100, 0)}, CountyCode: "001"},
			{SourceStatus: arcgis.SourceStatus{ID: "census-tigerweb-tracts", Status: "fresh", RetrievedAt: time.Unix(200, 0)}, CountyCode: "009"},
		},
		SourceErrors: []community.LayerSourceError{{Source: "acs-5-year", CountyCode: "005", Error: "Census API key is required"}},
	}, stub.err
}

func TestAFNLayerEndpointValidationFailuresAndBoundedTelemetry(t *testing.T) {
	t.Parallel()
	registry := prometheus.NewRegistry()
	reader := &afnLayerStub{}
	server := NewServer(Config{
		Alerts: alertReaderStub{}, Cyclones: cycloneReaderStub{}, TsunamiProducts: tsunamiProductReaderStub{},
		Official: &officialReaderStub{}, Community: &communityReaderStub{}, Transportation: &transportationReaderStub{},
		AFNLayer: reader, Registry: registry,
	})
	for _, query := range []string{"", "?county=001", "?county=003", "?county=005", "?county=007", "?county=009"} {
		response := httptest.NewRecorder()
		server.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/v1/community/afn-layer"+query, nil))
		if response.Code != http.StatusOK {
			t.Fatalf("%s: %d %s", query, response.Code, response.Body.String())
		}
		var layer community.AFNLayer
		if err := json.Unmarshal(response.Body.Bytes(), &layer); err != nil || layer.Status != "partial" || len(layer.SourceErrors) != 1 {
			t.Fatalf("explicit partial failure lost: %s %v", response.Body.String(), err)
		}
		if reader.county != strings.TrimPrefix(query, "?county=") {
			t.Fatalf("county not forwarded: %q", reader.county)
		}
	}
	for _, query := range []string{"?county=15005", "?county=005%27", "?county=002", "?county=005&county=009"} {
		response := httptest.NewRecorder()
		server.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/v1/community/afn-layer"+query, nil))
		if response.Code != http.StatusBadRequest {
			t.Fatalf("invalid county %s accepted: %d", query, response.Code)
		}
	}
	metrics := httptest.NewRecorder()
	server.Handler().ServeHTTP(metrics, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	body := metrics.Body.String()
	if strings.Contains(body, "private-unbounded-tract-id") || strings.Contains(body, `outcome="secret"`) ||
		!strings.Contains(body, `source="census-tigerweb-tracts"`) || !strings.Contains(body, `source="other"`) {
		t.Fatalf("unbounded/missing telemetry: %s", body)
	}
	if !strings.Contains(body, `hawaii_resilience_afn_source_stale{source="census-tigerweb-tracts"} 1`) {
		t.Fatalf("fresh county hid stale county: %s", body)
	}
	reader.err = errors.New("upstream down")
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/v1/community/afn-layer?county=005", nil))
	if response.Code != http.StatusBadGateway {
		t.Fatalf("upstream failure returned %d", response.Code)
	}
}

func TestAFNLayerEndpointUnavailableWithoutLiveReader(t *testing.T) {
	t.Parallel()
	server := NewServer(Config{
		Alerts: alertReaderStub{}, Cyclones: cycloneReaderStub{}, TsunamiProducts: tsunamiProductReaderStub{},
		Official: &officialReaderStub{}, Community: &communityReaderStub{}, Transportation: &transportationReaderStub{},
	})
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/v1/community/afn-layer?county=005", nil))
	if response.Code != http.StatusServiceUnavailable || strings.Contains(response.Body.String(), `"features"`) {
		t.Fatalf("unconfigured sources presented fixture as live: %d %s", response.Code, response.Body.String())
	}
}
