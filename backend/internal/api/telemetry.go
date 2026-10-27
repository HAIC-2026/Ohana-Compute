package api

import (
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net"
	"net/http"
	"sync"
	"time"
)

const (
	telemetryVersion      = 1
	maxTelemetryBodyBytes = 64 << 10
	maxTelemetryEvents    = 50
	defaultTelemetryRate  = 1200
)

var (
	validTelemetryKinds = stringSet(
		"page_load",
		"interaction",
		"interaction_timing",
	)
	validTelemetryActions = stringSet(
		"navigation",
		"dom_content_loaded",
		"load",
		"hydration",
		"map_ready",
		"hazard_select",
		"severity_change",
		"area_select",
		"layer_toggle",
		"planning_brief_generate",
		"planning_brief_update",
		"field_packet_download",
		"shelter_county_select",
		"shelter_provenance_open",
		"shelter_plan_retry",
		"resource_demand_duration",
		"resource_demand_standard",
		"resource_demand_retry",
		"partner_capability_select",
		"partner_provenance_open",
		"partner_match_retry",
		"event_trigger_select",
		"event_trigger_provenance_open",
		"event_trigger_retry",
		"live_status_select",
		"live_status_provenance_open",
		"live_status_retry",
		"map_interact",
		"activate",
		"change",
		"submit",
		"keyboard",
	)
	validTelemetryCategories = stringSet(
		"page",
		"button",
		"link",
		"select",
		"range",
		"input",
		"checkbox",
		"map",
		"form",
		"planning",
		"document",
		"other",
	)
	validTelemetryRoutes    = stringSet("home", "other")
	validTelemetryViewports = stringSet("small", "medium", "large")
	validTelemetryOutcomes  = stringSet("success", "error", "unknown")
)

type telemetryBatch struct {
	Version int              `json:"version"`
	Events  []telemetryEvent `json:"events"`
}

type telemetryEvent struct {
	Kind       string   `json:"kind"`
	Action     string   `json:"action"`
	Category   string   `json:"category"`
	Route      string   `json:"route"`
	Viewport   string   `json:"viewport"`
	Outcome    string   `json:"outcome"`
	DurationMS *float64 `json:"duration_ms,omitempty"`
}

func browserTelemetryHandler(
	metrics *Metrics,
	limiter *telemetryRateLimiter,
) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		if !limiter.Allow(request.RemoteAddr, time.Now()) {
			rejectTelemetry(writer, metrics, http.StatusTooManyRequests, "rate_limit")
			return
		}

		mediaType, _, err := mime.ParseMediaType(request.Header.Get("Content-Type"))
		if err != nil || (mediaType != "application/json" && mediaType != "text/plain") {
			rejectTelemetry(writer, metrics, http.StatusUnsupportedMediaType, "content_type")
			return
		}

		request.Body = http.MaxBytesReader(writer, request.Body, maxTelemetryBodyBytes)
		decoder := json.NewDecoder(request.Body)
		decoder.DisallowUnknownFields()
		var batch telemetryBatch
		if err := decoder.Decode(&batch); err != nil {
			reason := "invalid_json"
			var bodyTooLarge *http.MaxBytesError
			if errors.As(err, &bodyTooLarge) {
				reason = "body_too_large"
			}
			status := http.StatusBadRequest
			if reason == "body_too_large" {
				status = http.StatusRequestEntityTooLarge
			}
			rejectTelemetry(writer, metrics, status, reason)
			return
		}
		if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
			rejectTelemetry(writer, metrics, http.StatusBadRequest, "invalid_json")
			return
		}
		if reason := validateTelemetryBatch(batch); reason != "" {
			rejectTelemetry(writer, metrics, http.StatusBadRequest, reason)
			return
		}

		for _, event := range batch.Events {
			labels := []string{
				event.Kind,
				event.Action,
				event.Category,
				event.Route,
				event.Viewport,
				event.Outcome,
			}
			metrics.browserEvents.WithLabelValues(labels...).Inc()
			if event.DurationMS != nil {
				metrics.browserDuration.WithLabelValues(labels...).Observe(*event.DurationMS / 1000)
			}
		}
		metrics.telemetryBatches.WithLabelValues("accepted").Inc()
		writeJSON(writer, http.StatusAccepted, map[string]int{"accepted": len(batch.Events)})
	}
}

func validateTelemetryBatch(batch telemetryBatch) string {
	if batch.Version != telemetryVersion {
		return "version"
	}
	if len(batch.Events) == 0 || len(batch.Events) > maxTelemetryEvents {
		return "event_count"
	}
	for _, event := range batch.Events {
		if !validTelemetryKinds[event.Kind] {
			return "kind"
		}
		if !validTelemetryActions[event.Action] {
			return "action"
		}
		if !validTelemetryCategories[event.Category] {
			return "category"
		}
		if !validTelemetryRoutes[event.Route] {
			return "route"
		}
		if !validTelemetryViewports[event.Viewport] {
			return "viewport"
		}
		if !validTelemetryOutcomes[event.Outcome] {
			return "outcome"
		}
		if event.DurationMS != nil && (*event.DurationMS < 0 || *event.DurationMS > 600_000) {
			return "duration"
		}
	}
	return ""
}

func rejectTelemetry(
	writer http.ResponseWriter,
	metrics *Metrics,
	status int,
	reason string,
) {
	metrics.telemetryBatches.WithLabelValues("rejected").Inc()
	metrics.telemetryRejected.WithLabelValues(reason).Inc()
	writeJSON(writer, status, map[string]string{"error": "telemetry rejected"})
}

func stringSet(values ...string) map[string]bool {
	result := make(map[string]bool, len(values))
	for _, value := range values {
		result[value] = true
	}
	return result
}

type telemetryRateLimiter struct {
	mu       sync.Mutex
	limit    int
	interval time.Duration
	clients  map[string]telemetryRateWindow
}

type telemetryRateWindow struct {
	start time.Time
	count int
}

func newTelemetryRateLimiter(limit int, interval time.Duration) *telemetryRateLimiter {
	if limit <= 0 {
		limit = defaultTelemetryRate
	}
	return &telemetryRateLimiter{
		limit:    limit,
		interval: interval,
		clients:  make(map[string]telemetryRateWindow),
	}
}

func (limiter *telemetryRateLimiter) Allow(remoteAddress string, now time.Time) bool {
	host, _, err := net.SplitHostPort(remoteAddress)
	if err != nil {
		host = remoteAddress
	}
	if host == "" {
		host = "unknown"
	}

	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	if len(limiter.clients) > 1024 {
		for client, candidate := range limiter.clients {
			if now.Sub(candidate.start) >= limiter.interval {
				delete(limiter.clients, client)
			}
		}
	}
	if _, exists := limiter.clients[host]; !exists && len(limiter.clients) >= 4096 {
		host = "overflow"
	}
	window := limiter.clients[host]
	if window.start.IsZero() || now.Sub(window.start) >= limiter.interval {
		limiter.clients[host] = telemetryRateWindow{start: now, count: 1}
		return true
	}
	if window.count >= limiter.limit {
		return false
	}
	window.count++
	limiter.clients[host] = window
	return true
}
