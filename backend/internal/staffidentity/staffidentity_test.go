package staffidentity

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"
)

type testIssuer struct {
	server    *httptest.Server
	key       *rsa.PrivateKey
	mu        sync.Mutex
	kid       string
	nonce     string
	challenge string
	override  map[string]any
	wrongKey  bool
}

func newIssuer(t *testing.T) *testIssuer {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	i := &testIssuer{key: key, kid: "initial"}
	i.server = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		i.mu.Lock()
		defer i.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/.well-known/openid-configuration":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"issuer": i.server.URL, "authorization_endpoint": i.server.URL + "/authorize",
				"token_endpoint": i.server.URL + "/token", "jwks_uri": i.server.URL + "/keys",
				"id_token_signing_alg_values_supported": []string{"RS256"},
			})
		case "/keys":
			_ = json.NewEncoder(w).Encode(map[string]any{"keys": []any{map[string]any{
				"kty": "RSA", "use": "sig", "alg": "RS256", "kid": i.kid,
				"n": base64.RawURLEncoding.EncodeToString(i.key.N.Bytes()),
				"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(i.key.E)).Bytes()),
			}}})
		case "/token":
			_ = r.ParseForm()
			id, secret, ok := r.BasicAuth()
			if !ok {
				id, secret = r.Form.Get("client_id"), r.Form.Get("client_secret")
			}
			hash := sha256.Sum256([]byte(r.Form.Get("code_verifier")))
			if id != "client" || secret != "secret" || r.Form.Get("code") != "one-time-code" ||
				base64.RawURLEncoding.EncodeToString(hash[:]) != i.challenge ||
				r.Form.Get("redirect_uri") != "https://app.example/api/v1/staff/callback" {
				w.WriteHeader(http.StatusBadRequest)
				_, _ = w.Write([]byte(`{"error":"invalid_grant"}`))
				return
			}
			claims := map[string]any{
				"iss": i.server.URL, "sub": "verified-staff", "aud": "client",
				"iat": time.Now().Unix(), "exp": time.Now().Add(time.Hour).Unix(), "nonce": i.nonce,
			}
			for key, value := range i.override {
				claims[key] = value
			}
			header, _ := json.Marshal(map[string]string{"alg": "RS256", "kid": i.kid})
			body, _ := json.Marshal(claims)
			signing := base64.RawURLEncoding.EncodeToString(header) + "." + base64.RawURLEncoding.EncodeToString(body)
			hash = sha256.Sum256([]byte(signing))
			signature, _ := rsa.SignPKCS1v15(rand.Reader, i.key, crypto.SHA256, hash[:])
			if i.wrongKey {
				signature[0] ^= 0xff
			}
			idToken := signing + "." + base64.RawURLEncoding.EncodeToString(signature)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"access_token": "never-expose-this-access-token", "token_type": "Bearer", "expires_in": 3600,
				"refresh_token": "never-store-this-refresh-token", "id_token": idToken,
			})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(i.server.Close)
	return i
}

func testConfig(i *testIssuer) Config {
	return Config{
		Enabled: true, Issuer: i.server.URL, ClientID: "client", ClientSecret: "secret",
		PublicURL: "https://app.example", HTTPClient: i.server.Client(),
		Organizations: []Organization{{ID: "county-oahu", Name: "Oahu County", Role: "county", Counties: []string{"003"}}},
		Members:       []Membership{{Subject: "verified-staff", Organization: "county-oahu"}},
	}
}

func newService(t *testing.T, i *testIssuer) *Service {
	t.Helper()
	s, err := New(context.Background(), testConfig(i))
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func startLogin(t *testing.T, s *Service, i *testIssuer) (*http.Cookie, string) {
	t.Helper()
	w := httptest.NewRecorder()
	s.login(w, httptest.NewRequest("GET", "https://app.example/api/v1/staff/login", nil))
	if w.Code != http.StatusFound {
		t.Fatalf("login status %d: %s", w.Code, w.Body)
	}
	location, err := url.Parse(w.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	q := location.Query()
	if q.Get("code_challenge_method") != "S256" || len(q.Get("code_challenge")) != 43 || q.Get("scope") != "openid" {
		t.Fatalf("missing PKCE or excessive scopes: %s", location)
	}
	i.mu.Lock()
	i.nonce, i.challenge = q.Get("nonce"), q.Get("code_challenge")
	i.mu.Unlock()
	cookie := w.Result().Cookies()[0]
	if !cookie.HttpOnly || !cookie.Secure || cookie.SameSite != http.SameSiteLaxMode || cookie.Path != "/" || cookie.Domain != "" {
		t.Fatalf("unsafe transaction cookie: %+v", cookie)
	}
	return cookie, q.Get("state")
}

func finishLogin(s *Service, cookie *http.Cookie, state string) *httptest.ResponseRecorder {
	r := httptest.NewRequest("GET", "https://app.example/api/v1/staff/callback?code=one-time-code&state="+url.QueryEscape(state), nil)
	if cookie != nil {
		r.AddCookie(cookie)
	}
	w := httptest.NewRecorder()
	s.callback(w, r)
	return w
}

func sessionCookie(t *testing.T, w *httptest.ResponseRecorder) *http.Cookie {
	t.Helper()
	if w.Code != http.StatusSeeOther || w.Header().Get("Location") != "/operations" {
		t.Fatalf("callback status %d body %s", w.Code, w.Body)
	}
	for _, cookie := range w.Result().Cookies() {
		if cookie.Name == "__Host-staff-session" {
			return cookie
		}
	}
	t.Fatal("no staff session cookie")
	return nil
}

func TestRealOIDCSessionAndLogout(t *testing.T) {
	i := newIssuer(t)
	s := newService(t, i)
	cookie, state := startLogin(t, s, i)
	session := sessionCookie(t, finishLogin(s, cookie, state))
	if !session.Secure || !session.HttpOnly || session.SameSite != http.SameSiteLaxMode ||
		session.MaxAge < 1 || session.MaxAge > 3600 {
		t.Fatalf("unsafe session cookie: %+v", session)
	}
	r := httptest.NewRequest("GET", "https://app.example/api/v1/staff/session", nil)
	r.AddCookie(session)
	member, err := s.Authenticate(r)
	if err != nil || member.Subject != "verified-staff" || member.Role != "county" || member.Counties[0] != "003" {
		t.Fatalf("invalid member: %+v %v", member, err)
	}
	member.Counties[0] = "001"
	again, _ := s.Authenticate(r)
	if again.Counties[0] != "003" {
		t.Fatal("caller mutated authorization")
	}
	w := httptest.NewRecorder()
	s.session(w, r)
	for _, forbidden := range []string{"verified-staff", "access_token", "refresh_token", "id_token", "secret", session.Value} {
		if strings.Contains(w.Body.String(), forbidden) {
			t.Fatalf("session leaked %s", forbidden)
		}
	}
	if !strings.Contains(w.Body.String(), `"authenticated":true`) || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("unexpected session response: %s", w.Body)
	}
	if finishLogin(s, cookie, state).Code != http.StatusUnauthorized {
		t.Fatal("callback replay succeeded")
	}
	r = httptest.NewRequest("POST", "https://app.example/api/v1/staff/logout", nil)
	r.AddCookie(session)
	w = httptest.NewRecorder()
	s.logout(w, r)
	if w.Code != http.StatusForbidden {
		t.Fatal("logout without origin accepted")
	}
	r.Header.Set("Origin", "https://app.example")
	w = httptest.NewRecorder()
	s.logout(w, r)
	if w.Code != http.StatusNoContent {
		t.Fatalf("logout failed: %d", w.Code)
	}
	if _, err := s.Authenticate(r); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("logged out session remains valid")
	}
}

func TestRejectInvalidOIDCIdentity(t *testing.T) {
	for _, tc := range []struct {
		name     string
		override map[string]any
		wrongKey bool
	}{
		{"issuer", map[string]any{"iss": "https://attacker.example"}, false},
		{"audience", map[string]any{"aud": "another-client"}, false},
		{"expiry", map[string]any{"exp": time.Now().Add(-time.Hour).Unix()}, false},
		{"nonce", map[string]any{"nonce": "incorrect"}, false},
		{"missing-nonce", map[string]any{"nonce": ""}, false},
		{"unassigned-subject", map[string]any{"sub": "unassigned"}, false},
		{"signature", nil, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			i := newIssuer(t)
			s := newService(t, i)
			cookie, state := startLogin(t, s, i)
			i.override, i.wrongKey = tc.override, tc.wrongKey
			if w := finishLogin(s, cookie, state); w.Code != http.StatusUnauthorized {
				t.Fatalf("invalid identity accepted: %d", w.Code)
			}
			if len(s.sessions) != 0 {
				t.Fatal("invalid identity created session")
			}
		})
	}
}

func TestStateBrowserBindingExpiryAndPKCE(t *testing.T) {
	i := newIssuer(t)
	s := newService(t, i)
	cookie, state := startLogin(t, s, i)
	for _, tc := range []struct {
		cookie *http.Cookie
		state  string
	}{
		{nil, state}, {&http.Cookie{Name: cookie.Name, Value: "other-browser"}, state}, {cookie, strings.Repeat("x", 43)},
	} {
		if w := finishLogin(s, tc.cookie, tc.state); w.Code != http.StatusUnauthorized {
			t.Fatal("unbound callback accepted")
		}
	}
	txn := s.transactions[state]
	txn.verifier = "not-the-original-verifier"
	s.transactions[state] = txn
	if finishLogin(s, cookie, state).Code != http.StatusUnauthorized {
		t.Fatal("wrong PKCE verifier accepted")
	}
	cookie, state = startLogin(t, s, i)
	txn = s.transactions[state]
	txn.expires = time.Now().Add(-time.Second)
	s.transactions[state] = txn
	if finishLogin(s, cookie, state).Code != http.StatusUnauthorized {
		t.Fatal("expired transaction accepted")
	}
}

func TestKeyRotationAndSessionExpiry(t *testing.T) {
	i := newIssuer(t)
	s := newService(t, i)
	cookie, state := startLogin(t, s, i)
	sessionCookie(t, finishLogin(s, cookie, state))
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	i.mu.Lock()
	i.key, i.kid = key, "rotated"
	i.mu.Unlock()
	cookie, state = startLogin(t, s, i)
	session := sessionCookie(t, finishLogin(s, cookie, state))
	r := httptest.NewRequest("GET", "https://app.example/api/v1/staff/session", nil)
	r.AddCookie(session)
	for key, value := range s.sessions {
		value.expires = time.Now().Add(-time.Second)
		s.sessions[key] = value
	}
	if _, err := s.Authenticate(r); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("expired session authenticated")
	}
	restarted := newService(t, i)
	if _, err := restarted.Authenticate(r); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("session survived process state reset")
	}
}

func TestDisabledAndOriginValidation(t *testing.T) {
	disabled, err := New(context.Background(), Config{})
	if err != nil {
		t.Fatal(err)
	}
	var nilService *Service
	for _, s := range []*Service{disabled, nilService} {
		r := httptest.NewRequest("GET", "/api/v1/staff/session", nil)
		if _, err := s.Authenticate(r); !errors.Is(err, ErrUnavailable) {
			t.Fatal("disabled service authenticated")
		}
		w := httptest.NewRecorder()
		s.session(w, r)
		if w.Body.String() != `{"enabled":false,"authenticated":false}` {
			t.Fatal(w.Body.String())
		}
	}
	i := newIssuer(t)
	s := newService(t, i)
	for _, origin := range []string{"", "null", "https://app.example.evil", "http://app.example", "https://app.example/", "https://APP.example"} {
		r := httptest.NewRequest("POST", "/api/v1/operations", nil)
		r.Header.Set("Origin", origin)
		if !errors.Is(s.ValidateMutation(r), ErrOrigin) {
			t.Fatalf("accepted origin %q", origin)
		}
	}
	r := httptest.NewRequest("POST", "/", nil)
	r.Header.Add("Origin", s.origin)
	r.Header.Add("Origin", s.origin)
	if s.ValidateMutation(r) == nil {
		t.Fatal("accepted duplicate origins")
	}
}

func TestConfigurationFailsClosed(t *testing.T) {
	i := newIssuer(t)
	for _, mutate := range []func(*Config){
		func(c *Config) { c.Enabled = false },
		func(c *Config) { c.ClientSecret = "" },
		func(c *Config) { c.PublicURL = "http://app.example" },
		func(c *Config) { c.PublicURL = "https://app.example/operations" },
		func(c *Config) { c.Issuer = "http://issuer.example" },
		func(c *Config) { c.AllowLoopbackHTTP = true; c.ListenAddress = ":8080" },
		func(c *Config) { c.AllowLoopbackHTTP = true; c.ListenAddress = "127.0.0.1:8080" },
		func(c *Config) { c.Members[0].Organization = "unknown" },
		func(c *Config) { c.Organizations[0].Role = "admin" },
		func(c *Config) { c.Organizations[0].Counties = []string{"999"} },
		func(c *Config) { c.Members = append(c.Members, c.Members[0]) },
		func(c *Config) { c.SessionLifetime = 25 * time.Hour },
	} {
		cfg := testConfig(i)
		mutate(&cfg)
		if _, err := New(context.Background(), cfg); err == nil {
			t.Fatal("unsafe config accepted")
		}
	}
}

func TestBoundedTransactionsAndSessions(t *testing.T) {
	i := newIssuer(t)
	cfg := testConfig(i)
	cfg.MaxSessions, cfg.MaxTransactions = 1, 1
	s, err := New(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}

	cookie, state := startLogin(t, s, i)
	w := httptest.NewRecorder()
	s.login(w, httptest.NewRequest("GET", "/api/v1/staff/login", nil))
	if w.Code != http.StatusTooManyRequests || len(s.transactions) != 1 {
		t.Fatal("transaction limit not enforced")
	}
	sessionCookie(t, finishLogin(s, cookie, state))
	cookie, state = startLogin(t, s, i)
	if w := finishLogin(s, cookie, state); w.Code != http.StatusServiceUnavailable || len(s.sessions) != 1 {
		t.Fatal("session limit not enforced")
	}
}

func TestLoopbackHTTPRequiresExplicitLiteralLoopbackBind(t *testing.T) {
	i := newIssuer(t)
	httpIssuer := httptest.NewServer(i.server.Config.Handler)
	t.Cleanup(httpIssuer.Close)
	i.server = httpIssuer
	cfg := testConfig(i)
	cfg.PublicURL = "http://127.0.0.1:3000"
	if _, err := New(context.Background(), cfg); err == nil {
		t.Fatal("HTTP accepted without explicit development mode")
	}
	cfg.AllowLoopbackHTTP = true
	for _, listen := range []string{"", ":8080", "0.0.0.0:8080", "[::]:8080", "localhost:8080"} {
		cfg.ListenAddress = listen
		if _, err := New(context.Background(), cfg); err == nil {
			t.Fatalf("development listener %q accepted", listen)
		}
	}
	cfg.ListenAddress = "127.0.0.1:8080"
	s, err := New(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	if s.secure {
		t.Fatal("loopback HTTP incorrectly uses a Secure-only cookie")
	}
	w := httptest.NewRecorder()
	s.login(w, httptest.NewRequest("GET", "http://127.0.0.1:3000/api/v1/staff/login", nil))
	if w.Code != http.StatusFound || w.Result().Cookies()[0].Name != "staff-loopback-transaction" {
		t.Fatal("real loopback protocol flow not enabled")
	}
}
