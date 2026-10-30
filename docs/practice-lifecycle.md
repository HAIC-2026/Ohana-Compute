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
persistence uses the strict `practice-lifecycle.v3` schema and an explicit
reset. Imports are bounded to 128 KiB, reject duplicate or extra JSON keys, and
pin a read-only comparison without merging content. Exchange metadata and the
ledger do not change canonical export bytes or the cycle digest.
Every reducer action checks both persisted-state and canonical-export UTF-8 bytes
after all effects, including ledger additions. Overflow rejects the action and
preserves the previous valid state, including retained source history.

Saved `practice-lifecycle.v1` and original `practice-lifecycle.v2` state migrate
explicitly into v3 with empty source-bound records. V1 also receives empty pinned
evidence and compatible handoff references. Original sealed digests are retained,
not rewritten: v1 H1 verification reconstructs its bounded pre-seal evidence
states, and v2 uses its original canonical inputs. Malformed or oversized saved
records are not overwritten on a failed restore. Strict comparison imports
remain current-schema-only; they do not silently migrate or merge content.
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

## Read-only NWS product provenance

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
issuing office, county membership, and missing geometry never establish local
impact. Planning-location applicability is explicitly **unknown**, including
for products carrying valid polygons. No point-in-polygon match is introduced
in this slice. A successful empty query means **no products returned**, not no
hazard or order. Partial retrieval and failures remain explicit; unrelated
source failures do not change the NWS source's own retrieval state.

These are read-only product details, not attachable lifecycle claims. Refreshes
do not change B07/D03/A04 records, H1/H2/H3, manual service conditions, or
`practice-lifecycle.v3` digests and migrations. B04 remains based solely on
manual practice inputs: no warning/preparation margin, arrival, departure,
legal order, passability, restoration, containment, or all-clear is computed
from NWS fields. The legacy event-trigger panel also re-evaluates wall-time
expiry and eligibility, refreshes instead of caching forever, and retains
validated last-known source facts when a later payload is malformed or fails.

### Deliberately blocked domains and next slices

1. **NWS applicability contract:** next ranked slice. Establish an explicitly
   reviewed, deterministic geography contract before any planning-location
   match or source-bound acceptance. Provenance alone is not applicability,
   timing evidence, or a reason to migrate lifecycle records.
2. **PTWC jurisdiction:** no attachable Hawaiʻi-applicable claim until a
   deterministic jurisdiction rule is implemented and tested. A ComCat tsunami
   flag remains an earthquake fact, never a tsunami alert or order.
3. **Operational authority:** shelter admission/current beds/accessibility,
   legal orders, road passability, utility restoration, wildfire containment,
   observed unmet need, and partner commitments require authoritative external
   contracts and appropriate verification. None is inferred from this chain.

The real-backend browser proof uses `cmd/e2e-server` with its test-only
`X-Lifecycle-Fixture` header (`baseline`, `changed`, `empty`, `partial`, `stale`,
`unavailable`). The production handler has no such control. Requests are continued
to the real Go endpoint rather than fulfilled by browser mocks. Separate mocked
boundary tests cover malformed JSON contracts, cancellation, offline, and expired
304 behavior. Run `npm run test:e2e` before `npm run test:operations`, never in
parallel; both rebuild `dist/`. Confirm all test ports are free or belong to this
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
