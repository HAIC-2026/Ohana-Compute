# Identity and collaborative-write boundary

The current release is anonymous and read-only by default. Existing public
source reads, deterministic planning calculations, privacy-safe telemetry, the
client-side response checklist, and field-packet export do not require
authentication. Checklist state is not written to the server.

## Product contract

`GET /api/v1/identity/session` returns only bounded state:

- authentication mode: `disabled` or `oidc`
- session state: `anonymous` or `authenticated`
- configuration state: `disabled`, `configured`, or `unavailable`
- collaboration read, write, and approval states: `unavailable`, `denied`, or
  `available`
- controlled roles and capabilities

The response is always `Cache-Control: no-store`. It never includes bearer
tokens, subject IDs, email addresses, display names, issuer URLs, audiences,
raw claims, or verification errors. The Response Plan uses this endpoint only
to explain that the current checklist and export remain local.

`POST /api/v1/identity/authorization-check` is a no-content authorization
probe, not a collaborative plan write. It exercises the same reusable
capability guard server-side collaboration routes wrap. Disabled or
unavailable identity returns `503`, missing or invalid credentials return
`401`, and authenticated principals without the controlled capability return
`403`. The guarded handler runs only for a verified `plan_editor` principal.

## Security contract

Production does not accept unsigned or decode-only JWTs, arbitrary identity
headers, query-string tokens, static bearer tokens, or a repository-managed
user database. Authentication is defined by an injectable `TokenVerifier`
interface. A future provider verifier must cryptographically validate the
signature and key set, exact HTTPS issuer, configured audience, temporal
claims, and the controlled `roles` claim before returning a principal.

Only `viewer`, `plan_editor`, and `plan_approver` are recognized. Unknown roles
fail authentication rather than being ignored. `viewer` maps to
`collaboration:read`; `plan_editor` maps to read and write;
`plan_approver` maps to read and approve. Approval does not imply write access,
and write does not imply approval access.

Provider-backed verification is currently **blocked external**. The production
binary intentionally supplies no OIDC verifier, so complete OIDC metadata
reports `unavailable` and protected writes remain denied. Enabling real sign-in
requires an approved identity tenant/application plus a reviewed verifier
implementation; metadata alone does not enable authentication.

Durable collaboration is independently disabled unless
`COLLABORATION_PERSISTENCE=sqlite` and a valid absolute SQLite path are
configured. Identity alone never enables storage. See
[`collaborative-plans.md`](./collaborative-plans.md).

## Operator configuration

Identity defaults to:

```text
IDENTITY_MODE=disabled
```

In disabled mode, all `OIDC_*` values must remain unset. Partial or unexpected
provider settings fail startup.

The future provider metadata contract is:

```text
IDENTITY_MODE=oidc
OIDC_ISSUER_URL=https://identity.example.gov/tenant
OIDC_AUDIENCE=api://hawaii-mass-care-planner
OIDC_CLIENT_ID=public-browser-client-id
OIDC_ROLES_CLAIM=roles
```

The issuer must use HTTPS. All four OIDC values are required, and the only
supported role claim is `roles`. These values are identifiers, not credentials.
Do not add client secrets, access tokens, refresh tokens, signing keys, or
Microsoft Graph tokens to environment files, Helm values, Kubernetes
manifests, or source control.

The Helm chart mirrors this contract under `identity`. Its default remains
`disabled`. Setting `identity.mode=oidc` requires all public metadata values,
but the deployed service still reports provider verification unavailable until
the external verifier work is completed.

## Observability and privacy

Authorization checks increment
`hawaii_resilience_identity_authorization_total` with one bounded `outcome`
label: `disabled`, `unavailable`, `missing`, `invalid`, `forbidden`, or
`authorized`. HTTP metrics use registered route patterns. Roles, capabilities,
tokens, subjects, users, issuer/audience values, and raw authentication errors
are never Prometheus labels or browser telemetry values.
