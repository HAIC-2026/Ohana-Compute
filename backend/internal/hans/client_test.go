package hans

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestSnapshotIsProvisionallyUnavailableAndDisabled(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 27, 8, 0, 0, 0, time.UTC)
	snapshot, err := NewClient(func() time.Time { return now }).Snapshot(
		context.Background(),
	)
	if err != nil {
		t.Fatalf("Snapshot returned error: %v", err)
	}
	if snapshot.Status != "unavailable" ||
		!snapshot.Provisional ||
		snapshot.ProductionOn {
		t.Fatalf("unexpected HANS state: %#v", snapshot)
	}
	if !strings.Contains(snapshot.Limitation, "not scraped") {
		t.Fatalf("expected no-scrape limitation: %q", snapshot.Limitation)
	}
}
