package identity

import (
	"errors"
	"fmt"
	"net/url"
	"strings"
)

type Mode string

const (
	ModeDisabled Mode = "disabled"
	ModeOIDC     Mode = "oidc"
)

type OIDCConfig struct {
	IssuerURL  string
	Audience   string
	ClientID   string
	RolesClaim string
}

type Config struct {
	Mode Mode
	OIDC OIDCConfig
}

func (config Config) Validate() error {
	config = config.normalized()
	switch config.Mode {
	case ModeDisabled:
		if config.OIDC != (OIDCConfig{}) {
			return errors.New("identity: OIDC settings require IDENTITY_MODE=oidc")
		}
		return nil
	case ModeOIDC:
		return config.OIDC.validate()
	default:
		return fmt.Errorf("identity: unsupported mode %q", config.Mode)
	}
}

func (config Config) normalized() Config {
	if config.Mode == "" {
		config.Mode = ModeDisabled
	}
	config.OIDC.IssuerURL = strings.TrimSpace(config.OIDC.IssuerURL)
	config.OIDC.Audience = strings.TrimSpace(config.OIDC.Audience)
	config.OIDC.ClientID = strings.TrimSpace(config.OIDC.ClientID)
	config.OIDC.RolesClaim = strings.TrimSpace(config.OIDC.RolesClaim)
	return config
}

func (config OIDCConfig) validate() error {
	if config.IssuerURL == "" ||
		config.Audience == "" ||
		config.ClientID == "" ||
		config.RolesClaim == "" {
		return errors.New(
			"identity: OIDC issuer, audience, client ID, and roles claim are required",
		)
	}
	if len(config.IssuerURL) > 2048 ||
		len(config.Audience) > 256 ||
		len(config.ClientID) > 256 ||
		len(config.RolesClaim) > 128 {
		return errors.New("identity: OIDC setting exceeds the supported length")
	}
	issuer, err := url.Parse(config.IssuerURL)
	if err != nil ||
		issuer.Scheme != "https" ||
		issuer.Host == "" ||
		issuer.User != nil ||
		issuer.RawQuery != "" ||
		issuer.Fragment != "" {
		return errors.New("identity: OIDC issuer must be an HTTPS origin or path")
	}
	if strings.ContainsAny(config.Audience, "\r\n") ||
		strings.ContainsAny(config.ClientID, "\r\n") {
		return errors.New("identity: OIDC audience and client ID must be single-line values")
	}
	if config.RolesClaim != "roles" {
		return errors.New("identity: only the controlled roles claim is supported")
	}
	return nil
}
