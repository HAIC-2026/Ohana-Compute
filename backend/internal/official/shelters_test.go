package official

import (
	"context"
	"encoding/json"
	"math"
	"strings"
	"testing"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/arcgis"
)

func TestOpenSheltersSkipsMalformedReportsAndNeverInventsFacts(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		name       string
		properties map[string]any
		valid      bool
	}{
		{"missing status and optional facts", map[string]any{"shelter_id": "1", "shelter_name": "Reported name"}, true},
		{"missing name", map[string]any{"shelter_id": "1"}, false},
		{"missing id", map[string]any{"shelter_name": "Reported name"}, false},
		{"object id fallback", map[string]any{"objectid": 1, "shelter_name": "Reported name"}, true},
		{"numeric name", map[string]any{"shelter_id": "1", "shelter_name": 5}, false},
		{"object id", map[string]any{"shelter_id": map[string]any{"id": 1}, "shelter_name": "Reported name"}, false},
		{"array status", map[string]any{"shelter_id": "1", "shelter_name": "Reported name", "shelter_status": []string{"OPEN"}}, false},
		{"boolean city", map[string]any{"shelter_id": "1", "shelter_name": "Reported name", "city": false}, false},
		{"capacity float", map[string]any{"shelter_id": "1", "shelter_name": "Reported name", "evacuation_capacity": 12.5}, false},
		{"negative capacity", map[string]any{"shelter_id": "1", "shelter_name": "Reported name", "evacuation_capacity": -1}, false},
		{"oversize name", map[string]any{"shelter_id": "1", "shelter_name": strings.Repeat("x", 257)}, false},
		{"unknown fields", map[string]any{"shelter_id": "1", "shelter_name": "Reported name", "shelter_status": nil, "evacuation_capacity": "unknown", "wheelchair_accessible": "Unknown"}, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			client := NewClient(querierStub{results: map[string]arcgis.Result{
				"fema-open-shelters": resultWithFeatures("fema-open-shelters",
					feature(test.properties, `{"type":"Point","coordinates":[-157.8,21.3]}`)),
			}})
			result, err := client.OpenShelters(context.Background(), 21.3, -157.8)
			if err != nil {
				t.Fatal(err)
			}
			if !test.valid {
				if len(result.Shelters) != 0 || !result.QueryPartial {
					t.Fatalf("malformed feature was not explicitly partial: %+v", result)
				}
				return
			}
			if len(result.Shelters) != 1 || result.QueryPartial {
				t.Fatalf("valid feature rejected: %+v", result)
			}
			shelter := result.Shelters[0]
			if shelter.Status != "" || shelter.Capacity != nil ||
				shelter.WheelchairAccessible != "" || shelter.PetAccommodationsCode != "" {
				t.Fatalf("unknown facts invented: %+v", shelter)
			}
		})
	}
}

func TestReportedShelterCapacityBounds(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		value    any
		valid    bool
		expected *int
	}{
		{nil, true, nil},
		{"", true, nil},
		{"Unknown", true, nil},
		{0, true, shelterCapacityPointer(0)},
		{1_000_000, true, shelterCapacityPointer(1_000_000)},
		{"100", true, shelterCapacityPointer(100)},
		{json.Number("120"), true, shelterCapacityPointer(120)},
		{float64(85), true, shelterCapacityPointer(85)},
		{-1, false, nil},
		{1_000_001, false, nil},
		{12.5, false, nil},
		{"12.5", false, nil},
		{json.Number("12.5"), false, nil},
		{true, false, nil},
		{math.Inf(1), false, nil},
		{math.NaN(), false, nil},
		{[]int{1}, false, nil},
	} {
		got, valid := reportedShelterCapacity(test.value)
		if valid != test.valid || (got == nil) != (test.expected == nil) ||
			(got != nil && *got != *test.expected) {
			t.Fatalf("capacity(%v) = %v, %v; want %v, %v", test.value, got, valid, test.expected, test.valid)
		}
	}
}

func TestOpenSheltersPreservesQueryPartialWhenRowsAreSkipped(t *testing.T) {
	t.Parallel()
	result := resultWithFeatures("fema-open-shelters",
		feature(map[string]any{"shelter_id": "a", "shelter_name": "Valid"}, `{"type":"Point","coordinates":[-157.8,21.3]}`),
		feature(map[string]any{"shelter_id": "b", "shelter_name": "Bad geometry"}, `{"type":"Point","coordinates":[500,21.3]}`),
	)
	client := NewClient(querierStub{results: map[string]arcgis.Result{"fema-open-shelters": result}})
	response, err := client.OpenShelters(context.Background(), 21.3, -157.8)
	if err != nil || len(response.Shelters) != 1 || !response.QueryPartial {
		t.Fatalf("skipped geometry not reflected as partial: %+v %v", response, err)
	}
	result.Collection.Features = result.Collection.Features[:1]
	result.Partial = true
	client = NewClient(querierStub{results: map[string]arcgis.Result{"fema-open-shelters": result}})
	response, err = client.OpenShelters(context.Background(), 21.3, -157.8)
	if err != nil || !response.QueryPartial {
		t.Fatalf("upstream truncation not reflected as partial: %+v %v", response, err)
	}
}

func shelterCapacityPointer(value int) *int {
	return &value
}
