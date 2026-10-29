// Package staffidentity authenticates organizational staff with OpenID Connect.
// Browser credentials are opaque, restart-scoped session identifiers, never tokens.
package staffidentity

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

var (
	ErrUnauthorized = errors.New("staff authentication required")
	ErrUnavailable  = errors.New("staff authentication unavailable")
	ErrOrigin       = errors.New("same-origin staff request required")
)

type Member struct {
	Subject       string   `json:"-"`
	Authenticated bool     `json:"authenticated"`
	Organization  string   `json:"organization"`
	Role          string   `json:"role"`
	Counties      []string `json:"counties"`
}

type Organization struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Role     string   `json:"role"`
	Counties []string `json:"counties"`
}

// Membership is trusted operator configuration, not an OIDC claim or user input.
// The issuer is Config.Issuer; subject matching is exact and case sensitive.
type Membership struct {
	Subject      string `json:"subject"`
	Organization string `json:"organization"`
}

type Config struct {
	Enabled           bool
	Issuer            string
	ClientID          string
	ClientSecret      string
	PublicURL         string
	Organizations     []Organization
	Members           []Membership
	SessionLifetime   time.Duration
	MaxSessions       int
	MaxTransactions   int
	HTTPClient        *http.Client
	AllowLoopbackHTTP bool
	ListenAddress     string
}

type Authenticator interface {
	Authenticate(*http.Request) (Member, error)
}

type transaction struct {
	binding, nonce, verifier string
	expires                  time.Time
}

type session struct {
	member  Member
	expires time.Time
}

type Service struct {
	mu              sync.Mutex
	enabled         bool
	secure          bool
	origin          string
	oauth           oauth2.Config
	verifier        *oidc.IDTokenVerifier
	client          *http.Client
	members         map[string]Member
	organizations   []Organization
	transactions    map[string]transaction
	sessions        map[[32]byte]session
	sessionTTL      time.Duration
	maxSessions     int
	maxTransactions int
}

func New(ctx context.Context, cfg Config) (*Service, error) {
	s := &Service{}
	if !cfg.Enabled {
		if cfg.Issuer != "" || cfg.ClientID != "" || cfg.ClientSecret != "" ||
			cfg.PublicURL != "" || len(cfg.Members) != 0 || len(cfg.Organizations) != 0 ||
			cfg.AllowLoopbackHTTP {
			return nil, errors.New("staff settings require explicit oidc mode")
		}
		return s, nil
	}
	if cfg.ClientID == "" || cfg.ClientSecret == "" {
		return nil, errors.New("staff OIDC client ID and secret are required")
	}
	if cfg.AllowLoopbackHTTP {
		host, _, err := net.SplitHostPort(cfg.ListenAddress)
		ip := net.ParseIP(host)
		if err != nil || ip == nil || !ip.IsLoopback() {
			return nil, errors.New("staff development HTTP requires an explicit loopback listener")
		}
	}
	public, err := url.Parse(cfg.PublicURL)
	if err != nil || !validEndpoint(public, cfg.AllowLoopbackHTTP) ||
		public.RawQuery != "" || public.Fragment != "" || (public.Path != "" && public.Path != "/") {
		return nil, errors.New("staff public URL must be an HTTPS origin")
	}
	issuer, err := url.Parse(cfg.Issuer)
	if err != nil || !validEndpoint(issuer, cfg.AllowLoopbackHTTP) ||
		issuer.RawQuery != "" || issuer.Fragment != "" {
		return nil, errors.New("staff issuer must be an HTTPS URL")
	}
	if cfg.AllowLoopbackHTTP && (!loopbackHost(public.Hostname()) || !loopbackHost(issuer.Hostname())) {
		return nil, errors.New("staff development HTTP is restricted to loopback origins and issuers")
	}
	s.members, s.organizations, err = directory(cfg)
	if err != nil {
		return nil, err
	}
	s.sessionTTL = cfg.SessionLifetime
	if s.sessionTTL == 0 {
		s.sessionTTL = 8 * time.Hour
	}
	if s.sessionTTL < time.Minute || s.sessionTTL > 24*time.Hour {
		return nil, errors.New("staff session lifetime must be between one minute and 24 hours")
	}
	s.maxSessions, s.maxTransactions = cfg.MaxSessions, cfg.MaxTransactions
	if s.maxSessions == 0 {
		s.maxSessions = 1000
	}
	if s.maxTransactions == 0 {
		s.maxTransactions = 1000
	}
	if s.maxSessions < 1 || s.maxSessions > 100000 || s.maxTransactions < 1 || s.maxTransactions > 10000 {
		return nil, errors.New("staff session or transaction limit is invalid")
	}
	baseClient := cfg.HTTPClient
	if baseClient == nil {
		baseClient = &http.Client{Timeout: 10 * time.Second}
	}
	client := *baseClient
	client.Timeout = 10 * time.Second
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	transport := client.Transport
	if transport == nil {
		transport = http.DefaultTransport
	}
	client.Transport = endpointTransport{base: transport, allowHTTP: cfg.AllowLoopbackHTTP}
	s.client = &client
	ctx = oidc.ClientContext(ctx, s.client)
	provider, err := oidc.NewProvider(ctx, cfg.Issuer)
	if err != nil {
		// Library errors can contain response bodies or endpoint URLs. Do not expose them.
		return nil, errors.New("staff OIDC discovery failed")
	}
	endpoint := provider.Endpoint()
	for _, raw := range []string{endpoint.AuthURL, endpoint.TokenURL} {
		u, err := url.Parse(raw)
		if err != nil || !validEndpoint(u, cfg.AllowLoopbackHTTP) {
			return nil, errors.New("staff OIDC discovery advertised an unsafe endpoint")
		}
	}
	s.origin = public.Scheme + "://" + public.Host
	s.oauth = oauth2.Config{
		ClientID: cfg.ClientID, ClientSecret: cfg.ClientSecret, Endpoint: endpoint,
		RedirectURL: s.origin + "/api/v1/staff/callback", Scopes: []string{oidc.ScopeOpenID},
	}
	s.verifier = provider.Verifier(&oidc.Config{ClientID: cfg.ClientID})
	s.secure = public.Scheme == "https"
	s.enabled = true
	s.transactions = make(map[string]transaction)
	s.sessions = make(map[[32]byte]session)
	return s, nil
}

func directory(cfg Config) (map[string]Member, []Organization, error) {
	orgs := make(map[string]Organization)
	list := make([]Organization, 0, len(cfg.Organizations))
	for _, org := range cfg.Organizations {
		if org.ID == "" || len(org.ID) > 100 || strings.TrimSpace(org.ID) != org.ID ||
			org.Name == "" || len(org.Name) > 200 ||
			!slices.Contains([]string{"county", "state", "transport", "receiving"}, org.Role) ||
			len(org.Counties) == 0 || len(org.Counties) > 4 {
			return nil, nil, errors.New("invalid staff organization")
		}
		if _, exists := orgs[org.ID]; exists {
			return nil, nil, errors.New("duplicate staff organization")
		}
		seen := map[string]bool{}
		for _, county := range org.Counties {
			if !slices.Contains([]string{"001", "003", "007", "009"}, county) || seen[county] {
				return nil, nil, errors.New("invalid or duplicate staff organization county")
			}
			seen[county] = true
		}
		org.Counties = slices.Clone(org.Counties)
		orgs[org.ID] = org
		list = append(list, org)
	}
	members := make(map[string]Member)
	for _, member := range cfg.Members {
		org, ok := orgs[member.Organization]
		if !ok || member.Subject == "" || len(member.Subject) > 512 {
			return nil, nil, errors.New("invalid staff membership")
		}
		if _, exists := members[member.Subject]; exists {
			return nil, nil, errors.New("duplicate staff subject")
		}
		members[member.Subject] = Member{
			Subject: member.Subject, Authenticated: true, Organization: org.ID,
			Role: org.Role, Counties: slices.Clone(org.Counties),
		}
	}
	if len(orgs) == 0 || len(members) == 0 || len(orgs) > 1000 || len(members) > 10000 {
		return nil, nil, errors.New("staff directory must contain bounded organizations and memberships")
	}
	return members, list, nil
}

func loopbackHost(host string) bool {
	ip := net.ParseIP(host)
	return host == "localhost" || (ip != nil && ip.IsLoopback())
}

func validEndpoint(u *url.URL, allowHTTP bool) bool {
	return u != nil && u.Hostname() != "" && u.User == nil && u.Fragment == "" &&
		(u.Scheme == "https" || (allowHTTP && u.Scheme == "http" && loopbackHost(u.Hostname())))
}

type endpointTransport struct {
	base      http.RoundTripper
	allowHTTP bool
}

func (t endpointTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	if !validEndpoint(r.URL, t.allowHTTP) || (t.allowHTTP && !loopbackHost(r.URL.Hostname())) {
		return nil, errors.New("unsafe staff OIDC endpoint")
	}
	return t.base.RoundTrip(r)
}

func (s *Service) Authenticate(r *http.Request) (Member, error) {
	if s == nil || !s.enabled {
		return Member{}, ErrUnavailable
	}
	cookie, err := r.Cookie(s.cookieName("session"))
	if err != nil || len(cookie.Value) != 43 {
		return Member{}, ErrUnauthorized
	}
	key := sha256.Sum256([]byte(cookie.Value))
	s.mu.Lock()
	defer s.mu.Unlock()
	record, ok := s.sessions[key]
	if !ok || !time.Now().Before(record.expires) {
		delete(s.sessions, key)
		return Member{}, ErrUnauthorized
	}
	member := record.member
	member.Counties = slices.Clone(member.Counties)
	return member, nil
}

func (s *Service) ValidateMutation(r *http.Request) error {
	if s == nil || !s.enabled {
		return ErrUnavailable
	}
	origins := r.Header.Values("Origin")
	if len(origins) != 1 || origins[0] != s.origin {
		return ErrOrigin
	}
	return nil
}

func (s *Service) Organizations() []Organization {
	if s == nil || !s.enabled {
		return nil
	}
	result := slices.Clone(s.organizations)
	for i := range result {
		result[i].Counties = slices.Clone(result[i].Counties)
	}
	return result
}

func (s *Service) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/staff/session", s.session)
	mux.HandleFunc("GET /api/v1/staff/login", s.login)
	mux.HandleFunc("GET /api/v1/staff/callback", s.callback)
	mux.HandleFunc("POST /api/v1/staff/logout", s.logout)
}

func private(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Content-Type-Options", "nosniff")
}

func (s *Service) cookieName(kind string) string {
	if s.secure {
		return "__Host-staff-" + kind
	}
	return "staff-loopback-" + kind
}

func (s *Service) cookie(w http.ResponseWriter, kind, value string, expires time.Time) {
	maxAge := int(time.Until(expires).Seconds())
	if value == "" {
		maxAge = -1
	}
	http.SetCookie(w, &http.Cookie{
		Name: s.cookieName(kind), Value: value, Path: "/", HttpOnly: true,
		Secure: s.secure, SameSite: http.SameSiteLaxMode, Expires: expires, MaxAge: maxAge,
	})
}

func randomValue() (string, error) {
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func (s *Service) cleanup(now time.Time) {
	for key, txn := range s.transactions {
		if !now.Before(txn.expires) {
			delete(s.transactions, key)
		}
	}
	for key, session := range s.sessions {
		if !now.Before(session.expires) {
			delete(s.sessions, key)
		}
	}
}

func (s *Service) login(w http.ResponseWriter, r *http.Request) {
	private(w)
	if s == nil || !s.enabled {
		http.Error(w, ErrUnavailable.Error(), http.StatusServiceUnavailable)
		return
	}
	// A top-level login is safe; cross-site fetches cannot initiate a transaction.
	if site := r.Header.Get("Sec-Fetch-Site"); site != "" && site != "same-origin" && site != "none" {
		http.Error(w, ErrOrigin.Error(), http.StatusForbidden)
		return
	}
	state, err1 := randomValue()
	binding, err2 := randomValue()
	nonce, err3 := randomValue()
	verifier, err4 := randomValue()
	if errors.Join(err1, err2, err3, err4) != nil {
		http.Error(w, "staff sign-in unavailable", http.StatusServiceUnavailable)
		return
	}
	s.mu.Lock()
	s.cleanup(time.Now())
	if len(s.transactions) >= s.maxTransactions {
		s.mu.Unlock()
		http.Error(w, "staff sign-in capacity reached", http.StatusTooManyRequests)
		return
	}
	expires := time.Now().Add(5 * time.Minute)
	s.transactions[state] = transaction{binding: binding, nonce: nonce, verifier: verifier, expires: expires}
	s.mu.Unlock()
	s.cookie(w, "transaction", binding, expires)
	http.Redirect(w, r, s.oauth.AuthCodeURL(state,
		oauth2.S256ChallengeOption(verifier), oidc.Nonce(nonce)), http.StatusFound)
}

func (s *Service) callback(w http.ResponseWriter, r *http.Request) {
	private(w)
	if s == nil || !s.enabled {
		http.Error(w, ErrUnavailable.Error(), http.StatusServiceUnavailable)
		return
	}
	fail := func() { http.Error(w, "staff sign-in failed; start again", http.StatusUnauthorized) }
	// Bound callback input and reject ambiguous duplicate protocol parameters.
	if len(r.URL.RawQuery) > 8192 {
		fail()
		return
	}
	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil || len(query["state"]) != 1 || len(query["code"]) != 1 ||
		query.Get("error") != "" || len(query.Get("state")) != 43 || len(query.Get("code")) > 4096 {
		fail()
		return
	}
	cookie, err := r.Cookie(s.cookieName("transaction"))
	if err != nil {
		fail()
		return
	}
	s.mu.Lock()
	txn, ok := s.transactions[query.Get("state")]
	if !ok || !time.Now().Before(txn.expires) ||
		subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(txn.binding)) != 1 {
		s.mu.Unlock()
		fail()
		return
	}
	delete(s.transactions, query.Get("state"))
	s.mu.Unlock()
	s.cookie(w, "transaction", "", time.Unix(1, 0))
	ctx, cancel := context.WithTimeout(oidc.ClientContext(r.Context(), s.client), 15*time.Second)
	defer cancel()
	token, err := s.oauth.Exchange(ctx, query.Get("code"), oauth2.VerifierOption(txn.verifier))
	if err != nil {
		fail()
		return
	}
	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok {
		fail()
		return
	}
	idToken, err := s.verifier.Verify(ctx, rawIDToken)
	if err != nil || subtle.ConstantTimeCompare([]byte(idToken.Nonce), []byte(txn.nonce)) != 1 {
		fail()
		return
	}
	member, ok := s.members[idToken.Subject]
	if !ok {
		fail()
		return
	}
	value, err := randomValue()
	if err != nil {
		fail()
		return
	}
	expires := time.Now().Add(s.sessionTTL)
	if idToken.Expiry.Before(expires) {
		expires = idToken.Expiry
	}
	s.mu.Lock()
	s.cleanup(time.Now())
	if len(s.sessions) >= s.maxSessions {
		s.mu.Unlock()
		http.Error(w, "staff session capacity reached", http.StatusServiceUnavailable)
		return
	}
	// Replace any existing browser session to prevent accumulated sessions on re-login.
	if old, err := r.Cookie(s.cookieName("session")); err == nil {
		delete(s.sessions, sha256.Sum256([]byte(old.Value)))
	}
	s.sessions[sha256.Sum256([]byte(value))] = session{member: member, expires: expires}
	s.mu.Unlock()
	s.cookie(w, "session", value, expires)
	http.Redirect(w, r, "/operations", http.StatusSeeOther)
}

func (s *Service) logout(w http.ResponseWriter, r *http.Request) {
	private(w)
	if err := s.ValidateMutation(r); err != nil {
		status := http.StatusForbidden
		if errors.Is(err, ErrUnavailable) {
			status = http.StatusServiceUnavailable
		}
		http.Error(w, err.Error(), status)
		return
	}
	s.mu.Lock()
	if cookie, err := r.Cookie(s.cookieName("session")); err == nil {
		delete(s.sessions, sha256.Sum256([]byte(cookie.Value)))
	}
	if cookie, err := r.Cookie(s.cookieName("transaction")); err == nil {
		for state, txn := range s.transactions {
			if subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(txn.binding)) == 1 {
				delete(s.transactions, state)
			}
		}
	}
	s.mu.Unlock()
	s.cookie(w, "session", "", time.Unix(1, 0))
	s.cookie(w, "transaction", "", time.Unix(1, 0))
	w.WriteHeader(http.StatusNoContent)
}

func (s *Service) session(w http.ResponseWriter, r *http.Request) {
	private(w)
	w.Header().Set("Content-Type", "application/json")
	member, err := s.Authenticate(r)
	if err != nil {
		fmt.Fprintf(w, `{"enabled":%t,"authenticated":false}`, s != nil && s.enabled)
		return
	}
	writeSession(w, member, s.Organizations())
}
