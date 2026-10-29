package census

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/url"
	"strings"
)

var detailedVariables = func() []string {
	variables := []string{
		"NAME", "B01003_001E", "B01003_001M",
		"B08201_001E", "B08201_001M", "B08201_002E", "B08201_002M",
		"B11010_005E", "B11010_005M", "B11010_012E", "B11010_012M", "B11001_001E",
		"B25024_001E", "B25024_009E", "B25024_009M",
		"B25047_001E", "B25047_003E", "B25047_003M",
		"B28002_001E", "B28002_012E", "B28002_012M", "B28002_013E", "B28002_013M",
	}
	for _, group := range languageGroups {
		variables = append(variables, group.variable+"E", group.variable+"M")
	}
	return variables
}()

var subjectVariables = []string{
	"S1601_C05_001E", "S1601_C05_001M", "S1601_C06_001E", "S1601_C06_001M",
	"S1810_C02_001E", "S1810_C02_001M", "S1810_C03_001E", "S1810_C03_001M",
	"S1701_C02_001E", "S1701_C02_001M", "S1701_C03_001E", "S1701_C03_001M",
}

func ValidHawaiiCounty(county string) bool {
	switch county {
	case "001", "003", "005", "007", "009":
		return true
	}
	return false
}

// CountyProfiles loads all tracts in a county in two bounded requests, not one
// geocoder and pair of ACS requests per polygon.
func (client *Client) CountyProfiles(ctx context.Context, county string) ([]Profile, error) {
	if !ValidHawaiiCounty(county) {
		return nil, errors.New("invalid Hawaii county FIPS")
	}
	if client.apiKey == "" {
		return nil, ErrAPIKeyRequired
	}
	value, err, _ := client.requests.Do("county:"+county, func() (any, error) {
		now := client.now().UTC()
		client.mu.RLock()
		cached := client.counties[county]
		if len(cached) > 0 && now.Before(cached[0].Source.FreshUntil) {
			profiles := cloneProfiles(cached)
			client.mu.RUnlock()
			return profiles, nil
		}
		client.mu.RUnlock()
		type response struct {
			rows map[string]map[string]string
			err  error
		}
		detailedCh, subjectCh := make(chan response, 1), make(chan response, 1)
		go func() {
			rows, err := client.queryCounty(ctx, client.detailedURL, county, detailedVariables)
			detailedCh <- response{rows, err}
		}()
		go func() {
			rows, err := client.queryCounty(ctx, client.subjectURL, county, subjectVariables)
			subjectCh <- response{rows, err}
		}()
		detailed, subject := <-detailedCh, <-subjectCh
		if detailed.err != nil {
			return nil, fmt.Errorf("Census detailed tracts: %w", detailed.err)
		}
		if subject.err != nil {
			return nil, fmt.Errorf("Census subject tracts: %w", subject.err)
		}
		profiles := make([]Profile, 0, len(detailed.rows))
		for fips, values := range detailed.rows {
			subjectValues, ok := subject.rows[fips]
			if !ok {
				return nil, errors.New("Census subject data missing a detailed tract")
			}
			geography := Geography{StateCode: "15", CountyCode: county, TractCode: fips[5:], TractFIPS: fips, Name: values["NAME"]}
			profiles = append(profiles, client.profileFromValues(geography, values, subjectValues, now))
		}
		client.mu.Lock()
		client.counties[county] = cloneProfiles(profiles)
		client.mu.Unlock()
		return profiles, nil
	})
	if err != nil {
		return nil, err
	}
	return cloneProfiles(value.([]Profile)), nil
}

func (client *Client) queryCounty(ctx context.Context, endpoint, county string, variables []string) (map[string]map[string]string, error) {
	var rows [][]string
	err := client.getJSON(ctx, endpoint, url.Values{
		"get": {strings.Join(variables, ",")}, "for": {"tract:*"},
		"in": {"state:15 county:" + county}, "key": {client.apiKey},
	}, &rows)
	if err != nil {
		return nil, err
	}
	if len(rows) < 2 {
		return nil, errors.New("Census API returned no tract rows")
	}
	result := make(map[string]map[string]string, len(rows)-1)
	for _, row := range rows[1:] {
		if len(row) != len(rows[0]) {
			return nil, errors.New("Census API returned mismatched headers and values")
		}
		values := make(map[string]string, len(row))
		for i, key := range rows[0] {
			values[key] = row[i]
		}
		tract := values["tract"]
		if values["state"] != "15" || values["county"] != county || len(tract) != 6 || strings.Trim(tract, "0123456789") != "" {
			return nil, errors.New("Census API returned unexpected tract geography")
		}
		fips := "15" + county + tract
		if _, exists := result[fips]; exists {
			return nil, errors.New("Census API returned duplicate tract geography")
		}
		result[fips] = values
	}
	return result, nil
}

func cloneProfiles(profiles []Profile) []Profile {
	result := make([]Profile, len(profiles))
	for i, profile := range profiles {
		result[i] = cloneProfile(profile)
	}
	return result
}

func sumMetric(values map[string]string, keys ...string) Metric {
	var estimate, variance float64
	haveMOE := true
	for _, key := range keys {
		value := parseNumber(values[key+"E"])
		if value == nil {
			return Metric{}
		}
		estimate += *value
		moe := parseNumber(values[key+"M"])
		if moe == nil {
			haveMOE = false
		} else {
			variance += *moe * *moe
		}
	}
	result := Metric{Estimate: &estimate}
	if haveMOE {
		moe := math.Sqrt(variance)
		result.MarginOfError = &moe
	}
	return result
}

func setPercent(metric *Metric, values map[string]string, denominatorKey string) {
	denominator := parseNumber(values[denominatorKey])
	if denominator != nil && *denominator > 0 && metric.Estimate != nil {
		percent := *metric.Estimate / *denominator * 100
		metric.Percent = &percent
	}
}
