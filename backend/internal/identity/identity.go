package identity

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"strings"
)

type Role string

const (
	RoleViewer       Role = "viewer"
	RolePlanEditor   Role = "plan_editor"
	RolePlanApprover Role = "plan_approver"
)

type Capability string

const (
	CapabilityCollaborationRead    Capability = "collaboration:read"
	CapabilityCollaborationWrite   Capability = "collaboration:write"
	CapabilityCollaborationApprove Capability = "collaboration:approve"
)

var (
	ErrDisabled           = errors.New("identity is disabled")
	ErrUnavailable        = errors.New("identity verification is unavailable")
	ErrUnauthenticated    = errors.New("authentication is required")
	ErrInvalidCredentials = errors.New("credentials are invalid")
	ErrInvalidIdentity    = errors.New("verified identity is invalid")
)

type VerifiedIdentity struct {
	Subject string
	Roles   []string
}

type TokenVerifier interface {
	Verify(context.Context, string) (VerifiedIdentity, error)
}

type Authenticator interface {
	Status() RuntimeStatus
	Authenticate(*http.Request) (Principal, error)
	Session(*http.Request) Session
}

type Principal struct {
	subject      string
	roles        []Role
	capabilities []Capability
}

func (principal Principal) Subject() string {
	return principal.subject
}

func (principal Principal) Roles() []Role {
	return slices.Clone(principal.roles)
}

func (principal Principal) Capabilities() []Capability {
	return slices.Clone(principal.capabilities)
}

func (principal Principal) HasCapability(required Capability) bool {
	return slices.Contains(principal.capabilities, required)
}

type ConfigurationStatus string

const (
	ConfigurationDisabled    ConfigurationStatus = "disabled"
	ConfigurationConfigured  ConfigurationStatus = "configured"
	ConfigurationUnavailable ConfigurationStatus = "unavailable"
)

type RuntimeStatus struct {
	Mode          Mode
	Configuration ConfigurationStatus
}

type Service struct {
	config   Config
	verifier TokenVerifier
}

func NewService(config Config, verifier TokenVerifier) (*Service, error) {
	config = config.normalized()
	if err := config.Validate(); err != nil {
		return nil, err
	}
	return &Service{config: config, verifier: verifier}, nil
}

func (service *Service) Status() RuntimeStatus {
	if service == nil || service.config.Mode == ModeDisabled {
		return RuntimeStatus{
			Mode:          ModeDisabled,
			Configuration: ConfigurationDisabled,
		}
	}
	if service.verifier == nil {
		return RuntimeStatus{
			Mode:          ModeOIDC,
			Configuration: ConfigurationUnavailable,
		}
	}
	return RuntimeStatus{
		Mode:          ModeOIDC,
		Configuration: ConfigurationConfigured,
	}
}

func (service *Service) Authenticate(request *http.Request) (Principal, error) {
	status := service.Status()
	switch status.Configuration {
	case ConfigurationDisabled:
		return Principal{}, ErrDisabled
	case ConfigurationUnavailable:
		return Principal{}, ErrUnavailable
	}

	if hasQueryCredential(request) {
		return Principal{}, ErrInvalidCredentials
	}
	values := request.Header.Values("Authorization")
	if len(values) == 0 {
		return Principal{}, ErrUnauthenticated
	}
	if len(values) != 1 {
		return Principal{}, ErrInvalidCredentials
	}
	header := strings.TrimSpace(values[0])
	if len(header) > 8192 {
		return Principal{}, ErrInvalidCredentials
	}
	scheme, token, ok := strings.Cut(header, " ")
	if !ok ||
		!strings.EqualFold(scheme, "Bearer") ||
		token == "" ||
		strings.ContainsAny(token, " \t\r\n") {
		return Principal{}, ErrInvalidCredentials
	}

	verified, err := service.verifier.Verify(request.Context(), token)
	if err != nil {
		return Principal{}, ErrInvalidCredentials
	}
	return principalFromVerified(verified)
}

func principalFromVerified(verified VerifiedIdentity) (Principal, error) {
	subject := strings.TrimSpace(verified.Subject)
	if subject == "" || len(subject) > 512 || len(verified.Roles) > 16 {
		return Principal{}, ErrInvalidIdentity
	}

	roles := make([]Role, 0, len(verified.Roles))
	capabilities := make([]Capability, 0, 3)
	seenRoles := make(map[Role]struct{}, len(verified.Roles))
	for _, claimed := range verified.Roles {
		role := Role(strings.TrimSpace(claimed))
		switch role {
		case RoleViewer:
			if !slices.Contains(capabilities, CapabilityCollaborationRead) {
				capabilities = append(capabilities, CapabilityCollaborationRead)
			}
		case RolePlanEditor:
			if !slices.Contains(capabilities, CapabilityCollaborationRead) {
				capabilities = append(capabilities, CapabilityCollaborationRead)
			}
			if !slices.Contains(capabilities, CapabilityCollaborationWrite) {
				capabilities = append(capabilities, CapabilityCollaborationWrite)
			}
		case RolePlanApprover:
			if !slices.Contains(capabilities, CapabilityCollaborationRead) {
				capabilities = append(capabilities, CapabilityCollaborationRead)
			}
			if !slices.Contains(capabilities, CapabilityCollaborationApprove) {
				capabilities = append(capabilities, CapabilityCollaborationApprove)
			}
		default:
			return Principal{}, ErrInvalidIdentity
		}
		if _, seen := seenRoles[role]; !seen {
			seenRoles[role] = struct{}{}
			roles = append(roles, role)
		}
	}
	slices.Sort(roles)
	slices.Sort(capabilities)
	return Principal{
		subject:      subject,
		roles:        roles,
		capabilities: capabilities,
	}, nil
}

func hasQueryCredential(request *http.Request) bool {
	query := request.URL.Query()
	for _, key := range []string{"access_token", "id_token", "token"} {
		if query.Has(key) {
			return true
		}
	}
	return false
}

type principalContextKey struct{}

func PrincipalFromContext(ctx context.Context) (Principal, bool) {
	principal, ok := ctx.Value(principalContextKey{}).(Principal)
	return principal, ok
}

func withPrincipal(ctx context.Context, principal Principal) context.Context {
	return context.WithValue(ctx, principalContextKey{}, principal)
}
