package shelterplans

import (
	"context"
	"testing"
	"time"
)

func TestCatalogReturnsPartialCountyCoverageWithoutInventedFacilities(t *testing.T) {
	t.Parallel()

	catalog := Catalog{
		Now: func() time.Time {
			return time.Date(2026, time.October, 27, 0, 0, 0, 0, time.UTC)
		},
	}
	snapshot, err := catalog.Snapshot(context.Background())
	if err != nil {
		t.Fatalf("Snapshot returned error: %v", err)
	}

	if snapshot.Status != "partial" {
		t.Fatalf("status = %q, want partial", snapshot.Status)
	}
	if len(snapshot.Jurisdictions) != 4 {
		t.Fatalf(
			"planning jurisdiction count = %d, want 4",
			len(snapshot.Jurisdictions),
		)
	}
	if snapshot.Summary.JurisdictionsWithPublishedPlan != 1 {
		t.Fatalf(
			"published jurisdiction plans = %d, want 1",
			snapshot.Summary.JurisdictionsWithPublishedPlan,
		)
	}
	if snapshot.Summary.PoliticalCountiesTotal != 5 {
		t.Fatalf(
			"political counties = %d, want 5",
			snapshot.Summary.PoliticalCountiesTotal,
		)
	}
	if snapshot.Summary.OfficialFacilityRecords != 0 {
		t.Fatalf(
			"official facility records = %d, want 0",
			snapshot.Summary.OfficialFacilityRecords,
		)
	}
	for _, jurisdiction := range snapshot.Jurisdictions {
		if jurisdiction.ValidationStatus != "local_validation_required" {
			t.Fatalf(
				"jurisdiction %q validation status = %q",
				jurisdiction.ID,
				jurisdiction.ValidationStatus,
			)
		}
		if len(jurisdiction.FacilityRecords) != 0 {
			t.Fatalf(
				"jurisdiction %q contains invented facility records",
				jurisdiction.ID,
			)
		}
	}

	maui := snapshot.Jurisdictions[1]
	if maui.SpecialJurisdiction == nil {
		t.Fatal("Maui jurisdiction is missing the Kalawao scope note")
	}
	if len(maui.SpecialJurisdiction.Sources) != 2 {
		t.Fatalf(
			"Kalawao jurisdiction sources = %d, want 2",
			len(maui.SpecialJurisdiction.Sources),
		)
	}
	if len(maui.PoliticalCounties) != 2 ||
		maui.PoliticalCounties[1] != "Kalawao" {
		t.Fatalf(
			"Maui political counties = %#v, want Maui and Kalawao",
			maui.PoliticalCounties,
		)
	}
}

func TestCatalogMarksCuratedReferencesStaleAfterReviewWindow(t *testing.T) {
	t.Parallel()

	catalog := Catalog{
		Now: func() time.Time {
			return time.Date(2027, time.February, 1, 0, 0, 0, 0, time.UTC)
		},
	}
	snapshot, err := catalog.Snapshot(context.Background())
	if err != nil {
		t.Fatalf("Snapshot returned error: %v", err)
	}

	for _, jurisdiction := range snapshot.Jurisdictions {
		for _, record := range jurisdiction.PlanRecords {
			if record.Freshness != "stale" {
				t.Fatalf(
					"record %q freshness = %q, want stale",
					record.ID,
					record.Freshness,
				)
			}
		}
	}
}
