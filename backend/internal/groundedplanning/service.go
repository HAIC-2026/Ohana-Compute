package groundedplanning

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/catalog"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/collaboration"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/partnermatching"
)

type Config struct {
	Provider      Provider
	Store         collaboration.Store
	RequestLimit  int
	RequestWindow time.Duration
	DraftTTL      time.Duration
	Now           func() time.Time
}

type Service struct {
	provider      Provider
	store         collaboration.Store
	requestLimit  int
	requestWindow time.Duration
	draftTTL      time.Duration
	now           func() time.Time
	mu            sync.Mutex
	drafts        map[string]cachedDraft
	requests      map[string][]time.Time
}

type cachedDraft struct {
	draft     Draft
	provider  ProviderDraft
	snapshot  collaboration.Snapshot
	expiresAt time.Time
}

const maxCachedDrafts = 2048

func NewService(config Config) *Service {
	if config.RequestLimit <= 0 {
		config.RequestLimit = 10
	}
	if config.RequestWindow <= 0 {
		config.RequestWindow = time.Minute
	}
	if config.DraftTTL <= 0 {
		config.DraftTTL = 20 * time.Minute
	}
	if config.Now == nil {
		config.Now = time.Now
	}
	return &Service{
		provider:      config.Provider,
		store:         config.Store,
		requestLimit:  config.RequestLimit,
		requestWindow: config.RequestWindow,
		draftTTL:      config.DraftTTL,
		now:           config.Now,
		drafts:        map[string]cachedDraft{},
		requests:      map[string][]time.Time{},
	}
}

func (service *Service) Status() Status {
	if service == nil || service.provider == nil {
		return Status{State: "disabled", HumanReviewRequired: true}
	}
	if service.store == nil {
		return Status{State: "unavailable", HumanReviewRequired: true}
	}
	return Status{State: "configured", HumanReviewRequired: true}
}

func (service *Service) Generate(
	ctx context.Context,
	subject string,
	request GenerateRequest,
) (Draft, error) {
	if err := ValidateGenerateRequest(request); err != nil {
		return Draft{}, fmt.Errorf("%w: %v", ErrInvalidOutput, err)
	}
	if service == nil || service.provider == nil {
		return Draft{}, ErrDisabled
	}
	if service.store == nil {
		return Draft{}, ErrUnavailable
	}
	if !service.allow(subject) {
		return Draft{}, ErrRateLimited
	}
	plan, err := service.store.Get(ctx, request.PlanID)
	if err != nil {
		return Draft{}, err
	}
	if plan.Revision != request.ExpectedRevision {
		return Draft{}, ErrStaleRevision
	}
	contextValue, allowedSources, err := buildContext(plan, request)
	if err != nil {
		return Draft{}, err
	}
	contextJSON, err := json.Marshal(contextValue)
	if err != nil {
		return Draft{}, err
	}
	if len(contextJSON) > 24*1024 {
		return Draft{}, fmt.Errorf("%w: context exceeds 24 KiB", ErrMissingEvidence)
	}
	hash := sha256.Sum256(contextJSON)
	contextHash := hex.EncodeToString(hash[:])
	providerDraft, err := service.provider.Generate(ctx, Context{
		Context: contextValue,
		Hash:    contextHash,
	})
	if err != nil {
		return Draft{}, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	providerJSON, err := json.Marshal(providerDraft)
	if err != nil || len(providerJSON) > maxProviderOutputSize {
		return Draft{}, fmt.Errorf("%w: provider output exceeds bounds", ErrInvalidOutput)
	}
	citations, err := validateProviderDraft(providerDraft, allowedSources)
	if err != nil {
		return Draft{}, err
	}
	now := service.now().UTC()
	draft := Draft{
		SchemaVersion:      SchemaVersion,
		DraftID:            newDraftID(),
		PlanID:             plan.ID,
		PlanVersion:        plan.CurrentVersion,
		PlanRevision:       plan.Revision,
		GeneratedAt:        now,
		ProviderClass:      service.provider.Class(),
		ModelPolicyVersion: ModelPolicyVersion,
		InputContextHash:   contextHash,
		Operation:          request.Operation,
		Style:              request.Style,
		Sections:           convertSections(providerDraft.Sections),
		Actions:            convertActions(providerDraft.Actions),
		Uncertainty:        slices.Clone(providerDraft.Uncertainty),
		Gaps:               slices.Clone(providerDraft.Gaps),
		Citations:          citations,
		PolicyWarnings: []string{
			"Draft synthesis only; verify evidence and current conditions before use.",
			"Does not issue orders, activate partners, confirm capacity, or approve plans.",
		},
		HumanReviewRequired: true,
	}
	service.mu.Lock()
	service.pruneLocked(now)
	if len(service.drafts) >= maxCachedDrafts {
		service.mu.Unlock()
		return Draft{}, ErrUnavailable
	}
	service.drafts[draft.DraftID] = cachedDraft{
		draft:     draft,
		provider:  providerDraft,
		snapshot:  plan.Versions[len(plan.Versions)-1].Snapshot,
		expiresAt: now.Add(service.draftTTL),
	}
	service.mu.Unlock()
	return draft, nil
}

func (service *Service) Apply(
	ctx context.Context,
	planID string,
	request ApplyRequest,
	actorRole string,
) (collaboration.Plan, error) {
	if service == nil || service.store == nil {
		return collaboration.Plan{}, ErrUnavailable
	}
	if request.ExpectedRevision < 1 ||
		strings.TrimSpace(request.DraftID) == "" ||
		len(request.SectionIDs)+len(request.ActionIDs) == 0 {
		return collaboration.Plan{}, fmt.Errorf("%w: apply selection is invalid", ErrInvalidOutput)
	}
	service.mu.Lock()
	service.pruneLocked(service.now().UTC())
	cached, ok := service.drafts[request.DraftID]
	service.mu.Unlock()
	if !ok || cached.draft.PlanID != planID {
		return collaboration.Plan{}, ErrDraftNotFound
	}
	if cached.draft.PlanRevision != request.ExpectedRevision {
		return collaboration.Plan{}, ErrStaleRevision
	}
	summary, actions, err := selectedContent(cached.provider, request)
	if err != nil {
		return collaboration.Plan{}, err
	}
	snapshot := cached.snapshot
	for _, action := range actions {
		if len(snapshot.Checklist) >= 20 {
			break
		}
		snapshot.Checklist = append(snapshot.Checklist, collaboration.ChecklistAction{
			Title:  action,
			Owner:  "Human review",
			Timing: "Confirm before use",
		})
	}
	plan, err := service.store.ApplyAIDraft(
		ctx,
		planID,
		collaboration.AIApplyInput{
			ExpectedRevision: request.ExpectedRevision,
			Summary:          summary,
			Snapshot:         snapshot,
			Assistance: collaboration.AIAssistanceMetadata{
				ProviderPolicyVersion: cached.draft.ModelPolicyVersion,
				InputContextHash:      cached.draft.InputContextHash,
			},
		},
		actorRole,
	)
	if errors.Is(err, collaboration.ErrConflict) {
		return collaboration.Plan{}, ErrStaleRevision
	}
	if err != nil {
		return collaboration.Plan{}, err
	}
	service.mu.Lock()
	delete(service.drafts, request.DraftID)
	service.mu.Unlock()
	return plan, nil
}

func (service *Service) Reject(
	planID string,
	request RejectRequest,
) error {
	if request.ExpectedRevision < 1 || request.DraftID == "" {
		return fmt.Errorf("%w: rejection is invalid", ErrInvalidOutput)
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	service.pruneLocked(service.now().UTC())
	cached, ok := service.drafts[request.DraftID]
	if !ok || cached.draft.PlanID != planID {
		return ErrDraftNotFound
	}
	if cached.draft.PlanRevision != request.ExpectedRevision {
		return ErrStaleRevision
	}
	delete(service.drafts, request.DraftID)
	return nil
}

func (service *Service) allow(subject string) bool {
	now := service.now().UTC()
	keyHash := sha256.Sum256([]byte(subject))
	key := hex.EncodeToString(keyHash[:])
	service.mu.Lock()
	defer service.mu.Unlock()
	cutoff := now.Add(-service.requestWindow)
	for subjectKey, requestTimes := range service.requests {
		active := requestTimes[:0]
		for _, requestTime := range requestTimes {
			if requestTime.After(cutoff) {
				active = append(active, requestTime)
			}
		}
		if len(active) == 0 {
			delete(service.requests, subjectKey)
		} else {
			service.requests[subjectKey] = active
		}
	}
	if _, exists := service.requests[key]; !exists &&
		len(service.requests) >= 1024 {
		return false
	}
	recent := service.requests[key][:0]
	for _, requestTime := range service.requests[key] {
		if requestTime.After(cutoff) {
			recent = append(recent, requestTime)
		}
	}
	if len(recent) >= service.requestLimit {
		service.requests[key] = recent
		return false
	}
	service.requests[key] = append(recent, now)
	return true
}

func (service *Service) pruneLocked(now time.Time) {
	for id, cached := range service.drafts {
		if !cached.expiresAt.After(now) {
			delete(service.drafts, id)
		}
	}
}

func buildContext(
	plan collaboration.Plan,
	request GenerateRequest,
) (ProviderContext, map[string]Citation, error) {
	if len(plan.Versions) == 0 {
		return ProviderContext{}, nil, ErrMissingEvidence
	}
	version := plan.Versions[len(plan.Versions)-1]
	contextValue := ProviderContext{
		SchemaVersion: ContextSchemaVersion,
		Operation:     request.Operation,
		Style:         request.Style,
		Hazard:        plan.Hazard,
		Evidence:      []ContextEvidence{},
		Outputs:       []StructuredOutput{},
		Demand:        []DemandContext{},
		Capabilities:  []CapabilityContext{},
		Gaps:          []string{},
	}
	allowed := map[string]Citation{}
	seen := map[string]struct{}{}
	for _, reference := range version.Snapshot.SourceRefs {
		source, ok := catalog.Find(reference)
		if !ok {
			partnerEvidence, partnerOK := partnermatching.FindEvidence(reference)
			if !partnerOK {
				continue
			}
			if _, duplicate := seen[partnerEvidence.SourceID]; duplicate {
				continue
			}
			seen[partnerEvidence.SourceID] = struct{}{}
			contextValue.Evidence = append(
				contextValue.Evidence,
				ContextEvidence{
					SourceID:    partnerEvidence.SourceID,
					Authority:   partnerEvidence.Publisher,
					Claim:       partnerEvidence.Claim,
					DataClass:   "planning",
					Integration: "curated-partner-evidence",
					Freshness:   "not_provided",
					Limitations: []string{
						"Operational status, capacity, and activation are not validated.",
					},
				},
			)
			allowed[partnerEvidence.SourceID] = Citation{
				SourceID:  partnerEvidence.SourceID,
				Authority: partnerEvidence.Publisher,
				URL:       partnerEvidence.SourceURL,
				Freshness: "not_provided",
			}
			continue
		}
		if _, duplicate := seen[source.ID]; duplicate {
			continue
		}
		seen[source.ID] = struct{}{}
		limitations := slices.Clone(source.Limitations)
		if len(limitations) > 3 {
			limitations = limitations[:3]
		}
		freshness := "not_provided"
		if strings.Contains(source.Integration, "unavailable") ||
			strings.Contains(source.Integration, "blocked") ||
			strings.Contains(source.Integration, "agreement-required") {
			freshness = "unavailable"
			contextValue.Gaps = append(
				contextValue.Gaps,
				"Source "+source.ID+" is explicitly unavailable for current operations.",
			)
		}
		contextValue.Evidence = append(contextValue.Evidence, ContextEvidence{
			SourceID:    source.ID,
			Authority:   source.Authority,
			Claim:       firstOrEmpty(source.Enables),
			DataClass:   source.DataClass,
			Integration: source.Integration,
			Freshness:   freshness,
			Limitations: limitations,
		})
		allowed[source.ID] = Citation{
			SourceID:  source.ID,
			Authority: source.Authority,
			URL:       source.URL,
			Freshness: freshness,
		}
	}
	for _, output := range version.Snapshot.Outputs {
		if !slices.Contains([]string{"map", "model", "match"}, output.Stage) {
			continue
		}
		contextValue.Outputs = append(contextValue.Outputs, StructuredOutput{
			Stage:     output.Stage,
			Reference: output.Stage + "-output",
			Status:    "available",
		})
	}
	for _, line := range version.Snapshot.DemandLines {
		contextValue.Demand = append(contextValue.Demand, DemandContext{
			ID:       line.ID,
			Status:   line.Status,
			GapState: line.GapState,
		})
		if line.GapState == "unavailable" {
			contextValue.Gaps = append(
				contextValue.Gaps,
				"Aggregate demand line "+line.ID+" is unavailable.",
			)
		}
	}
	for _, capability := range version.Snapshot.PartnerCapabilities {
		contextValue.Capabilities = append(
			contextValue.Capabilities,
			CapabilityContext{
				Capability:        capability.Capability,
				Status:            capability.Status,
				OperationalStatus: capability.OperationalStatus,
				CapacityStatus:    capability.CapacityStatus,
				ActivationStatus:  capability.ActivationStatus,
			},
		)
		if capability.Status != "matched" {
			contextValue.Gaps = append(
				contextValue.Gaps,
				"Partner capability "+capability.Capability+" is not currently matched.",
			)
		}
	}
	if len(contextValue.Evidence) == 0 {
		return ProviderContext{}, nil, ErrMissingEvidence
	}
	if len(contextValue.Gaps) == 0 {
		contextValue.Gaps = append(
			contextValue.Gaps,
			"Current operational availability is not established by planning evidence.",
		)
	}
	return contextValue, allowed, nil
}

func firstOrEmpty(values []string) string {
	if len(values) == 0 {
		return ""
	}
	return values[0]
}

func selectedContent(
	draft ProviderDraft,
	request ApplyRequest,
) (string, []string, error) {
	selectedSections := map[string]struct{}{}
	for _, id := range request.SectionIDs {
		selectedSections[id] = struct{}{}
	}
	selectedActions := map[string]struct{}{}
	for _, id := range request.ActionIDs {
		selectedActions[id] = struct{}{}
	}
	parts := []string{"AI-assisted planning draft (human reviewed)."}
	foundSections := 0
	for _, section := range draft.Sections {
		if _, ok := selectedSections[section.ID]; !ok {
			continue
		}
		foundSections++
		for _, claim := range section.Claims {
			parts = append(parts, claim.Text)
		}
	}
	actions := []string{}
	for _, action := range draft.Actions {
		if _, ok := selectedActions[action.ID]; ok {
			actions = append(actions, action.Text)
		}
	}
	if foundSections != len(selectedSections) || len(actions) != len(selectedActions) {
		return "", nil, fmt.Errorf("%w: selection references unknown draft content", ErrInvalidOutput)
	}
	summary := strings.Join(parts, " ")
	if len(summary) > 800 {
		summary = summary[:797] + "..."
	}
	return summary, actions, nil
}

func convertSections(sections []ProviderSection) []DraftSection {
	result := make([]DraftSection, 0, len(sections))
	for _, section := range sections {
		claims := make([]DraftClaim, 0, len(section.Claims))
		for _, claim := range section.Claims {
			claims = append(claims, DraftClaim{
				Text:      claim.Text,
				Citations: slices.Clone(claim.Citations),
			})
		}
		result = append(result, DraftSection{
			ID:      section.ID,
			Heading: section.Heading,
			Claims:  claims,
		})
	}
	return result
}

func convertActions(actions []ProviderAction) []DraftAction {
	result := make([]DraftAction, 0, len(actions))
	for _, action := range actions {
		result = append(result, DraftAction{
			ID:        action.ID,
			Text:      action.Text,
			Citations: slices.Clone(action.Citations),
		})
	}
	return result
}

func newDraftID() string {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		panic("grounded planning: secure random unavailable")
	}
	return "draft_" + hex.EncodeToString(value[:])
}
