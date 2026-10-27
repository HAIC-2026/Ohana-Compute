package collaboration

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

type Store interface {
	Create(context.Context, CreateInput, string) (Plan, error)
	Get(context.Context, string) (Plan, error)
	Update(context.Context, string, UpdateInput, string) (Plan, error)
	ApplyAIDraft(context.Context, string, AIApplyInput, string) (Plan, error)
	AddComment(context.Context, string, CommentInput, string) (Plan, error)
	AddAssignment(context.Context, string, AssignmentInput, string) (Plan, error)
	AddApproval(context.Context, string, ApprovalInput, string) (Plan, error)
	Compare(context.Context, string, int, int) (Comparison, error)
	Close() error
}

type SQLiteStore struct {
	db *sql.DB
}

func OpenSQLite(path string) (*SQLiteStore, error) {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return nil, errors.New("collaboration: SQLite path is required")
	}
	if trimmed != ":memory:" && !filepath.IsAbs(trimmed) {
		return nil, errors.New("collaboration: SQLite path must be absolute")
	}
	dsn := trimmed
	if trimmed != ":memory:" {
		dsn = "file:" + url.PathEscape(trimmed)
	}
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("collaboration: open SQLite: %w", err)
	}
	db.SetMaxOpenConns(1)
	store := &SQLiteStore{db: db}
	if err := store.initialize(context.Background()); err != nil {
		_ = db.Close()
		return nil, err
	}
	return store, nil
}

func (store *SQLiteStore) initialize(ctx context.Context) error {
	if store == nil || store.db == nil {
		return errors.New("collaboration: SQLite store is unavailable")
	}
	for _, pragma := range []string{
		"PRAGMA foreign_keys = ON",
		"PRAGMA busy_timeout = 5000",
		"PRAGMA journal_mode = WAL",
		"PRAGMA synchronous = FULL",
	} {
		if _, err := store.db.ExecContext(ctx, pragma); err != nil {
			return fmt.Errorf("collaboration: apply %s: %w", pragma, err)
		}
	}
	if _, err := store.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			applied_at TEXT NOT NULL
		);
	`); err != nil {
		return fmt.Errorf("collaboration: create migration table: %w", err)
	}
	var version int
	err := store.db.QueryRowContext(ctx, "SELECT COALESCE(MAX(version), 0) FROM schema_migrations").Scan(&version)
	if err != nil {
		return fmt.Errorf("collaboration: read migration version: %w", err)
	}
	if version > 2 {
		return fmt.Errorf("collaboration: unsupported schema version %d", version)
	}
	if version == 2 {
		return nil
	}
	if version == 1 {
		tx, err := store.db.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("collaboration: begin migration: %w", err)
		}
		defer tx.Rollback()
		for _, statement := range migrationV2 {
			if _, err := tx.ExecContext(ctx, statement); err != nil {
				return fmt.Errorf("collaboration: migrate schema v2: %w", err)
			}
		}
		if _, err := tx.ExecContext(
			ctx,
			"INSERT INTO schema_migrations(version, applied_at) VALUES(2, ?)",
			time.Now().UTC().Format(time.RFC3339Nano),
		); err != nil {
			return fmt.Errorf("collaboration: record migration v2: %w", err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("collaboration: commit migration v2: %w", err)
		}
		return nil
	}
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("collaboration: begin migration: %w", err)
	}
	defer tx.Rollback()
	for _, statement := range migrationV1 {
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("collaboration: migrate schema: %w", err)
		}
	}
	if _, err := tx.ExecContext(
		ctx,
		"INSERT INTO schema_migrations(version, applied_at) VALUES(1, ?)",
		time.Now().UTC().Format(time.RFC3339Nano),
	); err != nil {
		return fmt.Errorf("collaboration: record migration: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("collaboration: commit migration: %w", err)
	}
	return store.initialize(ctx)
}

var migrationV1 = []string{
	`CREATE TABLE plans (
		id TEXT PRIMARY KEY,
		jurisdiction TEXT NOT NULL,
		area_ref TEXT NOT NULL,
		event_ref TEXT NOT NULL,
		hazard TEXT NOT NULL,
		title TEXT NOT NULL,
		summary TEXT NOT NULL,
		status TEXT NOT NULL,
		current_version INTEGER NOT NULL,
		revision INTEGER NOT NULL,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	)`,
	`CREATE TABLE plan_versions (
		plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
		version INTEGER NOT NULL,
		title TEXT NOT NULL,
		summary TEXT NOT NULL,
		status TEXT NOT NULL,
		snapshot_json TEXT NOT NULL,
		actor_role TEXT NOT NULL,
		created_at TEXT NOT NULL,
		PRIMARY KEY(plan_id, version)
	)`,
	`CREATE TABLE plan_comments (
		id TEXT PRIMARY KEY,
		plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
		body TEXT NOT NULL,
		author_role TEXT NOT NULL,
		created_at TEXT NOT NULL
	)`,
	`CREATE TABLE plan_assignments (
		id TEXT PRIMARY KEY,
		plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
		role TEXT NOT NULL,
		capability TEXT NOT NULL,
		status TEXT NOT NULL,
		due_start TEXT NOT NULL,
		due_end TEXT NOT NULL,
		actor_role TEXT NOT NULL,
		created_at TEXT NOT NULL
	)`,
	`CREATE TABLE plan_approvals (
		id TEXT PRIMARY KEY,
		plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
		version INTEGER NOT NULL,
		decision TEXT NOT NULL,
		rationale TEXT NOT NULL,
		approver_role TEXT NOT NULL,
		created_at TEXT NOT NULL
	)`,
	`CREATE TABLE plan_audit (
		id TEXT PRIMARY KEY,
		plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
		action TEXT NOT NULL,
		resource_type TEXT NOT NULL,
		actor_role TEXT NOT NULL,
		outcome TEXT NOT NULL,
		created_at TEXT NOT NULL
	)`,
	`CREATE INDEX plan_comments_plan_time ON plan_comments(plan_id, created_at)`,
	`CREATE INDEX plan_assignments_plan_time ON plan_assignments(plan_id, created_at)`,
	`CREATE INDEX plan_approvals_plan_time ON plan_approvals(plan_id, created_at)`,
	`CREATE INDEX plan_audit_plan_time ON plan_audit(plan_id, created_at)`,
}

var migrationV2 = []string{
	`ALTER TABLE plan_versions ADD COLUMN ai_assistance_json TEXT NOT NULL DEFAULT ''`,
	`ALTER TABLE plan_audit ADD COLUMN metadata_json TEXT NOT NULL DEFAULT ''`,
}

func (store *SQLiteStore) Create(
	ctx context.Context,
	input CreateInput,
	actorRole string,
) (Plan, error) {
	if err := ValidateCreate(input); err != nil {
		return Plan{}, fmt.Errorf("%w: %v", ErrInvalidInput, err)
	}
	now := time.Now().UTC()
	planID := newID("plan")
	snapshotJSON, err := json.Marshal(input.Snapshot)
	if err != nil {
		return Plan{}, fmt.Errorf("collaboration: encode snapshot: %w", err)
	}
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return Plan{}, err
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(ctx, `
		INSERT INTO plans(
			id, jurisdiction, area_ref, event_ref, hazard, title, summary, status,
			current_version, revision, created_at, updated_at
		) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
		planID, strings.TrimSpace(input.Jurisdiction), strings.TrimSpace(input.AreaRef),
		strings.TrimSpace(input.EventRef), input.Hazard, strings.TrimSpace(input.Title),
		strings.TrimSpace(input.Summary), input.Status, formatTime(now), formatTime(now),
	)
	if err != nil {
		return Plan{}, err
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO plan_versions(
			plan_id, version, title, summary, status, snapshot_json, actor_role,
			ai_assistance_json, created_at
		) VALUES(?, 1, ?, ?, ?, ?, ?, '', ?)`,
		planID, strings.TrimSpace(input.Title), strings.TrimSpace(input.Summary),
		input.Status, string(snapshotJSON), actorRole, formatTime(now),
	)
	if err != nil {
		return Plan{}, err
	}
	if err := insertAudit(ctx, tx, planID, "created", "plan", actorRole, now); err != nil {
		return Plan{}, err
	}
	if err := tx.Commit(); err != nil {
		return Plan{}, err
	}
	return store.Get(ctx, planID)
}

func (store *SQLiteStore) Get(ctx context.Context, planID string) (Plan, error) {
	plan := Plan{SchemaVersion: SchemaVersion}
	var createdAt, updatedAt string
	err := store.db.QueryRowContext(ctx, `
		SELECT id, jurisdiction, area_ref, event_ref, hazard, title, summary, status,
			current_version, revision, created_at, updated_at
		FROM plans WHERE id = ?`,
		planID,
	).Scan(
		&plan.ID, &plan.Jurisdiction, &plan.AreaRef, &plan.EventRef, &plan.Hazard,
		&plan.Title, &plan.Summary, &plan.Status, &plan.CurrentVersion, &plan.Revision,
		&createdAt, &updatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return Plan{}, ErrNotFound
	}
	if err != nil {
		return Plan{}, err
	}
	plan.CreatedAt, err = parseTime(createdAt)
	if err != nil {
		return Plan{}, err
	}
	plan.UpdatedAt, err = parseTime(updatedAt)
	if err != nil {
		return Plan{}, err
	}
	if plan.Versions, err = store.loadVersions(ctx, planID); err != nil {
		return Plan{}, err
	}
	if plan.Comments, err = store.loadComments(ctx, planID); err != nil {
		return Plan{}, err
	}
	if plan.Assignments, err = store.loadAssignments(ctx, planID); err != nil {
		return Plan{}, err
	}
	if plan.Approvals, err = store.loadApprovals(ctx, planID); err != nil {
		return Plan{}, err
	}
	if plan.Audit, err = store.loadAudit(ctx, planID); err != nil {
		return Plan{}, err
	}
	return plan, nil
}

func (store *SQLiteStore) Update(
	ctx context.Context,
	planID string,
	input UpdateInput,
	actorRole string,
) (Plan, error) {
	if err := ValidateUpdate(input); err != nil {
		return Plan{}, fmt.Errorf("%w: %v", ErrInvalidInput, err)
	}
	snapshotJSON, err := json.Marshal(input.Snapshot)
	if err != nil {
		return Plan{}, err
	}
	now := time.Now().UTC()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return Plan{}, err
	}
	defer tx.Rollback()
	var currentVersion, revision int
	err = tx.QueryRowContext(
		ctx,
		"SELECT current_version, revision FROM plans WHERE id = ?",
		planID,
	).Scan(&currentVersion, &revision)
	if errors.Is(err, sql.ErrNoRows) {
		return Plan{}, ErrNotFound
	}
	if err != nil {
		return Plan{}, err
	}
	if revision != input.ExpectedRevision {
		return Plan{}, ErrConflict
	}
	nextVersion := currentVersion + 1
	result, err := tx.ExecContext(ctx, `
		UPDATE plans SET title = ?, summary = ?, status = ?, current_version = ?,
			revision = revision + 1, updated_at = ?
		WHERE id = ? AND revision = ?`,
		strings.TrimSpace(input.Title), strings.TrimSpace(input.Summary), input.Status,
		nextVersion, formatTime(now), planID, input.ExpectedRevision,
	)
	if err != nil {
		return Plan{}, err
	}
	affected, _ := result.RowsAffected()
	if affected != 1 {
		return Plan{}, ErrConflict
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO plan_versions(
			plan_id, version, title, summary, status, snapshot_json, actor_role,
			ai_assistance_json, created_at
		) VALUES(?, ?, ?, ?, ?, ?, ?, '', ?)`,
		planID, nextVersion, strings.TrimSpace(input.Title), strings.TrimSpace(input.Summary),
		input.Status, string(snapshotJSON), actorRole, formatTime(now),
	)
	if err != nil {
		return Plan{}, err
	}
	if err := insertAudit(ctx, tx, planID, "version_created", "version", actorRole, now); err != nil {
		return Plan{}, err
	}
	if err := tx.Commit(); err != nil {
		return Plan{}, err
	}
	return store.Get(ctx, planID)
}

func (store *SQLiteStore) ApplyAIDraft(
	ctx context.Context,
	planID string,
	input AIApplyInput,
	actorRole string,
) (Plan, error) {
	if err := ValidateAIApply(input); err != nil {
		return Plan{}, fmt.Errorf("%w: %v", ErrInvalidInput, err)
	}
	snapshotJSON, err := json.Marshal(input.Snapshot)
	if err != nil {
		return Plan{}, err
	}
	assistanceJSON, err := json.Marshal(input.Assistance)
	if err != nil {
		return Plan{}, err
	}
	metadataJSON, err := json.Marshal(map[string]string{
		"assistance":              "ai",
		"provider_policy_version": input.Assistance.ProviderPolicyVersion,
		"input_context_hash":      input.Assistance.InputContextHash,
	})
	if err != nil {
		return Plan{}, err
	}
	now := time.Now().UTC()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return Plan{}, err
	}
	defer tx.Rollback()
	var currentVersion, revision int
	var title string
	err = tx.QueryRowContext(
		ctx,
		"SELECT current_version, revision, title FROM plans WHERE id = ?",
		planID,
	).Scan(&currentVersion, &revision, &title)
	if errors.Is(err, sql.ErrNoRows) {
		return Plan{}, ErrNotFound
	}
	if err != nil {
		return Plan{}, err
	}
	if revision != input.ExpectedRevision {
		return Plan{}, ErrConflict
	}
	nextVersion := currentVersion + 1
	result, err := tx.ExecContext(ctx, `
		UPDATE plans SET summary = ?, status = ?, current_version = ?,
			revision = revision + 1, updated_at = ?
		WHERE id = ? AND revision = ?`,
		strings.TrimSpace(input.Summary), StatusDraft, nextVersion,
		formatTime(now), planID, input.ExpectedRevision,
	)
	if err != nil {
		return Plan{}, err
	}
	affected, _ := result.RowsAffected()
	if affected != 1 {
		return Plan{}, ErrConflict
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO plan_versions(
			plan_id, version, title, summary, status, snapshot_json, actor_role,
			ai_assistance_json, created_at
		) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		planID, nextVersion, title, strings.TrimSpace(input.Summary), StatusDraft,
		string(snapshotJSON), actorRole, string(assistanceJSON), formatTime(now),
	)
	if err != nil {
		return Plan{}, err
	}
	if err := insertAuditWithMetadata(
		ctx,
		tx,
		planID,
		"ai_draft_applied",
		"version",
		actorRole,
		string(metadataJSON),
		now,
	); err != nil {
		return Plan{}, err
	}
	if err := tx.Commit(); err != nil {
		return Plan{}, err
	}
	return store.Get(ctx, planID)
}

func (store *SQLiteStore) AddComment(
	ctx context.Context,
	planID string,
	input CommentInput,
	actorRole string,
) (Plan, error) {
	if err := ValidateComment(input); err != nil {
		return Plan{}, fmt.Errorf("%w: %v", ErrInvalidInput, err)
	}
	return store.addRevisioned(
		ctx, planID, input.ExpectedRevision, "comment_added", "comment", actorRole,
		func(ctx context.Context, tx *sql.Tx, now time.Time) error {
			_, err := tx.ExecContext(ctx, `
				INSERT INTO plan_comments(id, plan_id, body, author_role, created_at)
				VALUES(?, ?, ?, ?, ?)`,
				newID("note"), planID, strings.TrimSpace(input.Body), actorRole, formatTime(now),
			)
			return err
		},
	)
}

func (store *SQLiteStore) AddAssignment(
	ctx context.Context,
	planID string,
	input AssignmentInput,
	actorRole string,
) (Plan, error) {
	if err := ValidateAssignment(input); err != nil {
		return Plan{}, fmt.Errorf("%w: %v", ErrInvalidInput, err)
	}
	return store.addRevisioned(
		ctx, planID, input.ExpectedRevision, "assignment_added", "assignment", actorRole,
		func(ctx context.Context, tx *sql.Tx, now time.Time) error {
			_, err := tx.ExecContext(ctx, `
				INSERT INTO plan_assignments(
					id, plan_id, role, capability, status, due_start, due_end, actor_role, created_at
				) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				newID("assignment"), planID, input.Role, input.Capability, input.Status,
				formatTime(input.DueStart.UTC()), formatTime(input.DueEnd.UTC()),
				actorRole, formatTime(now),
			)
			return err
		},
	)
}

func (store *SQLiteStore) AddApproval(
	ctx context.Context,
	planID string,
	input ApprovalInput,
	actorRole string,
) (Plan, error) {
	plan, err := store.Get(ctx, planID)
	if err != nil {
		return Plan{}, err
	}
	if err := ValidateApproval(input, plan.CurrentVersion); err != nil {
		return Plan{}, fmt.Errorf("%w: %v", ErrInvalidInput, err)
	}
	return store.addRevisioned(
		ctx, planID, input.ExpectedRevision, "approval_recorded", "approval", actorRole,
		func(ctx context.Context, tx *sql.Tx, now time.Time) error {
			_, err := tx.ExecContext(ctx, `
				INSERT INTO plan_approvals(
					id, plan_id, version, decision, rationale, approver_role, created_at
				) VALUES(?, ?, ?, ?, ?, ?, ?)`,
				newID("approval"), planID, input.Version, input.Decision,
				strings.TrimSpace(input.Rationale), actorRole, formatTime(now),
			)
			return err
		},
	)
}

func (store *SQLiteStore) addRevisioned(
	ctx context.Context,
	planID string,
	expectedRevision int,
	action string,
	resourceType string,
	actorRole string,
	insert func(context.Context, *sql.Tx, time.Time) error,
) (Plan, error) {
	now := time.Now().UTC()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return Plan{}, err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `
		UPDATE plans SET revision = revision + 1, updated_at = ?
		WHERE id = ? AND revision = ?`,
		formatTime(now), planID, expectedRevision,
	)
	if err != nil {
		return Plan{}, err
	}
	affected, _ := result.RowsAffected()
	if affected != 1 {
		var exists int
		if err := tx.QueryRowContext(ctx, "SELECT 1 FROM plans WHERE id = ?", planID).Scan(&exists); errors.Is(err, sql.ErrNoRows) {
			return Plan{}, ErrNotFound
		}
		return Plan{}, ErrConflict
	}
	if err := insert(ctx, tx, now); err != nil {
		return Plan{}, err
	}
	if err := insertAudit(ctx, tx, planID, action, resourceType, actorRole, now); err != nil {
		return Plan{}, err
	}
	if err := tx.Commit(); err != nil {
		return Plan{}, err
	}
	return store.Get(ctx, planID)
}

func (store *SQLiteStore) Compare(
	ctx context.Context,
	planID string,
	from int,
	to int,
) (Comparison, error) {
	versions, err := store.loadVersions(ctx, planID)
	if err != nil {
		return Comparison{}, err
	}
	var fromVersion, toVersion *Version
	for index := range versions {
		switch versions[index].Version {
		case from:
			fromVersion = &versions[index]
		case to:
			toVersion = &versions[index]
		}
	}
	if fromVersion == nil || toVersion == nil {
		return Comparison{}, ErrNotFound
	}
	changed := make([]string, 0, 4)
	if fromVersion.Title != toVersion.Title {
		changed = append(changed, "title")
	}
	if fromVersion.Summary != toVersion.Summary {
		changed = append(changed, "summary")
	}
	if fromVersion.Status != toVersion.Status {
		changed = append(changed, "status")
	}
	fromSnapshot, _ := json.Marshal(fromVersion.Snapshot)
	toSnapshot, _ := json.Marshal(toVersion.Snapshot)
	if string(fromSnapshot) != string(toSnapshot) {
		changed = append(changed, "snapshot")
	}
	return Comparison{
		SchemaVersion: "collaborative-plan-comparison.v1",
		PlanID:        planID,
		From:          *fromVersion,
		To:            *toVersion,
		ChangedFields: changed,
	}, nil
}

func (store *SQLiteStore) Close() error {
	if store == nil || store.db == nil {
		return nil
	}
	return store.db.Close()
}

func (store *SQLiteStore) loadVersions(ctx context.Context, planID string) ([]Version, error) {
	rows, err := store.db.QueryContext(ctx, `
		SELECT version, title, summary, status, snapshot_json, actor_role,
			ai_assistance_json, created_at
		FROM plan_versions WHERE plan_id = ? ORDER BY version`,
		planID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	versions := []Version{}
	for rows.Next() {
		var version Version
		var snapshotJSON, assistanceJSON, createdAt string
		if err := rows.Scan(
			&version.Version, &version.Title, &version.Summary, &version.Status,
			&snapshotJSON, &version.ActorRole, &assistanceJSON, &createdAt,
		); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(snapshotJSON), &version.Snapshot); err != nil {
			return nil, err
		}
		if assistanceJSON != "" {
			version.AIAssistance = &AIAssistanceMetadata{}
			if err := json.Unmarshal(
				[]byte(assistanceJSON),
				version.AIAssistance,
			); err != nil {
				return nil, err
			}
		}
		version.CreatedAt, err = parseTime(createdAt)
		if err != nil {
			return nil, err
		}
		versions = append(versions, version)
	}
	return versions, rows.Err()
}

func (store *SQLiteStore) loadComments(ctx context.Context, planID string) ([]Comment, error) {
	rows, err := store.db.QueryContext(ctx, `
		SELECT id, body, author_role, created_at
		FROM plan_comments WHERE plan_id = ? ORDER BY created_at`,
		planID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	comments := []Comment{}
	for rows.Next() {
		var item Comment
		var createdAt string
		if err := rows.Scan(&item.ID, &item.Body, &item.AuthorRole, &createdAt); err != nil {
			return nil, err
		}
		item.CreatedAt, err = parseTime(createdAt)
		if err != nil {
			return nil, err
		}
		comments = append(comments, item)
	}
	return comments, rows.Err()
}

func (store *SQLiteStore) loadAssignments(ctx context.Context, planID string) ([]Assignment, error) {
	rows, err := store.db.QueryContext(ctx, `
		SELECT id, role, capability, status, due_start, due_end, actor_role, created_at
		FROM plan_assignments WHERE plan_id = ? ORDER BY created_at`,
		planID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	assignments := []Assignment{}
	for rows.Next() {
		var item Assignment
		var dueStart, dueEnd, createdAt string
		if err := rows.Scan(
			&item.ID, &item.Role, &item.Capability, &item.Status,
			&dueStart, &dueEnd, &item.ActorRole, &createdAt,
		); err != nil {
			return nil, err
		}
		if item.DueStart, err = parseTime(dueStart); err != nil {
			return nil, err
		}
		if item.DueEnd, err = parseTime(dueEnd); err != nil {
			return nil, err
		}
		if item.CreatedAt, err = parseTime(createdAt); err != nil {
			return nil, err
		}
		assignments = append(assignments, item)
	}
	return assignments, rows.Err()
}

func (store *SQLiteStore) loadApprovals(ctx context.Context, planID string) ([]Approval, error) {
	rows, err := store.db.QueryContext(ctx, `
		SELECT id, version, decision, rationale, approver_role, created_at
		FROM plan_approvals WHERE plan_id = ? ORDER BY created_at`,
		planID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	approvals := []Approval{}
	for rows.Next() {
		var item Approval
		var createdAt string
		if err := rows.Scan(
			&item.ID, &item.Version, &item.Decision, &item.Rationale,
			&item.ApproverRole, &createdAt,
		); err != nil {
			return nil, err
		}
		item.CreatedAt, err = parseTime(createdAt)
		if err != nil {
			return nil, err
		}
		approvals = append(approvals, item)
	}
	return approvals, rows.Err()
}

func (store *SQLiteStore) loadAudit(ctx context.Context, planID string) ([]AuditEvent, error) {
	rows, err := store.db.QueryContext(ctx, `
		SELECT id, action, resource_type, actor_role, outcome, metadata_json, created_at
		FROM plan_audit WHERE plan_id = ? ORDER BY created_at`,
		planID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := []AuditEvent{}
	for rows.Next() {
		var item AuditEvent
		var metadataJSON, createdAt string
		if err := rows.Scan(
			&item.ID, &item.Action, &item.ResourceType, &item.ActorRole,
			&item.Outcome, &metadataJSON, &createdAt,
		); err != nil {
			return nil, err
		}
		if metadataJSON != "" {
			if err := json.Unmarshal([]byte(metadataJSON), &item.Metadata); err != nil {
				return nil, err
			}
		}
		item.CreatedAt, err = parseTime(createdAt)
		if err != nil {
			return nil, err
		}
		events = append(events, item)
	}
	return events, rows.Err()
}

func insertAudit(
	ctx context.Context,
	tx *sql.Tx,
	planID string,
	action string,
	resourceType string,
	actorRole string,
	now time.Time,
) error {
	return insertAuditWithMetadata(
		ctx,
		tx,
		planID,
		action,
		resourceType,
		actorRole,
		"",
		now,
	)
}

func insertAuditWithMetadata(
	ctx context.Context,
	tx *sql.Tx,
	planID string,
	action string,
	resourceType string,
	actorRole string,
	metadataJSON string,
	now time.Time,
) error {
	_, err := tx.ExecContext(ctx, `
		INSERT INTO plan_audit(
			id, plan_id, action, resource_type, actor_role, outcome, metadata_json,
			created_at
		) VALUES(?, ?, ?, ?, ?, 'success', ?, ?)`,
		newID("audit"), planID, action, resourceType, actorRole, metadataJSON,
		formatTime(now),
	)
	return err
}

func newID(prefix string) string {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		panic("collaboration: secure random unavailable")
	}
	return prefix + "_" + hex.EncodeToString(bytes[:])
}

func formatTime(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}

func parseTime(value string) (time.Time, error) {
	return time.Parse(time.RFC3339Nano, value)
}
