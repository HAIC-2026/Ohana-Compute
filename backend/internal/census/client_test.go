package census

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestCommunityProfileRequiresAPIKey(t *testing.T) {
	t.Parallel()

	client := NewClient(Config{})
	if _, err := client.CommunityProfile(context.Background(), 21.29, -157.68); err != ErrAPIKeyRequired {
		t.Fatalf("expected ErrAPIKeyRequired, got %v", err)
	}
}

func TestCommunityProfileCombinesDetailedAndSubjectData(t *testing.T) {
	t.Parallel()

	var dataRequests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/geocoder":
			_, _ = writer.Write([]byte(`{
				"result":{"geographies":{"Census Tracts":[{
					"STATE":"15","COUNTY":"003","TRACT":"000120",
					"GEOID":"15003000120","NAME":"Census Tract 1.20"
				}]}}
			}`))
		case "/detailed":
			dataRequests.Add(1)
			if request.URL.Query().Get("key") != "test-key" {
				t.Error("expected Census API key")
			}
			_, _ = writer.Write([]byte(`[
				["NAME","B01003_001E","B01003_001M","B08201_001E","B08201_001M","B08201_002E","B08201_002M","state","county","tract"],
				["Census Tract 1.20","2361","150","900","80","15","12","15","003","000120"]
			]`))
		case "/subject":
			dataRequests.Add(1)
			_, _ = writer.Write([]byte(`[
				["S1601_C05_001E","S1601_C05_001M","S1601_C06_001E","S1601_C06_001M","S1810_C02_001E","S1810_C02_001M","S1810_C03_001E","S1810_C03_001M","S1701_C02_001E","S1701_C02_001M","S1701_C03_001E","S1701_C03_001M","state","county","tract"],
				["36","20","1.5","0.8","113","30","4.8","1.2","120","40","5.1","1.5","15","003","000120"]
			]`))
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()

	now := time.Date(2026, 10, 26, 19, 0, 0, 0, time.UTC)
	client := NewClient(Config{
		APIKey:      "test-key",
		GeocoderURL: server.URL + "/geocoder",
		DetailedURL: server.URL + "/detailed",
		SubjectURL:  server.URL + "/subject",
		Now:         func() time.Time { return now },
	})

	first, err := client.CommunityProfile(context.Background(), 21.29, -157.68)
	if err != nil {
		t.Fatalf("profile failed: %v", err)
	}
	second, err := client.CommunityProfile(context.Background(), 21.29, -157.68)
	if err != nil {
		t.Fatalf("cached profile failed: %v", err)
	}

	if dataRequests.Load() != 2 {
		t.Fatalf("expected two data requests, got %d", dataRequests.Load())
	}
	if first.Geography.TractFIPS != "15003000120" ||
		first.Population.Estimate == nil ||
		*first.Population.Estimate != 2361 ||
		first.NoVehicleHouseholds.Percent == nil ||
		*first.NoVehicleHouseholds.Percent < 1.66 ||
		second.Source.Status != "fresh" {
		t.Fatalf("unexpected profile: %#v", first)
	}
}

func TestCommunityProfileSurfacesUpstreamFailure(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		http.Error(writer, "unavailable", http.StatusServiceUnavailable)
	}))
	defer server.Close()

	client := NewClient(Config{
		APIKey:      "test-key",
		GeocoderURL: server.URL,
	})
	_, err := client.CommunityProfile(context.Background(), 21.29, -157.68)
	if err == nil || !strings.Contains(err.Error(), "HTTP 503") {
		t.Fatalf("expected explicit upstream error, got %v", err)
	}
}
