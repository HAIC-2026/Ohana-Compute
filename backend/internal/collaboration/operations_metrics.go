package collaboration

import (
	"context"
	"encoding/json"
	"time"
)

type OpsMetricSnapshot struct {
	Counts    map[[3]string]float64
	Durations map[[2]string][]float64
}

// OperationalMetrics returns only controlled aggregates, never record/actor references.
func (store *SQLiteStore) OperationalMetrics(ctx context.Context, now time.Time) (OpsMetricSnapshot, error) {
	result := OpsMetricSnapshot{Counts: map[[3]string]float64{}, Durations: map[[2]string][]float64{}}
	rows, err := store.db.QueryContext(ctx, `SELECT kind,document FROM operational_records`)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var kind string
		var body []byte
		if err := rows.Scan(&kind, &body); err != nil {
			return result, err
		}
		if kind == "request" {
			var request OpsRequest
			if err := json.Unmarshal(body, &request); err != nil {
				return result, err
			}
			result.Counts[[3]string{request.Mode, "request", request.Status}]++
			active := request.Status != "closed" && request.Status != "cancelled" && request.Status != "arrived"
			if active && (now.After(request.DueAt) || (request.Status == "accepted" && request.ETA != nil && now.After(*request.ETA))) {
				result.Counts[[3]string{request.Mode, "condition", "overdue"}]++
			}
			if active && request.Blocker != "" {
				result.Counts[[3]string{request.Mode, "condition", "blocked"}]++
			}
			var offered, accepted, pickup time.Time
			for _, event := range request.Events {
				stage := ""
				var start time.Time
				switch event.Action {
				case "verify":
					stage = "request_acknowledgment"
					start = request.CreatedAt
				case "offer":
					offered = event.At
					accepted = time.Time{}
				case "accept":
					stage = "offer_acceptance"
					start = offered
					accepted = event.At
				case "decline":
					accepted = time.Time{}
				case "pickup":
					stage = "acceptance_pickup"
					start = accepted
					pickup = event.At
				case "arrive":
					stage = "pickup_arrival"
					start = pickup
				}
				if stage != "" && !start.IsZero() && !event.At.Before(start) {
					key := [2]string{request.Mode, stage}
					result.Durations[key] = append(result.Durations[key], event.At.Sub(start).Seconds())
				}
			}
		} else if kind == "readiness" {
			var task ReadinessTask
			if err := json.Unmarshal(body, &task); err != nil {
				return result, err
			}
			result.Counts[[3]string{task.Mode, "readiness", task.Status}]++
		}
	}
	return result, rows.Err()
}
