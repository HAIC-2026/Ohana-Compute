package api

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/collaboration"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/groundedplanning"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/identity"
)

func registerGroundedPlanningRoutes(
	mux *http.ServeMux,
	service *groundedplanning.Service,
	authenticator identity.Authenticator,
	logger *slog.Logger,
	metrics *Metrics,
) {
	read := identity.RequireCapability(
		authenticator,
		identity.CapabilityCollaborationRead,
		metrics.observeIdentityAuthorization,
	)
	write := identity.RequireCapability(
		authenticator,
		identity.CapabilityCollaborationWrite,
		metrics.observeIdentityAuthorization,
	)

	mux.Handle(
		"GET /api/v1/collaboration/plans/{planID}/planning-assist/status",
		read(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
			writeSensitiveJSON(writer, http.StatusOK, service.Status())
		})),
	)
	mux.Handle(
		"POST /api/v1/collaboration/plans/{planID}/planning-drafts",
		write(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			var input struct {
				ExpectedRevision int                        `json:"expected_revision"`
				Operation        groundedplanning.Operation `json:"operation"`
				Style            groundedplanning.Style     `json:"style"`
			}
			if !decodeGroundedPlanningJSON(writer, request, &input) {
				return
			}
			principal, _ := identity.PrincipalFromContext(request.Context())
			draft, err := service.Generate(
				request.Context(),
				principal.Subject(),
				groundedplanning.GenerateRequest{
					PlanID:           request.PathValue("planID"),
					ExpectedRevision: input.ExpectedRevision,
					Operation:        input.Operation,
					Style:            input.Style,
				},
			)
			if err != nil {
				writeGroundedPlanningFailure(writer, logger, metrics, "generate", err)
				return
			}
			metrics.observeGroundedPlanning(
				"generate",
				"success",
				draft.ProviderClass,
			)
			writeSensitiveJSON(writer, http.StatusOK, draft)
		})),
	)
	mux.Handle(
		"POST /api/v1/collaboration/plans/{planID}/planning-drafts/{draftID}/apply",
		write(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			var input struct {
				ExpectedRevision int      `json:"expected_revision"`
				SectionIDs       []string `json:"section_ids"`
				ActionIDs        []string `json:"action_ids"`
			}
			if !decodeGroundedPlanningJSON(writer, request, &input) {
				return
			}
			plan, err := service.Apply(
				request.Context(),
				request.PathValue("planID"),
				groundedplanning.ApplyRequest{
					ExpectedRevision: input.ExpectedRevision,
					DraftID:          request.PathValue("draftID"),
					SectionIDs:       input.SectionIDs,
					ActionIDs:        input.ActionIDs,
				},
				principalRole(request, identity.RolePlanEditor),
			)
			if err != nil {
				writeGroundedPlanningFailure(writer, logger, metrics, "apply", err)
				return
			}
			metrics.observeGroundedPlanning("apply", "success", "validated")
			writeSensitiveJSON(writer, http.StatusOK, plan)
		})),
	)
	mux.Handle(
		"POST /api/v1/collaboration/plans/{planID}/planning-drafts/{draftID}/reject",
		write(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			var input struct {
				ExpectedRevision int `json:"expected_revision"`
			}
			if !decodeGroundedPlanningJSON(writer, request, &input) {
				return
			}
			err := service.Reject(
				request.PathValue("planID"),
				groundedplanning.RejectRequest{
					ExpectedRevision: input.ExpectedRevision,
					DraftID:          request.PathValue("draftID"),
				},
			)
			if err != nil {
				writeGroundedPlanningFailure(writer, logger, metrics, "reject", err)
				return
			}
			metrics.observeGroundedPlanning("reject", "success", "validated")
			writeSensitiveJSON(writer, http.StatusOK, map[string]string{
				"state": "rejected",
			})
		})),
	)
}

func decodeGroundedPlanningJSON(
	writer http.ResponseWriter,
	request *http.Request,
	target any,
) bool {
	return decodeJSONWithLimit(
		writer,
		request,
		target,
		4*1024,
		"grounded planning request",
	)
}

func writeGroundedPlanningFailure(
	writer http.ResponseWriter,
	logger *slog.Logger,
	metrics *Metrics,
	operation string,
	err error,
) {
	outcome := "error"
	status := http.StatusInternalServerError
	message := "planning assist failed"
	switch {
	case errors.Is(err, groundedplanning.ErrDisabled):
		outcome, status, message = "disabled", http.StatusServiceUnavailable, "planning assist is disabled"
	case errors.Is(err, groundedplanning.ErrUnavailable):
		outcome, status, message = "unavailable", http.StatusBadGateway, "planning assist provider is unavailable"
	case errors.Is(err, groundedplanning.ErrStaleRevision),
		errors.Is(err, collaboration.ErrConflict):
		outcome, status, message = "conflict", http.StatusConflict, "plan changed; refresh before reviewing this draft"
	case errors.Is(err, groundedplanning.ErrMissingEvidence):
		outcome, status, message = "missing_evidence", http.StatusUnprocessableEntity, "grounded evidence is unavailable"
	case errors.Is(err, groundedplanning.ErrPolicyBlocked):
		outcome, status, message = "policy_blocked", http.StatusUnprocessableEntity, "draft blocked by planning policy"
	case errors.Is(err, groundedplanning.ErrInvalidOutput):
		outcome, status, message = "invalid", http.StatusUnprocessableEntity, "provider returned an invalid grounded draft"
	case errors.Is(err, collaboration.ErrInvalidInput):
		outcome, status, message = "invalid", http.StatusUnprocessableEntity, "selected draft content is invalid"
	case errors.Is(err, groundedplanning.ErrRateLimited):
		outcome, status, message = "rate_limited", http.StatusTooManyRequests, "planning assist rate limit exceeded"
	case errors.Is(err, groundedplanning.ErrDraftNotFound):
		outcome, status, message = "not_found", http.StatusNotFound, "planning draft is unavailable or expired"
	case errors.Is(err, collaboration.ErrNotFound):
		outcome, status, message = "not_found", http.StatusNotFound, "collaborative plan not found"
	default:
		logger.Error(
			"grounded planning operation failed",
			"operation",
			operation,
			"error_class",
			outcome,
		)
	}
	metrics.observeGroundedPlanning(operation, outcome, "bounded")
	writeSensitiveJSON(writer, status, map[string]string{"error": message})
}
