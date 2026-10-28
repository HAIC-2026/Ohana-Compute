# Waiʻanae pre-arrival assistance case

Open **Kupuna A case** in the planner header, or `/waianae`. This is the single
challenge-focused exemplar: a fictional kupuna may need support before a
hypothetical storm interrupts access. It replaces the initially investigated
Waikīkī tsunami example; no tsunami case is shipped.

## Execute the case

1. Compare the fictional person-story marker, sourced geography and purple
   hypothetical access concerns. None is a live incident observation.
2. Select **Build the assistance request**. Review the editable hours from
   exercise now: storm arrival, assumed access-loss lead time, coordination,
   transfer/travel and buffer.
3. Open **Planning evidence**. Add controlled, local claims about candidate
   transport, equipment power, receiving support or H1/H2 access concerns.
   Missing evidence becomes a specific County question; a reported one-place
   vehicle exposes a gap against two required passenger places. A second,
   conflicting capacity report exposes a conflict, not a summed fleet.
4. Optionally open **Exchange local evidence bundles**, export controlled JSON
   or choose a bundle from another planner. Review each claim and the projected
   County questions, then explicitly confirm or cancel. Selection alone changes
   nothing; imports merge rather than replace the register.
5. Prepare the five CMIST questions for Honolulu County. These are agenda
   questions, not confirmed answers or approved assignments. The requirement
   is one fictional assisted transfer, two passenger places for Kupuna A and
   one caregiver, accessible boarding/mobility-device space, equipment-specific
   continuity and receiving-site acceptance. Entered capacity is an unverified
   local claim, never promised availability.
6. Review the fixed resident-message draft and publication checks. Download
   the unsent Markdown assistance request for human County review.

The County assesses whether firefighter or other specialist assistance is
appropriate and routes any real request through authorized incident-command
channels. State ESF6 supports. There is no dispatch, tasking, autonomous resource
allocation, clinical assessment, public alert or actual approval in this case.
Questions marked prepared are local working state only. Changing timing or
claims, setting a claim aside, removing it or crossing a freshness boundary
resets them. Valid assumptions/questions and claims persist only in this browser
under the versioned `waianae-assisted-planning.v1` key. Older timing/check-only
records restore without inventing contributions. No personal data can be entered.
Invalid inputs block calculation/export. Browser-storage failure is disclosed;
the downloadable packet and bounded evidence bundle remain portable handoffs. Unreadable state is not
silently overwritten: **Save current exercise instead of unreadable state** is
an explicit replacement action.

## Extensible evidence-to-question slice

`src/lib/planning-evidence.ts` owns the shared controlled field model,
validation, freshness, per-subject comparison and export. The Waiʻanae module
provides example targets and requirements, not person-specific analysis rules.
A different exercise can supply different subject IDs and numeric requirements
using the same evaluator; no demographics-to-individual inference is involved.

| Subject                          | Controlled claims                                                                    | Deterministic question                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Fictional candidate vehicle A    | Passenger places 0–20 or unknown, assisted step-free boarding, mobility-device space | Are there at least two places and both accessibility capabilities?                                    |
| Fictional equipment continuity A | Runtime 0–72 whole hours or unknown, equipment-specific compatibility assessed       | Does the report span assumed transfer/travel plus buffer? This is not a clinical runtime requirement. |
| Fictional receiving site A       | Acceptance, step-free access, caregiver accompaniment, equipment power support       | Are all four criteria reported for this candidate? Site A is unmapped, not an actual shelter.         |
| H1 and H2 separately             | Concern / no concern reported / unknown                                              | Which access concern needs County review? No concern reported never establishes road clearance.       |

Claims have an exercise-assumption or reported basis, controlled source category
(author-entered, not an authenticated identity), observation time and an
author-selected 1/6/12/24-hour review interval. There are no free-text names,
addresses, contacts, medical descriptions, arbitrary source URLs, attachments or
coordinates. Numeric fields reject negative, fractional or out-of-range values;
blank means unknown, while an explicit zero is a claim of zero. Missing
provenance and future observation times block saving. At most 32 claims are kept.
Source category is provenance about the local entry, not proof that an agency
provided it.

Freshness is based on actual browser time, not the hypothetical storm clock.
At the interval boundary a claim is stale and excluded; it remains visible in
the register and packet. Timers, returning focus, restoration and download
recheck freshness. Stale, future-dated, mismatched and set-aside claims never
satisfy a requirement. The self-selected interval is not a source-authority
validity guarantee.

Only current claims for the same scenario and subject are compared. Current
reported claims take precedence over exercise assumptions; assumptions cannot
fill unknown fields in a report or create an operational contradiction.
Distinct non-unknown values in current reports expose a conflict, including
different numeric capacities even when both exceed the requirement. Counts are
never added and the newest report never silently wins. Operators can edit,
explicitly set aside/reinstate, or remove a local claim; this is not an immutable
audit history. Reasons, supporting IDs, excluded counts and the next County
question are visible and included in the unsent packet.

Access claims annotate only the existing H1/H2 exercise markers and retain
source flood colors and boundaries. They do not create closure geometry,
certify road passability, or map invented vehicles/receiving sites. A hidden
assumption layer stays hidden and the local-claim notice discloses it.

Even when every reported criterion is covered, the result remains a review
checklist. County verification of current conditions, resource suitability,
authority, agreement, receiving-site acceptance and all five CMIST questions
(including communication, medication, clinical needs, safeguarding and
service-animal/pet arrangements) is still required. Nothing is sent, shared,
automatically synchronized, verified, approved, assigned or activated. Optional collaboration/identity and
the guarded AI API are not changed.

## Portable local evidence exchange

The exchange is a file handoff, not shared storage or authenticated team sync.
`src/lib/evidence-bundle.ts` defines the reviewable JSON envelope:
`schema: "local-planning-evidence.v1"`, `scenarioId`, `modelRevision` and
`contributions` only. It never imports raw browser workspace storage, timing,
prepared questions, map payloads or attachments. Share only through approved
channels. Source roles are controlled, author-entered categories, not proof of
agency authorship or verified identities.

The Waiʻanae definition is `waianae-practice` with model revision
`afn-v1-transfer-<hours>h`. The revision binds the static subject/criteria model
and the active transfer/travel-plus-buffer requirement. Definition changes must
bump the static revision; changed transfer windows require a new export.
Mismatched scenario/revision bundles are rejected, never translated.
Every row is bound to an allowlisted scenario subject. Claim IDs are the
app-generated `E-` plus eight lowercase hexadecimal characters, not user IDs
or free-text attribution.

Both export and import enforce 128 KiB serialized UTF-8 and 1–32 rows per
bundle; the merged local register cannot exceed 32. Import checks file size
before reading and decoded byte size before parsing, and rejects invalid UTF-8,
malformed/trailing JSON, duplicate JSON keys, unknown/missing envelope or claim
fields, invalid IDs, unknown subjects, enums, dates, numeric fields and extra
payload. There is no supported free-text or arbitrary-URL field. Empty bundles
cannot clear the working set. MIME/extension hints are not trusted as validation.

Preview shows new/exact-duplicate counts, the controlled values and provenance,
current/stale/future/set-aside status and projected deterministic questions.
Only **Confirm bundle import** applies the entire validated merge. Exact
canonical repeats are skipped; a same-ID/different-content collision rejects
the entire bundle, including otherwise valid new rows. Distinct report IDs
retain genuine disagreements for the existing conflict analyzer.
The working set and scenario revision are rechecked on confirmation; changes
require a fresh preview. File-read/export errors are surfaced without echoing
untrusted filenames or payloads. Selection, cancellation and failed validation
do not write claims or reset prepared questions. A duplicate-only confirmation
also leaves preparation unchanged.

Newly applied claims use the same local update, preparation invalidation,
freshness, map annotations, deterministic review and current Markdown packet
path as manually entered claims. No observation time is refreshed on import;
old/future/set-aside claims remain excluded, visible and unverified. Imported
claims can be edited locally, but an edited ID will collide with the original
on reimport rather than silently overwrite it. There is no automatic conflict
resolution, version history, identity verification, backend, connector or AI
call in this exchange.

## Geography and source truth

`public/waianae-flood-context.geojson` is a saved public-source acquisition,
retrieved October 28, 2026 UTC, not a live feed. Its metadata retain exact query
URLs, source-field definitions, source descriptions, retrieved timestamps,
response hashes, counts and geometry-processing limits.

| Context                                       | Source                                                        | Published vintage / limitation                                                             |
| --------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 290 flood polygons: A 15, AE 60, VE 11, X 204 | FEMA DFIRM, Hawaiʻi Statewide GIS mirror, Hazards/MapServer/6 | Mirror June 2026; Honolulu publication June 10, 2026 is not a feature-level effective date |
| 361 road centerlines                          | Honolulu HOLIS, Transportation/MapServer/3                    | August 2024; not passability, closures or a validated route                                |
| 37 waterways                                  | DLNR DAR/CWRM/USGS, FreshWater/MapServer/1                    | Geometry March 2008, attribute corrections 2013; old reference context, not flood extent   |
| 14 bridge inventory points                    | FHWA/BTS, Infrastructure/MapServer/9                          | June 20, 2025; inventory, not inspection, condition or failure forecast                    |
| Public park reference                         | Honolulu HOLIS, Infrastructure/MapServer/15                   | October 2021 park polygon; not opening, shelter, safe destination or pickup acceptance     |

The fictional marker `[-158.193546, 21.450442]` was checked with the official park
point-intersection query against Waiʻanae District Park, objectid 231. This
avoids presenting an actual home, address or resident registry; it does not
certify open ground, a pickup location, a shelter or a safe destination.

H1 uses the published coordinates of bridge inventory objectid 391,
`FARR HWY / KAUPUNI STRM`. The crossing location is sourced; the assumed
disruption is not. H2 is an explicitly illustrative access-concern area, not
a confirmed road segment, road closure or flooded footprint. Neither circle
is a forecast. No engineering topology, road-flood intersection analysis,
failure probability, travel time or person-level exposure is certified.

Flood features are whole source polygons selected by envelope intersection,
server-generalized at `0.000025` degrees (about 2.8 m) and coordinate precision
six decimals, not clipped. Full-resolution response was about 15 MB; the
bounded mixed-context snapshot is about 1.7 MB. Road/waterway coordinates are
rounded to six decimals. Never use these display geometries for engineering
measurement, route clearance or evacuation-zone determination.

The map uses red special-flood-hazard fills/outlines (A/AE/VE), muted blue-gray
X other-coverage fills/outlines (not an all-clear), blue waterways, gray road lines, white
inventory points, a teal fictional-person marker and dashed purple assumptions.
These fixed geospatial roles intentionally differ from ordinary UI accents;
color is reinforced by shape, labels, checkboxes and source/assumption text.
Street tiles are reference only. If they fail, the bundled Census coastline and
saved official context remain; an interruption notice names missing detail.
If the saved snapshot fails or is malformed, no replacement hazard geometry is
invented, source risk is explicitly unknown and the packet records the outage.

Before any real use, refresh the official queries in the snapshot metadata,
verify vintages/feature counts/coordinate reference and confirm actual conditions,
safe access, pickup, qualified crew, equipment, vehicle, destination acceptance,
agreement, operating window and authority. A source publication date is not a
forecast timestamp or proof of current conditions.

## Deterministic timing and boundaries

All inputs are bounded whole hours:

- access window = assumed storm arrival − assumed access-loss lead time;
- preparation allowance = coordination/mobilisation + transfer/travel + buffer;
- exercise planning margin = access window − preparation allowance.

Defaults give `24 − 6 = 18h` access window and `18 − (2 + 1 + 2) = 13h` margin.
This is not a latest safe departure, fleet throughput, rescue-time estimate or
travel recommendation. A zero/negative margin explicitly says the exercise
window is exhausted and requires County review, not a recommendation to attempt
travel or rescue. None of the numeric inputs is an actual weather forecast.

All five CMIST lenses remain visible. Individual needs are exercise assumptions,
not inferred from age, disability, language, income, demographics or a location.
No ACS, SVI, emPOWER, real agency registry or person-level records are queried.
Partner associations reuse the existing sourced Honolulu directory; documented
roles do not establish firefighter crews, clinical support, accessible vehicles,
capacity, availability, activation, commitments or facility opening/acceptance.

Resident communication is a fixed fictional preparedness template. County
release review, trusted-community validation of language/format preferences,
human-reviewed translations, plain-language print/large-print/audio/visual
versions and phone-free/offline contact remain operator work. No translation,
legal order, safe destination, pickup or route is invented.

## Actual AI path

No actual AI inference is demonstrated by this case. Calculations and the
resident-message/request templates are deterministic and labeled accordingly.
The existing Go grounded-plan service and `GroundedPlanningAssist` were
inspected, but their server-owned source/citation contract does not include
this case, its fictional persona, geometry or timing assumptions. The case
therefore does not send these inputs to that provider or pretend that the
existing test-provider evaluations are an end-to-end live AI demonstration.
No provider, credentials, deployment or AI feature flag is changed.

A future AI extension requires an explicit server-owned bounded case-evidence
contract, citation/policy evaluations and opt-in human review. It must not pass
arbitrary prompts, personal data or unverified numeric/operational claims to
the current generic plan endpoint.
