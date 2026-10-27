# Backend

The backend is the source-normalization and provenance boundary for the
Hawaiʻi Resilience Atlas. It intentionally does not ingest every dataset found
in a portal.

## Current slice

- `GET /healthz`
- `GET /api/v1/sources`
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
- `GET /api/v1/community/profile?lat={latitude}&lon={longitude}`
- `GET /api/v1/community/acs?lat={latitude}&lon={longitude}`
- `GET /api/v1/community/svi?lat={latitude}&lon={longitude}`
- `GET /api/v1/community/empower?lat={latitude}&lon={longitude}`
- `GET /api/v1/community/fema-risk?lat={latitude}&lon={longitude}`
- `GET /api/v1/transportation/planned-closures?lat={latitude}&lon={longitude}`
- Normalized NOAA/NWS active alerts for Hawaiʻi
- Normalized Central Pacific cyclone summaries and official advisory GIS links
- Normalized Pacific Tsunami Warning Center CAP status and instructions
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
- Aggregate community-planning profiles from Census ACS, CDC/ATSDR SVI, HHS
  emPOWER, and FEMA National Risk Index
- Five-minute in-memory cache with ETag revalidation
- Six-hour planning-layer cache and five-minute shelter cache
- Explicit `fresh` or `stale` source status and warnings
- Fail-closed `502` response when no valid upstream snapshot exists
- CORS restricted to configured frontend origins

Every official-data response includes the source ID, authority, upstream URL,
retrieval time, cache freshness deadline, and `fresh` or `stale` status.
Planning layers remain labeled as planning context; they do not become live
incident perimeters, inundation forecasts, road closures, or evacuation
orders.

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
passable. Molokaʻi, Lānaʻi, Niʻihau, and Kalawao are returned as unsupported
workflow scope. Reader failures return `502` with `Cache-Control: no-store`; no
Oʻahu-shaped success response is synthesized.

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

HDOT closure results are planned roadwork, not emergency road status or proof
that a route is passable. The PTWC endpoint exposes the latest product and its
expiration explicitly; an expired information statement is not treated as an
all-clear.

The frontend still calls the same State/FEMA services directly. Migrating it to
these parity endpoints is the next integration slice.

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
