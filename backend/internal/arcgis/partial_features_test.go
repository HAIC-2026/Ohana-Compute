package arcgis

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestBoundedQueryRejectsMalformedEnvelopeAndRetainsLastKnown(t *testing.T) {
	t.Parallel()
	for _, body := range []string{
		`{}`, `null`, `{"features":null}`, `{"features":{}}`, `{"features":false}`,
		`{"type":"Feature","features":[]}`,
		`{"features":[],"error":{"code":400,"message":"Bad query"}}`,
		`{"features":[]} {"features":[]}`,
	} {
		t.Run(body, func(t *testing.T) {
			var current atomic.Value
			current.Store(`{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"shelter_id":"fema-1","shelter_name":"Reported shelter"},"geometry":null}]}`)
			server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
				_, _ = writer.Write([]byte(current.Load().(string)))
			}))
			defer server.Close()
			now := time.Date(2026, 10, 30, 16, 0, 0, 0, time.UTC)
			client := NewClient(Config{Now: func() time.Time { return now }})
			query := Request{SourceID: "fema-open-shelters", Authority: "FEMA", URL: server.URL,
				CacheTTL: time.Minute, AllowPartialFeatures: true}
			first, err := client.Query(context.Background(), query)
			if err != nil {
				t.Fatal(err)
			}
			current.Store(body)
			now = now.Add(2 * time.Minute)
			stale, err := client.Query(context.Background(), query)
			if err != nil || stale.Source.Status != "stale" ||
				stale.Source.RefreshAttemptedAt == nil || len(stale.Collection.Features) != 1 ||
				stale.Source.RetrievedAt != first.Source.RetrievedAt ||
				stale.Collection.Features[0].Properties["shelter_id"] != "fema-1" {
				t.Fatalf("malformed response replaced last known: %+v %v", stale, err)
			}
			uncached := NewClient(Config{Now: func() time.Time { return now }})
			if _, err := uncached.Query(context.Background(), query); err == nil {
				t.Fatal("malformed response without last known must fail")
			}
		})
	}
}

func TestBoundedQueryMarksTransferLimitAndMalformedRowsPartial(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		body    string
		partial bool
		count   int
	}{
		{`{"type":"FeatureCollection","features":[]}`, false, 0},
		{`{"features":[{"properties":{"shelter_id":1}}]}`, false, 1},
		{`{"exceededTransferLimit":true,"features":[{"properties":{"shelter_id":1}}]}`, true, 1},
		{`{"features":[null,17,{"properties":[]},{"properties":null},{"type":"NotFeature","properties":{}},{"properties":{"shelter_id":1}}]}`, true, 1},
	} {
		t.Run(test.body, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
				_, _ = writer.Write([]byte(test.body))
			}))
			defer server.Close()
			client := NewClient(Config{})
			query := Request{SourceID: "fema-open-shelters", Authority: "FEMA", URL: server.URL,
				CacheTTL: time.Minute, AllowPartialFeatures: true}
			for range 2 {
				result, err := client.Query(context.Background(), query)
				if err != nil || result.Partial != test.partial ||
					len(result.Collection.Features) != test.count || result.Source.Status != "fresh" {
					t.Fatalf("unexpected result: %+v %v", result, err)
				}
			}
		})
	}
}
