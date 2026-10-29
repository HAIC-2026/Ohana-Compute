package api

import (
	"context"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/collaboration"
	"github.com/prometheus/client_golang/prometheus"
)

type operationsMetricReader interface {
	OperationalMetrics(context.Context, time.Time) (collaboration.OpsMetricSnapshot, error)
}

type operationsCollector struct {
	reader                      operationsMetricReader
	records, durations, success *prometheus.Desc
}

func newOperationsCollector(reader operationsMetricReader) *operationsCollector {
	return &operationsCollector{
		reader:    reader,
		records:   prometheus.NewDesc("hawaii_resilience_coordination_records", "Persisted coordination records and current exception conditions; no identifier labels.", []string{"mode", "kind", "state"}, nil),
		durations: prometheus.NewDesc("hawaii_resilience_coordination_handoff_duration_seconds", "Staff-recorded completed handoff intervals. Missing acknowledgments create no observation; not measured vehicle travel.", []string{"mode", "stage"}, nil),
		success:   prometheus.NewDesc("hawaii_resilience_coordination_collection_success", "Whether persisted coordination aggregates could be read.", nil, nil),
	}
}

func (collector *operationsCollector) Describe(out chan<- *prometheus.Desc) {
	out <- collector.records
	out <- collector.durations
	out <- collector.success
}

func (collector *operationsCollector) Collect(out chan<- prometheus.Metric) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	snapshot, err := collector.reader.OperationalMetrics(ctx, time.Now().UTC())
	if err != nil {
		out <- prometheus.MustNewConstMetric(collector.success, prometheus.GaugeValue, 0)
		return
	}
	out <- prometheus.MustNewConstMetric(collector.success, prometheus.GaugeValue, 1)
	for _, mode := range []string{"exercise", "operational"} {
		for kind, states := range map[string][]string{
			"request":   {"requested", "offered", "accepted", "declined", "picked_up", "arrived", "closed", "cancelled"},
			"readiness": {"open", "in_review", "changes_needed", "closed"},
			"condition": {"blocked", "overdue"},
		} {
			for _, state := range states {
				out <- prometheus.MustNewConstMetric(collector.records, prometheus.GaugeValue, snapshot.Counts[[3]string{mode, kind, state}], mode, kind, state)
			}
		}
		for _, stage := range []string{"request_acknowledgment", "offer_acceptance", "acceptance_pickup", "pickup_arrival"} {
			values := snapshot.Durations[[2]string{mode, stage}]
			buckets := map[float64]uint64{30: 0, 60: 0, 300: 0, 900: 0, 1800: 0, 3600: 0, 14400: 0, 86400: 0}
			var sum float64
			for _, value := range values {
				sum += value
				for bound := range buckets {
					if value <= bound {
						buckets[bound]++
					}
				}
			}
			out <- prometheus.MustNewConstHistogram(collector.durations, uint64(len(values)), sum, buckets, mode, stage)
		}
	}
}
