# Durable collaborative plans

Collaborative plans extend the existing Response Plan without replacing the
anonymous checklist or field packet. The default remains local-only. Shared
storage is available only when both an identity verifier and durable
persistence are explicitly configured.

## Product workflow

An authenticated configured planner can:

1. save the current Map → Model → Match result as version 1;
2. save later edits as immutable versions and compare two versions;
3. add bounded operational decision notes;
4. assign controlled response roles and capabilities for a due window;
5. record an authorized `approved`, `changes_requested`, or `withdrawn`
   decision for a specific version; and
6. review append-only audit events containing only controlled action, resource,
   actor-role, outcome, and time fields.

Stale mutations return `409` and never overwrite newer work. The interface
offers **Refresh and review** after a conflict.

Planning notes and rationales must not contain names, addresses, contact
details, medical or case records, or person-level information. Assignments are
to controlled teams or response roles, never named individuals. API responses
expose a controlled actor role but never a raw subject ID, email address,
token, or token claim.

## API

All collaboration responses use `Cache-Control: no-store`. Reads require
`collaboration:read`; plan/version, comment, and assignment mutations require
`collaboration:write`; approval records require
`collaboration:approve`.

- `POST /api/v1/collaboration/plans`
- `GET /api/v1/collaboration/plans/{planID}`
- `PUT /api/v1/collaboration/plans/{planID}`
- `POST /api/v1/collaboration/plans/{planID}/comments`
- `POST /api/v1/collaboration/plans/{planID}/assignments`
- `POST /api/v1/collaboration/plans/{planID}/approvals`
- `GET /api/v1/collaboration/plans/{planID}/compare?from=1&to=2`

Mutations accept exactly one JSON object, reject unknown fields, require
`application/json`, and are limited to 32 KiB. Text and collection lengths,
status values, roles, capabilities, due windows, and approval decisions are
bounded.

## SQLite persistence

The production driver uses an embedded transactional SQLite database. Startup
applies migrations atomically and enables:

- WAL journaling;
- foreign-key enforcement;
- a five-second busy timeout;
- full synchronous durability; and
- one database connection to preserve the single-writer deployment boundary.

Persistence is disabled by default:

```text
COLLABORATION_PERSISTENCE=disabled
```

To enable one-replica durable storage:

```text
COLLABORATION_PERSISTENCE=sqlite
COLLABORATION_SQLITE_PATH=/var/lib/hawaii-resilience/collaboration.db
```

The path must be absolute. A path supplied while persistence is disabled,
missing SQLite path, unsupported mode, failed migration, or unavailable volume
fails startup.

The Helm chart creates a `ReadWriteOnce` PVC only when
`collaboration.persistence=sqlite` and rejects `replicaCount` values other than
`1`. SQLite/PVC is not multi-replica HA. Back up the PVC with the cluster's
volume-snapshot or backup service; copying a live database file without its WAL
is not a supported backup. Multi-replica operation requires a future external
database implementation behind the `collaboration.Store` interface.

## Verification boundary

The real-Go Playwright fixture injects a deterministic verifier and uses a
temporary SQLite database. The test token path is compiled only when
`VITE_ENABLE_TEST_IDENTITY=true` and reads the token from browser
`sessionStorage`; production builds do not enable this path. The production
binary still supplies no OIDC verifier and therefore remains fail closed until
approved external identity configuration is implemented.
