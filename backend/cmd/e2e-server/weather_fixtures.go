package main

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/geoapplicability"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/nws"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/ptwc"
)

const weatherFixtureHeader = "X-NWS-Fixture"

func textPointer(value string) *string { return &value }

func fixtureNWSProduct(now time.Time) nws.Product {
	at := func(minutes int) *string {
		return textPointer(now.Add(time.Duration(minutes) * time.Minute).Format(time.RFC3339))
	}
	return nws.Product{
		ID: textPointer("fixture-nws-advisory"), URL: textPointer("https://api.weather.gov/alerts/fixture-nws-advisory"),
		Sender: textPointer("w-nws.webmaster@noaa.gov"), SenderName: textPointer("NWS Honolulu"),
		Sent: at(-20), Effective: at(-10), Onset: at(-5), Expires: at(2), Ends: at(5),
		Status: textPointer("Actual"), Scope: textPointer("Public"), MessageType: textPointer("Alert"),
		Event: textPointer("Flood Advisory"), Headline: textPointer("Fixture Flood Advisory"),
		Severity: textPointer("Minor"), Certainty: textPointer("Likely"), Urgency: textPointer("Expected"),
		Response: textPointer("Evacuate"), AreaDesc: textPointer("Honolulu County"),
		References: []nws.Reference{
			{URL: textPointer("https://api.weather.gov/alerts/previous-b"), Identifier: textPointer("previous-b"), Sender: textPointer("source-b"), Sent: at(-40)},
			{URL: textPointer("https://api.weather.gov/alerts/previous-a"), Identifier: textPointer("previous-a"), Sender: textPointer("source-a"), Sent: at(-60)},
		},
		AffectedZones: []nws.Zone{{URL: "https://api.weather.gov/zones/forecast/HIZ001", ID: "HIZ001", Type: "forecast"}},
		Geocode:       nws.Geocode{UGC: []string{"HIZ001"}, SAME: []string{"015003"}},
		Geometry:      fixtureGeometry(`[[[-158.3,21.4],[-158.1,21.4],[-158.1,21.5],[-158.3,21.5],[-158.3,21.4]]]`),
	}
}

func fixtureGeometry(coordinates string) nws.Geometry {
	return nws.Geometry{
		Status: "valid", Type: textPointer("Polygon"),
		Shape: json.RawMessage(`{"type":"Polygon","coordinates":` + coordinates + `}`),
	}
}

func fixtureMultiGeometry(coordinates string) nws.Geometry {
	return nws.Geometry{
		Status: "valid", Type: textPointer("MultiPolygon"),
		Shape: json.RawMessage(`{"type":"MultiPolygon","coordinates":` + coordinates + `}`),
	}
}

type weatherFixture struct{ mode string }
type weatherZoneFixture struct{ mode string }

func (fixture weatherZoneFixture) EvaluateZones(
	zones []nws.Zone,
	_ *string,
	_ geoapplicability.Point,
) nws.ZoneApplicability {
	revision := strings.Repeat("a", 64)
	effective := "2026-01-01T00:00:00Z"
	expires := "2200-01-01T00:00:00Z"
	retrieved := "2026-10-30T17:55:00Z"
	freshUntil := "2026-10-31T17:55:00Z"
	members := make([]nws.ZoneEvidence, len(zones))
	for index, zone := range zones {
		members[index] = nws.ZoneEvidence{
			URL: zone.URL, ID: zone.ID, Type: zone.Type,
			SourceRevision: &revision, Effective: &effective, Expires: &expires,
			RetrievedAt: &retrieved, FreshUntil: &freshUntil, State: "fresh",
			Result: "outside", Reason: "strict_exterior",
		}
	}
	switch fixture.mode {
	case "zone-inside", "zone-cancel":
		members[0].Result, members[0].Reason = "inside", "strict_interior"
		return nws.ZoneApplicability{
			Result: "inside", Reason: "strict_interior", Coverage: "complete", Zones: members,
		}
	case "zone-boundary":
		members[0].Result, members[0].Reason = "unknown", "boundary"
		return nws.ZoneApplicability{
			Result: "unknown", Reason: "boundary", Coverage: "complete", Zones: members,
		}
	case "zone-partial":
		members[1].SourceRevision = nil
		members[1].State, members[1].Result, members[1].Reason = "unavailable", "unknown", "http_503"
		return nws.ZoneApplicability{
			Result: "unknown", Reason: "zone_incomplete", Coverage: "partial", Zones: members,
		}
	case "zone-invalid":
		members[0].SourceRevision = nil
		members[0].State, members[0].Result, members[0].Reason = "unavailable", "unknown", "invalid_payload"
		return nws.ZoneApplicability{
			Result: "unknown", Reason: "zone_incomplete", Coverage: "partial", Zones: members,
		}
	case "zone-stale":
		members[0].State, members[0].Result, members[0].Reason = "stale", "unknown", "request_failed"
		return nws.ZoneApplicability{
			Result: "unknown", Reason: "zone_incomplete", Coverage: "partial", Zones: members,
		}
	case "zone-pending":
		members[0].SourceRevision = nil
		members[0].State, members[0].Result, members[0].Reason = "pending", "unknown", "zone_pending"
		return nws.ZoneApplicability{
			Result: "unknown", Reason: "zone_pending", Coverage: "pending", Zones: members,
		}
	default:
		return nws.ZoneApplicability{
			Result: "outside", Reason: "strict_exterior", Coverage: "complete", Zones: members,
		}
	}
}

func (weatherFixture) LatestProduct(context.Context) (ptwc.Snapshot, error) {
	return ptwc.Snapshot{}, errors.New("fixture unrelated PTWC failure")
}

func (fixture weatherFixture) ActiveAlerts(context.Context) (nws.Snapshot, error) {
	now := time.Date(2026, 10, 30, 18, 0, 0, 0, time.UTC)
	product := fixtureNWSProduct(now)
	source := nws.SourceStatus{
		ID: "nws-hi-alerts", Authority: "NOAA National Weather Service",
		URL: "https://api.weather.gov/alerts/active?area=HI", RetrievedAt: now,
		FreshUntil: now.Add(5 * time.Minute), Status: "fresh",
	}
	var warnings []string
	switch fixture.mode {
	case "unavailable":
		return nws.Snapshot{}, errors.New("fixture NWS source unavailable")
	case "empty":
		return nws.Snapshot{Alerts: []nws.Alert{}, Source: source}, nil
	case "changed":
		product.Headline = textPointer("Fixture same-ID revised report")
	case "cancel", "update", "ack", "error":
		messages := map[string]string{"cancel": "Cancel", "update": "Update", "ack": "Ack", "error": "Error"}
		product.MessageType = textPointer(messages[fixture.mode])
		if fixture.mode == "update" {
			product.Geometry = fixtureGeometry(`[[[-158.3,21.4],[-158.25,21.4],[-158.25,21.5],[-158.3,21.5],[-158.3,21.4]]]`)
		}
	case "test", "exercise", "draft", "system":
		statuses := map[string]string{"test": "Test", "exercise": "Exercise", "draft": "Draft", "system": "System"}
		product.Status = textPointer(statuses[fixture.mode])
	case "expired":
		product.Expires = textPointer(now.Add(-time.Minute).Format(time.RFC3339))
	case "null-times":
		product.Onset, product.Ends = nil, nil
	case "missing":
		product.Sent = nil
	case "no-polygon":
		product.Geometry = nws.Geometry{Status: "absent"}
	case "zone-inside", "zone-outside", "zone-boundary", "zone-invalid", "zone-stale", "zone-pending":
		product.Geometry = nws.Geometry{Status: "absent"}
	case "zone-partial":
		product.Geometry = nws.Geometry{Status: "absent"}
		product.AffectedZones = append(product.AffectedZones, nws.Zone{
			URL: "https://api.weather.gov/zones/forecast/HIZ007",
			ID:  "HIZ007", Type: "forecast",
		})
	case "zone-update":
		product.Geometry = nws.Geometry{Status: "absent"}
		product.MessageType = textPointer("Update")
		product.AffectedZones = []nws.Zone{{
			URL: "https://api.weather.gov/zones/forecast/HIZ007",
			ID:  "HIZ007", Type: "forecast",
		}}
	case "zone-cancel":
		product.Geometry = nws.Geometry{Status: "absent"}
		product.MessageType = textPointer("Cancel")
	case "invalid-geometry":
		product.Geometry = nws.Geometry{Status: "invalid", Type: textPointer("Polygon")}
	case "topology-invalid":
		product.Geometry = fixtureMultiGeometry(`[
			[[[-158.3,21.4],[-158.1,21.4],[-158.1,21.5],[-158.3,21.5],[-158.3,21.4]]],
			[[[-158.2,21.4],[-158.1,21.45],[-158.2,21.5],[-158.3,21.45],[-158.2,21.4]]]
		]`)
	case "stale":
		source.RetrievedAt = now.Add(-10 * time.Minute)
		source.FreshUntil = now.Add(-5 * time.Minute)
		source.Status = "stale"
	case "partial":
		warnings = []string{"fixture NWS query incomplete"}
	}
	return nws.Snapshot{
		Alerts: []nws.Alert{{Hazard: "flood", Product: product}},
		Source: source, Warnings: warnings,
	}, nil
}
