package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/eventtriggers"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/geoapplicability"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/operationalstatus"
)

type coordinateOperationalReader struct {
	snapshot  operationalstatus.Snapshot
	err       error
	latitude  float64
	longitude float64
}

func (reader *coordinateOperationalReader) Snapshot(
	_ context.Context,
	latitude float64,
	longitude float64,
) (operationalstatus.Snapshot, error) {
	reader.latitude = latitude
	reader.longitude = longitude
	return reader.snapshot, reader.err
}

func lifecycleEvidenceFixtures(generatedAt time.Time) (
	eventtriggers.Snapshot,
	operationalstatus.Snapshot,
) {
	validUntil := time.Date(2026, 10, 29, 22, 0, 0, 0, time.UTC)
	events := eventtriggers.Snapshot{
		SchemaVersion: eventtriggers.SchemaVersion,
		GeneratedAt:   generatedAt,
		Status:        "complete",
		Triggers: []eventtriggers.Trigger{{
			SchemaVersion: eventtriggers.SchemaVersion,
			GeneratedAt:   generatedAt,
			Source:        "nws",
			Title:         "Flood advisory",
		}},
		SourceStates: []eventtriggers.SourceState{{
			ID: "nws-hi-alerts", Status: "fresh",
			RetrievedAt: generatedAt.Add(-time.Minute), FreshUntil: validUntil,
		}},
	}
	operations := operationalstatus.Snapshot{
		SchemaVersion: operationalstatus.SchemaVersion,
		GeneratedAt:   generatedAt,
		Status:        "partial",
		Domains: []operationalstatus.DomainStatus{{
			Domain: "shelter", Status: "reported_live",
			Freshness: operationalstatus.Freshness{
				RetrievedAt: generatedAt.Add(-time.Minute).Format(time.RFC3339),
				FreshUntil:  validUntil.Add(time.Hour).Format(time.RFC3339),
			},
		}},
	}
	return events, operations
}

func TestLifecycleEvidenceSnapshotIDIgnoresGeneratedAtOnlyChanges(t *testing.T) {
	t.Parallel()
	firstTime := time.Date(2026, 10, 29, 20, 0, 0, 0, time.UTC)
	firstEvents, firstOperations := lifecycleEvidenceFixtures(firstTime)
	secondEvents, secondOperations := lifecycleEvidenceFixtures(firstTime)
	secondEvents.GeneratedAt = firstTime.Add(time.Minute)
	secondEvents.Triggers[0].GeneratedAt = firstTime.Add(time.Minute)
	secondOperations.GeneratedAt = firstTime.Add(time.Minute)

	first := loadLifecycleEvidence(
		context.Background(),
		context.Background(),
		eventTriggerReaderStub{snapshot: firstEvents},
		operationalStatusReaderStub{snapshot: firstOperations},
		21.45, -158.19, geoapplicability.Point{Longitude: "-158.19", Latitude: "21.45"}, firstTime,
	)
	second := loadLifecycleEvidence(
		context.Background(),
		context.Background(),
		eventTriggerReaderStub{snapshot: secondEvents},
		operationalStatusReaderStub{snapshot: secondOperations},
		21.45, -158.19, geoapplicability.Point{Longitude: "-158.19", Latitude: "21.45"}, firstTime.Add(time.Minute),
	)
	if first.SnapshotID != second.SnapshotID {
		t.Fatalf("generated-at-only change altered snapshot ID: %s != %s", first.SnapshotID, second.SnapshotID)
	}
	firstBytes, err := json.Marshal(first)
	if err != nil {
		t.Fatal(err)
	}
	secondBytes, err := json.Marshal(second)
	if err != nil {
		t.Fatal(err)
	}
	if string(firstBytes) == string(secondBytes) {
		t.Fatal("generated-at-only change unexpectedly retained byte identity")
	}

	secondOperations.Domains[0].Status = "stale"
	changed := loadLifecycleEvidence(
		context.Background(),
		context.Background(),
		eventTriggerReaderStub{snapshot: secondEvents},
		operationalStatusReaderStub{snapshot: secondOperations},
		21.45, -158.19, geoapplicability.Point{Longitude: "-158.19", Latitude: "21.45"}, firstTime.Add(2*time.Minute),
	)
	if first.SnapshotID == changed.SnapshotID {
		t.Fatal("content change did not alter snapshot ID")
	}
}

func TestLifecycleEvidencePreservesPartialAndUnavailableFeeds(t *testing.T) {
	t.Parallel()
	if got := boundedUnavailableCount(100); got != 99 {
		t.Fatalf("unavailable count was not bounded: %d", got)
	}
	now := time.Date(2026, 10, 29, 20, 0, 0, 0, time.UTC)
	events, _ := lifecycleEvidenceFixtures(now)
	partial := loadLifecycleEvidence(
		context.Background(),
		context.Background(),
		eventTriggerReaderStub{snapshot: func() eventtriggers.Snapshot {
			events.Status = "partial"
			events.SourceErrors = []eventtriggers.SourceError{{
				Source: "ptwc", Error: "source unavailable",
			}}
			return events
		}()},
		operationalStatusReaderStub{err: errors.New("private upstream error")},
		21.45, -158.19, geoapplicability.Point{Longitude: "-158.19", Latitude: "21.45"}, now,
	)
	if partial.Status != "partial" || partial.EventTriggers.Data == nil ||
		partial.EventTriggers.Status != "partial" ||
		partial.EventTriggers.UnavailableCount != 1 ||
		partial.OperationalStatus.State != "unavailable" ||
		partial.OperationalStatus.Data != nil ||
		partial.OperationalStatus.Error != "operational-status feed unavailable" {
		t.Fatalf("unexpected partial snapshot: %#v", partial)
	}

	unavailable := loadLifecycleEvidence(
		context.Background(),
		context.Background(),
		eventTriggerReaderStub{err: errors.New("events failed")},
		operationalStatusReaderStub{err: errors.New("operations failed")},
		21.45, -158.19, geoapplicability.Point{Longitude: "-158.19", Latitude: "21.45"}, now,
	)
	if unavailable.Status != "unavailable" ||
		unavailable.EventTriggers.State != "unavailable" ||
		unavailable.OperationalStatus.State != "unavailable" {
		t.Fatalf("unexpected unavailable snapshot: %#v", unavailable)
	}
}

func TestLifecycleEvidenceEndpointCoordinatesValidUntilAndETag(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 29, 20, 0, 0, 0, time.UTC)
	events, operations := lifecycleEvidenceFixtures(now)
	operationalReader := &coordinateOperationalReader{snapshot: operations}
	handler := lifecycleEvidenceHandler(
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		nil,
		eventTriggerReaderStub{snapshot: events},
		operationalReader,
		func() time.Time { return now },
	)

	response := httptest.NewRecorder()
	handler.ServeHTTP(
		response,
		httptest.NewRequest(http.MethodGet, "/api/v1/lifecycle/evidence?lat=21.45&lon=-158.19", nil),
	)
	if response.Code != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", response.Code, response.Body.String())
	}
	if operationalReader.latitude != 21.45 || operationalReader.longitude != -158.19 {
		t.Fatalf("coordinates not forwarded: %v,%v", operationalReader.latitude, operationalReader.longitude)
	}
	etag := response.Header().Get("ETag")
	if !strings.HasPrefix(etag, `W/"`) {
		t.Fatalf("expected weak ETag, got %q", etag)
	}
	if body := response.Body.String(); !containsAll(body, `"valid_until":"2026-10-29T22:00:00Z"`, lifecycleEvidenceDisclaimer,
		`"shelter_context":{"derivation_version":"fema-shelter-context.v1"`,
		`"retrieved_at":null,"fresh_until":null,"items":[]`) {
		t.Fatalf("missing valid-until or disclaimer: %s", body)
	}

	notModified := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/v1/lifecycle/evidence?lat=21.45&lon=-158.19", nil)
	request.Header.Set("If-None-Match", etag)
	handler.ServeHTTP(notModified, request)
	if notModified.Code != http.StatusNotModified || notModified.Body.Len() != 0 {
		t.Fatalf("expected empty 304, got %d: %s", notModified.Code, notModified.Body.String())
	}

	invalid := httptest.NewRecorder()
	handler.ServeHTTP(
		invalid,
		httptest.NewRequest(http.MethodGet, "/api/v1/lifecycle/evidence?lat=private&lon=-158.19", nil),
	)
	if invalid.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid coordinate 400, got %d", invalid.Code)
	}
}

func containsAll(value string, needles ...string) bool {
	for _, needle := range needles {
		if !strings.Contains(value, needle) {
			return false
		}
	}
	return true
}
