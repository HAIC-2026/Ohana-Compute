package collaboration

import (
	"errors"
	"regexp"
	"slices"
	"time"
)

var ErrOpsForbidden = errors.New("operations access denied")

type OpsActor struct {
	Subject      string
	Organization string
	Role         string
	Counties     []string
}

type OpsEvent struct {
	Action       string    `json:"action"`
	Organization string    `json:"organization"`
	Target       string    `json:"target,omitempty"`
	Reason       string    `json:"reason,omitempty"`
	Actor        string    `json:"-"`
	At           time.Time `json:"at"`
}

type OpsRequest struct {
	ID             string     `json:"id"`
	Revision       int        `json:"revision"`
	Mode           string     `json:"mode"`
	County         string     `json:"county"`
	Hazard         string     `json:"hazard"`
	IncidentRef    string     `json:"incident_ref"`
	IntakeRef      string     `json:"intake_ref"`
	People         int        `json:"people"`
	Assistance     string     `json:"assistance"`
	Coordinator    string     `json:"coordinator"`
	Receiving      string     `json:"receiving"`
	ReceivingReady bool       `json:"receiving_ready"`
	Transport      string     `json:"transport"`
	Status         string     `json:"status"`
	Verified       bool       `json:"verified"`
	Released       bool       `json:"released"`
	Escalated      bool       `json:"escalated"`
	Blocker        string     `json:"blocker"`
	DueAt          time.Time  `json:"due_at"`
	ETA            *time.Time `json:"eta,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
	Events         []OpsEvent `json:"events"`
}

type OpsCreate struct {
	Key         string    `json:"key"`
	Mode        string    `json:"mode"`
	County      string    `json:"county"`
	Hazard      string    `json:"hazard"`
	IncidentRef string    `json:"incident_ref"`
	IntakeRef   string    `json:"intake_ref"`
	People      int       `json:"people"`
	Assistance  string    `json:"assistance"`
	DueAt       time.Time `json:"due_at"`
}

type OpsCommand struct {
	Key              string     `json:"key"`
	ExpectedRevision int        `json:"expected_revision"`
	Action           string     `json:"action"`
	Organization     string     `json:"organization,omitempty"`
	ETA              *time.Time `json:"eta,omitempty"`
	Reason           string     `json:"reason,omitempty"`
}

type ReadinessTask struct {
	ID           string     `json:"id"`
	RequestID    string     `json:"request_id"`
	SourceRef    string     `json:"source_ref"`
	SourceKind   string     `json:"source_kind,omitempty"`
	Hazard       string     `json:"hazard,omitempty"`
	IncidentRef  string     `json:"incident_ref"`
	Revision     int        `json:"revision"`
	Mode         string     `json:"mode"`
	Escalated    bool       `json:"escalated"`
	County       string     `json:"county"`
	Coordinator  string     `json:"coordinator"`
	Organization string     `json:"organization"`
	Gap          string     `json:"gap"`
	Status       string     `json:"status"`
	DueAt        time.Time  `json:"due_at"`
	EvidenceRef  string     `json:"evidence_ref"`
	SubmittedBy  string     `json:"-"`
	CreatedAt    time.Time  `json:"created_at"`
	Events       []OpsEvent `json:"events"`
}

type ReadinessFindingCreate struct {
	Key          string    `json:"key"`
	Mode         string    `json:"mode"`
	County       string    `json:"county"`
	Hazard       string    `json:"hazard"`
	SourceKind   string    `json:"source_kind"`
	SourceRef    string    `json:"source_ref"`
	Organization string    `json:"organization"`
	Gap          string    `json:"gap"`
	DueAt        time.Time `json:"due_at"`
}

func validReadinessGap(gap string) bool {
	return slices.Contains([]string{"transport_agreement", "receiving_access", "backup_power", "accessible_warning", "daily_support", "medical_support"}, gap)
}

type ReadinessCreate struct {
	Key              string    `json:"key"`
	ExpectedRevision int       `json:"expected_revision"`
	Organization     string    `json:"organization"`
	Gap              string    `json:"gap"`
	DueAt            time.Time `json:"due_at"`
}

type ReadinessCommand struct {
	Key              string `json:"key"`
	ExpectedRevision int    `json:"expected_revision"`
	Action           string `json:"action"`
	EvidenceRef      string `json:"evidence_ref,omitempty"`
}

var opsReference = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$`)

func validOpsActor(actor OpsActor) bool {
	return actor.Subject != "" && opsReference.MatchString(actor.Organization) &&
		slices.Contains([]string{"county", "state", "transport", "receiving"}, actor.Role) &&
		len(actor.Counties) > 0
}

func opsCounty(actor OpsActor, county string) bool {
	return validOpsActor(actor) && slices.Contains(actor.Counties, county)
}

func opsCoordinator(actor OpsActor, request OpsRequest) bool {
	return opsCounty(actor, request.County) &&
		((actor.Role == "county" && actor.Organization == request.Coordinator) ||
			(actor.Role == "state" && request.Escalated))
}

func opsCanRead(actor OpsActor, request OpsRequest) bool {
	return opsCoordinator(actor, request) ||
		(opsCounty(actor, request.County) &&
			((actor.Role == "transport" && request.Transport == actor.Organization) ||
				(actor.Role == "receiving" && request.Receiving == actor.Organization)))
}

func opsTaskRead(actor OpsActor, task ReadinessTask) bool {
	return opsCounty(actor, task.County) &&
		((actor.Role == "state" && task.Escalated) || actor.Organization == task.Coordinator ||
			actor.Organization == task.Organization)
}

func transitionOps(request *OpsRequest, command OpsCommand, actor OpsActor, now time.Time) error {
	if (command.Organization != "" && command.Action != "offer" && command.Action != "set_receiving") ||
		(command.ETA != nil && command.Action != "accept") ||
		(command.Reason != "" && command.Action != "decline" && command.Action != "report_blocker") {
		return ErrInvalidInput
	}
	if !opsCanRead(actor, *request) {
		return ErrOpsForbidden
	}
	coordinator := opsCoordinator(actor, *request)
	if actor.Role == "state" && command.Action != "offer" {
		return ErrOpsForbidden
	}
	transport := actor.Role == "transport" && actor.Organization == request.Transport
	receiving := actor.Role == "receiving" && actor.Organization == request.Receiving
	if slices.Contains([]string{"closed", "cancelled"}, request.Status) {
		return ErrInvalidInput
	}
	switch command.Action {
	case "verify":
		if !coordinator || request.Status != "requested" || request.Verified {
			return ErrInvalidInput
		}
		request.Verified = true
	case "set_receiving":
		if !coordinator || !request.Verified || request.Status == "arrived" || !opsReference.MatchString(command.Organization) {
			return ErrInvalidInput
		}
		request.Receiving = command.Organization
		request.ReceivingReady = false
		request.Released = false
	case "receiving_ready":
		if !receiving || request.ReceivingReady || !request.Verified {
			return ErrInvalidInput
		}
		request.ReceivingReady = true
		if request.Blocker == "receiving_unavailable" {
			request.Blocker = ""
		}
	case "receiving_unavailable":
		if !receiving || request.Status == "arrived" {
			return ErrInvalidInput
		}
		request.ReceivingReady = false
		request.Released = false
		request.Blocker = "receiving_unavailable"
	case "report_blocker":
		if (!transport && !receiving) || request.Status == "arrived" ||
			!slices.Contains([]string{"unsafe_route", "equipment", "receiving_unavailable"}, command.Reason) {
			return ErrInvalidInput
		}
		request.Blocker = command.Reason
		request.Released = false
		if command.Reason == "receiving_unavailable" {
			request.ReceivingReady = false
		}
	case "resolve_blocker":
		if !coordinator || request.Blocker == "" || !request.ReceivingReady || request.Status == "declined" {
			return ErrInvalidInput
		}
		request.Blocker = ""
	case "offer":
		if !coordinator || !request.Verified ||
			!slices.Contains([]string{"requested", "declined", "offered", "accepted"}, request.Status) ||
			!opsReference.MatchString(command.Organization) {
			return ErrInvalidInput
		}
		request.Transport = command.Organization
		request.Status = "offered"
		request.ETA = nil
		request.Released = false
		if request.Blocker != "receiving_unavailable" {
			request.Blocker = ""
		}
	case "accept":
		if !transport || request.Status != "offered" || command.ETA == nil ||
			!command.ETA.After(now) || command.ETA.After(now.Add(7*24*time.Hour)) {
			return ErrInvalidInput
		}
		request.Status = "accepted"
		request.ETA = command.ETA
	case "decline":
		if !transport || !slices.Contains([]string{"offered", "accepted"}, request.Status) ||
			!slices.Contains([]string{"no_vehicle", "staffing", "equipment", "unsafe_route"}, command.Reason) {
			return ErrInvalidInput
		}
		request.Status = "declined"
		request.Blocker = command.Reason
		request.Released = false
		request.ETA = nil
	case "escalate":
		if !coordinator || request.Escalated {
			return ErrInvalidInput
		}
		request.Escalated = true
	case "release":
		if !coordinator || !slices.Contains([]string{"accepted", "picked_up"}, request.Status) || !request.ReceivingReady ||
			request.Blocker != "" || request.Released {
			return ErrInvalidInput
		}
		request.Released = true
	case "pickup":
		if !transport || request.Status != "accepted" || !request.Released || !request.ReceivingReady {
			return ErrInvalidInput
		}
		request.Status = "picked_up"
	case "arrive":
		if !receiving || request.Status != "picked_up" || !request.ReceivingReady || !request.Released || request.Blocker != "" {
			return ErrInvalidInput
		}
		request.Status = "arrived"
	case "close":
		if !coordinator || request.Status != "arrived" {
			return ErrInvalidInput
		}
		request.Status = "closed"
	case "cancel":
		if !coordinator || !slices.Contains([]string{"requested", "offered", "declined", "accepted"}, request.Status) {
			return ErrInvalidInput
		}
		request.Status = "cancelled"
	default:
		return ErrInvalidInput
	}
	request.Revision++
	request.UpdatedAt = now
	request.Events = append(request.Events, OpsEvent{
		Action: command.Action, Organization: actor.Organization, Target: command.Organization,
		Reason: command.Reason, Actor: actor.Subject, At: now,
	})
	return nil
}
