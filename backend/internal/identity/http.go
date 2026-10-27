package identity

import (
	"encoding/json"
	"errors"
	"net/http"
)

type AuthorizationOutcome string

const (
	AuthorizationDisabled    AuthorizationOutcome = "disabled"
	AuthorizationUnavailable AuthorizationOutcome = "unavailable"
	AuthorizationMissing     AuthorizationOutcome = "missing"
	AuthorizationInvalid     AuthorizationOutcome = "invalid"
	AuthorizationForbidden   AuthorizationOutcome = "forbidden"
	AuthorizationAuthorized  AuthorizationOutcome = "authorized"
)

type SessionState string

const (
	SessionAnonymous     SessionState = "anonymous"
	SessionAuthenticated SessionState = "authenticated"
)

type CollaborationWriteState string

const (
	CollaborationUnavailable CollaborationWriteState = "unavailable"
	CollaborationDenied      CollaborationWriteState = "denied"
	CollaborationAvailable   CollaborationWriteState = "available"
)

type Session struct {
	SchemaVersion        string                  `json:"schema_version"`
	AuthMode             Mode                    `json:"auth_mode"`
	State                SessionState            `json:"state"`
	ConfigurationStatus  ConfigurationStatus     `json:"configuration_status"`
	CollaborationWrite   CollaborationWriteState `json:"collaboration_write"`
	CollaborationRead    CollaborationWriteState `json:"collaboration_read"`
	CollaborationApprove CollaborationWriteState `json:"collaboration_approve"`
	Roles                []Role                  `json:"roles"`
	Capabilities         []Capability            `json:"capabilities"`
}

func (service *Service) Session(request *http.Request) Session {
	status := service.Status()
	session := Session{
		SchemaVersion:        "identity-session.v1",
		AuthMode:             status.Mode,
		State:                SessionAnonymous,
		ConfigurationStatus:  status.Configuration,
		CollaborationWrite:   CollaborationDenied,
		CollaborationRead:    CollaborationDenied,
		CollaborationApprove: CollaborationDenied,
		Roles:                []Role{},
		Capabilities:         []Capability{},
	}
	if status.Configuration == ConfigurationDisabled ||
		status.Configuration == ConfigurationUnavailable {
		session.CollaborationWrite = CollaborationUnavailable
		session.CollaborationRead = CollaborationUnavailable
		session.CollaborationApprove = CollaborationUnavailable
		return session
	}
	principal, err := service.Authenticate(request)
	if err != nil {
		return session
	}
	session.State = SessionAuthenticated
	session.Roles = principal.Roles()
	session.Capabilities = principal.Capabilities()
	if principal.HasCapability(CapabilityCollaborationWrite) {
		session.CollaborationWrite = CollaborationAvailable
	}
	if principal.HasCapability(CapabilityCollaborationRead) {
		session.CollaborationRead = CollaborationAvailable
	}
	if principal.HasCapability(CapabilityCollaborationApprove) {
		session.CollaborationApprove = CollaborationAvailable
	}
	return session
}

func SessionHandler(service Authenticator) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Cache-Control", "no-store")
		writer.Header().Set("Content-Type", "application/json")
		writer.WriteHeader(http.StatusOK)
		if err := json.NewEncoder(writer).Encode(service.Session(request)); err != nil {
			return
		}
	})
}

func RequireCapability(
	service Authenticator,
	required Capability,
	observe func(AuthorizationOutcome),
) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			principal, err := service.Authenticate(request)
			if err != nil {
				outcome, status, message := authenticationFailure(err)
				if observe != nil {
					observe(outcome)
				}
				if status == http.StatusUnauthorized {
					writer.Header().Set("WWW-Authenticate", "Bearer")
				}
				writeAuthorizationError(writer, status, message)
				return
			}
			if !principal.HasCapability(required) {
				if observe != nil {
					observe(AuthorizationForbidden)
				}
				writeAuthorizationError(
					writer,
					http.StatusForbidden,
					"insufficient permission",
				)
				return
			}
			if observe != nil {
				observe(AuthorizationAuthorized)
			}
			next.ServeHTTP(
				writer,
				request.WithContext(withPrincipal(request.Context(), principal)),
			)
		})
	}
}

func authenticationFailure(
	err error,
) (AuthorizationOutcome, int, string) {
	switch {
	case errors.Is(err, ErrDisabled):
		return AuthorizationDisabled,
			http.StatusServiceUnavailable,
			"identity is disabled"
	case errors.Is(err, ErrUnavailable):
		return AuthorizationUnavailable,
			http.StatusServiceUnavailable,
			"identity verification is unavailable"
	case errors.Is(err, ErrUnauthenticated):
		return AuthorizationMissing,
			http.StatusUnauthorized,
			"authentication is required"
	default:
		return AuthorizationInvalid,
			http.StatusUnauthorized,
			"credentials are invalid"
	}
}

func writeAuthorizationError(writer http.ResponseWriter, status int, message string) {
	writer.Header().Set("Cache-Control", "no-store")
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(map[string]string{"error": message})
}
