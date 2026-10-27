package replay

import (
	"context"
	"reflect"
	"testing"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/resourcedemand"
)

func TestRunIsDeterministicAndKeepsUnavailableEvidenceUnavailable(t *testing.T) {
	engine := NewEngine(resourcedemand.NewCalculator())
	request := Request{
		SchemaVersion: RequestSchemaVersion,
		FixtureID:     "hi-wildfire-2023-lahaina",
		Standard:      CurrentEvaluationStandard,
	}
	first, err := engine.Run(context.Background(), request)
	if err != nil {
		t.Fatalf("run first replay: %v", err)
	}
	second, err := engine.Run(context.Background(), request)
	if err != nil {
		t.Fatalf("run second replay: %v", err)
	}
	if !reflect.DeepEqual(first, second) {
		t.Fatal("identical replay requests must produce identical reports")
	}
	if first.RunID == "" || first.RunID != second.RunID {
		t.Fatalf("run IDs are not deterministic: %q %q", first.RunID, second.RunID)
	}
	demand := findCheck(t, first, "model.resource-demand")
	if demand.Outcome != "unavailable" ||
		demand.Actual.Status != "unavailable" ||
		demand.Actual.Low != nil ||
		demand.Actual.High != nil {
		t.Fatalf("missing evidence was coerced to a numeric value: %#v", demand)
	}
}

func TestCatalogAndRunsPreserveIslandAndFixtureIsolation(t *testing.T) {
	catalog := CurrentCatalog()
	if got, want := len(catalog.Fixtures), 5; got != want {
		t.Fatalf("fixtures = %d, want %d", got, want)
	}
	engine := NewEngine(resourcedemand.NewCalculator())
	for _, test := range []struct {
		id     string
		island string
		area   string
	}{
		{"hi-flood-2018-kauai-north-shore", "Kauaʻi", "kauai-east"},
		{"hi-wildfire-2023-lahaina", "Maui", "maui-central"},
		{"hi-tsunami-exercise-pacific-wave", "Oʻahu", "oahu-town"},
	} {
		entry := findFixture(t, catalog, test.id)
		if entry.Island != test.island || entry.AreaTemplateID != test.area {
			t.Fatalf("%s leaked geography: %#v", test.id, entry)
		}
		report, err := engine.Run(context.Background(), Request{
			SchemaVersion: RequestSchemaVersion,
			FixtureID:     test.id,
			Standard:      CurrentEvaluationStandard,
		})
		if err != nil {
			t.Fatalf("run %s: %v", test.id, err)
		}
		if report.Island != test.island {
			t.Fatalf("%s report island = %q, want %q", test.id, report.Island, test.island)
		}
	}
}

func TestExerciseDemandUsesProductionModelAndVersionedThreshold(t *testing.T) {
	report, err := NewEngine(resourcedemand.NewCalculator()).Run(
		context.Background(),
		Request{
			SchemaVersion: RequestSchemaVersion,
			FixtureID:     "hi-tsunami-exercise-pacific-wave",
			Standard:      CurrentEvaluationStandard,
		},
	)
	if err != nil {
		t.Fatalf("run exercise replay: %v", err)
	}
	if report.CalibrationVersion != CalibrationVersion {
		t.Fatalf("calibration version = %q", report.CalibrationVersion)
	}
	demand := findCheck(t, report, "model.resource-demand")
	if demand.Outcome != "pass" || demand.Actual.Status != "available" {
		t.Fatalf("exercise demand check = %#v", demand)
	}
	if demand.Actual.Value != "2300" {
		t.Fatalf("planning demand = %q, want production model value 2300", demand.Actual.Value)
	}
	if len(report.ModelVersions) < 3 {
		t.Fatalf("missing production model versions: %#v", report.ModelVersions)
	}
}

func TestStaleSourceWarnsWithoutChangingHistoricalEvidence(t *testing.T) {
	report, err := NewEngine(nil).Run(context.Background(), Request{
		SchemaVersion: RequestSchemaVersion,
		FixtureID:     "hi-flood-2018-kauai-north-shore",
		Standard:      CurrentEvaluationStandard,
	})
	if err != nil {
		t.Fatalf("run flood replay: %v", err)
	}
	sourceCheck := findCheck(t, report, "map.source-availability")
	if sourceCheck.Outcome != "warn" {
		t.Fatalf("stale source outcome = %q, want warn", sourceCheck.Outcome)
	}
	if !contains(sourceCheck.Actual.Values, "hawaii-doh-kauai-casper-2018:stale") {
		t.Fatalf("stale source state missing: %#v", sourceCheck.Actual.Values)
	}
}

func TestTriggerSemanticsNeverInferOrderFromSourceOrdering(t *testing.T) {
	report, err := NewEngine(nil).Run(context.Background(), Request{
		SchemaVersion: RequestSchemaVersion,
		FixtureID:     "hi-hurricane-2018-lane",
		Standard:      CurrentEvaluationStandard,
	})
	if err != nil {
		t.Fatalf("run hurricane replay: %v", err)
	}
	trigger := findCheck(t, report, "operate.trigger-semantics")
	if trigger.Actual.Value != "cphc_advisory_not_county_order" ||
		trigger.Outcome != "pass" {
		t.Fatalf("trigger semantics = %#v", trigger)
	}
}

func TestCuratedFixtureEvaluationTableReportsExactChecks(t *testing.T) {
	engine := NewEngine(nil)
	for _, entry := range CurrentCatalog().Fixtures {
		t.Run(entry.ID, func(t *testing.T) {
			report, err := engine.Run(context.Background(), Request{
				SchemaVersion: RequestSchemaVersion,
				FixtureID:     entry.ID,
				Standard:      CurrentEvaluationStandard,
			})
			if err != nil {
				t.Fatalf("run fixture: %v", err)
			}
			if got, want := len(report.Checks), 5; got != want {
				t.Fatalf("checks = %d, want %d", got, want)
			}
			for _, check := range report.Checks {
				if check.ID == "" || check.Group == "" {
					t.Fatalf("fixture %s emitted unnamed check: %#v", entry.ID, check)
				}
				if check.Outcome == "fail" {
					t.Fatalf(
						"fixture %s failed exact check %s: %v",
						entry.ID,
						check.ID,
						check.Mismatches,
					)
				}
			}
		})
	}
}

func findCheck(t *testing.T, report Report, id string) Check {
	t.Helper()
	for _, check := range report.Checks {
		if check.ID == id {
			return check
		}
	}
	t.Fatalf("check %q not found", id)
	return Check{}
}

func findFixture(t *testing.T, catalog Catalog, id string) CatalogFixture {
	t.Helper()
	for _, entry := range catalog.Fixtures {
		if entry.ID == id {
			return entry
		}
	}
	t.Fatalf("fixture %q not found", id)
	return CatalogFixture{}
}

func contains(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}
