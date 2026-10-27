package resourcedemand

import (
	"context"
	"reflect"
	"testing"
	"time"
)

func TestCalculateIsDeterministicAndAppliesOnlyMatchedSupply(t *testing.T) {
	request := validRequest()
	request.PracticeSupplies = []SupplyInput{
		{
			Category:         "shelter_spaces",
			Unit:             "people",
			Quantity:         120,
			GeographyID:      "oahu-town",
			ValidationStatus: "practice_confirmed",
		},
		{
			Category:         "shelter_spaces",
			Unit:             "people",
			Quantity:         90,
			GeographyID:      "maui-central",
			ValidationStatus: "practice_confirmed",
		},
		{
			Category:         "meals",
			Unit:             "liters",
			Quantity:         300,
			GeographyID:      "oahu-town",
			ValidationStatus: "practice_confirmed",
		},
	}

	calculator := NewCalculator()
	first, err := calculator.Calculate(context.Background(), request)
	if err != nil {
		t.Fatalf("calculate first response: %v", err)
	}
	second, err := calculator.Calculate(context.Background(), request)
	if err != nil {
		t.Fatalf("calculate second response: %v", err)
	}
	if !reflect.DeepEqual(first, second) {
		t.Fatal("identical requests must produce identical responses")
	}

	shelter := findLine(t, first.Lines, "shelter_spaces")
	if shelter.Supply == nil || shelter.Supply.AppliedQuantity != 120 {
		t.Fatalf("expected 120 matched practice spaces, got %#v", shelter.Supply)
	}
	if shelter.Gap == nil || shelter.Demand == nil {
		t.Fatal("expected shelter demand and gap")
	}
	if shelter.Gap.Planning != shelter.Demand.Planning-120 {
		t.Fatalf(
			"expected matched supply to reduce planning gap: demand=%d gap=%d",
			shelter.Demand.Planning,
			shelter.Gap.Planning,
		)
	}
	reasons := map[string]bool{}
	for _, assessment := range first.SupplyAssessments {
		reasons[assessment.Reason] = true
	}
	if !reasons["geography_mismatch"] || !reasons["unit_mismatch"] {
		t.Fatalf("expected excluded mismatch reasons, got %#v", first.SupplyAssessments)
	}
}

func TestCalculatePropagatesPopulationUncertaintyAndPrivacyMasking(t *testing.T) {
	request := validRequest()
	request.MedicalPower = ProtectedInput{
		Status:   "available",
		Masked:   true,
		SourceID: "hhs-empower",
	}

	response, err := NewCalculator().Calculate(context.Background(), request)
	if err != nil {
		t.Fatalf("calculate response: %v", err)
	}
	if response.Population.Range == nil {
		t.Fatal("expected population range")
	}
	if got, want := *response.Population.Range, (Range{Low: 900, Planning: 1000, High: 1100}); got != want {
		t.Fatalf("population range = %#v, want %#v", got, want)
	}
	servicePopulation := findLine(t, response.Lines, "service_population")
	if got, want := *servicePopulation.Demand, (Range{Low: 99, Planning: 230, High: 385}); got != want {
		t.Fatalf("service demand = %#v, want %#v", got, want)
	}
	medicalPower := findLine(t, response.Lines, "medical_power_support")
	if medicalPower.Status != "unavailable" ||
		medicalPower.UnavailableReason != "privacy_masked" {
		t.Fatalf("masked medical power line = %#v", medicalPower)
	}
}

func TestCalculateReturnsUnavailableInsteadOfZeroForMissingPopulation(t *testing.T) {
	request := validRequest()
	request.Population = PopulationInput{
		Status: "unavailable",
		Source: SourceInput{ID: "unavailable", Freshness: "unavailable"},
	}

	response, err := NewCalculator().Calculate(context.Background(), request)
	if err != nil {
		t.Fatalf("calculate response: %v", err)
	}
	if response.Status != "unavailable" {
		t.Fatalf("status = %q, want unavailable", response.Status)
	}
	for _, line := range response.Lines {
		if line.Demand != nil || line.Gap != nil {
			t.Fatalf("missing population produced numeric line %#v", line)
		}
	}
}

func TestCalculateAverageStaysBelowOneMillisecond(t *testing.T) {
	request := validRequest()
	calculator := NewCalculator()
	const iterations = 2000
	started := time.Now()
	for range iterations {
		if _, err := calculator.Calculate(context.Background(), request); err != nil {
			t.Fatalf("calculate response: %v", err)
		}
	}
	average := time.Since(started) / iterations
	if average >= time.Millisecond {
		t.Fatalf("average calculation latency %s must stay below 1ms", average)
	}
}

func validRequest() Request {
	estimate := 1000
	margin := 100
	medicalPower := 12
	request := Request{
		SchemaVersion: RequestSchemaVersion,
		Population: PopulationInput{
			Status:        "available",
			Estimate:      &estimate,
			MarginOfError: &margin,
			Source: SourceInput{
				ID:        "acs-5-year",
				Freshness: "fresh",
			},
		},
		MedicalPower: ProtectedInput{
			Status:   "available",
			Value:    &medicalPower,
			SourceID: "hhs-empower",
		},
		Scenario: ScenarioInput{
			ServiceDays:     3,
			ShelterStandard: "evacuation",
		},
		PracticeSupplies: []SupplyInput{},
	}
	request.Geography.ID = "oahu-town"
	request.Geography.Kind = "planning_area"
	return request
}

func findLine(t *testing.T, lines []Line, id string) Line {
	t.Helper()
	for _, line := range lines {
		if line.ID == id {
			return line
		}
	}
	t.Fatalf("line %q not found", id)
	return Line{}
}
