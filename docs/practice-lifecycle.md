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
persistence uses the strict `practice-lifecycle.v2` schema and an explicit
reset. Imports are bounded to 128 KiB, reject duplicate or extra JSON keys, and
pin a read-only comparison without merging content. Exchange metadata and the
ledger do not change canonical export bytes or the cycle digest.

Saved `practice-lifecycle.v1` state migrates once into v2 with empty pinned
evidence and compatible handoff references; strict comparison imports remain v2
only. An explicit pin stores only snapshot identity, times, aggregate status,
bounded counts, and each feed's freshness state and completeness status in the
current phase. Event-source error/unavailable counts are capped at 99, so a
partial event feed cannot be summarized as merely fresh. Duplicate phase pins
are rejected. Pins add an `EVIDENCE_PIN` ledger row without marking a B/D/A
capability complete, and later refreshes cannot alter pins or sealed H1/H2/H3
records. Restore recomputes H1/H2 digests from their retained canonical inputs
and requires their evidence references to exactly match the corresponding
phase pins.

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
