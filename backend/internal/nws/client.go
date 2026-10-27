package nws

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

const defaultAlertsURL = "https://api.weather.gov/alerts/active?area=HI"

type Alert struct {
	ID            string          `json:"id"`
	Hazard        string          `json:"hazard"`
	Event         string          `json:"event"`
	Headline      string          `json:"headline"`
	Area          string          `json:"area"`
	Severity      string          `json:"severity"`
	Certainty     string          `json:"certainty"`
	Urgency       string          `json:"urgency"`
	ResponseType  string          `json:"response_type,omitempty"`
	Effective     string          `json:"effective,omitempty"`
	Onset         string          `json:"onset,omitempty"`
	Expires       string          `json:"expires,omitempty"`
	Description   string          `json:"description"`
	Instruction   string          `json:"instruction,omitempty"`
	AffectedZones []string        `json:"affected_zones"`
	Geometry      json.RawMessage `json:"geometry"`
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
	Alerts   []Alert      `json:"alerts"`
	Source   SourceStatus `json:"source"`
	Warnings []string     `json:"warnings,omitempty"`
}

type Config struct {
	HTTPClient *http.Client
	AlertsURL  string
	UserAgent  string
	CacheTTL   time.Duration
	Now        func() time.Time
}

type Client struct {
	httpClient *http.Client
	alertsURL  string
	userAgent  string
	cacheTTL   time.Duration
	now        func() time.Time

	mu       sync.RWMutex
	cached   *Snapshot
	cacheTag string
}

type featureCollection struct {
	Updated  string    `json:"updated"`
	Features []feature `json:"features"`
}

type feature struct {
	ID         string          `json:"id"`
	Geometry   json.RawMessage `json:"geometry"`
	Properties properties      `json:"properties"`
}

type properties struct {
	ID            string   `json:"id"`
	Area          string   `json:"areaDesc"`
	AffectedZones []string `json:"affectedZones"`
	Effective     string   `json:"effective"`
	Onset         string   `json:"onset"`
	Expires       string   `json:"expires"`
	Severity      string   `json:"severity"`
	Certainty     string   `json:"certainty"`
	Urgency       string   `json:"urgency"`
	ResponseType  string   `json:"response"`
	Event         string   `json:"event"`
	Headline      string   `json:"headline"`
	Description   string   `json:"description"`
	Instruction   string   `json:"instruction"`
}

func NewClient(config Config) *Client {
	httpClient := config.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 10 * time.Second}
	}

	alertsURL := config.AlertsURL
	if alertsURL == "" {
		alertsURL = defaultAlertsURL
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
		alertsURL:  alertsURL,
		userAgent:  userAgent,
		cacheTTL:   cacheTTL,
		now:        now,
	}
}

func (client *Client) ActiveAlerts(ctx context.Context) (Snapshot, error) {
	now := client.now().UTC()
	if snapshot, ok := client.freshSnapshot(now); ok {
		return snapshot, nil
	}

	cached, etag := client.cachedSnapshot()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, client.alertsURL, nil)
	if err != nil {
		return Snapshot{}, fmt.Errorf("create NWS request: %w", err)
	}
	request.Header.Set("Accept", "application/geo+json")
	request.Header.Set("User-Agent", client.userAgent)
	if etag != "" {
		request.Header.Set("If-None-Match", etag)
	}

	response, err := client.httpClient.Do(request)
	if err != nil {
		return client.staleOrError(cached, now, fmt.Errorf("request NWS alerts: %w", err))
	}
	defer response.Body.Close()

	if response.StatusCode == http.StatusNotModified && cached != nil {
		refreshed := *cached
		refreshed.Source.RetrievedAt = now
		refreshed.Source.FreshUntil = now.Add(client.cacheTTL)
		refreshed.Source.Status = "fresh"
		refreshed.Warnings = nil
		client.store(refreshed, etag)
		return refreshed, nil
	}

	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, response.Body)
		return client.staleOrError(
			cached,
			now,
			fmt.Errorf("NWS alerts returned HTTP %d", response.StatusCode),
		)
	}

	var collection featureCollection
	decoder := json.NewDecoder(io.LimitReader(response.Body, 8<<20))
	if err := decoder.Decode(&collection); err != nil {
		return client.staleOrError(cached, now, fmt.Errorf("decode NWS alerts: %w", err))
	}

	alerts := make([]Alert, 0, len(collection.Features))
	for _, item := range collection.Features {
		id := item.Properties.ID
		if id == "" {
			id = item.ID
		}
		alerts = append(alerts, Alert{
			ID:            id,
			Hazard:        classifyHazard(item.Properties.Event),
			Event:         item.Properties.Event,
			Headline:      item.Properties.Headline,
			Area:          item.Properties.Area,
			Severity:      item.Properties.Severity,
			Certainty:     item.Properties.Certainty,
			Urgency:       item.Properties.Urgency,
			ResponseType:  item.Properties.ResponseType,
			Effective:     item.Properties.Effective,
			Onset:         item.Properties.Onset,
			Expires:       item.Properties.Expires,
			Description:   item.Properties.Description,
			Instruction:   item.Properties.Instruction,
			AffectedZones: item.Properties.AffectedZones,
			Geometry:      item.Geometry,
		})
	}

	snapshot := Snapshot{
		Alerts: alerts,
		Source: SourceStatus{
			ID:            "nws-hi-alerts",
			Authority:     "NOAA National Weather Service",
			URL:           client.alertsURL,
			DataUpdatedAt: collection.Updated,
			RetrievedAt:   now,
			FreshUntil:    now.Add(client.cacheTTL),
			Status:        "fresh",
		},
	}
	client.store(snapshot, response.Header.Get("ETag"))
	return snapshot, nil
}

func (client *Client) freshSnapshot(now time.Time) (Snapshot, bool) {
	client.mu.RLock()
	defer client.mu.RUnlock()
	if client.cached == nil || !now.Before(client.cached.Source.FreshUntil) {
		return Snapshot{}, false
	}
	return cloneSnapshot(*client.cached), true
}

func (client *Client) cachedSnapshot() (*Snapshot, string) {
	client.mu.RLock()
	defer client.mu.RUnlock()
	if client.cached == nil {
		return nil, client.cacheTag
	}
	snapshot := cloneSnapshot(*client.cached)
	return &snapshot, client.cacheTag
}

func (client *Client) store(snapshot Snapshot, etag string) {
	client.mu.Lock()
	defer client.mu.Unlock()
	copy := cloneSnapshot(snapshot)
	client.cached = &copy
	client.cacheTag = etag
}

func (client *Client) staleOrError(
	cached *Snapshot,
	now time.Time,
	refreshErr error,
) (Snapshot, error) {
	if cached == nil {
		return Snapshot{}, refreshErr
	}

	stale := cloneSnapshot(*cached)
	stale.Source.Status = "stale"
	stale.Source.RefreshAttemptedAt = &now
	stale.Warnings = []string{
		fmt.Sprintf(
			"NWS refresh failed; serving the last valid snapshot from %s: %v",
			cached.Source.RetrievedAt.Format(time.RFC3339),
			refreshErr,
		),
	}
	return stale, nil
}

func cloneSnapshot(snapshot Snapshot) Snapshot {
	snapshot.Alerts = append([]Alert(nil), snapshot.Alerts...)
	for index := range snapshot.Alerts {
		snapshot.Alerts[index].AffectedZones = append(
			[]string(nil),
			snapshot.Alerts[index].AffectedZones...,
		)
		snapshot.Alerts[index].Geometry = append(
			json.RawMessage(nil),
			snapshot.Alerts[index].Geometry...,
		)
	}
	snapshot.Warnings = append([]string(nil), snapshot.Warnings...)
	if snapshot.Source.RefreshAttemptedAt != nil {
		refreshAttemptedAt := *snapshot.Source.RefreshAttemptedAt
		snapshot.Source.RefreshAttemptedAt = &refreshAttemptedAt
	}
	return snapshot
}

func classifyHazard(event string) string {
	lower := strings.ToLower(event)
	switch {
	case strings.Contains(lower, "tsunami"):
		return "tsunami"
	case strings.Contains(lower, "hurricane"),
		strings.Contains(lower, "tropical storm"):
		return "hurricane"
	case strings.Contains(lower, "flood"):
		return "flood"
	case strings.Contains(lower, "red flag"),
		strings.Contains(lower, "fire weather"),
		strings.Contains(lower, "wildfire"):
		return "wildfire"
	default:
		return "weather"
	}
}
