package collaboration

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"time"
)

func (store *SQLiteStore) initializeOperations(ctx context.Context) error {
	_, err := store.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS operational_records (
			id TEXT PRIMARY KEY, kind TEXT NOT NULL, revision INTEGER NOT NULL,
			document BLOB NOT NULL
		);
		CREATE TABLE IF NOT EXISTS operational_commands (
			actor TEXT NOT NULL, command_key TEXT NOT NULL,
			fingerprint TEXT NOT NULL, record_id TEXT NOT NULL,
			PRIMARY KEY(actor, command_key)
		);
		CREATE TABLE IF NOT EXISTS operational_audit (
			record_id TEXT NOT NULL, revision INTEGER NOT NULL,
			actor TEXT NOT NULL, organization TEXT NOT NULL,
			action TEXT NOT NULL, occurred_at TEXT NOT NULL,
			PRIMARY KEY(record_id, revision)
		);
		CREATE TRIGGER IF NOT EXISTS operational_audit_no_update
			BEFORE UPDATE ON operational_audit BEGIN SELECT RAISE(ABORT, 'immutable audit'); END;
		CREATE TRIGGER IF NOT EXISTS operational_audit_no_delete
			BEFORE DELETE ON operational_audit BEGIN SELECT RAISE(ABORT, 'immutable audit'); END;
	`)
	return err
}

func opsID() (string, error) {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes[:]), nil
}

func opsFingerprint(value any) (string, error) {
	body, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	hash := sha256.Sum256(body)
	return hex.EncodeToString(hash[:]), nil
}

func opsReplay(ctx context.Context, tx *sql.Tx, actor OpsActor, key, fingerprint string) (string, error) {
	if !validOpsActor(actor) {
		return "", ErrOpsForbidden
	}
	if !opsReference.MatchString(key) {
		return "", ErrInvalidInput
	}
	var oldFingerprint, id string
	err := tx.QueryRowContext(ctx, `SELECT fingerprint, record_id FROM operational_commands WHERE actor=? AND command_key=?`, actor.Subject, key).Scan(&oldFingerprint, &id)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if oldFingerprint != fingerprint {
		return "", ErrConflict
	}
	return id, nil
}

func opsSave(ctx context.Context, tx *sql.Tx, id, kind string, revision int, value any, actor OpsActor, key, fingerprint, action string, now time.Time) error {
	body, err := json.Marshal(value)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO operational_records(id,kind,revision,document) VALUES(?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET revision=excluded.revision, document=excluded.document
		WHERE operational_records.revision=excluded.revision-1`, id, kind, revision, body)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO operational_commands(actor,command_key,fingerprint,record_id) VALUES(?,?,?,?)`, actor.Subject, key, fingerprint, id)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO operational_audit(record_id,revision,actor,organization,action,occurred_at) VALUES(?,?,?,?,?,?)`,
		id, revision, actor.Subject, actor.Organization, action, now.Format(time.RFC3339Nano))
	return err
}

func opsLoad[T any](ctx context.Context, tx *sql.Tx, id, kind string) (T, error) {
	var value T
	var body []byte
	err := tx.QueryRowContext(ctx, `SELECT document FROM operational_records WHERE id=? AND kind=?`, id, kind).Scan(&body)
	if errors.Is(err, sql.ErrNoRows) {
		return value, ErrNotFound
	}
	if err != nil {
		return value, err
	}
	err = json.Unmarshal(body, &value)
	return value, err
}

func (store *SQLiteStore) CreateOpsRequest(ctx context.Context, input OpsCreate, actor OpsActor, now time.Time) (OpsRequest, error) {
	if actor.Role != "county" || !opsCounty(actor, input.County) {
		return OpsRequest{}, ErrOpsForbidden
	}
	if !slices.Contains([]string{"exercise", "operational"}, input.Mode) ||
		!slices.Contains([]string{"001", "003", "007", "009"}, input.County) ||
		!slices.Contains([]string{"hurricane", "flood", "wildfire", "tsunami"}, input.Hazard) ||
		!opsReference.MatchString(input.IntakeRef) || !opsReference.MatchString(input.IncidentRef) || input.People < 1 || input.People > 50 ||
		!slices.Contains([]string{"accessible_vehicle", "mobility_assistance", "caregiver_accompaniment"}, input.Assistance) ||
		!input.DueAt.After(now) || input.DueAt.After(now.Add(7*24*time.Hour)) {
		return OpsRequest{}, ErrInvalidInput
	}
	fingerprint, err := opsFingerprint(input)
	if err != nil {
		return OpsRequest{}, err
	}
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return OpsRequest{}, err
	}
	defer tx.Rollback()
	replay, err := opsReplay(ctx, tx, actor, input.Key, fingerprint)
	if err != nil {
		return OpsRequest{}, err
	}
	if replay != "" {
		result, err := opsLoad[OpsRequest](ctx, tx, replay, "request")
		if err == nil && !opsCanRead(actor, result) {
			err = ErrOpsForbidden
		}
		return result, err
	}
	var duplicate int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM operational_records WHERE kind='request'
		AND json_extract(document,'$.mode')=? AND json_extract(document,'$.county')=?
		AND json_extract(document,'$.incident_ref')=? AND json_extract(document,'$.intake_ref')=?`,
		input.Mode, input.County, input.IncidentRef, input.IntakeRef).Scan(&duplicate); err != nil {
		return OpsRequest{}, err
	}
	if duplicate != 0 {
		return OpsRequest{}, ErrConflict
	}
	id, err := opsID()
	if err != nil {
		return OpsRequest{}, err
	}
	value := OpsRequest{
		ID: id, Revision: 1, Mode: input.Mode, County: input.County, Hazard: input.Hazard,
		IntakeRef: input.IntakeRef, People: input.People, Assistance: input.Assistance,
		IncidentRef: input.IncidentRef,
		Coordinator: actor.Organization, Status: "requested", DueAt: input.DueAt,
		CreatedAt: now, UpdatedAt: now,
		Events: []OpsEvent{{Action: "create", Organization: actor.Organization, Actor: actor.Subject, At: now}},
	}
	if err := opsSave(ctx, tx, id, "request", 1, value, actor, input.Key, fingerprint, "create", now); err != nil {
		return OpsRequest{}, err
	}
	return value, tx.Commit()
}

func (store *SQLiteStore) CommandOpsRequest(ctx context.Context, id string, input OpsCommand, actor OpsActor, now time.Time) (OpsRequest, error) {
	fingerprint, err := opsFingerprint(struct {
		ID    string
		Input OpsCommand
	}{id, input})
	if err != nil {
		return OpsRequest{}, err
	}
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return OpsRequest{}, err
	}
	defer tx.Rollback()
	replay, err := opsReplay(ctx, tx, actor, input.Key, fingerprint)
	if err != nil {
		return OpsRequest{}, err
	}
	value, err := opsLoad[OpsRequest](ctx, tx, id, "request")
	if err != nil {
		return value, err
	}
	if !opsCanRead(actor, value) {
		return OpsRequest{}, ErrOpsForbidden
	}
	if replay != "" {
		return value, nil
	}
	if value.Revision != input.ExpectedRevision {
		return OpsRequest{}, ErrConflict
	}
	if err := transitionOps(&value, input, actor, now); err != nil {
		return OpsRequest{}, err
	}
	if err := opsSave(ctx, tx, id, "request", value.Revision, value, actor, input.Key, fingerprint, input.Action, now); err != nil {
		return OpsRequest{}, err
	}
	return value, tx.Commit()
}

func (store *SQLiteStore) ListOpsRequests(ctx context.Context, actor OpsActor) ([]OpsRequest, error) {
	if !validOpsActor(actor) {
		return nil, ErrOpsForbidden
	}
	rows, err := store.db.QueryContext(ctx, `SELECT document FROM operational_records WHERE kind='request' ORDER BY rowid DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := []OpsRequest{}
	for rows.Next() {
		var body []byte
		var value OpsRequest
		if err := rows.Scan(&body); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(body, &value); err != nil {
			return nil, err
		}
		if opsCanRead(actor, value) {
			values = append(values, value)
		}
	}
	return values, rows.Err()
}

func (store *SQLiteStore) CreateReadinessTask(ctx context.Context, requestID string, input ReadinessCreate, actor OpsActor, now time.Time) (ReadinessTask, error) {
	fingerprint, err := opsFingerprint(struct {
		ID    string
		Input ReadinessCreate
	}{requestID, input})
	if err != nil {
		return ReadinessTask{}, err
	}
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return ReadinessTask{}, err
	}
	defer tx.Rollback()
	replay, err := opsReplay(ctx, tx, actor, input.Key, fingerprint)
	if err != nil {
		return ReadinessTask{}, err
	}
	request, err := opsLoad[OpsRequest](ctx, tx, requestID, "request")
	if err != nil {
		return ReadinessTask{}, err
	}
	if !opsCoordinator(actor, request) {
		return ReadinessTask{}, ErrOpsForbidden
	}
	if replay != "" {
		return opsLoad[ReadinessTask](ctx, tx, replay, "readiness")
	}
	if request.Revision != input.ExpectedRevision {
		return ReadinessTask{}, ErrConflict
	}
	if !opsReference.MatchString(input.Organization) || !slices.Contains([]string{"transport_agreement", "receiving_access", "backup_power", "accessible_warning"}, input.Gap) ||
		!input.DueAt.After(now) || input.DueAt.After(now.Add(366*24*time.Hour)) {
		return ReadinessTask{}, ErrInvalidInput
	}
	id, err := opsID()
	if err != nil {
		return ReadinessTask{}, err
	}
	value := ReadinessTask{
		ID: id, RequestID: requestID, Revision: 1, Mode: request.Mode, County: request.County,
		SourceRef: request.IntakeRef, IncidentRef: request.IncidentRef,
		Coordinator: request.Coordinator, Organization: input.Organization, Gap: input.Gap,
		Escalated: request.Escalated,
		Status:    "open", DueAt: input.DueAt, CreatedAt: now,
		Events: []OpsEvent{{Action: "create_task", Organization: actor.Organization, Actor: actor.Subject, At: now}},
	}
	if err := opsSave(ctx, tx, id, "readiness", 1, value, actor, input.Key, fingerprint, "create_task", now); err != nil {
		return ReadinessTask{}, err
	}
	return value, tx.Commit()
}

func (store *SQLiteStore) CommandReadinessTask(ctx context.Context, id string, input ReadinessCommand, actor OpsActor, now time.Time) (ReadinessTask, error) {
	fingerprint, err := opsFingerprint(struct {
		ID    string
		Input ReadinessCommand
	}{id, input})
	if err != nil {
		return ReadinessTask{}, err
	}
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return ReadinessTask{}, err
	}
	defer tx.Rollback()
	replay, err := opsReplay(ctx, tx, actor, input.Key, fingerprint)
	if err != nil {
		return ReadinessTask{}, err
	}
	value, err := opsLoad[ReadinessTask](ctx, tx, id, "readiness")
	if err != nil {
		return value, err
	}
	if !opsTaskRead(actor, value) {
		return ReadinessTask{}, ErrOpsForbidden
	}
	if replay != "" {
		return value, nil
	}
	if value.Revision != input.ExpectedRevision {
		return ReadinessTask{}, ErrConflict
	}
	switch input.Action {
	case "submit":
		if actor.Organization != value.Organization || !slices.Contains([]string{"open", "changes_needed"}, value.Status) || !opsReference.MatchString(input.EvidenceRef) {
			return ReadinessTask{}, ErrInvalidInput
		}
		value.Status = "in_review"
		value.EvidenceRef = input.EvidenceRef
		// The submitter is persisted in the audit table, not a browser-visible identity.
		value.SubmittedBy = actor.Subject
	case "approve", "return":
		if actor.Role != "county" || actor.Organization != value.Coordinator || value.Status != "in_review" || input.EvidenceRef != "" {
			return ReadinessTask{}, ErrInvalidInput
		}
		var submitter string
		if err := tx.QueryRowContext(ctx, `SELECT actor FROM operational_audit WHERE record_id=? AND action='submit' ORDER BY revision DESC LIMIT 1`, id).Scan(&submitter); err != nil {
			return ReadinessTask{}, fmt.Errorf("readiness submitter: %w", err)
		}
		if actor.Subject == submitter {
			return ReadinessTask{}, ErrOpsForbidden
		}
		value.Status = "closed"
		if input.Action == "return" {
			value.Status = "changes_needed"
		}
	default:
		return ReadinessTask{}, ErrInvalidInput
	}
	value.Revision++
	value.Events = append(value.Events, OpsEvent{Action: input.Action, Organization: actor.Organization, Actor: actor.Subject, At: now})
	if err := opsSave(ctx, tx, id, "readiness", value.Revision, value, actor, input.Key, fingerprint, input.Action, now); err != nil {
		return ReadinessTask{}, err
	}
	return value, tx.Commit()
}

func (store *SQLiteStore) ListReadinessTasks(ctx context.Context, actor OpsActor) ([]ReadinessTask, error) {
	if !validOpsActor(actor) {
		return nil, ErrOpsForbidden
	}
	rows, err := store.db.QueryContext(ctx, `SELECT document FROM operational_records WHERE kind='readiness' ORDER BY rowid DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := []ReadinessTask{}
	for rows.Next() {
		var body []byte
		var value ReadinessTask
		if err := rows.Scan(&body); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(body, &value); err != nil {
			return nil, err
		}
		if opsTaskRead(actor, value) {
			values = append(values, value)
		}
	}
	return values, rows.Err()
}
