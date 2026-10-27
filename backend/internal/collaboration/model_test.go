package collaboration

import "testing"

func TestValidateCreateRejectsCaseDataAcrossPlanningText(t *testing.T) {
	t.Parallel()

	tests := map[string]func(*CreateInput){
		"title": func(input *CreateInput) {
			input.Title = "Patient staging plan"
		},
		"summary": func(input *CreateInput) {
			input.Summary = "Coordinate support for the resident name in the case file."
		},
		"checklist": func(input *CreateInput) {
			input.Snapshot.Checklist[0].Title = "Confirm home address"
		},
		"output": func(input *CreateInput) {
			input.Snapshot.Outputs[0].Summary = "Medical record review"
		},
		"phone": func(input *CreateInput) {
			input.Summary = "Call 808-555-1212 before the briefing."
		},
		"address": func(input *CreateInput) {
			input.Summary = "Meet at 123 Main Street before the briefing."
		},
		"labeled name": func(input *CreateInput) {
			input.Summary = "Resident name: Example Person"
		},
	}

	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			input := fixtureCreateInput()
			mutate(&input)
			if err := ValidateCreate(input); err == nil {
				t.Fatal("ValidateCreate() accepted case data")
			}
		})
	}
}

func TestValidateCreateRejectsUncontrolledProviderContextReferences(t *testing.T) {
	t.Parallel()

	tests := map[string]func(*CreateInput){
		"jurisdiction": func(input *CreateInput) {
			input.Jurisdiction = "Private jurisdiction name"
		},
		"area reference": func(input *CreateInput) {
			input.AreaRef = "123 Main Street"
		},
		"event reference": func(input *CreateInput) {
			input.EventRef = "Private event description"
		},
	}

	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			input := fixtureCreateInput()
			mutate(&input)
			if err := ValidateCreate(input); err == nil {
				t.Fatal("ValidateCreate() accepted an uncontrolled reference")
			}
		})
	}
}
