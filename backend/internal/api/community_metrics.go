package api

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/census"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/community"
)

func communityProfileHandler(
	logger *slog.Logger,
	metrics *Metrics,
	load func(context.Context, float64, float64) (community.Profile, error),
) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		latitude, longitude, err := parseCoordinates(request)
		if err != nil {
			writeAPIError(
				writer,
				http.StatusBadRequest,
				"invalid coordinates",
				"",
			)
			return
		}

		ctx := community.WithSourceObserver(
			request.Context(),
			func(observation community.SourceObservation) {
				source := boundedAFNSource(observation.Source)
				outcome := boundedAFNOutcome(observation.Outcome)
				metrics.afnSourceRequests.WithLabelValues(source, outcome).Inc()
				metrics.afnSourceDuration.
					WithLabelValues(source, outcome).
					Observe(observation.Duration.Seconds())
			},
		)
		profile, err := load(ctx, latitude, longitude)
		if err != nil {
			metrics.afnProfiles.WithLabelValues("unavailable").Inc()
			logger.Error(
				"load official source",
				"source", "community-profile",
				"error", err,
			)
			writeAPIError(
				writer,
				http.StatusBadGateway,
				"official source unavailable",
				"community-profile",
			)
			return
		}

		metrics.afnProfiles.WithLabelValues(profileCompleteness(profile)).Inc()
		recordAFNSourceState(metrics, profile)
		recordMaskedEmPOWER(metrics, profile.EmPOWER)
		writeJSON(writer, http.StatusOK, profile)
	}
}

func profileCompleteness(profile community.Profile) string {
	available := 0
	for _, present := range []bool{
		profile.ACS != nil,
		profile.SVI != nil,
		profile.EmPOWER != nil,
		profile.NationalRisk != nil,
	} {
		if present {
			available++
		}
	}
	if available == 4 {
		return "complete"
	}
	return "partial"
}

func recordAFNSourceState(
	metrics *Metrics,
	profile community.Profile,
) {
	if profile.ACS != nil {
		recordAFNSourceStatus(
			metrics,
			"acs-5-year",
			profile.ACS.Source.Status,
			profile.ACS.Source.RetrievedAt,
		)
	}
	if profile.SVI != nil {
		recordAFNSourceStatus(
			metrics,
			"cdc-svi-2022",
			profile.SVI.Source.Status,
			profile.SVI.Source.RetrievedAt,
		)
	}
	if profile.EmPOWER != nil {
		recordAFNSourceStatus(
			metrics,
			"hhs-empower",
			profile.EmPOWER.Source.Status,
			profile.EmPOWER.Source.RetrievedAt,
		)
	}
	if profile.NationalRisk != nil {
		recordAFNSourceStatus(
			metrics,
			"fema-nri",
			profile.NationalRisk.Source.Status,
			profile.NationalRisk.Source.RetrievedAt,
		)
	}
}

func recordAFNSourceStatus(
	metrics *Metrics,
	source string,
	status string,
	retrievedAt time.Time,
) {
	source = boundedAFNSource(source)
	stale := 0.0
	if status == "stale" {
		stale = 1
	}
	metrics.afnSourceStale.WithLabelValues(source).Set(stale)
	if !retrievedAt.IsZero() {
		metrics.afnSourceRetrieved.
			WithLabelValues(source).
			Set(float64(retrievedAt.Unix()))
	}
}

func recordMaskedEmPOWER(metrics *Metrics, profile *community.EmPOWER) {
	if profile == nil {
		return
	}
	for field, masked := range map[string]bool{
		"medicare_beneficiaries": profile.MedicareBeneficiaries.MayRepresentMaskedCell,
		"power_dependent_dme":    profile.PowerDependentDME.MayRepresentMaskedCell,
		"facility_dialysis_dme":  profile.FacilityDialysisAnyDME.MayRepresentMaskedCell,
		"oxygen_services_dme":    profile.OxygenServicesAnyDME.MayRepresentMaskedCell,
		"home_health_dme":        profile.HomeHealthServicesAnyDME.MayRepresentMaskedCell,
		"at_home_hospice_dme":    profile.AtHomeHospiceAnyDME.MayRepresentMaskedCell,
		"any_healthcare_dme":     profile.AnyHealthcareServiceAnyDME.MayRepresentMaskedCell,
	} {
		if masked {
			metrics.afnMaskedValues.WithLabelValues(field).Inc()
		}
	}
}

func boundedAFNSource(source string) string {
	switch source {
	case "acs-5-year", "cdc-svi-2022", "hhs-empower", "fema-nri", "census-tigerweb-tracts":
		return source
	default:
		return "other"
	}
}

func afnLayerHandler(logger *slog.Logger, metrics *Metrics, reader AFNLayerReader) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		query := request.URL.Query()
		county := query.Get("county")
		if (county != "" && !census.ValidHawaiiCounty(county)) || len(query["county"]) > 1 {
			writeAPIError(writer, http.StatusBadRequest, "county must be one of 001, 003, 005, 007, 009", "community-afn-layer")
			return
		}
		if reader == nil {
			writeAPIError(writer, http.StatusServiceUnavailable, "tract AFN sources are not configured", "community-afn-layer")
			return
		}
		ctx := community.WithSourceObserver(request.Context(), func(observation community.SourceObservation) {
			source, outcome := boundedAFNSource(observation.Source), boundedAFNOutcome(observation.Outcome)
			metrics.afnSourceRequests.WithLabelValues(source, outcome).Inc()
			metrics.afnSourceDuration.WithLabelValues(source, outcome).Observe(observation.Duration.Seconds())
		})
		layer, err := reader.AFNLayer(ctx, county)
		if err != nil {
			logger.Error("load tract AFN layer", "error", err)
			writeAPIError(writer, http.StatusBadGateway, "tract AFN geometry source unavailable", "community-afn-layer")
			return
		}
		type sourceState struct {
			status      string
			retrievedAt time.Time
		}
		states := map[string]sourceState{}
		for _, source := range layer.Sources {
			id := boundedAFNSource(source.ID)
			state, exists := states[id]
			if !exists || source.RetrievedAt.Before(state.retrievedAt) {
				state.retrievedAt = source.RetrievedAt
			}
			if source.Status == "stale" || !exists {
				state.status = source.Status
			}
			states[id] = state
		}
		for source, state := range states {
			recordAFNSourceStatus(metrics, source, state.status, state.retrievedAt)
		}
		writeJSON(writer, http.StatusOK, layer)
	}
}

func boundedAFNOutcome(outcome string) string {
	switch outcome {
	case "success", "error":
		return outcome
	default:
		return "error"
	}
}
