package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"os"
	"strings"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/staffidentity"
)

func staffConfigFromEnvironment() (staffidentity.Config, error) {
	cfg := staffidentity.Config{}
	mode := strings.TrimSpace(os.Getenv("STAFF_AUTH_MODE"))
	settings := []string{
		"STAFF_OIDC_ISSUER", "STAFF_OIDC_CLIENT_ID", "STAFF_OIDC_CLIENT_SECRET",
		"STAFF_OIDC_CLIENT_SECRET_FILE", "STAFF_PUBLIC_URL", "STAFF_DIRECTORY_FILE",
		"STAFF_ALLOW_LOOPBACK_HTTP", "STAFF_SESSION_LIFETIME",
	}
	if mode == "" || mode == "disabled" {
		for _, name := range settings {
			if os.Getenv(name) != "" {
				return cfg, errors.New("staff authentication settings require STAFF_AUTH_MODE=oidc")
			}
		}
		return cfg, nil
	}
	if mode != "oidc" {
		return cfg, errors.New("STAFF_AUTH_MODE must be disabled or oidc")
	}
	cfg.Enabled = true
	cfg.Issuer = strings.TrimSpace(os.Getenv("STAFF_OIDC_ISSUER"))
	cfg.ClientID = strings.TrimSpace(os.Getenv("STAFF_OIDC_CLIENT_ID"))
	cfg.PublicURL = strings.TrimSpace(os.Getenv("STAFF_PUBLIC_URL"))
	secret, err := secretFromEnvironmentOrFile("STAFF_OIDC_CLIENT_SECRET", "STAFF_OIDC_CLIENT_SECRET_FILE")
	if err != nil {
		return cfg, errors.New("failed to read staff OIDC client secret")
	}
	cfg.ClientSecret = secret
	cfg.ListenAddress = strings.TrimSpace(os.Getenv("LISTEN_ADDRESS"))
	if cfg.ListenAddress == "" {
		cfg.ListenAddress = net.JoinHostPort("", envOrDefault("PORT", "8080"))
	}
	if value := os.Getenv("STAFF_ALLOW_LOOPBACK_HTTP"); value != "" {
		if value != "true" && value != "false" {
			return cfg, errors.New("STAFF_ALLOW_LOOPBACK_HTTP must be true or false")
		}
		cfg.AllowLoopbackHTTP = value == "true"
	}
	if value := os.Getenv("STAFF_SESSION_LIFETIME"); value != "" {
		cfg.SessionLifetime, err = time.ParseDuration(value)
		if err != nil {
			return cfg, errors.New("invalid staff session lifetime")
		}
	}
	path := os.Getenv("STAFF_DIRECTORY_FILE")
	if path == "" {
		return cfg, errors.New("STAFF_DIRECTORY_FILE is required in oidc mode")
	}
	file, err := os.Open(path)
	if err != nil {
		return cfg, errors.New("cannot open staff directory file")
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() > 2<<20 {
		return cfg, errors.New("staff directory must be a regular file no larger than 2 MiB")
	}
	var directory struct {
		Organizations []staffidentity.Organization `json:"organizations"`
		Members       []staffidentity.Membership   `json:"members"`
	}
	decoder := json.NewDecoder(io.LimitReader(file, 2<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&directory); err != nil {
		return cfg, errors.New("invalid staff directory JSON")
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return cfg, errors.New("staff directory must contain exactly one JSON object")
	}
	cfg.Organizations, cfg.Members = directory.Organizations, directory.Members
	return cfg, nil
}

func staffServiceFromEnvironment() (*staffidentity.Service, error) {
	cfg, err := staffConfigFromEnvironment()
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return staffidentity.New(ctx, cfg)
}
