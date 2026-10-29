package census

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
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
			if !strings.Contains(request.URL.Query().Get("get"), "B16001_099E,B16001_099M") {
				t.Error("expected sourced Tagalog language estimate and margin of error")
			}

			_, _ = writer.Write([]byte(`[
				["NAME","B01003_001E","B01003_001M","B08201_001E","B08201_001M","B08201_002E","B08201_002M","B16001_099E","B16001_099M","state","county","tract"],
				["Census Tract 1.20","2361","150","900","80","15","12","84","25","15","003","000120"]
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
	if len(first.Languages) != 8 || first.Languages[6].Speakers.Estimate == nil ||
		*first.Languages[6].Speakers.Estimate != 84 ||
		*first.Languages[6].Speakers.MarginOfError != 25 ||
		first.Languages[0].Speakers.Estimate != nil {
		t.Fatalf("language estimates or unknowns not preserved: %#v", first.Languages)
	}
	*first.Languages[6].Speakers.Estimate = 999
	third, err := client.CommunityProfile(context.Background(), 21.29, -157.68)
	if err != nil || *third.Languages[6].Speakers.Estimate != 84 {
		t.Fatal("language cache mutated through returned profile")
	}
}

func TestCommunityProfileCoalescesConcurrentCacheMisses(t *testing.T) {
	t.Parallel()

	var geocoderRequests atomic.Int32
	var dataRequests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/geocoder":
			geocoderRequests.Add(1)
			time.Sleep(25 * time.Millisecond)
			_, _ = writer.Write([]byte(`{
				"result":{"geographies":{"Census Tracts":[{
					"STATE":"15","COUNTY":"003","TRACT":"000120",
					"GEOID":"15003000120","NAME":"Census Tract 1.20"
				}]}}
			}`))
		case "/detailed":
			dataRequests.Add(1)
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

	client := NewClient(Config{
		APIKey:      "test-key",
		GeocoderURL: server.URL + "/geocoder",
		DetailedURL: server.URL + "/detailed",
		SubjectURL:  server.URL + "/subject",
	})

	var waitGroup sync.WaitGroup
	errors := make(chan error, 50)
	for range 50 {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			_, err := client.CommunityProfile(context.Background(), 21.29, -157.68)
			errors <- err
		}()
	}
	waitGroup.Wait()
	close(errors)

	for err := range errors {
		if err != nil {
			t.Fatalf("concurrent profile failed: %v", err)
		}
	}
	if geocoderRequests.Load() != 1 || dataRequests.Load() != 2 {
		t.Fatalf(
			"expected one coalesced profile load, got geocoder=%d data=%d",
			geocoderRequests.Load(),
			dataRequests.Load(),
		)
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

func TestTransportFailureDoesNotExposeAPIKey(t *testing.T) {
	t.Parallel()

	const apiKey = "private-census-key"
	client := NewClient(Config{
		APIKey: apiKey,
		HTTPClient: &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
			return nil, errors.New(request.URL.String())
		})},
	})
	err := client.getJSON(
		context.Background(),
		"https://api.census.gov/data",
		url.Values{"key": {apiKey}},
		&map[string]any{},
	)
	if err == nil {
		t.Fatal("expected transport error")
	}
	if strings.Contains(err.Error(), apiKey) || strings.Contains(err.Error(), "key=") {
		t.Fatalf("transport error exposed Census credential: %v", err)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(
	request *http.Request,
) (*http.Response, error) {
	return function(request)
}
