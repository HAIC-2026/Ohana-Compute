package identity

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

type verifierStub struct {
	identity VerifiedIdentity
	err      error
}

func (stub verifierStub) Verify(
	context.Context,
	string,
) (VerifiedIdentity, error) {
	return stub.identity, stub.err
}

func TestConfigValidateFailsClosed(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		config Config
		valid  bool
	}{
		{
			name:   "disabled by default",
			config: Config{},
			valid:  true,
		},
		{
			name: "disabled rejects provider settings",
			config: Config{
				Mode: ModeDisabled,
				OIDC: OIDCConfig{Audience: "api://planner"},
			},
		},
		{
			name: "oidc requires complete settings",
			config: Config{
				Mode: ModeOIDC,
				OIDC: OIDCConfig{
					IssuerURL: "https://identity.example.test/tenant",
					Audience:  "api://planner",
				},
			},
		},
		{
			name: "oidc rejects insecure issuer",
			config: Config{
				Mode: ModeOIDC,
				OIDC: OIDCConfig{
					IssuerURL:  "http://identity.example.test/tenant",
					Audience:   "api://planner",
					ClientID:   "planner-web",
					RolesClaim: "roles",
				},
			},
		},
		{
			name: "oidc accepts complete public metadata",
			config: Config{
				Mode: ModeOIDC,
				OIDC: OIDCConfig{
					IssuerURL:  "https://identity.example.test/tenant",
					Audience:   "api://planner",
					ClientID:   "planner-web",
					RolesClaim: "roles",
				},
			},
			valid: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			err := test.config.Validate()
			if test.valid && err != nil {
				t.Fatalf("Validate() error = %v", err)
			}
			if !test.valid && err == nil {
				t.Fatal("Validate() returned nil error")
			}
		})
	}
}

func TestRequireCapabilityDeniesWithoutExecutingHandler(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		service    *Service
		header     string
		wantStatus int
	}{
		{
			name:       "identity disabled",
			service:    mustService(t, Config{}, nil),
			wantStatus: http.StatusServiceUnavailable,
		},
		{
			name:       "provider unavailable",
			service:    mustService(t, validOIDCConfig(), nil),
			header:     "Bearer opaque-token",
			wantStatus: http.StatusServiceUnavailable,
		},
		{
			name: "credential absent",
			service: mustService(
				t,
				validOIDCConfig(),
				verifierStub{},
			),
			wantStatus: http.StatusUnauthorized,
		},
		{
			name: "credential invalid",
			service: mustService(
				t,
				validOIDCConfig(),
				verifierStub{err: errors.New("signature invalid")},
			),
			header:     "Bearer opaque-token",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name: "query token rejected",
			service: mustService(
				t,
				validOIDCConfig(),
				verifierStub{},
			),
			header:     "",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name: "unknown role",
			service: mustService(
				t,
				validOIDCConfig(),
				verifierStub{identity: VerifiedIdentity{
					Subject: "fixture-user",
					Roles:   []string{"administrator"},
				}},
			),
			header:     "Bearer opaque-token",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name: "insufficient capability",
			service: mustService(
				t,
				validOIDCConfig(),
				verifierStub{identity: VerifiedIdentity{
					Subject: "fixture-user",
					Roles:   []string{string(RoleViewer)},
				}},
			),
			header:     "Bearer opaque-token",
			wantStatus: http.StatusForbidden,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			invoked := false
			handler := RequireCapability(
				test.service,
				CapabilityCollaborationWrite,
				nil,
			)(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
				invoked = true
			}))
			request := httptest.NewRequest(http.MethodPost, "/future-write", nil)
			if test.name == "query token rejected" {
				request = httptest.NewRequest(
					http.MethodPost,
					"/future-write?access_token=not-accepted",
					nil,
				)
			}
			if test.header != "" {
				request.Header.Set("Authorization", test.header)
			}
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != test.wantStatus {
				t.Fatalf(
					"status = %d, want %d: %s",
					response.Code,
					test.wantStatus,
					response.Body.String(),
				)
			}
			if invoked {
				t.Fatal("protected handler executed")
			}
			if response.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf(
					"Cache-Control = %q, want no-store",
					response.Header().Get("Cache-Control"),
				)
			}
		})
	}
}

func TestSessionReportsBoundedConfiguredAndUnavailableStates(t *testing.T) {
	t.Parallel()

	unavailable := mustService(t, validOIDCConfig(), nil).Session(
		httptest.NewRequest(http.MethodGet, "/session", nil),
	)
	if unavailable.ConfigurationStatus != ConfigurationUnavailable ||
		unavailable.State != SessionAnonymous ||
		unavailable.CollaborationWrite != CollaborationUnavailable {
		t.Fatalf("unexpected unavailable session: %#v", unavailable)
	}

	configured := mustService(
		t,
		validOIDCConfig(),
		verifierStub{identity: VerifiedIdentity{
			Subject: "fixture-user",
			Roles:   []string{string(RolePlanEditor)},
		}},
	)
	request := httptest.NewRequest(http.MethodGet, "/session", nil)
	request.Header.Set("Authorization", "Bearer opaque-token")
	session := configured.Session(request)
	if session.ConfigurationStatus != ConfigurationConfigured ||
		session.State != SessionAuthenticated ||
		session.CollaborationWrite != CollaborationAvailable {
		t.Fatalf("unexpected configured session: %#v", session)
	}
	if len(session.Roles) != 1 || session.Roles[0] != RolePlanEditor {
		t.Fatalf("unexpected roles: %#v", session.Roles)
	}
	if len(session.Capabilities) != 2 ||
		session.Capabilities[0] != CapabilityCollaborationRead ||
		session.Capabilities[1] != CapabilityCollaborationWrite {
		t.Fatalf("unexpected capabilities: %#v", session.Capabilities)
	}
}

func TestApproverReceivesReadAndApprovalWithoutWrite(t *testing.T) {
	t.Parallel()

	service := mustService(
		t,
		validOIDCConfig(),
		verifierStub{identity: VerifiedIdentity{
			Subject: "fixture-approver",
			Roles:   []string{string(RolePlanApprover)},
		}},
	)
	request := httptest.NewRequest(http.MethodGet, "/session", nil)
	request.Header.Set("Authorization", "Bearer fixture-token")
	session := service.Session(request)
	if session.CollaborationRead != CollaborationAvailable ||
		session.CollaborationApprove != CollaborationAvailable ||
		session.CollaborationWrite != CollaborationDenied {
		t.Fatalf("unexpected approver session: %#v", session)
	}
}

func TestRequireCapabilityAllowsControlledWriter(t *testing.T) {
	t.Parallel()

	service := mustService(
		t,
		validOIDCConfig(),
		verifierStub{identity: VerifiedIdentity{
			Subject: "fixture-user",
			Roles:   []string{string(RolePlanEditor)},
		}},
	)
	invoked := false
	handler := RequireCapability(
		service,
		CapabilityCollaborationWrite,
		nil,
	)(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		invoked = true
		principal, ok := PrincipalFromContext(request.Context())
		if !ok || principal.Subject() != "fixture-user" {
			t.Fatal("authenticated principal missing from request context")
		}
		writer.WriteHeader(http.StatusNoContent)
	}))
	request := httptest.NewRequest(http.MethodPost, "/future-write", nil)
	request.Header.Set("Authorization", "Bearer opaque-token")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", response.Code)
	}
	if !invoked {
		t.Fatal("protected handler was not executed")
	}
}

func mustService(t *testing.T, config Config, verifier TokenVerifier) *Service {
	t.Helper()
	service, err := NewService(config, verifier)
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	return service
}

func validOIDCConfig() Config {
	return Config{
		Mode: ModeOIDC,
		OIDC: OIDCConfig{
			IssuerURL:  "https://identity.example.test/tenant",
			Audience:   "api://planner",
			ClientID:   "planner-web",
			RolesClaim: "roles",
		},
	}
}
