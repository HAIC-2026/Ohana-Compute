package api

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/eventtriggers"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/geoapplicability"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/nws"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/operationalstatus"
)

const lifecycleEvidenceSchema = "lifecycle-evidence.v1"

const lifecycleEvidenceDisclaimer = "Public evidence is planning context only. It is not dispatch, an order, road passability, transit or paratransit status, utility restoration, wildfire containment, shelter completeness, partner acceptance, resource movement, recovery completion, or an all-clear."

type lifecycleEvidenceFeed[T any] struct {
	State            string `json:"state"`
	Status           string `json:"status"`
	UnavailableCount int    `json:"unavailable_count"`
	Error            string `json:"error,omitempty"`
	Data             *T     `json:"data,omitempty"`
}

type lifecycleEvidenceSnapshot struct {
	SchemaVersion      string                                            `json:"schema_version"`
	SnapshotID         string                                            `json:"snapshot_id"`
	GeneratedAt        time.Time                                         `json:"generated_at"`
	Status             string                                            `json:"status"`
	ValidUntil         *time.Time                                        `json:"valid_until,omitempty"`
	PlanningDisclaimer string                                            `json:"planning_disclaimer"`
	PlanningLocation   lifecyclePlanningLocation                         `json:"planning_location"`
	EventTriggers      lifecycleEvidenceFeed[eventtriggers.Snapshot]     `json:"event_triggers"`
	OperationalStatus  lifecycleEvidenceFeed[operationalstatus.Snapshot] `json:"operational_status"`
	ShelterContext     shelterContext                                    `json:"shelter_context"`
}

type lifecyclePlanningLocation struct {
	Point            [2]float64 `json:"point"`
	AlgorithmVersion string     `json:"algorithm_version"`
}

type lifecycleEvidenceResult[T any] struct {
	value T
	err   error
}

func lifecycleEvidenceHandler(
	logger *slog.Logger,
	metrics *Metrics,
	eventReader EventTriggerReader,
	operationalReader OperationalStatusReader,
	now func() time.Time,
) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		latitude, longitude, err := parseCoordinates(request)
		if err != nil {
			writeAPIError(writer, http.StatusBadRequest, "invalid coordinates", "")
			return
		}
		point := geoapplicability.Point{
			Longitude: request.URL.Query().Get("lon"),
			Latitude:  request.URL.Query().Get("lat"),
		}
		if !geoapplicability.ValidPoint(point) {
			writeAPIError(writer, http.StatusBadRequest, "invalid coordinates", "")
			return
		}

		eventContext := request.Context()
		operationalContext := request.Context()
		if metrics != nil {
			eventContext = eventtriggers.WithSourceObserver(
				eventContext,
				func(observation eventtriggers.SourceObservation) {
					source := boundedEventSource(observation.Source)
					outcome := boundedEventOutcome(observation.Outcome)
					metrics.eventSourceRequests.WithLabelValues(source, outcome).Inc()
					metrics.eventSourceDuration.
						WithLabelValues(source, outcome).
						Observe(observation.Duration.Seconds())
				},
			)
			operationalContext = operationalstatus.WithSourceObserver(
				operationalContext,
				func(observation operationalstatus.SourceObservation) {
					source := boundedOperationalSource(observation.Source)
					outcome := boundedOperationalOutcome(observation.Outcome)
					metrics.operationalSourceRequests.WithLabelValues(source, outcome).Inc()
					metrics.operationalSourceDuration.
						WithLabelValues(source, outcome).
						Observe(observation.Duration.Seconds())
				},
			)
		}
		snapshot := loadLifecycleEvidence(
			eventContext,
			operationalContext,
			eventReader,
			operationalReader,
			latitude,
			longitude,
			point,
			now().UTC(),
		)
		if snapshot.EventTriggers.Error != "" {
			logger.Warn("lifecycle evidence feed unavailable", "feed", "event_triggers")
		}
		if snapshot.OperationalStatus.Error != "" {
			logger.Warn("lifecycle evidence feed unavailable", "feed", "operational_status")
		}

		etag := `W/"` + snapshot.SnapshotID + `"`
		writer.Header().Set("Cache-Control", "no-cache")
		writer.Header().Set("ETag", etag)
		if etagMatches(request.Header.Get("If-None-Match"), etag) {
			writer.WriteHeader(http.StatusNotModified)
			return
		}
		writeJSON(writer, http.StatusOK, snapshot)
	}
}

func loadLifecycleEvidence(
	eventContext context.Context,
	operationalContext context.Context,
	eventReader EventTriggerReader,
	operationalReader OperationalStatusReader,
	latitude float64,
	longitude float64,
	point geoapplicability.Point,
	generatedAt time.Time,
) lifecycleEvidenceSnapshot {
	eventResult := make(chan lifecycleEvidenceResult[eventtriggers.Snapshot], 1)
	operationalResult := make(chan lifecycleEvidenceResult[operationalstatus.Snapshot], 1)
	go func() {
		value, err := eventReader.Snapshot(eventContext)
		eventResult <- lifecycleEvidenceResult[eventtriggers.Snapshot]{value: value, err: err}
	}()
	go func() {
		value, err := operationalReader.Snapshot(
			operationalContext,
			latitude,
			longitude,
		)
		operationalResult <- lifecycleEvidenceResult[operationalstatus.Snapshot]{value: value, err: err}
	}()

	events := <-eventResult
	operations := <-operationalResult
	if events.err == nil {
		events.value = lifecycleEventApplicability(events.value, point)
	}
	snapshot := lifecycleEvidenceSnapshot{
		SchemaVersion:      lifecycleEvidenceSchema,
		GeneratedAt:        generatedAt,
		Status:             "complete",
		PlanningDisclaimer: lifecycleEvidenceDisclaimer,
		PlanningLocation: lifecyclePlanningLocation{
			Point: [2]float64{longitude, latitude}, AlgorithmVersion: geoapplicability.AlgorithmVersion,
		},
		EventTriggers:     eventEvidenceFeed(events),
		OperationalStatus: operationalEvidenceFeed(operations),
		ShelterContext:    lifecycleShelterContext(operations, generatedAt),
	}
	failed := 0
	if events.err != nil {
		failed++
	}
	if operations.err != nil {
		failed++
	}
	switch failed {
	case 2:
		snapshot.Status = "unavailable"
	case 1:
		snapshot.Status = "partial"
	default:
		if events.value.Status != "complete" || operations.value.Status != "complete" {
			snapshot.Status = "partial"
		}
	}
	snapshot.ValidUntil = lifecycleValidUntil(events, operations)
	snapshot.SnapshotID = lifecycleSnapshotID(snapshot)
	return snapshot
}

func lifecycleEventApplicability(
	snapshot eventtriggers.Snapshot,
	point geoapplicability.Point,
) eventtriggers.Snapshot {
	snapshot.Triggers = append([]eventtriggers.Trigger{}, snapshot.Triggers...)
	for index := range snapshot.Triggers {
		product := snapshot.Triggers[index].NWSProduct
		if product == nil {
			continue
		}
		copy := *product
		copy.Product = nws.CloneProduct(copy.Product)
		evaluation := geoapplicability.Evaluate(
			copy.Geometry.Status,
			copy.Geometry.Type,
			copy.Geometry.Shape,
			point,
		)
		copy.Applicability = evaluation.Result
		copy.ApplicabilityReason = evaluation.Reason
		snapshot.Triggers[index].NWSProduct = &copy
	}
	return snapshot
}

func eventEvidenceFeed(
	result lifecycleEvidenceResult[eventtriggers.Snapshot],
) lifecycleEvidenceFeed[eventtriggers.Snapshot] {
	if result.err != nil {
		return lifecycleEvidenceFeed[eventtriggers.Snapshot]{
			State: "unavailable", Status: "unavailable",
			UnavailableCount: 1, Error: "event-trigger feed unavailable",
		}
	}
	state := "fresh"
	for _, source := range result.value.SourceStates {
		if source.Status == "stale" {
			state = "stale"
			break
		}
	}
	return lifecycleEvidenceFeed[eventtriggers.Snapshot]{
		State: state, Status: result.value.Status,
		UnavailableCount: boundedUnavailableCount(len(result.value.SourceErrors)),
		Data:             &result.value,
	}
}

func operationalEvidenceFeed(
	result lifecycleEvidenceResult[operationalstatus.Snapshot],
) lifecycleEvidenceFeed[operationalstatus.Snapshot] {
	if result.err != nil {
		return lifecycleEvidenceFeed[operationalstatus.Snapshot]{
			State: "unavailable", Status: "unavailable",
			UnavailableCount: 1, Error: "operational-status feed unavailable",
		}
	}
	state := "fresh"
	for _, domain := range result.value.Domains {
		if domain.Status == "stale" {
			state = "stale"
			break
		}
	}
	if result.value.Status == "unavailable" {
		state = "unavailable"
	}
	unavailableCount := 0
	for _, domain := range result.value.Domains {
		if domain.Status == "unavailable" {
			unavailableCount++
		}
	}
	return lifecycleEvidenceFeed[operationalstatus.Snapshot]{
		State: state, Status: result.value.Status,
		UnavailableCount: boundedUnavailableCount(unavailableCount),
		Data:             &result.value,
	}
}

func boundedUnavailableCount(count int) int {
	if count > 99 {
		return 99
	}
	return count
}

func lifecycleValidUntil(
	events lifecycleEvidenceResult[eventtriggers.Snapshot],
	operations lifecycleEvidenceResult[operationalstatus.Snapshot],
) *time.Time {
	var candidates []time.Time
	if events.err == nil {
		for _, source := range events.value.SourceStates {
			if !source.FreshUntil.IsZero() {
				candidates = append(candidates, source.FreshUntil.UTC())
			}
		}
	}
	if operations.err == nil {
		for _, domain := range operations.value.Domains {
			for _, raw := range []string{
				domain.Freshness.FreshUntil,
				domain.Freshness.ExpiresAt,
			} {
				if value, err := time.Parse(time.RFC3339, raw); err == nil {
					candidates = append(candidates, value.UTC())
				}
			}
		}
	}
	if len(candidates) == 0 {
		return nil
	}
	earliest := candidates[0]
	for _, candidate := range candidates[1:] {
		if candidate.Before(earliest) {
			earliest = candidate
		}
	}
	return &earliest
}

func lifecycleSnapshotID(snapshot lifecycleEvidenceSnapshot) string {
	content := struct {
		SchemaVersion      string                                            `json:"schema_version"`
		Status             string                                            `json:"status"`
		ValidUntil         *time.Time                                        `json:"valid_until,omitempty"`
		PlanningDisclaimer string                                            `json:"planning_disclaimer"`
		PlanningLocation   lifecyclePlanningLocation                         `json:"planning_location"`
		EventTriggers      lifecycleEvidenceFeed[eventtriggers.Snapshot]     `json:"event_triggers"`
		OperationalStatus  lifecycleEvidenceFeed[operationalstatus.Snapshot] `json:"operational_status"`
		ShelterContext     shelterContext                                    `json:"shelter_context"`
	}{
		SchemaVersion: snapshot.SchemaVersion, Status: snapshot.Status,
		ValidUntil: snapshot.ValidUntil, PlanningDisclaimer: snapshot.PlanningDisclaimer,
		PlanningLocation: snapshot.PlanningLocation,
		EventTriggers:    snapshot.EventTriggers, OperationalStatus: snapshot.OperationalStatus,
		ShelterContext: snapshot.ShelterContext,
	}
	encoded, _ := json.Marshal(content)
	var value any
	_ = json.Unmarshal(encoded, &value)
	removeGeneratedAt(value)
	canonical, _ := json.Marshal(value)
	sum := sha256.Sum256(canonical)
	return hex.EncodeToString(sum[:16])
}

func removeGeneratedAt(value any) {
	switch typed := value.(type) {
	case map[string]any:
		delete(typed, "generated_at")
		for _, child := range typed {
			removeGeneratedAt(child)
		}
	case []any:
		for _, child := range typed {
			removeGeneratedAt(child)
		}
	}
}

func etagMatches(header string, etag string) bool {
	expected := strings.TrimPrefix(etag, "W/")
	for _, candidate := range strings.Split(header, ",") {
		candidate = strings.TrimSpace(candidate)
		if candidate == "*" || strings.TrimPrefix(candidate, "W/") == expected {
			return true
		}
	}
	return false
}
