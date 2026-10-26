package main

import (
	"log/slog"
	"os"
	"path/filepath"
	"testing"
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
