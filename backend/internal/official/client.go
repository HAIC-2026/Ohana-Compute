package official

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/arcgis"
)

const (
	stateGISAuthority = "Hawaiʻi Statewide GIS Program"
	femaAuthority     = "Federal Emergency Management Agency"

	tsunamiURL       = "https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/11/query"
	floodURL         = "https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/6/query"
	coastalFloodURL  = "https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/15/query"
	wildfireURL      = "https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/7/query"
	openSheltersURL  = "https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/MapServer/0/query"
	planningCacheTTL = 6 * time.Hour
	shelterCacheTTL  = 5 * time.Minute
)

type Querier interface {
	Query(context.Context, arcgis.Request) (arcgis.Result, error)
}

type Client struct {
	arcGIS Querier
}

type TsunamiRisk struct {
	Status      string                   `json:"status"`
	ZoneType    *string                  `json:"zone_type"`
	Description string                   `json:"description"`
	Geometry    arcgis.FeatureCollection `json:"geometry"`
	Sources     []arcgis.SourceStatus    `json:"sources"`
	Warnings    []string                 `json:"warnings,omitempty"`
}

type FloodRisk struct {
	Classification          string                   `json:"classification"`
	ZoneCode                *string                  `json:"zone_code"`
	ZoneSubtype             *string                  `json:"zone_subtype"`
	Title                   string                   `json:"title"`
	Description             string                   `json:"description"`
	CoastalPlanningExposure bool                     `json:"coastal_planning_exposure"`
	NearbyRiskGeometry      arcgis.FeatureCollection `json:"nearby_risk_geometry"`
	Sources                 []arcgis.SourceStatus    `json:"sources"`
	Warnings                []string                 `json:"warnings,omitempty"`
}

type WildfireRisk struct {
	Rating        string                   `json:"rating"`
	CommunityName *string                  `json:"community_name"`
	Title         string                   `json:"title"`
	Description   string                   `json:"description"`
	Geometry      arcgis.FeatureCollection `json:"geometry"`
	Sources       []arcgis.SourceStatus    `json:"sources"`
	Warnings      []string                 `json:"warnings,omitempty"`
}

type Shelter struct {
	ID                    string     `json:"id"`
	Name                  string     `json:"name"`
	Address               string     `json:"address"`
	City                  string     `json:"city"`
	Status                string     `json:"status"`
	Capacity              *int       `json:"capacity"`
	WheelchairAccessible  string     `json:"wheelchair_accessible"`
	PetAccommodationsCode string     `json:"pet_accommodations_code"`
	Organization          string     `json:"organization"`
	Coordinates           [2]float64 `json:"coordinates"`
	DistanceMiles         float64    `json:"distance_miles"`
}

type OpenShelters struct {
	Shelters     []Shelter             `json:"shelters"`
	Sources      []arcgis.SourceStatus `json:"sources"`
	Warnings     []string              `json:"warnings,omitempty"`
	QueryPartial bool                  `json:"-"`
}

func NewClient(arcGIS Querier) *Client {
	if arcGIS == nil {
		panic("official: ArcGIS querier is required")
	}
	return &Client{arcGIS: arcGIS}
}

func (client *Client) TsunamiRisk(
	ctx context.Context,
	latitude float64,
	longitude float64,
) (TsunamiRisk, error) {
	result, err := client.arcGIS.Query(ctx, pointQuery(
		"state-tsunami-zones",
		stateGISAuthority,
		tsunamiURL,
		latitude,
		longitude,
		"zone_type,zone_desc,zone_code,evac_zone,mapname",
		true,
		planningCacheTTL,
	))
	if err != nil {
		return TsunamiRisk{}, err
	}

	feature, ok := firstFeature(result.Collection)
	if !ok {
		return TsunamiRisk{
			Status:      "outside",
			Description: "This point is outside the mapped tsunami evacuation and extreme tsunami evacuation zones.",
			Geometry:    emptyCollection(),
			Sources:     []arcgis.SourceStatus{result.Source},
			Warnings:    result.Warnings,
		}, nil
	}

	zoneType := optionalString(feature.Properties, "zone_type")
	description := stringValue(
		feature.Properties,
		"zone_desc",
		"Follow official tsunami evacuation instructions.",
	)
	return TsunamiRisk{
		Status:      "inside",
		ZoneType:    zoneType,
		Description: description,
		Geometry: arcgis.FeatureCollection{
			Type:     "FeatureCollection",
			Features: []arcgis.Feature{feature},
		},
		Sources:  []arcgis.SourceStatus{result.Source},
		Warnings: result.Warnings,
	}, nil
}

func (client *Client) FloodRisk(
	ctx context.Context,
	latitude float64,
	longitude float64,
) (FloodRisk, error) {
	envelope := strings.Join([]string{
		formatCoordinate(longitude - 0.04),
		formatCoordinate(latitude - 0.035),
		formatCoordinate(longitude + 0.04),
		formatCoordinate(latitude + 0.035),
	}, ",")
	requests := []arcgis.Request{
		pointQuery(
			"state-dfirm-point",
			stateGISAuthority,
			floodURL,
			latitude,
			longitude,
			"fld_zone,zone_subty,sfha_tf,static_bfe,depth",
			false,
			planningCacheTTL,
		),
		{
			SourceID:  "state-dfirm-nearby",
			Authority: stateGISAuthority,
			URL:       floodURL,
			CacheTTL:  planningCacheTTL,
			Params: url.Values{
				"where":              {"sfha_tf='T' OR zone_subty='0.2 PCT ANNUAL CHANCE FLOOD HAZARD'"},
				"geometry":           {envelope},
				"geometryType":       {"esriGeometryEnvelope"},
				"inSR":               {"4326"},
				"spatialRel":         {"esriSpatialRelIntersects"},
				"outFields":          {"fld_zone,zone_subty,sfha_tf"},
				"returnGeometry":     {"true"},
				"outSR":              {"4326"},
				"maxAllowableOffset": {"0.00015"},
				"geometryPrecision":  {"5"},
			},
		},
		pointQuery(
			"state-coastal-flood-3-2ft",
			stateGISAuthority,
			coastalFloodURL,
			latitude,
			longitude,
			"zone",
			false,
			planningCacheTTL,
		),
	}

	results, err := queryAll(ctx, client.arcGIS, requests)
	if err != nil {
		return FloodRisk{}, err
	}
	point, _ := firstFeature(results[0].Collection)
	classification, zoneCode, zoneSubtype, title, description := classifyFlood(point.Properties)

	return FloodRisk{
		Classification:          classification,
		ZoneCode:                zoneCode,
		ZoneSubtype:             zoneSubtype,
		Title:                   title,
		Description:             description,
		CoastalPlanningExposure: len(results[2].Collection.Features) > 0,
		NearbyRiskGeometry:      results[1].Collection,
		Sources: []arcgis.SourceStatus{
			results[0].Source,
			results[1].Source,
			results[2].Source,
		},
		Warnings: combineWarnings(results...),
	}, nil
}

func (client *Client) WildfireRisk(
	ctx context.Context,
	latitude float64,
	longitude float64,
) (WildfireRisk, error) {
	result, err := client.arcGIS.Query(ctx, pointQuery(
		"state-fire-risk",
		stateGISAuthority,
		wildfireURL,
		latitude,
		longitude,
		"commu_name,risk_rating,island,zone",
		true,
		planningCacheTTL,
	))
	if err != nil {
		return WildfireRisk{}, err
	}

	feature, ok := firstFeature(result.Collection)
	if !ok {
		return WildfireRisk{
			Rating:      "Unmapped",
			Title:       "No statewide wildfire-risk area returned",
			Description: "The planning layer does not classify this point. That does not mean there is no wildfire or smoke risk during an active incident.",
			Geometry:    emptyCollection(),
			Sources:     []arcgis.SourceStatus{result.Source},
			Warnings:    result.Warnings,
		}, nil
	}

	rating := stringValue(feature.Properties, "risk_rating", "N/A")
	switch rating {
	case "High", "Medium", "Low", "N/A":
	default:
		rating = "N/A"
	}
	communityName := optionalString(feature.Properties, "commu_name")
	title := rating + " mapped wildfire risk"
	if communityName != nil {
		title += " · " + *communityName
	}
	return WildfireRisk{
		Rating:        rating,
		CommunityName: communityName,
		Title:         title,
		Description:   "This is a community planning risk rating, not a live fire perimeter. Follow current evacuation warnings, smoke conditions, and road closures.",
		Geometry: arcgis.FeatureCollection{
			Type:     "FeatureCollection",
			Features: []arcgis.Feature{feature},
		},
		Sources:  []arcgis.SourceStatus{result.Source},
		Warnings: result.Warnings,
	}, nil
}

func (client *Client) OpenShelters(
	ctx context.Context,
	latitude float64,
	longitude float64,
) (OpenShelters, error) {
	result, err := client.arcGIS.Query(ctx, arcgis.Request{
		SourceID:             "fema-open-shelters",
		Authority:            femaAuthority,
		URL:                  openSheltersURL,
		CacheTTL:             shelterCacheTTL,
		AllowPartialFeatures: true,
		Params: url.Values{
			"where":             {"1=1"},
			"geometry":          {"-161,18,-154,23"},
			"geometryType":      {"esriGeometryEnvelope"},
			"inSR":              {"4326"},
			"spatialRel":        {"esriSpatialRelIntersects"},
			"outFields":         {"*"},
			"returnGeometry":    {"true"},
			"outSR":             {"4326"},
			"resultRecordCount": {"21"},
		},
	})
	if err != nil {
		return OpenShelters{}, err
	}

	shelters := make([]Shelter, 0, len(result.Collection.Features))
	partial := result.Partial
	for _, feature := range result.Collection.Features {
		shelter, ok := reportedShelter(feature, latitude, longitude)
		if !ok {
			partial = true
			continue
		}
		shelters = append(shelters, shelter)
	}
	sort.Slice(shelters, func(first int, second int) bool {
		return shelters[first].DistanceMiles < shelters[second].DistanceMiles
	})

	return OpenShelters{
		Shelters:     shelters,
		Sources:      []arcgis.SourceStatus{result.Source},
		Warnings:     result.Warnings,
		QueryPartial: partial,
	}, nil
}

func pointQuery(
	sourceID string,
	authority string,
	endpoint string,
	latitude float64,
	longitude float64,
	outFields string,
	returnGeometry bool,
	cacheTTL time.Duration,
) arcgis.Request {
	return arcgis.Request{
		SourceID:  sourceID,
		Authority: authority,
		URL:       endpoint,
		CacheTTL:  cacheTTL,
		Params: url.Values{
			"geometry":           {formatCoordinate(longitude) + "," + formatCoordinate(latitude)},
			"geometryType":       {"esriGeometryPoint"},
			"inSR":               {"4326"},
			"spatialRel":         {"esriSpatialRelIntersects"},
			"outFields":          {outFields},
			"returnGeometry":     {strconv.FormatBool(returnGeometry)},
			"outSR":              {"4326"},
			"maxAllowableOffset": {"0.00015"},
			"geometryPrecision":  {"5"},
		},
	}
}

func queryAll(
	ctx context.Context,
	querier Querier,
	requests []arcgis.Request,
) ([]arcgis.Result, error) {
	results := make([]arcgis.Result, len(requests))
	errorsByIndex := make([]error, len(requests))
	var waitGroup sync.WaitGroup
	for index := range requests {
		waitGroup.Add(1)
		go func(index int) {
			defer waitGroup.Done()
			results[index], errorsByIndex[index] = querier.Query(ctx, requests[index])
		}(index)
	}
	waitGroup.Wait()
	for index, err := range errorsByIndex {
		if err != nil {
			return nil, fmt.Errorf("%s query failed: %w", requests[index].SourceID, err)
		}
	}
	return results, nil
}

func classifyFlood(properties map[string]any) (
	string,
	*string,
	*string,
	string,
	string,
) {
	zoneCode := optionalString(properties, "fld_zone")
	zoneSubtype := optionalString(properties, "zone_subty")
	specialFloodHazardArea := stringValue(properties, "sfha_tf", "") == "T"

	if specialFloodHazardArea {
		label := "A"
		if zoneCode != nil {
			label = *zoneCode
		}
		return "high", zoneCode, zoneSubtype,
			"Inside FEMA Zone " + label + " high-risk flood area",
			"This is a Special Flood Hazard Area with at least a 1% annual chance of flooding. A specific storm can flood beyond the mapped boundary."
	}
	if zoneSubtype != nil && strings.Contains(*zoneSubtype, "0.2 PCT ANNUAL CHANCE") {
		return "moderate", zoneCode, zoneSubtype,
			"Inside the 0.2%-annual-chance flood area",
			"This is a mapped moderate-risk flood area. Flooding can still be deeper or wider during a specific storm."
	}
	if zoneCode != nil && *zoneCode == "D" {
		return "undetermined", zoneCode, zoneSubtype,
			"Flood risk is undetermined (FEMA Zone D)",
			"FEMA has not completed a detailed flood analysis for this zone. Zone D does not mean low risk."
	}
	if zoneCode != nil && *zoneCode == "X" {
		return "lower-mapped", zoneCode, zoneSubtype,
			"Outside FEMA’s mapped high-risk flood area",
			"This point is in Zone X, but flooding can still occur outside mapped floodplains and during drainage, rainfall, or coastal events."
	}
	return "unmapped", zoneCode, zoneSubtype,
		"No FEMA flood-zone classification returned",
		"The official layer did not return a mapped classification for this point. Do not interpret that as no flood risk."
}

func firstFeature(collection arcgis.FeatureCollection) (arcgis.Feature, bool) {
	if len(collection.Features) == 0 {
		return arcgis.Feature{}, false
	}
	return collection.Features[0], true
}

func emptyCollection() arcgis.FeatureCollection {
	return arcgis.FeatureCollection{Type: "FeatureCollection", Features: []arcgis.Feature{}}
}

func optionalString(properties map[string]any, key string) *string {
	value, ok := properties[key]
	if !ok || value == nil {
		return nil
	}
	result := strings.TrimSpace(fmt.Sprint(value))
	if result == "" {
		return nil
	}
	return &result
}

func stringValue(properties map[string]any, key string, fallback string) string {
	value := optionalString(properties, key)
	if value == nil {
		return fallback
	}
	return *value
}

func pointCoordinates(geometry json.RawMessage) ([2]float64, bool) {
	var point struct {
		Type        string    `json:"type"`
		Coordinates []float64 `json:"coordinates"`
	}
	if err := json.Unmarshal(geometry, &point); err != nil ||
		point.Type != "Point" ||
		len(point.Coordinates) < 2 {
		return [2]float64{}, false
	}
	return [2]float64{point.Coordinates[0], point.Coordinates[1]}, true
}

func combineWarnings(results ...arcgis.Result) []string {
	var warnings []string
	for _, result := range results {
		warnings = append(warnings, result.Warnings...)
	}
	return warnings
}

func formatCoordinate(value float64) string {
	return strconv.FormatFloat(value, 'f', 6, 64)
}

func haversineMiles(
	firstLatitude float64,
	firstLongitude float64,
	secondLatitude float64,
	secondLongitude float64,
) float64 {
	const earthRadiusMiles = 3958.8
	firstLatRadians := firstLatitude * math.Pi / 180
	secondLatRadians := secondLatitude * math.Pi / 180
	latitudeDelta := (secondLatitude - firstLatitude) * math.Pi / 180
	longitudeDelta := (secondLongitude - firstLongitude) * math.Pi / 180
	a := math.Sin(latitudeDelta/2)*math.Sin(latitudeDelta/2) +
		math.Cos(firstLatRadians)*math.Cos(secondLatRadians)*
			math.Sin(longitudeDelta/2)*math.Sin(longitudeDelta/2)
	return earthRadiusMiles * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

func round(value float64, places int) float64 {
	factor := math.Pow(10, float64(places))
	return math.Round(value*factor) / factor
}
