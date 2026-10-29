package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/collaboration"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/staffidentity"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type operationsTestIdentity struct{}

func (operationsTestIdentity) Authenticate(r *http.Request) (staffidentity.Member, error) {
	members := map[string]staffidentity.Member{
		"county":  {Subject: "county-person", Organization: "county-org", Role: "county", Counties: []string{"003"}},
		"driver":  {Subject: "driver-person", Organization: "driver-org", Role: "transport", Counties: []string{"003"}},
		"foreign": {Subject: "foreign-person", Organization: "foreign-org", Role: "county", Counties: []string{"009"}},
	}
	member, ok := members[r.Header.Get("X-Test-Account")]
	if !ok {
		return staffidentity.Member{}, errors.New("unauthorized")
	}
	return member, nil
}
func (operationsTestIdentity) ValidateMutation(r *http.Request) error {
	if r.Header.Get("Origin") != "https://planner.example" {
		return errors.New("wrong origin")
	}
	return nil
}
func (operationsTestIdentity) Organizations() []staffidentity.Organization {
	return []staffidentity.Organization{
		{ID: "driver-org", Name: "Transport", Role: "transport", Counties: []string{"003"}},
		{ID: "receiving-org", Name: "Receiving", Role: "receiving", Counties: []string{"003"}},
		{ID: "foreign-driver", Name: "Other transport", Role: "transport", Counties: []string{"009"}},
	}
}

func TestOperationsAPIPrivacyAuthorizationAndMetrics(t *testing.T) {
	store, err := collaboration.OpenSQLite(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	mux := http.NewServeMux()
	registerOperationsRoutes(mux, store, operationsTestIdentity{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	registry := prometheus.NewRegistry()
	registry.MustRegister(newOperationsCollector(store))
	mux.Handle("GET /metrics", promhttp.HandlerFor(registry, promhttp.HandlerOpts{}))
	call := func(method, path, account, body string, origin bool) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("X-Test-Account", account)
		r.Header.Set("Content-Type", "application/json")
		if origin {
			r.Header.Set("Origin", "https://planner.example")
		}
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		return w
	}
	input := collaboration.OpsCreate{Key: "request-key", Mode: "exercise", County: "003", Hazard: "hurricane", IncidentRef: "DRILL-001", IntakeRef: "RESTRICTED-REF", People: 1, Assistance: "accessible_vehicle", DueAt: time.Now().Add(time.Hour)}
	body, _ := json.Marshal(input)
	if w := call("POST", "/api/v1/operations/requests", "county", string(body), false); w.Code != 403 {
		t.Fatalf("csrf: %d", w.Code)
	}
	if w := call("POST", "/api/v1/operations/requests", "driver", string(body), true); w.Code != 404 {
		t.Fatalf("driver create: %d", w.Code)
	}
	if w := call("POST", "/api/v1/operations/requests", "county", `{"unknown":"field"}`, true); w.Code != 400 {
		t.Fatalf("unknown field: %d", w.Code)
	}
	if w := call("POST", "/api/v1/operations/requests", "county", `{"key":"x"}`+`{}`, true); w.Code != 400 {
		t.Fatalf("trailing JSON: %d", w.Code)
	}
	if w := call("POST", "/api/v1/operations/requests", "county", `{"key":"`+strings.Repeat("x", 34000)+`"}`, true); w.Code != 413 {
		t.Fatalf("oversized: %d", w.Code)
	}
	w := call("POST", "/api/v1/operations/requests", "county", string(body), true)
	if w.Code != 200 {
		t.Fatalf("create: %d %s", w.Code, w.Body.String())
	}
	var request collaboration.OpsRequest
	if err := json.Unmarshal(w.Body.Bytes(), &request); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(w.Body.String(), "county-person") {
		t.Fatal("actor identity disclosed")
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("private response cacheable")
	}
	for _, account := range []string{"driver", "foreign"} {
		board := call("GET", "/api/v1/operations/board", account, "", true)
		if bytes.Contains(board.Body.Bytes(), []byte(request.IntakeRef)) {
			t.Fatal("cross-scope leak")
		}
		update := call("POST", "/api/v1/operations/requests/"+request.ID+"/commands", account, `{"key":"attack-key","action":"verify","expected_revision":1}`, true)
		if update.Code != 404 {
			t.Fatalf("unauthorized command: %d", update.Code)
		}
	}
	w = call("POST", "/api/v1/operations/requests/"+request.ID+"/commands", "county", `{"key":"verify-key","action":"verify","expected_revision":1}`, true)
	if w.Code != 200 {
		t.Fatalf("verify: %d %s", w.Code, w.Body.String())
	}
	for _, target := range []string{"foreign-driver", "receiving-org", "invented-driver"} {
		w = call("POST", "/api/v1/operations/requests/"+request.ID+"/commands", "county", `{"key":"offer-key","action":"offer","organization":"`+target+`","expected_revision":2}`, true)
		if w.Code != 400 {
			t.Fatalf("invalid target %s: %d", target, w.Code)
		}
	}
	finding := collaboration.ReadinessFindingCreate{
		Key: "finding-key", Mode: "exercise", County: "003", Hazard: "flood",
		SourceKind: "exercise_finding", SourceRef: "ASSESSMENT-001", Organization: "driver-org",
		Gap: "daily_support", DueAt: time.Now().Add(24 * time.Hour),
	}
	findingBody, _ := json.Marshal(finding)
	for _, scenario := range []struct {
		account string
		origin  bool
		status  int
	}{
		{"county", false, 403}, {"driver", true, 404}, {"foreign", true, 404},
		{"county", true, 200},
	} {
		got := call("POST", "/api/v1/operations/readiness", scenario.account, string(findingBody), scenario.origin)
		if got.Code != scenario.status {
			t.Fatalf("finding API by %s: %d %s", scenario.account, got.Code, got.Body.String())
		}
	}
	finding.Organization = "foreign-driver"
	findingBody, _ = json.Marshal(finding)
	if got := call("POST", "/api/v1/operations/readiness", "county", string(findingBody), true); got.Code != 400 {
		t.Fatalf("finding target scope: %d", got.Code)
	}
	if got := call("POST", "/api/v1/operations/readiness", "county", `{"unexpected":"field"}`, true); got.Code != 400 {
		t.Fatalf("finding unknown fields: %d", got.Code)
	}
	if got := call("POST", "/api/v1/operations/readiness", "county", string(findingBody)+`{}`, true); got.Code != 400 {
		t.Fatalf("finding trailing JSON: %d", got.Code)
	}
	metrics := call("GET", "/metrics", "", "", true).Body.String()
	for _, private := range []string{"ASSESSMENT-001", "RESTRICTED-REF", request.ID, "county-person", "county-org", "DRILL-001"} {
		if strings.Contains(metrics, private) {
			t.Fatalf("metrics leak: %s", private)
		}
	}
	if !strings.Contains(metrics, `hawaii_resilience_coordination_handoff_duration_seconds_count{mode="exercise",stage="request_acknowledgment"} 1`) {
		t.Fatal("missing durable interval observation")
	}
}
