package eventtriggers

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/hans"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/nws"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/ptwc"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/usgs"
)

type nwsStub struct {
	snapshot nws.Snapshot
	err      error
}

func (stub nwsStub) ActiveAlerts(context.Context) (nws.Snapshot, error) {
	return stub.snapshot, stub.err
}

type ptwcStub struct {
	snapshot ptwc.Snapshot
	err      error
}

func (stub ptwcStub) LatestProduct(context.Context) (ptwc.Snapshot, error) {
	return stub.snapshot, stub.err
}

type comCatStub struct {
	snapshot usgs.Snapshot
	err      error
}

func (stub comCatStub) RecentEvents(context.Context) (usgs.Snapshot, error) {
	return stub.snapshot, stub.err
}

type hansStub struct {
	snapshot hans.Snapshot
	err      error
}

func (stub hansStub) Snapshot(context.Context) (hans.Snapshot, error) {
	return stub.snapshot, stub.err
}

func TestNWSAdvisoryWatchWarningAndCAPResponseNeverBecomeOrder(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 27, 8, 0, 0, 0, time.UTC)
	for _, test := range []struct {
		event string
		state string
	}{
		{event: "Flood Advisory", state: "prepare"},
		{event: "Flood Watch", state: "prepare"},
		{event: "Flood Warning", state: "official_warning"},
	} {
		t.Run(test.event, func(t *testing.T) {
			triggers := normalizeNWS(nws.Snapshot{
				Alerts: []nws.Alert{{
					ID: "one", Hazard: "flood", Event: test.event,
					Headline: test.event, ResponseType: "Evacuate",
					Expires: now.Add(time.Hour).Format(time.RFC3339),
				}},
				Source: nws.SourceStatus{
					Authority:   "NOAA National Weather Service",
					RetrievedAt: now, FreshUntil: now.Add(5 * time.Minute), Status: "fresh",
				},
			}, now)
			if len(triggers) != 1 || triggers[0].PlanningState != test.state {
				t.Fatalf("unexpected trigger: %#v", triggers)
			}
			if triggers[0].LegalOrderStatus != "not_an_evacuation_order" ||
				triggers[0].Facts.ResponseType != "Evacuate" {
				t.Fatalf("CAP response type became an order: %#v", triggers[0])
			}
		})
	}
}

func TestPTWCLevelsAndExpirationNeverBecomeAllClearOrOrder(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 27, 8, 0, 0, 0, time.UTC)
	for _, test := range []struct {
		level string
		state string
	}{
		{level: "information", state: "monitor"},
		{level: "watch", state: "prepare"},
		{level: "advisory", state: "prepare"},
		{level: "warning", state: "official_warning"},
	} {
		t.Run(test.level, func(t *testing.T) {
			trigger := normalizePTWC(ptwc.Snapshot{
				Product: ptwc.Product{
					Identifier: "one", Event: "Tsunami " + test.level,
					ActionLevel: test.level, ResponseType: "Evacuate",
					Expires: now.Add(time.Hour).Format(time.RFC3339),
				},
				Source: ptwc.SourceStatus{
					Authority:   "NOAA Pacific Tsunami Warning Center",
					RetrievedAt: now, FreshUntil: now.Add(time.Minute), Status: "fresh",
				},
			}, now)
			if trigger.PlanningState != test.state ||
				trigger.LegalOrderStatus != "not_an_evacuation_order" {
				t.Fatalf("unexpected trigger: %#v", trigger)
			}
		})
	}

	expired := normalizePTWC(ptwc.Snapshot{
		Product: ptwc.Product{
			Identifier: "expired", Event: "Tsunami Warning", ActionLevel: "warning",
			Expires: now.Add(-time.Second).Format(time.RFC3339),
		},
		Source: ptwc.SourceStatus{
			Authority:   "NOAA Pacific Tsunami Warning Center",
			RetrievedAt: now, FreshUntil: now.Add(time.Minute), Status: "fresh",
		},
	}, now)
	if expired.Lifecycle != "expired" ||
		expired.PlanningState != "monitor" ||
		expired.PlanningConsequence == "" {
		t.Fatalf("expiration looked like all-clear: %#v", expired)
	}
}

func TestComCatTsunamiFlagNeverBecomesLocalOrder(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 27, 8, 0, 0, 0, time.UTC)
	for _, tsunami := range []bool{true, false} {
		triggers := normalizeComCat(usgs.Snapshot{
			Events: []usgs.Event{{
				ID: "one", Title: "Earthquake", Time: now.Add(-time.Hour).Format(time.RFC3339),
				Magnitude: 6.8, Type: "earthquake", Tsunami: tsunami,
			}},
			Source: usgs.SourceStatus{
				Authority: "U.S. Geological Survey", RetrievedAt: now,
				FreshUntil: now.Add(2 * time.Minute), Status: "fresh",
			},
		}, now)
		if len(triggers) != 1 ||
			triggers[0].LegalOrderStatus != "not_an_evacuation_order" ||
			triggers[0].Facts.TsunamiFlag == nil ||
			*triggers[0].Facts.TsunamiFlag != tsunami {
			t.Fatalf("unexpected ComCat normalization: %#v", triggers)
		}
	}
}

func TestSnapshotIncludesHANSAndCountyUnavailable(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 27, 8, 0, 0, 0, time.UTC)
	service := NewService(Config{
		NWS: nwsStub{snapshot: nws.Snapshot{Source: nws.SourceStatus{Status: "fresh"}}},
		PTWC: ptwcStub{snapshot: ptwc.Snapshot{
			Product: ptwc.Product{Event: "Tsunami Information"},
			Source:  ptwc.SourceStatus{Status: "fresh"},
		}},
		ComCat: comCatStub{snapshot: usgs.Snapshot{Source: usgs.SourceStatus{Status: "fresh"}}},
		HANS: hansStub{snapshot: hans.Snapshot{
			Authority: "USGS HVO", Status: "unavailable", RetrievedAt: now,
			Limitation: "No stable public machine contract.", OfficialURL: "https://volcanoes.usgs.gov/hans-public/",
		}},
		Now: func() time.Time { return now },
	})
	snapshot, err := service.Snapshot(context.Background())
	if err != nil {
		t.Fatalf("Snapshot returned error: %v", err)
	}
	if snapshot.CountyOrderNotice != CountyUnavailable ||
		snapshot.UnavailableMeaning != UnavailableNotNoOrder {
		t.Fatalf("missing county unavailable contract: %#v", snapshot)
	}
	foundHANS := false
	foundCounty := false
	for _, trigger := range snapshot.Triggers {
		if trigger.Source == "usgs_hans" {
			foundHANS = trigger.Lifecycle == "unavailable" &&
				trigger.PlanningState == "unavailable"
		}
		if trigger.Source == "county_order" {
			foundCounty = trigger.LegalOrderStatus == "unavailable"
		}
	}
	if !foundHANS || !foundCounty {
		t.Fatalf("missing unavailable triggers: %#v", snapshot.Triggers)
	}
}

func TestAllOperationalSourceFailuresFailClosed(t *testing.T) {
	t.Parallel()
	failure := errors.New("source down")
	service := NewService(Config{
		NWS: nwsStub{err: failure}, PTWC: ptwcStub{err: failure},
		ComCat: comCatStub{err: failure},
		HANS:   hansStub{snapshot: hans.Snapshot{Status: "unavailable"}},
	})
	if _, err := service.Snapshot(context.Background()); !errors.Is(err, ErrNoOperationalSources) {
		t.Fatalf("expected ErrNoOperationalSources, got %v", err)
	}
}

func TestSourceSpecificFreshStaleAndExpiredBoundaries(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 27, 8, 0, 0, 0, time.UTC)
	if got := lifecycle(now.Add(time.Second).Format(time.RFC3339), "fresh", now); got != "active" {
		t.Fatalf("expected active before expiry, got %q", got)
	}
	if got := lifecycle(now.Add(time.Hour).Format(time.RFC3339), "stale", now); got != "stale" {
		t.Fatalf("expected stale source, got %q", got)
	}
	if got := lifecycle(now.Format(time.RFC3339), "fresh", now); got != "expired" {
		t.Fatalf("expected expired at boundary, got %q", got)
	}
}
