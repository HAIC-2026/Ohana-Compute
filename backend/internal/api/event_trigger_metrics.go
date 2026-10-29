package api

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/eventtriggers"
)

func eventTriggerHandler(
	logger *slog.Logger,
	metrics *Metrics,
	reader EventTriggerReader,
) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		ctx := eventtriggers.WithSourceObserver(
			request.Context(),
			func(observation eventtriggers.SourceObservation) {
				source := boundedEventSource(observation.Source)
				outcome := boundedEventOutcome(observation.Outcome)
				observeSourceFailure(writer, observation.Source, outcome)
				metrics.eventSourceRequests.WithLabelValues(source, outcome).Inc()
				metrics.eventSourceDuration.
					WithLabelValues(source, outcome).
					Observe(observation.Duration.Seconds())
			},
		)
		snapshot, err := reader.Snapshot(ctx)
		if err != nil {
			metrics.eventSnapshots.WithLabelValues("unavailable").Inc()
			logger.Error("load event-trigger snapshot", "error", err)
			message := "event-trigger sources unavailable"
			if !errors.Is(err, eventtriggers.ErrNoOperationalSources) {
				message = "event-trigger snapshot unavailable"
			}
			writeAPIError(writer, http.StatusBadGateway, message, "event-triggers")
			return
		}
		state := "complete"
		if snapshot.Status == "partial" {
			state = "partial"
		}
		metrics.eventSnapshots.WithLabelValues(state).Inc()
		writeJSON(writer, http.StatusOK, snapshot)
	}
}

func boundedEventSource(source string) string {
	switch source {
	case "nws", "ptwc", "usgs_comcat", "usgs_hans":
		return source
	default:
		return "nws"
	}
}

func boundedEventOutcome(outcome string) string {
	switch outcome {
	case "success", "stale", "error":
		return outcome
	default:
		return "error"
	}
}
