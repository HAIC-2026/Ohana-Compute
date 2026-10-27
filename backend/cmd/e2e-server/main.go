package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/api"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/arcgis"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/census"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/community"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/cphc"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/nws"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/official"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/planningareas"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/ptwc"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/shelterplans"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/transportation"
)

type fixtureSources struct{}

type fixtureArcGIS struct{}

type fixtureCensus struct{}

func (fixtureSources) ActiveAlerts(context.Context) (nws.Snapshot, error) {
	return nws.Snapshot{}, nil
}

func (fixtureSources) ActiveCyclones(context.Context) (cphc.Snapshot, error) {
	return cphc.Snapshot{}, nil
}

func (fixtureSources) LatestProduct(context.Context) (ptwc.Snapshot, error) {
	return ptwc.Snapshot{}, nil
}

func (fixtureSources) TsunamiRisk(
	context.Context,
	float64,
	float64,
) (official.TsunamiRisk, error) {
	zoneType := "Tsunami Safe Zone"
	return official.TsunamiRisk{
		Status:      "outside",
		ZoneType:    &zoneType,
		Description: "Outside the mapped practice evacuation zone.",
		Geometry:    emptyGeometry(),
	}, nil
}

func (fixtureSources) FloodRisk(
	context.Context,
	float64,
	float64,
) (official.FloodRisk, error) {
	return official.FloodRisk{
		Classification:     "lower-mapped",
		Title:              "Lower mapped flood risk",
		Description:        "No mapped high-risk flood polygon contains the selected point.",
		NearbyRiskGeometry: emptyGeometry(),
	}, nil
}

func (fixtureSources) WildfireRisk(
	context.Context,
	float64,
	float64,
) (official.WildfireRisk, error) {
	return official.WildfireRisk{
		Rating:      "Low",
		Title:       "Low mapped wildfire risk",
		Description: "The selected point is in a low community planning risk area.",
		Geometry:    emptyGeometry(),
	}, nil
}

func (fixtureSources) OpenShelters(
	context.Context,
	float64,
	float64,
) (official.OpenShelters, error) {
	return official.OpenShelters{Shelters: []official.Shelter{}}, nil
}

func (fixtureCensus) CommunityProfile(
	context.Context,
	float64,
	float64,
) (census.Profile, error) {
	profile := fixtureProfile()
	return *profile.ACS, nil
}

func (fixtureArcGIS) Query(
	_ context.Context,
	request arcgis.Request,
) (arcgis.Result, error) {
	profile := fixtureProfile()
	switch request.SourceID {
	case "cdc-svi-2022":
		return fixtureArcGISResult(profile.SVI.Source, map[string]any{
			"FIPS":       profile.SVI.TractFIPS,
			"LOCATION":   profile.SVI.Location,
			"E_TOTPOP":   *profile.SVI.Population,
			"E_AGE65":    *profile.SVI.Age65OrOlder,
			"E_DISABL":   *profile.SVI.WithDisability,
			"E_LIMENG":   *profile.SVI.LimitedEnglish,
			"E_NOVEH":    *profile.SVI.NoVehicleHouseholds,
			"RPL_THEMES": 0.1185,
			"RPL_THEME1": 0.14,
			"RPL_THEME2": 0.12,
			"RPL_THEME3": 0.10,
			"RPL_THEME4": 0.11,
		}), nil
	case "hhs-empower":
		return fixtureArcGISResult(profile.EmPOWER.Source, map[string]any{
			"STATE":                          profile.EmPOWER.State,
			"COUNTY":                         profile.EmPOWER.County,
			"Zip_Code":                       profile.EmPOWER.ZIPCode,
			"Medicare_Benes":                 *profile.EmPOWER.MedicareBeneficiaries.Value,
			"Power_Dependent_Devices_DME":    *profile.EmPOWER.PowerDependentDME.Value,
			"Facility_ESRD_Dialysis_Any_DME": 14,
			"O2_Services_Any_DME":            *profile.EmPOWER.OxygenServicesAnyDME.Value,
			"Home_Health_Services_Any_DME":   22,
			"AtHome_Hospice_Any_DME":         8,
			"Any_Healthcare_Srvc_Any_DME":    61,
		}), nil
	case "fema-nri":
		return fixtureArcGISResult(profile.NationalRisk.Source, map[string]any{
			"NRI_ID":     profile.NationalRisk.ID,
			"STATE":      "Hawaii",
			"COUNTY":     "Honolulu",
			"TRACT":      "000120",
			"TRACTFIPS":  "15003000120",
			"POPULATION": 2361,
			"RISK_SCORE": 31.4,
			"RISK_RATNG": "Relatively Moderate",
			"EAL_SCORE":  30.1,
			"EAL_RATNG":  "Relatively Moderate",
			"SOVI_SCORE": 28.7,
			"SOVI_RATNG": "Relatively Low",
			"RESL_SCORE": 54.2,
			"RESL_RATNG": "Relatively High",
		}), nil
	default:
		return arcgis.Result{}, nil
	}
}

func (fixtureSources) PlannedClosures(
	context.Context,
	float64,
	float64,
) (transportation.Snapshot, error) {
	return transportation.Snapshot{}, nil
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "18080"
	}
	fixtures := fixtureSources{}
	communityFixtures := community.NewClient(fixtureArcGIS{}, fixtureCensus{})
	shelterPlanFixtures := shelterplans.NewCatalog()
	planningAreaFixtures := planningareas.NewCatalog()
	server := api.NewServer(api.Config{
		Alerts:          fixtures,
		Cyclones:        fixtures,
		TsunamiProducts: fixtures,
		Official:        fixtures,
		Community:       communityFixtures,
		Transportation:  fixtures,
		ShelterPlans:    shelterPlanFixtures,
		PlanningAreas:   planningAreaFixtures,
		AllowedOrigins:  []string{"http://127.0.0.1:13000"},
		Logger:          slog.New(slog.NewTextHandler(os.Stdout, nil)),
	})
	httpServer := &http.Server{
		Addr:              ":" + port,
		Handler:           server.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	if err := httpServer.ListenAndServe(); err != nil {
		slog.Error("e2e server stopped", "error", err)
		os.Exit(1)
	}
}

func fixtureProfile() community.Profile {
	retrievedAt := time.Now().Add(-time.Minute)
	arcGISSource := arcgis.SourceStatus{
		Status:      "fresh",
		RetrievedAt: retrievedAt,
		FreshUntil:  retrievedAt.Add(24 * time.Hour),
	}
	return community.Profile{
		ACS: &census.Profile{
			Geography: census.Geography{
				Name:      "Census Tract 1.20, Honolulu County",
				TractFIPS: "15003000120",
			},
			Population:          metric(2_361, 100),
			Disability:          metricWithPercent(320, 40, 13.6),
			LimitedEnglish:      metricWithPercent(210, 35, 8.9),
			NoVehicleHouseholds: metricWithPercent(95, 15, 10.1),
			BelowPoverty:        metricWithPercent(180, 30, 7.6),
			Source: census.SourceStatus{
				ID:          "acs-5-year",
				Authority:   "U.S. Census Bureau",
				Vintage:     "2024 ACS 5-year",
				RetrievedAt: retrievedAt,
				FreshUntil:  retrievedAt.Add(24 * time.Hour),
				Status:      "fresh",
			},
		},
		SVI: &community.SVI{
			TractFIPS:           "15003000120",
			Location:            "Census Tract 1.20, Honolulu County",
			Population:          intPointer(2_361),
			Age65OrOlder:        intPointer(410),
			WithDisability:      intPointer(320),
			LimitedEnglish:      intPointer(210),
			NoVehicleHouseholds: intPointer(95),
			Source: arcgis.SourceStatus{
				ID:          "cdc-svi-2022",
				Authority:   "CDC/ATSDR",
				Status:      arcGISSource.Status,
				RetrievedAt: arcGISSource.RetrievedAt,
				FreshUntil:  arcGISSource.FreshUntil,
			},
		},
		EmPOWER: &community.EmPOWER{
			State:                 "HI",
			County:                "Honolulu",
			ZIPCode:               "96816",
			MedicareBeneficiaries: protectedCount(480, false),
			PowerDependentDME:     protectedCount(27, false),
			OxygenServicesAnyDME:  protectedCount(11, true),
			Source: arcgis.SourceStatus{
				ID:          "hhs-empower",
				Authority:   "U.S. Department of Health and Human Services",
				Status:      arcGISSource.Status,
				RetrievedAt: arcGISSource.RetrievedAt,
				FreshUntil:  arcGISSource.FreshUntil,
			},
		},
		NationalRisk: &community.NationalRisk{
			ID: "T15003000120",
			Source: arcgis.SourceStatus{
				ID:          "fema-nri",
				Authority:   "Federal Emergency Management Agency",
				Status:      arcGISSource.Status,
				RetrievedAt: arcGISSource.RetrievedAt,
				FreshUntil:  arcGISSource.FreshUntil,
			},
		},
		Disclaimer: "Aggregate planning data only. No person-level records.",
	}
}

func metric(estimate float64, marginOfError float64) census.Metric {
	return census.Metric{
		Estimate:      floatPointer(estimate),
		MarginOfError: floatPointer(marginOfError),
	}
}

func metricWithPercent(
	estimate float64,
	marginOfError float64,
	percent float64,
) census.Metric {
	value := metric(estimate, marginOfError)
	value.Percent = floatPointer(percent)
	return value
}

func protectedCount(value int, masked bool) community.ProtectedCount {
	return community.ProtectedCount{
		Value:                  intPointer(value),
		MayRepresentMaskedCell: masked,
	}
}

func fixtureArcGISResult(
	source arcgis.SourceStatus,
	properties map[string]any,
) arcgis.Result {
	return arcgis.Result{
		Collection: arcgis.FeatureCollection{
			Type: "FeatureCollection",
			Features: []arcgis.Feature{{
				Type:       "Feature",
				Properties: properties,
			}},
		},
		Source: source,
	}
}

func emptyGeometry() arcgis.FeatureCollection {
	return arcgis.FeatureCollection{
		Type:     "FeatureCollection",
		Features: []arcgis.Feature{},
	}
}

func intPointer(value int) *int {
	return &value
}

func floatPointer(value float64) *float64 {
	return &value
}
