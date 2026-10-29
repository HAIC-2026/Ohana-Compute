# Backend

The backend is the source-normalization and provenance boundary for the
Hawaiʻi Resilience Atlas. It intentionally does not ingest every dataset found
in a portal.

## Current slice

- `GET /healthz`
- `GET /api/v1/identity/session`
- `POST /api/v1/identity/authorization-check`
- `POST /api/v1/collaboration/plans`
- `GET /api/v1/collaboration/plans/{planID}`
- `PUT /api/v1/collaboration/plans/{planID}`
- `POST /api/v1/collaboration/plans/{planID}/comments`
- `POST /api/v1/collaboration/plans/{planID}/assignments`
- `POST /api/v1/collaboration/plans/{planID}/approvals`
- `GET /api/v1/collaboration/plans/{planID}/compare?from={version}&to={version}`
- `GET /api/v1/collaboration/plans/{planID}/planning-assist/status`
- `POST /api/v1/collaboration/plans/{planID}/planning-drafts`
- `POST /api/v1/collaboration/plans/{planID}/planning-drafts/{draftID}/apply`
- `POST /api/v1/collaboration/plans/{planID}/planning-drafts/{draftID}/reject`
- `GET /api/v1/sources`
- `GET /api/v1/sources/health` — bounded process-local public-source retrieval
  health, freshness and catalog coverage/gaps; no upstream probes or private data.
  See the [operator runbook](../docs/offline-exercises-source-health.md).
- `GET /api/v1/events`
- `GET /api/v1/events/hurricanes`
- `GET /api/v1/events/tsunami`
- `GET /api/v1/risk/tsunami?lat={latitude}&lon={longitude}`
- `GET /api/v1/risk/flood?lat={latitude}&lon={longitude}`
- `GET /api/v1/risk/wildfire?lat={latitude}&lon={longitude}`
- `GET /api/v1/shelters/open?lat={latitude}&lon={longitude}`
- `GET /api/v1/shelter-plans`
- `GET /api/v1/planning-areas`
- `POST /api/v1/planning/resource-demand`
- `GET /api/v1/planning/partner-matches?jurisdiction={id}&capability={capability}`
- `GET /api/v1/planning/event-triggers`
- `GET /api/v1/planning/live-status?lat={latitude}&lon={longitude}`
- `GET /api/v1/community/profile?lat={latitude}&lon={longitude}`
- `GET /api/v1/community/acs?lat={latitude}&lon={longitude}`
- `GET /api/v1/community/afn-layer?county={three-digit-county-FIPS}`
- `GET /api/v1/community/svi?lat={latitude}&lon={longitude}`
- `GET /api/v1/community/empower?lat={latitude}&lon={longitude}`
- `GET /api/v1/community/fema-risk?lat={latitude}&lon={longitude}`
- `GET /api/v1/transportation/planned-closures?lat={latitude}&lon={longitude}`
- Normalized NOAA/NWS active alerts for Hawaiʻi
- Normalized Central Pacific cyclone summaries and official advisory GIS links
- Normalized Pacific Tsunami Warning Center CAP status and instructions
- Versioned operational event-trigger snapshots joining NWS, PTWC, and USGS
  ComCat with explicit HANS and County-order unavailable records
- Versioned six-domain live operational-status snapshots with FEMA-reported
  shelters and explicit blocked-external order, road, transit/paratransit,
  utility-outage, and wildfire boundaries
- Coordinate-scoped HDOT planned lane closures for the next seven days
- Normalized Hawaiʻi State GIS tsunami, FEMA DFIRM, coastal-planning, and
  DLNR wildfire-risk responses
- Normalized FEMA ESF6 open shelters sorted by resident distance
- Curated County shelter-plan provenance, freshness, coverage gaps, and local
  validation requirements for four Chapter 127A emergency-management
  jurisdictions covering Hawaiʻi's five political counties
- Curated deterministic practice workflows for one representative area in each
  of the four jurisdictions, with distinct AFN fixture keys, resources, routes,
  briefings, County-plan links, and explicit unsupported-island scope
- Curated provenance-aware partner associations for controlled mass-care
  capabilities, with geographic scope, freshness, validation state, and
  explicit unknown operational status
- Aggregate community-planning profiles from Census ACS, CDC/ATSDR SVI, HHS
  emPOWER, and FEMA National Risk Index
- Five-minute in-memory cache with ETag revalidation
- Six-hour planning-layer cache and five-minute shelter cache
- Explicit `fresh` or `stale` source status and warnings
- Fail-closed `502` response when no valid upstream snapshot exists
- CORS restricted to configured frontend origins
- Disabled-by-default typed identity, principal, verifier, session, and
  collaborative-write authorization contracts
- Disabled-by-default SQLite collaboration persistence with atomic migrations,
  WAL, foreign keys, busy timeout, immutable versions, optimistic concurrency,
  and append-only audit records
- Disabled-by-default grounded planning provider boundary with strict
  structured output, source allowlist citations, policy validation, bounded
  requests and responses, and explicit human application

Every official-data response includes the source ID, authority, upstream URL,
retrieval time, cache freshness deadline, and `fresh` or `stale` status.
Planning layers remain labeled as planning context; they do not become live
incident perimeters, inundation forecasts, road closures, or evacuation
orders.

`GET /api/v1/planning/event-triggers` is the legal-semantics boundary for
operational source facts. Every trigger includes a bounded source, hazard/event
kind, jurisdiction scope, lifecycle, planning state, authority kind, legal
order status, authority limitation, planning consequence, and provenance.
NWS uses its five-minute cache, PTWC its one-minute cache, and ComCat a
two-minute cache with a bounded 24-hour Hawaiʻi-region query. Product expiry
controls expired history; ComCat events older than six hours are retained as
expired history. Stale cache fallbacks remain explicit. HANS is
production-disabled and unavailable until USGS exposes a stable supported
public machine contract; the adapter never scrapes web pages. County/State
order data defaults to unavailable, and unavailable never means no order.
Only a future attributable authorized governor or mayor manual record could
represent a legal order. If all supported operational sources fail, the
endpoint returns `502`; otherwise failures are preserved in a partial
snapshot.

`GET /api/v1/planning/live-status` is the source-contract boundary for current
operational status. It requires coordinates only to sort FEMA-reported shelter
records by distance; coordinates are never returned as metrics labels. The
response always includes all six required domains. FEMA NSS records preserve
reporting authority, retrieval and freshness, reported status, and optional
capacity/accessibility/pet fields. They never merge with County plan records or
practice facilities. Freshness is feed-level because the checked public
contract does not establish a per-shelter update timestamp. Order, emergency
road/passability, transit/paratransit, utility outage, and Hawaiʻi wildfire
operations remain unavailable with the checked source/date, exact missing
artifact, owning authority, and verification note. If the supported FEMA
request fails, shelter also becomes explicitly unavailable and the snapshot
state is `unavailable`; no empty or normal-looking fallback is synthesized.

`GET /api/v1/shelter-plans` is a provenance catalog rather than an operational
shelter feed. Its curated records may identify published or reference-only
County planning documents, but its official facility arrays remain empty until
an authorized County roster is integrated. It never derives capacity,
capabilities, accessibility, or opening status from planning prose. Catalog
references become explicitly stale after their bounded review window, and a
reader failure returns `502` without a success-shaped fallback.

The response distinguishes political geography from emergency-management
authority. Kalawao is a separate political county under State Department of
Health administration under
[HRS §326-34](https://data.capitol.hawaii.gov/hrscurrent/Vol06_Ch0321-0344/HRS0326/HRS_0326-0034.htm),
while
[HRS §127A-2](https://data.capitol.hawaii.gov/hrscurrent/Vol03_Ch0121-0200D/HRS0127A/HRS_0127A-0002.htm)
includes Kalawao in Maui for emergency-management responsibilities. The API
therefore exposes four planning jurisdictions, five political counties, and an
explicit sourced Kalawao note.

`GET /api/v1/planning-areas` is a practice-data boundary, not a live County
resource feed. Its four representative workflows cover Urban Honolulu,
Central/West Maui, Hilo/Lower Puna, and East Kauaʻi. Resource capacities,
capabilities, and route states are deterministic product fixtures that require
local validation and never imply that a facility is open or a road is
passable. Its separate `screening_areas` array provides geography-only entries
for `molokai-kaunakakai`, `lanai-city`, and `molokai-kalaupapa`, with
`screening_only: true`, county codes, coordinates, jurisdiction IDs, and scope
notes. These do not fabricate practice briefings, inventory, capacities, routes,
or AFN estimates. Kalawao uses the separate screening jurisdiction ID `kalawao`;
this does not add a partner-matching jurisdiction or substitute Maui partners.
Niʻihau remains unsupported. Reader failures return `502` with `Cache-Control: no-store`; no
Oʻahu-shaped success response is synthesized.

### Tract AFN screening layer

`GET /api/v1/community/afn-layer` returns a GeoJSON `FeatureCollection` with
provenance and interpretation foreign members. The optional `county` query
accepts exactly one three-digit county FIPS: `001` Hawaiʻi, `003` Honolulu,
`005` Kalawao, `007` Kauaʻi, or `009` Maui. Omit it for all five counties.
Invalid or repeated county values return `400`; an unconfigured layer reader
returns `503`; no valid requested tract geometry returns `502`. Geometry may
still be returned when Census credentials or ACS/SVI data are unavailable:
the result is explicitly `partial`, values are unknown, and `source_errors`
names each affected source and county. No fixture is served as live evidence.

The following is an illustrative **shape only**, not a retrieved response.
`geometry: null` marks where a real GeoJSON `Polygon` or `MultiPolygon` appears
in successful responses; the adapter rejects missing or non-polygon geometry.
Dates and identifiers below are placeholders. Every listed indicator is always
present as a metric object; unavailable estimates/MOEs are `null`, never
zero-filled. Optional percentage fields are omitted when unavailable.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "<11-digit-tract-FIPS>",
      "geometry": null,
      "properties": {
        "tract_fips": "<11-digit-tract-FIPS>",
        "county_code": "005",
        "name": "<ACS geography name or TIGERweb tract name>",
        "indicators": {
          "population": { "estimate": null, "margin_of_error": null },
          "no_vehicle_households": {
            "estimate": null,
            "margin_of_error": null
          },
          "limited_english_population": {
            "estimate": null,
            "margin_of_error": null
          },
          "population_with_disability": {
            "estimate": null,
            "margin_of_error": null
          },
          "population_below_poverty": {
            "estimate": null,
            "margin_of_error": null
          },
          "kupuna_living_alone": { "estimate": null, "margin_of_error": null },
          "housing_50_plus_units": {
            "estimate": null,
            "margin_of_error": null
          },
          "incomplete_plumbing": { "estimate": null, "margin_of_error": null },
          "no_internet_subscription": {
            "estimate": null,
            "margin_of_error": null
          }
        },
        "svi": null
      }
    }
  ],
  "status": "partial",
  "sources": [
    {
      "id": "census-tigerweb-tracts",
      "authority": "U.S. Census Bureau",
      "url": "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2024/MapServer/8/query",
      "retrieved_at": "<RFC3339 timestamp>",
      "fresh_until": "<RFC3339 timestamp>",
      "status": "fresh",
      "vintage": "TIGERweb ACS2024",
      "county_code": "005"
    }
  ],
  "source_errors": [
    {
      "source": "acs-5-year",
      "county_code": "005",
      "error": "<explicit upstream or credential error>"
    }
  ],
  "cmist_domains": [
    {
      "id": "communication",
      "label": "Communication",
      "indicators": ["limited_english_population", "no_internet_subscription"],
      "unknowns": [
        "Preferred language and accessible warning format",
        "Phone service, warning receipt, and live communications outages"
      ]
    },
    {
      "id": "maintaining_health",
      "label": "Maintaining health",
      "indicators": [
        "population_with_disability",
        "incomplete_plumbing",
        "population_below_poverty"
      ],
      "unknowns": [
        "Medical equipment, oxygen, dialysis, medication refrigeration, and current water or power outage"
      ]
    },
    {
      "id": "independence",
      "label": "Independence",
      "indicators": ["population_with_disability", "housing_50_plus_units"],
      "unknowns": [
        "Individual assistance needs, building height, elevator dependence, and accessible entrances"
      ]
    },
    {
      "id": "support_safety_self_determination",
      "label": "Support, safety and self-determination",
      "indicators": ["kupuna_living_alone"],
      "unknowns": [
        "Caregiver availability, social support, consent, and ability to evacuate"
      ]
    },
    {
      "id": "transportation",
      "label": "Transportation",
      "indicators": ["no_vehicle_households"],
      "unknowns": [
        "Accessible vehicle demand, driver availability, transit service, and evacuation intent"
      ]
    }
  ],
  "indicator_definitions": {
    "housing_50_plus_units": {
      "label": "Housing units in structures with 50+ units",
      "universe": "Housing units (percentage denominator B25024_001)",
      "variables": ["B25024_009"],
      "proxy": true,
      "limitations": "Housing-density proxy, not building height, elevator dependence, or a count of buildings."
    }
  },
  "warnings": [
    "<aggregate screening, vintage mismatch, MOE and unknown-needs warnings>"
  ]
}
```

In actual responses `indicator_definitions` contains **all nine** indicator
keys, each with the same `{label, universe, variables, proxy, limitations}`
shape shown above. `variables` lists ACS variable stems (the adapter requests
the corresponding `E` estimates and `M` margins of error). A metric may also
contain `percent: number` and `percent_margin_of_error: number`; absent fields
mean unavailable, not zero. Percentages use 0–100; SVI percentiles use 0–1.
There are no numeric CMIST domain scores, weights, ranks, or inferred demand:
`cmist_domains[].indicators` references indicator keys, and `unknowns`
describes gaps the mapped evidence cannot answer.

`svi`, when matched, has the existing point-SVI shape:
`tract_fips`, `location`, nullable integer `population`, `age_65_or_older`,
`with_disability`, `limited_english`, `no_vehicle_households`; nullable numeric
`overall_percentile`, `socioeconomic_percentile`,
`household_characteristics_percentile`, `racial_ethnic_minority_percentile`,
`housing_transportation_percentile`; and `source` plus `warnings`. It is
`null` when unavailable or unmatched, not a synthesized index.

Collection `status` is `complete` only when no source errors were recorded,
otherwise `partial`. It describes retrieval/join completeness, not operational
safety or whether every estimate was published. Published suppressed estimates
remain null even with a complete retrieval. `source_errors` is always an array.
`sources` contains one record per available source/county, with IDs
`census-tigerweb-tracts`, `acs-5-year`, or `cdc-svi-2022`; each preserves authority,
URL, timestamps, `fresh`/`stale` status, vintage, and county code. ArcGIS source
records can additionally contain `upstream_last_modified` and
`refresh_attempted_at`. Stale last-valid ArcGIS snapshots remain explicitly
stale and make the collection partial; ACS does not silently fall back.

#### Sources, measures, and proxy limitations

The adapter requests real WGS84 tract polygons from
[Census TIGERweb ACS2024 layer 8](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2024/MapServer/8),
filtered by state `15` and county. It retrieves county-wide
[2024 ACS five-year detailed](https://api.census.gov/data/2024/acs/acs5.html)
and [subject](https://api.census.gov/data/2024/acs/acs5/subject.html) rows using
the existing `CENSUS_API_KEY` / `CENSUS_API_KEY_FILE` setup. Detailed and subject
data use two batch requests per county, rather than a geocoder and two requests
per tract. ACS and ArcGIS caches are bounded; planning snapshots refresh after
24 hours. Geometry and SVI use the existing ArcGIS coalescing/cache path.
An upstream ArcGIS transfer-limit flag fails explicitly rather than silently
presenting a truncated collection as complete.

| Indicator key                | ACS measure                                    | Percentage universe / limitation                                                                                                                              |
| ---------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `population`                 | `B01003_001`                                   | People; not current occupancy.                                                                                                                                |
| `no_vehicle_households`      | `B08201_002`                                   | All households (`B08201_001`); vehicle availability is not accessible transport demand.                                                                       |
| `limited_english_population` | `S1601_C05_001` count, `S1601_C06_001` percent | Population age 5+ speaking English less than very well; not preferred language or warning format.                                                             |
| `population_with_disability` | `S1810_C02_001` count, `S1810_C03_001` percent | Civilian noninstitutionalized population; not equipment dependence or individual support needs.                                                               |
| `population_below_poverty`   | `S1701_C02_001` count, `S1701_C03_001` percent | People with determined poverty status; not current resources or resilience.                                                                                   |
| `kupuna_living_alone`        | `B11010_005` + `B11010_012`                    | Male plus female householders age 65+ living alone; percent of all households (`B11001_001`), not all older residents. Living alone is not absent caregivers. |
| `housing_50_plus_units`      | `B25024_009`                                   | Housing units (`B25024_001`); units in structures with 50+ units, not number of buildings, building height, elevators, or evacuation assistance.              |
| `incomplete_plumbing`        | `B25047_003`                                   | Housing units (`B25047_001`); housing-quality proxy, not a current water outage or medical need.                                                              |
| `no_internet_subscription`   | `B28002_012` + `B28002_013`                    | Households (`B28002_001`); access without a subscription plus no access, not phone coverage, warning receipt, or current outages.                             |

The same four new metric keys are also present on point ACS profiles.
Point profiles normally resolve the tract using the Census geocoder. If that
service fails or returns no unique tract, the adapter requests an exact WGS84
point intersection from the official TIGERweb ACS2024 tract layer, reusing the
ArcGIS cache/client. It accepts exactly one result with consistent Hawaii
state/county/tract/FIPS identifiers. No result, multiple results (including a
boundary ambiguity), or malformed identifiers fail explicitly; there is no
nearest-tract, pinned-ID, other-county, or fixture substitution.

`acs.geography.resolution` records `method` (`census-geocoder` or
`tigerweb-acs2024-point-intersection`), `vintage`, and `source_url`. The
alternative also retains the original `geocoder_error`, official ArcGIS
`source` provenance/freshness, and `warnings`. These warnings are also appended
to `acs.warnings` so an otherwise usable ACS profile cannot silently hide the
geocoder outage. An explicitly stale last-valid TIGERweb response remains
labeled stale. The population/indicator source still identifies ACS separately;
boundary resolution is not an ACS measurement. If both geography providers
fail, the error preserves both failures and no profile is fabricated.

Negative Census/CDC sentinel values and non-finite numeric values become
unknown. A sum remains unknown if a required component estimate is missing.
ACS MOEs are 90% confidence intervals; summed count MOEs use the
root-sum-of-squares approximation and remain unknown if any component MOE is
missing. Derived percentages have no calculated percent MOE. Published subject
percent MOEs are retained.

[CDC/ATSDR SVI 2022 tract layer](https://onemap.cdc.gov/onemapservices/rest/services/SVI/CDC_ATSDR_Social_Vulnerability_Index_2022_USA/FeatureServer/2)
is queried by `STCNTY` and joined by exact 11-digit FIPS, never nearest point,
name, or another county's values. SVI uses 2018–2022 ACS, while the other
profiles/boundaries use the 2024 vintage; warnings disclose this mismatch.
Boundary changes, water tracts, suppressed estimates, and missing matches
remain unknown. Kalawao public tract geography is included, but neither a
resident registry nor person-level AFN/medical inferences are produced.
Medical equipment, caregivers, accessible vehicle demand, and current service
disruptions remain unknown. Telemetry uses bounded source/outcome labels,
never tract IDs, coordinates, query strings, API keys, or indicator values.

`POST /api/v1/planning/resource-demand` accepts a strict, versioned aggregate
request and returns deterministic low/planning/high scenario ranges. The
calculator propagates ACS population margins of error and subtracts practice
supply only when category, unit, planning geography, and
`practice_confirmed` status match. Mismatched supply remains in the response as
an excluded assessment with a bounded reason. The model never treats a missing
or privacy-masked count as zero and never derives person-level demand from HHS
emPOWER.

The v0.1 numeric lines are mass-care service population, shelter spaces,
evacuation or short-term floor area, cots, meals, and potable water. Sanitation
and staffing remain role/local-assumption lines; transport uptake, generator
load, medication refrigeration, oxygen, and animal support remain unavailable
until an authorized coefficient or scenario input exists. The 11% / 23% / 35%
service envelope is an explicit versioned stress-test assumption, not an
observed shelter-uptake rate or forecast. Identical canonical requests return
the same calculation ID and response.

The handler requires `application/json`, rejects unknown fields, accepts one
JSON object, limits bodies to 64 KiB, validates bounded identifiers, enums,
durations, quantities, and record counts, and returns `Cache-Control: no-store`.
Malformed requests return `400`, unsupported content types return `415`,
oversized bodies return `413`, and calculator failures return `502` without
internal error details.

`GET /api/v1/planning/partner-matches` accepts one controlled jurisdiction
(`honolulu`, `maui`, `hawaii`, or `kauai`) and one to ten unique capability
enums. It returns deterministic sourced associations from the State ESF-6
annex, County guidance, and reviewed organization pages. Each result preserves
the bounded claim, publisher, URL, geographic scope, validation state, review
window, and freshness. Local County roles sort before statewide roles, but
ordering is not a recommendation or priority score.

The matcher never reports current availability, activation, capacity,
contracts, credentials, response time, acceptance, contacts, or operational
assignment. Those fields remain explicitly `not_validated` or `not_reported`.
Stale sources are removed from matches, unsupported capabilities remain
unmatched, unknown query fields are rejected, and matcher failures return `502`
without a success-shaped fallback.

HDOT closure results are planned roadwork, not emergency road status or proof
that a route is passable. The PTWC endpoint exposes the latest product and its
expiration explicitly; an expired information statement is not treated as an
all-clear.

The frontend still calls the same State/FEMA services directly. Migrating it to
these parity endpoints is the next integration slice.

`GET /api/v1/identity/session` is the privacy-safe identity state boundary. It
returns only controlled mode, anonymous/authenticated state, configuration
status, collaboration-write availability, roles, and capabilities with
`Cache-Control: no-store`. It never returns subject IDs, names, email
addresses, tokens, raw claims, issuer/audience values, or verifier errors.

`POST /api/v1/identity/authorization-check` does not persist data. It proves the
reusable guard required for future collaborative mutations. Disabled or
provider-unavailable identity returns `503`; absent or invalid credentials
return `401`; insufficient controlled capability returns `403`; only an
injected verified `plan_editor` principal can reach the guarded handler.
Unknown roles fail closed.

The collaboration API is documented in
[`../docs/collaborative-plans.md`](../docs/collaborative-plans.md). Every read
requires `collaboration:read`; plan, version, note, and assignment mutations
require `collaboration:write`; approval records require
`collaboration:approve`. Stale revisions return `409`. Responses are
`no-store`, request JSON is strict and size-bounded, and telemetry never
contains plan IDs, titles, note text, rationale text, subjects, or tokens.

## Run

```bash
go run ./cmd/server
```

The default address is `http://127.0.0.1:8080`.

Environment variables:

- `PORT` — default `8080`
- `ALLOWED_ORIGINS` — comma-separated origins; defaults to local Vite URLs
- `NWS_CACHE_TTL` — Go duration; default `5m`
- `CENSUS_API_KEY` — free Census data API key required for the ACS section
- `CENSUS_API_KEY_FILE` — optional path to the key; used by the AKS Key Vault
  CSI mount when `CENSUS_API_KEY` is unset
- `IDENTITY_MODE` — `disabled` by default; the only other accepted value is
  `oidc`
- `OIDC_ISSUER_URL`, `OIDC_AUDIENCE`, `OIDC_CLIENT_ID`, and
  `OIDC_ROLES_CLAIM` — required together only when `IDENTITY_MODE=oidc`;
  issuer must use HTTPS and the role claim must be `roles`
- `COLLABORATION_PERSISTENCE` — `disabled` by default; `sqlite` is the only
  durable driver
- `COLLABORATION_SQLITE_PATH` — required absolute path when SQLite is enabled
- `GROUNDED_AI_MODE` — `disabled` by default; `openai-compatible` enables the
  constrained production adapter
- `GROUNDED_AI_ENDPOINT` and `GROUNDED_AI_ALLOWED_ENDPOINTS` — required exact
  HTTPS endpoint and comma-separated allowlist
- `GROUNDED_AI_MODEL` and `GROUNDED_AI_ALLOWED_MODELS` — required selected
  model and comma-separated allowlist; keep deployed values out of source
  control and telemetry
- `GROUNDED_AI_API_KEY` or `GROUNDED_AI_API_KEY_FILE` — external credential;
  prefer the mounted secret file
- `GROUNDED_AI_TIMEOUT` and `GROUNDED_AI_MAX_OUTPUT_TOKENS` — required bounded
  request limits

Planning assist requires authenticated collaboration read/write access and a
durable plan. The provider receives only server-built controlled evidence; it
never receives titles, summaries, comments, resident input, coordinates,
identifiers, raw payloads, or tokens. See
[`../docs/grounded-planning.md`](../docs/grounded-planning.md).

The current production server does not include a provider-backed OIDC verifier.
Complete OIDC metadata therefore reports `unavailable` and keeps protected
writes denied. Real sign-in requires approved external tenant/application
configuration and a verifier that validates signature/JWKS, issuer, audience,
and temporal claims. No client secret, static token, trust header, or
decode-only JWT path is supported. See
[`../docs/identity-foundation.md`](../docs/identity-foundation.md).

### Store the Census key securely on macOS

Use the included Keychain helper instead of placing the key in `.env`, a shell
profile, or a command:

```bash
./backend/scripts/census-keychain.sh store
./backend/scripts/census-keychain.sh run
```

`store` asks for the key through a hidden Keychain prompt and does not grant
automatic access to the saved item. Keychain may request confirmation when
`run` retrieves it. The script exports the key only to the backend process and
starts the server. Remove the saved credential with:

```bash
./backend/scripts/census-keychain.sh delete
```

The aggregate community profile remains available when one source fails. Each
unavailable source appears in `source_errors`; without `CENSUS_API_KEY`, SVI,
emPOWER, and FEMA NRI continue to return while ACS is explicitly unavailable.
emPOWER values of `11` are marked as potentially privacy-masked because HHS
uses `11` for cells containing 1–10 beneficiaries.

The repository-level `npm run dev:stack` command automatically retrieves an
existing macOS Keychain item and passes it only to the backend process. It never
prints or persists the key. If the item is absent, the command warns once and
keeps the explicit partial-profile behavior above.

The frontend should call this server through its shared `backend-api.ts`
client. For local development, the browser runs at `127.0.0.1:3000`, this
server runs at `127.0.0.1:8080`, and the default CORS allowlist permits that
origin. Set `VITE_BACKEND_API_URL` on the frontend and `ALLOWED_ORIGINS` here
when the two servers use different deployed origins.

## Validate

```bash
gofmt -w .
go vet ./...
go test ./...
```

See `../docs/research/hawaii-backend-data-sources-20261026.md` for the
source-selection decision and phased adapter backlog.
