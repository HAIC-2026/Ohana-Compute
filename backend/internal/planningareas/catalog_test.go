package planningareas

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestCatalogReturnsFourDistinctRepresentativeWorkflows(t *testing.T) {
	t.Parallel()

	catalog := Catalog{
		Now: func() time.Time {
			return time.Date(2026, time.October, 28, 0, 0, 0, 0, time.UTC)
		},
	}
	snapshot, err := catalog.Snapshot(context.Background())
	if err != nil {
		t.Fatalf("Snapshot returned error: %v", err)
	}

	if snapshot.Status != "complete" {
		t.Fatalf("status = %q, want complete", snapshot.Status)
	}
	if snapshot.Provenance.DatasetMode != "practice" {
		t.Fatalf("dataset mode = %q, want practice", snapshot.Provenance.DatasetMode)
	}
	if snapshot.Summary.PlanningJurisdictionsTotal != 4 {
		t.Fatalf(
			"planning jurisdictions = %d, want 4",
			snapshot.Summary.PlanningJurisdictionsTotal,
		)
	}
	if snapshot.Summary.PoliticalCountiesTotal != 5 {
		t.Fatalf(
			"political counties = %d, want 5",
			snapshot.Summary.PoliticalCountiesTotal,
		)
	}
	if snapshot.Summary.RepresentativeWorkflows != 4 {
		t.Fatalf(
			"representative workflows = %d, want 4",
			snapshot.Summary.RepresentativeWorkflows,
		)
	}

	areaIDs := map[string]bool{}
	resourceNames := map[string]bool{}
	routeNames := map[string]bool{}
	for _, jurisdiction := range snapshot.Jurisdictions {
		if len(jurisdiction.Areas) != 1 {
			t.Fatalf(
				"jurisdiction %q areas = %d, want 1",
				jurisdiction.ID,
				len(jurisdiction.Areas),
			)
		}
		area := jurisdiction.Areas[0]
		if area.JurisdictionID != jurisdiction.ID ||
			area.ShelterPlanJurisdictionID != jurisdiction.ID {
			t.Fatalf("area %q has inconsistent jurisdiction links", area.ID)
		}
		if area.AFNFixtureKey == "" || area.Briefing.Name == "" {
			t.Fatalf("area %q is missing AFN or briefing depth", area.ID)
		}
		if len(area.PracticeResources) < 3 || len(area.PracticeRoutes) < 3 {
			t.Fatalf("area %q lacks representative resources or routes", area.ID)
		}
		areaIDs[area.ID] = true
		resourceNames[area.PracticeResources[0].Name] = true
		routeNames[area.PracticeRoutes[0].Name] = true
	}

	for _, areaID := range []string{
		"oahu-town",
		"maui-central",
		"hawaii-hilo",
		"kauai-east",
	} {
		if !areaIDs[areaID] {
			t.Fatalf("missing representative area %q", areaID)
		}
	}
	if len(resourceNames) != 4 || len(routeNames) != 4 {
		t.Fatal("representative workflows reused their primary resource or route")
	}
}

func TestOuterIslandWorkflowsDoNotContainOahuOnlyContent(t *testing.T) {
	t.Parallel()

	snapshot, err := NewCatalog().Snapshot(context.Background())
	if err != nil {
		t.Fatalf("Snapshot returned error: %v", err)
	}

	for _, jurisdiction := range snapshot.Jurisdictions {
		for _, area := range jurisdiction.Areas {
			if area.Island == "Oʻahu" {
				continue
			}
			content := area.Summary + area.Briefing.Summary
			for _, resource := range area.PracticeResources {
				content += resource.Name
			}
			for _, route := range area.PracticeRoutes {
				content += route.Name
			}
			for _, forbidden := range []string{"H-1", "TheBus", "Waikīkī", "Urban Honolulu"} {
				if strings.Contains(content, forbidden) {
					t.Fatalf(
						"outer-island area %q contains Oʻahu-only value %q",
						area.ID,
						forbidden,
					)
				}
			}
		}
	}
}

func TestCatalogMarksPracticeProvenanceStaleAfterReviewWindow(t *testing.T) {
	t.Parallel()

	catalog := Catalog{
		Now: func() time.Time {
			return time.Date(2027, time.May, 1, 0, 0, 0, 0, time.UTC)
		},
	}
	snapshot, err := catalog.Snapshot(context.Background())
	if err != nil {
		t.Fatalf("Snapshot returned error: %v", err)
	}
	if snapshot.Provenance.Freshness != "stale" {
		t.Fatalf(
			"freshness = %q, want stale",
			snapshot.Provenance.Freshness,
		)
	}
}
