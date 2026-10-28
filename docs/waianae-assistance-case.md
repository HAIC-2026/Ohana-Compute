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
3. Prepare the five CMIST questions for Honolulu County. These are agenda
   questions, not confirmed answers or approved assignments. The requirement
   is one fictional assisted transfer, two passenger places for Kupuna A and
   one caregiver, accessible boarding/mobility-device space, equipment-specific
   continuity and receiving-site acceptance. No capacity is entered or promised.
4. Review the fixed resident-message draft and publication checks. Download
   the unsent Markdown assistance request for human County review.

The County assesses whether firefighter or other specialist assistance is
appropriate and routes any real request through authorized incident-command
channels. State ESF6 supports. There is no dispatch, tasking, autonomous resource
allocation, clinical assessment, public alert or actual approval in this case.
Questions marked prepared are local working state only. Changing timing resets
them; valid assumptions/questions persist only in this browser under the
versioned `waianae-assisted-planning.v1` key. No personal data can be entered.
Invalid inputs block calculation/export. Browser-storage failure is disclosed;
the downloadable packet remains the portable handoff.

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

The map uses semantic red flood areas, blue waterways, gray road lines, white
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
