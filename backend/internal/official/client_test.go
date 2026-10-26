package official

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/arcgis"
)

type querierStub struct {
	results map[string]arcgis.Result
	errors  map[string]error
}

func (stub querierStub) Query(
	_ context.Context,
	request arcgis.Request,
) (arcgis.Result, error) {
	if err := stub.errors[request.SourceID]; err != nil {
		return arcgis.Result{}, err
	}
	result, ok := stub.results[request.SourceID]
	if !ok {
		return arcgis.Result{}, errors.New("unexpected source: " + request.SourceID)
	}
	return result, nil
}

func TestTsunamiRiskPreservesOfficialGeometry(t *testing.T) {
	t.Parallel()

	client := NewClient(querierStub{results: map[string]arcgis.Result{
		"state-tsunami-zones": resultWithFeatures(
			"state-tsunami-zones",
			feature(
				map[string]any{
					"zone_type": "Extreme Tsunami Evacuation Zone",
					"zone_desc": "Move inland when directed.",
				},
				`{"type":"Polygon","coordinates":[]}`,
			),
		),
	}})

	risk, err := client.TsunamiRisk(context.Background(), 21.29, -157.68)
	if err != nil {
		t.Fatalf("TsunamiRisk failed: %v", err)
	}
	if risk.Status != "inside" ||
		risk.ZoneType == nil ||
		*risk.ZoneType != "Extreme Tsunami Evacuation Zone" ||
		len(risk.Geometry.Features) != 1 {
		t.Fatalf("unexpected tsunami risk: %#v", risk)
	}
}

func TestFloodRiskClassifiesZoneDAndPlanningExposure(t *testing.T) {
	t.Parallel()

	client := NewClient(querierStub{results: map[string]arcgis.Result{
		"state-dfirm-point": resultWithFeatures(
			"state-dfirm-point",
			feature(map[string]any{
				"fld_zone":   "D",
				"zone_subty": nil,
				"sfha_tf":    "F",
			}, "null"),
		),
		"state-dfirm-nearby": resultWithFeatures(
			"state-dfirm-nearby",
			feature(map[string]any{"sfha_tf": "T"}, `{"type":"Polygon","coordinates":[]}`),
		),
		"state-coastal-flood-3-2ft": resultWithFeatures(
			"state-coastal-flood-3-2ft",
			feature(map[string]any{"zone": "1"}, "null"),
		),
	}})

	risk, err := client.FloodRisk(context.Background(), 21.29, -157.68)
	if err != nil {
		t.Fatalf("FloodRisk failed: %v", err)
	}
	if risk.Classification != "undetermined" ||
		risk.ZoneCode == nil ||
		*risk.ZoneCode != "D" ||
		!risk.CoastalPlanningExposure ||
		len(risk.NearbyRiskGeometry.Features) != 1 {
		t.Fatalf("unexpected flood risk: %#v", risk)
	}
}

func TestWildfireRiskLabelsPlanningData(t *testing.T) {
	t.Parallel()

	client := NewClient(querierStub{results: map[string]arcgis.Result{
		"state-fire-risk": resultWithFeatures(
			"state-fire-risk",
			feature(map[string]any{
				"risk_rating": "Medium",
				"commu_name":  "East Honolulu (Hawaii Kai)",
			}, `{"type":"Polygon","coordinates":[]}`),
		),
	}})

	risk, err := client.WildfireRisk(context.Background(), 21.29, -157.68)
	if err != nil {
		t.Fatalf("WildfireRisk failed: %v", err)
	}
	if risk.Rating != "Medium" ||
		risk.CommunityName == nil ||
		*risk.CommunityName != "East Honolulu (Hawaii Kai)" {
		t.Fatalf("unexpected wildfire risk: %#v", risk)
	}
}

func TestOpenSheltersSortsByResidentDistance(t *testing.T) {
	t.Parallel()

	client := NewClient(querierStub{results: map[string]arcgis.Result{
		"fema-open-shelters": resultWithFeatures(
			"fema-open-shelters",
			feature(
				map[string]any{
					"shelter_id":              2,
					"shelter_name":            "Far shelter",
					"evacuation_capacity":     100,
					"wheelchair_accessible":   "YES",
					"pet_accommodations_code": "PETS",
				},
				`{"type":"Point","coordinates":[-158.1,21.5]}`,
			),
			feature(
				map[string]any{
					"shelter_id":   1,
					"shelter_name": "Near shelter",
				},
				`{"type":"Point","coordinates":[-157.69,21.30]}`,
			),
		),
	}})

	result, err := client.OpenShelters(context.Background(), 21.296, -157.688)
	if err != nil {
		t.Fatalf("OpenShelters failed: %v", err)
	}
	if len(result.Shelters) != 2 || result.Shelters[0].Name != "Near shelter" {
		t.Fatalf("unexpected shelter ordering: %#v", result.Shelters)
	}
	if result.Shelters[1].Capacity == nil || *result.Shelters[1].Capacity != 100 {
		t.Fatalf("expected parsed capacity: %#v", result.Shelters[1])
	}
}

func resultWithFeatures(sourceID string, features ...arcgis.Feature) arcgis.Result {
	return arcgis.Result{
		Collection: arcgis.FeatureCollection{
			Type:     "FeatureCollection",
			Features: features,
		},
		Source: arcgis.SourceStatus{
			ID:          sourceID,
			Authority:   "Test authority",
			URL:         "https://example.test/" + sourceID,
			RetrievedAt: time.Date(2026, 10, 26, 18, 0, 0, 0, time.UTC),
			FreshUntil:  time.Date(2026, 10, 26, 19, 0, 0, 0, time.UTC),
			Status:      "fresh",
		},
	}
}

func feature(properties map[string]any, geometry string) arcgis.Feature {
	return arcgis.Feature{
		Type:       "Feature",
		Geometry:   json.RawMessage(geometry),
		Properties: properties,
	}
}
