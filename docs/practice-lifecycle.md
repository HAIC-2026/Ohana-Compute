# Practice event lifecycle

Open `/lifecycle` to rehearse one complete **Before → During → After** event
cycle. `/exercise` is a compatibility path to the same workspace; it does not
create a second exercise state or clock.

The decision workspace is public, local-only, fixed-choice, and deterministic.
Its read-only evidence panel checks the backend
`lifecycle-evidence.v1` aggregate every 60 seconds while the document is visible
and online, and on focus or online recovery. It uses
five fictional practice roles and four lettered practice partners. It accepts no
resident names, addresses, contacts, coordinates, clinical details, or
operational free text. It makes no staff API writes and has no controls for
messages, resource movement, protective actions, or live-status changes.
Public NWS/PTWC/USGS/FEMA evidence remains planning context, never County
authority, dispatch, passability, restoration, containment, completeness,
partner acceptance, recovery completion, or all-clear truth.

Every draft, strict record, and closeout packet is labeled
**PRACTICE · UNSENT**. Unknown aggregate need is always displayed as
**Unknown — not zero**.

## One immutable chain

- **H1 — Before to During:** the facilitator locks a fictional event, carries
  owned readiness gaps, selects 1–3 objectives, computes the preparation
  margin, chooses an assumption revision, assigns a practice channel class and
  marks each accessible format planned, gap, or unknown, records fixed-choice
  evidence, declares simulation scope, schedules deterministic injects, and
  seals the handoff. H1 cannot be sealed while any scheduled inject is in an
  area that is no longer simulated. Sealing is not an authorization decision.
- **H2 — During to After:** H1 becomes one aggregate support item per carried
  gap. Practice time advances only through explicit T+ controls. Service-area
  records become stale after their recheck interval. Partner responses are
  hold, decline, or unknown. Escalation needs a blocked or overdue item and a
  matching reason. Assumption r2 is compared with the revision sealed in H1.
  Guidance versions, shift snapshots, and evidence replacements remain
  traceable; only current stale evidence can be replaced. Every support item is
  carried or set aside before H2 is sealed.
- **H3 — After to next Before:** carried H2 items become a recovery register.
  Aggregate CMIST bands, linked hold review, service rechecks, recovery guidance,
  objective scores, and six end-of-cycle gates determine what carries into the
  next cycle. Hold review refuses carried held items without a follow-up-ready
  row; set-aside items do not block it. Stale, unknown, and unavailable service
  records need a recheck plan. Every guidance block is classified individually.
  Starting the next cycle refuses a gates-met decision if a gate has since
  regressed. The prior cycle becomes read-only.

## Capability contract

| Phase  | IDs     | Implemented interactions                                                                                                                                                                                       |
| ------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before | B01–B10 | Event lock; ranked owned gaps; frozen objectives; timing margin; assumption comparison; accessible formats; practice evidence; simulation scope; scheduled injects; immutable H1.                              |
| During | D01–D10 | H1 queue; deterministic clock; service-area records; partner response categories; bounded escalation; r2; versioned guidance; frozen shift snapshot; evidence replacement; item disposition and H2.            |
| After  | A01–A10 | Recovery register; aggregate unmet-need bands; linked hold review; recheck plans; recovery draft; objective scores; six gates; strict comparison-only exchange; deterministic closeout packet; H3 and cycle 2. |

Each capability interaction appends a local ledger event and exposes a stable
`data-capability="B01"` through `data-capability="A10"` marker. Browser
persistence uses the strict `practice-lifecycle.v4` schema and an explicit
reset. Imports are bounded to 128 KiB, reject duplicate or extra JSON keys, and
pin a read-only comparison without merging content. Exchange metadata and the
ledger do not change canonical export bytes or the cycle digest.
Every reducer action checks both persisted-state and canonical-export UTF-8 bytes
after all effects, including ledger additions. Overflow rejects the action and
preserves the previous valid state, including retained source history.

Saved `practice-lifecycle.v1`, original `practice-lifecycle.v2`, and
`practice-lifecycle.v3` state migrate explicitly into v4. V1 and v2 receive the
same empty FEMA source records as before; every older schema receives empty NWS
weather records, weather rechecks, and weather history. No migration invents a
weather product. Original H1/H2 digest inputs remain unchanged because empty
weather collections are omitted from those digest profiles. V1 H1 verification
still reconstructs its bounded pre-seal evidence states, and v2/v3 use their
original canonical inputs. Malformed or oversized saved records are not
overwritten on a failed restore. Strict comparison imports remain
current-schema-only; they do not silently migrate or merge content.
An explicit snapshot pin stores only snapshot identity, times, aggregate status,
bounded counts, and each feed's freshness state and completeness status in the
current phase. Event-source error/unavailable counts are capped at 99, so a
partial event feed cannot be summarized as merely fresh. Duplicate phase pins
are rejected. Pins add an `EVIDENCE_PIN` ledger row without marking a B/D/A
capability complete, and later refreshes cannot alter pins or sealed H1/H2/H3
records. Restore recomputes H1/H2 digests from their retained canonical inputs
and requires their evidence references to exactly match the corresponding
phase pins.

## Source-bound B07 → D03 → A04

The first item-level chain is deliberately **FEMA shelter reporting only**.
It uses the existing read-only `/api/v1/lifecycle/evidence` endpoint, with a
bounded `shelter_context` projection derived from the existing official adapter.
No new scraping, staff persistence, mutations, dispatch, or authority controls
are introduced.

- **B07:** carry a gap, review a report, then explicitly accept the displayed
  revision as facilitator-selected planning context. A refresh can update the
  suggestions but cannot swap the reviewed revision at acceptance. The record
  retains every displayed report fact, product/source identity, authority/link,
  geography/query scope, source timestamps (including explicit unknowns),
  limitations, fact digest, derivation version, retrieval metadata, snapshot ID,
  acceptance time/state, and linked gap. A source acceptance appends
  `SOURCE_ACCEPT`, not a B07 completion or “criteria present” marker. It does not
  establish that the fictional event affects the planning location.
- **D03:** a separate **FEMA-reported shelter context** register displays status,
  reported capacity, accessibility and pet codes, provenance, and limitations.
  The manual practice service-area condition remains a distinct fixed-choice
  action. A successful empty query says **no records reported**, not no shelters.
  Partial, stale, unavailable, and last-known results remain explicit. No report
  establishes admission, available beds, complete County coverage, current
  accessibility verification, restoration, or a service condition.
- **A04:** an explicit source recheck performs a read and appends an owned,
  horizon-bounded result linked to the exact accepted record: `unchanged`,
  `changed`, `not-returned`, or `source-unavailable`. Only a successful complete
  same-scope query can yield `not-returned`; incomplete, stale, expired,
  cancelled, offline, malformed, or failed reads cannot. This is a comparison
  result, never recovery or a replacement for accepted facts. Manual service
  recheck plans, objective scores, and gates do not change.

Real-source freshness uses wall time, refreshed on an independent browser clock,
not practice T+ time or successful request time. A 304 does not extend an expired
deadline. Retrieval freshness is separate from observation freshness: this FEMA
feed does not provide verified item update/expiry timestamps, so observation
age remains **unknown**, even after a successful retrieval. Transient errors keep
validated last-known facts with an unavailable label. Lifecycle evidence JSON
is bounded and runtime-validated before entering the cache; an invalid payload
does not replace validated data.
Source, transport, and aggregate enum fields require actual strings before
membership checks. Coercible arrays, objects, and numbers are malformed, never
fresh evidence or a basis for a `not-returned` recheck.
Every mount reconciles offline transport, including cache hits after navigation:
validated facts remain last-known/unavailable without issuing another request.

The projection contains at most 20 unique items, each at most 4 KiB, with
bounded typed fields and no resident/contact/address fields. Missing capacity
is null, not zero; missing status is unknown, not `OPEN`. Malformed or truncated
source records make query processing partial rather than silently complete.
Each item uses `fema-shelter-context.v1` and a deterministic
`fnv1a-dual-v1` content checksum. The checksum covers facts, attribution, source
times, geography, scope, limitations, and derivation version, but excludes
retrieval timestamps, snapshot identity, distance, and item ordering. It detects
content changes, **not authenticity or operational authority**.

V3 allows at most 8 accepted claims and 16 source rechecks per cycle, with a
combined 32 KiB source-record budget and the existing 128 KiB exchange/restore
limit. Source records are immutable and append-only. H1/H2 include accepted
source content; H3 retains the full accepted/recheck chain and a verified retained
content checksum. Later cycles archive prior source-bearing H3 records (up to 16
archives, subject to the total byte limit) rather than silently dropping them.
At a limit, export and explicitly reset; no accepted record is auto-evicted.
Exports and packets include the full source chain and its provenance in fixed
canonical order. Existing sealed handoffs are not rewritten by refreshes.

## NWS product provenance and immutable lifecycle records

The lifecycle evidence panel retains bounded NWS product identity, canonical
source link, sender attribution, CAP message state, explicit references,
reported area, affected zones, and validated source geometry. Sent, effective,
onset, expires, and ends are independent source facts. Issued time comes only
from `sent`; absent onset and ends remain null. No retrieval time, practice
clock, or other timestamp fills a missing source field.

Retrieval freshness and product validity are separate. The browser evaluates
product expiry on wall time even without another request, including after a
304 response. A fresh retrieval cannot revive an expired product; stale retrieval
does not rewrite the product's timestamps. Only actual, public Alert/Update
messages with valid decision fields can be eligible. Test, Exercise, Draft,
System, Cancel, Ack, and Error messages cannot become current warnings because
their titles say “Warning” or their expiry is in the future. References retain
source order and attribution; titles never establish a replacement chain.
Cancellation is a message relationship, not an all-clear or restoration.

The browser validates nested fields, enum types, and the consistency of
eligibility, relationship, and validity at the source snapshot time before
caching. A bounded but malformed source timestamp can be retained only with
explicit unknown validity; it cannot be paired with a current-product claim.
The ingestion boundary accepts at most 100 products in the existing 8 MiB
response limit; reference/zone/code lists are bounded to 64 entries, and
Polygon/MultiPolygon shapes to 16 KiB and 512 vertices. The existing 2 MiB
browser evidence limit remains in force. Unsupported `expiredReferences` are
not projected.

The NWS query is statewide Hawaiʻi. Query membership, reported area names,
issuing office, and county membership never establish local impact. The
lifecycle-evidence handler first evaluates retained Polygon and MultiPolygon
source geometry against its validated request point, on a per-request copy.
When retained geometry is absent and canonical `affectedZones` are present, it
may instead use separately cached official NWS zone boundaries. A present
invalid, unsupported, or oversized inline geometry never silently falls back
to zones. The location-less event-trigger feed remains
`unknown/not_evaluated`.

Applicability uses `rfc7946-planar-rational-v1`: original JSON coordinate and
query-number lexemes are converted to exact rational values, so no raw
floating-point equality or architecture-dependent tolerance is used. A strict
shell interior is `inside`; a valid hole is `outside`; and any shell or hole
boundary is `unknown/boundary`. MultiPolygon validation covers every member
before classification; any strict interior wins, then any boundary, otherwise
the result is outside. Ring orientation, rotated starts, consecutive duplicate
vertices, and member ordering do not change valid results.

Applicability validation is stricter than retained geometry status and never
mutates that provenance status. It rejects malformed or unclosed rings, fewer
than three distinct vertices, zero area, self-intersection/self-touch,
backtracking spikes, edges spanning more than 180 degrees longitude, holes
outside/overlapping/touching the shell or one another, and overlapping
MultiPolygon members. Shell-touching holes are invalid topology rather than
boundary-bearing valid holes. Missing polygons remain `unknown/no_polygon`;
unsupported or over-limit geometry remains `unknown/unsupported`; retained
malformed or topologically invalid shapes remain `unknown/invalid_topology`.
The response binds the result to the evaluated `[longitude, latitude]` and
algorithm version, and those fields participate in the semantic snapshot hash.
The browser rejects evidence for a different requested point rather than
recomputing applicability.

A separate backend-only zone cache reconstructs requests from validated
`forecast`, `county`, or `fire` identifiers on `api.weather.gov`; product data
cannot choose a host, query, credentials, or redirect target. Fetches require
GeoJSON, a User-Agent, a 10-second timeout, at most four concurrent requests, a
2 MiB response limit, 8,192 vertices, and a 5,000,000-operation exact topology
budget. Polygon, MultiPolygon, and one-level GeometryCollection members made
only of those shapes are supported without simplification, rounding, or
truncation. Bounding-box pruning preserves exact classification while bounding
unnecessary pair checks. Preparation happens asynchronously when alert
snapshots are ingested; lifecycle requests only read prepared cache state.

Validated zone responses must bind feature `id`, `properties.@id`, and
`properties.id` to the requested canonical zone and provide a valid
effective/expiration interval containing the product `sent` time. A canonical
digest of identity, dates, and exact geometry is the zone source revision.
Validated entries use the smaller of the configured wall-clock maximum and
source `max-age`/`Age` or `Expires` freshness, with conditional ETag or
Last-Modified revalidation. A 304 updates supplied cache headers and otherwise
inherits the prior source policy, including `no-cache`; alert 304 responses
also retry eligible expired zone-cache entries. Validators are retained only
with a valid body.
Cold, stale, failed, malformed, oversized, too-complex, unsupported, or
time-mismatched members remain reason-coded unknown; last-known geometry cannot
produce a definitive result after expiry.

The 2026-10-30 read-only compatibility probe accepted 88 of the 90 current
Hawaiʻi forecast, county, and fire resources. County zones `HIC001` and
`HIC009` exceeded the exact topology-work budget and therefore remain explicit
`unknown/too_complex`; they are not simplified or silently truncated. This is a
point-in-time compatibility observation, not a promise that every future zone
revision will fit the bounds.

Multiple affected zones are evaluated as a union without creating a merged
polygon. Any fresh valid strict interior establishes `inside`; otherwise any
boundary is unknown. `outside` is allowed only after every unique referenced
zone is fresh, valid, source-time-bound, and strictly exterior. A failed member
therefore cannot create false outside. Per-zone identity, source revision,
freshness, result, and reason are projected, but zone coordinates never reach
the browser. These fields and the result participate in the semantic snapshot
hash. The browser ages the projected per-zone `fresh_until` values: a displayed
`inside` or `outside` becomes reason-coded unknown once its required zone
evidence expires, without recomputing geometry.

The repository deploys the backend independently from the frontend, so version
skew is possible. The browser accepts the previous contract only when
`applicability_basis` and zone evidence are both absent; that preserves the
legacy inline/no-polygon result. It never infers affected-zone applicability
from absent geometry or accepts `zone_evidence` without an explicit
`affected_zones` basis. This compatibility is one-way: the old frontend rejects
the new backend's added applicability keys. Deploy the new frontend before the
new backend, or deploy both atomically; backend-first deployment can make old
clients discard an otherwise valid lifecycle snapshot until they refresh to the
new frontend.

A successful empty query means **no products returned**, not no hazard or
order. `outside` is never an all-clear or proof the location is unaffected;
`inside` is never a claim of impact, authority, an order, or an instruction.
Official zone boundaries are area-level and do not claim individual-address
precision. An Update that drops a zone and a Cancel that still references one
remain message facts; neither is an all-clear.
Partial retrieval and failures remain explicit; unrelated source failures do
not change the NWS source's own retrieval state.

The mutable NWS register remains separate from immutable lifecycle records.
Within the B07 curriculum section, a facilitator may review and explicitly
accept the exact displayed product revision while the NWS query is fresh,
source-qualified, and complete. A later refresh cannot replace that reviewed
object. Acceptance is allowed for eligible or ineligible, current or expired,
inside, outside, or unknown products because the record is source context, not
a warning or applicability decision. Missing product ID, canonical source link,
sender, or sent time blocks acceptance.

Each accepted record retains a bounded product projection, source-order
references, reported area and typed zones/codes, geometry status plus a geometry
checksum (not browser geometry), eligibility and relationship, exact evaluated
point and algorithm, applicability result/reason/basis, bounded zone source
identities/revisions/freshness/coverage, snapshot/query/retrieval facts,
wall-time validity, fixed limitations, facilitator/cycle/phase/action metadata,
and two independent checksums:

- `nws-product-semantic.v1` covers stable product facts and a checksum of any
  retained source geometry. Retrieval timestamps, wall-time validity, and zone
  cache freshness are not product revisions.
- `nws-planning-evaluation.v1` covers the exact point, algorithm, applicability,
  and stable zone source revisions/results. Zone retrieval deadlines are
  observation facts, not semantic revisions.

Within the A04 curriculum section, an owner and horizon are assigned to a
recheck of the exact accepted record. A source-qualified fresh complete NWS
query can append `unchanged`, `changed`, `expired`, `superseded`, `cancelled`,
`ambiguous`, or `not-returned`. Stale/partial/offline/failed/malformed source
checks append `source-unavailable`. A stale or incomplete zone evaluation cannot
produce `unchanged`; last-known accepted facts remain immutable. Same-ID
semantic changes are `changed`; a different Update or Cancel must explicitly
reference the accepted identity. Title similarity never establishes lineage.
Multiple qualifying identities are `ambiguous`. A successful empty query means
only that the product was not returned by that query.

Weather acceptance and recheck actions append `SOURCE_ACCEPT` and
`SOURCE_RECHECK` ledger rows. They are hosted by B07 and A04 but do not mark
those capabilities complete, establish manual criteria, mutate service
conditions, objectives, gates, support dispositions, H1/H2/H3, or authorize any
action. B04 remains based solely on manual practice inputs: no
warning/preparation margin, arrival, departure, legal order, dispatch,
passability, restoration, containment, or all-clear is computed from NWS
fields.

V4 permits at most 4 accepted weather revisions and 8 weather rechecks per
cycle. References, affected zones, geocodes, and zone-evidence rows are capped
at 16 per record; a record is capped at 12 KiB and the current weather chain at
40 KiB. Records that do not fit are rejected rather than truncated. Weather
cycles use a separate immutable previous-cycle/archive chain so existing FEMA
archive digests are not rewritten. The common 128 KiB persisted-state and
canonical-export checks still run after every complete action and ledger effect;
overflow preserves the prior valid state and requires export plus explicit
reset rather than eviction.

All record, archive, handoff, and lifecycle digests are deterministic
consistency checks. They detect malformed or inconsistent content but are not
keyed signatures, authenticity proofs, or protection against a local actor who
can rewrite and recompute every checksum.

The legacy event-trigger panel still re-evaluates wall-time expiry and
eligibility, refreshes instead of caching forever, and retains validated
last-known source facts when a later payload is malformed or fails. Its
retained-product summary reports product validity, message eligibility,
retrieval state, and unknown planning-location applicability separately.
Offline, failed, or stale retrieval does not prove product expiration or local
inapplicability; even an expired product is not a local all-clear.

### Deliberately blocked domains and next slices

1. **PTWC jurisdiction:** no attachable Hawaiʻi-applicable claim until a
   deterministic jurisdiction rule is implemented and tested. A ComCat tsunami
   flag remains an earthquake fact, never a tsunami alert or order.
2. **Operational authority:** shelter admission/current beds/accessibility,
   legal orders, road passability, utility restoration, wildfire containment,
   observed unmet need, and partner commitments require authoritative external
   contracts and appropriate verification. None is inferred from this chain.

The real-backend browser proof uses `cmd/e2e-server` with its test-only
`X-NWS-Fixture` header. Inline fixtures cover containment, exclusion, Update,
Cancel, invalid topology, and absent geometry. Zone fixtures cover inside,
complete outside, boundary, a failed member, invalid topology, stale/offline
cache state, pending preparation, Update zone changes, and Cancel. The
production handler has no such control. Requests are continued to the real Go
endpoint rather than fulfilled by browser mocks. Separate mocked boundary tests
cover malformed JSON, point-mismatched responses, offline behavior, and expired
304 behavior. Run
`npm run test:e2e` before `npm run test:operations`, never in parallel; both
rebuild `dist/`. Confirm all test ports are free or belong to this
worktree before starting.

Closeout packets contain pinned public-evidence summaries plus the saved section
selection in a fixed section order, and the canonical cycle digest shown in the toolbar in the filename.
Download stays disabled until the current selection is saved. They are ordinary
browser downloads and do not enter or evict the offline field-packet cache.

## Offline behavior

Production builds pre-cache `/lifecycle`, `/offline`, public icons, and hashed
build assets. The service worker preserves the source placeholder
`hmcp-shell-v1`; Vite replaces it with an asset-derived hash at build time.
Offline `/exercise` requests redirect to `/lifecycle`. Redirect responses are
never cached.

API data, authenticated responses, map tiles, identity, collaboration, and
mutations remain outside the shell cache.

## Demo

1. Run `npm run dev:stack` and open <http://127.0.0.1:3000/lifecycle>.
2. In **Before**, lock Practice Event Amber, carry two gaps, freeze the default
   three objectives, compute the 120−60 minute margin, carry the comparison,
   choose a channel class and plan one format, record one evidence claim,
   simulate two service areas, schedule their injects, and seal H1.
3. In **During**, start the queue, advance 60 minutes, record the two service
   areas, capture hold/decline partner responses, escalate the declined item,
   add r2, create guidance v1, freeze the shift snapshot, replace stale
   evidence, disposition both items, and seal H2.
4. In **After**, make the carried row follow-up-ready, record all five aggregate
   bands, review the hold, plan all required rechecks, classify all four guidance
   blocks, score the three objectives, record gates met, download and pin the
   strict record, save the packet section selection, download the closeout
   packet, then seal H3.
5. Reload to verify local persistence. Open `/exercise` to verify it resolves to
   the same workspace. Use **Reset lifecycle** for a clean run.
