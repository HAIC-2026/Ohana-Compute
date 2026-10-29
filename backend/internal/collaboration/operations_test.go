package collaboration

import (
	"context"
	"errors"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestOperationalHandoffAndReadiness(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "operations.db")
	store, err := OpenSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	county := OpsActor{"county-user", "county-team", "county", []string{"003"}}
	state := OpsActor{"state-user", "state-team", "state", []string{"003"}}
	driver := OpsActor{"driver-user", "transport-one", "transport", []string{"003"}}
	backup := OpsActor{"backup-user", "transport-two", "transport", []string{"003"}}
	receiver := OpsActor{"receiver-user", "receiving-team", "receiving", []string{"003"}}
	foreign := OpsActor{"foreign-user", "other-county", "county", []string{"009"}}
	input := OpsCreate{Key: "create-request", Mode: "exercise", County: "003", Hazard: "hurricane", IncidentRef: "DRILL-001", IntakeRef: "EXERCISE-001", People: 1, Assistance: "accessible_vehicle", DueAt: now.Add(time.Hour)}
	request, err := store.CreateOpsRequest(ctx, input, county, now)
	if err != nil {
		t.Fatal(err)
	}
	same, err := store.CreateOpsRequest(ctx, input, county, now)
	if err != nil || same.ID != request.ID {
		t.Fatalf("idempotent create: %+v %v", same, err)
	}
	for _, actor := range []OpsActor{foreign, driver, state} {
		rows, err := store.ListOpsRequests(ctx, actor)
		if err != nil || len(rows) != 0 {
			t.Fatalf("leaked request to %s: %v %v", actor.Organization, rows, err)
		}
	}
	step := func(actor OpsActor, action, organization, reason string) {
		t.Helper()
		cmd := OpsCommand{Key: "command-" + action + "-" + time.Duration(request.Revision).String(), ExpectedRevision: request.Revision, Action: action, Organization: organization, Reason: reason}
		if action == "accept" {
			eta := now.Add(30 * time.Minute)
			cmd.ETA = &eta
		}
		next, err := store.CommandOpsRequest(ctx, request.ID, cmd, actor, now.Add(time.Duration(request.Revision)*time.Minute))
		if err != nil {
			t.Fatalf("%s by %s: %v", action, actor.Organization, err)
		}
		replayed, err := store.CommandOpsRequest(ctx, request.ID, cmd, actor, now.Add(20*time.Minute))
		if err != nil || replayed.Revision != next.Revision {
			t.Fatalf("replay: %v", err)
		}
		request = next
	}
	step(county, "verify", "", "")
	step(county, "set_receiving", receiver.Organization, "")
	step(receiver, "receiving_ready", "", "")
	step(county, "offer", driver.Organization, "")
	step(driver, "decline", "", "no_vehicle")
	step(county, "escalate", "", "")
	if _, err := store.CommandOpsRequest(ctx, request.ID, OpsCommand{Key: "state-cannot-cancel", ExpectedRevision: request.Revision, Action: "cancel"}, state, now); !errors.Is(err, ErrOpsForbidden) {
		t.Fatalf("State cannot replace County movement authority: %v", err)
	}
	rows, err := store.ListOpsRequests(ctx, state)
	if err != nil || len(rows) != 1 {
		t.Fatalf("state escalation: %v %v", rows, err)
	}
	step(state, "offer", backup.Organization, "")
	if _, err := store.CommandOpsRequest(ctx, request.ID, OpsCommand{Key: "old-driver", ExpectedRevision: request.Revision, Action: "pickup"}, driver, now); !errors.Is(err, ErrOpsForbidden) {
		t.Fatalf("old provider: %v", err)
	}
	step(backup, "accept", "", "")
	if _, err := store.CommandOpsRequest(ctx, request.ID, OpsCommand{Key: "early-pickup", ExpectedRevision: request.Revision, Action: "pickup"}, backup, now); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("unreleased pickup: %v", err)
	}
	step(county, "release", "", "")
	step(backup, "pickup", "", "")
	step(backup, "report_blocker", "", "unsafe_route")
	if _, err := store.CommandOpsRequest(ctx, request.ID, OpsCommand{Key: "blocked-arrival", ExpectedRevision: request.Revision, Action: "arrive"}, receiver, now); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("blocked arrival: %v", err)
	}
	step(county, "resolve_blocker", "", "")
	step(county, "release", "", "")
	step(receiver, "arrive", "", "")
	step(county, "close", "", "")
	task, err := store.CreateReadinessTask(ctx, request.ID, ReadinessCreate{Key: "task-create", ExpectedRevision: request.Revision, Organization: driver.Organization, Gap: "transport_agreement", DueAt: now.Add(24 * time.Hour)}, county, now)
	if err != nil {
		t.Fatal(err)
	}
	task, err = store.CommandReadinessTask(ctx, task.ID, ReadinessCommand{Key: "task-submit", ExpectedRevision: task.Revision, Action: "submit", EvidenceRef: "AGREEMENT-001"}, driver, now)
	if err != nil || task.Status != "in_review" {
		t.Fatalf("submit: %v", err)
	}
	task, err = store.CommandReadinessTask(ctx, task.ID, ReadinessCommand{Key: "task-approve", ExpectedRevision: task.Revision, Action: "approve"}, county, now)
	if err != nil || task.Status != "closed" {
		t.Fatalf("review: %v", err)
	}
	if _, err := store.db.Exec(`UPDATE operational_audit SET action='forged'`); err == nil {
		t.Fatal("audit mutable")
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	store, err = OpenSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	rows, err = store.ListOpsRequests(ctx, county)
	if err != nil || len(rows) != 1 || rows[0].Status != "closed" || len(rows[0].Events) != 16 {
		t.Fatalf("restart request: %+v %v", rows, err)
	}
	tasks, err := store.ListReadinessTasks(ctx, driver)
	if err != nil || len(tasks) != 1 || tasks[0].Status != "closed" {
		t.Fatalf("restart task: %+v %v", tasks, err)
	}
}

func TestOpsConflictsAndGuards(t *testing.T) {
	store, err := OpenSQLite(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	ctx := context.Background()
	now := time.Now().UTC()
	actor := OpsActor{"owner", "county-team", "county", []string{"003"}}
	input := OpsCreate{Key: "create-001", Mode: "operational", County: "003", Hazard: "flood", IncidentRef: "EVENT-001", IntakeRef: "REF-001", People: 1, Assistance: "mobility_assistance", DueAt: now.Add(time.Hour)}
	request, err := store.CreateOpsRequest(ctx, input, actor, now)
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for _, key := range []string{"parallel-one", "parallel-two"} {
		wg.Add(1)
		go func(key string) {
			defer wg.Done()
			_, err := store.CommandOpsRequest(ctx, request.ID, OpsCommand{Key: key, ExpectedRevision: 1, Action: "verify"}, actor, now)
			errs <- err
		}(key)
	}
	wg.Wait()
	close(errs)
	success, conflict := 0, 0
	for err := range errs {
		if err == nil {
			success++
		} else if errors.Is(err, ErrConflict) {
			conflict++
		} else {
			t.Fatal(err)
		}
	}
	if success != 1 || conflict != 1 {
		t.Fatalf("concurrency: %d %d", success, conflict)
	}
	input.People = 2
	if _, err := store.CreateOpsRequest(ctx, input, actor, now); !errors.Is(err, ErrConflict) {
		t.Fatalf("key reuse: %v", err)
	}
	input.Key = "new-invalid"
	input.IntakeRef = "Name and street address"
	if _, err := store.CreateOpsRequest(ctx, input, actor, now); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("free text: %v", err)
	}
	task, err := store.CreateReadinessTask(ctx, request.ID, ReadinessCreate{
		Key: "own-task", ExpectedRevision: 2, Organization: actor.Organization,
		Gap: "accessible_warning", DueAt: now.Add(24 * time.Hour),
	}, actor, now)
	if err != nil {
		t.Fatal(err)
	}
	task, err = store.CommandReadinessTask(ctx, task.ID, ReadinessCommand{
		Key: "own-submission", ExpectedRevision: task.Revision, Action: "submit", EvidenceRef: "REVIEW-001",
	}, actor, now)
	if err != nil {
		t.Fatal(err)
	}
	_, err = store.CommandReadinessTask(ctx, task.ID, ReadinessCommand{
		Key: "self-review", ExpectedRevision: task.Revision, Action: "approve",
	}, actor, now)
	if !errors.Is(err, ErrOpsForbidden) {
		t.Fatalf("self review accepted: %v", err)
	}
	other := actor
	other.Subject = "independent-reviewer"
	if _, err := store.CommandReadinessTask(ctx, task.ID, ReadinessCommand{
		Key: "independent-review", ExpectedRevision: task.Revision, Action: "approve",
	}, other, now); err != nil {
		t.Fatal(err)
	}
	stats, err := store.OperationalMetrics(ctx, now.Add(2*time.Hour))
	if err != nil || stats.Counts[[3]string{"operational", "condition", "overdue"}] != 1 {
		t.Fatalf("durable overdue condition: %+v %v", stats, err)
	}
}
