package api

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/collaboration"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/identity"
	"github.com/prometheus/client_golang/prometheus"
)

type collaborationVerifier struct {
	roles []string
}

func (verifier collaborationVerifier) Verify(
	context.Context,
	string,
) (identity.VerifiedIdentity, error) {
	return identity.VerifiedIdentity{
		Subject: "api-test-subject",
		Roles:   verifier.roles,
	}, nil
}

func TestCollaborationRoutesFailClosedWithoutPersistence(t *testing.T) {
	t.Parallel()

	authenticator := collaborationAuthenticator(
		t,
		[]string{string(identity.RolePlanEditor)},
	)
	mux := http.NewServeMux()
	registerCollaborationRoutes(
		mux,
		nil,
		authenticator,
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		newMetrics(prometheus.NewRegistry()),
	)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/v1/collaboration/plans",
		strings.NewReader(`{
			"jurisdiction":"honolulu",
			"area_ref":"oahu-town",
			"event_ref":"hurricane-lala",
			"hazard":"hurricane",
			"title":"Aggregate response plan",
			"summary":"Aggregate coordination summary.",
			"status":"draft",
			"snapshot":{"checklist":[],"source_refs":[],"outputs":[]}
		}`),
	)
	request.Header.Set("Authorization", "Bearer fixture-token")
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	mux.ServeHTTP(response, request)

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503: %s", response.Code, response.Body.String())
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("Cache-Control = %q", response.Header().Get("Cache-Control"))
	}
}

func TestCollaborationApprovalRequiresApprovalCapability(t *testing.T) {
	t.Parallel()

	authenticator := collaborationAuthenticator(
		t,
		[]string{string(identity.RolePlanEditor)},
	)
	store, err := collaboration.OpenSQLite(
		filepath.Join(t.TempDir(), "collaboration.db"),
	)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	mux := http.NewServeMux()
	registerCollaborationRoutes(
		mux,
		store,
		authenticator,
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		newMetrics(prometheus.NewRegistry()),
	)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/v1/collaboration/plans/plan_fixture/approvals",
		strings.NewReader(`{
			"expected_revision":1,
			"version":1,
			"decision":"approved",
			"rationale":"Aggregate checks complete."
		}`),
	)
	request.Header.Set("Authorization", "Bearer fixture-token")
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	mux.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403: %s", response.Code, response.Body.String())
	}
}

func TestCollaborationApprovedStatusRequiresApprovalCapability(t *testing.T) {
	t.Parallel()

	authenticator := collaborationAuthenticator(
		t,
		[]string{string(identity.RolePlanEditor)},
	)
	store, err := collaboration.OpenSQLite(
		filepath.Join(t.TempDir(), "collaboration.db"),
	)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	mux := http.NewServeMux()
	registerCollaborationRoutes(
		mux,
		store,
		authenticator,
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		newMetrics(prometheus.NewRegistry()),
	)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/v1/collaboration/plans",
		strings.NewReader(`{
			"jurisdiction":"honolulu",
			"area_ref":"oahu-town",
			"event_ref":"hurricane-lala",
			"hazard":"hurricane",
			"title":"Aggregate response plan",
			"summary":"Aggregate coordination summary.",
			"status":"approved",
			"snapshot":{"checklist":[],"source_refs":[],"outputs":[]}
		}`),
	)
	request.Header.Set("Authorization", "Bearer collaboration-test-token")
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	mux.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403: %s", response.Code, response.Body.String())
	}
}

func TestCollaborationRejectsMalformedAndOversizedBodies(t *testing.T) {
	t.Parallel()

	authenticator := collaborationAuthenticator(
		t,
		[]string{string(identity.RolePlanEditor)},
	)
	store, err := collaboration.OpenSQLite(
		filepath.Join(t.TempDir(), "collaboration.db"),
	)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	mux := http.NewServeMux()
	registerCollaborationRoutes(
		mux,
		store,
		authenticator,
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		newMetrics(prometheus.NewRegistry()),
	)

	valid := `{
		"jurisdiction":"honolulu",
		"area_ref":"oahu-town",
		"event_ref":"hurricane-lala",
		"hazard":"hurricane",
		"title":"Aggregate response plan",
		"summary":"Aggregate coordination summary.",
		"status":"draft",
		"snapshot":{"checklist":[],"source_refs":[],"outputs":[]}
	}`
	tests := []struct {
		name        string
		contentType string
		body        []byte
		wantStatus  int
	}{
		{
			name:        "unsupported content type",
			contentType: "text/plain",
			body:        []byte(valid),
			wantStatus:  http.StatusUnsupportedMediaType,
		},
		{
			name:        "unknown field",
			contentType: "application/json",
			body:        []byte(strings.Replace(valid, `"title":`, `"private_field":"private","title":`, 1)),
			wantStatus:  http.StatusBadRequest,
		},
		{
			name:        "multiple JSON objects",
			contentType: "application/json",
			body:        []byte(valid + valid),
			wantStatus:  http.StatusBadRequest,
		},
		{
			name:        "oversized body",
			contentType: "application/json",
			body: append(
				append(
					[]byte(`{"jurisdiction":"honolulu","area_ref":"oahu-town","event_ref":"hurricane-lala","hazard":"hurricane","title":"`),
					bytes.Repeat([]byte("x"), maxCollaborationBodyBytes)...,
				),
				[]byte(`","summary":"summary","status":"draft","snapshot":{"checklist":[],"source_refs":[],"outputs":[]}}`)...,
			),
			wantStatus: http.StatusRequestEntityTooLarge,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(
				http.MethodPost,
				"/api/v1/collaboration/plans",
				bytes.NewReader(test.body),
			)
			request.Header.Set("Authorization", "Bearer test-token")
			request.Header.Set("Content-Type", test.contentType)
			response := httptest.NewRecorder()
			mux.ServeHTTP(response, request)
			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d: %s", response.Code, test.wantStatus, response.Body.String())
			}
			if strings.Contains(response.Body.String(), "private_field") {
				t.Fatalf("response leaked rejected input: %s", response.Body.String())
			}
		})
	}
}

func TestCollaborationStorageContentionReturnsServiceUnavailable(t *testing.T) {
	t.Parallel()

	for _, failure := range []error{
		errors.New("database is locked (5) (SQLITE_BUSY)"),
	} {
		response := httptest.NewRecorder()
		writeCollaborationFailure(
			response,
			slog.New(slog.NewTextHandler(io.Discard, nil)),
			newMetrics(prometheus.NewRegistry()),
			"update",
			failure,
		)
		if response.Code != http.StatusServiceUnavailable {
			t.Fatalf("status = %d, want 503: %s", response.Code, response.Body.String())
		}
		if response.Body.String() != "{\"error\":\"collaboration storage is temporarily unavailable\"}\n" {
			t.Fatalf("unexpected response: %s", response.Body.String())
		}
	}
}

func TestCollaborationDeadlineDoesNotClaimMutationWasRetryable(t *testing.T) {
	t.Parallel()

	response := httptest.NewRecorder()
	writeCollaborationFailure(
		response,
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		newMetrics(prometheus.NewRegistry()),
		"update",
		context.DeadlineExceeded,
	)
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500: %s", response.Code, response.Body.String())
	}
}

func collaborationAuthenticator(
	t *testing.T,
	roles []string,
) *identity.Service {
	t.Helper()
	service, err := identity.NewService(identity.Config{
		Mode: identity.ModeOIDC,
		OIDC: identity.OIDCConfig{
			IssuerURL:  "https://identity.example.test/tenant",
			Audience:   "api://planner",
			ClientID:   "planner-web",
			RolesClaim: "roles",
		},
	}, collaborationVerifier{roles: roles})
	if err != nil {
		t.Fatalf("identity.NewService() error = %v", err)
	}
	return service
}
