package resourcedemand

import (
	"context"
	"reflect"
	"testing"
	"time"
)

func TestScreeningOnlyCommunityIDsAcceptedWithoutSyntheticSupply(t *testing.T) {
	for _, id := range []string{"molokai-kaunakakai", "lanai-city", "molokai-kalaupapa"} {
		t.Run(id, func(t *testing.T) {
			request := validRequest()
			request.Geography.ID = id
			request.PracticeSupplies = nil
			response, err := NewCalculator().Calculate(context.Background(), request)
			if err != nil || response.Geography.ID != id {
				t.Fatalf("screening geography rejected: %#v %v", response, err)
			}
			for _, line := range response.Lines {
				if line.Supply != nil && line.Supply.AppliedQuantity != 0 {
					t.Fatal("invented supply for screening geography")
				}
			}
		})
	}
}

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
	if power := findLine(t, response.Lines, "power_continuity_beneficiary_hours"); power.Demand != nil {
		t.Fatalf("masked emPOWER cell produced numeric continuity estimate: %#v", power)
	}
	if response.CMIST[1].Status != "unavailable" || response.CMIST[1].Demand != nil {
		t.Fatalf("masked emPOWER cell produced numeric medical need: %#v", response.CMIST[1])
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
	if len(response.CMIST) != 5 {
		t.Fatalf("CMIST needs = %d, want all five domains", len(response.CMIST))
	}
}

func TestCMISTCoverageAcrossHazardsAndCounties(t *testing.T) {
	counties := []struct {
		id     string
		island string
	}{
		{"honolulu", "oahu"},
		{"maui", "maui"},
		{"hawaii", "hawaii"},
		{"kauai", "kauai"},
		{"kalawao", "molokai"},
	}
	hazards := []string{"hurricane", "flood", "tsunami", "wildfire"}
	for _, county := range counties {
		for _, hazard := range hazards {
			request := validRequest()
			request.Geography.CountyID = county.id
			request.Geography.IslandID = county.island
			request.Scenario.Hazard = hazard
			response, err := NewCalculator().Calculate(context.Background(), request)
			if err != nil {
				t.Fatalf("calculate county=%s hazard=%s: %v", county.id, hazard, err)
			}
			if len(response.CMIST) != 5 {
				t.Fatalf("county=%s hazard=%s has %d CMIST domains", county.id, hazard, len(response.CMIST))
			}
			for _, need := range response.CMIST {
				if need.Status != "modeled" || need.Demand == nil ||
					need.Demand.Low > need.Demand.Planning ||
					need.Demand.Planning > need.Demand.High {
					t.Fatalf("invalid CMIST estimate county=%s hazard=%s: %#v", county.id, hazard, need)
				}
				if need.Basis == "" || len(need.Evidence) == 0 {
					t.Fatalf("CMIST estimate missing assumptions or evidence: %#v", need)
				}
			}
			if response.CountyCapacity.Status != "not_published" ||
				response.CountyCapacity.Capacity != nil {
				t.Fatalf("unknown shelter capacity must remain not published, got %#v", response.CountyCapacity)
			}
			if county.id == "kalawao" {
				line := findLine(t, response.Lines, "pit_homeless_support")
				if line.Status != "unavailable" || line.Demand != nil {
					t.Fatalf("Kalawao PIT must remain unavailable, got %#v", line)
				}
			}
		}
	}
}

func TestPublicDemandLinesAndPowerDurationAreExplicit(t *testing.T) {
	request := validRequest()
	response, err := NewCalculator().Calculate(context.Background(), request)
	if err != nil {
		t.Fatalf("calculate response: %v", err)
	}
	if got := findLine(t, response.Lines, "stranded_visitors").Demand; got == nil ||
		got.Planning != ceil(107_479*0.23) {
		t.Fatalf("visitor demand does not use sourced Oʻahu census: %#v", got)
	}
	if got := findLine(t, response.Lines, "pit_homeless_support").Demand; got == nil ||
		got.Planning != ceil(4_539*0.23) {
		t.Fatalf("PIT demand does not use sourced Oʻahu count: %#v", got)
	}
	if got := findLine(t, response.Lines, "pet_sheltering").Demand; got == nil ||
		got.Planning != ceil(900*0.716*0.23) {
		t.Fatalf("pet demand does not use national rate and household count: %#v", got)
	}
	if got := findLine(t, response.Lines, "power_continuity_beneficiary_hours").Demand; got == nil ||
		*got != (Range{Low: 144, Planning: 288, High: 576}) {
		t.Fatalf("power continuity did not apply outage duration: %#v", got)
	}
	capacityGap := findLine(t, response.Lines, "shelter_capacity_gap")
	if capacityGap.Status != "unavailable" ||
		capacityGap.UnavailableReason != "capacity_not_published" ||
		capacityGap.Demand != nil {
		t.Fatalf("unpublished County capacity must not become a numeric gap: %#v", capacityGap)
	}
	if len(response.ServiceAnimalProvisions) < 1 {
		t.Fatal("expected service-animal provisions")
	}
	sourceDates := map[string]string{}
	for _, source := range response.Sources {
		sourceDates[source.ID] = source.DataDate
	}
	if sourceDates["dbedt-visitors-2025"] != "2025" ||
		sourceDates["hawaii-pit-2026"] != "2026-01-25" ||
		sourceDates["appa-pet-rate-2025"] != "2025" ||
		sourceDates["hhs-empower"] != "2026-10-29" {
		t.Fatalf("dated public-source citations missing: %#v", sourceDates)
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
			Status:     "available",
			Value:      &medicalPower,
			SourceID:   "hhs-empower",
			SourceDate: "2026-10-29",
		},
		Scenario: ScenarioInput{
			ServiceDays:     3,
			ShelterStandard: "evacuation",
			Hazard:          "hurricane",
			OutageHours:     24,
		},
		Community: CommunityInputs{
			Households:          countInput(900, 80),
			LimitedEnglish:      countInput(150, 40),
			Disability:          countInput(220, 50),
			BelowPoverty:        countInput(120, 35),
			NoVehicleHouseholds: countInput(80, 15),
		},
		PracticeSupplies: []SupplyInput{},
	}
	request.Geography.ID = "oahu-town"
	request.Geography.Kind = "planning_area"
	request.Geography.CountyID = "honolulu"
	request.Geography.IslandID = "oahu"
	return request
}

func countInput(estimate int, margin int) CountInput {
	return CountInput{
		Status:        "available",
		Estimate:      &estimate,
		MarginOfError: &margin,
	}
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
