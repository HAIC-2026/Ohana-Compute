package partnermatching

import (
	"context"
	"errors"
	"slices"
	"time"
)

const ResponseSchemaVersion = "partner-match-response.v1"

var allowedJurisdictions = map[string]bool{
	"honolulu": true,
	"maui":     true,
	"hawaii":   true,
	"kauai":    true,
}

var allowedCapabilities = map[string]bool{
	"mass-care-coordination":          true,
	"sheltering":                      true,
	"feeding-production":              true,
	"feeding-distribution":            true,
	"emergency-supplies-distribution": true,
	"reunification":                   true,
	"information-referral":            true,
	"human-services":                  true,
	"access-functional-needs-support": true,
	"pet-service-animal-support":      true,
}

type Query struct {
	JurisdictionID string
	Capabilities   []string
}

type Evidence struct {
	SourceID      string    `json:"source_id"`
	Title         string    `json:"title"`
	Publisher     string    `json:"publisher"`
	SourceURL     string    `json:"source_url"`
	Claim         string    `json:"claim"`
	PublishedDate string    `json:"published_date,omitempty"`
	AccessedAt    time.Time `json:"accessed_at"`
	FreshUntil    time.Time `json:"fresh_until"`
	Freshness     string    `json:"freshness"`
}

type EvidenceDescriptor struct {
	SourceID  string
	Publisher string
	SourceURL string
	Claim     string
}

type Partner struct {
	ID                 string   `json:"id"`
	Name               string   `json:"name"`
	OrganizationType   string   `json:"organization_type"`
	Capability         string   `json:"capability"`
	Role               string   `json:"role"`
	Coverage           []string `json:"coverage"`
	ValidationState    string   `json:"validation_state"`
	OperationalStatus  string   `json:"operational_status"`
	CapacityStatus     string   `json:"capacity_status"`
	ActivationStatus   string   `json:"activation_status"`
	MatchBasis         string   `json:"match_basis"`
	Evidence           Evidence `json:"evidence"`
	RequiredValidation []string `json:"required_validation"`
}

type CapabilityMatch struct {
	Capability string    `json:"capability"`
	Status     string    `json:"status"`
	Partners   []Partner `json:"partners"`
	Gap        string    `json:"gap,omitempty"`
}

type Summary struct {
	RequestedCapabilities int `json:"requested_capabilities"`
	MatchedCapabilities   int `json:"matched_capabilities"`
	UnmatchedCapabilities int `json:"unmatched_capabilities"`
	PartnerAssociations   int `json:"partner_associations"`
}

type Response struct {
	SchemaVersion  string            `json:"schema_version"`
	GeneratedAt    time.Time         `json:"generated_at"`
	Status         string            `json:"status"`
	JurisdictionID string            `json:"jurisdiction_id"`
	Summary        Summary           `json:"summary"`
	Matches        []CapabilityMatch `json:"matches"`
	Disclaimers    []string          `json:"disclaimers"`
}

type association struct {
	ID               string
	Name             string
	OrganizationType string
	Capability       string
	Role             string
	Coverage         []string
	ValidationState  string
	SourceID         string
	Title            string
	Publisher        string
	SourceURL        string
	Claim            string
	PublishedDate    string
	ReviewWindow     time.Duration
}

type Matcher struct {
	Now func() time.Time
}

func NewMatcher() Matcher {
	return Matcher{Now: time.Now}
}

func FindEvidence(sourceID string) (EvidenceDescriptor, bool) {
	for _, item := range associations() {
		if item.SourceID == sourceID {
			return EvidenceDescriptor{
				SourceID:  item.SourceID,
				Publisher: item.Publisher,
				SourceURL: item.SourceURL,
				Claim:     item.Claim,
			}, true
		}
	}
	return EvidenceDescriptor{}, false
}

func (matcher Matcher) Match(_ context.Context, query Query) (Response, error) {
	if err := Validate(query); err != nil {
		return Response{}, err
	}

	now := matcher.Now
	if now == nil {
		now = time.Now
	}
	generatedAt := now().UTC()
	accessedAt := time.Date(2026, time.October, 26, 0, 0, 0, 0, time.UTC)

	response := Response{
		SchemaVersion:  ResponseSchemaVersion,
		GeneratedAt:    generatedAt,
		Status:         "complete",
		JurisdictionID: query.JurisdictionID,
		Summary: Summary{
			RequestedCapabilities: len(query.Capabilities),
		},
		Matches: make([]CapabilityMatch, 0, len(query.Capabilities)),
		Disclaimers: []string{
			"Matches are sourced planning associations, not operational recommendations, assignments, endorsements, or commitments.",
			"Current availability, activation, capacity, contracts, credentials, response time, and acceptance remain unvalidated.",
			"Stale or unsupported associations are disabled rather than treated as available.",
		},
	}

	for _, capability := range query.Capabilities {
		match := CapabilityMatch{
			Capability: capability,
			Status:     "unmatched",
			Partners:   []Partner{},
			Gap:        "No current sourced association covers this capability and planning jurisdiction.",
		}
		staleAssociation := false
		for _, record := range associations() {
			if record.Capability != capability ||
				!covers(record.Coverage, query.JurisdictionID) {
				continue
			}
			freshUntil := accessedAt.Add(record.ReviewWindow)
			if !generatedAt.Before(freshUntil) {
				staleAssociation = true
				continue
			}
			match.Partners = append(match.Partners, Partner{
				ID:                record.ID,
				Name:              record.Name,
				OrganizationType:  record.OrganizationType,
				Capability:        record.Capability,
				Role:              record.Role,
				Coverage:          slices.Clone(record.Coverage),
				ValidationState:   record.ValidationState,
				OperationalStatus: "not_validated",
				CapacityStatus:    "not_reported",
				ActivationStatus:  "not_reported",
				MatchBasis:        "documented_role_and_geographic_scope",
				Evidence: Evidence{
					SourceID:      record.SourceID,
					Title:         record.Title,
					Publisher:     record.Publisher,
					SourceURL:     record.SourceURL,
					Claim:         record.Claim,
					PublishedDate: record.PublishedDate,
					AccessedAt:    accessedAt,
					FreshUntil:    freshUntil,
					Freshness:     "fresh",
				},
				RequiredValidation: []string{
					"Confirm current activation and incident assignment.",
					"Confirm capacity, staffing, logistics, and operating period.",
					"Confirm agreements, credentials, authority, and point of contact through official channels.",
				},
			})
		}
		slices.SortFunc(match.Partners, comparePartners(query.JurisdictionID))
		if len(match.Partners) > 0 {
			match.Status = "matched"
			match.Gap = ""
			response.Summary.MatchedCapabilities++
			response.Summary.PartnerAssociations += len(match.Partners)
		} else {
			response.Summary.UnmatchedCapabilities++
			response.Status = "partial"
			if staleAssociation {
				match.Status = "stale"
				match.Gap = "A previously sourced association requires review before it can be matched."
			}
		}
		response.Matches = append(response.Matches, match)
	}

	if response.Summary.MatchedCapabilities == 0 {
		response.Status = "unavailable"
	}
	return response, nil
}

func Validate(query Query) error {
	if !allowedJurisdictions[query.JurisdictionID] {
		return errors.New("jurisdiction is invalid")
	}
	if len(query.Capabilities) == 0 || len(query.Capabilities) > 10 {
		return errors.New("capabilities must contain between 1 and 10 values")
	}
	seen := make(map[string]bool, len(query.Capabilities))
	for _, capability := range query.Capabilities {
		if !allowedCapabilities[capability] {
			return errors.New("capability is invalid")
		}
		if seen[capability] {
			return errors.New("capabilities must be unique")
		}
		seen[capability] = true
	}
	return nil
}

func covers(coverage []string, jurisdiction string) bool {
	return slices.Contains(coverage, "statewide") ||
		slices.Contains(coverage, jurisdiction)
}

func comparePartners(jurisdiction string) func(Partner, Partner) int {
	validationRank := map[string]int{
		"official_county_role":        0,
		"official_plan_role":          1,
		"official_plan_network":       2,
		"organization_self_described": 3,
	}
	return func(left Partner, right Partner) int {
		leftLocal := slices.Contains(left.Coverage, jurisdiction)
		rightLocal := slices.Contains(right.Coverage, jurisdiction)
		if leftLocal != rightLocal {
			if leftLocal {
				return -1
			}
			return 1
		}
		if validationRank[left.ValidationState] != validationRank[right.ValidationState] {
			return validationRank[left.ValidationState] - validationRank[right.ValidationState]
		}
		if left.Name < right.Name {
			return -1
		}
		if left.Name > right.Name {
			return 1
		}
		return 0
	}
}

func associations() []association {
	const (
		annualReview = 365 * 24 * time.Hour
		pageReview   = 180 * 24 * time.Hour
	)
	return []association{
		{
			ID:               "hiema",
			Name:             "Hawaiʻi Emergency Management Agency",
			OrganizationType: "state_agency",
			Capability:       "mass-care-coordination",
			Role:             "State ESF-6 coordination and resource-request coordination.",
			Coverage:         []string{"statewide"},
			ValidationState:  "official_plan_role",
			SourceID:         "hawaii-sesf6-2025",
			Title:            "State Emergency Support Function #6 Annex",
			Publisher:        "Hawaiʻi Emergency Management Agency",
			SourceURL:        "https://dod.hawaii.gov/hiema/files/2025/10/SESF6-Annex_30SEP25.pdf",
			Claim:            "The State plan identifies HIEMA as a primary agency for ESF-6 coordination and resource requests.",
			PublishedDate:    "2025-09-30",
			ReviewWindow:     annualReview,
		},
		{
			ID:               "hawaii-dhs",
			Name:             "Hawaiʻi Department of Human Services",
			OrganizationType: "state_agency",
			Capability:       "human-services",
			Role:             "State human-services and ESF-6 co-primary coordination.",
			Coverage:         []string{"statewide"},
			ValidationState:  "official_plan_role",
			SourceID:         "hawaii-sesf6-2025",
			Title:            "State Emergency Support Function #6 Annex",
			Publisher:        "Hawaiʻi Emergency Management Agency",
			SourceURL:        "https://dod.hawaii.gov/hiema/files/2025/10/SESF6-Annex_30SEP25.pdf",
			Claim:            "The State plan identifies DHS as an ESF-6 co-primary agency.",
			PublishedDate:    "2025-09-30",
			ReviewWindow:     annualReview,
		},
		{
			ID:               "hawaii-dhs",
			Name:             "Hawaiʻi Department of Human Services",
			OrganizationType: "state_agency",
			Capability:       "access-functional-needs-support",
			Role:             "Human-services coordination relevant to access and functional needs planning.",
			Coverage:         []string{"statewide"},
			ValidationState:  "official_plan_role",
			SourceID:         "hawaii-sesf6-2025",
			Title:            "State Emergency Support Function #6 Annex",
			Publisher:        "Hawaiʻi Emergency Management Agency",
			SourceURL:        "https://dod.hawaii.gov/hiema/files/2025/10/SESF6-Annex_30SEP25.pdf",
			Claim:            "The State plan assigns DHS an ESF-6 co-primary role and requires inclusive mass-care planning.",
			PublishedDate:    "2025-09-30",
			ReviewWindow:     annualReview,
		},
		{
			ID:               "salvation-army-hawaii",
			Name:             "The Salvation Army Hawaiian & Pacific Islands",
			OrganizationType: "nonprofit",
			Capability:       "feeding-production",
			Role:             "State-plan feeding support association.",
			Coverage:         []string{"statewide"},
			ValidationState:  "official_plan_role",
			SourceID:         "hawaii-sesf6-2025",
			Title:            "State Emergency Support Function #6 Annex",
			Publisher:        "Hawaiʻi Emergency Management Agency",
			SourceURL:        "https://dod.hawaii.gov/hiema/files/2025/10/SESF6-Annex_30SEP25.pdf",
			Claim:            "The State plan identifies The Salvation Army for feeding support.",
			PublishedDate:    "2025-09-30",
			ReviewWindow:     annualReview,
		},
		{
			ID:               "salvation-army-hawaii",
			Name:             "The Salvation Army Hawaiian & Pacific Islands",
			OrganizationType: "nonprofit",
			Capability:       "feeding-distribution",
			Role:             "State-plan feeding and distribution support association.",
			Coverage:         []string{"statewide"},
			ValidationState:  "official_plan_role",
			SourceID:         "hawaii-sesf6-2025",
			Title:            "State Emergency Support Function #6 Annex",
			Publisher:        "Hawaiʻi Emergency Management Agency",
			SourceURL:        "https://dod.hawaii.gov/hiema/files/2025/10/SESF6-Annex_30SEP25.pdf",
			Claim:            "The State plan identifies The Salvation Army for feeding support.",
			PublishedDate:    "2025-09-30",
			ReviewWindow:     annualReview,
		},
		{
			ID:               "salvation-army-hawaii",
			Name:             "The Salvation Army Hawaiian & Pacific Islands",
			OrganizationType: "nonprofit",
			Capability:       "emergency-supplies-distribution",
			Role:             "Self-described disaster supply and distribution support.",
			Coverage:         []string{"statewide"},
			ValidationState:  "organization_self_described",
			SourceID:         "salvation-army-disaster-relief",
			Title:            "Disaster relief",
			Publisher:        "The Salvation Army Hawaiian & Pacific Islands",
			SourceURL:        "https://www.salvationarmyusa.org/usa-western-territory/hawaiian-and-pacific-islands/disaster-relief/",
			Claim:            "The organization describes meal service, supplies, distribution support, and standby volunteers.",
			ReviewWindow:     pageReview,
		},
		{
			ID:               "red-cross-pacific-islands",
			Name:             "American Red Cross Pacific Islands Region",
			OrganizationType: "nonprofit",
			Capability:       "sheltering",
			Role:             "State-plan temporary-shelter support association.",
			Coverage:         []string{"statewide"},
			ValidationState:  "official_plan_role",
			SourceID:         "hawaii-sesf6-2025",
			Title:            "State Emergency Support Function #6 Annex",
			Publisher:        "Hawaiʻi Emergency Management Agency",
			SourceURL:        "https://dod.hawaii.gov/hiema/files/2025/10/SESF6-Annex_30SEP25.pdf",
			Claim:            "The State plan identifies the American Red Cross for temporary-shelter support.",
			PublishedDate:    "2025-09-30",
			ReviewWindow:     annualReview,
		},
		{
			ID:               "hawaii-voad",
			Name:             "Hawaiʻi Voluntary Organizations Active in Disaster",
			OrganizationType: "coordination_network",
			Capability:       "mass-care-coordination",
			Role:             "Voluntary-organization coordination network; not a deployable provider.",
			Coverage:         []string{"statewide"},
			ValidationState:  "official_plan_network",
			SourceID:         "hawaii-sesf6-2025",
			Title:            "State Emergency Support Function #6 Annex",
			Publisher:        "Hawaiʻi Emergency Management Agency",
			SourceURL:        "https://dod.hawaii.gov/hiema/files/2025/10/SESF6-Annex_30SEP25.pdf",
			Claim:            "The State plan identifies HVOAD organizations as part of mass-care coordination.",
			PublishedDate:    "2025-09-30",
			ReviewWindow:     annualReview,
		},
		{
			ID:               "hawaii-foodbank",
			Name:             "Hawaiʻi Foodbank",
			OrganizationType: "nonprofit",
			Capability:       "feeding-production",
			Role:             "Self-described emergency-feeding support on Oʻahu and Kauaʻi.",
			Coverage:         []string{"honolulu", "kauai"},
			ValidationState:  "organization_self_described",
			SourceID:         "hawaii-foodbank-disaster-response",
			Title:            "Disaster response program",
			Publisher:        "Hawaiʻi Foodbank",
			SourceURL:        "https://hawaiifoodbank.org/what-we-do/disaster-response-program/",
			Claim:            "The organization describes itself as an emergency-feeding lead for Oʻahu and Kauaʻi.",
			ReviewWindow:     pageReview,
		},
		{
			ID:               "hawaii-foodbank",
			Name:             "Hawaiʻi Foodbank",
			OrganizationType: "nonprofit",
			Capability:       "feeding-distribution",
			Role:             "Self-described emergency-food distribution support on Oʻahu and Kauaʻi.",
			Coverage:         []string{"honolulu", "kauai"},
			ValidationState:  "organization_self_described",
			SourceID:         "hawaii-foodbank-disaster-response",
			Title:            "Disaster response program",
			Publisher:        "Hawaiʻi Foodbank",
			SourceURL:        "https://hawaiifoodbank.org/what-we-do/disaster-response-program/",
			Claim:            "The organization describes disaster food distribution and Food Bank Hui coordination.",
			ReviewWindow:     pageReview,
		},
		{
			ID:               "aloha-united-way-211",
			Name:             "Aloha United Way 211",
			OrganizationType: "nonprofit",
			Capability:       "information-referral",
			Role:             "Self-described statewide disaster information and referral service.",
			Coverage:         []string{"statewide"},
			ValidationState:  "organization_self_described",
			SourceID:         "auw-211-about",
			Title:            "About 211",
			Publisher:        "Aloha United Way",
			SourceURL:        "https://auw211.org/about/",
			Claim:            "The service describes statewide information and referral during disasters.",
			ReviewWindow:     pageReview,
		},
		{
			ID:               "honolulu-dem",
			Name:             "Honolulu Department of Emergency Management",
			OrganizationType: "county_agency",
			Capability:       "mass-care-coordination",
			Role:             "County emergency-shelter planning and coordination.",
			Coverage:         []string{"honolulu"},
			ValidationState:  "official_county_role",
			SourceID:         "honolulu-dem-shelter-guidance",
			Title:            "Emergency shelters",
			Publisher:        "Honolulu Department of Emergency Management",
			SourceURL:        "https://www.honolulu.gov/dem/shelter/",
			Claim:            "County guidance describes incident-specific shelter planning, staffing, and services.",
			ReviewWindow:     pageReview,
		},
		{
			ID:               "honolulu-dem",
			Name:             "Honolulu Department of Emergency Management",
			OrganizationType: "county_agency",
			Capability:       "sheltering",
			Role:             "County emergency-shelter planning and coordination.",
			Coverage:         []string{"honolulu"},
			ValidationState:  "official_county_role",
			SourceID:         "honolulu-dem-shelter-guidance",
			Title:            "Emergency shelters",
			Publisher:        "Honolulu Department of Emergency Management",
			SourceURL:        "https://www.honolulu.gov/dem/shelter/",
			Claim:            "County guidance explains that potential shelters and services vary by incident and require confirmation.",
			ReviewWindow:     pageReview,
		},
	}
}
