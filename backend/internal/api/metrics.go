package api

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/identity"
	"github.com/prometheus/client_golang/prometheus"
)

type Metrics struct {
	httpRequests               *prometheus.CounterVec
	httpDuration               *prometheus.HistogramVec
	httpInFlight               prometheus.Gauge
	browserEvents              *prometheus.CounterVec
	browserDuration            *prometheus.HistogramVec
	telemetryBatches           *prometheus.CounterVec
	telemetryRejected          *prometheus.CounterVec
	afnSourceRequests          *prometheus.CounterVec
	afnSourceDuration          *prometheus.HistogramVec
	afnProfiles                *prometheus.CounterVec
	afnSourceRetrieved         *prometheus.GaugeVec
	afnSourceStale             *prometheus.GaugeVec
	afnMaskedValues            *prometheus.CounterVec
	eventSourceRequests        *prometheus.CounterVec
	eventSourceDuration        *prometheus.HistogramVec
	eventSnapshots             *prometheus.CounterVec
	operationalSourceRequests  *prometheus.CounterVec
	operationalSourceDuration  *prometheus.HistogramVec
	operationalSnapshots       *prometheus.CounterVec
	operationalDomains         *prometheus.CounterVec
	identityAuthorization      *prometheus.CounterVec
	collaborationOperations    *prometheus.CounterVec
	groundedPlanningOperations *prometheus.CounterVec
}

func newMetrics(registerer prometheus.Registerer) *Metrics {
	metrics := &Metrics{
		httpRequests: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: "hawaii_resilience",
				Name:      "http_requests_total",
				Help:      "Backend HTTP requests by bounded method, route pattern, and response status.",
			},
			[]string{"method", "route", "status"},
		),
		httpDuration: prometheus.NewHistogramVec(
			prometheus.HistogramOpts{
				Namespace: "hawaii_resilience",
				Name:      "http_request_duration_seconds",
				Help:      "Backend HTTP request latency by bounded method, route pattern, and response status.",
				Buckets:   prometheus.DefBuckets,
			},
			[]string{"method", "route", "status"},
		),
		httpInFlight: prometheus.NewGauge(
			prometheus.GaugeOpts{
				Namespace: "hawaii_resilience",
				Name:      "http_in_flight_requests",
				Help:      "Current number of in-flight backend HTTP requests.",
			},
		),
		browserEvents: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: "hawaii_resilience",
				Name:      "browser_events_total",
				Help:      "Privacy-safe browser lifecycle and interaction events.",
			},
			[]string{"kind", "action", "category", "route", "viewport", "outcome"},
		),
		browserDuration: prometheus.NewHistogramVec(
			prometheus.HistogramOpts{
				Namespace: "hawaii_resilience",
				Name:      "browser_event_duration_seconds",
				Help:      "Privacy-safe browser lifecycle and interaction latency.",
				Buckets: []float64{
					0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
				},
			},
			[]string{"kind", "action", "category", "route", "viewport", "outcome"},
		),
		telemetryBatches: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: "hawaii_resilience",
				Name:      "browser_telemetry_batches_total",
				Help:      "Browser telemetry batches by ingest outcome.",
			},
			[]string{"outcome"},
		),
		telemetryRejected: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: "hawaii_resilience",
				Name:      "browser_telemetry_rejected_total",
				Help:      "Rejected browser telemetry batches by bounded reason.",
			},
			[]string{"reason"},
		),
		afnSourceRequests: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: "hawaii_resilience",
				Name:      "afn_source_requests_total",
				Help:      "Aggregate AFN source requests by bounded source and outcome.",
			},
			[]string{"source", "outcome"},
		),
		afnSourceDuration: prometheus.NewHistogramVec(
			prometheus.HistogramOpts{
				Namespace: "hawaii_resilience",
				Name:      "afn_source_request_duration_seconds",
				Help:      "Aggregate AFN source request latency by bounded source and outcome.",
				Buckets: []float64{
					0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20,
				},
			},
			[]string{"source", "outcome"},
		),
		afnProfiles: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: "hawaii_resilience",
				Name:      "afn_profile_responses_total",
				Help:      "Aggregate AFN profile responses by completeness.",
			},
			[]string{"completeness"},
		),
		afnSourceRetrieved: prometheus.NewGaugeVec(
			prometheus.GaugeOpts{
				Namespace: "hawaii_resilience",
				Name:      "afn_source_retrieved_timestamp_seconds",
				Help:      "Unix timestamp when the latest aggregate AFN source data was retrieved.",
			},
			[]string{"source"},
		),
		afnSourceStale: prometheus.NewGaugeVec(
			prometheus.GaugeOpts{
				Namespace: "hawaii_resilience",
				Name:      "afn_source_stale",
				Help:      "Whether the latest aggregate AFN source response was stale (1) or fresh (0).",
			},
			[]string{"source"},
		),
		afnMaskedValues: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: "hawaii_resilience",
				Name:      "afn_privacy_masked_observations_total",
				Help:      "Privacy-masked HHS emPOWER fields observed in aggregate AFN profiles.",
			},
			[]string{"field"},
		),
		eventSourceRequests: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: "hawaii_resilience",
				Name:      "event_trigger_source_requests_total",
				Help:      "Operational event-trigger source requests by bounded source and outcome.",
			},
			[]string{"source", "outcome"},
		),
		eventSourceDuration: prometheus.NewHistogramVec(
			prometheus.HistogramOpts{
				Namespace: "hawaii_resilience",
				Name:      "event_trigger_source_request_duration_seconds",
				Help:      "Operational event-trigger source latency by bounded source and outcome.",
				Buckets: []float64{
					0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
				},
			},
			[]string{"source", "outcome"},
		),
		eventSnapshots: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: "hawaii_resilience",
				Name:      "event_trigger_snapshots_total",
				Help:      "Normalized event-trigger snapshots by bounded state.",
			},
			[]string{"state"},
		),
		operationalSourceRequests: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: "hawaii_resilience",
				Name:      "operational_status_source_requests_total",
				Help:      "Live operational-status source requests by bounded source and outcome.",
			},
			[]string{"source", "outcome"},
		),
		operationalSourceDuration: prometheus.NewHistogramVec(
			prometheus.HistogramOpts{
				Namespace: "hawaii_resilience",
				Name:      "operational_status_source_request_duration_seconds",
				Help:      "Live operational-status source latency by bounded source and outcome.",
				Buckets: []float64{
					0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
				},
			},
			[]string{"source", "outcome"},
		),
		operationalSnapshots: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: "hawaii_resilience",
				Name:      "operational_status_snapshots_total",
				Help:      "Live operational-status snapshots by bounded state.",
			},
			[]string{"state"},
		),
		operationalDomains: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: "hawaii_resilience",
				Name:      "operational_status_domains_total",
				Help:      "Operational domain results by bounded domain and status.",
			},
			[]string{"domain", "status"},
		),
		identityAuthorization: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: "hawaii_resilience",
				Name:      "identity_authorization_total",
				Help:      "Identity authorization checks by bounded outcome.",
			},
			[]string{"outcome"},
		),
		collaborationOperations: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: "hawaii_resilience",
				Name:      "collaboration_operations_total",
				Help:      "Collaborative plan operations by bounded operation and outcome.",
			},
			[]string{"operation", "outcome"},
		),
		groundedPlanningOperations: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: "hawaii_resilience",
				Name:      "grounded_planning_operations_total",
				Help:      "Grounded planning operations by bounded operation, outcome, and provider class.",
			},
			[]string{"operation", "outcome", "provider_class"},
		),
	}
	registerer.MustRegister(
		metrics.httpRequests,
		metrics.httpDuration,
		metrics.httpInFlight,
		metrics.browserEvents,
		metrics.browserDuration,
		metrics.telemetryBatches,
		metrics.telemetryRejected,
		metrics.afnSourceRequests,
		metrics.afnSourceDuration,
		metrics.afnProfiles,
		metrics.afnSourceRetrieved,
		metrics.afnSourceStale,
		metrics.afnMaskedValues,
		metrics.eventSourceRequests,
		metrics.eventSourceDuration,
		metrics.eventSnapshots,
		metrics.operationalSourceRequests,
		metrics.operationalSourceDuration,
		metrics.operationalSnapshots,
		metrics.operationalDomains,
		metrics.identityAuthorization,
		metrics.collaborationOperations,
		metrics.groundedPlanningOperations,
	)
	return metrics
}

func (metrics *Metrics) observeIdentityAuthorization(outcome identity.AuthorizationOutcome) {
	metrics.identityAuthorization.WithLabelValues(string(outcome)).Inc()
}

func (metrics *Metrics) observeCollaboration(operation string, outcome string) {
	metrics.collaborationOperations.WithLabelValues(operation, outcome).Inc()
}

func (metrics *Metrics) observeGroundedPlanning(
	operation string,
	outcome string,
	providerClass string,
) {
	metrics.groundedPlanningOperations.WithLabelValues(
		operation,
		outcome,
		boundedGroundedPlanningProviderClass(providerClass),
	).Inc()
}

func boundedGroundedPlanningProviderClass(value string) string {
	switch value {
	case "openai-compatible", "deterministic-fake", "validated", "bounded":
		return value
	default:
		return "other"
	}
}

func instrumentHTTP(metrics *Metrics, next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		started := time.Now()
		recorder := &statusRecorder{ResponseWriter: writer, status: http.StatusOK}
		metrics.httpInFlight.Inc()
		defer metrics.httpInFlight.Dec()

		next.ServeHTTP(recorder, request)

		labels := []string{
			boundedMethod(request.Method),
			boundedRoute(request.Pattern),
			strconv.Itoa(recorder.status),
		}
		metrics.httpRequests.WithLabelValues(labels...).Inc()
		metrics.httpDuration.WithLabelValues(labels...).Observe(time.Since(started).Seconds())
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
}

func (recorder *statusRecorder) WriteHeader(status int) {
	if recorder.wroteHeader {
		return
	}
	recorder.status = status
	recorder.wroteHeader = true
	recorder.ResponseWriter.WriteHeader(status)
}

func (recorder *statusRecorder) Write(body []byte) (int, error) {
	if !recorder.wroteHeader {
		recorder.WriteHeader(http.StatusOK)
	}
	return recorder.ResponseWriter.Write(body)
}

func boundedMethod(method string) string {
	switch method {
	case http.MethodGet, http.MethodPost, http.MethodPut, http.MethodOptions:
		return method
	default:
		return "OTHER"
	}
}

func boundedRoute(pattern string) string {
	if pattern == "" {
		return "unmatched"
	}
	if _, route, found := strings.Cut(pattern, " "); found {
		return route
	}
	return pattern
}
