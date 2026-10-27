package usgs

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sync"
	"time"
)

const defaultComCatURL = "https://earthquake.usgs.gov/fdsnws/event/1/query"

type Event struct {
	ID        string  `json:"id"`
	Title     string  `json:"title"`
	DetailURL string  `json:"detail_url"`
	Time      string  `json:"time"`
	Updated   string  `json:"updated"`
	Magnitude float64 `json:"magnitude"`
	Type      string  `json:"type"`
	Tsunami   bool    `json:"tsunami"`
	Status    string  `json:"status"`
}

type SourceStatus struct {
	ID                 string     `json:"id"`
	Authority          string     `json:"authority"`
	URL                string     `json:"url"`
	DataUpdatedAt      string     `json:"data_updated_at,omitempty"`
	RetrievedAt        time.Time  `json:"retrieved_at"`
	RefreshAttemptedAt *time.Time `json:"refresh_attempted_at,omitempty"`
	FreshUntil         time.Time  `json:"fresh_until"`
	Status             string     `json:"status"`
}

type Snapshot struct {
	Events   []Event      `json:"events"`
	Source   SourceStatus `json:"source"`
	Warnings []string     `json:"warnings,omitempty"`
}

type Config struct {
	HTTPClient *http.Client
	ComCatURL  string
	UserAgent  string
	CacheTTL   time.Duration
	Lookback   time.Duration
	Now        func() time.Time
}

type Client struct {
	httpClient *http.Client
	comCatURL  string
	userAgent  string
	cacheTTL   time.Duration
	lookback   time.Duration
	now        func() time.Time

	mu     sync.RWMutex
	cached *Snapshot
}

type featureCollection struct {
	Metadata struct {
		Generated int64 `json:"generated"`
	} `json:"metadata"`
	Features []feature `json:"features"`
}

type feature struct {
	ID         string `json:"id"`
	Properties struct {
		Title   string  `json:"title"`
		URL     string  `json:"url"`
		Time    int64   `json:"time"`
		Updated int64   `json:"updated"`
		Mag     float64 `json:"mag"`
		Type    string  `json:"type"`
		Tsunami int     `json:"tsunami"`
		Status  string  `json:"status"`
	} `json:"properties"`
}

func NewClient(config Config) *Client {
	httpClient := config.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 10 * time.Second}
	}
	comCatURL := config.ComCatURL
	if comCatURL == "" {
		comCatURL = defaultComCatURL
	}
	userAgent := config.UserAgent
	if userAgent == "" {
		userAgent = "HawaiiResilienceAtlas/0.1 (https://github.com/chokevin/hawaii-resilience-map)"
	}
	cacheTTL := config.CacheTTL
	if cacheTTL <= 0 {
		cacheTTL = 2 * time.Minute
	}
	lookback := config.Lookback
	if lookback <= 0 {
		lookback = 24 * time.Hour
	}
	now := config.Now
	if now == nil {
		now = time.Now
	}
	return &Client{
		httpClient: httpClient,
		comCatURL:  comCatURL,
		userAgent:  userAgent,
		cacheTTL:   cacheTTL,
		lookback:   lookback,
		now:        now,
	}
}

func (client *Client) RecentEvents(ctx context.Context) (Snapshot, error) {
	now := client.now().UTC()
	if snapshot, ok := client.fresh(now); ok {
		return snapshot, nil
	}
	cached := client.cachedSnapshot()

	requestURL, err := url.Parse(client.comCatURL)
	if err != nil {
		return Snapshot{}, fmt.Errorf("parse USGS ComCat URL: %w", err)
	}
	query := requestURL.Query()
	query.Set("format", "geojson")
	query.Set("starttime", now.Add(-client.lookback).Format(time.RFC3339))
	query.Set("endtime", now.Format(time.RFC3339))
	query.Set("minlatitude", "18")
	query.Set("maxlatitude", "23")
	query.Set("minlongitude", "-161")
	query.Set("maxlongitude", "-154")
	query.Set("orderby", "time")
	requestURL.RawQuery = query.Encode()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL.String(), nil)
	if err != nil {
		return Snapshot{}, fmt.Errorf("create USGS ComCat request: %w", err)
	}
	request.Header.Set("Accept", "application/geo+json")
	request.Header.Set("User-Agent", client.userAgent)
	response, err := client.httpClient.Do(request)
	if err != nil {
		return staleOrError(cached, now, fmt.Errorf("request USGS ComCat: %w", err))
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, response.Body)
		return staleOrError(
			cached,
			now,
			fmt.Errorf("USGS ComCat returned HTTP %d", response.StatusCode),
		)
	}

	var collection featureCollection
	if err := json.NewDecoder(io.LimitReader(response.Body, 8<<20)).Decode(&collection); err != nil {
		return staleOrError(cached, now, fmt.Errorf("decode USGS ComCat: %w", err))
	}
	events := make([]Event, 0, len(collection.Features))
	for _, item := range collection.Features {
		events = append(events, Event{
			ID:        item.ID,
			Title:     item.Properties.Title,
			DetailURL: item.Properties.URL,
			Time:      millisecondsTime(item.Properties.Time),
			Updated:   millisecondsTime(item.Properties.Updated),
			Magnitude: item.Properties.Mag,
			Type:      item.Properties.Type,
			Tsunami:   item.Properties.Tsunami == 1,
			Status:    item.Properties.Status,
		})
	}
	snapshot := Snapshot{
		Events: events,
		Source: SourceStatus{
			ID:            "usgs-comcat",
			Authority:     "U.S. Geological Survey",
			URL:           client.comCatURL,
			DataUpdatedAt: millisecondsTime(collection.Metadata.Generated),
			RetrievedAt:   now,
			FreshUntil:    now.Add(client.cacheTTL),
			Status:        "fresh",
		},
	}
	client.store(snapshot)
	return cloneSnapshot(snapshot), nil
}

func millisecondsTime(value int64) string {
	if value <= 0 {
		return ""
	}
	return time.UnixMilli(value).UTC().Format(time.RFC3339)
}

func (client *Client) fresh(now time.Time) (Snapshot, bool) {
	client.mu.RLock()
	defer client.mu.RUnlock()
	if client.cached == nil || !now.Before(client.cached.Source.FreshUntil) {
		return Snapshot{}, false
	}
	return cloneSnapshot(*client.cached), true
}

func (client *Client) cachedSnapshot() *Snapshot {
	client.mu.RLock()
	defer client.mu.RUnlock()
	if client.cached == nil {
		return nil
	}
	snapshot := cloneSnapshot(*client.cached)
	return &snapshot
}

func (client *Client) store(snapshot Snapshot) {
	client.mu.Lock()
	defer client.mu.Unlock()
	copy := cloneSnapshot(snapshot)
	client.cached = &copy
}

func staleOrError(cached *Snapshot, now time.Time, refreshErr error) (Snapshot, error) {
	if cached == nil {
		return Snapshot{}, refreshErr
	}
	stale := cloneSnapshot(*cached)
	stale.Source.Status = "stale"
	stale.Source.RefreshAttemptedAt = &now
	stale.Warnings = []string{
		"USGS ComCat refresh failed; serving the last valid bounded Hawaiʻi snapshot: " +
			refreshErr.Error(),
	}
	return stale, nil
}

func cloneSnapshot(snapshot Snapshot) Snapshot {
	snapshot.Events = append([]Event(nil), snapshot.Events...)
	snapshot.Warnings = append([]string(nil), snapshot.Warnings...)
	if snapshot.Source.RefreshAttemptedAt != nil {
		attempted := *snapshot.Source.RefreshAttemptedAt
		snapshot.Source.RefreshAttemptedAt = &attempted
	}
	return snapshot
}
