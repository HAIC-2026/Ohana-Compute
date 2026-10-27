package groundedplanning

import (
	"context"
	"errors"
	"time"
)

type FakeProvider struct {
	Draft ProviderDraft
	Err   error
	Delay time.Duration
}

func (provider *FakeProvider) Class() string {
	return "deterministic-fake"
}

func (provider *FakeProvider) Generate(
	ctx context.Context,
	requestContext Context,
) (ProviderDraft, error) {
	if provider.Delay > 0 {
		timer := time.NewTimer(provider.Delay)
		defer timer.Stop()
		select {
		case <-ctx.Done():
			return ProviderDraft{}, ctx.Err()
		case <-timer.C:
		}
	}
	if provider.Err != nil {
		return ProviderDraft{}, provider.Err
	}
	if len(provider.Draft.Sections) > 0 {
		return provider.Draft, nil
	}
	if len(requestContext.Context.Evidence) == 0 {
		return ProviderDraft{}, errors.New("fake provider requires evidence")
	}
	sourceID := requestContext.Context.Evidence[0].SourceID
	return ProviderDraft{
		Sections: []ProviderSection{{
			ID:      "evidence_review",
			Heading: "Evidence review",
			Claims: []ProviderClaim{{
				Text:      "Available aggregate planning evidence supports a focused human review of unmet needs.",
				Citations: []string{sourceID},
			}},
		}},
		Actions: []ProviderAction{{
			ID:        "confirm_conditions",
			Text:      "Confirm current conditions and accountable owners before changing the plan.",
			Citations: []string{sourceID},
		}},
		Uncertainty: []string{
			"Current operational availability is not established by this planning evidence.",
		},
		Gaps: slicesOrDefault(requestContext.Context.Gaps),
	}, nil
}

func slicesOrDefault(values []string) []string {
	if len(values) > 0 {
		return []string{values[0]}
	}
	return []string{"No current operational feed was included."}
}
