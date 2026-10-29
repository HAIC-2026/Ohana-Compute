package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func clearStaffEnvironment(t *testing.T) {
	t.Helper()
	for _, name := range []string{
		"STAFF_AUTH_MODE", "STAFF_OIDC_ISSUER", "STAFF_OIDC_CLIENT_ID",
		"STAFF_OIDC_CLIENT_SECRET", "STAFF_OIDC_CLIENT_SECRET_FILE",
		"STAFF_PUBLIC_URL", "STAFF_DIRECTORY_FILE", "STAFF_ALLOW_LOOPBACK_HTTP",
		"STAFF_SESSION_LIFETIME", "LISTEN_ADDRESS",
	} {
		t.Setenv(name, "")
	}
}

func TestStaffConfigDisabledByDefault(t *testing.T) {
	clearStaffEnvironment(t)
	cfg, err := staffConfigFromEnvironment()
	if err != nil || cfg.Enabled {
		t.Fatalf("default staff mode: %+v %v", cfg, err)
	}
	t.Setenv("STAFF_OIDC_ISSUER", "https://issuer.example")
	if _, err := staffConfigFromEnvironment(); err == nil {
		t.Fatal("partial staff configuration silently disabled")
	}
}

func TestStaffConfigDirectory(t *testing.T) {
	clearStaffEnvironment(t)
	// Use a project-local test artifact, not the operating system temporary area.
	file, err := os.CreateTemp(".", "staff-directory-test-*.json")
	if err != nil {
		t.Fatal(err)
	}
	path, err := filepath.Abs(file.Name())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Remove(path) })
	_, err = file.WriteString(`{"organizations":[{"id":"county-oahu","name":"Oahu","role":"county","counties":["003"]}],"members":[{"subject":"verified-subject","organization":"county-oahu"}]}`)
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	t.Setenv("STAFF_AUTH_MODE", "oidc")
	t.Setenv("STAFF_OIDC_ISSUER", "https://issuer.example")
	t.Setenv("STAFF_OIDC_CLIENT_ID", "client")
	t.Setenv("STAFF_OIDC_CLIENT_SECRET", "configured-secret")
	t.Setenv("STAFF_PUBLIC_URL", "https://app.example")
	t.Setenv("STAFF_DIRECTORY_FILE", path)
	t.Setenv("STAFF_SESSION_LIFETIME", "2h")
	t.Setenv("LISTEN_ADDRESS", "127.0.0.1:8080")
	cfg, err := staffConfigFromEnvironment()
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.Enabled || cfg.SessionLifetime != 2*time.Hour || cfg.Members[0].Subject != "verified-subject" ||
		cfg.Organizations[0].Role != "county" || cfg.ListenAddress != "127.0.0.1:8080" {
		t.Fatal("staff configuration not preserved")
	}
	if err := os.WriteFile(path, []byte(`{"organizations":[],"members":[],"unexpected":true}`), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := staffConfigFromEnvironment(); err == nil {
		t.Fatal("unknown directory field accepted")
	}
	if err := os.WriteFile(path, []byte(`{} {}`), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := staffConfigFromEnvironment(); err == nil {
		t.Fatal("multiple directory objects accepted")
	}
}
