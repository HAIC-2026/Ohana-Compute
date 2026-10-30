package api

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/eventtriggers"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/nws"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/operationalstatus"
)

func evidenceString(value string) *string { return &value }

func nwsEvidenceFixtures(now time.Time) (eventtriggers.Snapshot, operationalstatus.Snapshot) {
	events, operations := lifecycleEvidenceFixtures(now)
	events.Triggers[0].NWSProduct = &eventtriggers.NWSProduct{
		Product: nws.Product{
			ID: evidenceString("urn:oid:one"), URL: evidenceString("https://api.weather.gov/alerts/urn:oid:one"),
			Sender: evidenceString("w-nws.webmaster@noaa.gov"), SenderName: evidenceString("NWS Honolulu"),
			Sent: evidenceString("2026-10-29T18:00:00Z"), Effective: evidenceString("2026-10-29T19:00:00Z"),
			Expires: evidenceString("2026-10-29T21:00:00Z"), Status: evidenceString("Actual"),
			Scope: evidenceString("Public"), MessageType: evidenceString("Update"),
			Event: evidenceString("Flood Warning"), Headline: evidenceString("Source headline"),
			AreaDesc: evidenceString("Honolulu"), Geometry: nws.Geometry{Status: "absent"},
			References: []nws.Reference{{
				URL:        evidenceString("https://api.weather.gov/alerts/urn:oid:previous"),
				Identifier: evidenceString("urn:oid:previous"), Sender: evidenceString("w-nws.webmaster@noaa.gov"),
				Sent: evidenceString("2026-10-29T17:00:00Z"),
			}},
			AffectedZones: []nws.Zone{{URL: "https://api.weather.gov/zones/forecast/HIZ006", ID: "HIZ006", Type: "forecast"}},
		},
		QueryScope: eventtriggers.NWSQueryScope{
			Area: "HI", Coverage: "statewide", URL: "https://api.weather.gov/alerts/active?area=HI",
		},
		Applicability: "unknown", Eligibility: "eligible", Validity: "current", Relationship: "update",
	}
	return events, operations
}

func TestLifecycleEvidenceRetainsNWSProductAndIndependentRetrieval(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 29, 20, 0, 0, 0, time.UTC)
	events, operations := nwsEvidenceFixtures(now)
	events.Status = "partial"
	events.SourceErrors = []eventtriggers.SourceError{{Source: "ptwc", Error: "unavailable"}}
	events.SourceStates = append(events.SourceStates, eventtriggers.SourceState{
		ID: "ptwc-cap", Status: "stale", RetrievedAt: now.Add(-time.Hour), FreshUntil: now.Add(-time.Minute),
	})
	snapshot := loadLifecycleEvidence(
		context.Background(), context.Background(), eventTriggerReaderStub{snapshot: events},
		operationalStatusReaderStub{snapshot: operations}, 21.45, -158.19, now,
	)
	body, err := json.Marshal(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if !containsAll(string(body), `"nws_product":`, `"sent":"2026-10-29T18:00:00Z"`,
		`"effective":"2026-10-29T19:00:00Z"`, `"onset":null`, `"expires":"2026-10-29T21:00:00Z"`,
		`"ends":null`, `"scope":"Public"`, `"area_desc":"Honolulu"`, `"applicability":"unknown"`,
		`"validity":"current"`, `"identifier":"urn:oid:previous"`, `"coverage":"statewide"`) {
		t.Fatalf("read-only projection stripped or substituted source facts: %s", body)
	}
	if snapshot.EventTriggers.State != "stale" ||
		snapshot.EventTriggers.Data.SourceStates[0].Status != "fresh" ||
		snapshot.EventTriggers.Data.Triggers[0].NWSProduct.Validity != "current" {
		t.Fatalf("aggregate staleness contaminated specific NWS facts: %#v", snapshot.EventTriggers)
	}
	if snapshot.EventTriggers.Data.SourceStates[0].RetrievedAt != events.SourceStates[0].RetrievedAt {
		t.Fatal("projection changed source observation time")
	}
}

func TestLifecycleEvidenceETagChangesForSameIDNWSFacts(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 29, 20, 0, 0, 0, time.UTC)
	cases := []struct {
		name   string
		change func(*eventtriggers.NWSProduct)
	}{
		{"sender", func(p *eventtriggers.NWSProduct) { p.Sender = evidenceString("new@noaa.gov") }},
		{"sender name", func(p *eventtriggers.NWSProduct) { p.SenderName = evidenceString("New source name") }},
		{"sent", func(p *eventtriggers.NWSProduct) { p.Sent = evidenceString("2026-10-29T18:01:00Z") }},
		{"effective", func(p *eventtriggers.NWSProduct) { p.Effective = evidenceString("2026-10-29T19:01:00Z") }},
		{"onset", func(p *eventtriggers.NWSProduct) { p.Onset = evidenceString("2026-10-29T20:01:00Z") }},
		{"expires", func(p *eventtriggers.NWSProduct) { p.Expires = evidenceString("2026-10-29T22:00:00Z") }},
		{"ends", func(p *eventtriggers.NWSProduct) { p.Ends = evidenceString("2026-10-29T23:00:00Z") }},
		{"status", func(p *eventtriggers.NWSProduct) { p.Status = evidenceString("Exercise") }},
		{"scope", func(p *eventtriggers.NWSProduct) { p.Scope = evidenceString("Restricted") }},
		{"message type", func(p *eventtriggers.NWSProduct) { p.MessageType = evidenceString("Cancel") }},
		{"headline", func(p *eventtriggers.NWSProduct) { p.Headline = evidenceString("Changed headline, same identifier") }},
		{"area", func(p *eventtriggers.NWSProduct) { p.AreaDesc = evidenceString("Kauai") }},
		{"reference", func(p *eventtriggers.NWSProduct) { p.References[0].Identifier = evidenceString("urn:oid:other") }},
		{"zone", func(p *eventtriggers.NWSProduct) { p.AffectedZones[0].ID = "HIZ007" }},
		{"validity", func(p *eventtriggers.NWSProduct) { p.Validity = "expired" }},
		{"geometry", func(p *eventtriggers.NWSProduct) {
			p.Geometry = nws.Geometry{
				Status: "valid", Type: evidenceString("Polygon"),
				Shape: json.RawMessage(`{"type":"Polygon","coordinates":[[[-158,21],[-157,21],[-157,22],[-158,21]]]}`),
			}
		}},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			events, operations := nwsEvidenceFixtures(now)
			handler := func() http.HandlerFunc {
				return lifecycleEvidenceHandler(
					slog.New(slog.NewTextHandler(io.Discard, nil)), nil,
					eventTriggerReaderStub{snapshot: events}, operationalStatusReaderStub{snapshot: operations},
					func() time.Time { return now },
				)
			}
			first := httptest.NewRecorder()
			handler().ServeHTTP(first, httptest.NewRequest(http.MethodGet, "/api/v1/lifecycle/evidence?lat=21.45&lon=-158.19", nil))
			test.change(events.Triggers[0].NWSProduct)
			changed := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, "/api/v1/lifecycle/evidence?lat=21.45&lon=-158.19", nil)
			request.Header.Set("If-None-Match", first.Header().Get("ETag"))
			handler().ServeHTTP(changed, request)
			if first.Code != http.StatusOK || changed.Code != http.StatusOK ||
				first.Header().Get("ETag") == changed.Header().Get("ETag") ||
				!strings.Contains(changed.Body.String(), `"id":"urn:oid:one"`) {
				t.Fatalf("changed same-ID source facts reused ETag: first=%d changed=%d %s", first.Code, changed.Code, changed.Body.String())
			}
		})
	}
}
