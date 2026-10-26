package transportation

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/arcgis"
)

const defaultClosuresURL = "https://services.arcgis.com/HQ0xoN0EzDPBOEci/arcgis/rest/services/Lane_Closure_WFL1_View_NoEd/FeatureServer/0/query"

type Query struct {
	Latitude    float64   `json:"latitude"`
	Longitude   float64   `json:"longitude"`
	RadiusKM    float64   `json:"radius_km"`
	WindowStart time.Time `json:"window_start"`
	WindowEnd   time.Time `json:"window_end"`
}

type Closure struct {
	ID             string          `json:"id"`
	Island         string          `json:"island,omitempty"`
	Route          string          `json:"route,omitempty"`
	RoadName       string          `json:"road_name,omitempty"`
	ClosureType    string          `json:"closure_type,omitempty"`
	ClosureSide    string          `json:"closure_side,omitempty"`
	ClosureReason  string          `json:"closure_reason,omitempty"`
	ClosureHours   string          `json:"closure_hours,omitempty"`
	LanesClosed    *int            `json:"lanes_closed,omitempty"`
	StartTime      *time.Time      `json:"start_time,omitempty"`
	EndTime        *time.Time      `json:"end_time,omitempty"`
	LastUpdatedAt  *time.Time      `json:"last_updated_at,omitempty"`
	Summary        string          `json:"summary,omitempty"`
	PublicRemarks  string          `json:"public_remarks,omitempty"`
	Geometry       json.RawMessage `json:"geometry"`
	OfficialStatus string          `json:"official_status"`
}

type Snapshot struct {
	Query      Query               `json:"query"`
	Closures   []Closure           `json:"closures"`
	Source     arcgis.SourceStatus `json:"source"`
	Warnings   []string            `json:"warnings,omitempty"`
	Disclaimer string              `json:"disclaimer"`
}

type Config struct {
	QueryURL string
	CacheTTL time.Duration
	RadiusKM float64
	Window   time.Duration
	Now      func() time.Time
}

type Client struct {
	arcGIS   *arcgis.Client
	queryURL string
	cacheTTL time.Duration
	radiusKM float64
	window   time.Duration
	now      func() time.Time
}

func NewClient(arcGISClient *arcgis.Client, config Config) *Client {
	if arcGISClient == nil {
		panic("transportation: ArcGIS client is required")
	}
	queryURL := config.QueryURL
	if queryURL == "" {
		queryURL = defaultClosuresURL
	}
	cacheTTL := config.CacheTTL
	if cacheTTL <= 0 {
		cacheTTL = 5 * time.Minute
	}
	radiusKM := config.RadiusKM
	if radiusKM <= 0 {
		radiusKM = 30
	}
	window := config.Window
	if window <= 0 {
		window = 7 * 24 * time.Hour
	}
	now := config.Now
	if now == nil {
		now = time.Now
	}
	return &Client{
		arcGIS:   arcGISClient,
		queryURL: queryURL,
		cacheTTL: cacheTTL,
		radiusKM: radiusKM,
		window:   window,
		now:      now,
	}
}

func (client *Client) PlannedClosures(
	ctx context.Context,
	latitude float64,
	longitude float64,
) (Snapshot, error) {
	windowStart := client.now().UTC().Truncate(5 * time.Minute)
	windowEnd := windowStart.Add(client.window)
	params := url.Values{
		"where": {
			fmt.Sprintf(
				"(beginDate <= timestamp '%s' AND enDate >= timestamp '%s') AND Active = '1' AND DIRPInfo = 'Yes'",
				formatArcGISTime(windowEnd),
				formatArcGISTime(windowStart),
			),
		},
		"geometry": {
			fmt.Sprintf(
				"%s,%s",
				strconv.FormatFloat(longitude, 'f', 6, 64),
				strconv.FormatFloat(latitude, 'f', 6, 64),
			),
		},
		"geometryType":      {"esriGeometryPoint"},
		"inSR":              {"4326"},
		"spatialRel":        {"esriSpatialRelIntersects"},
		"distance":          {strconv.FormatFloat(client.radiusKM, 'f', -1, 64)},
		"units":             {"esriSRUnit_Kilometer"},
		"outFields":         {"OBJECTID,Route,RoadName,NumLanes,ClosReason,ClosHours,ClosType,ClosureSide,beginDate,enDate,EditDate,Remarks,DirPRemarks,Island,Active,DIRPInfo"},
		"returnGeometry":    {"true"},
		"outSR":             {"4326"},
		"orderByFields":     {"beginDate ASC"},
		"resultRecordCount": {"250"},
		"f":                 {"geojson"},
	}
	result, err := client.arcGIS.Query(ctx, arcgis.Request{
		SourceID:  "hdot-planned-lane-closures",
		Authority: "Hawaiʻi Department of Transportation",
		URL:       client.queryURL,
		Params:    params,
		CacheTTL:  client.cacheTTL,
	})
	if err != nil {
		return Snapshot{}, err
	}

	closures := make([]Closure, 0, len(result.Collection.Features))
	for _, feature := range result.Collection.Features {
		closures = append(closures, normalizeClosure(feature))
	}
	return Snapshot{
		Query: Query{
			Latitude:    latitude,
			Longitude:   longitude,
			RadiusKM:    client.radiusKM,
			WindowStart: windowStart,
			WindowEnd:   windowEnd,
		},
		Closures: closures,
		Source:   result.Source,
		Warnings: append(result.Warnings,
			"HDOT planned lane closures are scheduled construction and maintenance restrictions, not emergency road status or proof that a route is passable.",
			"Schedules may change without notice and all projects are weather permitting.",
		),
		Disclaimer: "Use county emergency instructions and verified live road status for evacuation decisions. Planned roadwork is route-planning context only.",
	}, nil
}

func normalizeClosure(feature arcgis.Feature) Closure {
	properties := feature.Properties
	id := strings.TrimSpace(fmt.Sprint(feature.ID))
	if id == "" || id == "<nil>" {
		id = stringValue(properties, "OBJECTID")
	}
	return Closure{
		ID:             id,
		Island:         stringValue(properties, "Island"),
		Route:          stringValue(properties, "Route"),
		RoadName:       stringValue(properties, "RoadName"),
		ClosureType:    stringValue(properties, "ClosType"),
		ClosureSide:    stringValue(properties, "ClosureSide"),
		ClosureReason:  stringValue(properties, "ClosReason"),
		ClosureHours:   stringValue(properties, "ClosHours"),
		LanesClosed:    intValue(properties, "NumLanes"),
		StartTime:      dateValue(properties, "beginDate"),
		EndTime:        dateValue(properties, "enDate"),
		LastUpdatedAt:  dateValue(properties, "EditDate"),
		Summary:        stringValue(properties, "DirPRemarks"),
		PublicRemarks:  stringValue(properties, "Remarks"),
		Geometry:       append(json.RawMessage(nil), feature.Geometry...),
		OfficialStatus: "planned",
	}
}

func stringValue(properties map[string]any, key string) string {
	value, ok := properties[key]
	if !ok || value == nil {
		return ""
	}
	result := strings.TrimSpace(fmt.Sprint(value))
	if result == "<nil>" {
		return ""
	}
	return result
}

func intValue(properties map[string]any, key string) *int {
	value, ok := properties[key]
	if !ok || value == nil {
		return nil
	}
	switch typed := value.(type) {
	case float64:
		result := int(typed)
		return &result
	case json.Number:
		parsed, err := typed.Int64()
		if err == nil {
			result := int(parsed)
			return &result
		}
	case string:
		parsed, err := strconv.Atoi(typed)
		if err == nil {
			return &parsed
		}
	}
	return nil
}

func dateValue(properties map[string]any, key string) *time.Time {
	value, ok := properties[key]
	if !ok || value == nil {
		return nil
	}
	var milliseconds int64
	switch typed := value.(type) {
	case float64:
		milliseconds = int64(typed)
	case json.Number:
		parsed, err := typed.Int64()
		if err != nil {
			return nil
		}
		milliseconds = parsed
	case string:
		parsed, err := strconv.ParseInt(typed, 10, 64)
		if err != nil {
			return nil
		}
		milliseconds = parsed
	default:
		return nil
	}
	result := time.UnixMilli(milliseconds).UTC()
	return &result
}

func formatArcGISTime(value time.Time) string {
	return value.UTC().Format("2006-01-02 15:04:05")
}
