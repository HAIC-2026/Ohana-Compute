package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/eventtriggers"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/geoapplicability"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/hans"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/nws"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/operationalstatus"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/ptwc"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/usgs"
)

func evidenceString(value string) *string { return &value }

type zoneApplicabilityStub struct {
	result nws.ZoneApplicability
	calls  int
}

type zoneRewriteTransport struct {
	target *url.URL
}

func (transport zoneRewriteTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	copy := request.Clone(request.Context())
	copy.URL.Scheme = transport.target.Scheme
	copy.URL.Host = transport.target.Host
	copy.Host = request.URL.Host
	return http.DefaultTransport.RoundTrip(copy)
}

type unavailablePTWC struct{}

func (unavailablePTWC) LatestProduct(context.Context) (ptwc.Snapshot, error) {
	return ptwc.Snapshot{}, errors.New("unavailable")
}

type unavailableComCat struct{}

func (unavailableComCat) RecentEvents(context.Context) (usgs.Snapshot, error) {
	return usgs.Snapshot{}, errors.New("unavailable")
}

type unavailableHANS struct{}

func (unavailableHANS) Snapshot(context.Context) (hans.Snapshot, error) {
	return hans.Snapshot{}, errors.New("unavailable")
}

func (stub *zoneApplicabilityStub) EvaluateZones(
	_ []nws.Zone,
	_ *string,
	_ geoapplicability.Point,
) nws.ZoneApplicability {
	stub.calls++
	return stub.result
}

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
		Applicability: "unknown", ApplicabilityReason: "not_evaluated",
		Eligibility: "eligible", Validity: "current", Relationship: "update",
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
		operationalStatusReaderStub{snapshot: operations}, 21.45, -158.19,
		geoapplicability.Point{Longitude: "-158.19", Latitude: "21.45"}, now,
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

func TestLifecycleEvidenceEvaluatesRequestCopyOnly(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 29, 20, 0, 0, 0, time.UTC)
	events, operations := nwsEvidenceFixtures(now)
	kind := "Polygon"
	events.Triggers[0].NWSProduct.Geometry = nws.Geometry{
		Status: "valid", Type: &kind,
		Shape: json.RawMessage(`{"type":"Polygon","coordinates":[[[-159,21],[-158,21],[-158,22],[-159,22],[-159,21]]]}`),
	}
	handler := lifecycleEvidenceHandler(
		slog.New(slog.NewTextHandler(io.Discard, nil)), nil,
		eventTriggerReaderStub{snapshot: events}, operationalStatusReaderStub{snapshot: operations},
		func() time.Time { return now },
	)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(
		http.MethodGet,
		"/api/v1/lifecycle/evidence?lat=21.45&lon=-158.19",
		nil,
	))
	if response.Code != http.StatusOK ||
		!containsAll(
			response.Body.String(),
			`"planning_location":{"point":["-158.19","21.45"],"algorithm_version":"rfc7946-planar-rational-v1"}`,
			`"applicability":"inside"`,
			`"applicability_reason":"strict_interior"`,
		) {
		t.Fatalf("lifecycle projection did not evaluate point: %d %s", response.Code, response.Body.String())
	}
	if events.Triggers[0].NWSProduct.Applicability != "unknown" ||
		events.Triggers[0].NWSProduct.ApplicabilityReason != "not_evaluated" {
		t.Fatalf("request mutated shared event snapshot: %#v", events.Triggers[0].NWSProduct)
	}
	outside := httptest.NewRecorder()
	handler.ServeHTTP(outside, httptest.NewRequest(
		http.MethodGet,
		"/api/v1/lifecycle/evidence?lat=20&lon=-158.19",
		nil,
	))
	if outside.Code != http.StatusOK ||
		!containsAll(outside.Body.String(), `"applicability":"outside"`, `"applicability_reason":"strict_exterior"`) ||
		response.Header().Get("ETag") == outside.Header().Get("ETag") {
		t.Fatalf("point/result did not affect projection and semantic hash: %d %s", outside.Code, outside.Body.String())
	}
}

func TestLifecycleEvidenceBindsExactPointLexemes(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 29, 20, 0, 0, 0, time.UTC)
	events, operations := nwsEvidenceFixtures(now)
	kind := "Polygon"
	events.Triggers[0].NWSProduct.Geometry = nws.Geometry{
		Status: "valid", Type: &kind,
		Shape: json.RawMessage(`{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}`),
	}

	handler := lifecycleEvidenceHandler(
		slog.New(slog.NewTextHandler(io.Discard, nil)), nil,
		eventTriggerReaderStub{snapshot: events}, operationalStatusReaderStub{snapshot: operations},
		func() time.Time { return now },
	)
	request := func(longitude string) *httptest.ResponseRecorder {
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(
			http.MethodGet,
			"/api/v1/lifecycle/evidence?lat=0.5&lon="+longitude,
			nil,
		))
		return recorder
	}
	inside := request("0.9999999999999999999")
	boundary := request("1")
	if inside.Code != http.StatusOK || boundary.Code != http.StatusOK ||
		!containsAll(
			inside.Body.String(),
			`"point":["0.9999999999999999999","0.5"]`,
			`"applicability":"inside"`,
		) ||
		!containsAll(
			boundary.Body.String(),
			`"point":["1","0.5"]`,
			`"applicability":"unknown"`,
			`"applicability_reason":"boundary"`,
		) ||
		inside.Header().Get("ETag") == boundary.Header().Get("ETag") {
		t.Fatalf("exact request point was not preserved: inside=%s boundary=%s", inside.Body.String(), boundary.Body.String())
	}
}

func TestLifecycleEvidenceUsesBoundedZoneEvidenceOnlyForAbsentInlineGeometry(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 29, 20, 0, 0, 0, time.UTC)
	events, operations := nwsEvidenceFixtures(now)
	revision := strings.Repeat("a", 64)
	retrieved := "2026-10-29T19:55:00Z"
	freshUntil := "2026-10-30T19:55:00Z"
	effective := "2026-01-01T00:00:00Z"
	expires := "2200-01-01T00:00:00Z"
	zones := &zoneApplicabilityStub{result: nws.ZoneApplicability{
		Result: "inside", Reason: "strict_interior", Coverage: "partial",
		Zones: []nws.ZoneEvidence{{
			URL: "https://api.weather.gov/zones/forecast/HIZ006",
			ID:  "HIZ006", Type: "forecast", SourceRevision: &revision,
			Effective: &effective, Expires: &expires, RetrievedAt: &retrieved,
			FreshUntil: &freshUntil, State: "fresh", Result: "inside",
			Reason: "strict_interior",
		}},
	}}
	snapshot := loadLifecycleEvidence(
		context.Background(), context.Background(), eventTriggerReaderStub{snapshot: events},
		operationalStatusReaderStub{snapshot: operations}, 21.45, -158.19,
		geoapplicability.Point{Longitude: "-158.19", Latitude: "21.45"}, now, zones,
	)
	product := snapshot.EventTriggers.Data.Triggers[0].NWSProduct
	if zones.calls != 1 || product.Applicability != "inside" ||
		product.ApplicabilityBasis != "affected_zones" ||
		product.ZoneEvidence == nil || product.ZoneEvidence.Coverage != "partial" ||
		product.Geometry.Status != "absent" {
		t.Fatalf("zone-only applicability was not projected safely: %#v", product)
	}

	t.Run("integrates real zone client partial inside", func(t *testing.T) {
		now := time.Date(2026, 10, 30, 20, 0, 0, 0, time.UTC)
		zoneServer := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			if request.URL.Path == "/zones/forecast/HIZ007" {
				http.Error(writer, "unavailable", http.StatusServiceUnavailable)
				return
			}
			if request.URL.Path != "/zones/forecast/HIZ006" {
				http.NotFound(writer, request)
				return
			}
			writer.Header().Set("Content-Type", "application/geo+json")
			writer.Header().Set("Cache-Control", "max-age=3600")
			writer.Header().Set("ETag", `"zone-v1"`)
			_, _ = writer.Write([]byte(`{
				"type":"Feature",
				"id":"https://api.weather.gov/zones/forecast/HIZ006",
				"geometry":{"type":"Polygon","coordinates":[[[0,0],[2,0],[2,2],[0,2],[0,0]]]},
				"properties":{
					"@id":"https://api.weather.gov/zones/forecast/HIZ006",
					"id":"HIZ006","type":"public",
					"effectiveDate":"2026-01-01T00:00:00Z",
					"expirationDate":"2200-01-01T00:00:00Z"
				}
			}`))
		}))
		defer zoneServer.Close()
		target, err := url.Parse(zoneServer.URL)
		if err != nil {
			t.Fatal(err)
		}
		zoneClient := nws.NewZoneClient(nws.ZoneConfig{
			HTTPClient: &http.Client{Transport: zoneRewriteTransport{target: target}},
			CacheTTL:   time.Hour, Now: func() time.Time { return now },
		})
		alertServer := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
			writer.Header().Set("Content-Type", "application/geo+json")
			_, _ = writer.Write([]byte(`{
				"updated":"2026-10-30T19:55:00Z",
				"features":[{
					"id":"https://api.weather.gov/alerts/urn:oid:zone-real",
					"geometry":null,
					"properties":{
						"id":"urn:oid:zone-real",
						"sender":"w-nws.webmaster@noaa.gov",
						"senderName":"NWS Honolulu",
						"sent":"2026-10-30T19:00:00Z",
						"effective":"2026-10-30T19:00:00Z",
						"expires":"2026-10-30T21:00:00Z",
						"status":"Actual","messageType":"Alert","scope":"Public",
						"event":"Flood Warning","headline":"Real zone integration fixture",
						"severity":"Severe","certainty":"Likely","urgency":"Immediate",
						"response":"Evacuate","areaDesc":"Source-reported area",
						"affectedZones":[
							"https://api.weather.gov/zones/forecast/HIZ006",
							"https://api.weather.gov/zones/forecast/HIZ007"
						]
					}
				}]
			}`))
		}))
		defer alertServer.Close()
		alertClient := nws.NewClient(nws.Config{
			AlertsURL: alertServer.URL, ZonePrefetcher: zoneClient,
			Now: func() time.Time { return now },
		})
		alerts, err := alertClient.ActiveAlerts(context.Background())
		if err != nil || len(alerts.Alerts) != 1 {
			t.Fatalf("real alert ingestion failed: %#v %v", alerts, err)
		}
		product := alerts.Alerts[0].Product
		deadline := time.Now().Add(2 * time.Second)
		for {
			evaluation := zoneClient.EvaluateZones(
				product.AffectedZones,
				product.Sent,
				geoapplicability.Point{Longitude: "1", Latitude: "1"},
			)
			if evaluation.Result == "inside" && evaluation.Coverage == "partial" {
				break
			}
			if time.Now().After(deadline) {
				t.Fatalf("real zone prefetch did not settle: %#v", evaluation)
			}
			time.Sleep(5 * time.Millisecond)
		}
		events := eventtriggers.NewService(eventtriggers.Config{
			NWS: alertClient, PTWC: unavailablePTWC{}, ComCat: unavailableComCat{},
			HANS: unavailableHANS{}, Now: func() time.Time { return now },
		})
		_, operations := lifecycleEvidenceFixtures(now)
		handler := lifecycleEvidenceHandler(
			slog.New(slog.NewTextHandler(io.Discard, nil)), nil,
			events, operationalStatusReaderStub{snapshot: operations},
			func() time.Time { return now }, zoneClient,
		)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(
			http.MethodGet,
			"/api/v1/lifecycle/evidence?lat=1&lon=1",
			nil,
		))
		if response.Code != http.StatusOK {
			t.Fatalf("lifecycle handler returned %d: %s", response.Code, response.Body.String())
		}
		var decoded lifecycleEvidenceSnapshot
		if err := json.Unmarshal(response.Body.Bytes(), &decoded); err != nil {
			t.Fatal(err)
		}
		if decoded.EventTriggers.Data == nil {
			t.Fatal("real event-trigger data missing")
		}
		var projected *eventtriggers.NWSProduct
		for _, trigger := range decoded.EventTriggers.Data.Triggers {
			if trigger.Source == "nws" {
				projected = trigger.NWSProduct
				break
			}
		}
		if projected == nil || projected.Applicability != "inside" ||
			projected.ApplicabilityBasis != "affected_zones" ||
			projected.ZoneEvidence == nil || projected.ZoneEvidence.Coverage != "partial" ||
			projected.ZoneEvidence.Reason != "strict_interior" ||
			len(projected.ZoneEvidence.Zones) != 2 {
			t.Fatalf("real zone lifecycle projection mismatch: %#v", projected)
		}
		inside, failed := projected.ZoneEvidence.Zones[0], projected.ZoneEvidence.Zones[1]
		if inside.URL != "https://api.weather.gov/zones/forecast/HIZ006" ||
			inside.State != "fresh" || inside.Result != "inside" ||
			inside.Reason != "strict_interior" || inside.SourceRevision == nil ||
			failed.URL != "https://api.weather.gov/zones/forecast/HIZ007" ||
			failed.State != "unavailable" || failed.Result != "unknown" ||
			failed.Reason != "http_503" || failed.SourceRevision != nil {
			t.Fatalf("real source rows were not preserved exactly: %#v", projected.ZoneEvidence.Zones)
		}
		encoded, err := json.Marshal(projected)
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(string(encoded), `"coordinates"`) ||
			!containsAll(
				string(encoded),
				`"applicability_basis":"affected_zones"`,
				`"coverage":"partial"`,
				`"reason":"http_503"`,
			) {
			t.Fatalf("browser/runtime shape leaked geometry or lost reason fields: %s", encoded)
		}
	})
	body, err := json.Marshal(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if !containsAll(
		string(body),
		`"applicability_basis":"affected_zones"`,
		`"zone_evidence":{"result":"inside","reason":"strict_interior","coverage":"partial"`,
		`"source_revision":"`+revision+`"`,
	) || strings.Contains(string(body), `"coordinates"`) {
		t.Fatalf("zone geometry escaped or evidence was omitted: %s", body)
	}
}

func TestLifecycleEvidenceInlineGeometryPrecedesAffectedZones(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 29, 20, 0, 0, 0, time.UTC)
	events, operations := nwsEvidenceFixtures(now)
	kind := "Polygon"
	events.Triggers[0].NWSProduct.Geometry = nws.Geometry{
		Status: "valid", Type: &kind,
		Shape: json.RawMessage(`{"type":"Polygon","coordinates":[[[-159,21],[-158,21],[-158,22],[-159,22],[-159,21]]]}`),
	}
	zones := &zoneApplicabilityStub{result: nws.ZoneApplicability{
		Result: "outside", Reason: "strict_exterior", Coverage: "complete",
	}}
	snapshot := loadLifecycleEvidence(
		context.Background(), context.Background(), eventTriggerReaderStub{snapshot: events},
		operationalStatusReaderStub{snapshot: operations}, 21.45, -158.19,
		geoapplicability.Point{Longitude: "-158.19", Latitude: "21.45"}, now, zones,
	)
	product := snapshot.EventTriggers.Data.Triggers[0].NWSProduct
	if zones.calls != 0 || product.Applicability != "inside" ||
		product.ApplicabilityBasis != "inline_geometry" || product.ZoneEvidence != nil {
		t.Fatalf("affected zones overrode retained inline geometry: %#v", product)
	}
}

func TestLifecycleEvidenceZoneRevisionChangesSemanticSnapshot(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 29, 20, 0, 0, 0, time.UTC)
	events, operations := nwsEvidenceFixtures(now)
	snapshotFor := func(revision string) lifecycleEvidenceSnapshot {
		zones := &zoneApplicabilityStub{result: nws.ZoneApplicability{
			Result: "outside", Reason: "strict_exterior", Coverage: "complete",
			Zones: []nws.ZoneEvidence{{
				URL: "https://api.weather.gov/zones/forecast/HIZ006",
				ID:  "HIZ006", Type: "forecast", SourceRevision: &revision,
				State: "fresh", Result: "outside", Reason: "strict_exterior",
			}},
		}}
		return loadLifecycleEvidence(
			context.Background(), context.Background(), eventTriggerReaderStub{snapshot: events},
			operationalStatusReaderStub{snapshot: operations}, 21.45, -158.19,
			geoapplicability.Point{Longitude: "-158.19", Latitude: "21.45"}, now, zones,
		)
	}
	if left, right := snapshotFor(strings.Repeat("a", 64)), snapshotFor(strings.Repeat("b", 64)); left.SnapshotID == right.SnapshotID {
		t.Fatal("zone source revision did not affect semantic snapshot identity")
	}
}
