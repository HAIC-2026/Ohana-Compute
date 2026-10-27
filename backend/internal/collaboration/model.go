package collaboration

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

const SchemaVersion = "collaborative-plan.v1"

var (
	ErrNotFound     = errors.New("collaborative plan not found")
	ErrConflict     = errors.New("collaborative plan revision conflict")
	ErrInvalidInput = errors.New("invalid collaborative plan input")
)

type PlanStatus string

const (
	StatusDraft         PlanStatus = "draft"
	StatusInReview      PlanStatus = "in_review"
	StatusChangesNeeded PlanStatus = "changes_needed"
	StatusApproved      PlanStatus = "approved"
	StatusArchived      PlanStatus = "archived"
)

type ChecklistAction struct {
	Title  string `json:"title"`
	Owner  string `json:"owner"`
	Timing string `json:"timing"`
}

type OutputReference struct {
	Stage     string `json:"stage"`
	Reference string `json:"reference"`
	Summary   string `json:"summary"`
}

type Snapshot struct {
	Checklist           []ChecklistAction           `json:"checklist"`
	SourceRefs          []string                    `json:"source_refs"`
	Outputs             []OutputReference           `json:"outputs"`
	DemandLines         []DemandEvidence            `json:"demand_lines,omitempty"`
	PartnerCapabilities []PartnerCapabilityEvidence `json:"partner_capabilities,omitempty"`
}

type DemandEvidence struct {
	ID       string `json:"id"`
	Status   string `json:"status"`
	GapState string `json:"gap_state"`
}

type PartnerCapabilityEvidence struct {
	Capability        string `json:"capability"`
	Status            string `json:"status"`
	OperationalStatus string `json:"operational_status"`
	CapacityStatus    string `json:"capacity_status"`
	ActivationStatus  string `json:"activation_status"`
}

type Version struct {
	Version      int                   `json:"version"`
	Title        string                `json:"title"`
	Summary      string                `json:"summary"`
	Status       PlanStatus            `json:"status"`
	Snapshot     Snapshot              `json:"snapshot"`
	ActorRole    string                `json:"actor_role"`
	AIAssistance *AIAssistanceMetadata `json:"ai_assistance,omitempty"`
	CreatedAt    time.Time             `json:"created_at"`
}

type AIAssistanceMetadata struct {
	ProviderPolicyVersion string `json:"provider_policy_version"`
	InputContextHash      string `json:"input_context_hash"`
}

type Comment struct {
	ID         string    `json:"id"`
	Body       string    `json:"body"`
	AuthorRole string    `json:"author_role"`
	CreatedAt  time.Time `json:"created_at"`
}

type Assignment struct {
	ID         string    `json:"id"`
	Role       string    `json:"role"`
	Capability string    `json:"capability"`
	Status     string    `json:"status"`
	DueStart   time.Time `json:"due_start"`
	DueEnd     time.Time `json:"due_end"`
	CreatedAt  time.Time `json:"created_at"`
	ActorRole  string    `json:"actor_role"`
}

type Approval struct {
	ID           string    `json:"id"`
	Version      int       `json:"version"`
	Decision     string    `json:"decision"`
	Rationale    string    `json:"rationale,omitempty"`
	ApproverRole string    `json:"approver_role"`
	CreatedAt    time.Time `json:"created_at"`
}

type AuditEvent struct {
	ID           string            `json:"id"`
	Action       string            `json:"action"`
	ResourceType string            `json:"resource_type"`
	ActorRole    string            `json:"actor_role"`
	Outcome      string            `json:"outcome"`
	Metadata     map[string]string `json:"metadata,omitempty"`
	CreatedAt    time.Time         `json:"created_at"`
}

type Plan struct {
	SchemaVersion  string       `json:"schema_version"`
	ID             string       `json:"id"`
	Jurisdiction   string       `json:"jurisdiction"`
	AreaRef        string       `json:"area_ref"`
	EventRef       string       `json:"event_ref,omitempty"`
	Hazard         string       `json:"hazard"`
	Title          string       `json:"title"`
	Summary        string       `json:"summary"`
	Status         PlanStatus   `json:"status"`
	CurrentVersion int          `json:"current_version"`
	Revision       int          `json:"revision"`
	CreatedAt      time.Time    `json:"created_at"`
	UpdatedAt      time.Time    `json:"updated_at"`
	Versions       []Version    `json:"versions"`
	Comments       []Comment    `json:"comments"`
	Assignments    []Assignment `json:"assignments"`
	Approvals      []Approval   `json:"approvals"`
	Audit          []AuditEvent `json:"audit"`
}

type CreateInput struct {
	Jurisdiction string     `json:"jurisdiction"`
	AreaRef      string     `json:"area_ref"`
	EventRef     string     `json:"event_ref"`
	Hazard       string     `json:"hazard"`
	Title        string     `json:"title"`
	Summary      string     `json:"summary"`
	Status       PlanStatus `json:"status"`
	Snapshot     Snapshot   `json:"snapshot"`
}

type UpdateInput struct {
	ExpectedRevision int        `json:"expected_revision"`
	Title            string     `json:"title"`
	Summary          string     `json:"summary"`
	Status           PlanStatus `json:"status"`
	Snapshot         Snapshot   `json:"snapshot"`
}

type AIApplyInput struct {
	ExpectedRevision int
	Summary          string
	Snapshot         Snapshot
	Assistance       AIAssistanceMetadata
}

type CommentInput struct {
	ExpectedRevision int    `json:"expected_revision"`
	Body             string `json:"body"`
}

type AssignmentInput struct {
	ExpectedRevision int       `json:"expected_revision"`
	Role             string    `json:"role"`
	Capability       string    `json:"capability"`
	Status           string    `json:"status"`
	DueStart         time.Time `json:"due_start"`
	DueEnd           time.Time `json:"due_end"`
}

type ApprovalInput struct {
	ExpectedRevision int    `json:"expected_revision"`
	Version          int    `json:"version"`
	Decision         string `json:"decision"`
	Rationale        string `json:"rationale"`
}

type Comparison struct {
	SchemaVersion string   `json:"schema_version"`
	PlanID        string   `json:"plan_id"`
	From          Version  `json:"from"`
	To            Version  `json:"to"`
	ChangedFields []string `json:"changed_fields"`
}

func ValidateCreate(input CreateInput) error {
	if err := validateBounded("jurisdiction", input.Jurisdiction, 1, 80); err != nil {
		return err
	}
	if err := validateBounded("area_ref", input.AreaRef, 1, 120); err != nil {
		return err
	}
	if err := validateOptional("event_ref", input.EventRef, 120); err != nil {
		return err
	}
	if err := validateToken("hazard", input.Hazard, 32); err != nil {
		return err
	}
	return validateVersionFields(input.Title, input.Summary, input.Status, input.Snapshot)
}

func ValidateUpdate(input UpdateInput) error {
	if input.ExpectedRevision < 1 {
		return errors.New("expected_revision must be positive")
	}
	return validateVersionFields(input.Title, input.Summary, input.Status, input.Snapshot)
}

func ValidateAIApply(input AIApplyInput) error {
	if input.ExpectedRevision < 1 {
		return errors.New("expected_revision must be positive")
	}
	if err := validateBounded(
		"provider_policy_version",
		input.Assistance.ProviderPolicyVersion,
		1,
		80,
	); err != nil {
		return err
	}
	if err := validateContextHash(input.Assistance.InputContextHash); err != nil {
		return err
	}
	return validateVersionFields(
		"AI-assisted planning draft",
		input.Summary,
		StatusDraft,
		input.Snapshot,
	)
}

func validateContextHash(value string) error {
	if len(value) != 64 {
		return errors.New("input_context_hash must be a SHA-256 hex digest")
	}
	for _, character := range value {
		if (character < '0' || character > '9') &&
			(character < 'a' || character > 'f') {
			return errors.New("input_context_hash must be a SHA-256 hex digest")
		}
	}
	return nil
}

func ValidateComment(input CommentInput) error {
	if input.ExpectedRevision < 1 {
		return errors.New("expected_revision must be positive")
	}
	if err := validateBounded("body", input.Body, 1, 600); err != nil {
		return err
	}
	return rejectSensitivePlanningText(input.Body)
}

func ValidateAssignment(input AssignmentInput) error {
	if input.ExpectedRevision < 1 {
		return errors.New("expected_revision must be positive")
	}
	if !contains([]string{
		"county_mass_care", "state_esf6", "shelter_operations",
		"transportation_coordination", "public_information", "community_support",
	}, input.Role) {
		return errors.New("role is not a controlled planning role")
	}
	if !contains([]string{
		"coordinate", "validate_resources", "validate_routes",
		"publish_guidance", "support_accessibility",
	}, input.Capability) {
		return errors.New("capability is not controlled")
	}
	if !contains([]string{"pending", "active", "completed", "blocked"}, input.Status) {
		return errors.New("assignment status is invalid")
	}
	if input.DueStart.IsZero() || input.DueEnd.IsZero() || input.DueEnd.Before(input.DueStart) {
		return errors.New("due window is invalid")
	}
	if input.DueEnd.Sub(input.DueStart) > 90*24*time.Hour {
		return errors.New("due window exceeds 90 days")
	}
	return nil
}

func ValidateApproval(input ApprovalInput, currentVersion int) error {
	if input.ExpectedRevision < 1 {
		return errors.New("expected_revision must be positive")
	}
	if input.Version < 1 || input.Version > currentVersion {
		return errors.New("approval version is invalid")
	}
	if !contains([]string{"approved", "changes_requested", "withdrawn"}, input.Decision) {
		return errors.New("approval decision is invalid")
	}
	if err := validateOptional("rationale", input.Rationale, 400); err != nil {
		return err
	}
	return rejectSensitivePlanningText(input.Rationale)
}

func validateVersionFields(
	title string,
	summary string,
	status PlanStatus,
	snapshot Snapshot,
) error {
	if err := validateBounded("title", title, 1, 120); err != nil {
		return err
	}
	if err := rejectSensitivePlanningText(title); err != nil {
		return err
	}
	if err := validateBounded("summary", summary, 1, 800); err != nil {
		return err
	}
	if err := rejectSensitivePlanningText(summary); err != nil {
		return err
	}
	if !contains([]string{
		string(StatusDraft), string(StatusInReview), string(StatusChangesNeeded),
		string(StatusApproved), string(StatusArchived),
	}, string(status)) {
		return errors.New("status is invalid")
	}
	if len(snapshot.Checklist) > 20 ||
		len(snapshot.SourceRefs) > 30 ||
		len(snapshot.Outputs) > 18 ||
		len(snapshot.DemandLines) > 20 ||
		len(snapshot.PartnerCapabilities) > 12 {
		return errors.New("snapshot collection exceeds the supported size")
	}
	for _, action := range snapshot.Checklist {
		if err := validateBounded("checklist title", action.Title, 1, 180); err != nil {
			return err
		}
		if err := rejectSensitivePlanningText(action.Title); err != nil {
			return err
		}
		if err := validateBounded("checklist owner", action.Owner, 1, 100); err != nil {
			return err
		}
		if err := rejectSensitivePlanningText(action.Owner); err != nil {
			return err
		}
		if err := validateBounded("checklist timing", action.Timing, 1, 100); err != nil {
			return err
		}
		if err := rejectSensitivePlanningText(action.Timing); err != nil {
			return err
		}
	}
	for _, source := range snapshot.SourceRefs {
		if err := validateBounded("source reference", source, 1, 160); err != nil {
			return err
		}
	}
	for _, output := range snapshot.Outputs {
		if !contains([]string{"map", "model", "match"}, output.Stage) {
			return errors.New("output stage is invalid")
		}
		if err := validateBounded("output reference", output.Reference, 1, 120); err != nil {
			return err
		}
		if err := validateBounded("output summary", output.Summary, 1, 280); err != nil {
			return err
		}
		if err := rejectSensitivePlanningText(output.Summary); err != nil {
			return err
		}
	}
	for _, line := range snapshot.DemandLines {
		if err := validateToken("demand line id", line.ID, 64); err != nil {
			return err
		}
		if !contains([]string{"modeled", "unavailable"}, line.Status) {
			return errors.New("demand line status is invalid")
		}
		if !contains([]string{
			"modeled_gap",
			"no_modeled_gap",
			"unavailable",
		}, line.GapState) {
			return errors.New("demand line gap state is invalid")
		}
	}
	for _, capability := range snapshot.PartnerCapabilities {
		if err := validateToken(
			"partner capability",
			capability.Capability,
			64,
		); err != nil {
			return err
		}
		if !contains([]string{"matched", "unmatched", "stale"}, capability.Status) {
			return errors.New("partner capability status is invalid")
		}
		if capability.OperationalStatus != "not_validated" ||
			capability.CapacityStatus != "not_reported" ||
			capability.ActivationStatus != "not_reported" {
			return errors.New("partner operational fields must remain unvalidated")
		}
	}
	return nil
}

func validateBounded(name string, value string, minLength int, maxLength int) error {
	trimmed := strings.TrimSpace(value)
	if len(trimmed) < minLength || len(trimmed) > maxLength {
		return fmt.Errorf("%s must be between %d and %d characters", name, minLength, maxLength)
	}
	if strings.ContainsAny(trimmed, "\x00\r") {
		return fmt.Errorf("%s contains unsupported characters", name)
	}
	return nil
}

func validateOptional(name string, value string, maxLength int) error {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return validateBounded(name, value, 1, maxLength)
}

func validateToken(name string, value string, maxLength int) error {
	if err := validateBounded(name, value, 1, maxLength); err != nil {
		return err
	}
	for _, character := range value {
		if (character < 'a' || character > 'z') &&
			(character < '0' || character > '9') &&
			character != '_' && character != '-' {
			return fmt.Errorf("%s must be a lowercase controlled token", name)
		}
	}
	return nil
}

func rejectSensitivePlanningText(value string) error {
	lower := strings.ToLower(value)
	for _, marker := range []string{
		"@", "street address", "home address", "medical record", "patient",
		"resident name", "phone number", "date of birth",
	} {
		if strings.Contains(lower, marker) {
			return errors.New("planning notes must not contain personal or case data")
		}
	}
	return nil
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
