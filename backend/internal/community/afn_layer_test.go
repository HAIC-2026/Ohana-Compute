package community

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/arcgis"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/census"
)

type layerQuerier struct {
	failGeometry    bool
	invalidGeometry bool
	missingSVI      bool
	stale           bool
}

func (stub layerQuerier) Query(_ context.Context, request arcgis.Request) (arcgis.Result, error) {
	where := request.Params.Get("where")
	county := ""
	for _, code := range []string{"001", "003", "005", "007", "009"} {
		if strings.Contains(where, "'15"+code+"'") || strings.Contains(where, "COUNTY = '"+code+"'") {
			county = code
		}
	}
	if county == "" {
		return arcgis.Result{}, errors.New("unbounded query")
	}
	fips := "15" + county + "000100"
	now := time.Now().UTC()
	source := arcgis.SourceStatus{ID: request.SourceID, Authority: request.Authority, URL: request.URL, Status: "fresh", RetrievedAt: now, FreshUntil: now.Add(time.Hour)}
	if stub.stale {
		source.Status = "stale"
	}
	if request.SourceID == "census-tigerweb-tracts" {
		if stub.failGeometry {
			return arcgis.Result{}, errors.New("geometry unavailable")
		}
		geometry := json.RawMessage(`{"type":"Polygon","coordinates":[[[-157,21],[-157.1,21],[-157.1,21.1],[-157,21]]]}`)
		if stub.invalidGeometry {
			geometry = json.RawMessage(`{"type":"Point","coordinates":[-157,21]}`)
		}
		return arcgis.Result{Source: source, Collection: arcgis.FeatureCollection{Type: "FeatureCollection", Features: []arcgis.Feature{
			{Type: "Feature", Geometry: geometry, Properties: map[string]any{"GEOID": fips, "NAME": "Census Tract 1"}},
		}}}, nil
	}
	if stub.missingSVI {
		fips = "15" + county + "000200"
	}
	return arcgis.Result{Source: source, Collection: arcgis.FeatureCollection{Features: []arcgis.Feature{
		{Properties: map[string]any{"FIPS": fips, "E_TOTPOP": 100, "E_DISABL": -999, "RPL_THEMES": 0.5}},
	}}}, nil
}

type countyCensusStub struct{ err error }

func (stub countyCensusStub) CommunityProfile(context.Context, float64, float64) (census.Profile, error) {
	return census.Profile{}, stub.err
}
func (stub countyCensusStub) CountyProfiles(_ context.Context, county string) ([]census.Profile, error) {
	if stub.err != nil {
		return nil, stub.err
	}
	value := 100.0
	return []census.Profile{{
		Geography:  census.Geography{StateCode: "15", CountyCode: county, TractCode: "000100", TractFIPS: "15" + county + "000100", Name: "Tract in county " + county},
		Population: census.Metric{Estimate: &value},
		Source:     census.SourceStatus{ID: "acs-5-year", Authority: "U.S. Census Bureau", URL: "https://api.census.gov/data/2024/acs/acs5", Vintage: "2024 ACS 5-year", Status: "fresh"},
	}}, nil
}

func TestAFNLayerAllFiveCountiesRealSourceContracts(t *testing.T) {
	t.Parallel()
	var mu sync.Mutex
	observations := []SourceObservation{}
	ctx := WithSourceObserver(context.Background(), func(observation SourceObservation) {
		mu.Lock()
		defer mu.Unlock()
		observations = append(observations, observation)
	})
	layer, err := NewClient(layerQuerier{}, countyCensusStub{}).AFNLayer(ctx, "")
	if err != nil {
		t.Fatal(err)
	}
	if layer.Type != "FeatureCollection" || layer.Status != "complete" || len(layer.Features) != 5 || len(layer.Sources) != 15 || len(layer.CMISTDomains) != 5 || len(layer.IndicatorDefinitions) != 9 {
		t.Fatalf("unexpected layer: %#v", layer)
	}
	for i, county := range []string{"001", "003", "005", "007", "009"} {
		feature := layer.Features[i]
		if feature.ID != "15"+county+"000100" || feature.Properties["county_code"] != county ||
			!strings.Contains(string(feature.Geometry), `"Polygon"`) {
			t.Fatalf("wrong feature: %#v", feature)
		}
		indicators := feature.Properties["indicators"].(map[string]census.Metric)
		if len(indicators) != 9 || indicators["population"].Estimate == nil || *indicators["population"].Estimate != 100 ||
			indicators["incomplete_plumbing"].Estimate != nil {
			t.Fatalf("unexpected indicators: %#v", indicators)
		}
		svi := feature.Properties["svi"].(*SVI)
		if svi == nil || svi.WithDisability != nil || svi.OverallPercentile == nil || *svi.OverallPercentile != 0.5 {
			t.Fatal("SVI unknown or value not preserved")
		}
	}
	if len(observations) != 15 {
		t.Fatalf("expected 3 bounded observations per county, got %d", len(observations))
	}
	encoded, err := json.Marshal(layer)
	if err != nil || !strings.Contains(string(encoded), `"estimate":null`) {
		t.Fatalf("unknowns not serializable as null: %s %v", encoded, err)
	}
}

func TestAFNLayerKeyFailureAndVintageMismatchAreExplicit(t *testing.T) {
	t.Parallel()
	layer, err := NewClient(layerQuerier{missingSVI: true}, countyCensusStub{err: census.ErrAPIKeyRequired}).AFNLayer(context.Background(), "005")
	if err != nil {
		t.Fatal(err)
	}
	if layer.Status != "partial" || len(layer.Features) != 1 || len(layer.SourceErrors) != 2 {
		t.Fatalf("expected partial geography: %#v", layer)
	}
	feature := layer.Features[0]
	if feature.Properties["svi"].(*SVI) != nil {
		t.Fatal("mismatched tract SVI attached to geography")
	}
	for _, metric := range feature.Properties["indicators"].(map[string]census.Metric) {
		if metric.Estimate != nil {
			t.Fatal("unavailable ACS fabricated as live value")
		}
	}
	if layer.SourceErrors[0].CountyCode != "005" || !strings.Contains(layer.SourceErrors[0].Error, "key") {
		t.Fatalf("missing explicit Census key failure: %#v", layer.SourceErrors)
	}
}

func TestAFNLayerGeometryFailuresNeverProduceSyntheticFeatures(t *testing.T) {
	t.Parallel()
	for _, stub := range []layerQuerier{{failGeometry: true}, {invalidGeometry: true}} {
		if _, err := NewClient(stub, countyCensusStub{}).AFNLayer(context.Background(), "005"); err == nil {
			t.Fatal("unavailable geometry did not fail closed")
		}
	}
	if _, err := NewClient(layerQuerier{}, countyCensusStub{}).AFNLayer(context.Background(), "005' OR 1=1"); err == nil {
		t.Fatal("unbounded county accepted")
	}
}

func TestAFNLayerStaleSourcesRemainExplicitlyPartial(t *testing.T) {
	t.Parallel()
	layer, err := NewClient(layerQuerier{stale: true}, countyCensusStub{}).AFNLayer(context.Background(), "005")
	if err != nil || layer.Status != "partial" || len(layer.SourceErrors) != 2 {
		t.Fatalf("stale sources hidden: %#v %v", layer, err)
	}
}
