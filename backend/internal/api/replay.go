package api

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/replay"
)

const maxReplayRequestBytes = 4 << 10

type ReplayEngine interface {
	Run(context.Context, replay.Request) (replay.Report, error)
}

func replayCatalogHandler() http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Cache-Control", "no-store")
		if request.URL.RawQuery != "" {
			writeAPIError(
				writer,
				http.StatusBadRequest,
				"invalid historical replay catalog query",
				"",
			)
			return
		}
		writeJSON(writer, http.StatusOK, replay.CurrentCatalog())
	}
}

func replayRunHandler(
	logger *slog.Logger,
	metrics *Metrics,
	engine ReplayEngine,
) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Cache-Control", "no-store")
		var input replay.Request
		if !decodeJSONWithLimit(
			writer,
			request,
			&input,
			maxReplayRequestBytes,
			"historical replay request",
		) {
			return
		}
		report, err := engine.Run(request.Context(), input)
		if errors.Is(err, replay.ErrInvalidRequest) {
			writeAPIError(
				writer,
				http.StatusBadRequest,
				"invalid historical replay request",
				"",
			)
			return
		}
		if err != nil {
			logger.Error("run historical replay", "error", err)
			writeAPIError(
				writer,
				http.StatusBadGateway,
				"historical replay unavailable",
				"",
			)
			return
		}

		fixtureCategory := boundedReplayFixtureCategory(report.FixtureKind)
		hazard := boundedReplayHazard(report.Hazard)
		runOutcome := "pass"
		for _, check := range report.Checks {
			outcome := boundedReplayOutcome(check.Outcome)
			metrics.replayChecks.WithLabelValues(
				fixtureCategory,
				hazard,
				boundedReplayGroup(check.Group),
				outcome,
			).Inc()
			switch outcome {
			case "fail":
				runOutcome = "fail"
			case "warn":
				if runOutcome == "pass" {
					runOutcome = "warn"
				}
			case "unavailable":
				if runOutcome == "pass" {
					runOutcome = "unavailable"
				}
			}
		}
		metrics.replayRuns.WithLabelValues(
			fixtureCategory,
			hazard,
			runOutcome,
		).Inc()
		writeJSON(writer, http.StatusOK, report)
	}
}

func boundedReplayFixtureCategory(value string) string {
	switch value {
	case "historical_incident", "synthetic_exercise":
		return value
	default:
		return "historical_incident"
	}
}

func boundedReplayHazard(value string) string {
	switch value {
	case "hurricane", "tsunami_earthquake", "flood", "wildfire", "volcanic":
		return value
	default:
		return "flood"
	}
}

func boundedReplayGroup(value string) string {
	switch value {
	case "Map", "Model", "Match", "Operate":
		return value
	default:
		return "Operate"
	}
}

func boundedReplayOutcome(value string) string {
	switch value {
	case "pass", "warn", "unavailable", "fail":
		return value
	default:
		return "fail"
	}
}
