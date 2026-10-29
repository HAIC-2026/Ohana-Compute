package census

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/url"
	"strings"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/arcgis"
)

const tigerGeographyURL = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2024/MapServer/8/query"

type GeographyQuerier interface {
	Query(context.Context, arcgis.Request) (arcgis.Result, error)
}

type GeographyResolution struct {
	Method        string               `json:"method"`
	Vintage       string               `json:"vintage"`
	SourceURL     string               `json:"source_url"`
	GeocoderError string               `json:"geocoder_error,omitempty"`
	Source        *arcgis.SourceStatus `json:"source,omitempty"`
	Warnings      []string             `json:"warnings,omitempty"`
}

func (client *Client) resolveTIGERweb(ctx context.Context, latitude, longitude float64, geocoderErr error) (Geography, error) {
	if math.IsNaN(latitude) || math.IsNaN(longitude) || math.IsInf(latitude, 0) || math.IsInf(longitude, 0) ||
		latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 {
		return Geography{}, errors.New("invalid coordinates for Census tract resolution")
	}
	result, err := client.arcGIS.Query(ctx, arcgis.Request{
		SourceID: "census-tigerweb-tracts", Authority: "U.S. Census Bureau", URL: tigerGeographyURL,
		CacheTTL: 24 * time.Hour,
		Params: url.Values{
			"geometry":     {fmt.Sprintf("%.6f,%.6f", longitude, latitude)},
			"geometryType": {"esriGeometryPoint"}, "inSR": {"4326"},
			"spatialRel": {"esriSpatialRelIntersects"}, "where": {"STATE = '15'"},
			"outFields": {"GEOID,STATE,COUNTY,TRACT,NAME"}, "returnGeometry": {"false"},
			"f": {"json"}, "resultRecordCount": {"2"},
		},
	})
	fail := func(reason error) (Geography, error) {
		return Geography{}, fmt.Errorf("%v; official TIGERweb alternative failed: %w", geocoderErr, reason)
	}
	if err != nil {
		return fail(err)
	}
	if len(result.Collection.Features) != 1 {
		return fail(fmt.Errorf("point intersection returned %d tracts; exactly one is required", len(result.Collection.Features)))
	}
	properties := result.Collection.Features[0].Properties
	text := func(key string) string {
		value, ok := properties[key].(string)
		if !ok {
			return ""
		}
		return value
	}
	state, county, tract, fips := text("STATE"), text("COUNTY"), text("TRACT"), text("GEOID")
	if state != "15" || !ValidHawaiiCounty(county) || len(tract) != 6 ||
		strings.Trim(tract, "0123456789") != "" || fips != state+county+tract {
		return fail(errors.New("point intersection returned inconsistent Hawaii tract identifiers"))
	}
	warnings := []string{
		"Census geocoder unavailable or invalid; tract resolved by exact point intersection with official Census TIGERweb ACS2024 boundaries. Original error: " + geocoderErr.Error(),
	}
	warnings = append(warnings, result.Warnings...)
	if result.Source.Status == "stale" {
		warnings = append(warnings, "TIGERweb tract resolution uses an explicitly stale last-valid official boundary response.")
	}
	return Geography{
		StateCode: state, CountyCode: county, TractCode: tract, TractFIPS: fips, Name: text("NAME"),
		Resolution: &GeographyResolution{
			Method: "tigerweb-acs2024-point-intersection", Vintage: "ACS2024",
			SourceURL: tigerGeographyURL, GeocoderError: geocoderErr.Error(),
			Source: &result.Source, Warnings: warnings,
		},
	}, nil
}
