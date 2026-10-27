package main

import (
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/identity"
)

func TestSecretFromEnvironmentOrFileUsesEnvironment(t *testing.T) {
	t.Setenv("TEST_SECRET", " environment-value ")
	t.Setenv("TEST_SECRET_FILE", filepath.Join(t.TempDir(), "missing"))

	value, err := secretFromEnvironmentOrFile("TEST_SECRET", "TEST_SECRET_FILE")
	if err != nil {
		t.Fatalf("secretFromEnvironmentOrFile returned error: %v", err)
	}
	if value != "environment-value" {
		t.Fatalf("value = %q, want environment-value", value)
	}
}

func TestSecretFromEnvironmentOrFileUsesFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "secret")
	if err := os.WriteFile(path, []byte(" file-value\n"), 0o600); err != nil {
		t.Fatalf("write secret: %v", err)
	}
	t.Setenv("TEST_SECRET", "")
	t.Setenv("TEST_SECRET_FILE", path)

	value, err := secretFromEnvironmentOrFile("TEST_SECRET", "TEST_SECRET_FILE")
	if err != nil {
		t.Fatalf("secretFromEnvironmentOrFile returned error: %v", err)
	}
	if value != "file-value" {
		t.Fatalf("value = %q, want file-value", value)
	}
}

func TestSecretFromEnvironmentOrFileFailsForUnreadableFile(t *testing.T) {
	t.Setenv("TEST_SECRET", "")
	t.Setenv("TEST_SECRET_FILE", filepath.Join(t.TempDir(), "missing"))

	if _, err := secretFromEnvironmentOrFile("TEST_SECRET", "TEST_SECRET_FILE"); err == nil {
		t.Fatal("secretFromEnvironmentOrFile returned nil error")
	}
}

func TestPositiveIntOrDefault(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))

	t.Setenv("TEST_RATE", "2400")
	if got := positiveIntOrDefault("TEST_RATE", 1200, logger); got != 2400 {
		t.Fatalf("positiveIntOrDefault = %d, want 2400", got)
	}

	t.Setenv("TEST_RATE", "invalid")
	if got := positiveIntOrDefault("TEST_RATE", 1200, logger); got != 1200 {
		t.Fatalf("positiveIntOrDefault fallback = %d, want 1200", got)
	}
}

func TestIdentityConfigFromEnvironment(t *testing.T) {
	t.Setenv("IDENTITY_MODE", "oidc")
	t.Setenv("OIDC_ISSUER_URL", "https://identity.example.test/tenant")
	t.Setenv("OIDC_AUDIENCE", "api://planner")
	t.Setenv("OIDC_CLIENT_ID", "planner-web")
	t.Setenv("OIDC_ROLES_CLAIM", "roles")

	config, err := identityConfigFromEnvironment()
	if err != nil {
		t.Fatalf("identityConfigFromEnvironment() error = %v", err)
	}
	if config.Mode != identity.ModeOIDC ||
		config.OIDC.Audience != "api://planner" {
		t.Fatalf("unexpected identity config: %#v", config)
	}
}

func TestIdentityConfigFromEnvironmentRejectsPartialSettings(t *testing.T) {
	t.Setenv("IDENTITY_MODE", "oidc")
	t.Setenv("OIDC_ISSUER_URL", "https://identity.example.test/tenant")
	t.Setenv("OIDC_AUDIENCE", "")
	t.Setenv("OIDC_CLIENT_ID", "planner-web")
	t.Setenv("OIDC_ROLES_CLAIM", "roles")

	if _, err := identityConfigFromEnvironment(); err == nil {
		t.Fatal("identityConfigFromEnvironment() returned nil error")
	}
}

func TestCollaborationStoreFromEnvironmentDefaultsDisabled(t *testing.T) {
	t.Setenv("COLLABORATION_PERSISTENCE", "")
	t.Setenv("COLLABORATION_SQLITE_PATH", "")

	store, err := collaborationStoreFromEnvironment()
	if err != nil {
		t.Fatalf("collaborationStoreFromEnvironment() error = %v", err)
	}
	if store != nil {
		t.Fatal("disabled collaboration unexpectedly returned a store")
	}
}

func TestCollaborationStoreFromEnvironmentRequiresExplicitSQLiteMode(t *testing.T) {
	t.Setenv("COLLABORATION_PERSISTENCE", "disabled")
	t.Setenv("COLLABORATION_SQLITE_PATH", filepath.Join(t.TempDir(), "plans.db"))

	if _, err := collaborationStoreFromEnvironment(); err == nil {
		t.Fatal("collaborationStoreFromEnvironment() returned nil error")
	}
}

func TestCollaborationStoreFromEnvironmentOpensDurableSQLite(t *testing.T) {
	t.Setenv("COLLABORATION_PERSISTENCE", "sqlite")
	t.Setenv("COLLABORATION_SQLITE_PATH", filepath.Join(t.TempDir(), "plans.db"))

	store, err := collaborationStoreFromEnvironment()
	if err != nil {
		t.Fatalf("collaborationStoreFromEnvironment() error = %v", err)
	}
	if store == nil {
		t.Fatal("SQLite collaboration returned nil store")
	}
	if err := store.Close(); err != nil {
		t.Fatalf("store.Close() error = %v", err)
	}
}
