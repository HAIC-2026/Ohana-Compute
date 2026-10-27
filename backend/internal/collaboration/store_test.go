package collaboration

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"sync"
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

func TestSQLiteStoreConcurrentCreatorsAndReaders(t *testing.T) {
	t.Parallel()

	store, err := OpenSQLite(filepath.Join(t.TempDir(), "collaboration.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	const count = 24
	ids := make(chan string, count)
	failures := make(chan error, count)
	var creators sync.WaitGroup
	for index := range count {
		creators.Add(1)
		go func() {
			defer creators.Done()
			input := fixtureCreateInput()
			input.Title = fmt.Sprintf("Concurrent plan %d", index)
			plan, err := store.Create(context.Background(), input, "plan_editor")
			if err != nil {
				failures <- err
				return
			}
			ids <- plan.ID
		}()
	}
	creators.Wait()
	close(ids)
	close(failures)
	for err := range failures {
		t.Fatalf("concurrent Create() error = %v", err)
	}

	var readers sync.WaitGroup
	readFailures := make(chan error, count)
	for planID := range ids {
		readers.Add(1)
		go func() {
			defer readers.Done()
			plan, err := store.Get(context.Background(), planID)
			if err != nil {
				readFailures <- err
				return
			}
			if plan.CurrentVersion != 1 || len(plan.Audit) != 1 {
				readFailures <- fmt.Errorf("incomplete concurrent plan %s", planID)
			}
		}()
	}
	readers.Wait()
	close(readFailures)
	for err := range readFailures {
		t.Fatal(err)
	}
}

func TestSQLiteStoreConcurrentStaleWritersDoNotLoseUpdates(t *testing.T) {
	t.Parallel()

	store, err := OpenSQLite(filepath.Join(t.TempDir(), "collaboration.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	plan, err := store.Create(context.Background(), fixtureCreateInput(), "plan_editor")
	if err != nil {
		t.Fatal(err)
	}

	const writers = 20
	results := make(chan error, writers)
	var waitGroup sync.WaitGroup
	for index := range writers {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			results <- func() error {
				_, err := store.Update(context.Background(), plan.ID, UpdateInput{
					ExpectedRevision: plan.Revision,
					Title:            fmt.Sprintf("Concurrent update %d", index),
					Summary:          "Only one stale writer may commit.",
					Status:           StatusInReview,
					Snapshot:         fixtureSnapshot("concurrent"),
				}, "plan_editor")
				return err
			}()
		}()
	}
	waitGroup.Wait()
	close(results)

	successes := 0
	conflicts := 0
	for err := range results {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, ErrConflict):
			conflicts++
		default:
			t.Fatalf("unexpected concurrent Update() error = %v", err)
		}
	}
	if successes != 1 || conflicts != writers-1 {
		t.Fatalf("successes=%d conflicts=%d, want 1 and %d", successes, conflicts, writers-1)
	}
	persisted, err := store.Get(context.Background(), plan.ID)
	if err != nil {
		t.Fatal(err)
	}
	if persisted.Revision != plan.Revision+1 ||
		persisted.CurrentVersion != plan.CurrentVersion+1 ||
		len(persisted.Versions) != 2 {
		t.Fatalf("concurrent writers produced inconsistent plan: %#v", persisted)
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
			Stage: "map", Reference: "oahu-town", Status: "available",
			Summary: value + " aggregate map output",
		}},
	}
}
