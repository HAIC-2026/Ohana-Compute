package main

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/coreos/go-oidc/v3/oidc"
)

func TestLocalIssuerAuthorizationAndOneUsePKCE(t *testing.T) {
	for _, subject := range []string{"county-staff", "backup-transport-staff", "other-county-staff"} {
		t.Run(subject, func(t *testing.T) {
			testLocalIssuerSubject(t, subject)
		})
	}
}

func testLocalIssuerSubject(t *testing.T, subject string) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	f := &fixture{key: key, callback: "http://127.0.0.1:3000/api/v1/staff/callback", pending: map[string]grant{}, codes: map[string]grant{}}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /.well-known/openid-configuration", f.discovery)
	mux.HandleFunc("GET /keys", f.keys)
	mux.HandleFunc("/authorize", f.authorize)
	mux.HandleFunc("POST /token", f.token)
	server := httptest.NewServer(mux)
	defer server.Close()
	f.issuer = server.URL
	verifier := strings.Repeat("v", 43)
	hash := sha256.Sum256([]byte(verifier))
	query := url.Values{
		"client_id": {clientID}, "redirect_uri": {f.callback}, "response_type": {"code"},
		"scope": {"openid"}, "state": {strings.Repeat("s", 43)}, "nonce": {strings.Repeat("n", 43)},
		"code_challenge_method": {"S256"}, "code_challenge": {base64.RawURLEncoding.EncodeToString(hash[:])},
	}
	w := httptest.NewRecorder()
	f.authorize(w, httptest.NewRequest("GET", server.URL+"/authorize?"+query.Encode(), nil))
	if w.Code != 200 || !strings.Contains(w.Header().Get("Content-Security-Policy"), "http://127.0.0.1:3000") ||
		w.Header().Get("Referrer-Policy") != "strict-origin" {
		t.Fatal("browser form origin or redirect policy is unsafe")
	}
	var requestID string
	for id := range f.pending {
		requestID = id
	}
	if !strings.Contains(w.Body.String(), `value="`+subject+`"`) {
		t.Fatal("fixture selector omitted subject")
	}
	values := url.Values{"request": {requestID}, "subject": {subject}}
	makePost := func(origin string) *http.Request {
		r := httptest.NewRequest("POST", server.URL+"/authorize", strings.NewReader(values.Encode()))
		r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		r.Header.Set("Origin", origin)
		return r
	}
	w = httptest.NewRecorder()
	f.authorize(w, makePost("null"))
	if w.Code != 403 {
		t.Fatal("cross-origin fixture login accepted")
	}
	w = httptest.NewRecorder()
	f.authorize(w, makePost(f.issuer))
	if w.Code != http.StatusSeeOther {
		t.Fatal("fixture login failed")
	}
	location, _ := url.Parse(w.Header().Get("Location"))
	code := location.Query().Get("code")
	if location.Query().Get("state") != query.Get("state") || code == "" {
		t.Fatal("invalid fixture callback")
	}
	exchange := func() *httptest.ResponseRecorder {
		form := url.Values{"grant_type": {"authorization_code"}, "code": {code}, "code_verifier": {verifier}, "redirect_uri": {f.callback}}
		r := httptest.NewRequest("POST", server.URL+"/token", strings.NewReader(form.Encode()))
		r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		r.SetBasicAuth(clientID, clientSecret)
		w := httptest.NewRecorder()
		f.token(w, r)
		return w
	}
	w = exchange()
	if w.Code != 200 {
		t.Fatal("fixture code exchange failed")
	}
	var token struct {
		IDToken string `json:"id_token"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &token); err != nil {
		t.Fatal(err)
	}
	provider, err := oidc.NewProvider(context.Background(), server.URL)
	if err != nil {
		t.Fatal(err)
	}
	verified, err := provider.Verifier(&oidc.Config{ClientID: clientID}).Verify(context.Background(), token.IDToken)
	if err != nil || verified.Subject != subject || verified.Nonce != query.Get("nonce") {
		t.Fatalf("fixture did not produce valid signed identity: %v", err)
	}
	if exchange().Code != 400 {
		t.Fatal("authorization code replay accepted")
	}
}
