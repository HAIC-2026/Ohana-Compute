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
	if len(snapshot.Counties) != 4 {
		t.Fatalf("county count = %d, want 4", len(snapshot.Counties))
	}
	if snapshot.Summary.CountiesWithPublishedPlan != 1 {
		t.Fatalf(
			"published county plans = %d, want 1",
			snapshot.Summary.CountiesWithPublishedPlan,
		)
	}
	if snapshot.Summary.OfficialFacilityRecords != 0 {
		t.Fatalf(
			"official facility records = %d, want 0",
			snapshot.Summary.OfficialFacilityRecords,
		)
	}
	for _, county := range snapshot.Counties {
		if county.ValidationStatus != "local_validation_required" {
			t.Fatalf(
				"county %q validation status = %q",
				county.ID,
				county.ValidationStatus,
			)
		}
		if len(county.FacilityRecords) != 0 {
			t.Fatalf("county %q contains invented facility records", county.ID)
		}
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

	for _, county := range snapshot.Counties {
		for _, record := range county.PlanRecords {
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
