package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/operationalstatus"
)

const (
	shelterContextVersion = "fema-shelter-context.v1"
	shelterSourceID       = "fema-open-shelters"
	shelterQueryScope     = "hawaii-open-shelter-query"
	shelterSourceURL      = "https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/MapServer/0"
	maxShelterClaims      = 20
)

type shelterContext struct {
	DerivationVersion string               `json:"derivation_version"`
	SourceID          string               `json:"source_id"`
	QueryScope        string               `json:"query_scope"`
	State             string               `json:"state"`
	Coverage          string               `json:"coverage"`
	RetrievedAt       *string              `json:"retrieved_at"`
	FreshUntil        *string              `json:"fresh_until"`
	Items             []shelterSourceClaim `json:"items"`
}

type shelterSourceClaim struct {
	ItemID            string            `json:"item_id"`
	SourceID          string            `json:"source_id"`
	Product           string            `json:"product"`
	Authority         string            `json:"authority"`
	URL               string            `json:"url"`
	Geography         string            `json:"geography"`
	Scope             string            `json:"scope"`
	Name              string            `json:"name"`
	City              *string           `json:"city"`
	Facts             shelterClaimFacts `json:"facts"`
	SourceUpdatedAt   *string           `json:"source_updated_at"`
	SourceExpiresAt   *string           `json:"source_expires_at"`
	Limitations       []string          `json:"limitations"`
	DerivationVersion string            `json:"derivation_version"`
	ContentDigest     string            `json:"content_digest"`
}

type shelterClaimFacts struct {
	ReportedStatus       *string `json:"reported_status"`
	ReportedCapacity     *int    `json:"reported_capacity"`
	WheelchairAccessible *string `json:"wheelchair_accessible"`
	PetAccommodations    *string `json:"pet_accommodations"`
}

func lifecycleShelterContext(
	result lifecycleEvidenceResult[operationalstatus.Snapshot],
	now time.Time,
) shelterContext {
	projection := shelterContext{
		DerivationVersion: shelterContextVersion,
		SourceID:          shelterSourceID, QueryScope: shelterQueryScope,
		State: "unavailable", Coverage: "unavailable",
		Items: []shelterSourceClaim{},
	}
	var shelter *operationalstatus.DomainStatus
	for index := range result.value.Domains {
		domain := &result.value.Domains[index]
		if domain.Domain == "shelter" {
			if shelter != nil {
				return projection
			}
			shelter = domain
		}
	}
	if shelter == nil || shelter.Provenance.SourceID != shelterSourceID ||
		!validClaimText(shelter.Provenance.Authority, 256, true) ||
		(shelter.Provenance.SourceURL != shelterSourceURL &&
			shelter.Provenance.SourceURL != shelterSourceURL+"/query") {
		return projection
	}

	projection.RetrievedAt = claimTimestamp(shelter.Freshness.RetrievedAt)
	projection.FreshUntil = claimTimestamp(shelter.Freshness.FreshUntil)
	if projection.RetrievedAt != nil && projection.FreshUntil != nil {
		retrieved, _ := time.Parse(time.RFC3339, *projection.RetrievedAt)
		freshUntil, _ := time.Parse(time.RFC3339, *projection.FreshUntil)
		if !freshUntil.After(retrieved) {
			projection.RetrievedAt, projection.FreshUntil = nil, nil
		}
	}
	available := result.err == nil && !shelter.ShelterSourceUnavailable &&
		(shelter.Status == "reported_live" || shelter.Status == "stale") &&
		projection.RetrievedAt != nil && projection.FreshUntil != nil
	for _, sourceError := range result.value.SourceErrors {
		if sourceError.Source == "fema_open_shelters" || sourceError.Source == shelterSourceID {
			available = false
		}
	}
	if available {
		projection.State = "fresh"
		freshUntil, _ := time.Parse(time.RFC3339, *projection.FreshUntil)
		if shelter.Status == "stale" || !now.Before(freshUntil) {
			projection.State = "stale"
		}
		projection.Coverage = "complete"
		if shelter.ShelterQueryPartial {
			projection.Coverage = "partial"
		}
	}
	partial := false
	counts := make(map[string]int, len(shelter.Shelters))
	for _, fact := range shelter.Shelters {
		counts[fact.ID]++
	}
	for _, fact := range shelter.Shelters {
		if counts[fact.ID] != 1 || !validShelterClaim(fact) {
			partial = true
			continue
		}
		item := shelterSourceClaim{
			ItemID: fact.ID, SourceID: shelterSourceID,
			Product:   "FEMA National Shelter System public report",
			Authority: shelter.Provenance.Authority, URL: shelterSourceURL,
			Geography: "Hawaii query envelope; not County coverage or planning-location applicability",
			Scope:     shelterQueryScope, Name: fact.Name, City: claimOptionalText(fact.City),
			Facts: shelterClaimFacts{
				ReportedStatus:       claimOptionalText(fact.ReportedStatus),
				ReportedCapacity:     claimCapacity(fact.Capacity),
				WheelchairAccessible: claimOptionalText(fact.WheelchairAccessible),
				PetAccommodations:    claimOptionalText(fact.PetAccommodationsCode),
			},
			Limitations: []string{
				"Query completeness is not County shelter coverage or planning-location applicability.",
				"A missing record does not prove that no shelter is open.",
				"Confirm current opening, admission, capacity, accessibility, and pets with the responsible authority.",
				"Source observation and expiry times are unknown; retrieval freshness is not observation freshness.",
			},
			DerivationVersion: shelterContextVersion,
		}
		item.ContentDigest = shelterClaimDigest(item)
		projection.Items = append(projection.Items, item)
	}
	sort.Slice(projection.Items, func(first, second int) bool {
		return projection.Items[first].ItemID < projection.Items[second].ItemID
	})
	if len(projection.Items) > maxShelterClaims {
		projection.Items = projection.Items[:maxShelterClaims]
		partial = true
	}
	if partial && available {
		projection.Coverage = "partial"
	}
	return projection
}

func validShelterClaim(fact operationalstatus.ShelterFact) bool {
	return validClaimText(fact.ID, 128, true) &&
		validClaimText(fact.Name, 256, true) &&
		validClaimText(fact.City, 128, false) &&
		validClaimText(fact.ReportedStatus, 64, false) &&
		validClaimText(fact.WheelchairAccessible, 64, false) &&
		validClaimText(fact.PetAccommodationsCode, 64, false) &&
		(fact.Capacity == nil || (*fact.Capacity >= 0 && *fact.Capacity <= 1_000_000))
}

func validClaimText(value string, limit int, required bool) bool {
	if !utf8.ValidString(value) || len(value) > limit ||
		(required && strings.TrimSpace(value) == "") {
		return false
	}
	for _, character := range value {
		if character < 0x20 || character == 0x7f {
			return false
		}
	}
	return true
}

func claimCapacity(value *int) *int {
	if value == nil {
		return nil
	}
	capacity := *value
	return &capacity
}

func claimOptionalText(value string) *string {
	if strings.TrimSpace(value) == "" || strings.EqualFold(strings.TrimSpace(value), "unknown") {
		return nil
	}
	return &value
}

func claimTimestamp(value string) *string {
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil || parsed.IsZero() {
		return nil
	}
	canonical := parsed.UTC().Format(time.RFC3339)
	return &canonical
}

func shelterClaimDigest(claim shelterSourceClaim) string {
	encoded, _ := json.Marshal(claim)
	var content map[string]any
	_ = json.Unmarshal(encoded, &content)
	delete(content, "content_digest")
	return dualFNVDigest(canonicalClaimJSON(content))
}

func canonicalClaimJSON(value any) string {
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(value)
	encoded := bytes.TrimSuffix(buffer.Bytes(), []byte("\n"))
	// Go escapes JS line separators even with HTML escaping disabled. Do not
	// unescape a literal "\\u2028" or "\\u2029" from source text.
	var canonical strings.Builder
	for index := 0; index < len(encoded); index++ {
		if encoded[index] == '\\' && index+1 < len(encoded) {
			if index+6 <= len(encoded) {
				switch string(encoded[index : index+6]) {
				case `\u2028`:
					canonical.WriteRune('\u2028')
					index += 5
					continue
				case `\u2029`:
					canonical.WriteRune('\u2029')
					index += 5
					continue
				}
			}
			canonical.WriteByte(encoded[index])
			index++
		}
		canonical.WriteByte(encoded[index])
	}
	return canonical.String()
}

func dualFNVDigest(value string) string {
	// This is a deterministic change checksum, not a signature or authority.
	first, second := uint32(0x811c9dc5), uint32(0x9e3779b9)
	for _, code := range utf16.Encode([]rune(value)) {
		first = (first ^ uint32(code)) * 0x01000193
		second = (second ^ uint32(code)) * 0x85ebca6b
	}
	return fmt.Sprintf("fnv1a-dual-v1:%08x%08x", first, second)
}
