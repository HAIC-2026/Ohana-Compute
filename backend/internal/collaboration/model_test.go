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
