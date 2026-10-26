package transportation

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/arcgis"
)

func TestPlannedClosuresNormalizesAndScopesQuery(t *testing.T) {
	t.Parallel()

	var receivedQuery string
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		receivedQuery = request.URL.RawQuery
		writer.Header().Set("Content-Type", "application/geo+json")
		_, _ = writer.Write([]byte(`{
			"type":"FeatureCollection",
			"features":[{
				"type":"Feature",
				"id":42,
				"geometry":{"type":"LineString","coordinates":[[-157.7,21.3],[-157.8,21.4]]},
				"properties":{
					"OBJECTID":42,
					"Route":"H-1",
					"RoadName":"Kalanianaole Highway",
					"NumLanes":2,
					"ClosReason":"Construction",
					"ClosType":"Static",
					"beginDate":1793030400000,
					"enDate":1793116800000,
					"DirPRemarks":"Eastbound closure",
					"Island":"Oahu"
				}
			}]
		}`))
	}))
	defer server.Close()

	now := time.Date(2026, 10, 26, 19, 30, 0, 0, time.UTC)
	arcGISClient := arcgis.NewClient(arcgis.Config{
		HTTPClient: server.Client(),
		Now:        func() time.Time { return now },
	})
	client := NewClient(arcGISClient, Config{
		QueryURL: server.URL,
		Now:      func() time.Time { return now },
		RadiusKM: 25,
		Window:   48 * time.Hour,
	})
	snapshot, err := client.PlannedClosures(context.Background(), 21.3, -157.7)
	if err != nil {
		t.Fatalf("PlannedClosures returned error: %v", err)
	}
	if !strings.Contains(receivedQuery, "distance=25") ||
		!strings.Contains(receivedQuery, "geometry=-157.700000%2C21.300000") {
		t.Fatalf("query was not coordinate-scoped: %s", receivedQuery)
	}
	if len(snapshot.Closures) != 1 {
		t.Fatalf("closures = %d, want 1", len(snapshot.Closures))
	}
	closure := snapshot.Closures[0]
	if closure.ID != "42" || closure.Route != "H-1" ||
		closure.LanesClosed == nil || *closure.LanesClosed != 2 {
		t.Fatalf("unexpected closure: %#v", closure)
	}
	var geometry struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(closure.Geometry, &geometry); err != nil || geometry.Type != "LineString" {
		t.Fatalf("unexpected geometry: %s", closure.Geometry)
	}
	if closure.OfficialStatus != "planned" || len(snapshot.Warnings) < 2 {
		t.Fatalf("missing safety labels: %#v", snapshot)
	}
}
