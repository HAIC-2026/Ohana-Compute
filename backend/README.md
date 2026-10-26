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
