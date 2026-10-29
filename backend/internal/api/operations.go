package api

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"slices"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/collaboration"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/staffidentity"
)

type OperationsStore interface {
	ListOpsRequests(context.Context, collaboration.OpsActor) ([]collaboration.OpsRequest, error)
	CreateOpsRequest(context.Context, collaboration.OpsCreate, collaboration.OpsActor, time.Time) (collaboration.OpsRequest, error)
	CommandOpsRequest(context.Context, string, collaboration.OpsCommand, collaboration.OpsActor, time.Time) (collaboration.OpsRequest, error)
	ListReadinessTasks(context.Context, collaboration.OpsActor) ([]collaboration.ReadinessTask, error)
	CreateReadinessTask(context.Context, string, collaboration.ReadinessCreate, collaboration.OpsActor, time.Time) (collaboration.ReadinessTask, error)
	CommandReadinessTask(context.Context, string, collaboration.ReadinessCommand, collaboration.OpsActor, time.Time) (collaboration.ReadinessTask, error)
}

type operationsIdentity interface {
	Authenticate(*http.Request) (staffidentity.Member, error)
	ValidateMutation(*http.Request) error
	Organizations() []staffidentity.Organization
}

func registerOperationsRoutes(mux *http.ServeMux, store OperationsStore, staff operationsIdentity, logger *slog.Logger) {
	authorize := func(w http.ResponseWriter, r *http.Request) (collaboration.OpsActor, bool) {
		w.Header().Set("Cache-Control", "no-store")
		if staff == nil || store == nil {
			writeCollaborationError(w, http.StatusServiceUnavailable, "Staff coordination is not configured. Public planning remains available.")
			return collaboration.OpsActor{}, false
		}
		member, err := staff.Authenticate(r)
		if err != nil {
			writeCollaborationError(w, http.StatusUnauthorized, "Sign in with an authorized staff account.")
			return collaboration.OpsActor{}, false
		}
		if r.Method != http.MethodGet {
			if err := staff.ValidateMutation(r); err != nil {
				writeCollaborationError(w, http.StatusForbidden, "Request origin was not accepted. Reload the workspace.")
				return collaboration.OpsActor{}, false
			}
		}
		return collaboration.OpsActor{Subject: member.Subject, Organization: member.Organization, Role: member.Role, Counties: member.Counties}, true
	}
	validTarget := func(actor collaboration.OpsActor, organization, role, county string) bool {
		for _, org := range staff.Organizations() {
			if org.ID == organization && (role == "" || org.Role == role) && slices.Contains(org.Counties, county) {
				return true
			}
		}
		return false
	}
	result := func(w http.ResponseWriter, value any, err error) {
		if err == nil {
			writeSensitiveJSON(w, http.StatusOK, value)
			return
		}
		switch {
		case errors.Is(err, collaboration.ErrNotFound), errors.Is(err, collaboration.ErrOpsForbidden):
			// Identical response for absent and out-of-scope records.
			writeCollaborationError(w, http.StatusNotFound, "Record is unavailable in your workspace.")
		case errors.Is(err, collaboration.ErrConflict):
			writeCollaborationError(w, http.StatusConflict, "Another staff member changed this record. Refresh and review before retrying.")
		case errors.Is(err, collaboration.ErrInvalidInput):
			writeCollaborationError(w, http.StatusBadRequest, "Action is not valid for this state. Check requirements and refresh.")
		default:
			logger.Error("operational persistence failed")
			writeCollaborationError(w, http.StatusServiceUnavailable, "Could not save or load shared state. Nothing was confirmed; refresh before retrying.")
		}
	}
	mux.HandleFunc("GET /api/v1/operations/board", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := authorize(w, r)
		if !ok {
			return
		}
		requests, err := store.ListOpsRequests(r.Context(), actor)
		if err != nil {
			result(w, nil, err)
			return
		}
		tasks, err := store.ListReadinessTasks(r.Context(), actor)
		if err != nil {
			result(w, nil, err)
			return
		}
		organizations := []staffidentity.Organization{}
		for _, org := range staff.Organizations() {
			if slices.ContainsFunc(org.Counties, func(county string) bool { return slices.Contains(actor.Counties, county) }) {
				organizations = append(organizations, org)
			}
		}
		result(w, map[string]any{"requests": requests, "tasks": tasks, "organizations": organizations, "server_time": time.Now().UTC()}, nil)
	})
	mux.HandleFunc("POST /api/v1/operations/requests", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := authorize(w, r)
		if !ok {
			return
		}
		var input collaboration.OpsCreate
		if !decodeCollaborationJSON(w, r, &input) {
			return
		}
		value, err := store.CreateOpsRequest(r.Context(), input, actor, time.Now().UTC())
		result(w, value, err)
	})
	mux.HandleFunc("POST /api/v1/operations/requests/{id}/commands", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := authorize(w, r)
		if !ok {
			return
		}
		var input collaboration.OpsCommand
		if !decodeCollaborationJSON(w, r, &input) {
			return
		}
		if input.Action == "offer" || input.Action == "set_receiving" {
			rows, err := store.ListOpsRequests(r.Context(), actor)
			if err != nil {
				result(w, nil, err)
				return
			}
			var county string
			for _, row := range rows {
				if row.ID == r.PathValue("id") {
					county = row.County
				}
			}
			role := "transport"
			if input.Action == "set_receiving" {
				role = "receiving"
			}
			if !validTarget(actor, input.Organization, role, county) {
				result(w, nil, collaboration.ErrInvalidInput)
				return
			}
		}
		value, err := store.CommandOpsRequest(r.Context(), r.PathValue("id"), input, actor, time.Now().UTC())
		result(w, value, err)
	})
	mux.HandleFunc("POST /api/v1/operations/requests/{id}/readiness", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := authorize(w, r)
		if !ok {
			return
		}
		var input collaboration.ReadinessCreate
		if !decodeCollaborationJSON(w, r, &input) {
			return
		}
		rows, err := store.ListOpsRequests(r.Context(), actor)
		if err != nil {
			result(w, nil, err)
			return
		}
		var county string
		for _, row := range rows {
			if row.ID == r.PathValue("id") {
				county = row.County
			}
		}
		if !validTarget(actor, input.Organization, "", county) {
			result(w, nil, collaboration.ErrInvalidInput)
			return
		}
		value, err := store.CreateReadinessTask(r.Context(), r.PathValue("id"), input, actor, time.Now().UTC())
		result(w, value, err)
	})
	mux.HandleFunc("POST /api/v1/operations/readiness/{id}/commands", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := authorize(w, r)
		if !ok {
			return
		}
		var input collaboration.ReadinessCommand
		if !decodeCollaborationJSON(w, r, &input) {
			return
		}
		value, err := store.CommandReadinessTask(r.Context(), r.PathValue("id"), input, actor, time.Now().UTC())
		result(w, value, err)
	})
}
