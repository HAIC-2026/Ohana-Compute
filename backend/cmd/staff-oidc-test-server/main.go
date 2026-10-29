// This command is a local-only, deliberately interactive OIDC fixture, not an
// authentication option in the production server. Never deploy this command.
package main

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"html/template"
	"log"
	"math/big"
	"net"
	"net/http"
	"net/url"
	"slices"
	"sync"
	"time"
)

type grant struct {
	state, nonce, challenge, subject string
	expires                          time.Time
}

type fixture struct {
	mu       sync.Mutex
	issuer   string
	callback string
	key      *rsa.PrivateKey
	pending  map[string]grant
	codes    map[string]grant
}

const clientID = "local-staff-client"
const clientSecret = "local-test-only-not-a-production-secret"

func main() {
	listen := flag.String("listen", "127.0.0.1:9099", "literal loopback listener")
	callback := flag.String("callback", "http://127.0.0.1:3000/api/v1/staff/callback", "exact loopback app callback")
	flag.Parse()
	host, _, err := net.SplitHostPort(*listen)
	ip := net.ParseIP(host)
	if err != nil || ip == nil || !ip.IsLoopback() {
		log.Fatal("test issuer requires a literal loopback listener")
	}
	redirect, err := url.Parse(*callback)
	if err != nil || redirect.User != nil || redirect.RawQuery != "" || redirect.Fragment != "" ||
		redirect.Scheme != "http" || net.ParseIP(redirect.Hostname()) == nil ||
		!net.ParseIP(redirect.Hostname()).IsLoopback() || redirect.Path != "/api/v1/staff/callback" {
		log.Fatal("test issuer callback must be an exact HTTP loopback staff callback")
	}
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		log.Fatal("cannot create test signing key")
	}
	f := &fixture{issuer: "http://" + *listen, callback: *callback, key: key, pending: map[string]grant{}, codes: map[string]grant{}}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /.well-known/openid-configuration", f.discovery)
	mux.HandleFunc("GET /keys", f.keys)
	mux.HandleFunc("/authorize", f.authorize)
	mux.HandleFunc("POST /token", f.token)
	server := &http.Server{Addr: *listen, Handler: mux, ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout: 10 * time.Second, WriteTimeout: 10 * time.Second, IdleTimeout: 30 * time.Second,
		MaxHeaderBytes: 16 << 10}
	log.Printf("LOCAL TEST ONLY OIDC issuer listening at %s; do not deploy", f.issuer)
	log.Fatal(server.ListenAndServe())
}

func randomID() string {
	var value [32]byte
	if _, err := rand.Read(value[:]); err != nil {
		panic("test randomness unavailable")
	}
	return base64.RawURLEncoding.EncodeToString(value[:])
}

func jsonResponse(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(value)
}

func (f *fixture) discovery(w http.ResponseWriter, r *http.Request) {
	jsonResponse(w, map[string]any{
		"issuer": f.issuer, "authorization_endpoint": f.issuer + "/authorize",
		"token_endpoint": f.issuer + "/token", "jwks_uri": f.issuer + "/keys",
		"response_types_supported": []string{"code"}, "subject_types_supported": []string{"public"},
		"id_token_signing_alg_values_supported": []string{"RS256"},
		"code_challenge_methods_supported":      []string{"S256"},
		"token_endpoint_auth_methods_supported": []string{"client_secret_basic"},
	})
}

func (f *fixture) keys(w http.ResponseWriter, r *http.Request) {
	jsonResponse(w, map[string]any{"keys": []any{map[string]any{
		"kty": "RSA", "use": "sig", "alg": "RS256", "kid": "local-ephemeral",
		"n": base64.RawURLEncoding.EncodeToString(f.key.N.Bytes()),
		"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(f.key.E)).Bytes()),
	}}})
}

var loginPage = template.Must(template.New("login").Parse(`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Local test organization sign-in</title>
<body style="font:18px system-ui;max-width:620px;margin:60px auto;padding:24px">
<h1>Local test organization</h1><p>OIDC browser fixture — not a production identity provider.</p>
<form method="post" action="/authorize"><input type="hidden" name="request" value="{{.}}">
<label>Test staff identity <select name="subject">
<option value="county-staff">County coordinator · Oahu</option>
<option value="state-staff">State coordinator · statewide</option>
<option value="transport-staff">Transport partner · Oahu</option>
<option value="backup-transport-staff">Backup transport partner · Oahu</option>
<option value="receiving-staff">Receiving partner · Oahu</option>
<option value="other-county-staff">County coordinator · Maui County (009)</option>
</select></label><p><button type="submit">Sign in through local organization</button></p></form></body></html>`))

func (f *fixture) cleanup() {
	for _, store := range []map[string]grant{f.pending, f.codes} {
		for key, value := range store {
			if time.Now().After(value.expires) {
				delete(store, key)
			}
		}
	}
}

func (f *fixture) authorize(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "strict-origin")
	callback, _ := url.Parse(f.callback)
	w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' "+callback.Scheme+"://"+callback.Host+"; frame-ancestors 'none'; base-uri 'none'")
	f.mu.Lock()
	defer f.mu.Unlock()
	f.cleanup()
	if r.Method == "GET" {
		q := r.URL.Query()
		if q.Get("client_id") != clientID || q.Get("redirect_uri") != f.callback ||
			q.Get("response_type") != "code" || q.Get("scope") != "openid" ||
			q.Get("code_challenge_method") != "S256" || len(q.Get("code_challenge")) != 43 ||
			len(q.Get("state")) != 43 || len(q.Get("nonce")) != 43 || len(f.pending) >= 1000 {
			http.Error(w, "invalid authorization request", 400)
			return
		}
		id := randomID()
		f.pending[id] = grant{state: q.Get("state"), nonce: q.Get("nonce"), challenge: q.Get("code_challenge"), expires: time.Now().Add(5 * time.Minute)}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_ = loginPage.Execute(w, id)
		return
	}
	if r.Method != "POST" || r.Header.Get("Origin") != f.issuer {
		http.Error(w, "same-origin POST required", 403)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := r.ParseForm(); err != nil {
		http.Error(w, "invalid request", 400)
		return
	}
	g, ok := f.pending[r.Form.Get("request")]
	if !ok || !slices.Contains([]string{"county-staff", "state-staff", "transport-staff", "backup-transport-staff", "receiving-staff", "other-county-staff"}, r.Form.Get("subject")) || len(f.codes) >= 1000 {
		http.Error(w, "invalid or expired sign-in", 400)
		return
	}
	delete(f.pending, r.Form.Get("request"))
	g.subject = r.Form.Get("subject")
	code := randomID()
	f.codes[code] = g
	http.Redirect(w, r, f.callback+"?"+url.Values{"code": {code}, "state": {g.state}}.Encode(), http.StatusSeeOther)
}

func (f *fixture) token(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	if err := r.ParseForm(); err != nil {
		http.Error(w, "invalid grant", 400)
		return
	}
	id, secret, ok := r.BasicAuth()
	if !ok {
		id, secret = r.Form.Get("client_id"), r.Form.Get("client_secret")
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.cleanup()
	g, exists := f.codes[r.Form.Get("code")]
	delete(f.codes, r.Form.Get("code"))
	hash := sha256.Sum256([]byte(r.Form.Get("code_verifier")))
	if !exists || id != clientID || subtle.ConstantTimeCompare([]byte(secret), []byte(clientSecret)) != 1 ||
		r.Form.Get("grant_type") != "authorization_code" || r.Form.Get("redirect_uri") != f.callback ||
		g.challenge != base64.RawURLEncoding.EncodeToString(hash[:]) {
		w.WriteHeader(400)
		jsonResponse(w, map[string]string{"error": "invalid_grant"})
		return
	}
	header, _ := json.Marshal(map[string]string{"alg": "RS256", "kid": "local-ephemeral"})
	claims, _ := json.Marshal(map[string]any{
		"iss": f.issuer, "sub": g.subject, "aud": clientID, "iat": time.Now().Unix(),
		"exp": time.Now().Add(time.Hour).Unix(), "nonce": g.nonce,
	})
	signing := base64.RawURLEncoding.EncodeToString(header) + "." + base64.RawURLEncoding.EncodeToString(claims)
	hash = sha256.Sum256([]byte(signing))
	signature, err := rsa.SignPKCS1v15(rand.Reader, f.key, crypto.SHA256, hash[:])
	if err != nil {
		http.Error(w, "signing unavailable", 503)
		return
	}
	jsonResponse(w, map[string]any{"token_type": "Bearer", "access_token": randomID(), "expires_in": 3600,
		"id_token": fmt.Sprintf("%s.%s", signing, base64.RawURLEncoding.EncodeToString(signature))})
}
