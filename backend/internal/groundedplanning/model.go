package groundedplanning

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"sort"
	"strings"
	"time"
)

const (
	SchemaVersion         = "grounded-planning-draft.v1"
	ContextSchemaVersion  = "grounded-planning-context.v1"
	ModelPolicyVersion    = "grounded-planning-policy.v2"
	maxSections           = 6
	maxClaimsPerSection   = 6
	maxActions            = 8
	maxUncertaintyItems   = 8
	maxGaps               = 8
	maxTextLength         = 360
	maxProviderOutputSize = 12 * 1024
)

var (
	ErrDisabled        = errors.New("grounded planning is disabled")
	ErrUnavailable     = errors.New("grounded planning provider is unavailable")
	ErrStaleRevision   = errors.New("collaborative plan revision changed")
	ErrMissingEvidence = errors.New("grounded planning evidence is unavailable")
	ErrInvalidOutput   = errors.New("grounded planning output is invalid")
	ErrPolicyBlocked   = errors.New("grounded planning output was blocked by policy")
	ErrRateLimited     = errors.New("grounded planning rate limit exceeded")
	ErrDraftNotFound   = errors.New("grounded planning draft not found")
)

var (
	providerURLPattern       = regexp.MustCompile(`(?i)(?:[a-z][a-z0-9+.-]*://|www\.)`)
	policyClausePattern      = regexp.MustCompile(`[.!?;]+`)
	policyCompoundPattern    = regexp.MustCompile(`(?i)\s*(?:,|:|\b(?:and|but|or|then|while)\b)\s*`)
	prohibitedPolicyPatterns = []*regexp.Regexp{
		regexp.MustCompile(`(?i)\b(?:you|residents?|people|the public|occupants?|households?|visitors?|community members?)\s+(?:must|should|need to|are ordered to)\s+(?:leave|evacuate)\b`),
		regexp.MustCompile(`(?i)(?:^|[.!?;]\s+)(?:leave|evacuate)\s+(?:now|immediately)\b`),
		regexp.MustCompile(`(?i)(?:^|[.!?;]\s+)(?:the\s+)?(?:shelter|route|road|facility|partner|resource|capacity)\s+(?:is|are|remains?|has been|have been)\s+(?:open|available|passable|operational|ready|confirmed)\b`),
		regexp.MustCompile(`(?i)(?:^|[.!?;]\s+)(?:the\s+)?(?:plan|draft|request)\s+(?:is|was|has been)\s+approved\b`),
		regexp.MustCompile(`(?i)(?:^|[.!?;]\s+)(?:take|stop|change)\s+(?:your\s+)?(?:medication|medicine|dose|dosage)\b`),
	}
)

type Operation string

const (
	OperationIdentifyGaps      Operation = "identify_gaps"
	OperationDraftActions      Operation = "draft_actions"
	OperationSummarizeEvidence Operation = "summarize_evidence"
)

type Style string

const (
	StyleConcise    Style = "concise"
	StyleStructured Style = "structured"
)

type GenerateRequest struct {
	PlanID           string    `json:"plan_id"`
	ExpectedRevision int       `json:"expected_revision"`
	Operation        Operation `json:"operation"`
	Style            Style     `json:"style"`
}

type ApplyRequest struct {
	ExpectedRevision int      `json:"expected_revision"`
	DraftID          string   `json:"draft_id"`
	SectionIDs       []string `json:"section_ids"`
	ActionIDs        []string `json:"action_ids"`
}

type RejectRequest struct {
	ExpectedRevision int    `json:"expected_revision"`
	DraftID          string `json:"draft_id"`
}

type ProviderContext struct {
	SchemaVersion string              `json:"schema_version"`
	Operation     Operation           `json:"operation"`
	Style         Style               `json:"style"`
	Jurisdiction  string              `json:"jurisdiction"`
	AreaRef       string              `json:"area_ref"`
	Hazard        string              `json:"hazard"`
	Evidence      []ContextEvidence   `json:"evidence"`
	Outputs       []StructuredOutput  `json:"structured_outputs"`
	Demand        []DemandContext     `json:"aggregate_demand"`
	Capabilities  []CapabilityContext `json:"partner_capabilities"`
	Gaps          []string            `json:"explicit_gaps"`
}

type ContextEvidence struct {
	SourceID    string   `json:"source_id"`
	Authority   string   `json:"authority"`
	Claim       string   `json:"claim"`
	DataClass   string   `json:"data_class"`
	Integration string   `json:"integration"`
	Freshness   string   `json:"freshness"`
	Limitations []string `json:"limitations"`
}

type StructuredOutput struct {
	Stage     string `json:"stage"`
	Reference string `json:"reference"`
	Status    string `json:"status"`
}

type DemandContext struct {
	ID       string `json:"id"`
	Status   string `json:"status"`
	GapState string `json:"gap_state"`
}

type CapabilityContext struct {
	Capability        string `json:"capability"`
	Status            string `json:"status"`
	OperationalStatus string `json:"operational_status"`
	CapacityStatus    string `json:"capacity_status"`
	ActivationStatus  string `json:"activation_status"`
}

type ProviderDraft struct {
	Sections    []ProviderSection `json:"sections"`
	Actions     []ProviderAction  `json:"actions"`
	Uncertainty []string          `json:"uncertainty"`
	Gaps        []string          `json:"gaps"`
}

type ProviderSection struct {
	ID      string          `json:"id"`
	Heading string          `json:"heading"`
	Claims  []ProviderClaim `json:"claims"`
}

type ProviderClaim struct {
	Text      string   `json:"text"`
	Citations []string `json:"citations"`
}

type ProviderAction struct {
	ID        string   `json:"id"`
	Text      string   `json:"text"`
	Citations []string `json:"citations"`
}

type Draft struct {
	SchemaVersion       string         `json:"schema_version"`
	DraftID             string         `json:"draft_id"`
	PlanID              string         `json:"plan_id"`
	PlanVersion         int            `json:"plan_version"`
	PlanRevision        int            `json:"plan_revision"`
	GeneratedAt         time.Time      `json:"generated_at"`
	ProviderClass       string         `json:"provider_class"`
	ModelPolicyVersion  string         `json:"model_policy_version"`
	InputContextHash    string         `json:"input_context_hash"`
	Operation           Operation      `json:"operation"`
	Style               Style          `json:"style"`
	Sections            []DraftSection `json:"sections"`
	Actions             []DraftAction  `json:"actions"`
	Uncertainty         []string       `json:"uncertainty"`
	Gaps                []string       `json:"gaps"`
	Citations           []Citation     `json:"citations"`
	PolicyWarnings      []string       `json:"policy_warnings"`
	HumanReviewRequired bool           `json:"human_review_required"`
}

type DraftSection struct {
	ID      string       `json:"id"`
	Heading string       `json:"heading"`
	Claims  []DraftClaim `json:"claims"`
}

type DraftClaim struct {
	Text      string   `json:"text"`
	Citations []string `json:"citations"`
}

type DraftAction struct {
	ID        string   `json:"id"`
	Text      string   `json:"text"`
	Citations []string `json:"citations"`
}

type Citation struct {
	SourceID  string `json:"source_id"`
	Authority string `json:"authority"`
	URL       string `json:"url"`
	Freshness string `json:"freshness"`
}

type Status struct {
	State               string `json:"state"`
	HumanReviewRequired bool   `json:"human_review_required"`
}

type Provider interface {
	Class() string
	Generate(context.Context, Context) (ProviderDraft, error)
}

type Context struct {
	Context ProviderContext
	Hash    string
}

func ValidateGenerateRequest(request GenerateRequest) error {
	if strings.TrimSpace(request.PlanID) == "" || len(request.PlanID) > 80 {
		return errors.New("plan_id is invalid")
	}
	if request.ExpectedRevision < 1 {
		return errors.New("expected_revision must be positive")
	}
	if !slices.Contains([]Operation{
		OperationIdentifyGaps,
		OperationDraftActions,
		OperationSummarizeEvidence,
	}, request.Operation) {
		return errors.New("operation is invalid")
	}
	if !slices.Contains([]Style{StyleConcise, StyleStructured}, request.Style) {
		return errors.New("style is invalid")
	}
	return nil
}

func validateProviderDraft(
	draft ProviderDraft,
	allowedSources map[string]Citation,
) ([]Citation, error) {
	if len(draft.Sections) == 0 || len(draft.Sections) > maxSections {
		return nil, fmt.Errorf("%w: sections are required and bounded", ErrInvalidOutput)
	}
	if len(draft.Actions) > maxActions ||
		len(draft.Uncertainty) > maxUncertaintyItems ||
		len(draft.Gaps) > maxGaps {
		return nil, fmt.Errorf("%w: output collections exceed bounds", ErrInvalidOutput)
	}

	seenIDs := map[string]struct{}{}
	usedSources := map[string]struct{}{}
	for _, section := range draft.Sections {
		if err := validateOutputID(section.ID, seenIDs); err != nil {
			return nil, err
		}
		if err := validateText("section heading", section.Heading); err != nil {
			return nil, err
		}
		if err := enforcePolicy(section.Heading); err != nil {
			return nil, err
		}
		if len(section.Claims) == 0 || len(section.Claims) > maxClaimsPerSection {
			return nil, fmt.Errorf("%w: section claims are required and bounded", ErrInvalidOutput)
		}
		for _, claim := range section.Claims {
			if err := validateEvidenceClaim(
				claim.Text,
				claim.Citations,
				allowedSources,
				usedSources,
			); err != nil {
				return nil, err
			}
		}
	}
	for _, action := range draft.Actions {
		if err := validateOutputID(action.ID, seenIDs); err != nil {
			return nil, err
		}
		if err := validateEvidenceClaim(
			action.Text,
			action.Citations,
			allowedSources,
			usedSources,
		); err != nil {
			return nil, err
		}
	}
	for _, item := range append(slices.Clone(draft.Uncertainty), draft.Gaps...) {
		if err := validateText("uncertainty or gap", item); err != nil {
			return nil, err
		}
		if err := enforcePolicy(item); err != nil {
			return nil, err
		}
	}

	citations := make([]Citation, 0, len(usedSources))
	for sourceID := range usedSources {
		citations = append(citations, allowedSources[sourceID])
	}
	slices.SortFunc(citations, func(left Citation, right Citation) int {
		return strings.Compare(left.SourceID, right.SourceID)
	})
	return citations, nil
}

func validateEvidenceClaim(
	text string,
	citations []string,
	allowedSources map[string]Citation,
	usedSources map[string]struct{},
) error {
	if err := validateText("claim", text); err != nil {
		return err
	}
	if len(citations) == 0 || len(citations) > 6 {
		return fmt.Errorf("%w: every claim and action requires citations", ErrInvalidOutput)
	}
	for _, sourceID := range citations {
		if _, ok := allowedSources[sourceID]; !ok {
			return fmt.Errorf("%w: citation %q is not in the evidence allowlist", ErrInvalidOutput, sourceID)
		}
		usedSources[sourceID] = struct{}{}
	}
	return enforcePolicy(text)
}

func validateOutputID(id string, seen map[string]struct{}) error {
	if !regexp.MustCompile(`^[a-z][a-z0-9_-]{0,39}$`).MatchString(id) {
		return fmt.Errorf("%w: output id is invalid", ErrInvalidOutput)
	}
	if _, ok := seen[id]; ok {
		return fmt.Errorf("%w: output ids must be unique", ErrInvalidOutput)
	}
	seen[id] = struct{}{}
	return nil
}

func validateText(name string, value string) error {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || len(trimmed) > maxTextLength ||
		strings.ContainsAny(trimmed, "\x00\r") {
		return fmt.Errorf("%w: %s is invalid", ErrInvalidOutput, name)
	}
	if providerURLPattern.MatchString(trimmed) {
		return fmt.Errorf("%w: provider output must not include source URLs", ErrInvalidOutput)
	}
	return nil
}

func enforcePolicy(value string) error {
	for _, clause := range policyClausePattern.Split(value, -1) {
		lower := strings.TrimSpace(strings.ToLower(clause))
		if lower == "" {
			continue
		}
		if body, ok := verificationBody(lower); ok {
			segments := policyCompoundPattern.Split(body, -1)
			if !validVerificationSegment(segments[0]) {
				return fmt.Errorf("%w: prohibited operational or authority claim", ErrPolicyBlocked)
			}
			for _, segment := range segments[1:] {
				if len(policyViolationSpans(segment)) > 0 {
					return fmt.Errorf("%w: prohibited operational or authority claim", ErrPolicyBlocked)
				}
			}
			continue
		}
		if len(policyViolationSpans(clause)) > 0 {
			return fmt.Errorf("%w: prohibited operational or authority claim", ErrPolicyBlocked)
		}
	}
	if regexp.MustCompile(`\b\d+(?:[.,]\d+)?%?\b`).MatchString(value) {
		return fmt.Errorf("%w: invented quantitative values are not allowed", ErrPolicyBlocked)
	}
	return nil
}

func verificationBody(value string) (string, bool) {
	if body, ok := strings.CutPrefix(value, "do not assume "); ok {
		return body, true
	}
	for _, prefix := range []string{"confirm ", "verify ", "determine "} {
		if !strings.HasPrefix(value, prefix) {
			continue
		}
		if _, body, ok := strings.Cut(value, " whether "); ok {
			return body, true
		}
	}
	return "", false
}

func validVerificationSegment(value string) bool {
	spans := policyViolationSpans(value)
	if len(spans) == 0 {
		return true
	}
	if len(spans) > 1 {
		return false
	}
	switch strings.TrimSpace(strings.ToLower(value[:spans[0][0]])) {
	case "", "a", "an", "the", "current", "there is", "there are":
		return true
	default:
		return false
	}
}

func policyViolationSpans(value string) [][2]int {
	spans := make([][2]int, 0)
	lower := strings.ToLower(value)
	for _, pattern := range []string{
		"evacuation order", "mandatory evacuation", "all clear", "all-clear",
		"activate partner", "partner activated", "assigned to partner",
		"capacity confirmed", "officially approved", "agency approved",
		"medical advice", "no outages", "zero outages",
		"no unmet need", "zero unmet need",
	} {
		for offset := 0; offset < len(lower); {
			index := strings.Index(lower[offset:], pattern)
			if index < 0 {
				break
			}
			start := offset + index
			spans = append(spans, [2]int{start, start + len(pattern)})
			offset = start + len(pattern)
		}
	}
	for _, pattern := range prohibitedPolicyPatterns {
		for _, match := range pattern.FindAllStringIndex(value, -1) {
			spans = append(spans, [2]int{match[0], match[1]})
		}
	}
	if len(spans) < 2 {
		return spans
	}
	sort.Slice(spans, func(left int, right int) bool {
		return spans[left][0] < spans[right][0]
	})
	merged := make([][2]int, 0, len(spans))
	merged = append(merged, spans[0])
	mergedEnd := spans[0][1]
	for _, span := range spans[1:] {
		if span[0] <= mergedEnd {
			mergedEnd = max(mergedEnd, span[1])
			merged[len(merged)-1][1] = mergedEnd
			continue
		}
		merged = append(merged, span)
		mergedEnd = span[1]
	}
	return merged
}
