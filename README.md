# Hawaiʻi Resilience Atlas

A resident-first disaster-planning prototype for the 2026 Hawaiʻi Annual
Innovation Challenge. It helps residents and response partners explore
event-specific guidance, official hazard context, nearby resources, and
road- or transit-level practice routes.

The prototype covers the challenge's four scoped hazards with named practice
events:

- Hurricane
- Flood
- Tsunami
- Wildfire

It intentionally uses no personal data and does not identify individuals or
households.

> **Prototype notice:** Named events, exposure estimates, destinations,
> resource capacity, and operational recommendations are practice data unless
> explicitly labeled as an official source. Confirm current conditions and
> instructions with local authorities before acting.

## What works

- Island- and neighborhood-first planning for Oʻahu examples
- Event-dependent resident guidance and official map layers
- Hawaiʻi Statewide GIS tsunami evacuation-zone checks
- Statewide FEMA DFIRM flood classification and nearby flood boundaries
- Hawaiʻi DLNR-DOFAW community wildfire planning-risk classification
- FEMA/Red Cross National Shelter System open-shelter checks
- Road-following driving and walking practice routes
- A TheBus Route 1L walk-bus-walk example for Hawaiʻi Kai
- No-car, mobility, medical-power, language, written-direction, and read-aloud
  controls
- Desktop and mobile Playwright coverage

## Stack

- TanStack Start, React 19, and TypeScript
- Go backend for normalized source adapters and provenance
- MapLibre GL with Esri World Street Map tiles
- Zustand for scenario state
- OSRM driving geometry and Valhalla pedestrian geometry
- Official TheBus GTFS for the transit example
- Motion for mobile sheets and brief transitions
- Playwright for desktop and mobile interaction tests

## Run locally

```bash
npm install
npm run dev
```

Open <http://127.0.0.1:3000>.

Run the backend separately:

```bash
npm run backend:run
```

On macOS, store the Census API key in Keychain and start the backend without
writing the key to the repository or shell history:

```bash
./backend/scripts/census-keychain.sh store
./backend/scripts/census-keychain.sh run
```

For the AKS development environment, Bicep provisions Azure Key Vault, AKS
Workload Identity, the Secrets Store CSI Driver, ACR, and GitHub Actions OIDC.
See [`infra/README.md`](./infra/README.md). The Census key remains in Key Vault
and is never stored in GitHub or Kubernetes manifests.

The backend listens on <http://127.0.0.1:8080> and currently exposes:

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

## Validate

```bash
npm run backend:test
npm run test:e2e
npm run build
npm run lint
npm run check
```

## Data truth and limitations

Official data is requested from:

- [Hawaiʻi Statewide GIS Hazards services](https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer)
- [FEMA National Shelter System](https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/MapServer)
- [Central Pacific Hurricane Center GIS feed](https://www.nhc.noaa.gov/gis-cp.xml)
- [Pacific Tsunami Warning Center CAP feed](https://www.tsunami.gov/events/xml/PHEBCAP.xml)
- [HDOT planned lane closures](https://services.arcgis.com/HQ0xoN0EzDPBOEci/arcgis/rest/services/Lane_Closure_WFL1_View_NoEd/FeatureServer/0)

The official sources provide planning context, not a complete live incident
picture:

- The wildfire layer is community planning risk, not a live fire perimeter.
- FEMA flood zones do not predict the exact extent of an active storm.
- The sea-level-rise layer is a long-range planning scenario, not a current
  forecast.
- Practice shelters and routes are not represented as officially open.
- HDOT planned lane closures are construction context, not live emergency road
  status or proof of passability.
- Live emergency road closures, transit arrivals, county shelter capacity, and
  incident evacuation orders are not yet integrated.

When an official source fails, the interface reports the status as unavailable
instead of substituting a reassuring answer.

## Architecture boundary

- `src/lib/mock-data.ts` contains deterministic synthetic geospatial and
  planning data.
- `src/lib/mock-api.ts` simulates the future Go API and managed Luna endpoint.
- `src/lib/official-emergency-data.ts` isolates authoritative external-source
  queries, caching, classification, and fail-closed behavior.
- `src/store/planning-store.ts` holds the client scenario state.
- `backend/` contains the Go API, normalized source catalog, live NWS/CPHC/PTWC
  event adapters, official hazard and shelter adapters, community-planning
  sources, and HDOT planned-closure context.

The frontend already treats inference as an asynchronous service and passes a
structured area, hazard, severity, exposure, and primary planning signal. The
mock function can later be replaced with `/api/v1/planning-brief` without
redesigning the interface.

## Product constraints

See `PRODUCT.md` for durable product truth and `DESIGN.md` for the implemented
visual system.

The source-selection memo is in
`docs/research/hawaii-backend-data-sources-20261026.md`.

## License

This project is released under the [MIT License](LICENSE).
