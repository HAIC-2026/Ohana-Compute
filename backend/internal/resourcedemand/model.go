package resourcedemand

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"regexp"
	"slices"
	"time"
)

const (
	RequestSchemaVersion  = "resource-demand-request.v2"
	ResponseSchemaVersion = "resource-demand-response.v2"
	ModelVersion          = "mass-care-demand-v0.2"
	AssumptionVersion     = "hawaii-mass-care-scenario-v0.2"
)

var geographyIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)

var hazardIDs = []string{"flood", "hurricane", "tsunami", "wildfire"}

var countyIDs = []string{"hawaii", "honolulu", "kalawao", "kauai", "maui"}

var islandIDs = []string{
	"hawaii", "kauai", "lanai", "maui", "molokai", "niihau", "oahu",
}

type SourceInput struct {
	ID        string `json:"id"`
	Freshness string `json:"freshness"`
}

type CountInput struct {
	Status        string `json:"status"`
	Estimate      *int   `json:"estimate,omitempty"`
	MarginOfError *int   `json:"margin_of_error,omitempty"`
}

type CommunityInputs struct {
	Households          CountInput `json:"households"`
	LimitedEnglish      CountInput `json:"limited_english_population"`
	Disability          CountInput `json:"population_with_disability"`
	BelowPoverty        CountInput `json:"population_below_poverty"`
	NoVehicleHouseholds CountInput `json:"no_vehicle_households"`
}

type PopulationInput struct {
	Status        string      `json:"status"`
	Estimate      *int        `json:"estimate,omitempty"`
	MarginOfError *int        `json:"margin_of_error,omitempty"`
	Source        SourceInput `json:"source"`
}

type ProtectedInput struct {
	Status     string `json:"status"`
	Value      *int   `json:"value,omitempty"`
	Masked     bool   `json:"masked"`
	SourceID   string `json:"source_id"`
	SourceDate string `json:"source_date,omitempty"`
}

type ScenarioInput struct {
	ServiceDays     int    `json:"service_days"`
	ShelterStandard string `json:"shelter_standard"`
	Hazard          string `json:"hazard"`
	OutageHours     int    `json:"outage_hours"`
}

type SupplyInput struct {
	Category         string `json:"category"`
	Unit             string `json:"unit"`
	Quantity         int    `json:"quantity"`
	GeographyID      string `json:"geography_id"`
	ValidationStatus string `json:"validation_status"`
}

type Request struct {
	SchemaVersion string `json:"schema_version"`
	Geography     struct {
		ID       string `json:"id"`
		Kind     string `json:"kind"`
		CountyID string `json:"county_id"`
		IslandID string `json:"island_id"`
	} `json:"geography"`
	Population       PopulationInput `json:"population"`
	Community        CommunityInputs `json:"community"`
	MedicalPower     ProtectedInput  `json:"medical_power"`
	Scenario         ScenarioInput   `json:"scenario"`
	PracticeSupplies []SupplyInput   `json:"practice_supplies"`
}

type Range struct {
	Low      int `json:"low"`
	Planning int `json:"planning"`
	High     int `json:"high"`
}

type PopulationEvidence struct {
	Status        string      `json:"status"`
	Estimate      *int        `json:"estimate,omitempty"`
	MarginOfError *int        `json:"margin_of_error,omitempty"`
	Range         *Range      `json:"range,omitempty"`
	Source        SourceInput `json:"source"`
}

type Assumption struct {
	ID       string    `json:"id"`
	Label    string    `json:"label"`
	Unit     string    `json:"unit"`
	Values   []float64 `json:"values"`
	Basis    string    `json:"basis"`
	Evidence []string  `json:"evidence"`
}

type EvidenceSource struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	Authority  string `json:"authority"`
	URL        string `json:"url"`
	DataDate   string `json:"data_date"`
	ReviewedAt string `json:"reviewed_at"`
	FreshUntil string `json:"fresh_until"`
	Use        string `json:"use"`
}

type SupplySummary struct {
	AppliedQuantity int `json:"applied_quantity"`
	AppliedRecords  int `json:"applied_records"`
}

type Line struct {
	ID                string         `json:"id"`
	Label             string         `json:"label"`
	Status            string         `json:"status"`
	Unit              string         `json:"unit"`
	Demand            *Range         `json:"demand,omitempty"`
	Supply            *SupplySummary `json:"supply,omitempty"`
	Gap               *Range         `json:"gap,omitempty"`
	Basis             string         `json:"basis"`
	Evidence          []string       `json:"evidence"`
	Notes             []string       `json:"notes"`
	UnavailableReason string         `json:"unavailable_reason,omitempty"`
}

type SupplyAssessment struct {
	Category string `json:"category"`
	Unit     string `json:"unit"`
	Quantity int    `json:"quantity"`
	Status   string `json:"status"`
	Reason   string `json:"reason,omitempty"`
}

type NeedEstimate struct {
	Domain            string   `json:"domain"`
	Label             string   `json:"label"`
	Status            string   `json:"status"`
	Unit              string   `json:"unit"`
	Demand            *Range   `json:"demand,omitempty"`
	Basis             string   `json:"basis"`
	Evidence          []string `json:"evidence"`
	UnavailableReason string   `json:"unavailable_reason,omitempty"`
}

type CountyCapacity struct {
	Status   string   `json:"status"`
	Capacity *int     `json:"capacity,omitempty"`
	Unit     string   `json:"unit"`
	SourceID string   `json:"source_id"`
	Notes    []string `json:"notes"`
}

type Response struct {
	SchemaVersion     string `json:"schema_version"`
	ModelVersion      string `json:"model_version"`
	AssumptionVersion string `json:"assumption_version"`
	CalculationID     string `json:"calculation_id"`
	Status            string `json:"status"`
	Geography         struct {
		ID       string `json:"id"`
		Kind     string `json:"kind"`
		CountyID string `json:"county_id"`
		IslandID string `json:"island_id"`
	} `json:"geography"`
	Population              PopulationEvidence `json:"population"`
	Community               CommunityInputs    `json:"community"`
	Scenario                ScenarioInput      `json:"scenario"`
	Assumptions             []Assumption       `json:"assumptions"`
	Lines                   []Line             `json:"lines"`
	CMIST                   []NeedEstimate     `json:"cmist"`
	CountyCapacity          CountyCapacity     `json:"county_capacity"`
	ServiceAnimalProvisions []string           `json:"service_animal_provisions"`
	SupplyAssessments       []SupplyAssessment `json:"supply_assessments"`
	Sources                 []EvidenceSource   `json:"sources"`
	Disclaimers             []string           `json:"disclaimers"`
}

type Calculator struct{}

func NewCalculator() Calculator {
	return Calculator{}
}

func (Calculator) Calculate(_ context.Context, request Request) (Response, error) {
	if err := Validate(request); err != nil {
		return Response{}, err
	}

	request.PracticeSupplies = slices.Clone(request.PracticeSupplies)
	slices.SortFunc(request.PracticeSupplies, func(left SupplyInput, right SupplyInput) int {
		leftKey := fmt.Sprintf(
			"%s|%s|%s|%s|%012d",
			left.Category,
			left.Unit,
			left.GeographyID,
			left.ValidationStatus,
			left.Quantity,
		)
		rightKey := fmt.Sprintf(
			"%s|%s|%s|%s|%012d",
			right.Category,
			right.Unit,
			right.GeographyID,
			right.ValidationStatus,
			right.Quantity,
		)
		if leftKey < rightKey {
			return -1
		}
		if leftKey > rightKey {
			return 1
		}
		return 0
	})

	response := Response{
		SchemaVersion:     ResponseSchemaVersion,
		ModelVersion:      ModelVersion,
		AssumptionVersion: AssumptionVersion,
		CalculationID:     calculationID(request),
		Status:            "partial",
		Geography:         request.Geography,
		Community:         request.Community,
		Population: PopulationEvidence{
			Status:        request.Population.Status,
			Estimate:      request.Population.Estimate,
			MarginOfError: request.Population.MarginOfError,
			Source:        request.Population.Source,
		},
		Scenario:    request.Scenario,
		Assumptions: assumptions(request.Scenario),
		CMIST:       cmistNeeds(request),
		CountyCapacity: CountyCapacity{
			Status:   "not_published",
			Unit:     "people",
			SourceID: "county-shelter-capacity",
			Notes: []string{
				"No public source establishes current County-wide shelter capacity or openings.",
				"Practice supply is shown separately and is not County-published capacity.",
			},
		},
		ServiceAnimalProvisions: []string{
			"Plan access and co-location with the handler; do not count service animals as pet-shelter demand.",
			"Validate shelter access, relief, water, and feeding arrangements with the County and handler.",
		},
		Sources: evidenceSources(request.MedicalPower.SourceDate),
		Disclaimers: []string{
			"Scenario ranges are deterministic planning stress tests, not forecasts, evacuation orders, or operational allocations.",
			"Practice supply reduces a gap only when its category, unit, geography, and validation status match the modeled line.",
			"Missing, privacy-masked, stale, or unsupported evidence is reported as unavailable rather than converted to zero.",
		},
	}

	appliedSupply, assessments := assessSupplies(request)
	response.SupplyAssessments = assessments

	if request.Population.Status != "available" || request.Population.Estimate == nil {
		response.Status = "unavailable"
		response.Lines = unavailableLines(
			"population_unavailable",
			request.MedicalPower,
		)
		response.CMIST = unavailableCMIST("population_unavailable")
		return response, nil
	}

	population := populationRange(
		*request.Population.Estimate,
		request.Population.MarginOfError,
	)
	response.Population.Range = &population
	servicePopulation := Range{
		Low:      ceil(float64(population.Low) * 0.11),
		Planning: ceil(float64(population.Planning) * 0.23),
		High:     ceil(float64(population.High) * 0.35),
	}
	days := request.Scenario.ServiceDays

	response.Lines = []Line{
		modeledLine(
			"service_population",
			"People requiring mass-care services",
			"people",
			servicePopulation,
			nil,
			"Applies the versioned 11% / 23% / 35% scenario envelope to the aggregate population range.",
			[]string{"mass-care-scenario-v0.1", "hawaii-sesf6-2025"},
			[]string{"This is a combined mass-care service stress test, not a shelter-occupancy probability."},
		),
		modeledLineWithSupply(
			"shelter_spaces",
			"Shelter service spaces",
			"people",
			servicePopulation,
			appliedSupply["shelter_spaces"],
			"Uses one service space per modeled person; only confirmed, geography-matched practice capacity is subtracted.",
			[]string{"mass-care-scenario-v0.1", "fema-p785"},
			nil,
		),
		modeledLine(
			"shelter_floor_area_sq_ft",
			shelterAreaLabel(request.Scenario.ShelterStandard),
			"square_feet",
			shelterAreaRange(servicePopulation, request.Scenario.ShelterStandard),
			nil,
			shelterAreaBasis(request.Scenario.ShelterStandard),
			[]string{"fema-p785", "mass-care-scenario-v0.1"},
			[]string{"Accessible accommodations and service areas can require more space and must be planned separately."},
		),
		modeledLineWithSupply(
			"cots",
			"Cots or sleeping places",
			"cots",
			servicePopulation,
			appliedSupply["cots"],
			"Uses one cot or sleeping place per modeled person.",
			[]string{"fema-p785"},
			nil,
		),
		modeledLineWithSupply(
			"meals",
			fmt.Sprintf("Meal equivalents for %d days", days),
			"meals",
			scaleRange(servicePopulation, 3*days),
			appliedSupply["meals"],
			"Uses three meal equivalents per modeled person per day.",
			[]string{"fema-p785", "mass-care-scenario-v0.1"},
			[]string{"Hot-meal production, snacks, hydration, dietary needs, and distribution capacity remain separate capability checks."},
		),
		modeledLineWithSupply(
			"potable_water_liters",
			fmt.Sprintf("Potable water for %d days", days),
			"liters",
			waterRange(servicePopulation, days),
			appliedSupply["potable_water_liters"],
			"Uses 3.0 / 3.4 / 3.785 liters per modeled person per day.",
			[]string{"fema-water", "mass-care-scenario-v0.1"},
			[]string{"This excludes sanitation, clinical, food-production, and animal water demand."},
		),
		unavailableLine(
			"sanitation_support",
			"Sanitation support",
			"local_planning_factor",
			"local_assumption_required",
			"No statewide approved toilet, shower, cleaning, or waste coefficient is encoded.",
			[]string{"hawaii-sesf6-2025"},
		),
		unavailableLine(
			"shelter_staff",
			"Role-specific shelter staffing",
			"staff_by_role",
			"local_assumption_required",
			"Registration, dormitory, feeding, health, security, logistics, and management staffing must be modeled by role and operating period.",
			[]string{"fema-p785"},
		),
		medicalPowerLine(request.MedicalPower),
		visitorDemandLine(request.Geography.IslandID),
		homelessnessDemandLine(request.Geography.CountyID),
		petShelterLine(request.Community.Households),
		powerContinuityLine(request.MedicalPower, request.Scenario.OutageHours),
		unavailableLine(
			"shelter_capacity_gap",
			"County-published shelter capacity gap",
			"people",
			"capacity_not_published",
			"Modeled demand cannot be compared with County capacity until a public, current capacity source is available.",
			[]string{"county-shelter-capacity"},
		),
		unavailableLine(
			"accessible_transport",
			"Accessible transportation",
			"seats_or_vehicles",
			"coefficient_unavailable",
			"No defensible public coefficient maps aggregate no-vehicle or mobility indicators to incident transport uptake.",
			[]string{"mass-care-scenario-v0.1"},
		),
		unavailableLine(
			"medication_refrigeration",
			"Medication refrigeration",
			"supported_people_or_units",
			"coefficient_unavailable",
			"Aggregate data identifies a planning concern but does not establish refrigeration demand or equipment capacity.",
			[]string{"mass-care-scenario-v0.1"},
		),
		unavailableLine(
			"oxygen_support",
			"Oxygen continuity support",
			"supported_people_or_units",
			"coefficient_unavailable",
			"Public aggregate indicators do not establish oxygen type, duration, delivery method, or replacement need.",
			[]string{"mass-care-scenario-v0.1"},
		),
		unavailableLine(
			"backup_power_sites",
			"Backup-power sites",
			"sites_or_kilowatts",
			"coefficient_unavailable",
			"Power demand requires equipment loads, duration, fuel, transfer equipment, and facility validation.",
			[]string{"mass-care-scenario-v0.1"},
		),
		unavailableLine(
			"service_animal_population_estimate",
			"Service-animal population estimate",
			"animal_spaces",
			"service_animal_count_not_published",
			"No aggregate service-animal count or defensible population coefficient is available; provisions remain separate from pet demand.",
			[]string{"doj-service-animals"},
		),
	}
	return response, nil
}

func Validate(request Request) error {
	if request.SchemaVersion != RequestSchemaVersion {
		return errors.New("unsupported schema_version")
	}
	if !geographyIDPattern.MatchString(request.Geography.ID) {
		return errors.New("geography.id must be a bounded lowercase identifier")
	}
	if request.Geography.Kind != "planning_area" {
		return errors.New("geography.kind must be planning_area")
	}
	if err := validatePopulation(request.Population); err != nil {
		return err
	}
	if err := validateProtectedInput(request.MedicalPower); err != nil {
		return fmt.Errorf("medical_power: %w", err)
	}
	if request.Scenario.ServiceDays < 1 || request.Scenario.ServiceDays > 14 {
		return errors.New("scenario.service_days must be between 1 and 14")
	}
	if request.Scenario.ShelterStandard != "evacuation" &&
		request.Scenario.ShelterStandard != "short_term" {
		return errors.New("scenario.shelter_standard is invalid")
	}
	if !slices.Contains(hazardIDs, request.Scenario.Hazard) {
		return errors.New("scenario.hazard is invalid")
	}
	if request.Scenario.OutageHours < 1 || request.Scenario.OutageHours > 336 {
		return errors.New("scenario.outage_hours must be between 1 and 336")
	}
	if !slices.Contains(countyIDs, request.Geography.CountyID) {
		return errors.New("geography.county_id is invalid")
	}
	if !slices.Contains(islandIDs, request.Geography.IslandID) {
		return errors.New("geography.island_id is invalid")
	}
	for _, input := range []CountInput{
		request.Community.Households,
		request.Community.LimitedEnglish,
		request.Community.Disability,
		request.Community.BelowPoverty,
		request.Community.NoVehicleHouseholds,
	} {
		if err := validateCountInput(input); err != nil {
			return fmt.Errorf("community input: %w", err)
		}
	}
	if len(request.PracticeSupplies) > 32 {
		return errors.New("practice_supplies must contain at most 32 records")
	}
	for index, supply := range request.PracticeSupplies {
		if err := validateSupply(supply); err != nil {
			return fmt.Errorf("practice_supplies[%d]: %w", index, err)
		}
	}
	return nil
}

func validateCountInput(input CountInput) error {
	switch input.Status {
	case "", "unavailable":
		if input.Estimate != nil || input.MarginOfError != nil {
			return errors.New("unavailable counts must not include values")
		}
	case "available":
		if input.Estimate == nil || *input.Estimate < 0 || *input.Estimate > 5_000_000 {
			return errors.New("available counts require a bounded estimate")
		}
		if input.MarginOfError != nil &&
			(*input.MarginOfError < 0 || *input.MarginOfError > 5_000_000) {
			return errors.New("count margin of error is out of range")
		}
	default:
		return errors.New("count status is invalid")
	}
	return nil
}

func validatePopulation(population PopulationInput) error {
	switch population.Status {
	case "available":
		if population.Estimate == nil {
			return errors.New("population.estimate is required when available")
		}
		if *population.Estimate < 1 || *population.Estimate > 5_000_000 {
			return errors.New("population.estimate is out of range")
		}
		if population.MarginOfError != nil &&
			(*population.MarginOfError < 0 || *population.MarginOfError > 5_000_000) {
			return errors.New("population.margin_of_error is out of range")
		}
	case "unavailable":
		if population.Estimate != nil || population.MarginOfError != nil {
			return errors.New("unavailable population must not include values")
		}
	default:
		return errors.New("population.status is invalid")
	}
	if population.Source.ID != "acs-5-year" &&
		population.Source.ID != "unavailable" {
		return errors.New("population.source.id is invalid")
	}
	if population.Source.Freshness != "fresh" &&
		population.Source.Freshness != "stale" &&
		population.Source.Freshness != "unavailable" {
		return errors.New("population.source.freshness is invalid")
	}
	return nil
}

func validateProtectedInput(input ProtectedInput) error {
	switch input.Status {
	case "available":
		if input.Masked {
			if input.Value != nil {
				return errors.New("privacy-masked input must not include a value")
			}
		} else if input.Value == nil || *input.Value < 0 || *input.Value > 1_000_000 {
			return errors.New("available unmasked input requires a bounded value")
		}
	case "unavailable":
		if input.Value != nil {
			return errors.New("unavailable input must not include a value")
		}
	default:
		return errors.New("status is invalid")
	}
	if input.SourceID != "hhs-empower" && input.SourceID != "unavailable" {
		return errors.New("source_id is invalid")
	}
	if input.SourceDate != "" {
		if _, err := time.Parse("2006-01-02", input.SourceDate); err != nil {
			return errors.New("source_date must be YYYY-MM-DD")
		}
	}
	return nil
}

func validateSupply(supply SupplyInput) error {
	allowedCategories := map[string]bool{
		"shelter_spaces":       true,
		"cots":                 true,
		"meals":                true,
		"potable_water_liters": true,
	}
	if !allowedCategories[supply.Category] {
		return errors.New("category is invalid")
	}
	allowedUnits := map[string]bool{
		"people": true,
		"cots":   true,
		"meals":  true,
		"liters": true,
	}
	if !allowedUnits[supply.Unit] {
		return errors.New("unit is invalid")
	}
	if supply.Quantity < 1 || supply.Quantity > 10_000_000 {
		return errors.New("quantity is out of range")
	}
	if !geographyIDPattern.MatchString(supply.GeographyID) {
		return errors.New("geography_id must be a bounded lowercase identifier")
	}
	if supply.ValidationStatus != "practice_confirmed" &&
		supply.ValidationStatus != "needs_confirmation" {
		return errors.New("validation_status is invalid")
	}
	return nil
}

func assessSupplies(
	request Request,
) (map[string]SupplySummary, []SupplyAssessment) {
	expectedUnits := map[string]string{
		"shelter_spaces":       "people",
		"cots":                 "cots",
		"meals":                "meals",
		"potable_water_liters": "liters",
	}
	applied := make(map[string]SupplySummary)
	assessments := make([]SupplyAssessment, 0, len(request.PracticeSupplies))
	for _, supply := range request.PracticeSupplies {
		assessment := SupplyAssessment{
			Category: supply.Category,
			Unit:     supply.Unit,
			Quantity: supply.Quantity,
			Status:   "excluded",
		}
		switch {
		case supply.ValidationStatus != "practice_confirmed":
			assessment.Reason = "not_confirmed"
		case supply.GeographyID != request.Geography.ID:
			assessment.Reason = "geography_mismatch"
		case supply.Unit != expectedUnits[supply.Category]:
			assessment.Reason = "unit_mismatch"
		default:
			assessment.Status = "applied"
			current := applied[supply.Category]
			current.AppliedQuantity += supply.Quantity
			current.AppliedRecords++
			applied[supply.Category] = current
		}
		assessments = append(assessments, assessment)
	}
	return applied, assessments
}

func modeledLine(
	id string,
	label string,
	unit string,
	demand Range,
	supply *SupplySummary,
	basis string,
	evidence []string,
	notes []string,
) Line {
	return Line{
		ID:       id,
		Label:    label,
		Status:   "modeled",
		Unit:     unit,
		Demand:   &demand,
		Supply:   supply,
		Basis:    basis,
		Evidence: evidence,
		Notes:    notes,
	}
}

func modeledLineWithSupply(
	id string,
	label string,
	unit string,
	demand Range,
	supply SupplySummary,
	basis string,
	evidence []string,
	notes []string,
) Line {
	line := modeledLine(id, label, unit, demand, &supply, basis, evidence, notes)
	gap := Range{
		Low:      max(demand.Low-supply.AppliedQuantity, 0),
		Planning: max(demand.Planning-supply.AppliedQuantity, 0),
		High:     max(demand.High-supply.AppliedQuantity, 0),
	}
	line.Gap = &gap
	return line
}

func unavailableLine(
	id string,
	label string,
	unit string,
	reason string,
	basis string,
	evidence []string,
) Line {
	return Line{
		ID:                id,
		Label:             label,
		Status:            "unavailable",
		Unit:              unit,
		Basis:             basis,
		Evidence:          evidence,
		Notes:             []string{},
		UnavailableReason: reason,
	}
}

func cmistNeeds(request Request) []NeedEstimate {
	factors := map[string][3]float64{
		"communication":  {0.10, 0.20, 0.35},
		"medical":        {0.50, 0.75, 1.00},
		"independence":   {0.10, 0.25, 0.40},
		"safety_support": {0.05, 0.15, 0.30},
		"transportation": {0.50, 1.00, 1.50},
	}
	multipliers := map[string]map[string]float64{
		"flood": {
			"communication": 1.0, "medical": 1.2, "independence": 1.2,
			"safety_support": 1.1, "transportation": 1.3,
		},
		"hurricane": {
			"communication": 1.1, "medical": 1.3, "independence": 1.2,
			"safety_support": 1.2, "transportation": 1.3,
		},
		"tsunami": {
			"communication": 1.3, "medical": 1.1, "independence": 1.2,
			"safety_support": 1.3, "transportation": 1.4,
		},
		"wildfire": {
			"communication": 1.2, "medical": 1.4, "independence": 1.3,
			"safety_support": 1.2, "transportation": 1.3,
		},
	}
	hazardFactors := multipliers[request.Scenario.Hazard]
	return []NeedEstimate{
		needEstimate(
			"communication",
			"Communication",
			"people needing language or accessible-format support",
			request.Community.LimitedEnglish,
			factors["communication"],
			hazardFactors["communication"],
			"Applies the hazard-specific planning envelope to the ACS limited-English count; provide interpreters, translated alerts, plain language, and accessible formats. This is not a forecast.",
			[]string{"acs-5-year", "cmist-planning-assumptions"},
		),
		needEstimate(
			"medical",
			"Medical",
			"power-dependent people",
			countInputFromProtected(request.MedicalPower),
			factors["medical"],
			hazardFactors["medical"],
			"Applies the hazard-specific planning envelope to the public HHS emPOWER Medicare-only DME count; medication, clinical, refrigeration, and equipment loads still require local validation.",
			[]string{"hhs-empower", "cmist-planning-assumptions"},
		),
		needEstimate(
			"independence",
			"Independence",
			"people needing accessible sleeping or mobility support",
			request.Community.Disability,
			factors["independence"],
			hazardFactors["independence"],
			"Applies a hazard-specific planning envelope to the ACS disability count to size an accessible-cot and mobility-aid review; it does not identify individuals or specific accommodations.",
			[]string{"acs-5-year", "cmist-planning-assumptions"},
		),
		needEstimate(
			"safety_support",
			"Safety & support",
			"people for caregiver, behavioral-health, or safety check-in planning",
			request.Community.BelowPoverty,
			factors["safety_support"],
			hazardFactors["safety_support"],
			"Uses the ACS below-poverty count only as a broad outreach-planning proxy; it is not a measure of caregiver, behavioral-health, or safety need.",
			[]string{"acs-5-year", "cmist-planning-assumptions"},
		),
		needEstimate(
			"transportation",
			"Transportation",
			"accessible transport seat-planning equivalents",
			request.Community.NoVehicleHouseholds,
			factors["transportation"],
			hazardFactors["transportation"],
			"Applies a hazard-specific planning factor to ACS no-vehicle households. Household-equivalent trips are not wheelchair-vehicle availability or a person count.",
			[]string{"acs-5-year", "cmist-planning-assumptions"},
		),
	}
}

func unavailableCMIST(reason string) []NeedEstimate {
	labels := []struct {
		domain string
		label  string
		unit   string
	}{
		{"communication", "Communication", "people needing language or accessible-format support"},
		{"medical", "Medical", "power-dependent people"},
		{"independence", "Independence", "people needing accessible sleeping or mobility support"},
		{"safety_support", "Safety & support", "people for caregiver, behavioral-health, or safety check-in planning"},
		{"transportation", "Transportation", "accessible transport seat-planning equivalents"},
	}
	needs := make([]NeedEstimate, 0, len(labels))
	for _, item := range labels {
		needs = append(needs, NeedEstimate{
			Domain:            item.domain,
			Label:             item.label,
			Status:            "unavailable",
			Unit:              item.unit,
			Basis:             "Aggregate planning population or indicator data is unavailable.",
			Evidence:          []string{"acs-5-year", "cmist-planning-assumptions"},
			UnavailableReason: reason,
		})
	}
	return needs
}

func needEstimate(
	domain string,
	label string,
	unit string,
	input CountInput,
	factors [3]float64,
	hazardMultiplier float64,
	basis string,
	evidence []string,
) NeedEstimate {
	need := NeedEstimate{
		Domain:   domain,
		Label:    label,
		Status:   "modeled",
		Unit:     unit,
		Basis:    basis,
		Evidence: evidence,
	}
	if input.Status != "available" || input.Estimate == nil {
		need.Status = "unavailable"
		need.UnavailableReason = "indicator_unavailable"
		return need
	}
	count := populationRange(*input.Estimate, input.MarginOfError)
	need.Basis = fmt.Sprintf(
		"%s Low/planning/high fractions %.0f%% / %.0f%% / %.0f%%; hazard modifier %.2f for %s.",
		basis,
		factors[0]*100,
		factors[1]*100,
		factors[2]*100,
		hazardMultiplier,
		domain,
	)
	need.Demand = &Range{
		Low:      max(0, ceil(float64(count.Low)*factors[0]*hazardMultiplier)),
		Planning: ceil(float64(count.Planning) * factors[1] * hazardMultiplier),
		High:     ceil(float64(count.High) * factors[2] * hazardMultiplier),
	}
	return need
}

func countInputFromProtected(input ProtectedInput) CountInput {
	if input.Status != "available" || input.Masked || input.Value == nil {
		return CountInput{Status: "unavailable"}
	}
	return CountInput{Status: "available", Estimate: input.Value}
}

func visitorDemandLine(islandID string) Line {
	visitors, ok := map[string]int{
		"oahu":    107_479,
		"maui":    54_500,
		"molokai": 385,
		"lanai":   406,
		"kauai":   28_577,
		"hawaii":  35_640,
	}[islandID]
	if !ok {
		return unavailableLine(
			"stranded_visitors",
			"Visitor shelter and feeding stress test",
			"people",
			"visitor_count_not_published",
			"No 2025 air-arrival average daily visitor census is published for this island.",
			[]string{"dbedt-visitors-2025"},
		)
	}
	return modeledLine(
		"stranded_visitors",
		"Visitor shelter and feeding stress test",
		"people",
		envelopeForCount(visitors),
		nil,
		"Applies the 11% / 23% / 35% mass-care scenario envelope to the 2025 island average daily census by air arrivals. It is not a stranded-person count, exposure estimate, or cruise census.",
		[]string{"dbedt-visitors-2025", "mass-care-scenario-v0.2"},
		[]string{"Visitor census is island-scoped; Molokaʻi and Lānaʻi values are not allocated to a County or added to Maui County."},
	)
}

func homelessnessDemandLine(countyID string) Line {
	count, ok := map[string]int{
		"honolulu": 4_539,
		"hawaii":   696,
		"kauai":    516,
		"maui":     651,
	}[countyID]
	if !ok {
		return unavailableLine(
			"pit_homeless_support",
			"Point-in-Time homelessness shelter and feeding stress test",
			"people",
			"county_count_not_published",
			"A separate 2026 Point-in-Time count is not published for this political county.",
			[]string{"hawaii-pit-2026"},
		)
	}
	return modeledLine(
		"pit_homeless_support",
		"Point-in-Time homelessness shelter and feeding stress test",
		"people",
		envelopeForCount(count),
		nil,
		"Applies the 11% / 23% / 35% mass-care scenario envelope to the dated 2026 one-night Point-in-Time count. It is not a hazard-exposure estimate and is not additive to resident population demand.",
		[]string{"hawaii-pit-2026", "mass-care-scenario-v0.2"},
		[]string{"Maui County count includes Molokaʻi; Kalawao is not separately reported."},
	)
}

func petShelterLine(households CountInput) Line {
	if households.Status != "available" || households.Estimate == nil {
		return unavailableLine(
			"pet_sheltering",
			"Pet-sheltering demand stress test",
			"animal_spaces",
			"household_count_unavailable",
			"ACS household count is required; unavailable is not zero.",
			[]string{"acs-5-year", "appa-pet-rate-2025", "census-households-2024"},
		)
	}
	householdRange := populationRange(*households.Estimate, households.MarginOfError)
	return modeledLine(
		"pet_sheltering",
		"Pet-sheltering demand stress test",
		"animal_spaces",
		Range{
			Low:      ceil(float64(householdRange.Low) * 0.716 * 0.11),
			Planning: ceil(float64(householdRange.Planning) * 0.716 * 0.23),
			High:     ceil(float64(householdRange.High) * 0.716 * 0.35),
		},
		nil,
		"Applies the national 71.6% planning assumption (95 million APPA pet-owning households divided by 132,737,144 U.S. households in 2024 ACS) and the 11% / 23% / 35% mass-care envelope to local ACS households; assumes one animal space per pet-owning household.",
		[]string{"acs-5-year", "appa-pet-rate-2025", "census-households-2024", "mass-care-scenario-v0.2"},
		[]string{"National rate is an assumption, not a Hawaiʻi or local survey; counts exclude service animals, which must remain with handlers."},
	)
}

func powerContinuityLine(input ProtectedInput, outageHours int) Line {
	if input.Status != "available" || input.Masked || input.Value == nil {
		reason := "source_unavailable"
		if input.Masked {
			reason = "privacy_masked"
		}
		return unavailableLine(
			"power_continuity_beneficiary_hours",
			"Power-dependent DME continuity planning",
			"beneficiary_hours",
			reason,
			"HHS emPOWER is Medicare-only aggregate context; privacy-masked or unavailable cells are never converted to zero.",
			[]string{"hhs-empower", "power-outage-planning-assumptions"},
		)
	}
	devices := *input.Value
	return modeledLine(
		"power_continuity_beneficiary_hours",
		"Power-dependent DME continuity planning",
		"beneficiary_hours",
		Range{
			Low:      devices * max(outageHours/2, 1),
			Planning: devices * outageHours,
			High:     devices * outageHours * 2,
		},
		nil,
		fmt.Sprintf("Multiplies the unmasked HHS emPOWER beneficiary count by %d / %d / %d outage hours (low/planning/high). This is a beneficiary-hour planning estimate, not device-hours, generator kilowatts, charging capacity, or verified site demand.", max(outageHours/2, 1), outageHours, outageHours*2),
		[]string{"hhs-empower", "power-outage-planning-assumptions"},
		[]string{"Use the count as a candidate list for charging, generator, and cooling-site planning; equipment loads and individual needs are unknown."},
	)
}

func envelopeForCount(count int) Range {
	return Range{
		Low:      ceil(float64(count) * 0.11),
		Planning: ceil(float64(count) * 0.23),
		High:     ceil(float64(count) * 0.35),
	}
}

func unavailableLines(reason string, medicalPower ProtectedInput) []Line {
	lines := []Line{
		unavailableLine("service_population", "People requiring mass-care services", "people", reason, "Aggregate planning population is required.", []string{"mass-care-scenario-v0.1"}),
		unavailableLine("shelter_spaces", "Shelter service spaces", "people", reason, "Aggregate planning population is required.", []string{"mass-care-scenario-v0.1"}),
		unavailableLine("shelter_floor_area_sq_ft", "Shelter floor area", "square_feet", reason, "Aggregate planning population is required.", []string{"fema-p785"}),
		unavailableLine("cots", "Cots or sleeping places", "cots", reason, "Aggregate planning population is required.", []string{"fema-p785"}),
		unavailableLine("meals", "Meal equivalents", "meals", reason, "Aggregate planning population is required.", []string{"fema-p785"}),
		unavailableLine("potable_water_liters", "Potable water", "liters", reason, "Aggregate planning population is required.", []string{"fema-water"}),
		unavailableLine("sanitation_support", "Sanitation support", "local_planning_factor", "local_assumption_required", "No statewide approved coefficient is encoded.", []string{"hawaii-sesf6-2025"}),
		unavailableLine("shelter_staff", "Role-specific shelter staffing", "staff_by_role", "local_assumption_required", "Staffing must be modeled by role and operating period.", []string{"fema-p785"}),
		unavailableLine(
			"medical_power_support",
			"Medical equipment power continuity",
			"people",
			reason,
			"Aggregate planning population is required before numeric demand lines are produced.",
			[]string{"hhs-empower"},
		),
	}
	return append(lines,
		unavailableLine("accessible_transport", "Accessible transportation", "seats_or_vehicles", "coefficient_unavailable", "No defensible public uptake coefficient is available.", []string{"mass-care-scenario-v0.1"}),
		unavailableLine("medication_refrigeration", "Medication refrigeration", "supported_people_or_units", "coefficient_unavailable", "No defensible public coefficient is available.", []string{"mass-care-scenario-v0.1"}),
		unavailableLine("oxygen_support", "Oxygen continuity support", "supported_people_or_units", "coefficient_unavailable", "No defensible public coefficient is available.", []string{"mass-care-scenario-v0.1"}),
		unavailableLine("backup_power_sites", "Backup-power sites", "sites_or_kilowatts", "coefficient_unavailable", "Facility loads and duration are required.", []string{"mass-care-scenario-v0.1"}),
		unavailableLine(
			"service_animal_population_estimate",
			"Service-animal population estimate",
			"animal_spaces",
			"service_animal_count_not_published",
			"No aggregate service-animal count or defensible population coefficient is available; provisions remain separate from pet demand.",
			[]string{"doj-service-animals"},
		),
		visitorDemandLine("niihau"),
		unavailableLine("pit_homeless_support", "Point-in-Time homelessness shelter and feeding stress test", "people", reason, "Aggregate planning population is required.", []string{"hawaii-pit-2026"}),
		unavailableLine("pet_sheltering", "Pet-sheltering demand stress test", "animal_spaces", reason, "Aggregate planning population is required.", []string{"appa-pet-rate-2025"}),
		unavailableLine("power_continuity_beneficiary_hours", "Power-dependent DME continuity planning", "beneficiary_hours", reason, "Aggregate planning population is required.", []string{"hhs-empower"}),
		unavailableLine("shelter_capacity_gap", "County-published shelter capacity gap", "people", "capacity_not_published", "Modeled demand cannot be compared with County capacity until a public, current capacity source is available.", []string{"county-shelter-capacity"}),
	)
}

func medicalPowerLine(input ProtectedInput) Line {
	switch {
	case input.Status == "unavailable":
		return unavailableLine(
			"medical_power_support",
			"Medical equipment power continuity",
			"supported_people_or_devices",
			"source_unavailable",
			"HHS emPOWER aggregate evidence is unavailable.",
			[]string{"hhs-empower"},
		)
	case input.Masked:
		return unavailableLine(
			"medical_power_support",
			"Medical equipment power continuity",
			"supported_people_or_devices",
			"privacy_masked",
			"The public aggregate cell is privacy-masked and is not converted into a numeric demand.",
			[]string{"hhs-empower"},
		)
	default:
		return modeledLine(
			"medical_power_support",
			"Medical equipment power continuity",
			"people",
			Range{Low: *input.Value, Planning: *input.Value, High: *input.Value},
			nil,
			"Uses the unmasked HHS emPOWER power-dependent DME beneficiary count as a candidate population, not a verified incident need or all-age estimate.",
			[]string{"hhs-empower"},
			[]string{"Medicare-only aggregate context; validate equipment type, duration, batteries, caregiver support, and other-age needs locally."},
		)
	}
}

func populationRange(estimate int, marginOfError *int) Range {
	margin := 0
	if marginOfError != nil {
		margin = *marginOfError
	}
	return Range{
		Low:      max(estimate-margin, 0),
		Planning: estimate,
		High:     estimate + margin,
	}
}

func scaleRange(value Range, multiplier int) Range {
	return Range{
		Low:      value.Low * multiplier,
		Planning: value.Planning * multiplier,
		High:     value.High * multiplier,
	}
}

func shelterAreaRange(population Range, standard string) Range {
	if standard == "evacuation" {
		return scaleRange(population, 20)
	}
	return Range{
		Low:      population.Low * 40,
		Planning: population.Planning * 50,
		High:     population.High * 60,
	}
}

func shelterAreaLabel(standard string) string {
	if standard == "evacuation" {
		return "Evacuation shelter floor area"
	}
	return "Short-term shelter floor area"
}

func shelterAreaBasis(standard string) string {
	if standard == "evacuation" {
		return "Uses 20 square feet per modeled person for short-duration evacuation shelter planning."
	}
	return "Uses 40 / 50 / 60 square feet per modeled person for short-term shelter planning."
}

func waterRange(population Range, days int) Range {
	return Range{
		Low:      ceil(float64(population.Low) * 3.0 * float64(days)),
		Planning: ceil(float64(population.Planning) * 3.4 * float64(days)),
		High:     ceil(float64(population.High) * 3.785 * float64(days)),
	}
}

func assumptions(scenario ScenarioInput) []Assumption {
	return []Assumption{
		{
			ID:       "mass-care-service-envelope",
			Label:    "Mass-care service population",
			Unit:     "share_of_aggregate_population",
			Values:   []float64{0.11, 0.23, 0.35},
			Basis:    "Versioned low, planning, and high stress-test assumptions; not an observed uptake rate.",
			Evidence: []string{"hawaii-sesf6-2025", "mass-care-scenario-v0.1"},
		},
		{
			ID:       "service-duration",
			Label:    "Service duration",
			Unit:     "days",
			Values:   []float64{float64(scenario.ServiceDays)},
			Basis:    "Planner-selected bounded duration.",
			Evidence: []string{"mass-care-scenario-v0.1"},
		},
		{
			ID:       "visitor-and-pit-stress-envelope",
			Label:    "Visitor and Point-in-Time cohort stress envelope",
			Unit:     "share_of_cohort",
			Values:   []float64{0.11, 0.23, 0.35},
			Basis:    "Applies the general mass-care scenario envelope to separately sourced visitor and homelessness reference cohorts; not a hazard exposure forecast.",
			Evidence: []string{"dbedt-visitors-2025", "hawaii-pit-2026", "mass-care-scenario-v0.2"},
		},
		{
			ID:       "pet-ownership-rate",
			Label:    "National pet-owning household assumption",
			Unit:     "share_of_households",
			Values:   []float64{0.716},
			Basis:    "Derived as APPA's 95 million pet-owning households divided by the 2024 ACS national household estimate of 132,737,144.",
			Evidence: []string{"appa-pet-rate-2025", "census-households-2024"},
		},
		{
			ID:       "power-outage-hours",
			Label:    "Power outage planning window",
			Unit:     "beneficiary_hours_per_emPOWER_count",
			Values:   []float64{float64(max(scenario.OutageHours/2, 1)), float64(scenario.OutageHours), float64(scenario.OutageHours * 2)},
			Basis:    "Planner-selected central duration with half-duration and double-duration stress bounds; not an outage forecast.",
			Evidence: []string{"power-outage-planning-assumptions"},
		},
	}
}

func evidenceSources(empowerDate string) []EvidenceSource {
	if empowerDate == "" {
		empowerDate = "upstream date not reported"
	}
	return []EvidenceSource{
		{
			ID:         "acs-5-year",
			Title:      "2020–2024 American Community Survey 5-year estimates",
			Authority:  "U.S. Census Bureau",
			URL:        "https://api.census.gov/data/2024/acs/acs5.html",
			DataDate:   "2020–2024",
			ReviewedAt: "2026-10-29",
			FreshUntil: "2027-01-27",
			Use:        "Aggregate tract population and indicators, including household counts, estimates, and margins of error.",
		},
		{
			ID:         "hawaii-sesf6-2025",
			Title:      "State Emergency Support Function #6 Annex",
			Authority:  "Hawaiʻi Emergency Management Agency",
			URL:        "https://dod.hawaii.gov/hiema/files/2025/10/SESF6-Annex_30SEP25.pdf",
			DataDate:   "2025-09-30",
			ReviewedAt: "2026-10-26",
			FreshUntil: "2027-01-24",
			Use:        "Mass-care scope, roles, and the requirement to identify resource shortfalls; not a demand forecast.",
		},
		{
			ID:         "fema-p785",
			Title:      "Shelter Field Guide FEMA P-785",
			Authority:  "Federal Emergency Management Agency",
			URL:        "https://nationalmasscarestrategy.org/wp-content/uploads/2015/10/Shelter-Field-Guide-508_f3.pdf",
			DataDate:   "2015",
			ReviewedAt: "2026-10-26",
			FreshUntil: "2027-01-24",
			Use:        "Shelter space, sleeping-place, meal, and role-based operating considerations.",
		},
		{
			ID:         "fema-water",
			Title:      "Food and Water in an Emergency",
			Authority:  "Federal Emergency Management Agency",
			URL:        "https://www.fema.gov/pdf/library/f%26web.pdf",
			DataDate:   "2014",
			ReviewedAt: "2026-10-26",
			FreshUntil: "2027-01-24",
			Use:        "Potable-water planning context; the model excludes sanitation, clinical, food-production, and animal loads.",
		},
		{
			ID:         "hhs-empower",
			Title:      "HHS emPOWER public aggregate data",
			Authority:  "U.S. Department of Health and Human Services",
			URL:        "https://empowerprogram.hhs.gov/",
			DataDate:   empowerDate,
			ReviewedAt: "2026-10-26",
			FreshUntil: "2027-01-24",
			Use:        "Medicare-only aggregate context with privacy masking; never a person-level registry or equipment-demand coefficient.",
		},
		{
			ID:         "mass-care-scenario-v0.1",
			Title:      "Hawaiʻi Mass Care Planner scenario assumptions",
			Authority:  "Planner model",
			URL:        "https://github.com/chokevin/hawaii-resilience-map",
			DataDate:   "2026-10-29",
			ReviewedAt: "2026-10-26",
			FreshUntil: "2027-01-24",
			Use:        "Explicit versioned stress-test assumptions used where no observed incident-specific demand rate is available.",
		},
		{
			ID:         "doj-service-animals",
			Title:      "Service Animals and the ADA",
			Authority:  "U.S. Department of Justice",
			URL:        "https://www.ada.gov/resources/service-animals-2010-requirements/",
			DataDate:   "2010-03-15",
			ReviewedAt: "2026-10-29",
			FreshUntil: "2027-01-27",
			Use:        "Service-animal accessibility context; not a service-animal population estimate.",
		},
		{
			ID:         "cmist-planning-assumptions",
			Title:      "CMIST hazard planning assumptions",
			Authority:  "Planner model",
			URL:        "https://github.com/chokevin/hawaii-resilience-map",
			DataDate:   "2026-10-29",
			ReviewedAt: "2026-10-29",
			FreshUntil: "2027-01-27",
			Use:        "Transparent, unvalidated hazard modifiers for low/planning/high stress tests; not observed need rates.",
		},
		{
			ID:         "dbedt-visitors-2025",
			Title:      "2025 Annual Visitor Research Report, Table 8: Average Daily Census by Island",
			Authority:  "Hawaiʻi Department of Business, Economic Development & Tourism",
			URL:        "https://files.hawaii.gov/dbedt/economic/tourism/annual-reports/2025-annual-visitor.xlsx",
			DataDate:   "2025",
			ReviewedAt: "2026-10-29",
			FreshUntil: "2027-04-06",
			Use:        "Island average daily visitor census for air arrivals. It is not a stranded-person count and excludes cruise visitor census.",
		},
		{
			ID:         "hawaii-pit-2026",
			Title:      "2026 Hawaiʻi Homeless Point-in-Time Count reports",
			Authority:  "Hawaiʻi Department of Human Services; Bridging the Gap; Partners in Care",
			URL:        "https://humanservices.hawaii.gov/annual-homeless-persons-point-in-time-count-pit-report/",
			DataDate:   "2026-01-25",
			ReviewedAt: "2026-10-29",
			FreshUntil: "2027-01-25",
			Use:        "Dated one-night counts: Oʻahu 4,539; Hawaiʻi Island 696; Kauaʻi 516; Maui County 651. Kalawao is not separately reported.",
		},
		{
			ID:         "appa-pet-rate-2025",
			Title:      "2025 APPA National Pet Owners Survey statistics",
			Authority:  "American Pet Products Association",
			URL:        "https://americanpetproducts.org/industry-trends-and-stats",
			DataDate:   "2025",
			ReviewedAt: "2026-10-29",
			FreshUntil: "2027-01-27",
			Use:        "Reports 95 million U.S. households own a pet; combined with the 2024 ACS denominator to derive a national planning assumption, not a local rate.",
		},
		{
			ID:         "census-households-2024",
			Title:      "ACS 2024 1-year, Table B11001: Household Type",
			Authority:  "U.S. Census Bureau",
			URL:        "https://data.census.gov/table/ACSDT1Y2024.B11001?g=010XX00US",
			DataDate:   "2024",
			ReviewedAt: "2026-10-29",
			FreshUntil: "2027-01-27",
			Use:        "National household denominator used only to derive the APPA national pet-ownership assumption.",
		},
		{
			ID:         "power-outage-planning-assumptions",
			Title:      "Power continuity outage-duration planning assumption",
			Authority:  "Planner model",
			URL:        "https://github.com/chokevin/hawaii-resilience-map",
			DataDate:   "2026-10-29",
			ReviewedAt: "2026-10-29",
			FreshUntil: "2027-01-27",
			Use:        "Planner-selected duration with half/double bounds for emPOWER beneficiary-hour stress tests; not a forecast or generator-sizing standard.",
		},
		{
			ID:         "county-shelter-capacity",
			Title:      "County shelter planning references and disclosed data gaps",
			Authority:  "County emergency-management plans",
			URL:        "https://dod.hawaii.gov/hiema/files/2025/10/SESF6-Annex_30SEP25.pdf",
			DataDate:   "2025-09-30",
			ReviewedAt: "2026-10-29",
			FreshUntil: "2027-01-27",
			Use:        "Current County-published capacities/openings were not found in reviewed public planning references; reported as not published, never zero.",
		},
	}
}

func calculationID(request Request) string {
	encoded, err := json.Marshal(request)
	if err != nil {
		panic(fmt.Sprintf("marshal validated resource-demand request: %v", err))
	}
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:8])
}

func ceil(value float64) int {
	return int(math.Ceil(value))
}
