package census

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestNewIndicatorsUsePublishedVariablesAndDenominators(t *testing.T) {
	t.Parallel()
	values := map[string]string{
		"B11010_005E": "8", "B11010_005M": "3", "B11010_012E": "12", "B11010_012M": "4", "B11001_001E": "100",
		"B25024_001E": "200", "B25024_009E": "50", "B25024_009M": "7", "B25024_010E": "999",
		"B25047_001E": "200", "B25047_003E": "6", "B25047_003M": "2",
		"B28002_001E": "100", "B28002_012E": "5", "B28002_012M": "3", "B28002_013E": "15", "B28002_013M": "4",
	}
	profile := NewClient(Config{}).profileFromValues(Geography{}, values, nil, time.Now())
	for name, check := range map[string]struct {
		value                  Metric
		estimate, percent, moe float64
	}{
		"kupuna":    {profile.KupunaLivingAlone, 20, 20, 5},
		"structure": {profile.Housing50PlusUnits, 50, 25, 7},
		"plumbing":  {profile.IncompletePlumbing, 6, 3, 2},
		"internet":  {profile.NoInternetSubscription, 20, 20, 5},
	} {
		if check.value.Estimate == nil || *check.value.Estimate != check.estimate ||
			check.value.Percent == nil || *check.value.Percent != check.percent ||
			check.value.MarginOfError == nil || *check.value.MarginOfError != check.moe ||
			check.value.PercentMOE != nil {
			t.Errorf("%s unexpected indicator: %#v", name, check.value)
		}
	}
	cloned := cloneProfile(profile)
	*cloned.KupunaLivingAlone.Estimate = 999
	*cloned.Housing50PlusUnits.Percent = 999
	*cloned.IncompletePlumbing.MarginOfError = 999
	*cloned.NoInternetSubscription.Estimate = 999
	if *profile.KupunaLivingAlone.Estimate != 20 || *profile.Housing50PlusUnits.Percent != 25 ||
		*profile.IncompletePlumbing.MarginOfError != 2 || *profile.NoInternetSubscription.Estimate != 20 {
		t.Fatal("new indicators were not deep-cloned")
	}
}

func TestIndicatorUnknownsDoNotBecomeZero(t *testing.T) {
	t.Parallel()
	profile := NewClient(Config{}).profileFromValues(Geography{}, map[string]string{
		"B11010_005E": "8", "B11010_012E": "-666666666", "B25024_001E": "0",
		"B25024_009E": "0", "B25047_003E": "-999999999", "B28002_012E": "1",
	}, nil, time.Now())
	if profile.KupunaLivingAlone.Estimate != nil || profile.IncompletePlumbing.Estimate != nil ||
		profile.NoInternetSubscription.Estimate != nil || profile.Housing50PlusUnits.Percent != nil {
		t.Fatalf("unknown/suppressed or zero denominators misrepresented: %#v", profile)
	}
	if profile.Housing50PlusUnits.Estimate == nil || *profile.Housing50PlusUnits.Estimate != 0 {
		t.Fatal("published zero must remain zero")
	}
	summed := sumMetric(map[string]string{"aE": "3", "bE": "4", "aM": "2"}, "a", "b")
	if summed.Estimate == nil || *summed.Estimate != 7 || summed.MarginOfError != nil {
		t.Fatal("missing MOE must not become zero")
	}
}

func TestCountyProfilesBatchAllFiveCountiesAndCache(t *testing.T) {
	t.Parallel()
	if len(detailedVariables) > 50 {
		t.Fatalf("shared ACS detailed query exceeds 50-variable limit: %d", len(detailedVariables))
	}
	for _, group := range languageGroups {
		for _, suffix := range []string{"E", "M"} {
			found := false
			for _, variable := range detailedVariables {
				found = found || variable == group.variable+suffix
			}
			if !found {
				t.Fatalf("shared point/batch query missing language variable %s%s", group.variable, suffix)
			}
		}
	}
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		q := r.URL.Query()
		if q.Get("for") != "tract:*" || q.Get("key") != "test-key" {
			t.Errorf("unexpected batch query: %v", q)
		}
		county := strings.TrimPrefix(q.Get("in"), "state:15 county:")
		if !ValidHawaiiCounty(county) {
			t.Errorf("unexpected county %s", county)
		}
		headers := strings.Split(q.Get("get"), ",")
		values := make([]string, len(headers))
		for i, header := range headers {
			values[i] = "10"
			if header == "NAME" {
				values[i] = "Test Census tract"
			}
			if header == "B25024_009E" {
				values[i] = "4"
			}
		}
		headers = append(headers, "state", "county", "tract")
		values = append(values, "15", county, "000100")
		_ = json.NewEncoder(w).Encode([][]string{headers, values})
	}))
	defer server.Close()
	client := NewClient(Config{APIKey: "test-key", DetailedURL: server.URL, SubjectURL: server.URL})
	for _, county := range []string{"001", "003", "005", "007", "009"} {
		profiles, err := client.CountyProfiles(context.Background(), county)
		if err != nil {
			t.Fatal(err)
		}
		if len(profiles) != 1 || profiles[0].Geography.TractFIPS != "15"+county+"000100" ||
			profiles[0].Housing50PlusUnits.Estimate == nil || *profiles[0].Housing50PlusUnits.Estimate != 4 {
			t.Fatalf("unexpected county profiles: %#v", profiles)
		}
		if len(profiles[0].Languages) != len(languageGroups) ||
			profiles[0].Languages[6].Speakers.Estimate == nil ||
			*profiles[0].Languages[6].Speakers.Estimate != 10 ||
			profiles[0].Languages[6].Speakers.MarginOfError == nil ||
			*profiles[0].Languages[6].Speakers.MarginOfError != 10 {
			t.Fatalf("county profile lost upstream language estimates/MOEs: %#v", profiles[0].Languages)
		}
		*profiles[0].Housing50PlusUnits.Estimate = 999
		*profiles[0].Languages[6].Speakers.Estimate = 999
		*profiles[0].Languages[6].Speakers.MarginOfError = 999
		cached, err := client.CountyProfiles(context.Background(), county)
		if err != nil || *cached[0].Housing50PlusUnits.Estimate != 4 ||
			*cached[0].Languages[6].Speakers.Estimate != 10 ||
			*cached[0].Languages[6].Speakers.MarginOfError != 10 {
			t.Fatal("mutated cached tract profile")
		}
	}
	if calls.Load() != 10 {
		t.Fatalf("expected 2 requests per county, got %d", calls.Load())
	}
}

func TestCountyProfilesRejectInvalidUnavailableAndMalformed(t *testing.T) {
	t.Parallel()
	client := NewClient(Config{})
	if _, err := client.CountyProfiles(context.Background(), "005"); !errors.Is(err, ErrAPIKeyRequired) {
		t.Fatalf("missing key: %v", err)
	}
	if _, err := client.CountyProfiles(context.Background(), "005' OR 1=1"); err == nil {
		t.Fatal("invalid county accepted")
	}
	for _, body := range []string{
		`[]`,
		`[["state","county","tract"],["15","005"]]`,
		`[["state","county","tract"],["15","003","000100"]]`,
		`[["state","county","tract"],["15","005","x00100"]]`,
		`[["state","county","tract"],["15","005","000100"],["15","005","000100"]]`,
	} {
		t.Run(fmt.Sprint(body), func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(body)) }))
			defer server.Close()
			client := NewClient(Config{APIKey: "test-key", DetailedURL: server.URL, SubjectURL: server.URL})
			if _, err := client.CountyProfiles(context.Background(), "005"); err == nil {
				t.Fatal("malformed rows accepted")
			}
		})
	}
}
