# Staff response coordination

`/operations` is an authenticated, shared **staff pilot**, separate from the public
map and `/coordination` evidence/annex page. It records human coordination and
acknowledgments. It does **not** dispatch vehicles, contact emergency services,
page partners, issue protective-action orders, or independently observe travel.
Do not wait for this app when official instructions or natural warning signs
require immediate protective action.

On the homepage, **Staff response** opens this same workspace beside the existing
map (below it on phones), without navigating away or resetting planning selections.
The selected community's County scopes the authorized request and preparedness
lists; the statewide view shows all authorized Counties. This is County-level
context, not geocoded pickup points or a hazard intersection. Close the workspace
with **Back to planning** to return to the conversation and evidence tools.
Staff authentication and authorization remain unchanged; public map data never
creates a request. `/operations` remains available as a standalone staff view.

## What actually changes hands

An authorized County coordinator records an intake reference, incident reference,
County, hazard, assistance category, affected count and requested deadline.
The request is not generated from Census demographics. The coordinator verifies
the intake, asks a receiving organization to confirm it can meet the stated
requirements, and offers transport work to a configured provider.

The provider must accept and give a pickup ETA, or explicitly decline with a
bounded blocker. The coordinator records verification of the external intake
reference, agency movement authority, current route/access checks and destination
arrangements. Only then can the assigned provider record pickup. The receiving
organization acknowledges arrival; the coordinator closes the handoff.

The app does not decide which fire station or agency should collect someone.
Participating agencies must establish their own authority, agreements, vehicle
capabilities, safe route checks and approved intake-reference resolution channel.
A partner-directory match is never acceptance, verified capacity or activation.

## Who can act

Organizational OIDC authenticates staff; server-configured membership determines
organization, role and permitted Counties. Membership is not selected in the UI.
See [staff sign-in configuration](staff-sign-in.md).

| Role      | Scope and responsibility                                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| County    | Own organization's requests in configured Counties; verify needs, offer/reassign work, request State support and close received handoffs        |
| State     | Explicitly escalated County requests within configured scope; offer/reassign transport support without taking County movement/closure authority |
| Transport | Current offers/assignments for own organization and County; accept/decline and acknowledge pickup                                               |
| Receiving | Current requests directed to own organization and County; confirm readiness or unavailability, acknowledge arrival                              |

Reassignment revokes the previous provider's access to the request. County and
authorized State coordinators retain the prior offer/decline history. One request
never changes from EXERCISE to operational; the contexts remain separate.

## Exceptions and synchronization

County boards expose unaccepted offers, receiving blockers, missed pickup ETAs
and requested deadlines. The decision summary and attention filter prioritize
overdue work, blockers, accepted pickup ETAs beyond the requested completion
deadline, and completion deadlines within one hour. Conditions may overlap:
do not sum the counts. Next-owner labels name the actual configured organization
or County coordinator; an absent receiving partner requires County selection,
not acknowledgment by a nonexistent partner. The next check is the earlier of
an accepted pickup ETA and completion deadline. These are review prompts, not
automatic reassignments, protective-action orders or a guarantee of safe timing.
Closed/cancelled requests need no action; arrived requests still require County
closure. The summary contains only authorized records, not modeled population
demand, available vehicles or a statewide completeness claim.

Staff explicitly request State support; a persisted
escalation becomes visible in the State workspace. Overdue conditions are derived
from durable timestamps and server time, so restarting the backend does not
silently clear them. **Visibility in the app is not a notification or page.**
Teams must maintain an approved out-of-band escalation procedure.

A receiving partner can withdraw readiness, including after pickup. The request
then remains blocked rather than pretending arrival succeeded. County staff can
record replacement receiving arrangements and re-confirm movement prerequisites.
Providers can report an unsafe-route blocker after pickup; the app records the
issue and follow-up only, not a safe alternate route.

Clients poll every five seconds and refresh on focus. Last synchronization and
disconnected state are visible; actions are disabled when disconnected. Revision
checks reject stale writes. A failed/timed-out write is not treated as success:
refresh authoritative state before acting again. API command keys make exact
retries idempotent; reusing a key with different content conflicts. A repeated
intake reference within the same mode, County and incident also conflicts.
If a write is accepted but the following authoritative refresh fails, the UI
explicitly reports that distinction, does not claim synchronized success, and
disables writes until reconnection.

## Between emergencies

Open **Preparedness → Record preparedness finding** to assign prevention work
without creating an incident or an individual assistance request. Choose the
County, hazard, evidence basis and opaque assessment reference. Supported bases
are `agency_assessment`, `public_evidence` requiring local verification, and
`exercise_finding` in EXERCISE context only. Public demographics never
automatically create a task, establish an individual need or activate a resource.
The map-selected County and hazard carry through to the form; the owner list is
limited to configured organizations serving that County.

Six bounded gap categories cover all five CMIST domains:

| Gap                 | Domain         | Evidence needed for review                                      |
| ------------------- | -------------- | --------------------------------------------------------------- |
| Transport agreement | Transportation | Reviewed agreement, capability and contact/escalation procedure |
| Receiving access    | Safety         | Accessibility and receiving arrangements                        |
| Backup power        | Medical        | Power continuity arrangements and limitations                   |
| Accessible warning  | Communication  | Accessible formats/channels, responsible partner and fallback   |
| Daily support       | Independence   | Daily-living/caregiver support arrangements                     |
| Medical support     | Medical        | Appropriate qualified support and referral arrangement          |

The form/task shows the concrete evidence criterion for its category. Assign a
configured organization and future review deadline (at most 366 days). An
identical open finding conflicts instead of silently creating duplicate work.
The organization supplies an evidence reference; County staff review it in their
authorized records system and approve closure or return it. The submitter cannot
approve their own evidence. Overdue findings include those waiting for County
review; closed findings sort last. Closure confirms only this recorded evidence,
not overall County readiness.

Existing request-derived tasks remain available from the request detail and
retain their original request/incident provenance. Standalone findings carry
source kind, source reference and hazard instead; no resident request, incident
or State escalation is manufactured. Existing jurisdiction, organization, revision
and audit rules apply. EXERCISE findings and operational records remain separate.

## Privacy and operational prerequisites

Do not enter resident names, exact pickup addresses, contact details or clinical
narratives. This release intentionally has no fields for them. References accept
bounded identifier syntax only; syntax cannot prove an identifier is not
sensitive, so use approved opaque references. Approved agency intake/dispatch
systems retain sensitive details and must be reachable through the staff's
existing authorized channel. This app alone cannot tell a driver where to pick
someone up.

Request references, organization assignments and audit actor references are
restricted operational records. They are excluded from Prometheus labels and
application error logging. No browser storage/offline cache contains staff
requests; authenticated responses use `Cache-Control: no-store`. Staff sessions
expire and must be re-established after backend restart. Apply least-privilege
access to database storage, backups, identity membership and monitoring.

Operational adoption requires participating County/partner agreement on roles,
readiness checks, deadlines, escalation ownership, retention and deletion policy,
approved reference-resolution channels and a tested fallback procedure. Until
those are agreed, evaluate with synthetic EXERCISE requests only.

## Persistence and deployment

The operational tables use the existing collaboration SQLite database and
append-only audit trail. Enable `COLLABORATION_PERSISTENCE=sqlite` with an absolute
`COLLABORATION_SQLITE_PATH` on durable writable storage. There is one database
writer: keep backend replicas at **one**, use a Recreate rollout, and never mount
the same SQLite file into multiple pods. Ephemeral storage is not acceptable for
operational use. Move to a separately designed shared database before scaling.

Expose `/api/v1/staff/*` and `/api/v1/operations/*` under the **same HTTPS origin**
as the frontend, routed to the backend without logging query strings or bodies.
The OIDC callback must reach the backend unchanged. Vite development/preview
proxies these paths to `STAFF_PROXY_TARGET` (default `http://127.0.0.1:8080`);
that proxy is not a production ingress configuration. Do not expose a test issuer
or synthetic staff credentials to production.

The backend Helm chart exposes `staffAuth.mode`, `publicURL`, `issuer`,
`clientID`, `sessionLifetime`, `clientSecret.name/key` and
`directorySecret.name/key`. Create the two Secrets through the approved secret
management process; do not put their contents in values files or Git. Enabling
staff sign-in requires SQLite persistence and one backend replica. The chart
mounts both Secrets read-only; it does not provision an identity client or the
frontend's same-origin ingress routes.

For backups, quiesce the single backend writer, take a storage-consistent copy
of the database and associated WAL state, and verify restoration into an isolated
environment before relying on the backup. Do not copy only a running SQLite main
file while ignoring uncheckpointed WAL data. Encrypt backups, restrict access
and apply the approved retention schedule. Audit history has update/delete
protection; retention/purge tooling requires a separate authorized design.

## Prometheus and Grafana

Scrape the existing `/metrics` endpoint using the existing ServiceMonitor.
Operational observations are reconstructed from persisted records on scrape,
so completed handoff observations survive process restart without counting
idempotent retries twice.

| Metric                                                    | Bounded labels                                                                               |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `hawaii_resilience_coordination_records`                  | `mode` = exercise/operational; `kind` = request/readiness/condition; finite workflow `state` |
| `hawaii_resilience_coordination_handoff_duration_seconds` | `mode`; `stage` = request_acknowledgment/offer_acceptance/acceptance_pickup/pickup_arrival   |
| `hawaii_resilience_coordination_collection_success`       | none; 0 means database aggregate collection failed                                           |

These are staff-recorded intervals, not guaranteed dispatch/travel response
times. Missing acknowledgments produce **no duration observation**, not zero.
Compare EXERCISE and operational series separately. No IDs, subject references,
incident/intake references, organization names, addresses or coordinates are
labels.

Useful dashboard queries:

```promql
sum by (state) (
  hawaii_resilience_coordination_records{mode="operational",kind="request"}
)
sum(hawaii_resilience_coordination_records{mode="operational",kind="condition",state="overdue"})
sum(hawaii_resilience_coordination_records{mode="operational",kind="condition",state="blocked"})
histogram_quantile(0.95, sum by (le, stage) (
  rate(hawaii_resilience_coordination_handoff_duration_seconds_bucket{mode="operational"}[1h])
))
sum by (state) (
  hawaii_resilience_coordination_records{mode="operational",kind="readiness"}
)
hawaii_resilience_coordination_collection_success == 0
```

Low traffic may leave rate-based quantiles undefined; display “no completed
observations,” not zero. Configure dashboards to show request backlog alongside
completed-interval charts so incomplete work cannot disappear behind a fast
average.

## Local regression

```sh
npm run test:operations
```

This isolated test command starts the real backend and a loopback-only OIDC
fixture on ports 8196/9096, with production preview on 3196. It uses independent
County, State, two transport, receiving and out-of-scope County browser contexts;
the real OIDC verifier checks signed tokens. All people, organization labels,
intake/evidence references and requests are synthetic EXERCISE data. No test
identity header or unsigned credential is accepted by the application.
Temporary directory, database, keys and helper processes are removed when the
test stack stops.
