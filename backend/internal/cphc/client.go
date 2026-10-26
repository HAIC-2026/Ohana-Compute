package cphc

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

const defaultFeedURL = "https://www.nhc.noaa.gov/gis-cp.xml"

type Product struct {
	Kind        string `json:"kind"`
	Title       string `json:"title"`
	URL         string `json:"url"`
	PublishedAt string `json:"published_at,omitempty"`
}

type Cyclone struct {
	ATCF        string    `json:"atcf"`
	Wallet      string    `json:"wallet"`
	Name        string    `json:"name"`
	Type        string    `json:"type"`
	Latitude    float64   `json:"latitude"`
	Longitude   float64   `json:"longitude"`
	Movement    string    `json:"movement"`
	Pressure    string    `json:"pressure"`
	Wind        string    `json:"wind"`
	Headline    string    `json:"headline"`
	AdvisoryAt  string    `json:"advisory_at"`
	PublishedAt string    `json:"published_at,omitempty"`
	AdvisoryURL string    `json:"advisory_url"`
	Products    []Product `json:"products"`
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
	Cyclones []Cyclone    `json:"cyclones"`
	Source   SourceStatus `json:"source"`
	Warnings []string     `json:"warnings,omitempty"`
}

type Config struct {
	HTTPClient *http.Client
	FeedURL    string
	UserAgent  string
	CacheTTL   time.Duration
	Now        func() time.Time
}

type Client struct {
	httpClient *http.Client
	feedURL    string
	userAgent  string
	cacheTTL   time.Duration
	now        func() time.Time

	mu     sync.RWMutex
	cached *Snapshot
}

type rss struct {
	Channel rssChannel `xml:"channel"`
}

type rssChannel struct {
	PublishedAt string    `xml:"pubDate"`
	Items       []rssItem `xml:"item"`
}

type rssItem struct {
	Title       string      `xml:"title"`
	GUID        string      `xml:"guid"`
	PublishedAt string      `xml:"pubDate"`
	URL         string      `xml:"link"`
	Description string      `xml:"description"`
	Cyclone     *rssCyclone `xml:"Cyclone"`
}

type rssCyclone struct {
	Center   string `xml:"center"`
	Type     string `xml:"type"`
	Name     string `xml:"name"`
	Wallet   string `xml:"wallet"`
	ATCF     string `xml:"atcf"`
	DateTime string `xml:"datetime"`
	Movement string `xml:"movement"`
	Pressure string `xml:"pressure"`
	Wind     string `xml:"wind"`
	Headline string `xml:"headline"`
}

func NewClient(config Config) *Client {
	httpClient := config.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 10 * time.Second}
	}
	feedURL := config.FeedURL
	if feedURL == "" {
		feedURL = defaultFeedURL
	}
	userAgent := config.UserAgent
	if userAgent == "" {
		userAgent = "HawaiiResilienceAtlas/0.1 (https://github.com/chokevin/hawaii-resilience-map)"
	}
	cacheTTL := config.CacheTTL
	if cacheTTL <= 0 {
		cacheTTL = 5 * time.Minute
	}
	now := config.Now
	if now == nil {
		now = time.Now
	}
	return &Client{
		httpClient: httpClient,
		feedURL:    feedURL,
		userAgent:  userAgent,
		cacheTTL:   cacheTTL,
		now:        now,
	}
}

func (client *Client) ActiveCyclones(ctx context.Context) (Snapshot, error) {
	now := client.now().UTC()
	if snapshot, ok := client.fresh(now); ok {
		return snapshot, nil
	}
	cached := client.cachedSnapshot()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, client.feedURL, nil)
	if err != nil {
		return Snapshot{}, fmt.Errorf("create CPHC request: %w", err)
	}
	request.Header.Set("Accept", "application/rss+xml, application/xml")
	request.Header.Set("User-Agent", client.userAgent)

	response, err := client.httpClient.Do(request)
	if err != nil {
		return staleOrError(cached, now, fmt.Errorf("request CPHC feed: %w", err))
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, response.Body)
		return staleOrError(cached, now, fmt.Errorf("CPHC feed returned HTTP %d", response.StatusCode))
	}

	var feed rss
	if err := xml.NewDecoder(io.LimitReader(response.Body, 4<<20)).Decode(&feed); err != nil {
		return staleOrError(cached, now, fmt.Errorf("decode CPHC feed: %w", err))
	}

	cyclones := normalizeCyclones(feed.Channel.Items)
	snapshot := Snapshot{
		Cyclones: cyclones,
		Source: SourceStatus{
			ID:            "nhc-cphc-gis",
			Authority:     "NOAA National Hurricane Center / Central Pacific Hurricane Center",
			URL:           client.feedURL,
			DataUpdatedAt: feed.Channel.PublishedAt,
			RetrievedAt:   now,
			FreshUntil:    now.Add(client.cacheTTL),
			Status:        "fresh",
		},
		Warnings: []string{
			"NOAA describes these GIS datasets as a convenience service that may not always receive timely support. Use official advisories and local emergency-management instructions for decisions.",
		},
	}
	client.store(snapshot)
	return cloneSnapshot(snapshot), nil
}

func normalizeCyclones(items []rssItem) []Cyclone {
	cyclones := make([]Cyclone, 0)
	for _, item := range items {
		if item.Cyclone == nil {
			continue
		}
		latitude, longitude, ok := parseCenter(item.Cyclone.Center)
		if !ok {
			continue
		}
		cyclones = append(cyclones, Cyclone{
			ATCF:        strings.TrimSpace(item.Cyclone.ATCF),
			Wallet:      strings.TrimSpace(item.Cyclone.Wallet),
			Name:        strings.TrimSpace(item.Cyclone.Name),
			Type:        strings.TrimSpace(item.Cyclone.Type),
			Latitude:    latitude,
			Longitude:   longitude,
			Movement:    strings.TrimSpace(item.Cyclone.Movement),
			Pressure:    strings.TrimSpace(item.Cyclone.Pressure),
			Wind:        strings.TrimSpace(item.Cyclone.Wind),
			Headline:    strings.TrimSpace(item.Cyclone.Headline),
			AdvisoryAt:  strings.TrimSpace(item.Cyclone.DateTime),
			PublishedAt: strings.TrimSpace(item.PublishedAt),
			AdvisoryURL: strings.TrimSpace(item.URL),
			Products:    []Product{},
		})
	}
	for index := range cyclones {
		for _, item := range items {
			if item.Cyclone != nil || !matchesCyclone(item.Title, cyclones[index]) {
				continue
			}
			cyclones[index].Products = append(cyclones[index].Products, Product{
				Kind:        classifyProduct(item.Title),
				Title:       strings.TrimSpace(item.Title),
				URL:         strings.TrimSpace(item.URL),
				PublishedAt: strings.TrimSpace(item.PublishedAt),
			})
		}
	}
	return cyclones
}

func matchesCyclone(title string, cyclone Cyclone) bool {
	lower := strings.ToLower(title)
	return cyclone.ATCF != "" && strings.Contains(lower, strings.ToLower(cyclone.ATCF)) ||
		cyclone.Name != "" && strings.Contains(lower, strings.ToLower(cyclone.Name))
}

func classifyProduct(title string) string {
	lower := strings.ToLower(title)
	switch {
	case strings.Contains(lower, "cone of uncertainty"):
		return "cone"
	case strings.Contains(lower, "forecast track"):
		return "forecast-track"
	case strings.Contains(lower, "wind field"):
		return "wind-field"
	case strings.Contains(lower, "best track"):
		return "best-track"
	case strings.Contains(lower, "arrival time"):
		return "wind-arrival-time"
	case strings.Contains(lower, "forecast"):
		return "forecast"
	default:
		return "other"
	}
}

func parseCenter(value string) (float64, float64, bool) {
	parts := strings.Split(value, ",")
	if len(parts) != 2 {
		return 0, 0, false
	}
	latitude, err := strconv.ParseFloat(strings.TrimSpace(parts[0]), 64)
	if err != nil {
		return 0, 0, false
	}
	longitude, err := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
	if err != nil {
		return 0, 0, false
	}
	return latitude, longitude, true
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
	stale.Warnings = append(stale.Warnings, fmt.Sprintf(
		"CPHC refresh failed; serving the last valid snapshot from %s: %v",
		cached.Source.RetrievedAt.Format(time.RFC3339),
		refreshErr,
	))
	return stale, nil
}

func cloneSnapshot(snapshot Snapshot) Snapshot {
	snapshot.Cyclones = append([]Cyclone(nil), snapshot.Cyclones...)
	for index := range snapshot.Cyclones {
		snapshot.Cyclones[index].Products = append(
			[]Product(nil),
			snapshot.Cyclones[index].Products...,
		)
	}
	snapshot.Warnings = append([]string(nil), snapshot.Warnings...)
	if snapshot.Source.RefreshAttemptedAt != nil {
		refreshAttemptedAt := *snapshot.Source.RefreshAttemptedAt
		snapshot.Source.RefreshAttemptedAt = &refreshAttemptedAt
	}
	return snapshot
}
