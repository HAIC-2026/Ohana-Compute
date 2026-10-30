package eventtriggers

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/hans"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/nws"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/ptwc"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/usgs"
)

const (
	SchemaVersion         = "event-trigger-snapshot.v1"
	AuthorityLimitation   = "Planning context only. Source products, forecasts, watches, advisories, warnings, CAP response types, earthquake tsunami flags, and volcano levels are not legal evacuation orders."
	CountyUnavailable     = "County evacuation-order data unavailable"
	UnavailableNotNoOrder = "Unavailable does not mean no order."
)

var ErrNoOperationalSources = errors.New("no supported operational event-trigger source succeeded")

type NWSReader interface {
	ActiveAlerts(context.Context) (nws.Snapshot, error)
}

type PTWCReader interface {
	LatestProduct(context.Context) (ptwc.Snapshot, error)
}

type ComCatReader interface {
	RecentEvents(context.Context) (usgs.Snapshot, error)
}

type HANSReader interface {
	Snapshot(context.Context) (hans.Snapshot, error)
}

type SourceObservation struct {
	Source   string
	Outcome  string
	Duration time.Duration
}

type sourceObserverKey struct{}

func WithSourceObserver(
	ctx context.Context,
	observer func(SourceObservation),
) context.Context {
	return context.WithValue(ctx, sourceObserverKey{}, observer)
}

func reportSourceObservation(ctx context.Context, observation SourceObservation) {
	observer, ok := ctx.Value(sourceObserverKey{}).(func(SourceObservation))
	if ok && observer != nil {
		observer(observation)
	}
}

type Facts struct {
	Severity          string   `json:"severity,omitempty"`
	Certainty         string   `json:"certainty,omitempty"`
	Urgency           string   `json:"urgency,omitempty"`
	ResponseType      string   `json:"response_type,omitempty"`
	Magnitude         *float64 `json:"magnitude,omitempty"`
	TsunamiFlag       *bool    `json:"tsunami_flag,omitempty"`
	VolcanoAlertLevel string   `json:"volcano_alert_level,omitempty"`
}

type Provenance struct {
	SourceAuthority         string `json:"source_authority"`
	ProductID               string `json:"product_id,omitempty"`
	ProductType             string `json:"product_type"`
	IssuedAt                string `json:"issued_at,omitempty"`
	EffectiveAt             string `json:"effective_at,omitempty"`
	ExpiresAt               string `json:"expires_at,omitempty"`
	RetrievedAt             string `json:"retrieved_at"`
	FreshUntil              string `json:"fresh_until,omitempty"`
	SourceStatus            string `json:"source_status"`
	OfficialInstructionsURL string `json:"official_instructions_url"`
}

type Trigger struct {
	SchemaVersion       string      `json:"schema_version"`
	GeneratedAt         time.Time   `json:"generated_at"`
	Source              string      `json:"source"`
	HazardEventKind     string      `json:"hazard_event_kind"`
	JurisdictionScope   string      `json:"jurisdiction_scope"`
	Lifecycle           string      `json:"lifecycle"`
	PlanningState       string      `json:"planning_state"`
	AuthorityKind       string      `json:"authority_kind"`
	LegalOrderStatus    string      `json:"legal_order_status"`
	AuthorityLimitation string      `json:"authority_limitation"`
	PlanningConsequence string      `json:"planning_consequence"`
	Title               string      `json:"title"`
	Facts               Facts       `json:"facts"`
	Provenance          Provenance  `json:"provenance"`
	NWSProduct          *NWSProduct `json:"nws_product,omitempty"`
}

type SourceError struct {
	Source string `json:"source"`
	Error  string `json:"error"`
}

// Retrieval health is independent of whether a feed currently contains any events.
type SourceState struct {
	ID          string    `json:"id"`
	Status      string    `json:"status"`
	RetrievedAt time.Time `json:"retrieved_at"`
	FreshUntil  time.Time `json:"fresh_until"`
}

type Snapshot struct {
	SchemaVersion      string        `json:"schema_version"`
	GeneratedAt        time.Time     `json:"generated_at"`
	Status             string        `json:"status"`
	PlanningDisclaimer string        `json:"planning_disclaimer"`
	CountyOrderNotice  string        `json:"county_order_notice"`
	UnavailableMeaning string        `json:"unavailable_meaning"`
	Triggers           []Trigger     `json:"triggers"`
	SourceErrors       []SourceError `json:"source_errors,omitempty"`
	SourceStates       []SourceState `json:"source_states,omitempty"`
}

type Config struct {
	NWS    NWSReader
	PTWC   PTWCReader
	ComCat ComCatReader
	HANS   HANSReader
	Now    func() time.Time
}

type Service struct {
	nws    NWSReader
	ptwc   PTWCReader
	comCat ComCatReader
	hans   HANSReader
	now    func() time.Time
}

type sourceResult[T any] struct {
	value    T
	err      error
	duration time.Duration
}

func loadSource[T any](
	ctx context.Context,
	load func(context.Context) (T, error),
) <-chan sourceResult[T] {
	result := make(chan sourceResult[T], 1)
	go func() {
		started := time.Now()
		value, err := load(ctx)
		result <- sourceResult[T]{
			value: value, err: err, duration: time.Since(started),
		}
	}()
	return result
}

func NewService(config Config) *Service {
	if config.NWS == nil || config.PTWC == nil || config.ComCat == nil || config.HANS == nil {
		panic("eventtriggers: all source readers are required")
	}
	now := config.Now
	if now == nil {
		now = time.Now
	}
	return &Service{
		nws: config.NWS, ptwc: config.PTWC, comCat: config.ComCat,
		hans: config.HANS, now: now,
	}
}

func (service *Service) Snapshot(ctx context.Context) (Snapshot, error) {
	nwsResult := loadSource(ctx, service.nws.ActiveAlerts)
	ptwcResult := loadSource(ctx, service.ptwc.LatestProduct)
	comCatResult := loadSource(ctx, service.comCat.RecentEvents)
	hansResult := loadSource(ctx, service.hans.Snapshot)
	nwsSource := <-nwsResult
	ptwcSource := <-ptwcResult
	comCatSource := <-comCatResult
	hansSource := <-hansResult
	// Evaluate validity after retrieval, including expiry crossed during I/O.
	now := service.now().UTC()
	result := Snapshot{
		SchemaVersion:      SchemaVersion,
		GeneratedAt:        now,
		Status:             "complete",
		PlanningDisclaimer: "Planning context — not an evacuation order",
		CountyOrderNotice:  CountyUnavailable,
		UnavailableMeaning: UnavailableNotNoOrder,
		Triggers:           []Trigger{countyUnavailableTrigger(now)},
	}
	successes := 0

	if nwsSource.err != nil {
		result.SourceErrors = append(result.SourceErrors, SourceError{Source: "nws", Error: nwsSource.err.Error()})
		result.Triggers = append(result.Triggers, unavailableTrigger(now, "nws", "NOAA National Weather Service", "weather_alert", "https://www.weather.gov/hfo/"))
		reportSourceObservation(ctx, SourceObservation{Source: "nws", Outcome: "error", Duration: nwsSource.duration})
	} else {
		successes++
		source := nwsSource.value.Source
		for _, warning := range nwsSource.value.Warnings {
			result.SourceErrors = append(result.SourceErrors, SourceError{Source: "nws", Error: warning})
		}
		result.SourceStates = append(result.SourceStates, SourceState{
			ID: "nws-hi-alerts", Status: source.Status, RetrievedAt: source.RetrievedAt, FreshUntil: source.FreshUntil,
		})
		result.Triggers = append(result.Triggers, normalizeNWS(nwsSource.value, now)...)
		reportSourceObservation(ctx, SourceObservation{Source: "nws", Outcome: sourceOutcome(nwsSource.value.Source.Status), Duration: nwsSource.duration})
	}

	if ptwcSource.err != nil {
		result.SourceErrors = append(result.SourceErrors, SourceError{Source: "ptwc", Error: ptwcSource.err.Error()})
		result.Triggers = append(result.Triggers, unavailableTrigger(now, "ptwc", "NOAA Pacific Tsunami Warning Center", "tsunami_product", "https://www.tsunami.gov/"))
		reportSourceObservation(ctx, SourceObservation{Source: "ptwc", Outcome: "error", Duration: ptwcSource.duration})
	} else {
		successes++
		source := ptwcSource.value.Source
		result.SourceStates = append(result.SourceStates, SourceState{
			ID: "ptwc-cap", Status: source.Status, RetrievedAt: source.RetrievedAt, FreshUntil: source.FreshUntil,
		})
		result.Triggers = append(result.Triggers, normalizePTWC(ptwcSource.value, now))
		reportSourceObservation(ctx, SourceObservation{Source: "ptwc", Outcome: sourceOutcome(ptwcSource.value.Source.Status), Duration: ptwcSource.duration})
	}

	if comCatSource.err != nil {
		result.SourceErrors = append(result.SourceErrors, SourceError{Source: "usgs_comcat", Error: comCatSource.err.Error()})
		result.Triggers = append(result.Triggers, unavailableTrigger(now, "usgs_comcat", "U.S. Geological Survey", "earthquake", "https://earthquake.usgs.gov/earthquakes/map/"))
		reportSourceObservation(ctx, SourceObservation{Source: "usgs_comcat", Outcome: "error", Duration: comCatSource.duration})
	} else {
		successes++
		source := comCatSource.value.Source
		result.SourceStates = append(result.SourceStates, SourceState{
			ID: "usgs-comcat", Status: source.Status, RetrievedAt: source.RetrievedAt, FreshUntil: source.FreshUntil,
		})
		result.Triggers = append(result.Triggers, normalizeComCat(comCatSource.value, now)...)
		reportSourceObservation(ctx, SourceObservation{Source: "usgs_comcat", Outcome: sourceOutcome(comCatSource.value.Source.Status), Duration: comCatSource.duration})
	}

	if hansSource.err != nil {
		result.SourceErrors = append(result.SourceErrors, SourceError{Source: "usgs_hans", Error: hansSource.err.Error()})
		hansSource.value = hans.Snapshot{
			Authority:   "U.S. Geological Survey Hawaiian Volcano Observatory",
			Status:      "unavailable",
			RetrievedAt: now,
			Limitation:  "HANS is provisionally unavailable.",
			OfficialURL: "https://volcanoes.usgs.gov/hans-public/",
		}
	}
	result.Triggers = append(result.Triggers, normalizeHANS(hansSource.value, now))
	reportSourceObservation(ctx, SourceObservation{
		Source:   "usgs_hans",
		Outcome:  "error",
		Duration: hansSource.duration,
	})

	if successes == 0 {
		return Snapshot{}, ErrNoOperationalSources
	}
	if len(result.SourceErrors) > 0 {
		result.Status = "partial"
	}
	return result, nil
}

func normalizePTWC(snapshot ptwc.Snapshot, now time.Time) Trigger {
	product := snapshot.Product
	lifecycle := lifecycle(product.Expires, snapshot.Source.Status, now)
	return Trigger{
		SchemaVersion:       SchemaVersion,
		GeneratedAt:         now,
		Source:              "ptwc",
		HazardEventKind:     "tsunami",
		JurisdictionScope:   "statewide",
		Lifecycle:           lifecycle,
		PlanningState:       ptwcPlanningState(product.ActionLevel, lifecycle),
		AuthorityKind:       "federal_warning_center",
		LegalOrderStatus:    "not_an_evacuation_order",
		AuthorityLimitation: AuthorityLimitation,
		PlanningConsequence: planningConsequence("ptwc", product.ActionLevel, lifecycle, false),
		Title:               product.Headline,
		Facts: Facts{
			Severity: product.Severity, Certainty: product.Certainty,
			Urgency: product.Urgency, ResponseType: product.ResponseType,
		},
		Provenance: Provenance{
			SourceAuthority: snapshot.Source.Authority, ProductID: product.Identifier,
			ProductType: product.Event, IssuedAt: product.SentAt,
			EffectiveAt: product.Onset, ExpiresAt: product.Expires,
			RetrievedAt:             snapshot.Source.RetrievedAt.Format(time.RFC3339),
			FreshUntil:              snapshot.Source.FreshUntil.Format(time.RFC3339),
			SourceStatus:            snapshot.Source.Status,
			OfficialInstructionsURL: officialURL(product.Web, "https://www.tsunami.gov/"),
		},
	}
}

func normalizeComCat(snapshot usgs.Snapshot, now time.Time) []Trigger {
	triggers := make([]Trigger, 0, len(snapshot.Events))
	for _, event := range snapshot.Events {
		eventTime, _ := time.Parse(time.RFC3339, event.Time)
		lifecycleValue := "active"
		if snapshot.Source.Status == "stale" {
			lifecycleValue = "stale"
		} else if eventTime.IsZero() || now.Sub(eventTime) > 6*time.Hour {
			lifecycleValue = "expired"
		}
		tsunami := event.Tsunami
		magnitude := event.Magnitude
		planningState := "monitor"
		if event.Tsunami && lifecycleValue == "active" {
			planningState = "prepare"
		}
		triggers = append(triggers, Trigger{
			SchemaVersion:       SchemaVersion,
			GeneratedAt:         now,
			Source:              "usgs_comcat",
			HazardEventKind:     "earthquake",
			JurisdictionScope:   "statewide",
			Lifecycle:           lifecycleValue,
			PlanningState:       planningStateForLifecycle(planningState, lifecycleValue),
			AuthorityKind:       "federal_science_agency",
			LegalOrderStatus:    "not_an_evacuation_order",
			AuthorityLimitation: AuthorityLimitation,
			PlanningConsequence: planningConsequence("usgs_comcat", "earthquake", lifecycleValue, event.Tsunami),
			Title:               event.Title,
			Facts:               Facts{Magnitude: &magnitude, TsunamiFlag: &tsunami},
			Provenance: Provenance{
				SourceAuthority: snapshot.Source.Authority, ProductID: event.ID,
				ProductType: event.Type, IssuedAt: event.Time, EffectiveAt: event.Time,
				RetrievedAt:             snapshot.Source.RetrievedAt.Format(time.RFC3339),
				FreshUntil:              snapshot.Source.FreshUntil.Format(time.RFC3339),
				SourceStatus:            snapshot.Source.Status,
				OfficialInstructionsURL: officialURL(event.DetailURL, "https://earthquake.usgs.gov/earthquakes/map/"),
			},
		})
	}
	return triggers
}

func normalizeHANS(snapshot hans.Snapshot, now time.Time) Trigger {
	return Trigger{
		SchemaVersion:       SchemaVersion,
		GeneratedAt:         now,
		Source:              "usgs_hans",
		HazardEventKind:     "volcano",
		JurisdictionScope:   "statewide",
		Lifecycle:           "unavailable",
		PlanningState:       "unavailable",
		AuthorityKind:       "federal_science_agency",
		LegalOrderStatus:    "unavailable",
		AuthorityLimitation: snapshot.Limitation + " " + AuthorityLimitation,
		PlanningConsequence: "Verify volcano status directly with USGS HVO and authorized Hawaiʻi emergency-management communications before changing plans.",
		Title:               "USGS HANS operational feed unavailable",
		Provenance: Provenance{
			SourceAuthority: snapshot.Authority, ProductType: "volcano_notification",
			RetrievedAt:  snapshot.RetrievedAt.Format(time.RFC3339),
			SourceStatus: "unavailable", OfficialInstructionsURL: snapshot.OfficialURL,
		},
	}
}

func countyUnavailableTrigger(now time.Time) Trigger {
	return Trigger{
		SchemaVersion: SchemaVersion, GeneratedAt: now, Source: "county_order",
		HazardEventKind: "all_hazards", JurisdictionScope: "county",
		Lifecycle: "unavailable", PlanningState: "unavailable",
		AuthorityKind: "county_emergency_management", LegalOrderStatus: "unavailable",
		AuthorityLimitation: CountyUnavailable + ". " + UnavailableNotNoOrder + " Only an explicit attributable authorized governor or mayor communication could represent a legal order in a future manual path.",
		PlanningConsequence: "Check official county and State emergency-management channels before making evacuation-order assumptions.",
		Title:               CountyUnavailable,
		Provenance: Provenance{
			SourceAuthority: "Hawaiʻi county and State emergency-management authorities",
			ProductType:     "evacuation_order", RetrievedAt: now.Format(time.RFC3339),
			SourceStatus: "unavailable", OfficialInstructionsURL: "https://dod.hawaii.gov/hiema/get-ready/",
		},
	}
}

func unavailableTrigger(now time.Time, source, authority, productType, officialURL string) Trigger {
	return Trigger{
		SchemaVersion: SchemaVersion, GeneratedAt: now, Source: source,
		HazardEventKind: boundedHazard(productType), JurisdictionScope: "statewide",
		Lifecycle: "unavailable", PlanningState: "unavailable",
		AuthorityKind: authorityKind(source), LegalOrderStatus: "unavailable",
		AuthorityLimitation: "This operational source could not be retrieved. " + AuthorityLimitation,
		PlanningConsequence: "Treat this source as unavailable and verify the official channel directly.",
		Title:               authority + " source unavailable",
		Provenance: Provenance{
			SourceAuthority: authority, ProductType: productType,
			RetrievedAt: now.Format(time.RFC3339), SourceStatus: "unavailable",
			OfficialInstructionsURL: officialURL,
		},
	}
}

func lifecycle(expires, sourceStatus string, now time.Time) string {
	if expiresAt, err := time.Parse(time.RFC3339, strings.TrimSpace(expires)); err == nil && !now.Before(expiresAt) {
		return "expired"
	}
	if sourceStatus == "stale" {
		return "stale"
	}
	return "active"
}

func ptwcPlanningState(action, lifecycleValue string) string {
	state := "monitor"
	switch action {
	case "warning":
		state = "official_warning"
	case "watch", "advisory":
		state = "prepare"
	}
	return planningStateForLifecycle(state, lifecycleValue)
}

func planningStateForLifecycle(state, lifecycleValue string) string {
	if lifecycleValue == "stale" || lifecycleValue == "expired" {
		return "monitor"
	}
	if lifecycleValue == "unavailable" {
		return "unavailable"
	}
	return state
}

func planningConsequence(source, product string, lifecycleValue string, tsunami bool) string {
	if lifecycleValue == "expired" {
		return "Retain as expired history for provenance; do not interpret expiration as an all-clear."
	}
	if lifecycleValue == "stale" {
		return "Use only as stale planning context and verify the official source before changing actions."
	}
	switch source {
	case "ptwc":
		if strings.Contains(strings.ToLower(product), "warning") {
			return "Escalate tsunami readiness and verify county or State protective-action instructions; this product is not itself a legal evacuation order."
		}
		return "Monitor PTWC and authorized local instructions; preserve readiness appropriate to the product level."
	case "usgs_comcat":
		if tsunami {
			return "Check PTWC immediately for an authoritative tsunami product; an earthquake tsunami flag is not an evacuation order."
		}
		return "Monitor for authoritative PTWC and local emergency-management updates; no local order is inferred."
	default:
		if strings.Contains(strings.ToLower(product), "warning") {
			return "Prioritize protective planning and verify authorized local instructions; the warning is not a legal evacuation order."
		}
		return "Monitor the official source and prepare the relevant response plan without inferring an evacuation order."
	}
}

func boundedHazard(value string) string {
	lower := strings.ToLower(value)
	switch {
	case strings.Contains(lower, "tsunami"):
		return "tsunami"
	case strings.Contains(lower, "earthquake"):
		return "earthquake"
	case strings.Contains(lower, "volcano"):
		return "volcano"
	case strings.Contains(lower, "flood"):
		return "flood"
	case strings.Contains(lower, "hurricane"), strings.Contains(lower, "tropical"):
		return "hurricane"
	case strings.Contains(lower, "fire"):
		return "wildfire"
	case strings.Contains(lower, "weather"), strings.Contains(lower, "wind"):
		return "severe_weather"
	case strings.Contains(lower, "all"):
		return "all_hazards"
	default:
		return "other"
	}
}

func authorityKind(source string) string {
	if source == "nws" || source == "ptwc" {
		return "federal_warning_center"
	}
	return "federal_science_agency"
}

func officialURL(candidate, fallback string) string {
	if strings.HasPrefix(candidate, "https://") {
		return candidate
	}
	return fallback
}

func sourceOutcome(status string) string {
	if status == "stale" {
		return "stale"
	}
	return "success"
}

func Validate(snapshot Snapshot) error {
	if snapshot.SchemaVersion != SchemaVersion {
		return fmt.Errorf("unexpected schema version %q", snapshot.SchemaVersion)
	}
	for _, trigger := range snapshot.Triggers {
		if trigger.LegalOrderStatus != "not_an_evacuation_order" && trigger.LegalOrderStatus != "unavailable" {
			return fmt.Errorf("invalid legal order status %q", trigger.LegalOrderStatus)
		}
	}
	return nil
}
