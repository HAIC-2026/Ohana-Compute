# Practice event lifecycle

Open `/lifecycle` to rehearse one complete **Before → During → After** event
cycle. `/exercise` is a compatibility path to the same workspace; it does not
create a second exercise state or clock.

The workspace is public, local-only, fixed-choice, and deterministic. It uses
five fictional practice roles and four lettered practice partners. It accepts no
resident names, addresses, contacts, coordinates, clinical details, or
operational free text. It makes no staff API writes and has no controls for
messages, resource movement, protective actions, or live-status changes.

Every draft, strict record, and closeout packet is labeled
**PRACTICE · UNSENT**. Unknown aggregate need is always displayed as
**Unknown — not zero**.

## One immutable chain

- **H1 — Before to During:** the facilitator locks a fictional event, carries
  owned readiness gaps, selects 1–3 objectives, computes the preparation
  margin, chooses an assumption revision, plans accessible formats, records
  fixed-choice evidence, declares simulation scope, schedules deterministic
  injects, and seals the handoff. Sealing is not an authorization decision.
- **H2 — During to After:** H1 becomes one aggregate support item per carried
  gap. Practice time advances only through explicit T+ controls. Service-area
  records, partner response categories, bounded escalations, assumption r2,
  guidance versions, shift snapshots, and evidence replacements remain
  traceable. Every support item is carried or set aside before H2 is sealed.
- **H3 — After to next Before:** carried H2 items become a recovery register.
  Aggregate CMIST bands, linked hold review, service rechecks, recovery guidance,
  objective scores, and six end-of-cycle gates determine what carries into the
  next cycle. The prior cycle becomes read-only.

## Capability contract

| Phase  | IDs     | Implemented interactions                                                                                                                                                                                       |
| ------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before | B01–B10 | Event lock; ranked owned gaps; frozen objectives; timing margin; assumption comparison; accessible formats; practice evidence; simulation scope; scheduled injects; immutable H1.                              |
| During | D01–D10 | H1 queue; deterministic clock; service-area records; partner response categories; bounded escalation; r2; versioned guidance; frozen shift snapshot; evidence replacement; item disposition and H2.            |
| After  | A01–A10 | Recovery register; aggregate unmet-need bands; linked hold review; recheck plans; recovery draft; objective scores; six gates; strict comparison-only exchange; deterministic closeout packet; H3 and cycle 2. |

Each interaction appends a local ledger event and exposes a stable
`data-capability="B01"` through `data-capability="A10"` marker. Browser
persistence uses the strict `practice-lifecycle.v1` schema and an explicit
reset. Imports are bounded to 128 KiB, reject duplicate or extra JSON keys, and
pin a read-only comparison without merging content. Exchange metadata and the
ledger do not change canonical export bytes or the cycle digest.

Closeout packets contain only selected sections and the canonical digest in the
filename. They are ordinary browser downloads and do not enter or evict the
offline field-packet cache.

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
   plan one format, record one evidence claim, simulate two service areas,
   schedule their injects, and seal H1.
3. In **During**, start the queue, advance 60 minutes, record the two service
   areas, capture hold/decline partner responses, escalate one item, add r2,
   create guidance v1, freeze the shift snapshot, replace stale evidence,
   disposition both items, and seal H2.
4. In **After**, make the carried row follow-up-ready, record all five aggregate
   bands, review the hold, plan all required rechecks, classify all four guidance
   blocks, score the three objectives, record gates met, download and pin the
   strict record, download the closeout packet, then seal H3.
5. Reload to verify local persistence. Open `/exercise` to verify it resolves to
   the same workspace. Use **Reset lifecycle** for a clean run.
