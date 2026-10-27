package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/identity"
)

func TestIdentitySessionIsAnonymousAndPrivacySafeByDefault(t *testing.T) {
	t.Parallel()

	server := NewServer(identityTestConfig(t, nil))
	privateCredential := "fixture-sensitive-credential"
	request := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/identity/session",
		nil,
	)
	request.Header.Set("Authorization", "Bearer "+privateCredential)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", response.Code, response.Body.String())
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", response.Header().Get("Cache-Control"))
	}
	body := response.Body.Bytes()
	var session identity.Session
	if err := json.NewDecoder(bytes.NewReader(body)).Decode(&session); err != nil {
		t.Fatalf("decode session: %v", err)
	}
	if session.AuthMode != identity.ModeDisabled ||
		session.State != identity.SessionAnonymous ||
		session.ConfigurationStatus != identity.ConfigurationDisabled ||
		session.CollaborationWrite != identity.CollaborationUnavailable {
		t.Fatalf("unexpected session: %#v", session)
	}
	for _, forbidden := range []string{
		privateCredential,
		"subject",
		"email",
		"issuer",
		"audience",
		"name",
	} {
		if strings.Contains(strings.ToLower(string(body)), forbidden) {
			t.Fatalf("session leaked %q: %s", forbidden, body)
		}
	}
}

func TestAuthorizationCheckUsesWriteGuardAndBoundedMetrics(t *testing.T) {
	t.Parallel()

	server := NewServer(identityTestConfig(t, nil))
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		response,
		httptest.NewRequest(
			http.MethodPost,
			"/api/v1/identity/authorization-check",
			nil,
		),
	)
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf(
			"status = %d, want 503: %s",
			response.Code,
			response.Body.String(),
		)
	}

	metrics := httptest.NewRecorder()
	server.Handler().ServeHTTP(
		metrics,
		httptest.NewRequest(http.MethodGet, "/metrics", nil),
	)
	body := metrics.Body.String()
	if !strings.Contains(
		body,
		`hawaii_resilience_identity_authorization_total{outcome="disabled"} 1`,
	) {
		t.Fatalf("identity metric missing: %s", body)
	}
	for _, forbidden := range []string{"role=", "subject=", "issuer=", "audience="} {
		if strings.Contains(body, forbidden) {
			t.Fatalf("identity metrics contain unbounded label %q", forbidden)
		}
	}
}

func identityTestConfig(t *testing.T, service identity.Authenticator) Config {
	t.Helper()
	if service == nil {
		var err error
		service, err = identity.NewService(identity.Config{}, nil)
		if err != nil {
			t.Fatalf("create disabled identity service: %v", err)
		}
	}
	return Config{
		Alerts:          alertReaderStub{},
		Cyclones:        cycloneReaderStub{},
		TsunamiProducts: tsunamiProductReaderStub{},
		Official:        &officialReaderStub{},
		Community:       &communityReaderStub{},
		Transportation:  &transportationReaderStub{},
		Identity:        service,
	}
}
