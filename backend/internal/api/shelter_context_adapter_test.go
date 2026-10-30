package api

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/arcgis"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/official"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/operationalstatus"
)

type shelterRoundTripper func(*http.Request) (*http.Response, error)

func (transport shelterRoundTripper) RoundTrip(request *http.Request) (*http.Response, error) {
	return transport(request)
}

func TestShelterContextRealAdaptersRetainValidatedLastKnown(t *testing.T) {
	t.Parallel()
	const validFeature = `{"type":"Feature","properties":{"shelter_id":123,"shelter_name":"Reported FEMA shelter","shelter_status":"OPEN","evacuation_capacity":25,"wheelchair_accessible":"Unknown","address":"Must not enter claims"},"geometry":{"type":"Point","coordinates":[-157.8,21.3]}}`
	body := `{"type":"FeatureCollection","features":[` + validFeature + `]}`
	now := time.Date(2026, 10, 30, 16, 0, 0, 0, time.UTC)
	arcGIS := arcgis.NewClient(arcgis.Config{
		Now: func() time.Time { return now },
		HTTPClient: &http.Client{Transport: shelterRoundTripper(func(request *http.Request) (*http.Response, error) {
			query := request.URL.Query()
			if request.URL.Host != "gis.fema.gov" ||
				query.Get("geometry") != "-161,18,-154,23" ||
				query.Get("resultRecordCount") != "21" {
				t.Errorf("unexpected FEMA query: %s", request.URL)
			}
			return &http.Response{
				StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)),
				Header: http.Header{"Last-Modified": []string{"Fri, 30 Oct 2026 15:00:00 GMT"}},
			}, nil
		})},
	})
	operations := operationalstatus.NewService(operationalstatus.Config{
		Shelters: official.NewClient(arcGIS), Now: func() time.Time { return now },
	})
	read := func() lifecycleEvidenceSnapshot {
		return loadLifecycleEvidence(context.Background(), context.Background(),
			eventTriggerReaderStub{}, operations, 21.3, -157.8, now)
	}
	first := read()
	if first.ShelterContext.State != "fresh" || first.ShelterContext.Coverage != "complete" ||
		len(first.ShelterContext.Items) != 1 || first.ShelterContext.Items[0].ItemID != "123" ||
		first.ShelterContext.Items[0].SourceUpdatedAt != nil ||
		first.ShelterContext.Items[0].Facts.WheelchairAccessible != nil {
		t.Fatalf("unexpected normalized source claim: %+v", first.ShelterContext)
	}
	digest := first.ShelterContext.Items[0].ContentDigest

	now = now.Add(6 * time.Minute)
	body = `{"error":{"code":503,"message":"Source unavailable"}}`
	failed := read()
	if failed.ShelterContext.State != "unavailable" ||
		failed.ShelterContext.Coverage != "unavailable" ||
		len(failed.ShelterContext.Items) != 1 ||
		failed.ShelterContext.Items[0].ContentDigest != digest ||
		failed.OperationalStatus.Data.Domains[2].Status != "stale" ||
		*failed.ShelterContext.RetrievedAt != *first.ShelterContext.RetrievedAt {
		t.Fatalf("failed refresh lost validated last known or changed operational semantics: %+v", failed)
	}

	now = now.Add(6 * time.Minute)
	body = `{"type":"FeatureCollection","features":[]}`
	empty := read()
	if empty.ShelterContext.State != "fresh" || empty.ShelterContext.Coverage != "complete" ||
		len(empty.ShelterContext.Items) != 0 {
		t.Fatalf("valid empty query did not recover: %+v", empty.ShelterContext)
	}

	now = now.Add(6 * time.Minute)
	body = `{"type":"FeatureCollection","features":[` + validFeature +
		`,{"type":"Feature","properties":{"shelter_id":"malformed","shelter_name":"Bad capacity","evacuation_capacity":false},"geometry":{"type":"Point","coordinates":[-157.8,21.3]}}]}`
	partial := read()
	if partial.ShelterContext.State != "fresh" || partial.ShelterContext.Coverage != "partial" ||
		len(partial.ShelterContext.Items) != 1 ||
		partial.ShelterContext.Items[0].ContentDigest != digest {
		t.Fatalf("malformed field became a source fact or lost partial metadata: %+v", partial.ShelterContext)
	}
	if first.SnapshotID == failed.SnapshotID || first.SnapshotID == empty.SnapshotID ||
		first.SnapshotID == partial.SnapshotID {
		t.Fatal("snapshot validators ignored source state or coverage changes")
	}
}
