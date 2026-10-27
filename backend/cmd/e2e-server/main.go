package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/api"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/arcgis"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/census"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/collaboration"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/community"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/cphc"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/eventtriggers"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/groundedplanning"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/hans"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/identity"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/nws"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/official"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/operationalstatus"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/partnermatching"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/planningareas"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/ptwc"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/resourcedemand"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/shelterplans"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/transportation"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/usgs"
)

type fixtureSources struct{}

type fixtureArcGIS struct{}

type fixtureCensus struct{}

type fixtureVerifier struct{}

func (fixtureVerifier) Verify(
	_ context.Context,
	token string,
) (identity.VerifiedIdentity, error) {
	roles := []string{
		string(identity.RolePlanEditor),
		string(identity.RolePlanApprover),
	}
	if token == "collaboration-editor-e2e-token" {
		roles = []string{string(identity.RolePlanEditor)}
	} else if token != "collaboration-e2e-token" {
		return identity.VerifiedIdentity{}, identity.ErrInvalidCredentials
	}
	return identity.VerifiedIdentity{
		Subject: "deterministic-e2e-principal",
		Roles:   roles,
	}, nil
}

func (fixtureSources) ActiveAlerts(context.Context) (nws.Snapshot, error) {
	now := time.Now().UTC()
	return nws.Snapshot{
		Alerts: []nws.Alert{{
			ID: "fixture-nws-advisory", Hazard: "flood",
			Event: "Flood Advisory", Headline: "Fixture Flood Advisory",
			Area: "Honolulu County", Severity: "Minor", Certainty: "Likely",
			Urgency: "Expected", ResponseType: "Evacuate",
			Effective:   now.Add(-15 * time.Minute).Format(time.RFC3339),
			Expires:     now.Add(90 * time.Minute).Format(time.RFC3339),
			Instruction: "Follow authorized local instructions.",
		}},
		Source: nws.SourceStatus{
			ID: "nws-hi-alerts", Authority: "NOAA National Weather Service",
			URL:         "https://api.weather.gov/alerts/active?area=HI",
			RetrievedAt: now, FreshUntil: now.Add(5 * time.Minute), Status: "fresh",
		},
	}, nil
}

func (fixtureSources) ActiveCyclones(context.Context) (cphc.Snapshot, error) {
	return cphc.Snapshot{}, nil
}

func (fixtureSources) LatestProduct(context.Context) (ptwc.Snapshot, error) {
	now := time.Now().UTC()
	return ptwc.Snapshot{
		Product: ptwc.Product{
			Identifier: "fixture-ptwc-watch", SentAt: now.Add(-10 * time.Minute).Format(time.RFC3339),
			Status: "Actual", MessageType: "Alert", Event: "Tsunami Watch",
			ActionLevel: "watch", ResponseType: "Prepare", Urgency: "Expected",
			Severity: "Severe", Certainty: "Possible",
			Onset:   now.Add(-10 * time.Minute).Format(time.RFC3339),
			Expires: now.Add(2 * time.Hour).Format(time.RFC3339), IsCurrent: true,
			SenderName: "PTWC", Headline: "Fixture Tsunami Watch",
			Web: "https://www.tsunami.gov/",
		},
		Source: ptwc.SourceStatus{
			ID: "ptwc-cap", Authority: "NOAA Pacific Tsunami Warning Center",
			URL:         "https://www.tsunami.gov/events/xml/PHEBCAP.xml",
			RetrievedAt: now, FreshUntil: now.Add(time.Minute), Status: "fresh",
		},
	}, nil
}

func (fixtureSources) RecentEvents(context.Context) (usgs.Snapshot, error) {
	now := time.Now().UTC()
	return usgs.Snapshot{
		Events: []usgs.Event{
			{
				ID: "fixture-comcat-tsunami", Title: "M 6.8 fixture earthquake",
				DetailURL: "https://earthquake.usgs.gov/earthquakes/eventpage/fixture",
				Time:      now.Add(-20 * time.Minute).Format(time.RFC3339),
				Updated:   now.Add(-5 * time.Minute).Format(time.RFC3339),
				Magnitude: 6.8, Type: "earthquake", Tsunami: true, Status: "reviewed",
			},
			{
				ID: "fixture-comcat-no-tsunami", Title: "M 3.2 fixture earthquake",
				DetailURL: "https://earthquake.usgs.gov/earthquakes/eventpage/fixture-small",
				Time:      now.Add(-40 * time.Minute).Format(time.RFC3339),
				Updated:   now.Add(-30 * time.Minute).Format(time.RFC3339),
				Magnitude: 3.2, Type: "earthquake", Tsunami: false, Status: "reviewed",
			},
		},
		Source: usgs.SourceStatus{
			ID: "usgs-comcat", Authority: "U.S. Geological Survey",
			URL:         "https://earthquake.usgs.gov/fdsnws/event/1/query",
			RetrievedAt: now, FreshUntil: now.Add(2 * time.Minute), Status: "fresh",
		},
	}, nil
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
	now := time.Now().UTC()
	capacity := 85
	return official.OpenShelters{
		Shelters: []official.Shelter{{
			ID: "fixture-live-shelter", Name: "Fixture reported open shelter",
			Address: "Official source fixture address", City: "Honolulu",
			Status: "OPEN", Capacity: &capacity,
			WheelchairAccessible:  "YES",
			PetAccommodationsCode: "HOUSEHOLD_PETS",
			Organization:          "Fixture reporting authority", DistanceMiles: 3.2,
		}},
		Sources: []arcgis.SourceStatus{{
			ID:          "fema-open-shelters",
			Authority:   "Federal Emergency Management Agency and reporting partners",
			URL:         "https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/MapServer/0",
			RetrievedAt: now, FreshUntil: now.Add(5 * time.Minute), Status: "fresh",
		}},
	}, nil
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
	if err := run(); err != nil {
		slog.Error("run e2e server", "error", err)
		os.Exit(1)
	}
}

func run() error {
	port := os.Getenv("PORT")
	if port == "" {
		port = "18080"
	}
	fixtures := fixtureSources{}
	communityFixtures := community.NewClient(fixtureArcGIS{}, fixtureCensus{})
	shelterPlanFixtures := shelterplans.NewCatalog()
	planningAreaFixtures := planningareas.NewCatalog()
	resourceDemandFixture := resourcedemand.NewCalculator()
	partnerMatchingFixture := partnermatching.NewMatcher()
	eventTriggerFixtures := eventtriggers.NewService(eventtriggers.Config{
		NWS: fixtures, PTWC: fixtures, ComCat: fixtures, HANS: hans.NewClient(nil),
	})
	operationalStatusFixtures := operationalstatus.NewService(operationalstatus.Config{
		Shelters: fixtures,
	})
	identityService, err := identity.NewService(identity.Config{}, nil)
	if err != nil {
		return fmt.Errorf("create disabled e2e identity service: %w", err)
	}
	var collaborationStore collaboration.Store
	var groundedPlanningService *groundedplanning.Service
	if os.Getenv("E2E_ENABLE_COLLABORATION") == "1" {
		identityService, err = identity.NewService(identity.Config{
			Mode: identity.ModeOIDC,
			OIDC: identity.OIDCConfig{
				IssuerURL:  "https://identity.example.test/e2e",
				Audience:   "api://hawaii-resilience-e2e",
				ClientID:   "hawaii-resilience-e2e",
				RolesClaim: "roles",
			},
		}, fixtureVerifier{})
		if err != nil {
			return fmt.Errorf("create configured e2e identity service: %w", err)
		}
		databasePath := os.Getenv("E2E_COLLABORATION_SQLITE_PATH")
		if databasePath == "" {
			databaseFile, createErr := os.CreateTemp(
				"",
				"hawaii-resilience-collaboration-e2e-*.db",
			)
			if createErr != nil {
				return fmt.Errorf(
					"create e2e collaboration database path: %w",
					createErr,
				)
			}
			databasePath = databaseFile.Name()
			if closeErr := databaseFile.Close(); closeErr != nil {
				return fmt.Errorf(
					"close e2e collaboration database file: %w",
					closeErr,
				)
			}
			defer func() {
				_ = os.Remove(databasePath)
				_ = os.Remove(databasePath + "-shm")
				_ = os.Remove(databasePath + "-wal")
			}()
		}
		collaborationStore, err = collaboration.OpenSQLite(databasePath)
		if err != nil {
			return fmt.Errorf("create e2e collaboration store: %w", err)
		}
		defer collaborationStore.Close()
		if os.Getenv("E2E_ENABLE_GROUNDED_PLANNING") == "1" {
			groundedPlanningService = groundedplanning.NewService(
				groundedplanning.Config{
					Provider: &groundedplanning.FakeProvider{},
					Store:    collaborationStore,
				},
			)
		}
	}
	server := api.NewServer(api.Config{
		Alerts:            fixtures,
		Cyclones:          fixtures,
		TsunamiProducts:   fixtures,
		Official:          fixtures,
		Community:         communityFixtures,
		Transportation:    fixtures,
		ShelterPlans:      shelterPlanFixtures,
		PlanningAreas:     planningAreaFixtures,
		ResourceDemand:    resourceDemandFixture,
		PartnerMatching:   partnerMatchingFixture,
		EventTriggers:     eventTriggerFixtures,
		OperationalStatus: operationalStatusFixtures,
		Identity:          identityService,
		Collaboration:     collaborationStore,
		GroundedPlanning:  groundedPlanningService,
		AllowedOrigins: []string{
			"http://127.0.0.1:3000",
			"http://127.0.0.1:13000",
			"http://127.0.0.1:13001",
		},
		Logger: slog.New(slog.NewTextHandler(os.Stdout, nil)),
	})
	httpServer := &http.Server{
		Addr:              ":" + port,
		Handler:           server.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	serverErrors := make(chan error, 1)
	go func() {
		serverErrors <- httpServer.ListenAndServe()
	}()
	signalContext, stopSignals := signal.NotifyContext(
		context.Background(),
		os.Interrupt,
		syscall.SIGTERM,
	)
	defer stopSignals()
	select {
	case err := <-serverErrors:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("serve e2e API: %w", err)
		}
	case <-signalContext.Done():
		shutdownContext, cancelShutdown := context.WithTimeout(
			context.Background(),
			5*time.Second,
		)
		defer cancelShutdown()
		if err := httpServer.Shutdown(shutdownContext); err != nil {
			return fmt.Errorf("shut down e2e server: %w", err)
		}
		if err := <-serverErrors; err != nil && !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("serve e2e API: %w", err)
		}
	}
	return nil
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
