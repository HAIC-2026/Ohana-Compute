package partnermatching

import (
	"context"
	"testing"
	"time"
)

func TestMatcherReturnsSourcedNonOperationalAssociations(t *testing.T) {
	t.Parallel()

	matcher := Matcher{
		Now: func() time.Time {
			return time.Date(2026, time.October, 27, 0, 0, 0, 0, time.UTC)
		},
	}
	response, err := matcher.Match(context.Background(), Query{
		JurisdictionID: "honolulu",
		Capabilities: []string{
			"sheltering",
			"feeding-production",
			"pet-service-animal-support",
		},
	})
	if err != nil {
		t.Fatalf("Match returned error: %v", err)
	}

	if response.Status != "partial" {
		t.Fatalf("status = %q, want partial", response.Status)
	}
	if response.Summary.MatchedCapabilities != 2 ||
		response.Summary.UnmatchedCapabilities != 1 {
		t.Fatalf("unexpected summary: %#v", response.Summary)
	}
	sheltering := response.Matches[0]
	if sheltering.Status != "matched" || len(sheltering.Partners) != 2 {
		t.Fatalf("unexpected sheltering match: %#v", sheltering)
	}
	if sheltering.Partners[0].ID != "honolulu-dem" {
		t.Fatalf("local County role was not ranked first: %#v", sheltering.Partners)
	}
	for _, match := range response.Matches {
		for _, partner := range match.Partners {
			if partner.OperationalStatus != "not_validated" ||
				partner.CapacityStatus != "not_reported" ||
				partner.ActivationStatus != "not_reported" {
				t.Fatalf("partner implies operational validation: %#v", partner)
			}
			if partner.Evidence.SourceURL == "" ||
				partner.Evidence.Claim == "" ||
				partner.Evidence.Freshness != "fresh" {
				t.Fatalf("partner lacks fresh provenance: %#v", partner)
			}
		}
	}
}

func TestMatcherPreservesGeographicScope(t *testing.T) {
	t.Parallel()

	matcher := Matcher{
		Now: func() time.Time {
			return time.Date(2026, time.October, 27, 0, 0, 0, 0, time.UTC)
		},
	}
	response, err := matcher.Match(context.Background(), Query{
		JurisdictionID: "maui",
		Capabilities:   []string{"feeding-production"},
	})
	if err != nil {
		t.Fatalf("Match returned error: %v", err)
	}
	if len(response.Matches[0].Partners) != 1 {
		t.Fatalf("Maui feeding partners = %#v", response.Matches[0].Partners)
	}
	if response.Matches[0].Partners[0].ID != "salvation-army-hawaii" {
		t.Fatalf("unsupported Foodbank geography leaked into Maui: %#v", response.Matches[0].Partners)
	}
}

func TestMatcherDisablesStaleAssociations(t *testing.T) {
	t.Parallel()

	matcher := Matcher{
		Now: func() time.Time {
			return time.Date(2028, time.January, 1, 0, 0, 0, 0, time.UTC)
		},
	}
	response, err := matcher.Match(context.Background(), Query{
		JurisdictionID: "kauai",
		Capabilities:   []string{"information-referral", "sheltering"},
	})
	if err != nil {
		t.Fatalf("Match returned error: %v", err)
	}
	if response.Status != "unavailable" {
		t.Fatalf("status = %q, want unavailable", response.Status)
	}
	for _, match := range response.Matches {
		if match.Status != "stale" || len(match.Partners) != 0 {
			t.Fatalf("stale association remained matchable: %#v", match)
		}
	}
}

func TestValidateRejectsUnboundedQueries(t *testing.T) {
	t.Parallel()

	tests := []Query{
		{JurisdictionID: "oahu", Capabilities: []string{"sheltering"}},
		{JurisdictionID: "honolulu", Capabilities: nil},
		{JurisdictionID: "honolulu", Capabilities: []string{"free text"}},
		{
			JurisdictionID: "honolulu",
			Capabilities:   []string{"sheltering", "sheltering"},
		},
	}
	for _, query := range tests {
		if err := Validate(query); err == nil {
			t.Fatalf("Validate(%#v) succeeded", query)
		}
	}
}
