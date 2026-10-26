package census

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

const (
	defaultGeocoderURL = "https://geocoding.geo.census.gov/geocoder/geographies/coordinates"
	defaultDetailedURL = "https://api.census.gov/data/2024/acs/acs5"
	defaultSubjectURL  = "https://api.census.gov/data/2024/acs/acs5/subject"
	defaultCacheTTL    = 24 * time.Hour
)

var ErrAPIKeyRequired = errors.New("Census API key is required")

type Geography struct {
	StateCode  string `json:"state_code"`
	CountyCode string `json:"county_code"`
	TractCode  string `json:"tract_code"`
	TractFIPS  string `json:"tract_fips"`
	Name       string `json:"name"`
}

type Metric struct {
	Estimate      *float64 `json:"estimate"`
	MarginOfError *float64 `json:"margin_of_error"`
	Percent       *float64 `json:"percent,omitempty"`
	PercentMOE    *float64 `json:"percent_margin_of_error,omitempty"`
}

type SourceStatus struct {
	ID          string    `json:"id"`
	Authority   string    `json:"authority"`
	URL         string    `json:"url"`
	Vintage     string    `json:"vintage"`
	RetrievedAt time.Time `json:"retrieved_at"`
	FreshUntil  time.Time `json:"fresh_until"`
	Status      string    `json:"status"`
}

type Profile struct {
	Geography           Geography    `json:"geography"`
	Population          Metric       `json:"population"`
	NoVehicleHouseholds Metric       `json:"no_vehicle_households"`
	LimitedEnglish      Metric       `json:"limited_english_population"`
	Disability          Metric       `json:"population_with_disability"`
	BelowPoverty        Metric       `json:"population_below_poverty"`
	Source              SourceStatus `json:"source"`
	Warnings            []string     `json:"warnings,omitempty"`
}

type Config struct {
	HTTPClient      *http.Client
	APIKey          string
	GeocoderURL     string
	DetailedURL     string
	SubjectURL      string
	CacheTTL        time.Duration
	Now             func() time.Time
	MaxCacheEntries int
}

type Client struct {
	httpClient  *http.Client
	apiKey      string
	geocoderURL string
	detailedURL string
	subjectURL  string
	cacheTTL    time.Duration
	now         func() time.Time
	maxEntries  int
	requests    singleflight.Group

	mu    sync.RWMutex
	cache map[string]Profile
}

type geocoderResponse struct {
	Result struct {
		Geographies map[string][]map[string]any `json:"geographies"`
	} `json:"result"`
}

func NewClient(config Config) *Client {
	httpClient := config.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 12 * time.Second}
	}
	cacheTTL := config.CacheTTL
	if cacheTTL <= 0 {
		cacheTTL = defaultCacheTTL
	}
	now := config.Now
	if now == nil {
		now = time.Now
	}
	maxEntries := config.MaxCacheEntries
	if maxEntries <= 0 {
		maxEntries = 512
	}
	return &Client{
		httpClient:  httpClient,
		apiKey:      strings.TrimSpace(config.APIKey),
		geocoderURL: valueOrDefault(config.GeocoderURL, defaultGeocoderURL),
		detailedURL: valueOrDefault(config.DetailedURL, defaultDetailedURL),
		subjectURL:  valueOrDefault(config.SubjectURL, defaultSubjectURL),
		cacheTTL:    cacheTTL,
		now:         now,
		maxEntries:  maxEntries,
		cache:       make(map[string]Profile),
	}
}

func (client *Client) CommunityProfile(
	ctx context.Context,
	latitude float64,
	longitude float64,
) (Profile, error) {
	if client.apiKey == "" {
		return Profile{}, ErrAPIKeyRequired
	}
	cacheKey := fmt.Sprintf("%.5f,%.5f", latitude, longitude)
	value, err, _ := client.requests.Do(cacheKey, func() (any, error) {
		return client.loadCommunityProfile(ctx, latitude, longitude, cacheKey)
	})
	if err != nil {
		return Profile{}, err
	}
	return cloneProfile(value.(Profile)), nil
}

func (client *Client) loadCommunityProfile(
	ctx context.Context,
	latitude float64,
	longitude float64,
	cacheKey string,
) (Profile, error) {
	now := client.now().UTC()
	if profile, ok := client.fresh(cacheKey, now); ok {
		return profile, nil
	}

	geography, err := client.resolveGeography(ctx, latitude, longitude)
	if err != nil {
		return Profile{}, err
	}

	type queryResult struct {
		values map[string]string
		err    error
	}
	detailedChannel := make(chan queryResult, 1)
	subjectChannel := make(chan queryResult, 1)
	go func() {
		values, err := client.queryDataset(ctx, client.detailedURL, geography, []string{
			"NAME",
			"B01003_001E", "B01003_001M",
			"B08201_001E", "B08201_001M",
			"B08201_002E", "B08201_002M",
		})
		detailedChannel <- queryResult{values: values, err: err}
	}()
	go func() {
		values, err := client.queryDataset(ctx, client.subjectURL, geography, []string{
			"S1601_C05_001E", "S1601_C05_001M",
			"S1601_C06_001E", "S1601_C06_001M",
			"S1810_C02_001E", "S1810_C02_001M",
			"S1810_C03_001E", "S1810_C03_001M",
			"S1701_C02_001E", "S1701_C02_001M",
			"S1701_C03_001E", "S1701_C03_001M",
		})
		subjectChannel <- queryResult{values: values, err: err}
	}()

	detailed := <-detailedChannel
	subject := <-subjectChannel
	if detailed.err != nil {
		return Profile{}, fmt.Errorf("Census detailed profile: %w", detailed.err)
	}
	if subject.err != nil {
		return Profile{}, fmt.Errorf("Census subject profile: %w", subject.err)
	}

	profile := Profile{
		Geography: geography,
		Population: metric(
			detailed.values,
			"B01003_001E",
			"B01003_001M",
			"",
			"",
		),
		NoVehicleHouseholds: metric(
			detailed.values,
			"B08201_002E",
			"B08201_002M",
			"",
			"",
		),
		LimitedEnglish: metric(
			subject.values,
			"S1601_C05_001E",
			"S1601_C05_001M",
			"S1601_C06_001E",
			"S1601_C06_001M",
		),
		Disability: metric(
			subject.values,
			"S1810_C02_001E",
			"S1810_C02_001M",
			"S1810_C03_001E",
			"S1810_C03_001M",
		),
		BelowPoverty: metric(
			subject.values,
			"S1701_C02_001E",
			"S1701_C02_001M",
			"S1701_C03_001E",
			"S1701_C03_001M",
		),
		Source: SourceStatus{
			ID:          "acs-5-year",
			Authority:   "U.S. Census Bureau",
			URL:         client.detailedURL,
			Vintage:     "2024 ACS 5-year",
			RetrievedAt: now,
			FreshUntil:  now.Add(client.cacheTTL),
			Status:      "fresh",
		},
		Warnings: []string{
			"ACS values are estimates for an aggregate Census tract, not facts about an individual household.",
			"Use margins of error when comparing small areas or prioritizing resources.",
		},
	}
	if total := parseNumber(detailed.values["B08201_001E"]); total != nil &&
		profile.NoVehicleHouseholds.Estimate != nil &&
		*total > 0 {
		percent := *profile.NoVehicleHouseholds.Estimate / *total * 100
		profile.NoVehicleHouseholds.Percent = &percent
	}
	client.store(cacheKey, profile)
	return profile, nil
}

func (client *Client) resolveGeography(
	ctx context.Context,
	latitude float64,
	longitude float64,
) (Geography, error) {
	query := url.Values{
		"x":         {strconv.FormatFloat(longitude, 'f', 6, 64)},
		"y":         {strconv.FormatFloat(latitude, 'f', 6, 64)},
		"benchmark": {"Public_AR_Current"},
		"vintage":   {"Current_Current"},
		"format":    {"json"},
	}
	var response geocoderResponse
	if err := client.getJSON(ctx, client.geocoderURL, query, &response); err != nil {
		return Geography{}, fmt.Errorf("Census geography lookup: %w", err)
	}
	tracts := response.Result.Geographies["Census Tracts"]
	if len(tracts) == 0 {
		return Geography{}, errors.New("Census geography lookup returned no tract")
	}
	tract := tracts[0]
	return Geography{
		StateCode:  fmt.Sprint(tract["STATE"]),
		CountyCode: fmt.Sprint(tract["COUNTY"]),
		TractCode:  fmt.Sprint(tract["TRACT"]),
		TractFIPS:  fmt.Sprint(tract["GEOID"]),
		Name:       fmt.Sprint(tract["NAME"]),
	}, nil
}

func (client *Client) queryDataset(
	ctx context.Context,
	endpoint string,
	geography Geography,
	variables []string,
) (map[string]string, error) {
	query := url.Values{
		"get": {strings.Join(variables, ",")},
		"for": {"tract:" + geography.TractCode},
		"in": {
			"state:" + geography.StateCode + " county:" + geography.CountyCode,
		},
		"key": {client.apiKey},
	}
	var rows [][]string
	if err := client.getJSON(ctx, endpoint, query, &rows); err != nil {
		return nil, err
	}
	if len(rows) < 2 {
		return nil, errors.New("Census API returned no data rows")
	}
	headers := rows[0]
	values := rows[1]
	if len(headers) != len(values) {
		return nil, errors.New("Census API returned mismatched headers and values")
	}
	result := make(map[string]string, len(headers))
	for index, header := range headers {
		result[header] = values[index]
	}
	return result, nil
}

func (client *Client) getJSON(
	ctx context.Context,
	endpoint string,
	query url.Values,
	target any,
) error {
	parsed, err := url.Parse(endpoint)
	if err != nil {
		return err
	}
	parsed.RawQuery = query.Encode()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return err
	}
	request.Header.Set(
		"User-Agent",
		"HawaiiResilienceAtlas/0.1 (https://github.com/chokevin/hawaii-resilience-map)",
	)
	response, err := client.httpClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4<<10))
		return fmt.Errorf(
			"HTTP %d: %s",
			response.StatusCode,
			strings.TrimSpace(string(body)),
		)
	}
	return json.NewDecoder(io.LimitReader(response.Body, 4<<20)).Decode(target)
}

func metric(
	values map[string]string,
	estimateKey string,
	marginKey string,
	percentKey string,
	percentMarginKey string,
) Metric {
	result := Metric{
		Estimate:      parseNumber(values[estimateKey]),
		MarginOfError: parseNumber(values[marginKey]),
	}
	if percentKey != "" {
		result.Percent = parseNumber(values[percentKey])
		result.PercentMOE = parseNumber(values[percentMarginKey])
	}
	return result
}

func parseNumber(value string) *float64 {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || trimmed == "null" {
		return nil
	}
	parsed, err := strconv.ParseFloat(trimmed, 64)
	if err != nil || parsed <= -666666 {
		return nil
	}
	return &parsed
}

func valueOrDefault(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func (client *Client) fresh(key string, now time.Time) (Profile, bool) {
	client.mu.RLock()
	defer client.mu.RUnlock()
	profile, ok := client.cache[key]
	if !ok || !now.Before(profile.Source.FreshUntil) {
		return Profile{}, false
	}
	return cloneProfile(profile), true
}

func (client *Client) store(key string, profile Profile) {
	client.mu.Lock()
	defer client.mu.Unlock()
	if _, exists := client.cache[key]; !exists &&
		len(client.cache) >= client.maxEntries {
		client.evictOldest()
	}
	client.cache[key] = cloneProfile(profile)
}

func (client *Client) evictOldest() {
	var oldestKey string
	var oldestRetrievedAt time.Time
	for key, profile := range client.cache {
		retrievedAt := profile.Source.RetrievedAt
		if oldestKey == "" || retrievedAt.Before(oldestRetrievedAt) {
			oldestKey = key
			oldestRetrievedAt = retrievedAt
		}
	}
	if oldestKey != "" {
		delete(client.cache, oldestKey)
	}
}

func cloneProfile(profile Profile) Profile {
	profile.Population = cloneMetric(profile.Population)
	profile.NoVehicleHouseholds = cloneMetric(profile.NoVehicleHouseholds)
	profile.LimitedEnglish = cloneMetric(profile.LimitedEnglish)
	profile.Disability = cloneMetric(profile.Disability)
	profile.BelowPoverty = cloneMetric(profile.BelowPoverty)
	profile.Warnings = append([]string(nil), profile.Warnings...)
	return profile
}

func cloneMetric(metric Metric) Metric {
	metric.Estimate = cloneFloat(metric.Estimate)
	metric.MarginOfError = cloneFloat(metric.MarginOfError)
	metric.Percent = cloneFloat(metric.Percent)
	metric.PercentMOE = cloneFloat(metric.PercentMOE)
	return metric
}

func cloneFloat(value *float64) *float64 {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}
