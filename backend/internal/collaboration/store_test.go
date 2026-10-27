package collaboration

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"
)

func TestSQLiteStorePersistsVersionsAcrossReopenAndRejectsStaleWrites(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "collaboration.db")
	store, err := OpenSQLite(path)
	if err != nil {
		t.Fatalf("OpenSQLite() error = %v", err)
	}
	ctx := context.Background()
	plan, err := store.Create(ctx, fixtureCreateInput(), "plan_editor")
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	staleRevision := plan.Revision
	plan, err = store.Update(ctx, plan.ID, UpdateInput{
		ExpectedRevision: plan.Revision,
		Title:            "Second operational draft",
		Summary:          "Updated aggregate coordination summary.",
		Status:           StatusInReview,
		Snapshot:         fixtureSnapshot("second"),
	}, "plan_editor")
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	_, err = store.Update(ctx, plan.ID, UpdateInput{
		ExpectedRevision: staleRevision,
		Title:            "Stale overwrite",
		Summary:          "This must not replace the second version.",
		Status:           StatusDraft,
		Snapshot:         fixtureSnapshot("stale"),
	}, "plan_editor")
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("stale Update() error = %v, want ErrConflict", err)
	}
	if err := store.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}

	reopened, err := OpenSQLite(path)
	if err != nil {
		t.Fatalf("reopen SQLite error = %v", err)
	}
	defer reopened.Close()
	persisted, err := reopened.Get(ctx, plan.ID)
	if err != nil {
		t.Fatalf("Get() after reopen error = %v", err)
	}
	if persisted.CurrentVersion != 2 || len(persisted.Versions) != 2 {
		t.Fatalf("persisted versions = %#v", persisted.Versions)
	}
	if persisted.Title != "Second operational draft" {
		t.Fatalf("persisted title = %q", persisted.Title)
	}
	comparison, err := reopened.Compare(ctx, plan.ID, 1, 2)
	if err != nil {
		t.Fatalf("Compare() error = %v", err)
	}
	if len(comparison.ChangedFields) == 0 {
		t.Fatal("comparison did not report changed fields")
	}
}

func TestSQLiteStoreRecordsStructuredCollaborationEvents(t *testing.T) {
	t.Parallel()

	store, err := OpenSQLite(filepath.Join(t.TempDir(), "collaboration.db"))
	if err != nil {
		t.Fatalf("OpenSQLite() error = %v", err)
	}
	defer store.Close()
	ctx := context.Background()
	plan, err := store.Create(ctx, fixtureCreateInput(), "plan_editor")
	if err != nil {
		t.Fatal(err)
	}
	plan, err = store.AddComment(ctx, plan.ID, CommentInput{
		ExpectedRevision: plan.Revision,
		Body:             "Confirm accessible transport staging with the county team.",
	}, "plan_editor")
	if err != nil {
		t.Fatal(err)
	}
	plan, err = store.AddAssignment(ctx, plan.ID, AssignmentInput{
		ExpectedRevision: plan.Revision,
		Role:             "transportation_coordination",
		Capability:       "validate_routes",
		Status:           "active",
		DueStart:         time.Now().UTC(),
		DueEnd:           time.Now().UTC().Add(24 * time.Hour),
	}, "plan_editor")
	if err != nil {
		t.Fatal(err)
	}
	plan, err = store.AddApproval(ctx, plan.ID, ApprovalInput{
		ExpectedRevision: plan.Revision,
		Version:          plan.CurrentVersion,
		Decision:         "approved",
		Rationale:        "Aggregate checks are ready for configured review.",
	}, "plan_approver")
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Comments) != 1 || len(plan.Assignments) != 1 || len(plan.Approvals) != 1 {
		t.Fatalf("unexpected aggregate: %#v", plan)
	}
	if len(plan.Audit) != 4 {
		t.Fatalf("audit events = %d, want 4", len(plan.Audit))
	}
}

func fixtureCreateInput() CreateInput {
	return CreateInput{
		Jurisdiction: "honolulu",
		AreaRef:      "oahu-town",
		EventRef:     "hurricane-lala",
		Hazard:       "hurricane",
		Title:        "Mass care operational draft",
		Summary:      "Aggregate coordination summary for planning use.",
		Status:       StatusDraft,
		Snapshot:     fixtureSnapshot("first"),
	}
}

func fixtureSnapshot(value string) Snapshot {
	return Snapshot{
		Checklist: []ChecklistAction{{
			Title: "Confirm shelter accessibility", Owner: "Shelter operations",
			Timing: "Before public guidance",
		}},
		SourceRefs: []string{"acs-5-year", "fema-open-shelters"},
		Outputs: []OutputReference{{
			Stage: "map", Reference: "oahu-town", Summary: value + " aggregate map output",
		}},
	}
}
