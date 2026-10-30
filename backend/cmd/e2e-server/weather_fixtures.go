package main

import (
	"context"
	"encoding/json"
	"errors"
	"time"

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
