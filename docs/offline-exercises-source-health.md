# Offline continuity, source health and practice lifecycle

These features use public aggregate data and synthetic planning scenarios. They
do not establish a registry, activate a resource, issue an evacuation order, or
replace County authority. Open them from **Examples** in the planner header.

## Before losing connectivity

1. Open `/offline` on production HTTPS (or localhost). Wait for **Offline app
   shell ready**. The build includes an installable manifest and icons. Use the
   browser's Install app / Add to Home Screen command if supported.
2. Select **Save latest public planning views**. This saves only public
   representative-area names, islands, summaries and known coverage gaps. The
   retrieval time is visible, and every replay is labeled **not live**.
3. Generate a response checklist in the normal response workspace and download
   its field packet. Keep the downloaded file: it is self-contained and printable.
   The offline library also retains up to five generated public packet copies.
   Device copies use the public planning-area name, not a resident-selected
   location, and omit resident language / support preferences. The regular
   downloaded file retains the existing preview behavior.
4. Reopen `/offline` and check the saved views and packet list before leaving
   connectivity. Browser site-data eviction or clearing removes local copies.

The service worker caches **only** build assets and state-free `/offline` and
`/lifecycle` documents. `/exercise` redirects to `/lifecycle` in worker logic
and redirect responses are never cached. Failed navigation falls back to the
offline page, never a cached live planner. It does not intercept API data, authenticated responses,
mutations, map tiles, route searches, free text, identity or collaboration.
Public views and packets use separate bounded Cache Storage entries. No resident
coordinates or identifiers are saved. Offline source status is historical, not a
live availability claim; current feeds, route calculations and shared writes
require connectivity.

Use **Clear saved planning data** to remove the public snapshot and packets.
Browser site-data controls additionally remove the installed shell. Storage or
worker failures are visible and do not prevent downloading the ordinary field
file. Development mode deliberately does not install a worker.

## Operator source-health runbook

Open `/source-health` or `GET /api/v1/sources/health`. The endpoint lists every
source in the backend catalog, including planned and deliberately unavailable
contracts. It reuses provenance from actual public API responses; opening health
does not create upstream probes or pretend that a source was queried.
Empty successful event feeds retain retrieval provenance independently of event
count. Source-observer failures remain visible even if every aggregate source
fails and no usable snapshot can be returned.

| State          | Meaning / operator action                                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Not observed   | No successful observation in this backend process. Open the relevant public planning view, then refresh health. This is not a healthy or empty source.         |
| Fresh          | The last observed public response carries successful retrieval and unexpired cache-freshness timestamps. Not a source-vintage or statewide coverage guarantee. |
| Stale          | A stale cached response was returned, or its freshness deadline has passed. Verify upstream and do not use as current incident evidence.                       |
| Error          | An actual public-source request failed. The last successful retrieval, if any, remains visible. Check service logs and existing `/metrics`.                    |
| Unavailable    | A normalized public response explicitly says that the authoritative contract is unavailable. Follow the County verification path; do not infer zero events.    |
| Not integrated | The catalog describes a source that is not integrated or is deliberately disabled. Complete contract/authority review before enabling.                         |

Maintenance procedure:

1. Refresh health and inspect **Known gaps**, cadence, coverage, authority and
   source URL. The snapshot reports age as of its retrieval time; refresh again
   before operational use. The latest observed point/feed is not statewide
   completeness. Per-query geography is deliberately not retained.
2. Check `/healthz`, backend logs and existing Prometheus AFN, event-trigger and
   operational-source request/error/staleness series (`docs/observability.md`).
   Distinguish an upstream failure, expired cache, missing Census configuration,
   missing coverage and intentionally disabled integrations. Never put secrets
   or resident information into diagnostic notes.
3. Verify the official endpoint and published schema with its owning authority.
   Respect source rate limits and normal cache TTLs. Do not scrape a substitute
   page or turn a warning into a legal evacuation order.
4. Repair the adapter or catalog metadata in source control; retain provenance
   and known gaps. Run `go test -race ./...`, `go vet ./...` and focused browser
   coverage before deploying. Document the changed source contract.
5. Reopen a relevant public planning view, then refresh health. Confirm an actual
   successful retrieval and appropriate freshness window. Restarting the process
   clears health observations; existing monitoring retains historical metrics.

Health state is bounded to catalog source IDs, protected by a mutex, and stores
only timestamps and bounded status. It never stores response bodies, resident
data, coordinates, request URLs, raw upstream errors or identities. Health
responses use `Cache-Control: no-store`; no automatic upstream polling is added.

## Practice lifecycle facilitation

Open `/lifecycle`; `/exercise` resolves to the same workspace. The facilitator
works through 10 Before, 10 During, and 10 After capabilities with one explicit
T± practice clock. Injects reveal only when the facilitator advances that clock.
H1, H2, and H3 are immutable local handoffs, not approvals or operating-status
changes.

The workspace accepts only bounded numbers and fixed choices. Unknown aggregate
need is never zero. Practice partners can record hold, decline, or unknown;
these categories do not represent capacity, assignment, or resource movement.
All guidance versions, strict records, and packets remain
**PRACTICE · UNSENT**. See
[`practice-lifecycle.md`](practice-lifecycle.md) for all 30 capability IDs,
boundaries, validation behavior, and the exact demo sequence.

Video beats: `/lifecycle` Before handoff → deterministic During queue and inject
→ After gates and H3 → strict record / packet → reload persistence →
`/exercise` compatibility. `/offline` → save public views → disconnect and
reload → dated **not live** snapshot. `/source-health` → expand a source → last
successful retrieval / freshness / known gaps.
