package census

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/arcgis"
)

type geographyQuerierFunc func(context.Context, arcgis.Request) (arcgis.Result, error)

func (f geographyQuerierFunc) Query(ctx context.Context, r arcgis.Request) (arcgis.Result, error) {
	return f(ctx, r)
}

func unavailableGeographyQuerier() GeographyQuerier {
	return geographyQuerierFunc(func(context.Context, arcgis.Request) (arcgis.Result, error) {
		return arcgis.Result{}, errors.New("official tract service unavailable")
	})
}

func TestGeocoderOutageResolvesExactOfficialTractWithExplicitProvenance(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/geocoder" {
			http.Error(w, "unavailable", http.StatusBadGateway)
			return
		}
		if r.URL.Path == "/detailed" {
			if r.URL.Query().Get("for") != "tract:031900" || r.URL.Query().Get("in") != "state:15 county:005" {
				t.Error("ACS query did not use authoritative point-intersection tract")
			}
			_, _ = w.Write([]byte(`[["NAME","B01003_001E"],["Census Tract 319","67"]]`))
			return
		}
		_, _ = w.Write([]byte(`[["S1810_C02_001E"],["17"]]`))
	}))
	defer server.Close()
	calls := 0
	querier := geographyQuerierFunc(func(_ context.Context, r arcgis.Request) (arcgis.Result, error) {
		calls++
		if r.URL != tigerGeographyURL || r.Params.Get("geometry") != "-156.984000,21.189000" ||
			r.Params.Get("spatialRel") != "esriSpatialRelIntersects" || r.Params.Get("geometryType") != "esriGeometryPoint" ||
			r.Params.Get("inSR") != "4326" || r.Params.Get("where") != "STATE = '15'" || r.Params.Get("resultRecordCount") != "2" {
			t.Errorf("not an exact bounded official intersection: %#v", r)
		}
		return arcgis.Result{
			Source: arcgis.SourceStatus{ID: "census-tigerweb-tracts", Authority: "U.S. Census Bureau", URL: tigerGeographyURL, Status: "fresh"},
			Collection: arcgis.FeatureCollection{Features: []arcgis.Feature{{Properties: map[string]any{
				"STATE": "15", "COUNTY": "005", "TRACT": "031900", "GEOID": "15005031900", "NAME": "Census Tract 319",
			}}}},
		}, nil
	})
	client := NewClient(Config{APIKey: "test-key", GeocoderURL: server.URL + "/geocoder", DetailedURL: server.URL + "/detailed", SubjectURL: server.URL + "/subject", ArcGIS: querier})
	profile, err := client.CommunityProfile(context.Background(), 21.189, -156.984)
	if err != nil {
		t.Fatal(err)
	}
	resolution := profile.Geography.Resolution
	if profile.Geography.TractFIPS != "15005031900" || resolution == nil ||
		resolution.Method != "tigerweb-acs2024-point-intersection" || !strings.Contains(resolution.GeocoderError, "HTTP 502") ||
		resolution.Source == nil || resolution.Source.Status != "fresh" || len(resolution.Warnings) == 0 ||
		!strings.Contains(strings.Join(profile.Warnings, " "), "Original error:") {
		t.Fatalf("outage or authoritative resolution hidden: %#v", profile)
	}
	profile.Geography.Resolution.Warnings[0] = "mutated"
	profile.Geography.Resolution.Source.Status = "mutated"
	cached, err := client.CommunityProfile(context.Background(), 21.189, -156.984)
	if err != nil || cached.Geography.Resolution.Warnings[0] == "mutated" || cached.Geography.Resolution.Source.Status != "fresh" || calls != 1 {
		t.Fatal("cached geography resolution not independent or not reused")
	}
}

func TestOfficialAlternativeRejectsAbsentAmbiguousAndInconsistentTracts(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { http.Error(w, "unavailable", 502) }))
	defer server.Close()
	valid := arcgis.Feature{Properties: map[string]any{"STATE": "15", "COUNTY": "005", "TRACT": "031900", "GEOID": "15005031900"}}
	for name, features := range map[string][]arcgis.Feature{
		"absent":       {},
		"ambiguous":    {valid, valid},
		"wrong-county": {{Properties: map[string]any{"STATE": "15", "COUNTY": "003", "TRACT": "031900", "GEOID": "15005031900"}}},
	} {
		t.Run(name, func(t *testing.T) {
			client := NewClient(Config{APIKey: "test-key", GeocoderURL: server.URL, ArcGIS: geographyQuerierFunc(func(context.Context, arcgis.Request) (arcgis.Result, error) {
				return arcgis.Result{Collection: arcgis.FeatureCollection{Features: features}}, nil
			})})
			_, err := client.CommunityProfile(context.Background(), 21.189, -156.984)
			if err == nil || !strings.Contains(err.Error(), "HTTP 502") || !strings.Contains(err.Error(), "alternative failed") {
				t.Fatalf("explicit original and alternative errors required: %v", err)
			}
		})
	}
}
