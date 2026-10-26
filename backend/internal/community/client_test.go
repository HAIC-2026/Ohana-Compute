package community

import (
	"context"
	"errors"
	"testing"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/arcgis"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/census"
)

type querierStub struct {
	results map[string]arcgis.Result
	errors  map[string]error
}

func (stub querierStub) Query(
	_ context.Context,
	request arcgis.Request,
) (arcgis.Result, error) {
	if err := stub.errors[request.SourceID]; err != nil {
		return arcgis.Result{}, err
	}
	return stub.results[request.SourceID], nil
}

type censusStub struct {
	profile census.Profile
	err     error
}

func (stub censusStub) CommunityProfile(
	context.Context,
	float64,
	float64,
) (census.Profile, error) {
	return stub.profile, stub.err
}

func TestProfileReturnsPartialDataAndExplicitSourceErrors(t *testing.T) {
	t.Parallel()

	client := NewClient(
		querierStub{
			results: map[string]arcgis.Result{
				"cdc-svi-2022": result("cdc-svi-2022", map[string]any{
					"FIPS":       "15003000120",
					"LOCATION":   "Census Tract 1.20; Honolulu County; Hawaii",
					"E_TOTPOP":   2361,
					"E_DISABL":   113,
					"E_LIMENG":   36,
					"E_NOVEH":    15,
					"RPL_THEMES": 0.1185,
				}),
				"hhs-empower": result("hhs-empower", map[string]any{
					"STATE":                       "HI",
					"COUNTY":                      "Honolulu",
					"Zip_Code":                    "96825",
					"Power_Dependent_Devices_DME": 176,
					"O2_Services_Any_DME":         11,
				}),
				"fema-nri": result("fema-nri", map[string]any{
					"NRI_ID":     "T15003000120",
					"TRACTFIPS":  "15003000120",
					"RISK_SCORE": 60.06,
					"RISK_RATNG": "Relatively Moderate",
				}),
			},
		},
		censusStub{err: census.ErrAPIKeyRequired},
	)

	profile, err := client.Profile(context.Background(), 21.29, -157.68)
	if err != nil {
		t.Fatalf("Profile failed: %v", err)
	}
	if profile.ACS != nil ||
		profile.SVI == nil ||
		profile.EmPOWER == nil ||
		profile.NationalRisk == nil ||
		len(profile.SourceErrors) != 1 ||
		profile.SourceErrors[0].Source != "acs-5-year" {
		t.Fatalf("unexpected profile: %#v", profile)
	}
	if !profile.EmPOWER.OxygenServicesAnyDME.MayRepresentMaskedCell {
		t.Fatal("expected emPOWER privacy masking flag for value 11")
	}
}

func TestProfileFailsWhenEverySourceFails(t *testing.T) {
	t.Parallel()

	client := NewClient(
		querierStub{errors: map[string]error{
			"cdc-svi-2022": errors.New("unavailable"),
			"hhs-empower":  errors.New("unavailable"),
			"fema-nri":     errors.New("unavailable"),
		}},
		censusStub{err: errors.New("unavailable")},
	)

	if _, err := client.Profile(context.Background(), 21.29, -157.68); err == nil {
		t.Fatal("expected aggregate failure")
	}
}

func result(sourceID string, properties map[string]any) arcgis.Result {
	return arcgis.Result{
		Collection: arcgis.FeatureCollection{
			Type: "FeatureCollection",
			Features: []arcgis.Feature{{
				Type:       "Feature",
				Properties: properties,
			}},
		},
		Source: arcgis.SourceStatus{
			ID:     sourceID,
			Status: "fresh",
		},
	}
}
