package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/operationalstatus"
)

func shelterContextFixture() (lifecycleEvidenceResult[operationalstatus.Snapshot], time.Time) {
	now := time.Date(2026, 10, 30, 16, 0, 0, 0, time.UTC)
	capacity := 85
	return lifecycleEvidenceResult[operationalstatus.Snapshot]{value: operationalstatus.Snapshot{
		Domains: []operationalstatus.DomainStatus{{
			Domain: "shelter", Status: "reported_live",
			Provenance: operationalstatus.Provenance{
				SourceID:  shelterSourceID,
				Authority: "Federal Emergency Management Agency and reporting partners",
				SourceURL: shelterSourceURL + "/query",
			},
			Freshness: operationalstatus.Freshness{
				RetrievedAt: now.Add(-time.Minute).Format(time.RFC3339),
				FreshUntil:  now.Add(4 * time.Minute).Format(time.RFC3339),
				ExpiresAt:   now.Add(time.Hour).Format(time.RFC3339),
			},
			Shelters: []operationalstatus.ShelterFact{{
				ID: "fema-1", Name: "Hale shelter", City: "Honolulu",
				ReportedStatus: "OPEN", Capacity: &capacity,
				WheelchairAccessible: "YES", PetAccommodationsCode: "HOUSEHOLD_PETS",
				Address: "Private address must not be copied", ReportingOrganization: "Not item authority",
				DistanceMiles: 1.5,
			}},
		}},
	}}, now
}

func TestShelterContextContractFactsAndProvenance(t *testing.T) {
	t.Parallel()
	result, now := shelterContextFixture()
	projection := lifecycleShelterContext(result, now)
	if projection.DerivationVersion != shelterContextVersion ||
		projection.SourceID != shelterSourceID || projection.QueryScope != shelterQueryScope ||
		projection.State != "fresh" || projection.Coverage != "complete" || len(projection.Items) != 1 {
		t.Fatalf("unexpected projection: %+v", projection)
	}
	item := projection.Items[0]
	if item.ItemID != "fema-1" || item.Name != "Hale shelter" ||
		item.SourceID != shelterSourceID || item.URL != shelterSourceURL ||
		item.Product != "FEMA National Shelter System public report" ||
		item.Authority != result.value.Domains[0].Provenance.Authority ||
		item.Scope != shelterQueryScope || item.DerivationVersion != shelterContextVersion ||
		item.Geography != "Hawaii query envelope; not County coverage or planning-location applicability" {
		t.Fatalf("incorrect provenance: %+v", item)
	}
	if item.City == nil || *item.City != "Honolulu" ||
		item.Facts.ReportedStatus == nil || *item.Facts.ReportedStatus != "OPEN" ||
		item.Facts.ReportedCapacity == nil || *item.Facts.ReportedCapacity != 85 ||
		item.Facts.WheelchairAccessible == nil || *item.Facts.WheelchairAccessible != "YES" ||
		item.Facts.PetAccommodations == nil || *item.Facts.PetAccommodations != "HOUSEHOLD_PETS" {
		t.Fatalf("incorrect facts: %+v", item)
	}
	if item.SourceUpdatedAt != nil || item.SourceExpiresAt != nil {
		t.Fatal("retrieval freshness or domain expiry became source observation timestamps")
	}
	if len(item.Limitations) < 1 || len(item.Limitations) > 8 {
		t.Fatalf("invalid limitations: %+v", item.Limitations)
	}
	for _, limitation := range item.Limitations {
		if !validClaimText(limitation, 256, true) {
			t.Fatalf("unbounded limitation: %q", limitation)
		}
	}
	encoded, err := json.Marshal(projection)
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"Private address", "Not item authority", "distance_miles", "address", "contact"} {
		if strings.Contains(string(encoded), forbidden) {
			t.Fatalf("claim includes non-contract field %q: %s", forbidden, encoded)
		}
	}
	if !strings.Contains(string(encoded), `"source_updated_at":null,"source_expires_at":null`) {
		t.Fatalf("unknown source times must be explicit nulls: %s", encoded)
	}
}

func TestShelterContextCoverageAndAvailability(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		name            string
		change          func(*lifecycleEvidenceResult[operationalstatus.Snapshot])
		state, coverage string
		count           int
	}{
		{"empty query", func(result *lifecycleEvidenceResult[operationalstatus.Snapshot]) {
			result.value.Domains[0].Shelters = nil
		}, "fresh", "complete", 0},
		{"partial query", func(result *lifecycleEvidenceResult[operationalstatus.Snapshot]) {
			result.value.Domains[0].ShelterQueryPartial = true
		}, "fresh", "partial", 1},
		{"stale", func(result *lifecycleEvidenceResult[operationalstatus.Snapshot]) {
			result.value.Domains[0].Status = "stale"
		}, "stale", "complete", 1},
		{"expired retrieval", func(result *lifecycleEvidenceResult[operationalstatus.Snapshot]) {
			result.value.Domains[0].Freshness.RetrievedAt = "2026-10-30T14:00:00Z"
			result.value.Domains[0].Freshness.FreshUntil = "2026-10-30T15:00:00Z"
		}, "stale", "complete", 1},
		{"inverted retrieval interval", func(result *lifecycleEvidenceResult[operationalstatus.Snapshot]) {
			result.value.Domains[0].Freshness.FreshUntil = "2026-10-30T15:00:00Z"
		}, "unavailable", "unavailable", 1},
		{"failed refresh retains facts", func(result *lifecycleEvidenceResult[operationalstatus.Snapshot]) {
			result.value.Domains[0].Status = "stale"
			result.value.Domains[0].ShelterSourceUnavailable = true
		}, "unavailable", "unavailable", 1},
		{"failed source retains facts", func(result *lifecycleEvidenceResult[operationalstatus.Snapshot]) {
			result.value.SourceErrors = []operationalstatus.SourceError{{Source: "fema_open_shelters"}}
		}, "unavailable", "unavailable", 1},
		{"unavailable retains facts", func(result *lifecycleEvidenceResult[operationalstatus.Snapshot]) {
			result.value.Domains[0].Status = "unavailable"
		}, "unavailable", "unavailable", 1},
		{"reader error retains facts", func(result *lifecycleEvidenceResult[operationalstatus.Snapshot]) {
			result.err = errors.New("unavailable")
		}, "unavailable", "unavailable", 1},
		{"unknown retrieval", func(result *lifecycleEvidenceResult[operationalstatus.Snapshot]) {
			result.value.Domains[0].Freshness = operationalstatus.Freshness{}
		}, "unavailable", "unavailable", 1},
		{"wrong source", func(result *lifecycleEvidenceResult[operationalstatus.Snapshot]) {
			result.value.Domains[0].Provenance.SourceID = "ptwc-cap"
		}, "unavailable", "unavailable", 0},
		{"wrong URL", func(result *lifecycleEvidenceResult[operationalstatus.Snapshot]) {
			result.value.Domains[0].Provenance.SourceURL = "https://example.test/"
		}, "unavailable", "unavailable", 0},
		{"oversize authority", func(result *lifecycleEvidenceResult[operationalstatus.Snapshot]) {
			result.value.Domains[0].Provenance.Authority = strings.Repeat("x", 257)
		}, "unavailable", "unavailable", 0},
		{"duplicate domains", func(result *lifecycleEvidenceResult[operationalstatus.Snapshot]) {
			result.value.Domains = append(result.value.Domains, result.value.Domains[0])
		}, "unavailable", "unavailable", 0},
	} {
		t.Run(test.name, func(t *testing.T) {
			result, now := shelterContextFixture()
			test.change(&result)
			projection := lifecycleShelterContext(result, now)
			if projection.State != test.state || projection.Coverage != test.coverage ||
				len(projection.Items) != test.count {
				t.Fatalf("unexpected projection: %+v", projection)
			}
			encoded, _ := json.Marshal(projection)
			if test.count == 0 && !strings.Contains(string(encoded), `"items":[]`) {
				t.Fatalf("empty items must be an array: %s", encoded)
			}
		})
	}
	empty := lifecycleShelterContext(lifecycleEvidenceResult[operationalstatus.Snapshot]{}, time.Now())
	encoded, _ := json.Marshal(empty)
	if !strings.Contains(string(encoded), `"retrieved_at":null,"fresh_until":null,"items":[]`) {
		t.Fatalf("unavailable context must have required nulls and an empty array: %s", encoded)
	}
}

func TestShelterContextBoundsAndSortsClaims(t *testing.T) {
	t.Parallel()
	result, now := shelterContextFixture()
	domain := &result.value.Domains[0]
	template := domain.Shelters[0]
	domain.Shelters = nil
	for index := 22; index >= 0; index-- {
		fact := template
		fact.ID = fmt.Sprintf("fema-%02d", index)
		domain.Shelters = append(domain.Shelters, fact)
	}
	first := lifecycleShelterContext(result, now)
	if first.Coverage != "partial" || len(first.Items) != 20 ||
		first.Items[0].ItemID != "fema-00" || first.Items[19].ItemID != "fema-19" {
		t.Fatalf("claims not bounded and sorted: %+v", first)
	}
	for left, right := 0, len(domain.Shelters)-1; left < right; left, right = left+1, right-1 {
		domain.Shelters[left], domain.Shelters[right] = domain.Shelters[right], domain.Shelters[left]
	}
	second := lifecycleShelterContext(result, now)
	firstJSON, _ := json.Marshal(first)
	secondJSON, _ := json.Marshal(second)
	if string(firstJSON) != string(secondJSON) {
		t.Fatal("source ordering affected projection")
	}

	for _, test := range []struct {
		name   string
		change func(*operationalstatus.ShelterFact)
	}{
		{"missing id", func(f *operationalstatus.ShelterFact) { f.ID = "" }},
		{"oversize id", func(f *operationalstatus.ShelterFact) { f.ID = strings.Repeat("x", 129) }},
		{"missing name", func(f *operationalstatus.ShelterFact) { f.Name = " " }},
		{"oversize name", func(f *operationalstatus.ShelterFact) { f.Name = strings.Repeat("x", 257) }},
		{"UTF8 name limit", func(f *operationalstatus.ShelterFact) { f.Name = strings.Repeat("🌺", 65) }},
		{"control character", func(f *operationalstatus.ShelterFact) { f.Name = "A\nB" }},
		{"invalid UTF8", func(f *operationalstatus.ShelterFact) { f.Name = string([]byte{0xff}) }},
		{"oversize city", func(f *operationalstatus.ShelterFact) { f.City = strings.Repeat("x", 129) }},
		{"oversize status", func(f *operationalstatus.ShelterFact) { f.ReportedStatus = strings.Repeat("x", 65) }},
		{"oversize accessibility", func(f *operationalstatus.ShelterFact) { f.WheelchairAccessible = strings.Repeat("x", 65) }},
		{"oversize pets", func(f *operationalstatus.ShelterFact) { f.PetAccommodationsCode = strings.Repeat("x", 65) }},
		{"negative capacity", func(f *operationalstatus.ShelterFact) { value := -1; f.Capacity = &value }},
		{"oversize capacity", func(f *operationalstatus.ShelterFact) { value := 1_000_001; f.Capacity = &value }},
	} {
		t.Run(test.name, func(t *testing.T) {
			result, now := shelterContextFixture()
			test.change(&result.value.Domains[0].Shelters[0])
			projection := lifecycleShelterContext(result, now)
			if projection.Coverage != "partial" || len(projection.Items) != 0 {
				t.Fatalf("malformed claim not skipped: %+v", projection)
			}
		})
	}
	result, now = shelterContextFixture()
	duplicate := result.value.Domains[0].Shelters[0]
	duplicate.Name = "Conflicting duplicate"
	result.value.Domains[0].Shelters = append(result.value.Domains[0].Shelters, duplicate)
	projection := lifecycleShelterContext(result, now)
	if projection.Coverage != "partial" || len(projection.Items) != 0 {
		t.Fatalf("duplicate native ID not excluded: %+v", projection)
	}
}

func TestShelterContextUnknownFactsAndBoundaryValues(t *testing.T) {
	t.Parallel()
	result, now := shelterContextFixture()
	fact := &result.value.Domains[0].Shelters[0]
	*fact = operationalstatus.ShelterFact{ID: "unknown", Name: "Reported name", WheelchairAccessible: "Unknown"}
	item := lifecycleShelterContext(result, now).Items[0]
	encoded, _ := json.Marshal(item)
	for _, field := range []string{"city", "reported_status", "reported_capacity", "wheelchair_accessible", "pet_accommodations"} {
		if !strings.Contains(string(encoded), `"`+field+`":null`) {
			t.Fatalf("unknown %s was not null: %s", field, encoded)
		}
	}
	fact.ID = strings.Repeat("x", 128)
	fact.Name = strings.Repeat("🌺", 64)
	fact.City = strings.Repeat("x", 128)
	fact.ReportedStatus = strings.Repeat("x", 64)
	fact.WheelchairAccessible = strings.Repeat("x", 64)
	fact.PetAccommodationsCode = strings.Repeat("x", 64)
	result.value.Domains[0].Provenance.Authority = strings.Repeat("x", 256)
	for _, capacity := range []int{0, 1_000_000} {
		fact.Capacity = &capacity
		projection := lifecycleShelterContext(result, now)
		if projection.Coverage != "complete" || len(projection.Items) != 1 ||
			*projection.Items[0].Facts.ReportedCapacity != capacity {
			t.Fatalf("valid boundary rejected: %+v", projection)
		}
	}
}

func TestShelterClaimDigestIgnoresRetrievalChurnNotSemanticChanges(t *testing.T) {
	t.Parallel()
	result, now := shelterContextFixture()
	first := lifecycleShelterContext(result, now).Items[0]
	result.value.GeneratedAt = now.Add(time.Minute)
	domain := &result.value.Domains[0]
	domain.Freshness.RetrievedAt = now.Format(time.RFC3339)
	domain.Freshness.FreshUntil = now.Add(5 * time.Minute).Format(time.RFC3339)
	domain.Status = "stale"
	domain.ShelterQueryPartial = true
	second := lifecycleShelterContext(result, now.Add(time.Minute)).Items[0]
	if first.ContentDigest != second.ContentDigest {
		t.Fatal("retrieval, status, or snapshot churn changed item digest")
	}
	second.ContentDigest = "not part of checksum"
	if shelterClaimDigest(second) != first.ContentDigest {
		t.Fatal("digest hashed itself")
	}
	domain.Shelters[0].ReportedStatus = "CLOSED"
	changed := lifecycleShelterContext(result, now).Items[0]
	if first.ContentDigest == changed.ContentDigest {
		t.Fatal("reported status change did not change digest")
	}
	*domain.Shelters[0].Capacity = 25
	capacityChanged := lifecycleShelterContext(result, now).Items[0]
	if changed.ContentDigest == capacityChanged.ContentDigest || *first.Facts.ReportedCapacity != 85 {
		t.Fatal("capacity change was not hashed or mutated a prior claim")
	}
	encoded, _ := json.Marshal(first)
	var allFields map[string]any
	_ = json.Unmarshal(encoded, &allFields)
	delete(allFields, "content_digest")
	if first.ContentDigest != dualFNVDigest(canonicalClaimJSON(allFields)) {
		t.Fatal("digest is not computed over every claim field except content_digest")
	}
}

func TestShelterClaimDigestMatchesJavaScriptFixture(t *testing.T) {
	t.Parallel()
	result, now := shelterContextFixture()
	item := lifecycleShelterContext(result, now).Items[0]
	item.Name = "Hale \"A\" & <B> 🌺\n\u2028\u2029\\u2028"
	item.ContentDigest = shelterClaimDigest(item)
	// Generated independently with JSON.stringify, ASCII-sorted object keys,
	// charCodeAt, and Math.imul using the lifecycle dual-FNV constants.
	const expected = "fnv1a-dual-v1:2e01844b1947037f"
	if item.ContentDigest != expected {
		t.Fatalf("Go/JavaScript claim checksum mismatch: got %s, want %s", item.ContentDigest, expected)
	}
	canonical := canonicalClaimJSON(map[string]any{
		"z": "<>&\u2028\u2029", "a": []any{"🌺", "\\u2028", "\"\n\t", nil, 1},
	})
	if canonical != "{\"a\":[\"🌺\",\"\\\\u2028\",\"\\\"\\n\\t\",null,1],\"z\":\"<>&\u2028\u2029\"}" {
		t.Fatalf("canonical JSON differs from JSON.stringify: %q", canonical)
	}
}
