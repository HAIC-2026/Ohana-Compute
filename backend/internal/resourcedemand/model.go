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
)

const (
	RequestSchemaVersion  = "resource-demand-request.v1"
	ResponseSchemaVersion = "resource-demand-response.v1"
	ModelVersion          = "mass-care-demand-v0.1"
	AssumptionVersion     = "hawaii-mass-care-scenario-v0.1"
)

var geographyIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)

type SourceInput struct {
	ID        string `json:"id"`
	Freshness string `json:"freshness"`
}

type PopulationInput struct {
	Status        string      `json:"status"`
	Estimate      *int        `json:"estimate,omitempty"`
	MarginOfError *int        `json:"margin_of_error,omitempty"`
	Source        SourceInput `json:"source"`
}

type ProtectedInput struct {
	Status   string `json:"status"`
	Value    *int   `json:"value,omitempty"`
	Masked   bool   `json:"masked"`
	SourceID string `json:"source_id"`
}

type ScenarioInput struct {
	ServiceDays     int    `json:"service_days"`
	ShelterStandard string `json:"shelter_standard"`
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
		ID   string `json:"id"`
		Kind string `json:"kind"`
	} `json:"geography"`
	Population       PopulationInput `json:"population"`
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

type Response struct {
	SchemaVersion     string `json:"schema_version"`
	ModelVersion      string `json:"model_version"`
	AssumptionVersion string `json:"assumption_version"`
	CalculationID     string `json:"calculation_id"`
	Status            string `json:"status"`
	Geography         struct {
		ID   string `json:"id"`
		Kind string `json:"kind"`
	} `json:"geography"`
	Population        PopulationEvidence `json:"population"`
	Scenario          ScenarioInput      `json:"scenario"`
	Assumptions       []Assumption       `json:"assumptions"`
	Lines             []Line             `json:"lines"`
	SupplyAssessments []SupplyAssessment `json:"supply_assessments"`
	Sources           []EvidenceSource   `json:"sources"`
	Disclaimers       []string           `json:"disclaimers"`
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
		Population: PopulationEvidence{
			Status:        request.Population.Status,
			Estimate:      request.Population.Estimate,
			MarginOfError: request.Population.MarginOfError,
			Source:        request.Population.Source,
		},
		Scenario:    request.Scenario,
		Assumptions: assumptions(request.Scenario),
		Sources:     evidenceSources(),
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
			"pet_service_animal_spaces",
			"Pet and service-animal spaces",
			"animal_spaces",
			"coefficient_unavailable",
			"No authorized aggregate animal-demand factor is available for this planning geography.",
			[]string{"mass-care-scenario-v0.1"},
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
		medicalPowerLine(medicalPower),
	}
	return append(lines,
		unavailableLine("accessible_transport", "Accessible transportation", "seats_or_vehicles", "coefficient_unavailable", "No defensible public uptake coefficient is available.", []string{"mass-care-scenario-v0.1"}),
		unavailableLine("medication_refrigeration", "Medication refrigeration", "supported_people_or_units", "coefficient_unavailable", "No defensible public coefficient is available.", []string{"mass-care-scenario-v0.1"}),
		unavailableLine("oxygen_support", "Oxygen continuity support", "supported_people_or_units", "coefficient_unavailable", "No defensible public coefficient is available.", []string{"mass-care-scenario-v0.1"}),
		unavailableLine("backup_power_sites", "Backup-power sites", "sites_or_kilowatts", "coefficient_unavailable", "Facility loads and duration are required.", []string{"mass-care-scenario-v0.1"}),
		unavailableLine("pet_service_animal_spaces", "Pet and service-animal spaces", "animal_spaces", "coefficient_unavailable", "No authorized aggregate factor is available.", []string{"mass-care-scenario-v0.1"}),
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
		return unavailableLine(
			"medical_power_support",
			"Medical equipment power continuity",
			"supported_people_or_devices",
			"local_assumption_required",
			"HHS emPOWER is Medicare-only aggregate context; equipment type, duration, batteries, and caregiver support require local validation.",
			[]string{"hhs-empower"},
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
	}
}

func evidenceSources() []EvidenceSource {
	return []EvidenceSource{
		{
			ID:         "hawaii-sesf6-2025",
			Title:      "State Emergency Support Function #6 Annex",
			Authority:  "Hawaiʻi Emergency Management Agency",
			URL:        "https://dod.hawaii.gov/hiema/files/2025/10/SESF6-Annex_30SEP25.pdf",
			ReviewedAt: "2026-10-26",
			FreshUntil: "2027-01-24",
			Use:        "Mass-care scope, roles, and the requirement to identify resource shortfalls; not a demand forecast.",
		},
		{
			ID:         "fema-p785",
			Title:      "Shelter Field Guide FEMA P-785",
			Authority:  "Federal Emergency Management Agency",
			URL:        "https://nationalmasscarestrategy.org/wp-content/uploads/2015/10/Shelter-Field-Guide-508_f3.pdf",
			ReviewedAt: "2026-10-26",
			FreshUntil: "2027-01-24",
			Use:        "Shelter space, sleeping-place, meal, and role-based operating considerations.",
		},
		{
			ID:         "fema-water",
			Title:      "Food and Water in an Emergency",
			Authority:  "Federal Emergency Management Agency",
			URL:        "https://www.fema.gov/pdf/library/f%26web.pdf",
			ReviewedAt: "2026-10-26",
			FreshUntil: "2027-01-24",
			Use:        "Potable-water planning context; the model excludes sanitation, clinical, food-production, and animal loads.",
		},
		{
			ID:         "hhs-empower",
			Title:      "HHS emPOWER public aggregate data",
			Authority:  "U.S. Department of Health and Human Services",
			URL:        "https://empowerprogram.hhs.gov/",
			ReviewedAt: "2026-10-26",
			FreshUntil: "2027-01-24",
			Use:        "Medicare-only aggregate context with privacy masking; never a person-level registry or equipment-demand coefficient.",
		},
		{
			ID:         "mass-care-scenario-v0.1",
			Title:      "Hawaiʻi Mass Care Planner scenario assumptions",
			Authority:  "Planner model",
			URL:        "https://github.com/chokevin/hawaii-resilience-map",
			ReviewedAt: "2026-10-26",
			FreshUntil: "2027-01-24",
			Use:        "Explicit versioned stress-test assumptions used where no observed incident-specific demand rate is available.",
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
