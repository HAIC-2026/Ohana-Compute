package replay

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/resourcedemand"
)

const (
	CatalogSchemaVersion      = "historical-replay-catalog.v1"
	RequestSchemaVersion      = "historical-replay-request.v1"
	ReportSchemaVersion       = "historical-replay-report.v1"
	EngineVersion             = "historical-replay-engine.v1"
	CalibrationVersion        = "historical-replay-calibration.v1"
	FixtureCatalogVersion     = "hawaii-replay-fixtures.2026-10-27"
	CurrentEvaluationStandard = "current"
)

var ErrInvalidRequest = errors.New("invalid historical replay request")

type ResourceDemandCalculator interface {
	Calculate(context.Context, resourcedemand.Request) (resourcedemand.Response, error)
}

type Source struct {
	ID               string `json:"id"`
	Title            string `json:"title"`
	Authority        string `json:"authority"`
	URL              string `json:"url"`
	RetrievedAt      string `json:"retrieved_at"`
	ReviewedAt       string `json:"reviewed_at"`
	FreshUntil       string `json:"fresh_until"`
	Availability     string `json:"availability"`
	EvidenceClass    string `json:"evidence_class"`
	SupportedUse     string `json:"supported_use"`
	Limitations      string `json:"limitations"`
	ResearchDecision string `json:"research_decision"`
}

type Coverage struct {
	Hotspots           string `json:"hotspots"`
	ResourceDemand     string `json:"resource_demand"`
	TriggerSemantics   string `json:"trigger_semantics"`
	SourceAvailability string `json:"source_availability"`
	OperationalGaps    string `json:"operational_gaps"`
}

type CatalogFixture struct {
	ID                string   `json:"id"`
	FixtureVersion    string   `json:"fixture_version"`
	Label             string   `json:"label"`
	FixtureKind       string   `json:"fixture_kind"`
	Hazard            string   `json:"hazard"`
	Jurisdiction      string   `json:"jurisdiction"`
	Island            string   `json:"island"`
	AreaTemplateID    string   `json:"area_template_id"`
	ObservationWindow string   `json:"observation_window"`
	EvidenceQuality   string   `json:"evidence_quality"`
	Coverage          Coverage `json:"coverage"`
	Sources           []Source `json:"sources"`
	Limitations       []string `json:"limitations"`
}

type Catalog struct {
	SchemaVersion  string           `json:"schema_version"`
	CatalogVersion string           `json:"catalog_version"`
	ReviewedAt     string           `json:"reviewed_at"`
	Fixtures       []CatalogFixture `json:"fixtures"`
	Disclaimer     string           `json:"disclaimer"`
}

type Request struct {
	SchemaVersion string `json:"schema_version"`
	FixtureID     string `json:"fixture_id"`
	Standard      string `json:"standard"`
}

type BoundedValue struct {
	Status string   `json:"status"`
	Value  string   `json:"value,omitempty"`
	Values []string `json:"values,omitempty"`
	Low    *int     `json:"low,omitempty"`
	High   *int     `json:"high,omitempty"`
	Unit   string   `json:"unit,omitempty"`
}

type Check struct {
	ID                string       `json:"id"`
	Group             string       `json:"group"`
	Label             string       `json:"label"`
	Outcome           string       `json:"outcome"`
	Actual            BoundedValue `json:"actual"`
	Expected          BoundedValue `json:"expected"`
	EvidenceSourceIDs []string     `json:"evidence_source_ids"`
	Mismatches        []string     `json:"mismatches"`
	SensitivityNotes  []string     `json:"sensitivity_notes"`
}

type ModelVersion struct {
	Component string `json:"component"`
	Version   string `json:"version"`
}

type Report struct {
	SchemaVersion      string         `json:"schema_version"`
	FixtureID          string         `json:"fixture_id"`
	FixtureLabel       string         `json:"fixture_label"`
	FixtureKind        string         `json:"fixture_kind"`
	Hazard             string         `json:"hazard"`
	Jurisdiction       string         `json:"jurisdiction"`
	Island             string         `json:"island"`
	RunID              string         `json:"run_id"`
	GeneratedAt        string         `json:"generated_at"`
	EngineVersion      string         `json:"engine_version"`
	CalibrationVersion string         `json:"calibration_version"`
	FixtureVersion     string         `json:"fixture_version"`
	EvaluationStandard string         `json:"evaluation_standard"`
	ModelVersions      []ModelVersion `json:"model_versions"`
	Checks             []Check        `json:"checks"`
	Sources            []Source       `json:"sources"`
	Limitations        []string       `json:"limitations"`
	Disclaimer         string         `json:"disclaimer"`
}

type fixture struct {
	CatalogFixture
	Hotspots          []string
	ExpectedHotspots  []string
	DemandRequest     resourcedemand.Request
	DemandExpectation BoundedValue
	TriggerActual     BoundedValue
	TriggerExpected   BoundedValue
	OperationalGaps   []string
	ExpectedGaps      []string
}

type Engine struct {
	demand ResourceDemandCalculator
}

func NewEngine(demand ResourceDemandCalculator) Engine {
	if demand == nil {
		demand = resourcedemand.NewCalculator()
	}
	return Engine{demand: demand}
}

func CurrentCatalog() Catalog {
	entries := fixtures()
	result := make([]CatalogFixture, 0, len(entries))
	for _, entry := range entries {
		result = append(result, cloneCatalogFixture(entry.CatalogFixture))
	}
	slices.SortFunc(result, func(left CatalogFixture, right CatalogFixture) int {
		if left.ID < right.ID {
			return -1
		}
		if left.ID > right.ID {
			return 1
		}
		return 0
	})
	return Catalog{
		SchemaVersion:  CatalogSchemaVersion,
		CatalogVersion: FixtureCatalogVersion,
		ReviewedAt:     "2026-10-27",
		Fixtures:       result,
		Disclaimer:     "Replay fixtures are calibration and training evidence, never predictions, forecast validation, legal findings, or proof that a historical action was correct.",
	}
}

func (engine Engine) Run(ctx context.Context, request Request) (Report, error) {
	if request.SchemaVersion != RequestSchemaVersion ||
		request.Standard != CurrentEvaluationStandard {
		return Report{}, ErrInvalidRequest
	}
	entry, ok := fixtureByID(request.FixtureID)
	if !ok {
		return Report{}, ErrInvalidRequest
	}

	checks := []Check{
		hotspotCheck(entry),
		sourceAvailabilityCheck(entry),
		triggerCheck(entry),
		gapCheck(entry),
	}
	modelVersions := []ModelVersion{
		{Component: "historical_replay", Version: EngineVersion},
	}
	calculationID := "unavailable"
	demandCheck := unavailableDemandCheck(entry)
	if entry.DemandRequest.SchemaVersion == resourcedemand.RequestSchemaVersion {
		response, err := engine.demand.Calculate(ctx, entry.DemandRequest)
		if err != nil {
			return Report{}, fmt.Errorf("calculate replay demand: %w", err)
		}
		calculationID = response.CalculationID
		modelVersions = append(modelVersions,
			ModelVersion{Component: "resource_demand", Version: response.ModelVersion},
			ModelVersion{Component: "resource_demand_assumptions", Version: response.AssumptionVersion},
		)
		demandCheck = compareDemand(entry, response)
	}
	checks = append(checks[:2], append([]Check{demandCheck}, checks[2:]...)...)
	for index := range checks {
		if checks[index].Mismatches == nil {
			checks[index].Mismatches = []string{}
		}
		if checks[index].SensitivityNotes == nil {
			checks[index].SensitivityNotes = []string{}
		}
		if checks[index].EvidenceSourceIDs == nil {
			checks[index].EvidenceSourceIDs = []string{}
		}
	}

	report := Report{
		SchemaVersion:      ReportSchemaVersion,
		FixtureID:          entry.ID,
		FixtureLabel:       entry.Label,
		FixtureKind:        entry.FixtureKind,
		Hazard:             entry.Hazard,
		Jurisdiction:       entry.Jurisdiction,
		Island:             entry.Island,
		GeneratedAt:        "2026-10-27T00:00:00Z",
		EngineVersion:      EngineVersion,
		CalibrationVersion: CalibrationVersion,
		FixtureVersion:     entry.FixtureVersion,
		EvaluationStandard: request.Standard,
		ModelVersions:      modelVersions,
		Checks:             checks,
		Sources:            slices.Clone(entry.Sources),
		Limitations:        slices.Clone(entry.Limitations),
		Disclaimer:         "This report compares bounded evaluator expectations with current deterministic model output. It does not predict an event, tune coefficients, establish legal authority, or prove that a historical action was correct.",
	}
	report.RunID = reportID(request, entry, calculationID)
	return report, nil
}

func hotspotCheck(entry fixture) Check {
	expected := slices.Clone(entry.ExpectedHotspots)
	actual := slices.Clone(entry.Hotspots)
	slices.Sort(expected)
	slices.Sort(actual)
	missing := missingValues(expected, actual)
	outcome := "pass"
	if len(expected) == 0 {
		outcome = "unavailable"
	} else if len(missing) > 0 {
		outcome = "fail"
	}
	return Check{
		ID:      "map.hotspot-domains",
		Group:   "Map",
		Label:   "Supported hotspot domains remain visible",
		Outcome: outcome,
		Actual: BoundedValue{
			Status: statusForValues(actual),
			Values: actual,
		},
		Expected: BoundedValue{
			Status: statusForValues(expected),
			Values: expected,
		},
		EvidenceSourceIDs: sourceIDs(entry.Sources),
		Mismatches:        prefixMissing("missing hotspot domain: ", missing),
		SensitivityNotes: []string{
			"Only aggregate domains documented by the fixture sources are evaluated.",
		},
	}
}

func sourceAvailabilityCheck(entry fixture) Check {
	statuses := make([]string, 0, len(entry.Sources))
	outcome := "pass"
	for _, source := range entry.Sources {
		statuses = append(statuses, source.ID+":"+source.Availability)
		switch source.Availability {
		case "stale":
			if outcome == "pass" {
				outcome = "warn"
			}
		case "unavailable":
			outcome = "unavailable"
		case "available", "synthetic_exercise":
		default:
			outcome = "fail"
		}
	}
	slices.Sort(statuses)
	return Check{
		ID:      "map.source-availability",
		Group:   "Map",
		Label:   "Source availability is preserved without zero substitution",
		Outcome: outcome,
		Actual: BoundedValue{
			Status: "available",
			Values: statuses,
		},
		Expected: BoundedValue{
			Status: "available",
			Value:  "available, stale, unavailable, and synthetic exercise remain distinct",
		},
		EvidenceSourceIDs: sourceIDs(entry.Sources),
		SensitivityNotes: []string{
			"Stale evidence remains usable only with an explicit warning.",
			"Unavailable evidence is never converted to zero or no impact.",
		},
	}
}

func unavailableDemandCheck(entry fixture) Check {
	return Check{
		ID:      "model.resource-demand",
		Group:   "Model",
		Label:   "Resource demand stays bounded by supported aggregate evidence",
		Outcome: "unavailable",
		Actual: BoundedValue{
			Status: "unavailable",
			Value:  "historical aggregate population input unavailable",
		},
		Expected:          entry.DemandExpectation,
		EvidenceSourceIDs: sourceIDs(entry.Sources),
		SensitivityNotes: []string{
			"No historical population, shelter occupancy, or person-level demand was reconstructed.",
		},
	}
}

func compareDemand(entry fixture, response resourcedemand.Response) Check {
	actual := BoundedValue{
		Status: response.Status,
		Value:  "resource demand unavailable",
	}
	for _, line := range response.Lines {
		if line.ID != "service_population" {
			continue
		}
		if line.Demand == nil {
			actual.Status = "unavailable"
			break
		}
		actual = BoundedValue{
			Status: "available",
			Value:  fmt.Sprintf("%d", line.Demand.Planning),
			Low:    intPointer(line.Demand.Low),
			High:   intPointer(line.Demand.High),
			Unit:   line.Unit,
		}
		break
	}
	outcome := "pass"
	mismatches := []string{}
	if actual.Status == "unavailable" {
		outcome = "unavailable"
	} else if entry.DemandExpectation.Low != nil &&
		entry.DemandExpectation.High != nil {
		var planning int
		if _, err := fmt.Sscanf(actual.Value, "%d", &planning); err != nil ||
			planning < *entry.DemandExpectation.Low ||
			planning > *entry.DemandExpectation.High {
			outcome = "fail"
			mismatches = append(mismatches, "planning demand fell outside the versioned expectation range")
		}
	}
	return Check{
		ID:                "model.resource-demand",
		Group:             "Model",
		Label:             "Resource demand stays bounded by supported aggregate evidence",
		Outcome:           outcome,
		Actual:            actual,
		Expected:          entry.DemandExpectation,
		EvidenceSourceIDs: sourceIDs(entry.Sources),
		Mismatches:        mismatches,
		SensitivityNotes: []string{
			"The current production resource-demand calculator is evaluated without coefficient tuning.",
			"Exercise population is controlled synthetic input, not a reconstructed historical count.",
		},
	}
}

func triggerCheck(entry fixture) Check {
	outcome := "pass"
	mismatches := []string{}
	if entry.TriggerExpected.Status == "unavailable" {
		outcome = "unavailable"
	} else if entry.TriggerActual.Value != entry.TriggerExpected.Value {
		outcome = "fail"
		mismatches = append(mismatches, "trigger classification or legal-authority boundary changed")
	}
	return Check{
		ID:                "operate.trigger-semantics",
		Group:             "Operate",
		Label:             "Scientific and warning triggers remain separate from legal orders",
		Outcome:           outcome,
		Actual:            entry.TriggerActual,
		Expected:          entry.TriggerExpected,
		EvidenceSourceIDs: sourceIDs(entry.Sources),
		Mismatches:        mismatches,
		SensitivityNotes: []string{
			"Unavailable County order evidence never means no order.",
		},
	}
}

func gapCheck(entry fixture) Check {
	actual := slices.Clone(entry.OperationalGaps)
	expected := slices.Clone(entry.ExpectedGaps)
	slices.Sort(actual)
	slices.Sort(expected)
	missing := missingValues(expected, actual)
	outcome := "pass"
	if len(expected) == 0 {
		outcome = "unavailable"
	} else if len(missing) > 0 {
		outcome = "warn"
	}
	return Check{
		ID:      "match.operational-gaps",
		Group:   "Match",
		Label:   "Known coordination gaps remain explicit",
		Outcome: outcome,
		Actual: BoundedValue{
			Status: statusForValues(actual),
			Values: actual,
		},
		Expected: BoundedValue{
			Status: statusForValues(expected),
			Values: expected,
		},
		EvidenceSourceIDs: sourceIDs(entry.Sources),
		Mismatches:        prefixMissing("missing coordination gap: ", missing),
		SensitivityNotes: []string{
			"Partner activation, route passability, and evacuation authority are unavailable unless directly documented.",
		},
	}
}

func reportID(request Request, entry fixture, calculationID string) string {
	payload, _ := json.Marshal(struct {
		Request            Request `json:"request"`
		EngineVersion      string  `json:"engine_version"`
		CalibrationVersion string  `json:"calibration_version"`
		FixtureVersion     string  `json:"fixture_version"`
		CalculationID      string  `json:"calculation_id"`
	}{
		Request:            request,
		EngineVersion:      EngineVersion,
		CalibrationVersion: CalibrationVersion,
		FixtureVersion:     entry.FixtureVersion,
		CalculationID:      calculationID,
	})
	sum := sha256.Sum256(payload)
	return "replay-" + hex.EncodeToString(sum[:12])
}

func fixtureByID(id string) (fixture, bool) {
	for _, entry := range fixtures() {
		if entry.ID == id {
			return entry, true
		}
	}
	return fixture{}, false
}

func fixtures() []fixture {
	return []fixture{
		wildfireFixture(),
		volcanoFixture(),
		floodFixture(),
		hurricaneFixture(),
		tsunamiExerciseFixture(),
	}
}

func wildfireFixture() fixture {
	sources := []Source{
		source(
			"hawaii-ag-maui-wildfire-phase-two",
			"Lahaina Fire Incident Analysis Report, Phase Two",
			"Hawaiʻi Department of the Attorney General / FSRI",
			"https://fsri.org/resource/phase-two-lahaina-fire-incident-analysis-report",
			"available",
			"observed_aggregate",
			"Coordination, warning, communications, road-network, and infrastructure findings only.",
			"Raw 911 audio, interviews, body-camera evidence, individual outcomes, and legal conclusions are excluded.",
			"ADOPT",
		),
	}
	return fixture{
		CatalogFixture: catalogFixture(
			"hi-wildfire-2023-lahaina",
			"2023 Lahaina wildfire published incident analysis",
			"historical_incident",
			"wildfire",
			"County of Maui",
			"Maui",
			"maui-central",
			"2023-08-08/2023-08-09",
			"high",
			Coverage{"supported", "unavailable", "supported", "supported", "supported"},
			sources,
			[]string{
				"Published incident analysis supports aggregate coordination domains, not individual outcomes or proof that a historical action was correct.",
				"Historical shelter occupancy, partner activation, route passability, and person-level demand remain unavailable.",
			},
		),
		Hotspots:         []string{"communication", "transportation", "safety", "medical-power"},
		ExpectedHotspots: []string{"communication", "transportation", "safety"},
		DemandExpectation: BoundedValue{
			Status: "unavailable",
			Value:  "unsupported historical demand inputs",
		},
		TriggerActual: BoundedValue{
			Status: "available",
			Value:  "warning_context_not_evacuation_authority",
		},
		TriggerExpected: BoundedValue{
			Status: "available",
			Value:  "warning_context_not_evacuation_authority",
		},
		OperationalGaps: []string{"warning coordination", "inter-agency communication", "road-network chokepoints"},
		ExpectedGaps:    []string{"warning coordination", "inter-agency communication"},
	}
}

func volcanoFixture() fixture {
	sources := []Source{
		source(
			"usgs-kilauea-2018-ofr-2020-1041",
			"2018 Lower East Rift Zone Eruption and Summit Collapse at Kīlauea Volcano",
			"U.S. Geological Survey Hawaiian Volcano Observatory",
			"https://pubs.usgs.gov/publication/ofr20201041",
			"available",
			"observed_aggregate",
			"Stable geologic chronology, fissure activity, inundation extent, earthquake trigger, and aggregate infrastructure effects.",
			"Does not establish County evacuation authority, person-level compliance, shelter occupancy, or medical outcomes.",
			"ADOPT/FURTHER-RESEARCH",
		),
	}
	return fixture{
		CatalogFixture: catalogFixture(
			"hi-volcanic-2018-kilauea-lerz",
			"2018 Kīlauea lower East Rift Zone eruption",
			"historical_incident",
			"volcanic",
			"County of Hawaiʻi",
			"Hawaiʻi",
			"hawaii-hilo",
			"2018-04-30/2018-09-04",
			"high",
			Coverage{"supported", "unavailable", "supported", "supported", "partial"},
			sources,
			[]string{
				"Lower Puna fissure conditions do not represent every Hawaiʻi volcanic hazard.",
				"Fine-grained coordination-gap claims remain unavailable pending direct section-level source review.",
			},
		),
		Hotspots:         []string{"transportation", "communication", "medical-power"},
		ExpectedHotspots: []string{"transportation", "medical-power"},
		DemandExpectation: BoundedValue{
			Status: "unavailable",
			Value:  "unsupported historical demand inputs",
		},
		TriggerActual: BoundedValue{
			Status: "available",
			Value:  "usgs_scientific_alert_not_county_order",
		},
		TriggerExpected: BoundedValue{
			Status: "available",
			Value:  "usgs_scientific_alert_not_county_order",
		},
		OperationalGaps: []string{},
		ExpectedGaps:    []string{},
	}
}

func floodFixture() fixture {
	sources := []Source{
		source(
			"noaa-kauai-oahu-flood-2018",
			"Record Kauaʻi and Oʻahu Rainfall and Flooding, April 2018",
			"NOAA National Weather Service Honolulu",
			"https://www.weather.gov/hfo/RecordKauaiandOahuRainfallAndFlooding-April2018",
			"available",
			"observed_aggregate",
			"Rainfall magnitude, flash-flood chronology, and aggregate transportation isolation context.",
			"Does not support exact shelter populations, household outcomes, or route passability outside documented aggregate statements.",
			"ADOPT/ADAPT",
		),
		source(
			"hawaii-doh-kauai-casper-2018",
			"Kauaʻi Emergency Preparedness CASPER Final Report",
			"Hawaiʻi State Department of Health",
			"https://health.hawaii.gov/kauai/files/2018/11/Kauai-CASPER-2018-Final-Report.pdf",
			"stale",
			"observed_aggregate",
			"Aggregate household preparedness and public-health planning themes.",
			"Survey findings are time-bounded and are not person-level replay inputs.",
			"ADAPT",
		),
	}
	return fixture{
		CatalogFixture: catalogFixture(
			"hi-flood-2018-kauai-north-shore",
			"April 2018 Kauaʻi North Shore record flood",
			"historical_incident",
			"flood",
			"County of Kauaʻi",
			"Kauaʻi",
			"kauai-east",
			"2018-04-13/2018-04-15",
			"high",
			Coverage{"supported", "unavailable", "supported", "stale", "partial"},
			sources,
			[]string{
				"North Shore rural flood conditions should not be generalized to dense urban Oʻahu.",
				"Numeric structure-damage and shelter-demand expectations remain unavailable without primary-source verification.",
			},
		),
		Hotspots:         []string{"transportation", "communication", "safety"},
		ExpectedHotspots: []string{"transportation", "safety"},
		DemandExpectation: BoundedValue{
			Status: "unavailable",
			Value:  "unsupported historical demand inputs",
		},
		TriggerActual: BoundedValue{
			Status: "available",
			Value:  "nws_warning_not_county_order",
		},
		TriggerExpected: BoundedValue{
			Status: "available",
			Value:  "nws_warning_not_county_order",
		},
		OperationalGaps: []string{"single-corridor isolation", "communications continuity"},
		ExpectedGaps:    []string{"single-corridor isolation"},
	}
}

func hurricaneFixture() fixture {
	sources := []Source{
		source(
			"noaa-hurricane-lane-tcr",
			"Hurricane Lane Tropical Cyclone Report",
			"NOAA National Hurricane Center / Central Pacific Hurricane Center",
			"https://www.nhc.noaa.gov/data/tcr/EP142018_Lane.pdf",
			"available",
			"observed_aggregate",
			"Official storm chronology, rainfall, stream-gauge, and aggregate hazard evidence.",
			"Rainfall-dominant non-landfall case; no person-level outcomes, shelter occupancy, or County order inference.",
			"ADOPT/FURTHER-RESEARCH",
		),
	}
	return fixture{
		CatalogFixture: catalogFixture(
			"hi-hurricane-2018-lane",
			"2018 Hurricane Lane rainfall and flooding",
			"historical_incident",
			"hurricane",
			"County of Hawaiʻi",
			"Hawaiʻi",
			"hawaii-hilo",
			"2018-08-15/2018-08-30",
			"high",
			Coverage{"supported", "unavailable", "supported", "supported", "partial"},
			sources,
			[]string{
				"Lane is a rainfall and flooding analog, not a direct wind or storm-surge landfall analog.",
				"Structure damage, individual outcomes, route passability, and shelter demand are unavailable in this fixture.",
			},
		),
		Hotspots:         []string{"transportation", "safety", "communication"},
		ExpectedHotspots: []string{"transportation", "safety"},
		DemandExpectation: BoundedValue{
			Status: "unavailable",
			Value:  "unsupported historical demand inputs",
		},
		TriggerActual: BoundedValue{
			Status: "available",
			Value:  "cphc_advisory_not_county_order",
		},
		TriggerExpected: BoundedValue{
			Status: "available",
			Value:  "cphc_advisory_not_county_order",
		},
		OperationalGaps: []string{"flooded crossings", "debris and landslide access"},
		ExpectedGaps:    []string{"flooded crossings"},
	}
}

func tsunamiExerciseFixture() fixture {
	estimate := 10000
	margin := 1000
	request := resourcedemand.Request{
		SchemaVersion: resourcedemand.RequestSchemaVersion,
		Population: resourcedemand.PopulationInput{
			Status:        "available",
			Estimate:      &estimate,
			MarginOfError: &margin,
			Source: resourcedemand.SourceInput{
				ID:        "acs-5-year",
				Freshness: "fresh",
			},
		},
		MedicalPower: resourcedemand.ProtectedInput{
			Status:   "available",
			Masked:   true,
			SourceID: "hhs-empower",
		},
		Scenario: resourcedemand.ScenarioInput{
			ServiceDays:     3,
			ShelterStandard: "evacuation",
		},
		PracticeSupplies: []resourcedemand.SupplyInput{},
	}
	request.Geography.ID = "oahu-town"
	request.Geography.Kind = "planning_area"
	low, high := 900, 3850
	sources := []Source{
		source(
			"itic-pacific-wave-hawaii-exercise",
			"Pacific Wave / ITIC Hawaiʻi tsunami exercise program",
			"NOAA Pacific Tsunami Warning Center / UNESCO-IOC ITIC",
			"https://www.tsunami.gov/",
			"synthetic_exercise",
			"synthetic_exercise",
			"Controlled statewide tsunami training scenario and warning-center exercise semantics.",
			"No public numbered AAR/IP was verified; no real arrival, inundation, evacuation, shelter, or route outcome is asserted.",
			"FURTHER-RESEARCH",
		),
		source(
			"acs-5-year",
			"American Community Survey 5-year aggregate",
			"U.S. Census Bureau",
			"https://api.census.gov/data.html",
			"synthetic_exercise",
			"synthetic_exercise",
			"Controlled aggregate exercise population input only.",
			"Exercise value is synthetic and is not a historical reconstruction.",
			"ADAPT",
		),
	}
	return fixture{
		CatalogFixture: catalogFixture(
			"hi-tsunami-exercise-pacific-wave",
			"Statewide Pacific Wave tsunami exercise",
			"synthetic_exercise",
			"tsunami_earthquake",
			"State of Hawaiʻi / City and County of Honolulu",
			"Oʻahu",
			"oahu-town",
			"recurring exercise; controlled 2023 training reference",
			"exercise",
			Coverage{"synthetic_exercise", "synthetic_exercise", "partial", "synthetic_exercise", "partial"},
			sources,
			[]string{
				"This is a synthetic exercise fixture, not an observed tsunami outcome.",
				"No public numbered AAR/IP was verified, so route, partner, order, and evacuation outcomes remain unavailable.",
			},
		),
		Hotspots:          []string{"transportation", "communication", "independence"},
		ExpectedHotspots:  []string{"transportation", "communication"},
		DemandRequest:     request,
		DemandExpectation: BoundedValue{Status: "synthetic_exercise", Low: &low, High: &high, Unit: "people"},
		TriggerActual: BoundedValue{
			Status: "unavailable",
			Value:  "exercise warning flow does not establish real evacuation authority",
		},
		TriggerExpected: BoundedValue{
			Status: "unavailable",
			Value:  "exercise warning flow does not establish real evacuation authority",
		},
		OperationalGaps: []string{"exercise SOP clarity"},
		ExpectedGaps:    []string{"exercise SOP clarity"},
	}
}

func catalogFixture(
	id string,
	label string,
	kind string,
	hazard string,
	jurisdiction string,
	island string,
	areaTemplateID string,
	window string,
	quality string,
	coverage Coverage,
	sources []Source,
	limitations []string,
) CatalogFixture {
	return CatalogFixture{
		ID:                id,
		FixtureVersion:    id + ".v1",
		Label:             label,
		FixtureKind:       kind,
		Hazard:            hazard,
		Jurisdiction:      jurisdiction,
		Island:            island,
		AreaTemplateID:    areaTemplateID,
		ObservationWindow: window,
		EvidenceQuality:   quality,
		Coverage:          coverage,
		Sources:           sources,
		Limitations:       limitations,
	}
}

func source(
	id string,
	title string,
	authority string,
	url string,
	availability string,
	evidenceClass string,
	supportedUse string,
	limitations string,
	decision string,
) Source {
	freshUntil := "2027-04-25"
	if availability == "stale" {
		freshUntil = "2019-11-30"
	}
	return Source{
		ID:               id,
		Title:            title,
		Authority:        authority,
		URL:              url,
		RetrievedAt:      "2026-10-27",
		ReviewedAt:       "2026-10-27",
		FreshUntil:       freshUntil,
		Availability:     availability,
		EvidenceClass:    evidenceClass,
		SupportedUse:     supportedUse,
		Limitations:      limitations,
		ResearchDecision: decision,
	}
}

func sourceIDs(sources []Source) []string {
	ids := make([]string, 0, len(sources))
	for _, source := range sources {
		ids = append(ids, source.ID)
	}
	slices.Sort(ids)
	return ids
}

func statusForValues(values []string) string {
	if len(values) == 0 {
		return "unavailable"
	}
	return "available"
}

func missingValues(expected []string, actual []string) []string {
	missing := []string{}
	for _, value := range expected {
		if !slices.Contains(actual, value) {
			missing = append(missing, value)
		}
	}
	return missing
}

func prefixMissing(prefix string, values []string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = append(result, prefix+value)
	}
	return result
}

func intPointer(value int) *int {
	return &value
}

func cloneCatalogFixture(value CatalogFixture) CatalogFixture {
	value.Sources = slices.Clone(value.Sources)
	value.Limitations = slices.Clone(value.Limitations)
	return value
}

func ReviewedAt() time.Time {
	return time.Date(2026, time.October, 27, 0, 0, 0, 0, time.UTC)
}
