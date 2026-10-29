package community

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/arcgis"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/census"
)

const tigerTractsURL = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2024/MapServer/8/query"

type CountyCensusReader interface {
	CountyProfiles(context.Context, string) ([]census.Profile, error)
}

type IndicatorDefinition struct {
	Label       string   `json:"label"`
	Universe    string   `json:"universe"`
	Variables   []string `json:"variables"`
	Proxy       bool     `json:"proxy"`
	Limitations string   `json:"limitations"`
}

type CMISTDomain struct {
	ID         string   `json:"id"`
	Label      string   `json:"label"`
	Indicators []string `json:"indicators"`
	Unknowns   []string `json:"unknowns"`
}

type LayerSource struct {
	arcgis.SourceStatus
	Vintage    string `json:"vintage"`
	CountyCode string `json:"county_code"`
}

type LayerSourceError struct {
	Source     string `json:"source"`
	CountyCode string `json:"county_code"`
	Error      string `json:"error"`
}

// AFNLayer is a GeoJSON FeatureCollection with foreign members for provenance
// and interpretation. It is aggregate screening evidence, never an AFN registry.
type AFNLayer struct {
	Type                 string                         `json:"type"`
	Features             []arcgis.Feature               `json:"features"`
	Status               string                         `json:"status"`
	Sources              []LayerSource                  `json:"sources"`
	SourceErrors         []LayerSourceError             `json:"source_errors"`
	CMISTDomains         []CMISTDomain                  `json:"cmist_domains"`
	IndicatorDefinitions map[string]IndicatorDefinition `json:"indicator_definitions"`
	Warnings             []string                       `json:"warnings"`
}

func (client *Client) AFNLayer(ctx context.Context, county string) (AFNLayer, error) {
	counties := []string{"001", "003", "005", "007", "009"}
	if county != "" {
		if !census.ValidHawaiiCounty(county) {
			return AFNLayer{}, errors.New("invalid Hawaii county FIPS")
		}
		counties = []string{county}
	}
	layer := AFNLayer{
		Type: "FeatureCollection", Features: []arcgis.Feature{}, Status: "complete",
		Sources: []LayerSource{}, SourceErrors: []LayerSourceError{},
		CMISTDomains: cmistDomains(), IndicatorDefinitions: indicatorDefinitions(),
		Warnings: []string{
			"Aggregate tract screening only: not individual needs, a registry, live incident conditions, or an evacuation decision.",
			"2024 ACS 5-year estimates and TIGERweb ACS2024 boundaries are joined to 2022 SVI by exact tract FIPS; unmatched or unavailable values remain null. Boundary changes can prevent a match.",
			"ACS margins of error are 90% confidence intervals; summed count MOEs use root-sum-of-squares approximation. Derived percentages do not have calculated MOEs.",
			"CMIST mappings are planning proxies, not a validated composite score. Medical equipment, caregiver availability, accessible vehicle demand, and current service disruptions are unknown.",
		},
	}
	results := make(chan AFNLayer, len(counties))
	for _, code := range counties {
		go func(code string) { results <- client.countyAFNLayer(ctx, code) }(code)
	}
	for range counties {
		result := <-results
		layer.Features = append(layer.Features, result.Features...)
		layer.Sources = append(layer.Sources, result.Sources...)
		layer.SourceErrors = append(layer.SourceErrors, result.SourceErrors...)
		layer.Warnings = append(layer.Warnings, result.Warnings...)
	}
	if len(layer.Features) == 0 {
		return AFNLayer{}, errors.New("Census TIGERweb tract geometry unavailable for requested counties")
	}
	if len(layer.SourceErrors) > 0 {
		layer.Status = "partial"
	}
	sort.Slice(layer.Features, func(i, j int) bool {
		return fmt.Sprint(layer.Features[i].ID) < fmt.Sprint(layer.Features[j].ID)
	})
	sort.Slice(layer.Sources, func(i, j int) bool {
		a, b := layer.Sources[i], layer.Sources[j]
		return a.CountyCode+a.ID < b.CountyCode+b.ID
	})
	sort.Slice(layer.SourceErrors, func(i, j int) bool {
		a, b := layer.SourceErrors[i], layer.SourceErrors[j]
		return a.CountyCode+a.Source+a.Error < b.CountyCode+b.Source+b.Error
	})
	sort.Strings(layer.Warnings)
	return layer, nil
}

func (client *Client) countyAFNLayer(ctx context.Context, county string) AFNLayer {
	layer := AFNLayer{}
	type arcResult struct {
		value arcgis.Result
		err   error
	}
	type acsResult struct {
		values []census.Profile
		err    error
	}
	geometryCh, sviCh, acsCh := make(chan arcResult, 1), make(chan arcResult, 1), make(chan acsResult, 1)
	query := func(source, authority, endpoint, where, fields string, geometry bool) (arcgis.Result, error) {
		started := time.Now()
		result, err := client.arcGIS.Query(ctx, arcgis.Request{
			SourceID: source, Authority: authority, URL: endpoint, CacheTTL: 24 * time.Hour,
			Params: url.Values{
				"where": {where}, "outFields": {fields}, "returnGeometry": {fmt.Sprint(geometry)},
				"outSR": {"4326"}, "f": {"geojson"}, "resultRecordCount": {"2000"},
			},
		})
		reportLayerObservation(ctx, source, started, err)
		return result, err
	}
	go func() {
		value, err := query("census-tigerweb-tracts", "U.S. Census Bureau", tigerTractsURL,
			"STATE = '15' AND COUNTY = '"+county+"'", "GEOID,STATE,COUNTY,TRACT,NAME", true)
		geometryCh <- arcResult{value, err}
	}()
	go func() {
		value, err := query("cdc-svi-2022", "CDC/ATSDR", cdcSVIURL,
			"STCNTY = '15"+county+"'", "FIPS,LOCATION,E_TOTPOP,E_AGE65,E_DISABL,E_LIMENG,E_NOVEH,RPL_THEMES,RPL_THEME1,RPL_THEME2,RPL_THEME3,RPL_THEME4", false)
		sviCh <- arcResult{value, err}
	}()
	go func() {
		started := time.Now()
		reader, ok := client.census.(CountyCensusReader)
		if !ok {
			err := errors.New("county ACS reader is unavailable")
			reportLayerObservation(ctx, "acs-5-year", started, err)
			acsCh <- acsResult{err: err}
			return
		}
		values, err := reader.CountyProfiles(ctx, county)
		reportLayerObservation(ctx, "acs-5-year", started, err)
		acsCh <- acsResult{values, err}
	}()
	geometry, svi, acs := <-geometryCh, <-sviCh, <-acsCh
	addError := func(source string, err error) {
		layer.SourceErrors = append(layer.SourceErrors, LayerSourceError{source, county, err.Error()})
	}
	addSource := func(source arcgis.SourceStatus, vintage string, warnings []string) {
		layer.Sources = append(layer.Sources, LayerSource{source, vintage, county})
		layer.Warnings = append(layer.Warnings, warnings...)
		if source.Status == "stale" {
			addError(source.ID, errors.New("serving explicitly stale last valid snapshot"))
		}
	}
	if geometry.err != nil {
		addError("census-tigerweb-tracts", geometry.err)
	} else {
		addSource(geometry.value.Source, "TIGERweb ACS2024", geometry.value.Warnings)
	}
	acsByFIPS := map[string]census.Profile{}
	if acs.err != nil {
		addError("acs-5-year", acs.err)
	} else if len(acs.values) == 0 {
		addError("acs-5-year", errors.New("Census API returned no tract profiles"))
	} else {
		source := acs.values[0].Source
		addSource(arcgis.SourceStatus{ID: source.ID, Authority: source.Authority, URL: source.URL,
			RetrievedAt: source.RetrievedAt, FreshUntil: source.FreshUntil, Status: source.Status}, source.Vintage, nil)
		for _, profile := range acs.values {
			acsByFIPS[profile.Geography.TractFIPS] = profile
		}
	}
	sviByFIPS := map[string]SVI{}
	if svi.err != nil {
		addError("cdc-svi-2022", svi.err)
	} else if len(svi.value.Collection.Features) == 0 {
		addError("cdc-svi-2022", errors.New("CDC SVI returned no tract rows"))
	} else {
		addSource(svi.value.Source, "2022 SVI (2018–2022 ACS)", svi.value.Warnings)
		for _, feature := range svi.value.Collection.Features {
			profile := sviFromProperties(feature.Properties, svi.value.Source)
			if strings.HasPrefix(profile.TractFIPS, "15"+county) {
				sviByFIPS[profile.TractFIPS] = profile
			}
		}
	}
	if geometry.err != nil {
		return layer
	}
	if len(geometry.value.Collection.Features) == 0 {
		addError("census-tigerweb-tracts", errors.New("TIGERweb returned no tract polygons"))
		return layer
	}
	seen := map[string]bool{}
	missingACS, missingSVI := false, false
	for _, feature := range geometry.value.Collection.Features {
		fips := text(feature.Properties, "GEOID")
		var shape struct {
			Type        string            `json:"type"`
			Coordinates []json.RawMessage `json:"coordinates"`
		}
		if len(fips) != 11 || !strings.HasPrefix(fips, "15"+county) || strings.Trim(fips, "0123456789") != "" ||
			seen[fips] || json.Unmarshal(feature.Geometry, &shape) != nil ||
			(shape.Type != "Polygon" && shape.Type != "MultiPolygon") || len(shape.Coordinates) == 0 {
			addError("census-tigerweb-tracts", errors.New("TIGERweb returned invalid or duplicate tract geometry; county omitted"))
			layer.Features = nil
			return layer
		}
		seen[fips] = true
		profile, hasACS := acsByFIPS[fips]
		missingACS = missingACS || !hasACS
		var sviProfile *SVI
		if value, ok := sviByFIPS[fips]; ok {
			sviProfile = &value
		} else {
			missingSVI = true
		}
		name := profile.Geography.Name
		if name == "" {
			name = text(feature.Properties, "NAME")
		}
		layer.Features = append(layer.Features, arcgis.Feature{
			Type: "Feature", ID: fips, Geometry: feature.Geometry,
			Properties: map[string]any{
				"tract_fips": fips, "county_code": county, "name": name,
				"indicators": profileIndicators(profile), "svi": sviProfile,
			},
		})
	}
	if missingACS && acs.err == nil {
		addError("acs-5-year", errors.New("some TIGERweb tracts have no matching ACS profile; values are unknown"))
	}
	if missingSVI && svi.err == nil {
		addError("cdc-svi-2022", errors.New("some TIGERweb tracts have no matching 2022 SVI; values are unknown"))
	}
	return layer
}

func reportLayerObservation(ctx context.Context, source string, started time.Time, err error) {
	outcome := "success"
	if err != nil {
		outcome = "error"
	}
	ReportSourceObservation(ctx, SourceObservation{source, outcome, time.Since(started)})
}

func profileIndicators(profile census.Profile) map[string]census.Metric {
	return map[string]census.Metric{
		"population": profile.Population, "no_vehicle_households": profile.NoVehicleHouseholds,
		"limited_english_population": profile.LimitedEnglish, "population_with_disability": profile.Disability,
		"population_below_poverty": profile.BelowPoverty, "kupuna_living_alone": profile.KupunaLivingAlone,
		"housing_50_plus_units": profile.Housing50PlusUnits, "incomplete_plumbing": profile.IncompletePlumbing,
		"no_internet_subscription": profile.NoInternetSubscription,
	}
}

func cmistDomains() []CMISTDomain {
	return []CMISTDomain{
		{"communication", "Communication", []string{"limited_english_population", "no_internet_subscription"}, []string{"Preferred language and accessible warning format", "Phone service, warning receipt, and live communications outages"}},
		{"maintaining_health", "Maintaining health", []string{"population_with_disability", "incomplete_plumbing", "population_below_poverty"}, []string{"Medical equipment, oxygen, dialysis, medication refrigeration, and current water or power outage"}},
		{"independence", "Independence", []string{"population_with_disability", "housing_50_plus_units"}, []string{"Individual assistance needs, building height, elevator dependence, and accessible entrances"}},
		{"support_safety_self_determination", "Support, safety and self-determination", []string{"kupuna_living_alone"}, []string{"Caregiver availability, social support, consent, and ability to evacuate"}},
		{"transportation", "Transportation", []string{"no_vehicle_households"}, []string{"Accessible vehicle demand, driver availability, transit service, and evacuation intent"}},
	}
}

func indicatorDefinitions() map[string]IndicatorDefinition {
	return map[string]IndicatorDefinition{
		"population":                 {"Population", "People", []string{"B01003_001"}, false, "Tract estimate, not current occupancy."},
		"no_vehicle_households":      {"Households without a vehicle", "Households (percentage denominator B08201_001)", []string{"B08201_002"}, true, "No vehicle availability does not establish evacuation transportation need."},
		"limited_english_population": {"Speak English less than very well", "Population age 5+ (S1601)", []string{"S1601_C05_001", "S1601_C06_001"}, true, "Not preferred language or accessible communication requirements."},
		"population_with_disability": {"Population with a disability", "Civilian noninstitutionalized population (S1810)", []string{"S1810_C02_001", "S1810_C03_001"}, true, "Does not identify medical equipment dependence or individual support needs."},
		"population_below_poverty":   {"Population below poverty level", "Population for whom poverty status is determined (S1701)", []string{"S1701_C02_001", "S1701_C03_001"}, true, "Income proxy only, not current resources or resilience."},
		"kupuna_living_alone":        {"Kūpuna age 65+ living alone", "Householders age 65+ living alone (percentage of all households, B11001_001)", []string{"B11010_005", "B11010_012"}, true, "Sum of male and female householders; living alone is not absence of caregivers or inability to evacuate."},
		"housing_50_plus_units":      {"Housing units in structures with 50+ units", "Housing units (percentage denominator B25024_001)", []string{"B25024_009"}, true, "Housing-density proxy, not building height, elevator dependence, or a count of buildings."},
		"incomplete_plumbing":        {"Housing units lacking complete plumbing", "Housing units (percentage denominator B25047_001)", []string{"B25047_003"}, true, "Housing-quality proxy, not a medical need or current water outage."},
		"no_internet_subscription":   {"Households without an internet subscription", "Households (percentage denominator B28002_001)", []string{"B28002_012", "B28002_013"}, true, "Access without a subscription plus no access; does not measure phone service, current outages, or warning receipt."},
	}
}
