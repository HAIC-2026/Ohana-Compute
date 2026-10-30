package eventtriggers

import (
	"regexp"
	"strings"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/nws"
)

type NWSQueryScope struct {
	Area     string `json:"area"`
	Coverage string `json:"coverage"`
	URL      string `json:"url"`
}

// NWSProduct keeps source facts separate from retrieval freshness, message
// eligibility and wall-time validity. None establishes a planning-location match.
type NWSProduct struct {
	nws.Product
	QueryScope          NWSQueryScope `json:"query_scope"`
	Applicability       string        `json:"applicability"`
	ApplicabilityReason string        `json:"applicability_reason"`
	Eligibility         string        `json:"eligibility"`
	Validity            string        `json:"validity"`
	Relationship        string        `json:"relationship"`
}

var nwsTimePattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-](0\d|1\d|2[0-3]):[0-5]\d)$`)

func nwsTime(value *string) (time.Time, bool) {
	if value == nil || !nwsTimePattern.MatchString(*value) {
		return time.Time{}, false
	}
	parsed, err := time.Parse(time.RFC3339Nano, *value)
	return parsed, err == nil
}

func nwsValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func nwsEligibility(product nws.Product) string {
	switch nwsValue(product.Status) {
	case "Actual":
	case "Test", "Exercise", "Draft", "System":
		return "non_actual"
	default:
		return "unknown"
	}
	switch nwsValue(product.Scope) {
	case "Public":
	case "Restricted", "Private":
		return "non_public"
	default:
		return "unknown"
	}
	switch nwsValue(product.MessageType) {
	case "Cancel":
		return "cancellation"
	case "Ack", "Error":
		return "protocol"
	case "Alert", "Update":
		if nwsValue(product.ID) == "" || nwsValue(product.URL) == "" {
			return "unknown"
		}
		return "eligible"
	default:
		return "unknown"
	}
}

func nwsValidity(product nws.Product, now time.Time) string {
	sent, sentOK := nwsTime(product.Sent)
	effective, effectiveOK := nwsTime(product.Effective)
	expires, expiresOK := nwsTime(product.Expires)
	if !sentOK || !effectiveOK || !expiresOK || sent.After(now) ||
		!expires.After(sent) || !expires.After(effective) {
		return "unknown"
	}
	if !now.Before(expires) {
		return "expired"
	}
	if now.Before(effective) {
		return "not_yet_effective"
	}
	return "current"
}

func nwsRelationship(messageType *string) string {
	switch nwsValue(messageType) {
	case "Alert":
		return "initial"
	case "Update":
		return "update"
	case "Cancel":
		return "cancel"
	case "Ack":
		return "acknowledgement"
	case "Error":
		return "error"
	default:
		return "unknown"
	}
}

func nwsLifecycle(product NWSProduct, source nws.SourceStatus, now time.Time) string {
	if product.Eligibility == "unknown" {
		return "unavailable"
	}
	if product.Eligibility != "eligible" {
		return "unavailable"
	}
	switch product.Validity {
	case "expired":
		return "expired"
	case "not_yet_effective":
		return "unavailable"
	case "current":
		if source.Status == "stale" {
			return "stale"
		}
		if source.Status == "fresh" && !source.RetrievedAt.IsZero() &&
			!source.RetrievedAt.After(now) && now.Before(source.FreshUntil) {
			return "active"
		}
		if source.Status == "fresh" && !source.FreshUntil.IsZero() && !now.Before(source.FreshUntil) {
			return "stale"
		}
	}
	return "unavailable"
}

func normalizeNWS(snapshot nws.Snapshot, now time.Time) []Trigger {
	triggers := make([]Trigger, 0, len(snapshot.Alerts))
	for _, alert := range snapshot.Alerts {
		product := NWSProduct{
			Product: alert.Product,
			QueryScope: NWSQueryScope{
				Area: "HI", Coverage: "statewide", URL: "https://api.weather.gov/alerts/active?area=HI",
			},
			Applicability:       "unknown",
			ApplicabilityReason: "not_evaluated",
			Eligibility:         nwsEligibility(alert.Product),
			Validity:            nwsValidity(alert.Product, now),
			Relationship:        nwsRelationship(alert.Product.MessageType),
		}
		lifecycle := nwsLifecycle(product, snapshot.Source, now)
		planningState := "unavailable"
		if lifecycle == "active" {
			event := strings.ToLower(nwsValue(product.Event))
			switch {
			case strings.Contains(event, "warning"):
				planningState = "official_warning"
			case strings.Contains(event, "watch"), strings.Contains(event, "advisory"):
				planningState = "prepare"
			default:
				planningState = "monitor"
			}
		} else if lifecycle == "stale" {
			planningState = "monitor"
		}
		productType := nwsValue(product.Event)
		if productType == "" {
			productType = "NWS product (display label)"
		}
		title := nwsValue(product.Headline)
		if title == "" {
			title = productType
		}
		triggers = append(triggers, Trigger{
			SchemaVersion: SchemaVersion, GeneratedAt: now, Source: "nws",
			HazardEventKind: boundedHazard(alert.Hazard), JurisdictionScope: "unknown",
			Lifecycle: lifecycle, PlanningState: planningState,
			AuthorityKind: "federal_warning_center", LegalOrderStatus: "not_an_evacuation_order",
			AuthorityLimitation: AuthorityLimitation,
			PlanningConsequence: "Source-product provenance only; planning-location applicability is unknown. Verify official instructions independently. Expiration, replacement, cancellation, and an empty query are not an all-clear or restoration.",
			Title:               title,
			Facts: Facts{
				Severity: nwsValue(product.Severity), Certainty: nwsValue(product.Certainty),
				Urgency: nwsValue(product.Urgency), ResponseType: nwsValue(product.Response),
			},
			Provenance: Provenance{
				SourceAuthority: snapshot.Source.Authority, ProductID: nwsValue(product.ID),
				ProductType: productType, IssuedAt: nwsValue(product.Sent),
				EffectiveAt: nwsValue(product.Effective), ExpiresAt: nwsValue(product.Expires),
				RetrievedAt:             snapshot.Source.RetrievedAt.Format(time.RFC3339),
				FreshUntil:              snapshot.Source.FreshUntil.Format(time.RFC3339),
				SourceStatus:            snapshot.Source.Status,
				OfficialInstructionsURL: officialURL(nwsValue(product.URL), "https://www.weather.gov/hfo/"),
			},
			NWSProduct: &product,
		})
	}
	return triggers
}
