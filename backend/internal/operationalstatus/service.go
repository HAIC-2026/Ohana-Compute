package operationalstatus

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/official"
)

const (
	SchemaVersion = "live-operational-status.v1"
	CheckedAt     = "2026-10-27"
)

var ErrInvalidSnapshot = errors.New("invalid operational-status snapshot")

type ShelterReader interface {
	OpenShelters(context.Context, float64, float64) (official.OpenShelters, error)
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

type Coverage struct {
	Scope string   `json:"scope"`
	Areas []string `json:"areas"`
	Notes string   `json:"notes"`
}

type Freshness struct {
	RetrievedAt string `json:"retrieved_at,omitempty"`
	FreshUntil  string `json:"fresh_until,omitempty"`
	ExpiresAt   string `json:"expires_at,omitempty"`
}

type Provenance struct {
	SourceID    string `json:"source_id"`
	Authority   string `json:"authority"`
	SourceURL   string `json:"source_url"`
	Access      string `json:"access"`
	CheckedAt   string `json:"checked_at"`
	Decision    string `json:"decision"`
	DataClass   string `json:"data_class"`
	Attribution string `json:"attribution,omitempty"`
}

type UnavailableBoundary struct {
	MissingArtifact string `json:"missing_artifact"`
	OwningAuthority string `json:"owning_authority"`
	Verification    string `json:"verification"`
}

type ShelterFact struct {
	ID                    string  `json:"id"`
	Name                  string  `json:"name"`
	Address               string  `json:"address,omitempty"`
	City                  string  `json:"city,omitempty"`
	ReportedStatus        string  `json:"reported_status"`
	Capacity              *int    `json:"capacity,omitempty"`
	WheelchairAccessible  string  `json:"wheelchair_accessible,omitempty"`
	PetAccommodationsCode string  `json:"pet_accommodations_code,omitempty"`
	ReportingOrganization string  `json:"reporting_organization,omitempty"`
	DistanceMiles         float64 `json:"distance_miles"`
}

type DomainStatus struct {
	Domain              string               `json:"domain"`
	Status              string               `json:"status"`
	ReferenceKind       string               `json:"reference_kind"`
	Summary             string               `json:"summary"`
	Coverage            Coverage             `json:"coverage"`
	Freshness           Freshness            `json:"freshness"`
	Provenance          Provenance           `json:"provenance"`
	Limitations         []string             `json:"limitations"`
	Shelters            []ShelterFact        `json:"shelters,omitempty"`
	UnavailableBoundary *UnavailableBoundary `json:"unavailable_boundary,omitempty"`
}

type Snapshot struct {
	SchemaVersion string         `json:"schema_version"`
	GeneratedAt   time.Time      `json:"generated_at"`
	Status        string         `json:"status"`
	Disclaimer    string         `json:"disclaimer"`
	Domains       []DomainStatus `json:"domains"`
	SourceErrors  []SourceError  `json:"source_errors,omitempty"`
}

type SourceError struct {
	Source string `json:"source"`
	Error  string `json:"error"`
}

type Config struct {
	Shelters ShelterReader
	Now      func() time.Time
}

type Service struct {
	shelters ShelterReader
	now      func() time.Time
}

func NewService(config Config) *Service {
	if config.Shelters == nil {
		panic("operationalstatus: shelter reader is required")
	}
	now := config.Now
	if now == nil {
		now = time.Now
	}
	return &Service{shelters: config.Shelters, now: now}
}

func (service *Service) Snapshot(
	ctx context.Context,
	latitude float64,
	longitude float64,
) (Snapshot, error) {
	now := service.now().UTC()
	snapshot := Snapshot{
		SchemaVersion: SchemaVersion,
		GeneratedAt:   now,
		Status:        "partial",
		Disclaimer:    "Reported live status is source-specific. Unavailable never means normal, open, passable, restored, contained, or all clear.",
		Domains: []DomainStatus{
			unavailableEvacuationOrder(),
			unavailableRoadTransport(),
			{},
			unavailableTransit(),
			unavailableUtility(),
			unavailableWildfire(),
		},
	}

	started := time.Now()
	openShelters, err := service.shelters.OpenShelters(ctx, latitude, longitude)
	if err != nil {
		snapshot.Status = "unavailable"
		snapshot.SourceErrors = append(snapshot.SourceErrors, SourceError{
			Source: "fema_open_shelters",
			Error:  "supported shelter source unavailable",
		})
		snapshot.Domains[2] = unavailableShelter()
		reportSourceObservation(ctx, SourceObservation{
			Source: "fema_open_shelters", Outcome: "error", Duration: time.Since(started),
		})
	} else {
		shelterDomain, normalizeErr := normalizeShelters(openShelters)
		if normalizeErr != nil {
			snapshot.Status = "unavailable"
			snapshot.SourceErrors = append(snapshot.SourceErrors, SourceError{
				Source: "fema_open_shelters",
				Error:  "supported shelter source returned invalid provenance",
			})
			snapshot.Domains[2] = unavailableShelter()
			reportSourceObservation(ctx, SourceObservation{
				Source: "fema_open_shelters", Outcome: "error", Duration: time.Since(started),
			})
		} else {
			snapshot.Domains[2] = shelterDomain
			outcome := "success"
			if snapshot.Domains[2].Status == "stale" {
				outcome = "stale"
			}
			reportSourceObservation(ctx, SourceObservation{
				Source: "fema_open_shelters", Outcome: outcome, Duration: time.Since(started),
			})
		}
	}

	if err := Validate(snapshot); err != nil {
		return Snapshot{}, fmt.Errorf("%w: %v", ErrInvalidSnapshot, err)
	}
	return snapshot, nil
}

func normalizeShelters(input official.OpenShelters) (DomainStatus, error) {
	if len(input.Sources) != 1 {
		return DomainStatus{}, errors.New("expected one FEMA source")
	}
	status := "reported_live"
	var freshness Freshness
	provenance := Provenance{
		SourceID:  "fema-open-shelters",
		Authority: "Federal Emergency Management Agency and reporting partners",
		SourceURL: "https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/MapServer/0",
		Access:    "ArcGIS REST / GeoJSON",
		CheckedAt: CheckedAt,
		Decision:  "ADOPT",
		DataClass: "reported_live",
	}
	source := input.Sources[0]
	if source.ID == "" || source.Authority == "" || source.URL == "" ||
		source.RetrievedAt.IsZero() || source.FreshUntil.IsZero() {
		return DomainStatus{}, errors.New("incomplete FEMA source provenance")
	}
	provenance.SourceID = source.ID
	provenance.Authority = source.Authority
	provenance.SourceURL = source.URL
	freshness.RetrievedAt = source.RetrievedAt.UTC().Format(time.RFC3339)
	freshness.FreshUntil = source.FreshUntil.UTC().Format(time.RFC3339)
	if source.Status == "stale" {
		status = "stale"
	} else if source.Status != "fresh" {
		return DomainStatus{}, errors.New("unsupported FEMA source status")
	}
	facts := make([]ShelterFact, 0, len(input.Shelters))
	for _, shelter := range input.Shelters {
		accessibility := shelter.WheelchairAccessible
		if strings.EqualFold(accessibility, "unknown") {
			accessibility = ""
		}
		facts = append(facts, ShelterFact{
			ID: shelter.ID, Name: shelter.Name, Address: shelter.Address,
			City: shelter.City, ReportedStatus: shelter.Status,
			Capacity:              shelter.Capacity,
			WheelchairAccessible:  accessibility,
			PetAccommodationsCode: shelter.PetAccommodationsCode,
			ReportingOrganization: shelter.Organization,
			DistanceMiles:         shelter.DistanceMiles,
		})
	}
	summary := "FEMA National Shelter System records reported open by participating authorities."
	if len(facts) == 0 {
		summary = "No FEMA National Shelter System open-shelter record was returned for Hawaiʻi. This is not proof that no County shelter is open."
	}
	return DomainStatus{
		Domain: "shelter", Status: status, ReferenceKind: "operational",
		Summary: summary,
		Coverage: Coverage{
			Scope: "statewide_reported_records", Areas: []string{"Hawaiʻi"},
			Notes: "Coverage depends on participating reporting authorities and incident reporting.",
		},
		Freshness: freshness, Provenance: provenance, Shelters: facts,
		Limitations: []string{
			"FEMA records remain separate from County shelter-plan provenance and practice facilities.",
			"A missing record does not prove that no County shelter is open.",
			"Capacity, accessibility, pet, address, and reporting-organization fields are shown only when the source reports them.",
			"Confirm admission, accessibility, pets, capacity, and current opening directly with the responsible authority.",
		},
	}, nil
}

func unavailableEvacuationOrder() DomainStatus {
	return unavailableDomain(
		"evacuation_order",
		"Authorized Hawaiʻi governor and county mayors",
		"https://dod.hawaii.gov/hiema/get-ready/",
		"No verified public statewide machine-readable contract for attributable current legal evacuation orders",
		"State and County emergency-management authorities",
		"Checked State and County emergency-management public channels; warnings, CAP response types, forecasts, and hazard products are not legal orders.",
		"County and State evacuation-order data unavailable. Unavailable does not mean no order.",
		"none",
		"FURTHER_RESEARCH",
	)
}

func unavailableRoadTransport() DomainStatus {
	status := unavailableDomain(
		"road_transport",
		"Hawaiʻi Department of Transportation and County road authorities",
		"https://hidot.hawaii.gov/highways/roadwork/",
		"No verified public statewide machine-readable emergency closure and passability contract",
		"HDOT Highways and County road authorities",
		"Checked HDOT data and traffic channels; the available lane-closure feed describes planned roadwork, not emergency passability, and GoAkamai no longer publishes its prior real-time incident features.",
		"Emergency road closure and passability status unavailable.",
		"planned_reference",
		"SKIP",
	)
	status.Limitations = append(status.Limitations,
		"HDOT planned lane closures remain available as planning reference only and are never promoted to emergency status.",
	)
	return status
}

func unavailableTransit() DomainStatus {
	return unavailableDomain(
		"transit_paratransit",
		"County transit and paratransit operators",
		"https://hidot.hawaii.gov/mobility/transit/",
		"No verified public statewide machine-readable disruption and paratransit operational-status contract",
		"County transit and paratransit operators",
		"Checked State transit references and operator information; schedules or app-gated vehicle APIs do not establish statewide emergency service or paratransit availability.",
		"Transit and paratransit operational status unavailable.",
		"reference_only",
		"FURTHER_RESEARCH",
	)
}

func unavailableUtility() DomainStatus {
	return unavailableDomain(
		"utility_outage",
		"Hawaiian Electric and Kauaʻi Island Utility Cooperative",
		"https://www.hawaiianelectric.com/safety-and-outages/power-outages",
		"No documented supported public machine-readable statewide outage contract",
		"Hawaiian Electric and Kauaʻi Island Utility Cooperative",
		"Checked public outage pages and maps; an unverified ArcGIS service lead lacks directly confirmed publisher support and terms, map applications are not scraped, and provider/island coverage remains separate.",
		"Utility outage and restoration status unavailable.",
		"none",
		"FURTHER_RESEARCH",
	)
}

func unavailableWildfire() DomainStatus {
	status := unavailableDomain(
		"wildfire",
		"Hawaiʻi fire authorities and land-management agencies",
		"https://www.arcgis.com/sharing/rest/content/items/d1c32af3212341869b3c810f1a215824?f=pjson",
		"No verified Hawaiʻi-authoritative machine contract for complete incident, containment, protective-action, and evacuation status",
		"County fire departments, Hawaiʻi DLNR-DOFAW, and authorized emergency-management authorities",
		"Checked federal WFIGS services and Hawaiʻi planning layers; national incident/perimeter records may be incomplete and do not establish local containment, road, or evacuation truth.",
		"Authoritative Hawaiʻi wildfire operational status unavailable.",
		"reference_only",
		"FURTHER_RESEARCH",
	)
	status.Limitations = append(status.Limitations,
		"Satellite detections, historical fire-risk areas, smoke forecasts, and national perimeter records are not substituted for local operational status.",
	)
	return status
}

func unavailableShelter() DomainStatus {
	return unavailableDomain(
		"shelter",
		"Federal Emergency Management Agency and reporting partners",
		"https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/MapServer/0",
		"The supported FEMA National Shelter System source could not be retrieved",
		"Federal Emergency Management Agency and participating reporting authorities",
		"Retry the supported source and verify County emergency-management channels directly.",
		"Reported open-shelter status unavailable.",
		"operational",
		"ADOPT",
	)
}

func unavailableDomain(
	domain string,
	authority string,
	sourceURL string,
	missingArtifact string,
	owningAuthority string,
	verification string,
	summary string,
	referenceKind string,
	decision string,
) DomainStatus {
	return DomainStatus{
		Domain: domain, Status: "unavailable", ReferenceKind: referenceKind,
		Summary: summary,
		Coverage: Coverage{
			Scope: "unavailable", Areas: []string{"Hawaiʻi"},
			Notes: "Unsupported islands, providers, and jurisdictions remain explicit rather than inferred.",
		},
		Provenance: Provenance{
			SourceID:  strings.ReplaceAll(domain, "_", "-") + "-boundary",
			Authority: authority, SourceURL: sourceURL,
			Access:    "Public source review; no supported runtime contract",
			CheckedAt: CheckedAt, Decision: decision, DataClass: "unavailable",
		},
		Limitations: []string{
			"Unavailable never means normal, open, passable, restored, contained, or all clear.",
			"No unsupported page is scraped and no forecast, social post, planned work, detection, historical record, or practice fixture is promoted to operational truth.",
		},
		UnavailableBoundary: &UnavailableBoundary{
			MissingArtifact: missingArtifact, OwningAuthority: owningAuthority,
			Verification: verification,
		},
	}
}

func Validate(snapshot Snapshot) error {
	if snapshot.SchemaVersion != SchemaVersion {
		return fmt.Errorf("schema version %q", snapshot.SchemaVersion)
	}
	if snapshot.Status != "partial" && snapshot.Status != "unavailable" {
		return fmt.Errorf("status %q", snapshot.Status)
	}
	required := map[string]bool{
		"evacuation_order":    false,
		"road_transport":      false,
		"shelter":             false,
		"transit_paratransit": false,
		"utility_outage":      false,
		"wildfire":            false,
	}
	for _, domain := range snapshot.Domains {
		if _, ok := required[domain.Domain]; !ok {
			return fmt.Errorf("unexpected domain %q", domain.Domain)
		}
		if required[domain.Domain] {
			return fmt.Errorf("duplicate domain %q", domain.Domain)
		}
		required[domain.Domain] = true
		switch domain.Status {
		case "reported_live", "stale":
			if domain.Domain != "shelter" {
				return fmt.Errorf("unsupported live domain %q", domain.Domain)
			}
		case "unavailable":
			if domain.UnavailableBoundary == nil {
				return fmt.Errorf("domain %q missing unavailable boundary", domain.Domain)
			}
			if domain.Provenance.CheckedAt == "" ||
				domain.UnavailableBoundary.MissingArtifact == "" ||
				domain.UnavailableBoundary.OwningAuthority == "" ||
				domain.UnavailableBoundary.Verification == "" {
				return fmt.Errorf("domain %q has incomplete unavailable contract", domain.Domain)
			}
		default:
			return fmt.Errorf("domain %q status %q", domain.Domain, domain.Status)
		}
	}
	for domain, present := range required {
		if !present {
			return fmt.Errorf("missing domain %q", domain)
		}
	}
	return nil
}
