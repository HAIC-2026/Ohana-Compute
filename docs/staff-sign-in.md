# Organizational staff sign-in

Operational coordination uses the organization's existing OpenID Connect provider.
There are no application passwords, browser bearer tokens, local staff accounts,
or production authentication bypasses. Public planning remains separate from the
staff boundary. An OIDC login alone does **not** grant membership: an operator must
map the provider's exact, verified subject to a configured organization.

## Production setup

1. Register a **confidential web client** with the organization's OIDC provider.
   Enable authorization-code flow and PKCE S256. Register exactly
   `https://YOUR-APP-ORIGIN/api/v1/staff/callback`. Do not enable implicit flow.
   Only the `openid` scope is requested; no refresh/offline scope is needed.
2. Terminate HTTPS at the trusted application ingress. Route `/api/` to this
   backend on the **same origin** as `/operations`. Preserve the browser's
   `Origin` header. Never derive the public origin from untrusted forwarded headers.
3. Mount a restricted, operator-managed directory file **outside the repository**
   (for example `/run/config/staff-directory.json`, owner-readable, mode `0600`):

   ```json
   {
     "organizations": [
       {
         "id": "county-oahu",
         "name": "Oahu County Coordination",
         "role": "county",
         "counties": ["003"]
       },
       {
         "id": "state",
         "name": "State Coordination",
         "role": "state",
         "counties": ["001", "003", "007", "009"]
       },
       {
         "id": "transport-oahu",
         "name": "Oahu Transport Partner",
         "role": "transport",
         "counties": ["003"]
       },
       {
         "id": "receiving-oahu",
         "name": "Oahu Receiving Partner",
         "role": "receiving",
         "counties": ["003"]
       }
     ],
     "members": [
       { "subject": "EXACT-PROVIDER-SUBJECT", "organization": "county-oahu" }
     ]
   }
   ```

   IDs are operator-controlled; roles are exactly `county`, `state`, `transport`,
   or `receiving`. County identifiers are exactly `001`, `003`, `007`, `009`.
   Counties must be explicit, nonempty, and duplicate-free. Subjects are exact,
   case-sensitive strings scoped to the single configured issuer. Email, display
   name, browser input, and arbitrary token role claims never grant membership.
   Use distinct OIDC subject mappings for each staff member. File changes take
   effect after restart, which also invalidates all existing sessions.

4. Configure:

   | Setting                         | Purpose                                            |
   | ------------------------------- | -------------------------------------------------- |
   | `STAFF_AUTH_MODE=oidc`          | Explicitly enable organizational sign-in           |
   | `STAFF_OIDC_ISSUER`             | Exact HTTPS issuer, including its tenant/path      |
   | `STAFF_OIDC_CLIENT_ID`          | Registered confidential client ID                  |
   | `STAFF_OIDC_CLIENT_SECRET_FILE` | Mounted client-secret file (preferred)             |
   | `STAFF_OIDC_CLIENT_SECRET`      | Alternative secret source; do not set both         |
   | `STAFF_PUBLIC_URL`              | Exact HTTPS application origin, with no path/query |
   | `STAFF_DIRECTORY_FILE`          | Operator-managed directory file                    |
   | `STAFF_SESSION_LIFETIME`        | Optional duration, default `8h`, range `1m`–`24h`  |
   | `LISTEN_ADDRESS`                | Optional backend address; default `:PORT`          |

   No credentials are included in this repository. OIDC discovery must succeed
   at startup; invalid/partial configuration fails startup rather than silently
   weakening security. With no staff settings, staff authentication is disabled.
   Explicit `STAFF_AUTH_MODE=disabled` also disables it, but rejects stray OIDC
   settings. No shared application password or arbitrary external-user mode exists.

## Boundary and API contract

`staffidentity.New(ctx, Config)` creates the service. `Register(mux)` registers:

| Route                        | Behavior                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `GET /api/v1/staff/session`  | `{enabled, authenticated, member?, organizations?}`; never exposes subject or credentials |
| `GET /api/v1/staff/login`    | Redirects to organizational authorization endpoint                                        |
| `GET /api/v1/staff/callback` | Validates callback, creates session, redirects only to `/operations`                      |
| `POST /api/v1/staff/logout`  | Exact-Origin check, server-side session invalidation, cookie deletion                     |

`Authenticate(request)` returns `Member` or an error matching `ErrUnauthorized`
(missing, expired, unknown session) or `ErrUnavailable` (disabled/nil service).
Member fields are `Subject` (server-only, JSON omitted), `Authenticated`,
`Organization`, `Role`, and `Counties`. `Organizations()` returns defensive copies
of the configured organization directory for server-side authorization. Session
JSON includes only organizations overlapping the member's counties, and trims
each organization's county metadata to that intersection. County/state
coordinators see this jurisdiction-scoped directory; transport/receiving partners
see only their own organization. Operational APIs independently scope their board
directory to the actor.

Authentication deliberately does **not** implicitly check the HTTP method or CSRF.
Every protected mutation must also call `ValidateMutation(request)` and reject
its error. This requires exactly one `Origin` header matching `STAFF_PUBLIC_URL`
byte-for-byte; missing, `null`, mismatched, or duplicate origins are rejected.
Frontend requests use same-origin `/api/...` URLs and cookies, not Authorization
headers or browser storage. The production `/api` reverse proxy and development
Vite `/api` proxy must preserve the same-origin browser boundary.

Authorization code exchanges use PKCE, random state, and random nonce. A separate
HttpOnly browser cookie binds each state transaction to the initiating browser;
transactions expire after five minutes and are single-use. The maintained
`coreos/go-oidc/v3` verifier checks issuer, audience, signature, and expiry, caches
JWKS, and retrieves rotated signing keys. OAuth exchanges use `golang.org/x/oauth2`.
Discovery, token, and key requests have timeouts, reject unsafe HTTP endpoints,
and do not follow redirects. Errors never contain provider response bodies.

Production cookies use the `__Host-` prefix, `Secure`, `HttpOnly`, `SameSite=Lax`,
path `/`, and no Domain. Session IDs are random 256-bit opaque values; only their
SHA-256 hashes are retained server-side. Sessions expire at the earlier of the
configured lifetime and ID-token expiry. ID/access/refresh tokens are not stored
in the browser, API JSON, logs, metrics, or session store. Authorization codes and
state appear only in standard authorization/callback protocol URLs; application
logging and metrics must use bounded route patterns, never queries, cookies,
headers, provider responses, or full URLs. Configure ingress/CDN/APM access logs
to omit/redact callback query strings and authorization endpoint redirects.

Sessions and transactions are memory-only and bounded (defaults: 1,000 each;
programmatic maximums 100,000 sessions and 10,000 transactions). Capacity exhaustion
fails closed. Restart forces sign-in. This is a **single-process session boundary**:
multiple backend replicas require sticky routing or a future shared session store.
Business records remain in the operational persistence store, not this package.
Local logout does not terminate the organization's global SSO session. A later
login may reuse organizational SSO. Disable a member and restart to revoke their
application sessions immediately. No refresh-token extension or silent renewal
is implemented.

## Real local browser testing, without a bypass

The separate `cmd/staff-oidc-test-server` command is a local interactive OIDC
fixture, **never a deployable identity provider**. It binds only to a literal
loopback address, permits only a literal-loopback callback, generates an ephemeral
RSA signing key, and implements one-use authorization codes with S256 PKCE.
Its fixed client credential is deliberately public test data:

```sh
cd backend
go run ./cmd/staff-oidc-test-server \
  -listen 127.0.0.1:9099 \
  -callback http://127.0.0.1:3000/api/v1/staff/callback
```

In an external local directory file, map test subjects `county-staff`,
`state-staff`, `transport-staff`, and `receiving-staff` to the corresponding
organizations above. The selector also supports `backup-transport-staff`
(`Backup transport partner · Oahu`), which must map to a distinct transport
organization, and `other-county-staff` (`County coordinator · Maui County (009)`),
which must map to a county organization scoped only to `009`. These mappings
remain operator configuration; the fixture selector does not grant application
authorization. Start the regular backend with:

```sh
STAFF_AUTH_MODE=oidc \
STAFF_OIDC_ISSUER=http://127.0.0.1:9099 \
STAFF_OIDC_CLIENT_ID=local-staff-client \
STAFF_OIDC_CLIENT_SECRET=local-test-only-not-a-production-secret \
STAFF_PUBLIC_URL=http://127.0.0.1:3000 \
STAFF_DIRECTORY_FILE=/YOUR/EXTERNAL/local-staff-directory.json \
STAFF_ALLOW_LOOPBACK_HTTP=true \
LISTEN_ADDRESS=127.0.0.1:8080 \
go run ./cmd/server
```

Run the frontend on `127.0.0.1:3000` with its same-origin `/api` proxy to the
backend. Open separate browser contexts at `/operations`, choose distinct roles
on the local organization's sign-in page, and verify coordinated changes are
visible only where authorized. The real production verifier still checks every
signed token; the only local relaxation is HTTP transport and non-Secure cookies.
`STAFF_ALLOW_LOOPBACK_HTTP=true` is refused unless the actual backend listener,
public origin, and issuer are all loopback. It never trusts a test identity header,
query parameter, browser fixture account, or unsigned token in the application.
Do not set this option in production. Stop the fixture after validation.

Automated protocol/security validation:

```sh
cd backend
go test -race ./internal/staffidentity ./cmd/server ./cmd/staff-oidc-test-server
```

Tests use a local TLS `httptest` issuer and real RSA-signed ID tokens, including
rotation, wrong issuer/audience/signature/expiry/nonce, missing membership,
browser binding, transaction replay/expiry, PKCE failure, restart/expiry,
strict Origin enforcement, bounded storage, and fail-closed configuration.
