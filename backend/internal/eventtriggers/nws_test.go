package eventtriggers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/hans"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/nws"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/ptwc"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/usgs"
)

func nwsPointer(value string) *string { return &value }

type nwsReaderFunc func(context.Context) (nws.Snapshot, error)

func (reader nwsReaderFunc) ActiveAlerts(ctx context.Context) (nws.Snapshot, error) {
	return reader(ctx)
}

func TestNWSValidityUsesCompletedLookupWallTime(t *testing.T) {
	t.Parallel()
	start := time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)
	for _, test := range []struct {
		name      string
		delay     time.Duration
		lifecycle string
	}{
		{"new retrieval is not future dated", time.Second, "active"},
		{"product expires during lookup", 2 * time.Hour, "expired"},
	} {
		t.Run(test.name, func(t *testing.T) {
			var wall atomic.Int64
			wall.Store(start.UnixNano())
			end := start.Add(test.delay)
			service := NewService(Config{
				NWS: nwsReaderFunc(func(context.Context) (nws.Snapshot, error) {
					wall.Store(end.UnixNano())
					return nwsTestSnapshot(validNWSProduct(start), end), nil
				}),
				PTWC: ptwcStub{}, ComCat: comCatStub{}, HANS: hansStub{},
				Now: func() time.Time { return time.Unix(0, wall.Load()) },
			})
			result, err := service.Snapshot(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			for _, trigger := range result.Triggers {
				if trigger.Source == "nws" && (trigger.Lifecycle != test.lifecycle || !result.GeneratedAt.Equal(end)) {
					t.Fatalf("evaluated source before lookup completed: lifecycle=%s generated=%s retrieved=%s", trigger.Lifecycle, result.GeneratedAt, trigger.Provenance.RetrievedAt)
				}
			}
		})
	}
}

func validNWSProduct(now time.Time) nws.Product {
	return nws.Product{
		ID: nwsPointer("urn:oid:one"), URL: nwsPointer("https://api.weather.gov/alerts/urn:oid:one"),
		Sender: nwsPointer("w-nws.webmaster@noaa.gov"), SenderName: nwsPointer("NWS Honolulu"),
		Sent: nwsPointer(now.Add(-3 * time.Hour).Format(time.RFC3339)), Effective: nwsPointer(now.Add(-2 * time.Hour).Format(time.RFC3339)),
		Onset: nwsPointer(now.Add(-time.Hour).Format(time.RFC3339)), Expires: nwsPointer(now.Add(time.Hour).Format(time.RFC3339)),
		Ends:   nwsPointer(now.Add(2 * time.Hour).Format(time.RFC3339)),
		Status: nwsPointer("Actual"), MessageType: nwsPointer("Alert"), Scope: nwsPointer("Public"),
		Event: nwsPointer("Flood Warning"), Headline: nwsPointer("Flood Warning"),
		AreaDesc: nwsPointer("Honolulu; Kauai"),
		Geometry: nws.Geometry{Status: "absent"},
	}
}

func nwsTestSnapshot(product nws.Product, now time.Time) nws.Snapshot {
	return nws.Snapshot{
		Alerts: []nws.Alert{{Hazard: "flood", Product: product}},
		Source: nws.SourceStatus{
			Authority: "NOAA National Weather Service", Status: "fresh",
			RetrievedAt: now, FreshUntil: now.Add(5 * time.Minute),
		},
	}
}

func TestNWSProvenanceRegression(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"features":[{
			"id":"https://api.weather.gov/alerts/urn:oid:one","geometry":null,
			"properties":{"id":"urn:oid:one","sent":"2026-10-30T09:00:00Z",
			"effective":"2026-10-30T10:00:00Z","onset":"2026-10-30T11:00:00Z",
			"expires":"2026-10-30T18:00:00Z","ends":null,
			"status":"Actual","messageType":"Cancel","scope":"Public",
			"event":"Flood Warning","headline":"Flood Warning","areaDesc":"Honolulu"}
		}]}`))
	}))
	defer server.Close()
	snapshot, err := nws.NewClient(nws.Config{
		AlertsURL: server.URL, Now: func() time.Time { return now },
	}).ActiveAlerts(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	trigger := normalizeNWS(snapshot, now)[0]
	if trigger.Provenance.IssuedAt != "2026-10-30T09:00:00Z" {
		t.Errorf("issued_at used something other than sent: %q", trigger.Provenance.IssuedAt)
	}
	if trigger.Lifecycle == "active" || trigger.PlanningState != "unavailable" {
		t.Errorf("cancellation with future expiry promoted a warning: %s/%s", trigger.Lifecycle, trigger.PlanningState)
	}
	if trigger.JurisdictionScope != "unknown" {
		t.Errorf("reported geography was invented: %q", trigger.JurisdictionScope)
	}
	body, _ := json.Marshal(trigger)
	var object map[string]json.RawMessage
	_ = json.Unmarshal(body, &object)
	if _, exists := object["nws_product"]; !exists {
		t.Error("normalized trigger discarded NWS source product facts")
	}
}

func TestNWSIndependentTimesAndNullsRoundTrip(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)
	for _, nullOptionalTimes := range []bool{false, true} {
		product := validNWSProduct(now)
		if nullOptionalTimes {
			product.Onset, product.Ends = nil, nil
		}
		trigger := normalizeNWS(nwsTestSnapshot(product, now), now)[0]
		encoded, err := json.Marshal(trigger)
		if err != nil {
			t.Fatal(err)
		}
		var decoded Trigger
		if err := json.Unmarshal(encoded, &decoded); err != nil {
			t.Fatal(err)
		}
		if decoded.NWSProduct == nil {
			t.Fatal("NWS product missing after round-trip")
		}
		expectedProduct, _ := json.Marshal(product)
		decodedProduct, _ := json.Marshal(decoded.NWSProduct.Product)
		if string(decodedProduct) != string(expectedProduct) ||
			decoded.Provenance.IssuedAt != *product.Sent || decoded.Provenance.EffectiveAt != *product.Effective ||
			decoded.Provenance.ExpiresAt != *product.Expires {
			t.Fatalf("independent source times lost: %s", encoded)
		}
		if nullOptionalTimes && (!strings.Contains(string(encoded), `"onset":null`) || !strings.Contains(string(encoded), `"ends":null`)) {
			t.Fatalf("optional nulls not explicit: %s", encoded)
		}
	}
}

func TestNWSMissingOrMalformedDecisionFieldsFailClosed(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)
	for _, field := range []string{"id", "url", "sent", "effective", "expires", "status", "message_type", "scope"} {
		for _, invalid := range []*string{nil, nwsPointer(""), nwsPointer("invalid")} {
			if (field == "id" || field == "url") && invalid != nil && *invalid == "invalid" {
				continue // URL/type bounds are exercised at ingestion.
			}
			t.Run(field+"/"+nwsValue(invalid), func(t *testing.T) {
				product := validNWSProduct(now)
				switch field {
				case "id":
					product.ID = invalid
				case "url":
					product.URL = invalid
				case "sent":
					product.Sent = invalid
				case "effective":
					product.Effective = invalid
				case "expires":
					product.Expires = invalid
				case "status":
					product.Status = invalid
				case "message_type":
					product.MessageType = invalid
				case "scope":
					product.Scope = invalid
				}
				trigger := normalizeNWS(nwsTestSnapshot(product, now), now)[0]
				if trigger.Lifecycle == "active" || trigger.PlanningState != "unavailable" {
					t.Fatalf("missing/malformed %s became active: %#v", field, trigger)
				}
				if field == "sent" && invalid == nil && trigger.Provenance.IssuedAt != "" {
					t.Fatalf("missing sent fell back to onset: %q", trigger.Provenance.IssuedAt)
				}
			})
		}
	}
}

func TestNWSMessageEligibilityNeverPromotedByEventText(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)
	cases := []struct {
		status, scope, message, eligibility, relationship, lifecycle string
	}{
		{"Actual", "Public", "Alert", "eligible", "initial", "active"},
		{"Actual", "Public", "Update", "eligible", "update", "active"},
		{"Actual", "Public", "Cancel", "cancellation", "cancel", "unavailable"},
		{"Actual", "Public", "Ack", "protocol", "acknowledgement", "unavailable"},
		{"Actual", "Public", "Error", "protocol", "error", "unavailable"},
		{"Test", "Public", "Alert", "non_actual", "initial", "unavailable"},
		{"Exercise", "Public", "Alert", "non_actual", "initial", "unavailable"},
		{"Draft", "Public", "Alert", "non_actual", "initial", "unavailable"},
		{"System", "Public", "Alert", "non_actual", "initial", "unavailable"},
		{"Actual", "Restricted", "Alert", "non_public", "initial", "unavailable"},
		{"Actual", "Private", "Alert", "non_public", "initial", "unavailable"},
		{"Actual", "", "Alert", "unknown", "initial", "unavailable"},
		{"Actual", "Public", "Warning", "unknown", "unknown", "unavailable"},
	}
	for _, test := range cases {
		t.Run(test.status+"/"+test.scope+"/"+test.message, func(t *testing.T) {
			for _, event := range []string{"Flood Warning", "Evacuation Order Warning AllClear", "Test Warning", ""} {
				product := validNWSProduct(now)
				product.Status, product.Scope, product.MessageType = &test.status, &test.scope, &test.message
				product.Event, product.Headline, product.Response = &event, &event, nwsPointer("AllClear")
				trigger := normalizeNWS(nwsTestSnapshot(product, now), now)[0]
				if trigger.NWSProduct.Eligibility != test.eligibility || trigger.NWSProduct.Relationship != test.relationship ||
					trigger.Lifecycle != test.lifecycle || trigger.LegalOrderStatus != "not_an_evacuation_order" ||
					(test.lifecycle != "active" && (trigger.PlanningState == "official_warning" || trigger.PlanningState == "prepare")) {
					t.Fatalf("event text promoted/changed message semantics: %#v", trigger)
				}
				if !strings.Contains(trigger.PlanningConsequence, "not an all-clear or restoration") {
					t.Fatalf("missing limitation: %s", trigger.PlanningConsequence)
				}
			}
		})
	}
}

func TestNWSValidityIndependentOfRetrievalAndEventTimes(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)
	cases := []struct {
		name, status, expires, effective, sent, validity, lifecycle string
	}{
		{"fresh expired", "fresh", "2026-10-30T12:00:00Z", "2026-10-30T10:00:00Z", "2026-10-30T09:00:00Z", "expired", "expired"},
		{"stale valid", "stale", "2026-10-30T13:00:00Z", "2026-10-30T10:00:00Z", "2026-10-30T09:00:00Z", "current", "stale"},
		{"stale expired", "stale", "2026-10-30T11:00:00Z", "2026-10-30T10:00:00Z", "2026-10-30T09:00:00Z", "expired", "expired"},
		{"future effective", "fresh", "2026-10-30T14:00:00Z", "2026-10-30T13:00:00Z", "2026-10-30T09:00:00Z", "not_yet_effective", "unavailable"},
		{"future sent", "fresh", "2026-10-30T14:00:00Z", "2026-10-30T10:00:00Z", "2026-10-30T13:00:00Z", "unknown", "unavailable"},
		{"bad expiry", "fresh", "later", "2026-10-30T10:00:00Z", "2026-10-30T09:00:00Z", "unknown", "unavailable"},
		{"inverted expiry", "fresh", "2026-10-30T09:00:00Z", "2026-10-30T10:00:00Z", "2026-10-30T09:00:00Z", "unknown", "unavailable"},
		{"invalid date", "fresh", "2026-02-30T14:00:00Z", "2026-10-30T10:00:00Z", "2026-10-30T09:00:00Z", "unknown", "unavailable"},
		{"invalid zone", "fresh", "2026-10-30T14:00:00+24:00", "2026-10-30T10:00:00Z", "2026-10-30T09:00:00Z", "unknown", "unavailable"},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			product := validNWSProduct(now)
			product.Sent, product.Effective, product.Expires = &test.sent, &test.effective, &test.expires
			// Event onset/end are not product-validity or retrieval clocks.
			product.Onset, product.Ends = nwsPointer("2026-10-31T12:00:00Z"), nwsPointer("2026-10-29T12:00:00Z")
			snapshot := nwsTestSnapshot(product, now)
			snapshot.Source.Status = test.status
			trigger := normalizeNWS(snapshot, now)[0]
			if trigger.NWSProduct.Validity != test.validity || trigger.Lifecycle != test.lifecycle ||
				trigger.Provenance.SourceStatus != test.status ||
				trigger.PlanningState == "official_warning" || trigger.PlanningState == "prepare" {
				t.Fatalf("product validity/retrieval conflated: %#v", trigger)
			}
		})
	}
}

func TestNWSLegacyDisplayLabelsDoNotFabricateSourceFacts(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)
	for _, test := range []struct {
		name, headline, event string
	}{
		{name: "both missing"},
		{name: "only event", event: "Flood Advisory"},
		{name: "only headline", headline: "Reported source headline"},
	} {
		t.Run(test.name, func(t *testing.T) {
			product := validNWSProduct(now)
			product.Headline, product.Event = nil, nil
			if test.headline != "" {
				product.Headline = &test.headline
			}
			if test.event != "" {
				product.Event = &test.event
			}
			product.Sent, product.Effective, product.Expires = nwsPointer("bad sent"), nwsPointer("bad effective"), nwsPointer("bad expiry")
			trigger := normalizeNWS(nwsTestSnapshot(product, now), now)[0]
			if trigger.Title == "" || trigger.Provenance.ProductType == "" {
				t.Fatalf("legacy display fields were empty: %#v", trigger)
			}
			if test.headline == "" && test.event == "" && !strings.Contains(trigger.Title, "display label") {
				t.Fatalf("fallback claimed to be a source title: %q", trigger.Title)
			}
			if test.event == "" && !strings.Contains(trigger.Provenance.ProductType, "display label") {
				t.Fatalf("fallback claimed to be a source event: %q", trigger.Provenance.ProductType)
			}
			if !reflect.DeepEqual(trigger.NWSProduct.Product, product) ||
				trigger.Provenance.IssuedAt != "bad sent" || trigger.Provenance.EffectiveAt != "bad effective" ||
				trigger.Provenance.ExpiresAt != "bad expiry" || trigger.NWSProduct.Validity != "unknown" {
				t.Fatalf("display fallback altered source facts or validity: %#v", trigger)
			}
		})
	}
}

func TestNWSCacheAnd304CannotExtendProductValidity(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)
	var requests atomic.Int32
	var fail atomic.Bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count := requests.Add(1)
		if fail.Load() {
			http.Error(w, "down", http.StatusServiceUnavailable)
			return
		}
		if count > 1 {
			if r.Header.Get("If-None-Match") != `"same-product"` {
				t.Error("conditional retrieval lost ETag")
			}
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Header().Set("ETag", `"same-product"`)
		_, _ = w.Write([]byte(`{"updated":"2026-10-30T11:00:00Z","features":[{
				"id":"https://api.weather.gov/alerts/urn:oid:one","geometry":null,
				"properties":{"id":"urn:oid:one","sent":"2026-10-30T09:00:00Z",
				"effective":"2026-10-30T10:00:00Z","onset":null,"expires":"2026-10-30T12:01:00Z",
				"ends":null,"status":"Actual","scope":"Public","messageType":"Alert","event":"Flood Warning"}
			}]}`))
	}))
	defer server.Close()
	client := nws.NewClient(nws.Config{AlertsURL: server.URL, CacheTTL: 2 * time.Minute, Now: func() time.Time { return now }})
	first, err := client.ActiveAlerts(context.Background())
	if err != nil || normalizeNWS(first, now)[0].Lifecycle != "active" {
		t.Fatalf("prime cache failed: %#v %v", first, err)
	}
	now = now.Add(time.Minute)
	cached, err := client.ActiveAlerts(context.Background())
	if err != nil || requests.Load() != 1 || normalizeNWS(cached, now)[0].NWSProduct.Validity != "expired" ||
		!cached.Source.RetrievedAt.Equal(first.Source.RetrievedAt) {
		t.Fatalf("cached retrieval extended product validity: %#v %v", cached, err)
	}
	now = now.Add(time.Minute)
	revalidated, err := client.ActiveAlerts(context.Background())
	if err != nil || requests.Load() != 2 || revalidated.Source.Status != "fresh" ||
		!revalidated.Source.RetrievedAt.Equal(now) || revalidated.Source.DataUpdatedAt != first.Source.DataUpdatedAt ||
		normalizeNWS(revalidated, now)[0].NWSProduct.Validity != "expired" ||
		!reflect.DeepEqual(revalidated.Alerts[0].Product, first.Alerts[0].Product) {
		t.Fatalf("304 changed source facts/product validity: %#v %v", revalidated, err)
	}
	now = now.Add(2 * time.Minute)
	fail.Store(true)
	stale, err := client.ActiveAlerts(context.Background())
	if err != nil || stale.Source.Status != "stale" ||
		!stale.Source.RetrievedAt.Equal(revalidated.Source.RetrievedAt) ||
		normalizeNWS(stale, now)[0].NWSProduct.Validity != "expired" {
		t.Fatalf("failed refresh lost observation or product expiry: %#v %v", stale, err)
	}
}

func TestNWSRelationshipsAreExplicitAndNotTitleInference(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)
	old := validNWSProduct(now)
	replacement := validNWSProduct(now)
	replacement.ID, replacement.MessageType = nwsPointer("urn:oid:two"), nwsPointer("Update")
	replacement.URL = nwsPointer("https://api.weather.gov/alerts/urn:oid:two")
	replacement.Headline = nwsPointer("Unrelated title")
	replacement.References = []nws.Reference{{
		URL: old.URL, Identifier: old.ID, Sender: old.Sender, Sent: old.Sent,
	}, {
		Identifier: nwsPointer("urn:oid:older"), Sender: old.Sender, Sent: nwsPointer("2026-10-29T09:00:00Z"),
	}}
	for _, message := range []string{"Update", "Cancel"} {
		replacement.MessageType = &message
		got := normalizeNWS(nwsTestSnapshot(replacement, now), now)[0].NWSProduct
		if !reflect.DeepEqual(got.References, replacement.References) ||
			(message == "Cancel" && got.Eligibility != "cancellation") ||
			(message == "Update" && got.Relationship != "update") {
			t.Fatalf("explicit attributable relationship lost: %#v", got)
		}
	}
	changed := old
	changed.Headline = nwsPointer("Warning CANCELLED all-clear")
	got := normalizeNWS(nwsTestSnapshot(changed, now), now)[0].NWSProduct
	if got.Relationship != "initial" || got.References != nil || *got.ID != *old.ID {
		t.Fatalf("changed same-ID/title invented replacement or cancel: %#v", got)
	}
}

func TestNWSReportedAreaAndQueryScopeNeverMatchPlanningLocation(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)
	for _, area := range []string{"Honolulu", "Hawaii; Maui; Kauai; Honolulu", "Entire state", ""} {
		product := validNWSProduct(now)
		product.AreaDesc = &area
		trigger := normalizeNWS(nwsTestSnapshot(product, now), now)[0]
		if trigger.JurisdictionScope != "unknown" || trigger.NWSProduct.Applicability != "unknown" ||
			*trigger.NWSProduct.AreaDesc != area || trigger.NWSProduct.QueryScope.Area != "HI" ||
			trigger.NWSProduct.QueryScope.Coverage != "statewide" ||
			trigger.NWSProduct.QueryScope.URL != "https://api.weather.gov/alerts/active?area=HI" {
			t.Fatalf("query/report geography became inferred applicability: %#v", trigger)
		}
	}
}

func TestNWSWarningsRetainPartialQueryAttribution(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)
	snapshot := nwsTestSnapshot(validNWSProduct(now), now)
	snapshot.Warnings = []string{"NWS retrieval warning"}
	service := NewService(Config{
		NWS: nwsStub{snapshot: snapshot}, PTWC: ptwcStub{snapshot: ptwc.Snapshot{}},
		ComCat: comCatStub{snapshot: usgs.Snapshot{}}, HANS: hansStub{snapshot: hans.Snapshot{}},
		Now: func() time.Time { return now },
	})
	result, err := service.Snapshot(context.Background())
	if err != nil || result.Status != "partial" || len(result.SourceErrors) != 1 ||
		result.SourceErrors[0].Source != "nws" || result.SourceErrors[0].Error != snapshot.Warnings[0] {
		t.Fatalf("NWS partial query attribution lost: %#v %v", result, err)
	}
}

func TestNWSRetrievalStatusIndependentOfUnrelatedFailures(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)
	for _, empty := range []bool{false, true} {
		t.Run(map[bool]string{false: "product", true: "empty"}[empty], func(t *testing.T) {
			nwsSnapshot := nwsTestSnapshot(validNWSProduct(now), now)
			if empty {
				nwsSnapshot.Alerts = []nws.Alert{}
			}

			service := NewService(Config{
				NWS: nwsStub{snapshot: nwsSnapshot}, PTWC: ptwcStub{err: errors.New("unavailable")},
				ComCat: comCatStub{err: errors.New("unavailable")}, HANS: hansStub{err: errors.New("unavailable")},
				Now: func() time.Time { return now },
			})
			result, err := service.Snapshot(context.Background())
			if err != nil || result.Status != "partial" || len(result.SourceStates) != 1 ||
				result.SourceStates[0].ID != "nws-hi-alerts" || result.SourceStates[0].Status != "fresh" ||
				len(result.SourceErrors) != 3 {
				t.Fatalf("unrelated source failure contaminated NWS health: %#v %v", result, err)
			}
			count := 0
			for _, trigger := range result.Triggers {
				if trigger.Source == "nws" {
					count++
					if trigger.NWSProduct == nil || trigger.NWSProduct.Validity != "current" {
						t.Fatalf("unrelated source failure contaminated NWS product: %#v", trigger)
					}
				}
			}
			if (empty && count != 0) || (!empty && count != 1) {
				t.Fatalf("empty query became a product/hazard assertion: %d", count)
			}
		})
	}
	service := NewService(Config{
		NWS:    nwsStub{err: errors.New("NWS failed")},
		PTWC:   ptwcStub{snapshot: ptwc.Snapshot{Source: ptwc.SourceStatus{Status: "fresh"}}},
		ComCat: comCatStub{snapshot: usgs.Snapshot{Source: usgs.SourceStatus{Status: "fresh"}}},
		HANS:   hansStub{snapshot: hans.Snapshot{Status: "unavailable"}}, Now: func() time.Time { return now },
	})
	result, err := service.Snapshot(context.Background())
	if err != nil || result.Status != "partial" || result.SourceErrors[0].Source != "nws" {
		t.Fatalf("NWS failure not explicit: %#v %v", result, err)
	}
	for _, trigger := range result.Triggers {
		if trigger.Source == "nws" && (trigger.NWSProduct != nil || trigger.Lifecycle != "unavailable") {
			t.Fatalf("NWS error manufactured a product: %#v", trigger)
		}
	}
}
