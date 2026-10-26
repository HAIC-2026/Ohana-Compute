package ptwc

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

const defaultCAPURL = "https://www.tsunami.gov/events/xml/PHEBCAP.xml"

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

type Product struct {
	Identifier    string            `json:"identifier"`
	IncidentID    string            `json:"incident_id,omitempty"`
	SentAt        string            `json:"sent_at"`
	Status        string            `json:"status"`
	MessageType   string            `json:"message_type"`
	Event         string            `json:"event"`
	ActionLevel   string            `json:"action_level"`
	ResponseType  string            `json:"response_type,omitempty"`
	Urgency       string            `json:"urgency,omitempty"`
	Severity      string            `json:"severity,omitempty"`
	Certainty     string            `json:"certainty,omitempty"`
	Onset         string            `json:"onset,omitempty"`
	Expires       string            `json:"expires,omitempty"`
	IsCurrent     bool              `json:"is_current"`
	SenderName    string            `json:"sender_name,omitempty"`
	Headline      string            `json:"headline,omitempty"`
	Description   string            `json:"description,omitempty"`
	Instruction   string            `json:"instruction,omitempty"`
	Web           string            `json:"web,omitempty"`
	EventLocation string            `json:"event_location,omitempty"`
	Magnitude     string            `json:"magnitude,omitempty"`
	MagnitudeType string            `json:"magnitude_type,omitempty"`
	OriginTime    string            `json:"origin_time,omitempty"`
	Depth         string            `json:"depth,omitempty"`
	Latitude      *float64          `json:"latitude,omitempty"`
	Longitude     *float64          `json:"longitude,omitempty"`
	AffectedAreas []string          `json:"affected_areas"`
	Parameters    map[string]string `json:"parameters"`
}

type Snapshot struct {
	Product  Product      `json:"product"`
	Source   SourceStatus `json:"source"`
	Warnings []string     `json:"warnings,omitempty"`
}

type Config struct {
	HTTPClient *http.Client
	CAPURL     string
	UserAgent  string
	CacheTTL   time.Duration
	Now        func() time.Time
}

type Client struct {
	httpClient *http.Client
	capURL     string
	userAgent  string
	cacheTTL   time.Duration
	now        func() time.Time

	mu     sync.RWMutex
	cached *Snapshot
}

type capAlert struct {
	Identifier  string    `xml:"identifier"`
	Sent        string    `xml:"sent"`
	Status      string    `xml:"status"`
	MessageType string    `xml:"msgType"`
	Source      string    `xml:"source"`
	Incidents   string    `xml:"incidents"`
	Info        []capInfo `xml:"info"`
}

type capInfo struct {
	Event        string         `xml:"event"`
	ResponseType string         `xml:"responseType"`
	Urgency      string         `xml:"urgency"`
	Severity     string         `xml:"severity"`
	Certainty    string         `xml:"certainty"`
	Onset        string         `xml:"onset"`
	Expires      string         `xml:"expires"`
	SenderName   string         `xml:"senderName"`
	Headline     string         `xml:"headline"`
	Description  string         `xml:"description"`
	Instruction  string         `xml:"instruction"`
	Web          string         `xml:"web"`
	Parameters   []capParameter `xml:"parameter"`
	Areas        []capArea      `xml:"area"`
}

type capParameter struct {
	Name  string `xml:"valueName"`
	Value string `xml:"value"`
}

type capArea struct {
	Description string `xml:"areaDesc"`
	Circle      string `xml:"circle"`
}

func NewClient(config Config) *Client {
	httpClient := config.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 10 * time.Second}
	}
	capURL := config.CAPURL
	if capURL == "" {
		capURL = defaultCAPURL
	}
	userAgent := config.UserAgent
	if userAgent == "" {
		userAgent = "HawaiiResilienceAtlas/0.1 (https://github.com/chokevin/hawaii-resilience-map)"
	}
	cacheTTL := config.CacheTTL
	if cacheTTL <= 0 {
		cacheTTL = time.Minute
	}
	now := config.Now
	if now == nil {
		now = time.Now
	}
	return &Client{
		httpClient: httpClient,
		capURL:     capURL,
		userAgent:  userAgent,
		cacheTTL:   cacheTTL,
		now:        now,
	}
}

func (client *Client) LatestProduct(ctx context.Context) (Snapshot, error) {
	now := client.now().UTC()
	if snapshot, ok := client.fresh(now); ok {
		return snapshot, nil
	}
	cached := client.cachedSnapshot()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, client.capURL, nil)
	if err != nil {
		return Snapshot{}, fmt.Errorf("create PTWC request: %w", err)
	}
	request.Header.Set("Accept", "application/cap+xml, application/xml")
	request.Header.Set("User-Agent", client.userAgent)

	response, err := client.httpClient.Do(request)
	if err != nil {
		return staleOrError(cached, now, fmt.Errorf("request PTWC CAP: %w", err))
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, response.Body)
		return staleOrError(cached, now, fmt.Errorf("PTWC CAP returned HTTP %d", response.StatusCode))
	}

	var alert capAlert
	if err := xml.NewDecoder(io.LimitReader(response.Body, 4<<20)).Decode(&alert); err != nil {
		return staleOrError(cached, now, fmt.Errorf("decode PTWC CAP: %w", err))
	}
	if len(alert.Info) == 0 {
		return staleOrError(cached, now, fmt.Errorf("PTWC CAP did not contain an info block"))
	}

	product := normalizeProduct(alert, alert.Info[0], now)
	warnings := []string{
		"The PTWC endpoint returns its latest product. Feed silence or an expired information statement must not be interpreted as an all-clear; follow Hawaiʻi emergency-management instructions.",
	}
	if !product.IsCurrent {
		warnings = append(warnings, "The latest PTWC product is expired and is retained only as provenance for the most recently published statement.")
	}
	snapshot := Snapshot{
		Product: product,
		Source: SourceStatus{
			ID:            "ptwc-cap",
			Authority:     "NOAA Pacific Tsunami Warning Center",
			URL:           client.capURL,
			DataUpdatedAt: alert.Sent,
			RetrievedAt:   now,
			FreshUntil:    now.Add(client.cacheTTL),
			Status:        "fresh",
		},
		Warnings: warnings,
	}
	client.store(snapshot)
	return cloneSnapshot(snapshot), nil
}

func normalizeProduct(alert capAlert, info capInfo, now time.Time) Product {
	parameters := make(map[string]string, len(info.Parameters))
	for _, parameter := range info.Parameters {
		parameters[strings.TrimSpace(parameter.Name)] = strings.TrimSpace(parameter.Value)
	}
	areas := make([]string, 0, len(info.Areas))
	var latitude *float64
	var longitude *float64
	for _, area := range info.Areas {
		if value := strings.TrimSpace(area.Description); value != "" {
			areas = append(areas, value)
		}
		if latitude == nil {
			parsedLatitude, parsedLongitude, ok := parseCircle(area.Circle)
			if ok {
				latitude = &parsedLatitude
				longitude = &parsedLongitude
			}
		}
	}
	isCurrent := false
	if expires, err := time.Parse(time.RFC3339, strings.TrimSpace(info.Expires)); err == nil {
		isCurrent = now.Before(expires)
	}
	return Product{
		Identifier:    strings.TrimSpace(alert.Identifier),
		IncidentID:    strings.TrimSpace(alert.Incidents),
		SentAt:        strings.TrimSpace(alert.Sent),
		Status:        strings.TrimSpace(alert.Status),
		MessageType:   strings.TrimSpace(alert.MessageType),
		Event:         strings.TrimSpace(info.Event),
		ActionLevel:   classifyAction(info.Event),
		ResponseType:  strings.TrimSpace(info.ResponseType),
		Urgency:       strings.TrimSpace(info.Urgency),
		Severity:      strings.TrimSpace(info.Severity),
		Certainty:     strings.TrimSpace(info.Certainty),
		Onset:         strings.TrimSpace(info.Onset),
		Expires:       strings.TrimSpace(info.Expires),
		IsCurrent:     isCurrent,
		SenderName:    strings.TrimSpace(info.SenderName),
		Headline:      strings.TrimSpace(info.Headline),
		Description:   strings.TrimSpace(info.Description),
		Instruction:   strings.TrimSpace(info.Instruction),
		Web:           strings.TrimSpace(info.Web),
		EventLocation: parameters["EventLocationName"],
		Magnitude:     parameters["EventPreliminaryMagnitude"],
		MagnitudeType: parameters["EventPreliminaryMagnitudeType"],
		OriginTime:    parameters["EventOriginTime"],
		Depth:         parameters["EventDepth"],
		Latitude:      latitude,
		Longitude:     longitude,
		AffectedAreas: areas,
		Parameters:    parameters,
	}
}

func classifyAction(event string) string {
	lower := strings.ToLower(event)
	switch {
	case strings.Contains(lower, "cancel"):
		return "cancellation"
	case strings.Contains(lower, "warning"):
		return "warning"
	case strings.Contains(lower, "advisory"):
		return "advisory"
	case strings.Contains(lower, "watch"):
		return "watch"
	case strings.Contains(lower, "information"):
		return "information"
	default:
		return "other"
	}
}

func parseCircle(value string) (float64, float64, bool) {
	fields := strings.Fields(strings.TrimSpace(value))
	if len(fields) == 0 {
		return 0, 0, false
	}
	coordinates := strings.Split(fields[0], ",")
	if len(coordinates) != 2 {
		return 0, 0, false
	}
	latitude, err := strconv.ParseFloat(coordinates[0], 64)
	if err != nil {
		return 0, 0, false
	}
	longitude, err := strconv.ParseFloat(coordinates[1], 64)
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
		"PTWC refresh failed; serving the last valid snapshot from %s: %v",
		cached.Source.RetrievedAt.Format(time.RFC3339),
		refreshErr,
	))
	return stale, nil
}

func cloneSnapshot(snapshot Snapshot) Snapshot {
	snapshot.Product.AffectedAreas = append([]string(nil), snapshot.Product.AffectedAreas...)
	parameters := make(map[string]string, len(snapshot.Product.Parameters))
	for key, value := range snapshot.Product.Parameters {
		parameters[key] = value
	}
	snapshot.Product.Parameters = parameters
	snapshot.Warnings = append([]string(nil), snapshot.Warnings...)
	if snapshot.Product.Latitude != nil {
		latitude := *snapshot.Product.Latitude
		snapshot.Product.Latitude = &latitude
	}
	if snapshot.Product.Longitude != nil {
		longitude := *snapshot.Product.Longitude
		snapshot.Product.Longitude = &longitude
	}
	if snapshot.Source.RefreshAttemptedAt != nil {
		refreshAttemptedAt := *snapshot.Source.RefreshAttemptedAt
		snapshot.Source.RefreshAttemptedAt = &refreshAttemptedAt
	}
	return snapshot
}
