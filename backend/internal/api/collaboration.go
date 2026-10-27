package api

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"strconv"
	"strings"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/collaboration"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/identity"
)

const maxCollaborationBodyBytes = 32 * 1024

func registerCollaborationRoutes(
	mux *http.ServeMux,
	store collaboration.Store,
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
	approve := identity.RequireCapability(
		authenticator,
		identity.CapabilityCollaborationApprove,
		metrics.observeIdentityAuthorization,
	)

	mux.Handle("POST /api/v1/collaboration/plans", write(http.HandlerFunc(
		func(writer http.ResponseWriter, request *http.Request) {
			var input collaboration.CreateInput
			if !decodeCollaborationJSON(writer, request, &input) {
				return
			}
			if store == nil {
				writeCollaborationError(writer, http.StatusServiceUnavailable, "collaboration persistence is disabled")
				return
			}
			if input.Status == collaboration.StatusApproved &&
				!requestPrincipalHasCapability(
					request,
					identity.CapabilityCollaborationApprove,
				) {
				metrics.observeIdentityAuthorization(identity.AuthorizationForbidden)
				writeCollaborationError(writer, http.StatusForbidden, "insufficient permission")
				return
			}
			plan, err := store.Create(
				request.Context(),
				input,
				principalRole(request, identity.RolePlanEditor),
			)
			writeCollaborationResult(writer, logger, metrics, "create", plan, err)
		},
	)))
	mux.Handle("GET /api/v1/collaboration/plans/{planID}", read(http.HandlerFunc(
		func(writer http.ResponseWriter, request *http.Request) {
			if store == nil {
				writeCollaborationError(writer, http.StatusServiceUnavailable, "collaboration persistence is disabled")
				return
			}
			plan, err := store.Get(request.Context(), request.PathValue("planID"))
			writeCollaborationResult(writer, logger, metrics, "read", plan, err)
		},
	)))
	mux.Handle("PUT /api/v1/collaboration/plans/{planID}", write(http.HandlerFunc(
		func(writer http.ResponseWriter, request *http.Request) {
			var input collaboration.UpdateInput
			if !decodeCollaborationJSON(writer, request, &input) {
				return
			}
			if store == nil {
				writeCollaborationError(writer, http.StatusServiceUnavailable, "collaboration persistence is disabled")
				return
			}
			if input.Status == collaboration.StatusApproved &&
				!requestPrincipalHasCapability(
					request,
					identity.CapabilityCollaborationApprove,
				) {
				metrics.observeIdentityAuthorization(identity.AuthorizationForbidden)
				writeCollaborationError(writer, http.StatusForbidden, "insufficient permission")
				return
			}
			plan, err := store.Update(
				request.Context(),
				request.PathValue("planID"),
				input,
				principalRole(request, identity.RolePlanEditor),
			)
			writeCollaborationResult(writer, logger, metrics, "update", plan, err)
		},
	)))
	mux.Handle("POST /api/v1/collaboration/plans/{planID}/comments", write(http.HandlerFunc(
		func(writer http.ResponseWriter, request *http.Request) {
			var input collaboration.CommentInput
			if !decodeCollaborationJSON(writer, request, &input) {
				return
			}
			if store == nil {
				writeCollaborationError(writer, http.StatusServiceUnavailable, "collaboration persistence is disabled")
				return
			}
			plan, err := store.AddComment(
				request.Context(),
				request.PathValue("planID"),
				input,
				principalRole(request, identity.RolePlanEditor),
			)
			writeCollaborationResult(writer, logger, metrics, "comment", plan, err)
		},
	)))
	mux.Handle("POST /api/v1/collaboration/plans/{planID}/assignments", write(http.HandlerFunc(
		func(writer http.ResponseWriter, request *http.Request) {
			var input collaboration.AssignmentInput
			if !decodeCollaborationJSON(writer, request, &input) {
				return
			}
			if store == nil {
				writeCollaborationError(writer, http.StatusServiceUnavailable, "collaboration persistence is disabled")
				return
			}
			plan, err := store.AddAssignment(
				request.Context(),
				request.PathValue("planID"),
				input,
				principalRole(request, identity.RolePlanEditor),
			)
			writeCollaborationResult(writer, logger, metrics, "assignment", plan, err)
		},
	)))
	mux.Handle("POST /api/v1/collaboration/plans/{planID}/approvals", approve(http.HandlerFunc(
		func(writer http.ResponseWriter, request *http.Request) {
			var input collaboration.ApprovalInput
			if !decodeCollaborationJSON(writer, request, &input) {
				return
			}
			if store == nil {
				writeCollaborationError(writer, http.StatusServiceUnavailable, "collaboration persistence is disabled")
				return
			}
			plan, err := store.AddApproval(
				request.Context(),
				request.PathValue("planID"),
				input,
				principalRole(request, identity.RolePlanApprover),
			)
			writeCollaborationResult(writer, logger, metrics, "approval", plan, err)
		},
	)))
	mux.Handle("GET /api/v1/collaboration/plans/{planID}/compare", read(http.HandlerFunc(
		func(writer http.ResponseWriter, request *http.Request) {
			if store == nil {
				writeCollaborationError(writer, http.StatusServiceUnavailable, "collaboration persistence is disabled")
				return
			}
			from, fromErr := strconv.Atoi(request.URL.Query().Get("from"))
			to, toErr := strconv.Atoi(request.URL.Query().Get("to"))
			if fromErr != nil || toErr != nil || from < 1 || to < 1 || from == to {
				writeCollaborationError(writer, http.StatusBadRequest, "valid distinct from and to versions are required")
				return
			}
			comparison, err := store.Compare(
				request.Context(),
				request.PathValue("planID"),
				from,
				to,
			)
			if err != nil {
				writeCollaborationFailure(writer, logger, metrics, "compare", err)
				return
			}
			metrics.observeCollaboration("compare", "success")
			writeSensitiveJSON(writer, http.StatusOK, comparison)
		},
	)))
}

func decodeCollaborationJSON(
	writer http.ResponseWriter,
	request *http.Request,
	target any,
) bool {
	mediaType, _, err := mime.ParseMediaType(request.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		writeCollaborationError(writer, http.StatusUnsupportedMediaType, "Content-Type must be application/json")
		return false
	}
	request.Body = http.MaxBytesReader(writer, request.Body, maxCollaborationBodyBytes)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		var maxBytesError *http.MaxBytesError
		if errors.As(err, &maxBytesError) {
			writeCollaborationError(writer, http.StatusRequestEntityTooLarge, "request body exceeds 32 KiB")
			return false
		}
		writeCollaborationError(writer, http.StatusBadRequest, "request body must be one valid JSON object")
		return false
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		writeCollaborationError(writer, http.StatusBadRequest, "request body must contain one JSON object")
		return false
	}
	return true
}

func writeCollaborationResult(
	writer http.ResponseWriter,
	logger *slog.Logger,
	metrics *Metrics,
	operation string,
	plan collaboration.Plan,
	err error,
) {
	if err != nil {
		writeCollaborationFailure(writer, logger, metrics, operation, err)
		return
	}
	metrics.observeCollaboration(operation, "success")
	writeSensitiveJSON(writer, http.StatusOK, plan)
}

func writeCollaborationFailure(
	writer http.ResponseWriter,
	logger *slog.Logger,
	metrics *Metrics,
	operation string,
	err error,
) {
	switch {
	case errors.Is(err, collaboration.ErrConflict):
		metrics.observeCollaboration(operation, "conflict")
		writeCollaborationError(writer, http.StatusConflict, "plan changed; refresh before saving")
	case errors.Is(err, collaboration.ErrNotFound):
		metrics.observeCollaboration(operation, "not_found")
		writeCollaborationError(writer, http.StatusNotFound, "collaborative plan not found")
	case errors.Is(err, collaboration.ErrInvalidInput):
		metrics.observeCollaboration(operation, "invalid")
		writeCollaborationError(writer, http.StatusBadRequest, err.Error())
	case isCollaborationStorageUnavailable(err):
		metrics.observeCollaboration(operation, "unavailable")
		logger.Error("collaboration storage unavailable", "operation", operation, "error", err)
		writeCollaborationError(writer, http.StatusServiceUnavailable, "collaboration storage is temporarily unavailable")
	default:
		metrics.observeCollaboration(operation, "error")
		logger.Error("collaboration operation failed", "operation", operation, "error", err)
		writeCollaborationError(writer, http.StatusInternalServerError, "collaboration operation failed")
	}
}

func isCollaborationStorageUnavailable(err error) bool {
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "database is locked") ||
		strings.Contains(message, "database is busy") ||
		strings.Contains(message, "sqlite_busy") ||
		strings.Contains(message, "sqlite_locked")
}

func writeCollaborationError(writer http.ResponseWriter, status int, message string) {
	writeSensitiveJSON(writer, status, map[string]string{"error": message})
}

func writeSensitiveJSON(writer http.ResponseWriter, status int, body any) {
	writer.Header().Set("Cache-Control", "no-store")
	writeJSON(writer, status, body)
}

func principalRole(request *http.Request, preferred identity.Role) string {
	principal, ok := identity.PrincipalFromContext(request.Context())
	if !ok {
		return string(preferred)
	}
	for _, role := range principal.Roles() {
		if role == preferred {
			return string(role)
		}
	}
	roles := principal.Roles()
	if len(roles) == 0 {
		return string(preferred)
	}
	return string(roles[0])
}

func requestPrincipalHasCapability(
	request *http.Request,
	capability identity.Capability,
) bool {
	principal, ok := identity.PrincipalFromContext(request.Context())
	return ok && principal.HasCapability(capability)
}
