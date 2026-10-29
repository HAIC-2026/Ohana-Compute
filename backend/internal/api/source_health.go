package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/catalog"
)

// Only source metadata is retained, never response bodies, coordinates or users.
type sourceHealth struct {
	mu     sync.Mutex
	states map[string]sourceObservation
	now    func() time.Time
}

type sourceObservation struct {
	RetrievedAt time.Time `json:"last_successful_retrieval,omitempty"`
	FreshUntil  time.Time `json:"fresh_until,omitempty"`
	ObservedAt  time.Time `json:"observed_at,omitempty"`
	Status      string    `json:"status"`
}

type sourceHealthRow struct {
	catalog.Source
	sourceObservation
	Coverage string `json:"coverage"`
}

func newSourceHealth() *sourceHealth {
	return &sourceHealth{states: make(map[string]sourceObservation), now: time.Now}
}

func (health *sourceHealth) ServeHTTP(writer http.ResponseWriter, _ *http.Request) {
	health.mu.Lock()
	defer health.mu.Unlock()
	now := health.now().UTC()
	rows := make([]sourceHealthRow, 0)
	for _, source := range catalog.All() {
		state, ok := health.states[source.ID]
		if !ok {
			state.Status = "not_observed"
			if !strings.HasPrefix(source.Integration, "integrated") {
				state.Status = "not_integrated"
			}
		} else if state.Status == "fresh" && !now.Before(state.FreshUntil) {
			state.Status = "stale"
		}
		rows = append(rows, sourceHealthRow{
			Source: source, sourceObservation: state,
			Coverage: "Latest backend observation only; not a statewide coverage or availability guarantee. See capabilities and known gaps.",
		})
	}
	writer.Header().Set("Cache-Control", "no-store")
	writeJSON(writer, http.StatusOK, map[string]any{
		"generated_at": now, "sources": rows,
		"scope": "Process-local metadata from public planning requests. Unknown is not zero. Restart clears observations. This page does not probe upstream sources.",
	})
}

var observedSourceRoutes = map[string]string{
	"/api/v1/events": "nws-hi-alerts", "/api/v1/events/hurricanes": "nhc-cphc-gis",
	"/api/v1/events/tsunami": "ptwc-cap", "/api/v1/risk/tsunami": "state-tsunami-zones",
	"/api/v1/risk/flood": "state-dfirm", "/api/v1/risk/wildfire": "state-fire-risk",
	"/api/v1/shelters/open": "fema-open-shelters",
	"/api/v1/community/acs": "acs-5-year", "/api/v1/community/svi": "cdc-svi-2022",
	"/api/v1/community/empower": "hhs-empower", "/api/v1/community/fema-risk": "fema-nri",
	"/api/v1/community/profile": "", "/api/v1/planning/event-triggers": "",
	"/api/v1/planning/live-status":            "",
	"/api/v1/transportation/planned-closures": "hdot-planned-lane-closures",
}

type healthWriter struct {
	http.ResponseWriter
	health   *sourceHealth
	fallback string
}

func observeSourceFailure(writer http.ResponseWriter, id, outcome string) {
	if outcome != "error" {
		return
	}
	if observer, ok := writer.(*healthWriter); ok {
		observer.health.record(id, "error", "", "")
	}
}

func (health *sourceHealth) observeRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if source, ok := observedSourceRoutes[request.URL.Path]; ok && request.Method == http.MethodGet {
			next.ServeHTTP(&healthWriter{writer, health, source}, request)
			return
		}
		next.ServeHTTP(writer, request)
	})
}

var healthSourceAliases = map[string]string{
	"nws": "nws-hi-alerts", "ptwc": "ptwc-cap", "usgs_comcat": "usgs-comcat",
	"usgs_hans": "usgs-hans", "fema_open_shelters": "fema-open-shelters",
}

func (health *sourceHealth) record(id, status, retrieved, until string) {
	if alias, ok := healthSourceAliases[id]; ok {
		id = alias
	}
	known := false
	for _, source := range catalog.All() {
		if source.ID == id {
			known = true
			break
		}
	}
	if !known {
		return
	}
	at, _ := time.Parse(time.RFC3339, retrieved)
	expires, _ := time.Parse(time.RFC3339, until)
	if status == "unavailable" || status == "error" {
		at, expires = time.Time{}, time.Time{}
	} else {
		if at.IsZero() || expires.IsZero() {
			return // No successful retrieval may be inferred from generated_at.
		}
		if status != "stale" {
			status = "fresh"
		}
	}
	health.mu.Lock()
	defer health.mu.Unlock()
	state := health.states[id]
	// A stale response must not erase a newer successful observation.
	if !at.IsZero() && (state.RetrievedAt.IsZero() || !at.Before(state.RetrievedAt)) {
		state.RetrievedAt, state.FreshUntil = at, expires
	}
	state.Status, state.ObservedAt = status, health.now().UTC()
	health.states[id] = state
}

func (writer *healthWriter) observe(status int, value any) {
	if status >= 500 && writer.fallback != "" {
		writer.health.record(writer.fallback, "error", "", "")
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return // writeJSON reports encoding failures.
	}
	var decoded any
	if json.Unmarshal(encoded, &decoded) == nil {
		writer.walk(decoded)
	}
}

func stringField(value map[string]any, key string) string {
	text, _ := value[key].(string)
	return text
}

func (writer *healthWriter) walk(value any) {
	switch node := value.(type) {
	case []any:
		for _, child := range node {
			writer.walk(child)
		}
	case map[string]any:
		id := stringField(node, "id")
		status := stringField(node, "status")
		retrieved, until := stringField(node, "retrieved_at"), stringField(node, "fresh_until")
		if source := stringField(node, "source"); source != "" {
			id = source
			if _, failed := node["error"]; failed {
				status = "error"
			}
		}
		if provenance, ok := node["provenance"].(map[string]any); ok {
			if sourceID := stringField(provenance, "source_id"); sourceID != "" {
				id = sourceID
				if freshness, ok := node["freshness"].(map[string]any); ok {
					retrieved, until = stringField(freshness, "retrieved_at"), stringField(freshness, "fresh_until")
				}
			} else if id != "" {
				status = stringField(provenance, "source_status")
				retrieved, until = stringField(provenance, "retrieved_at"), stringField(provenance, "fresh_until")
			}
		}
		if id != "" && status != "" {
			writer.health.record(id, status, retrieved, until)
		}
		for _, child := range node {
			writer.walk(child)
		}
	}
}
