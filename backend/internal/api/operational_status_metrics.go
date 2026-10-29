package api

import (
	"log/slog"
	"net/http"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/operationalstatus"
)

func operationalStatusHandler(
	logger *slog.Logger,
	metrics *Metrics,
	reader OperationalStatusReader,
) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		latitude, longitude, err := parseCoordinates(request)
		if err != nil {
			writeAPIError(writer, http.StatusBadRequest, "invalid coordinates", "")
			return
		}
		ctx := operationalstatus.WithSourceObserver(
			request.Context(),
			func(observation operationalstatus.SourceObservation) {
				source := boundedOperationalSource(observation.Source)
				outcome := boundedOperationalOutcome(observation.Outcome)
				observeSourceFailure(writer, observation.Source, outcome)
				metrics.operationalSourceRequests.WithLabelValues(source, outcome).Inc()
				metrics.operationalSourceDuration.
					WithLabelValues(source, outcome).
					Observe(observation.Duration.Seconds())
			},
		)
		snapshot, err := reader.Snapshot(ctx, latitude, longitude)
		if err != nil {
			metrics.operationalSnapshots.WithLabelValues("unavailable").Inc()
			logger.Error("load operational-status snapshot", "error", err)
			writeAPIError(
				writer,
				http.StatusBadGateway,
				"operational-status snapshot unavailable",
				"live-operational-status",
			)
			return
		}
		state := boundedOperationalSnapshot(snapshot.Status)
		metrics.operationalSnapshots.WithLabelValues(state).Inc()
		for _, domain := range snapshot.Domains {
			metrics.operationalDomains.WithLabelValues(
				boundedOperationalDomain(domain.Domain),
				boundedOperationalDomainStatus(domain.Status),
			).Inc()
		}
		writeJSON(writer, http.StatusOK, snapshot)
	}
}

func boundedOperationalSource(source string) string {
	if source == "fema_open_shelters" {
		return source
	}
	return "fema_open_shelters"
}

func boundedOperationalOutcome(outcome string) string {
	switch outcome {
	case "success", "stale", "error":
		return outcome
	default:
		return "error"
	}
}

func boundedOperationalSnapshot(status string) string {
	switch status {
	case "partial", "unavailable":
		return status
	default:
		return "unavailable"
	}
}

func boundedOperationalDomain(domain string) string {
	switch domain {
	case "evacuation_order", "road_transport", "shelter",
		"transit_paratransit", "utility_outage", "wildfire":
		return domain
	default:
		return "wildfire"
	}
}

func boundedOperationalDomainStatus(status string) string {
	switch status {
	case "reported_live", "stale", "unavailable":
		return status
	default:
		return "unavailable"
	}
}
