package operationalstatus

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/arcgis"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/official"
)

type shelterReaderStub struct {
	result official.OpenShelters
	err    error
}

func (stub shelterReaderStub) OpenShelters(
	context.Context,
	float64,
	float64,
) (official.OpenShelters, error) {
	return stub.result, stub.err
}

func TestSnapshotKeepsShelterReportsSeparateAndOtherDomainsUnavailable(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 27, 8, 0, 0, 0, time.UTC)
	capacity := 120
	service := NewService(Config{
		Shelters: shelterReaderStub{result: official.OpenShelters{
			Shelters: []official.Shelter{{
				ID: "fema-1", Name: "Reported shelter", Status: "OPEN",
				Capacity: &capacity, WheelchairAccessible: "YES",
				PetAccommodationsCode: "HOUSEHOLD_PETS",
				Organization:          "Reporting partner", DistanceMiles: 2.4,
			}},
			Sources: []arcgis.SourceStatus{{
				ID: "fema-open-shelters", Authority: "FEMA and reporting partners",
				URL: "https://gis.fema.gov/example", Status: "fresh",
				RetrievedAt: now.Add(-time.Minute), FreshUntil: now.Add(4 * time.Minute),
			}},
		}},
		Now: func() time.Time { return now },
	})

	snapshot, err := service.Snapshot(context.Background(), 21.3, -157.8)
	if err != nil {
		t.Fatalf("Snapshot() error = %v", err)
	}
	if snapshot.Status != "partial" || len(snapshot.Domains) != 6 {
		t.Fatalf("unexpected snapshot: %+v", snapshot)
	}
	for _, domain := range snapshot.Domains {
		if domain.Domain == "shelter" {
			if domain.Status != "reported_live" || len(domain.Shelters) != 1 {
				t.Fatalf("unexpected shelter domain: %+v", domain)
			}
			if domain.Shelters[0].Capacity == nil ||
				*domain.Shelters[0].Capacity != capacity {
				t.Fatalf("capacity was not preserved: %+v", domain.Shelters[0])
			}
			continue
		}
		if domain.Status != "unavailable" || domain.UnavailableBoundary == nil {
			t.Fatalf("domain did not fail closed: %+v", domain)
		}
	}
}

func TestSnapshotMakesShelterFailureExplicit(t *testing.T) {
	t.Parallel()
	service := NewService(Config{
		Shelters: shelterReaderStub{err: errors.New("upstream details")},
	})
	snapshot, err := service.Snapshot(context.Background(), 21.3, -157.8)
	if err != nil {
		t.Fatalf("Snapshot() error = %v", err)
	}
	if snapshot.Status != "unavailable" || len(snapshot.SourceErrors) != 1 {
		t.Fatalf("unexpected failure snapshot: %+v", snapshot)
	}
	if snapshot.SourceErrors[0].Error != "supported shelter source unavailable" {
		t.Fatalf("source error leaked details: %+v", snapshot.SourceErrors)
	}
	for _, domain := range snapshot.Domains {
		if domain.Status != "unavailable" {
			t.Fatalf("domain %q did not fail closed: %+v", domain.Domain, domain)
		}
	}
}

func TestSnapshotRejectsShelterResponseWithoutProvenance(t *testing.T) {
	t.Parallel()
	service := NewService(Config{
		Shelters: shelterReaderStub{result: official.OpenShelters{
			Shelters: []official.Shelter{{ID: "unattributed", Status: "OPEN"}},
		}},
	})
	snapshot, err := service.Snapshot(context.Background(), 21.3, -157.8)
	if err != nil {
		t.Fatalf("Snapshot() error = %v", err)
	}
	if snapshot.Status != "unavailable" ||
		snapshot.Domains[2].Status != "unavailable" {
		t.Fatalf("response without provenance did not fail closed: %+v", snapshot)
	}
	if snapshot.SourceErrors[0].Error !=
		"supported shelter source returned invalid provenance" {
		t.Fatalf("unexpected source error: %+v", snapshot.SourceErrors)
	}
}

func TestSnapshotPreservesStaleShelterSource(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 27, 8, 0, 0, 0, time.UTC)
	service := NewService(Config{
		Shelters: shelterReaderStub{result: official.OpenShelters{
			Sources: []arcgis.SourceStatus{{
				ID: "fema-open-shelters", Authority: "FEMA",
				URL: "https://gis.fema.gov/example", Status: "stale",
				RetrievedAt: now.Add(-10 * time.Minute),
				FreshUntil:  now.Add(-5 * time.Minute),
			}},
		}},
		Now: func() time.Time { return now },
	})
	snapshot, err := service.Snapshot(context.Background(), 21.3, -157.8)
	if err != nil {
		t.Fatalf("Snapshot() error = %v", err)
	}
	if snapshot.Domains[2].Status != "stale" ||
		snapshot.Domains[2].Freshness.FreshUntil == "" {
		t.Fatalf("stale source was not preserved: %+v", snapshot.Domains[2])
	}
}

func TestValidateRejectsLiveUnsupportedDomain(t *testing.T) {
	t.Parallel()
	snapshot := Snapshot{
		SchemaVersion: SchemaVersion,
		Status:        "partial",
		Domains: []DomainStatus{
			unavailableEvacuationOrder(),
			{Domain: "road_transport", Status: "reported_live"},
			unavailableShelter(),
			unavailableTransit(),
			unavailableUtility(),
			unavailableWildfire(),
		},
	}

	if err := Validate(snapshot); err == nil {
		t.Fatal("Validate() accepted live unsupported road status")
	}
}

func TestSnapshotRetainsShelterQueryAndRefreshFailureMetadata(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 30, 16, 0, 0, 0, time.UTC)
	service := NewService(Config{
		Shelters: shelterReaderStub{result: official.OpenShelters{
			QueryPartial: true,
			Shelters:     []official.Shelter{{ID: "last-known", Name: "Last known report"}},
			Sources: []arcgis.SourceStatus{{
				ID: "fema-open-shelters", Authority: "FEMA", URL: "https://gis.fema.gov/example",
				Status: "stale", RetrievedAt: now.Add(-10 * time.Minute),
				FreshUntil: now.Add(-5 * time.Minute), RefreshAttemptedAt: &now,
			}},
		}},
		Now: func() time.Time { return now },
	})
	snapshot, err := service.Snapshot(context.Background(), 21.3, -157.8)
	if err != nil {
		t.Fatal(err)
	}
	domain := snapshot.Domains[2]
	if domain.Status != "stale" || !domain.ShelterQueryPartial ||
		!domain.ShelterSourceUnavailable || len(domain.Shelters) != 1 {
		t.Fatalf("last-known operational behavior or lifecycle metadata lost: %+v", domain)
	}
}
