package api

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

type Metrics struct {
	httpRequests      *prometheus.CounterVec
	httpDuration      *prometheus.HistogramVec
	httpInFlight      prometheus.Gauge
	browserEvents     *prometheus.CounterVec
	browserDuration   *prometheus.HistogramVec
	telemetryBatches  *prometheus.CounterVec
	telemetryRejected *prometheus.CounterVec
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
	}
	registerer.MustRegister(
		metrics.httpRequests,
		metrics.httpDuration,
		metrics.httpInFlight,
		metrics.browserEvents,
		metrics.browserDuration,
		metrics.telemetryBatches,
		metrics.telemetryRejected,
	)
	return metrics
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
	case http.MethodGet, http.MethodPost, http.MethodOptions:
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
