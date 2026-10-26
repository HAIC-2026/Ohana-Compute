# Backend

The backend is the source-normalization and provenance boundary for the
Hawaiʻi Resilience Atlas. It intentionally does not ingest every dataset found
in a portal.

## Current slice

- `GET /healthz`
- `GET /api/v1/sources`
- `GET /api/v1/events`
- Normalized NOAA/NWS active alerts for Hawaiʻi
- Five-minute in-memory cache with ETag revalidation
- Explicit `fresh` or `stale` source status and warnings
- Fail-closed `502` response when no valid upstream snapshot exists
- CORS restricted to configured frontend origins

## Run

```bash
go run ./cmd/server
```

The default address is `http://127.0.0.1:8080`.

Environment variables:

- `PORT` — default `8080`
- `ALLOWED_ORIGINS` — comma-separated origins; defaults to local Vite URLs
- `NWS_CACHE_TTL` — Go duration; default `5m`

## Validate

```bash
gofmt -w .
go vet ./...
go test ./...
```

See `../docs/research/hawaii-backend-data-sources-20261026.md` for the
source-selection decision and phased adapter backlog.
