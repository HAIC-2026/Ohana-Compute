# Historical incident and exercise replay

The planner's **Replay & calibration** surface compares the current
deterministic planner with bounded expectations derived from reviewed,
aggregate Hawaiʻi incident evidence and explicitly labeled exercises. It is
training and calibration evidence, not prediction, forecast validation, a
legal finding, an after-action judgment, or proof that a historical action was
correct.

## Contract and boundaries

- `GET /api/v1/planning/replays` returns the controlled fixture catalog.
- `POST /api/v1/planning/replays/run` accepts only
  `historical-replay-request.v1`, a catalog fixture ID, and the `current`
  standard.
- Requests require `application/json`, reject unknown fields and a second JSON
  object, and are limited to 4 KiB. Arbitrary URLs, source payloads, comments,
  plan IDs, and free text are not accepted.
- Reports use `historical-replay-report.v1`,
  `historical-replay-engine.v1`, and
  `historical-replay-calibration.v1`. The deterministic run ID includes the
  request, fixture version, engine/calibration versions, and production
  resource-demand calculation ID.
- Reports use per-check `pass`, `warn`, `unavailable`, or `fail`. There is no
  composite accuracy score.
- Replays are read-only. They never create, update, import, or overwrite a live
  or collaborative plan.

The report keeps five evidence classes separate:

1. observed aggregate incident evidence;
2. curated source references;
3. controlled synthetic/exercise inputs;
4. current production model output; and
5. versioned evaluator expectations.

Missing, masked, partial, stale, unavailable, and synthetic exercise values
remain distinct. Missing historical population, shelter occupancy, route
passability, partner activation, evacuation authority, or person-level demand
is reported as unavailable rather than converted to zero.

## Curated fixtures

| Fixture                            | Type                | Island / jurisdiction       | Defensible use                                                                                                             | Explicitly unavailable                                                                                                         |
| ---------------------------------- | ------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `hi-wildfire-2023-lahaina`         | Historical incident | Maui / County of Maui       | Aggregate warning, communications, road-network, infrastructure, and coordination domains from published incident analysis | Individual outcomes, raw 911/body-camera material, shelter occupancy, partner activation, route passability, legal conclusions |
| `hi-volcanic-2018-kilauea-lerz`    | Historical incident | Hawaiʻi / County of Hawaiʻi | USGS geologic chronology, fissure/inundation context, earthquake trigger, scientific-alert separation                      | Person-level compliance, shelter populations, County order semantics, fine-grained coordination claims                         |
| `hi-flood-2018-kauai-north-shore`  | Historical incident | Kauaʻi / County of Kauaʻi   | NOAA rainfall/flash-flood chronology and aggregate corridor-isolation context; stale CASPER evidence remains labeled       | Exact shelter demand, household outcomes, route duration/passability, urban Oʻahu generalization                               |
| `hi-hurricane-2018-lane`           | Historical incident | Hawaiʻi / County of Hawaiʻi | NOAA storm chronology, rainfall/stream-gauge and flood-access domains                                                      | Wind/surge landfall conclusions, shelter occupancy, individual outcomes, County orders                                         |
| `hi-tsunami-exercise-pacific-wave` | Synthetic exercise  | Oʻahu / State and Honolulu  | Controlled tsunami warning-flow, AFN hotspot, and production resource-demand stress test                                   | Real arrival/inundation, evacuation compliance, route/partner/order outcomes                                                   |

The tsunami fixture intentionally uses a controlled exercise because no stable,
public, numbered Hawaiʻi tsunami AAR/IP was verified during the time-boxed
source review. It does not become observed incident evidence.

## Evaluation and calibration

Checks are grouped by the planner's **Map / Model / Match / Operate** workflow:

- **Map:** supported hotspot domains and explicit source availability;
- **Model:** the production `resourcedemand` calculator and bounded demand
  range, or an explicit unavailable result;
- **Match:** documented coordination gaps without partner activation claims;
- **Operate:** scientific/advisory trigger classification kept separate from
  legal evacuation authority.

Calibration expectations are code-reviewed fixture data. They are not mutable
through browser text. Changing a threshold requires a new calibration version,
updated source review, fixture regression results, and reviewer approval.
Current model coefficients are never tuned automatically to fit these cases.

## Adding or reviewing a fixture

1. Select an official aggregate report, public dataset, or explicitly labeled
   exercise. Record the authority, canonical URL, observation window,
   retrieval/review/freshness dates, and ADOPT/ADAPT/SKIP/FURTHER-RESEARCH
   decision.
2. Document supported and unsupported claims. Do not add names, addresses,
   coordinates, identities, medical conditions, casualty attribution, shelter
   status, route passability, partner activation, or evacuation authority
   unless the aggregate source directly supports the exact field.
3. Add a stable controlled ID, fixture version, island/jurisdiction and area
   template. Never reuse an Oʻahu template for an outer-island fixture.
4. Add bounded expectations. If evidence cannot support a check, set it
   unavailable instead of inventing a value.
5. Add the fixture to the evaluation table test. A failure must identify the
   exact check ID and mismatch.
6. Review desktop/mobile rendering, export labeling, source freshness,
   privacy-safe metrics, and the non-predictive disclaimer.

The labeled HTML export contains only the report, controlled fixture metadata,
and public source references. It excludes user-entered locations, coordinates,
plan IDs, titles, comments, actor IDs, tokens, and private collaboration data.
