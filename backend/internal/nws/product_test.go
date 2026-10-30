package nws

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"
)

const sourceProductFixture = `{
	"id":"https://api.weather.gov/alerts/urn:oid:current",
	"geometry":{"type":"Polygon","coordinates":[[[-158,21],[-157,21],[-157,22],[-158,21]]]},
	"properties":{
		"id":"urn:oid:current","sender":"w-nws.webmaster@noaa.gov","senderName":"NWS Honolulu",
		"sent":"2026-10-30T01:00:00-10:00","effective":"2026-10-30T01:05:00-10:00",
		"onset":"2026-10-30T02:00:00-10:00","expires":"2026-10-30T05:00:00-10:00",
		"ends":"2026-10-30T06:00:00-10:00",
		"status":"Actual","messageType":"Update","scope":"Public",
		"event":"Flood Warning","headline":"Source headline","severity":"Severe",
		"certainty":"Likely","urgency":"Immediate","response":"Evacuate",
		"areaDesc":"Koolau Windward; Honolulu",
		"affectedZones":["https://api.weather.gov/zones/forecast/HIZ006",
			"https://api.weather.gov/zones/county/HIC003","https://api.weather.gov/zones/fire/HIZ006"],
		"geocode":{"UGC":["HIZ006","HIC003"],"SAME":["015003"]},
		"references":[
			{"@id":"https://api.weather.gov/alerts/urn:oid:older","identifier":"urn:oid:older",
			 "sender":"w-nws.webmaster@noaa.gov","sent":"2026-10-30T00:00:00-10:00"},
			{"@id":"https://api.weather.gov/alerts/urn:oid:oldest","identifier":"urn:oid:oldest",
			 "sender":"w-nws.webmaster@noaa.gov","sent":"2026-10-29T23:00:00-10:00"}
		],
		"expiredReferences":["not-a-documented-alert-field"]
	}
}`

func TestProductRetainsExactSourceFactsAndOrderedReferences(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"updated":"2026-10-30T11:00:00Z","features":[` + sourceProductFixture + `]}`))
	}))
	defer server.Close()
	snapshot, err := NewClient(Config{AlertsURL: server.URL, Now: func() time.Time { return now }}).ActiveAlerts(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	t.Run("canonicalizes accepted affected-zone URLs", func(t *testing.T) {
		zone, ok := parseZone("https://api.weather.gov/zones/forecast/HIZ%30%30%36")
		if !ok {
			t.Fatal("expected encoded canonical zone path to remain accepted")
		}
		if zone != (Zone{
			URL: "https://api.weather.gov/zones/forecast/HIZ006",
			ID:  "HIZ006", Type: "forecast",
		}) {
			t.Fatalf("encoded zone was not canonicalized: %#v", zone)
		}
	})
	product := snapshot.Alerts[0].Product
	expected := map[string]string{
		"id": "urn:oid:current", "url": "https://api.weather.gov/alerts/urn:oid:current",
		"sender": "w-nws.webmaster@noaa.gov", "sender_name": "NWS Honolulu",
		"sent": "2026-10-30T01:00:00-10:00", "effective": "2026-10-30T01:05:00-10:00",
		"onset": "2026-10-30T02:00:00-10:00", "expires": "2026-10-30T05:00:00-10:00",
		"ends": "2026-10-30T06:00:00-10:00", "status": "Actual", "message_type": "Update", "scope": "Public",
		"event": "Flood Warning", "headline": "Source headline", "severity": "Severe", "certainty": "Likely",
		"urgency": "Immediate", "response": "Evacuate", "area_desc": "Koolau Windward; Honolulu",
	}
	body, _ := json.Marshal(product)
	var object map[string]any
	if err := json.Unmarshal(body, &object); err != nil {
		t.Fatal(err)
	}
	for key, value := range expected {
		if object[key] != value {
			t.Errorf("%s = %#v, want exact source %q", key, object[key], value)
		}
	}
	if _, exists := object["expired_references"]; exists {
		t.Fatal("undocumented expiredReferences became a supported contract")
	}
	if len(product.References) != 2 || *product.References[0].Identifier != "urn:oid:older" ||
		*product.References[1].Identifier != "urn:oid:oldest" ||
		*product.References[0].Sent != "2026-10-30T00:00:00-10:00" {
		t.Fatalf("reference order/source tuple lost: %#v", product.References)
	}
	if len(product.AffectedZones) != 3 || product.AffectedZones[0].ID != "HIZ006" ||
		product.AffectedZones[1].Type != "county" || product.AffectedZones[2].Type != "fire" ||
		!reflect.DeepEqual(product.Geocode.UGC, []string{"HIZ006", "HIC003"}) ||
		!reflect.DeepEqual(product.Geocode.SAME, []string{"015003"}) {
		t.Fatalf("typed geography lost: %#v", product)
	}
	var decoded Product
	if err := json.Unmarshal(body, &decoded); err != nil || !reflect.DeepEqual(decoded, product) {
		t.Fatalf("product did not round-trip: %v", err)
	}
	if product.Geometry.Status != "valid" || *product.Geometry.Type != "Polygon" ||
		snapshot.Source.DataUpdatedAt != "2026-10-30T11:00:00Z" || !snapshot.Source.RetrievedAt.Equal(now) {
		t.Fatalf("geometry or source observation lost: %#v", snapshot)
	}
}

func TestProductMissingOptionalFieldsStayNull(t *testing.T) {
	t.Parallel()
	var item feature
	if err := json.Unmarshal([]byte(`{"geometry":null,"properties":{"onset":null,"ends":null}}`), &item); err != nil {
		t.Fatal(err)
	}
	product := productFromFeature(item)
	body, _ := json.Marshal(product)
	var object map[string]any
	_ = json.Unmarshal(body, &object)
	for _, key := range []string{
		"id", "url", "sender", "sender_name", "sent", "effective", "onset", "expires", "ends",
		"status", "message_type", "scope", "headline", "area_desc", "references", "affected_zones",
	} {
		value, exists := object[key]
		if !exists || value != nil {
			t.Errorf("%s was omitted or fabricated: %#v", key, value)
		}
	}
	if product.Geometry.Status != "absent" || product.Geometry.Shape != nil {
		t.Fatalf("null geometry lost: %#v", product.Geometry)
	}
}

func TestProductBoundsAndURLValidation(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name   string
		change func(*feature)
		check  func(Product) bool
	}{
		{"id", func(f *feature) { f.Properties.ID = sourceString(strings.Repeat("x", MaxIdentityBytes+1)) }, func(p Product) bool { return p.ID == nil }},
		{"time", func(f *feature) { f.Properties.Sent = sourceString(strings.Repeat("x", MaxTimeBytes+1)) }, func(p Product) bool { return p.Sent == nil }},
		{"status", func(f *feature) { f.Properties.Status = sourceString(strings.Repeat("x", MaxEnumBytes+1)) }, func(p Product) bool { return p.Status == nil }},
		{"headline", func(f *feature) { f.Properties.Headline = sourceString(strings.Repeat("x", MaxTextBytes+1)) }, func(p Product) bool { return p.Headline == nil }},
		{"area", func(f *feature) { f.Properties.Area = sourceString(strings.Repeat("x", MaxAreaBytes+1)) }, func(p Product) bool { return p.AreaDesc == nil }},
		{"reference count", func(f *feature) { f.Properties.References = make([]referenceProperties, MaxListItems+1) }, func(p Product) bool { return p.References == nil }},
		{"zone count", func(f *feature) { f.Properties.AffectedZones = make([]string, MaxListItems+1) }, func(p Product) bool { return p.AffectedZones == nil }},
		{"geocode count", func(f *feature) { f.Properties.Geocode.UGC = make([]string, MaxListItems+1) }, func(p Product) bool { return p.Geocode.UGC == nil }},
		{"geocode invalid", func(f *feature) { f.Properties.Geocode.SAME = []string{"15003"} }, func(p Product) bool { return p.Geocode.SAME == nil }},
		{"untrusted product url", func(f *feature) { f.ID = "https://example.test/alerts/current" }, func(p Product) bool { return p.URL == nil }},
		{"http product url", func(f *feature) { f.ID = "http://api.weather.gov/alerts/current" }, func(p Product) bool { return p.URL == nil }},
		{"product url traversal", func(f *feature) { f.ID = "https://api.weather.gov/alerts/%2e%2e" }, func(p Product) bool { return p.URL == nil }},
		{"product url credentials", func(f *feature) { f.ID = "https://user@api.weather.gov/alerts/current" }, func(p Product) bool { return p.URL == nil }},
		{"untrusted zone", func(f *feature) { f.Properties.AffectedZones = []string{"https://example.test/zones/county/HIC003"} }, func(p Product) bool { return p.AffectedZones == nil }},
		{"wrong typed zone", func(f *feature) { f.Properties.AffectedZones = []string{"https://api.weather.gov/zones/county/HIZ006"} }, func(p Product) bool { return p.AffectedZones == nil }},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			var item feature
			_ = json.Unmarshal([]byte(sourceProductFixture), &item)
			test.change(&item)
			if got := productFromFeature(item); !test.check(got) {
				t.Fatalf("bound/validation failed: %#v", got)
			}
		})
	}
}

func TestGeometryValidationBounds(t *testing.T) {
	t.Parallel()
	vertices := make([][]float64, MaxVertices+1)
	for index := range vertices {
		vertices[index] = []float64{-158, 21}
	}
	tooMany, _ := json.Marshal(map[string]any{"type": "Polygon", "coordinates": []any{vertices}})
	cases := []struct {
		name, raw, status string
	}{
		{"absent", "", "absent"},
		{"null", "null", "absent"},
		{"polygon", `{"type":"Polygon","coordinates":[[[-158,21],[-157,21],[-157,22],[-158,21]]]}`, "valid"},
		{"multipolygon", `{"type":"MultiPolygon","coordinates":[[[[-158,21],[-157,21],[-157,22],[-158,21]]]]}`, "valid"},
		{"bad json", "{", "invalid"},
		{"unsupported", `{"type":"Point","coordinates":[-158,21]}`, "unsupported"},
		{"missing type", `{"coordinates":[]}`, "invalid"},
		{"null coordinates", `{"type":"Polygon","coordinates":null}`, "invalid"},
		{"null ordinate", `{"type":"Polygon","coordinates":[[[null,21],[-157,21],[-157,22],[null,21]]]}`, "invalid"},
		{"empty ring", `{"type":"Polygon","coordinates":[[]]}`, "invalid"},
		{"empty multipolygon", `{"type":"MultiPolygon","coordinates":[]}`, "invalid"},
		{"latitude range", `{"type":"Polygon","coordinates":[[[-158,91],[-157,21],[-157,22],[-158,91]]]}`, "invalid"},
		{"longitude range", `{"type":"Polygon","coordinates":[[[-181,21],[-157,21],[-157,22],[-181,21]]]}`, "invalid"},
		{"open ring", `{"type":"Polygon","coordinates":[[[-158,21],[-157,21],[-157,22],[-158,22]]]}`, "invalid"},
		{"extra ordinate", `{"type":"Polygon","coordinates":[[[-158,21,0],[-157,21,0],[-157,22,0],[-158,21,0]]]}`, "invalid"},
		{"huge bytes", strings.Repeat(" ", MaxGeometryBytes+1), "too_large"},
		{"huge vertices", string(tooMany), "too_large"},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			got := boundedGeometry(json.RawMessage(test.raw))
			if got.Status != test.status || (got.Status != "valid" && got.Shape != nil) {
				t.Fatalf("geometry = %#v, want status %s", got, test.status)
			}
		})
	}
}

func TestGeometryOmitsUnvalidatedExtensionFields(t *testing.T) {
	t.Parallel()
	got := boundedGeometry(json.RawMessage(`{"type":"Polygon","coordinates":[[[-158,21],[-157,21],[-157,22],[-158,21]]],"bbox":[999,999],"private":"excluded"}`))
	if got.Status != "valid" || strings.Contains(string(got.Shape), "bbox") || strings.Contains(string(got.Shape), "private") {
		t.Fatalf("unvalidated geometry metadata escaped: %s", got.Shape)
	}
}

func TestCacheCloneRetainsNullAndEmptyAndProtectsSourceFacts(t *testing.T) {
	t.Parallel()
	var item feature
	_ = json.Unmarshal([]byte(sourceProductFixture), &item)
	original := Snapshot{Alerts: []Alert{{Product: productFromFeature(item)}}}
	copy := cloneSnapshot(original)
	*copy.Alerts[0].Product.Sent = "changed"
	*copy.Alerts[0].Product.References[0].Identifier = "changed"
	copy.Alerts[0].Product.AffectedZones[0].ID = "changed"
	copy.Alerts[0].Product.Geometry.Shape[0] = '['
	if *original.Alerts[0].Product.Sent == "changed" || *original.Alerts[0].Product.References[0].Identifier == "changed" ||
		original.Alerts[0].Product.AffectedZones[0].ID == "changed" || original.Alerts[0].Product.Geometry.Shape[0] != '{' {
		t.Fatal("caller changed cached source product")
	}
	empty := cloneSnapshot(Snapshot{Alerts: []Alert{}})
	if empty.Alerts == nil {
		t.Fatal("successful empty query turned into null")
	}
}

func TestMalformedAndOverLimitCollectionsDoNotBecomeEmptySuccess(t *testing.T) {
	t.Parallel()
	tooMany := `{"features":[` + strings.Repeat(`{},`, MaxAlerts) + `{}` + `]}`
	for _, body := range []string{
		`{}`, `{"features":null}`, `{"features":{}}`, `{"features":[{"properties":{"sent":false}}]}`,
		`{"features":[]} trailing`, tooMany, `{"features":[]}` + strings.Repeat(" ", 8<<20),
	} {
		t.Run(body[:min(len(body), 50)], func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				_, _ = w.Write([]byte(body))
			}))
			defer server.Close()
			if _, err := NewClient(Config{AlertsURL: server.URL}).ActiveAlerts(context.Background()); err == nil {
				t.Fatal("malformed collection was a successful empty query")
			}
		})
	}
}
