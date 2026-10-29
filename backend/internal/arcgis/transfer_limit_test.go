package arcgis

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestTransferLimitNeverSilentlyPresentsPartialCollectionAsComplete(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"type":"FeatureCollection","exceededTransferLimit":true,"features":[{"type":"Feature","properties":{"GEOID":"15005031900"},"geometry":null}]}`))
	}))
	defer server.Close()
	client := NewClient(Config{})
	_, err := client.Query(context.Background(), Request{SourceID: "census-tigerweb-tracts", Authority: "U.S. Census Bureau", URL: server.URL, CacheTTL: time.Hour, Params: url.Values{"f": {"geojson"}}})
	if err == nil || !strings.Contains(err.Error(), "transfer limit") {
		t.Fatalf("truncated results not rejected: %v", err)
	}
}
