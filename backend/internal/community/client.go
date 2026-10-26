package community

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"sync"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/arcgis"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/census"
)

const (
	cdcSVIURL  = "https://onemap.cdc.gov/onemapservices/rest/services/SVI/CDC_ATSDR_Social_Vulnerability_Index_2022_USA/FeatureServer/2/query"
	emPOWERURL = "https://services2.arcgis.com/ZQ4jTQn6k7VPXEwO/arcgis/rest/services/HHS_emPOWER_REST_Service_Public/FeatureServer/1/query"
	femaNRIURL = "https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Census_Tracts/FeatureServer/0/query"
)

type Querier interface {
	Query(context.Context, arcgis.Request) (arcgis.Result, error)
}

type CensusReader interface {
	CommunityProfile(context.Context, float64, float64) (census.Profile, error)
}

type SourceObservation struct {
	Source   string
	Outcome  string
	Duration time.Duration
}

type sourceObserverKey struct{}

func WithSourceObserver(
	ctx context.Context,
	observer func(SourceObservation),
) context.Context {
	return context.WithValue(ctx, sourceObserverKey{}, observer)
}

func ReportSourceObservation(
	ctx context.Context,
	observation SourceObservation,
) {
	observer, ok := ctx.Value(sourceObserverKey{}).(func(SourceObservation))
	if ok && observer != nil {
		observer(observation)
	}
}

type Client struct {
	arcGIS Querier
	census CensusReader
}

type SVI struct {
	TractFIPS                          string              `json:"tract_fips"`
	Location                           string              `json:"location"`
	Population                         *int                `json:"population"`
	Age65OrOlder                       *int                `json:"age_65_or_older"`
	WithDisability                     *int                `json:"with_disability"`
	LimitedEnglish                     *int                `json:"limited_english"`
	NoVehicleHouseholds                *int                `json:"no_vehicle_households"`
	OverallPercentile                  *float64            `json:"overall_percentile"`
	SocioeconomicPercentile            *float64            `json:"socioeconomic_percentile"`
	HouseholdCharacteristicsPercentile *float64            `json:"household_characteristics_percentile"`
	RacialEthnicMinorityPercentile     *float64            `json:"racial_ethnic_minority_percentile"`
	HousingTransportationPercentile    *float64            `json:"housing_transportation_percentile"`
	Source                             arcgis.SourceStatus `json:"source"`
	Warnings                           []string            `json:"warnings,omitempty"`
}

type ProtectedCount struct {
	Value                  *int `json:"value"`
	MayRepresentMaskedCell bool `json:"may_represent_masked_cell"`
}

type EmPOWER struct {
	State                      string              `json:"state"`
	County                     string              `json:"county"`
	ZIPCode                    string              `json:"zip_code"`
	MedicareBeneficiaries      ProtectedCount      `json:"medicare_beneficiaries"`
	PowerDependentDME          ProtectedCount      `json:"power_dependent_dme"`
	FacilityDialysisAnyDME     ProtectedCount      `json:"facility_dialysis_any_dme"`
	OxygenServicesAnyDME       ProtectedCount      `json:"oxygen_services_any_dme"`
	HomeHealthServicesAnyDME   ProtectedCount      `json:"home_health_services_any_dme"`
	AtHomeHospiceAnyDME        ProtectedCount      `json:"at_home_hospice_any_dme"`
	AnyHealthcareServiceAnyDME ProtectedCount      `json:"any_healthcare_service_any_dme"`
	Source                     arcgis.SourceStatus `json:"source"`
	Warnings                   []string            `json:"warnings,omitempty"`
}

type NationalRisk struct {
	ID                        string              `json:"id"`
	State                     string              `json:"state"`
	County                    string              `json:"county"`
	Tract                     string              `json:"tract"`
	TractFIPS                 string              `json:"tract_fips"`
	Population2020            *int                `json:"population_2020"`
	RiskScore                 *float64            `json:"risk_score"`
	RiskRating                string              `json:"risk_rating"`
	ExpectedAnnualLossScore   *float64            `json:"expected_annual_loss_score"`
	ExpectedAnnualLossRating  string              `json:"expected_annual_loss_rating"`
	SocialVulnerabilityScore  *float64            `json:"social_vulnerability_score"`
	SocialVulnerabilityRating string              `json:"social_vulnerability_rating"`
	CommunityResilienceScore  *float64            `json:"community_resilience_score"`
	CommunityResilienceRating string              `json:"community_resilience_rating"`
	Source                    arcgis.SourceStatus `json:"source"`
	Warnings                  []string            `json:"warnings,omitempty"`
}

type SourceError struct {
	Source string `json:"source"`
	Error  string `json:"error"`
}

type Profile struct {
	ACS          *census.Profile `json:"acs,omitempty"`
	SVI          *SVI            `json:"svi,omitempty"`
	EmPOWER      *EmPOWER        `json:"empower,omitempty"`
	NationalRisk *NationalRisk   `json:"fema_national_risk,omitempty"`
	SourceErrors []SourceError   `json:"source_errors,omitempty"`
	Disclaimer   string          `json:"disclaimer"`
}

func NewClient(arcGIS Querier, censusClient CensusReader) *Client {
	if arcGIS == nil {
		panic("community: ArcGIS querier is required")
	}
	if censusClient == nil {
		panic("community: Census reader is required")
	}
	return &Client{arcGIS: arcGIS, census: censusClient}
}

func (client *Client) ACS(
	ctx context.Context,
	latitude float64,
	longitude float64,
) (census.Profile, error) {
	return client.census.CommunityProfile(ctx, latitude, longitude)
}

func (client *Client) SVI(
	ctx context.Context,
	latitude float64,
	longitude float64,
) (SVI, error) {
	result, err := client.arcGIS.Query(ctx, pointRequest(
		"cdc-svi-2022",
		"CDC/ATSDR",
		cdcSVIURL,
		latitude,
		longitude,
		"FIPS,LOCATION,E_TOTPOP,E_AGE65,E_DISABL,E_LIMENG,E_NOVEH,RPL_THEMES,RPL_THEME1,RPL_THEME2,RPL_THEME3,RPL_THEME4",
	))
	if err != nil {
		return SVI{}, err
	}
	properties, err := firstProperties(result)
	if err != nil {
		return SVI{}, err
	}
	return SVI{
		TractFIPS:                          text(properties, "FIPS"),
		Location:                           text(properties, "LOCATION"),
		Population:                         integer(properties, "E_TOTPOP"),
		Age65OrOlder:                       integer(properties, "E_AGE65"),
		WithDisability:                     integer(properties, "E_DISABL"),
		LimitedEnglish:                     integer(properties, "E_LIMENG"),
		NoVehicleHouseholds:                integer(properties, "E_NOVEH"),
		OverallPercentile:                  number(properties, "RPL_THEMES"),
		SocioeconomicPercentile:            number(properties, "RPL_THEME1"),
		HouseholdCharacteristicsPercentile: number(properties, "RPL_THEME2"),
		RacialEthnicMinorityPercentile:     number(properties, "RPL_THEME3"),
		HousingTransportationPercentile:    number(properties, "RPL_THEME4"),
		Source:                             result.Source,
		Warnings: []string{
			"SVI is a relative tract-level planning index based on 2018–2022 ACS data, not a resident-level assessment.",
			"Use component measures and local context; do not use one percentile as an evacuation decision.",
		},
	}, nil
}

func (client *Client) EmPOWER(
	ctx context.Context,
	latitude float64,
	longitude float64,
) (EmPOWER, error) {
	result, err := client.arcGIS.Query(ctx, pointRequest(
		"hhs-empower",
		"U.S. Department of Health and Human Services",
		emPOWERURL,
		latitude,
		longitude,
		"STATE,COUNTY,Zip_Code,Medicare_Benes,Power_Dependent_Devices_DME,Facility_ESRD_Dialysis_Any_DME,O2_Services_Any_DME,Home_Health_Services_Any_DME,AtHome_Hospice_Any_DME,Any_Healthcare_Srvc_Any_DME",
	))
	if err != nil {
		return EmPOWER{}, err
	}
	properties, err := firstProperties(result)
	if err != nil {
		return EmPOWER{}, err
	}
	return EmPOWER{
		State:                      text(properties, "STATE"),
		County:                     text(properties, "COUNTY"),
		ZIPCode:                    text(properties, "Zip_Code"),
		MedicareBeneficiaries:      protectedCount(properties, "Medicare_Benes"),
		PowerDependentDME:          protectedCount(properties, "Power_Dependent_Devices_DME"),
		FacilityDialysisAnyDME:     protectedCount(properties, "Facility_ESRD_Dialysis_Any_DME"),
		OxygenServicesAnyDME:       protectedCount(properties, "O2_Services_Any_DME"),
		HomeHealthServicesAnyDME:   protectedCount(properties, "Home_Health_Services_Any_DME"),
		AtHomeHospiceAnyDME:        protectedCount(properties, "AtHome_Hospice_Any_DME"),
		AnyHealthcareServiceAnyDME: protectedCount(properties, "Any_Healthcare_Srvc_Any_DME"),
		Source:                     result.Source,
		Warnings: []string{
			"emPOWER contains de-identified aggregate Medicare data and does not identify individual residents.",
			"A displayed value of 11 may represent an actual count of 11 or a privacy-masked count from 1 through 10.",
			"Counts exclude people covered only by State Medicaid and may use different equipment look-back periods.",
		},
	}, nil
}

func (client *Client) NationalRisk(
	ctx context.Context,
	latitude float64,
	longitude float64,
) (NationalRisk, error) {
	result, err := client.arcGIS.Query(ctx, pointRequest(
		"fema-nri",
		"Federal Emergency Management Agency",
		femaNRIURL,
		latitude,
		longitude,
		"NRI_ID,STATE,COUNTY,TRACT,TRACTFIPS,POPULATION,RISK_SCORE,RISK_RATNG,EAL_SCORE,EAL_RATNG,SOVI_SCORE,SOVI_RATNG,RESL_SCORE,RESL_RATNG",
	))
	if err != nil {
		return NationalRisk{}, err
	}
	properties, err := firstProperties(result)
	if err != nil {
		return NationalRisk{}, err
	}
	return NationalRisk{
		ID:                        text(properties, "NRI_ID"),
		State:                     text(properties, "STATE"),
		County:                    text(properties, "COUNTY"),
		Tract:                     text(properties, "TRACT"),
		TractFIPS:                 text(properties, "TRACTFIPS"),
		Population2020:            integer(properties, "POPULATION"),
		RiskScore:                 number(properties, "RISK_SCORE"),
		RiskRating:                text(properties, "RISK_RATNG"),
		ExpectedAnnualLossScore:   number(properties, "EAL_SCORE"),
		ExpectedAnnualLossRating:  text(properties, "EAL_RATNG"),
		SocialVulnerabilityScore:  number(properties, "SOVI_SCORE"),
		SocialVulnerabilityRating: text(properties, "SOVI_RATNG"),
		CommunityResilienceScore:  number(properties, "RESL_SCORE"),
		CommunityResilienceRating: text(properties, "RESL_RATNG"),
		Source:                    result.Source,
		Warnings: []string{
			"FEMA National Risk Index is a long-term tract-level planning baseline, not a live incident condition.",
			"Do not use the composite rating to declare a road, shelter, or household safe.",
		},
	}, nil
}

func (client *Client) Profile(
	ctx context.Context,
	latitude float64,
	longitude float64,
) (Profile, error) {
	profile := Profile{
		Disclaimer: "All values describe aggregate planning geographies. They must not be used to infer an individual's disability, language, medical equipment, income, transportation access, or evacuation behavior.",
	}

	type result struct {
		source string
		value  any
		err    error
	}
	channel := make(chan result, 4)
	var waitGroup sync.WaitGroup
	run := func(source string, load func() (any, error)) {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			started := time.Now()
			value, err := load()
			outcome := "success"
			if err != nil {
				outcome = "error"
			}
			ReportSourceObservation(ctx, SourceObservation{
				Source:   source,
				Outcome:  outcome,
				Duration: time.Since(started),
			})
			channel <- result{source: source, value: value, err: err}
		}()
	}
	run("acs-5-year", func() (any, error) {
		return client.ACS(ctx, latitude, longitude)
	})
	run("cdc-svi-2022", func() (any, error) {
		return client.SVI(ctx, latitude, longitude)
	})
	run("hhs-empower", func() (any, error) {
		return client.EmPOWER(ctx, latitude, longitude)
	})
	run("fema-nri", func() (any, error) {
		return client.NationalRisk(ctx, latitude, longitude)
	})
	go func() {
		waitGroup.Wait()
		close(channel)
	}()

	successes := 0
	for item := range channel {
		if item.err != nil {
			profile.SourceErrors = append(profile.SourceErrors, SourceError{
				Source: item.source,
				Error:  item.err.Error(),
			})
			continue
		}
		successes++
		switch item.source {
		case "acs-5-year":
			value := item.value.(census.Profile)
			profile.ACS = &value
		case "cdc-svi-2022":
			value := item.value.(SVI)
			profile.SVI = &value
		case "hhs-empower":
			value := item.value.(EmPOWER)
			profile.EmPOWER = &value
		case "fema-nri":
			value := item.value.(NationalRisk)
			profile.NationalRisk = &value
		}
	}
	if successes == 0 {
		return Profile{}, errors.New("all community planning sources are unavailable")
	}
	return profile, nil
}

func pointRequest(
	sourceID string,
	authority string,
	endpoint string,
	latitude float64,
	longitude float64,
	outFields string,
) arcgis.Request {
	return arcgis.Request{
		SourceID:  sourceID,
		Authority: authority,
		URL:       endpoint,
		CacheTTL:  24 * time.Hour,
		Params: url.Values{
			"geometry":       {fmt.Sprintf("%.6f,%.6f", longitude, latitude)},
			"geometryType":   {"esriGeometryPoint"},
			"inSR":           {"4326"},
			"spatialRel":     {"esriSpatialRelIntersects"},
			"outFields":      {outFields},
			"returnGeometry": {"false"},
			"f":              {"json"},
		},
	}
}

func firstProperties(result arcgis.Result) (map[string]any, error) {
	if len(result.Collection.Features) == 0 {
		return nil, fmt.Errorf("%s returned no matching geography", result.Source.ID)
	}
	return result.Collection.Features[0].Properties, nil
}

func text(properties map[string]any, key string) string {
	value, ok := properties[key]
	if !ok || value == nil {
		return ""
	}
	return fmt.Sprint(value)
}

func integer(properties map[string]any, key string) *int {
	value := number(properties, key)
	if value == nil {
		return nil
	}
	result := int(*value)
	return &result
}

func number(properties map[string]any, key string) *float64 {
	value, ok := properties[key]
	if !ok || value == nil {
		return nil
	}
	var result float64
	switch typed := value.(type) {
	case float64:
		result = typed
	case int:
		result = float64(typed)
	default:
		if _, err := fmt.Sscan(fmt.Sprint(value), &result); err != nil {
			return nil
		}
	}
	if result <= -999 {
		return nil
	}
	return &result
}

func protectedCount(properties map[string]any, key string) ProtectedCount {
	value := integer(properties, key)
	return ProtectedCount{
		Value:                  value,
		MayRepresentMaskedCell: value != nil && *value == 11,
	}
}
