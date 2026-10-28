# Hawaiʻi Mass Care Planner

An emergency-planner-first mass-care prototype for the 2026 Hawaiʻi Annual
Innovation Challenge. It helps Counties, State partners, and community
organizations map affected communities, model access and functional needs and
resource gaps, match partners to coordinated actions, and preview accessible
resident guidance.

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
- Official operational event-trigger snapshots from NWS, PTWC, and USGS
  ComCat, with HANS and County-order gaps shown as explicitly unavailable
- A six-domain live operational-status boundary: FEMA-reported open shelters
  are supported, while evacuation orders, emergency road passability,
  transit/paratransit, utility outages, and Hawaiʻi wildfire operations remain
  explicitly unavailable until authoritative machine contracts exist
- Hawaiʻi Statewide GIS tsunami evacuation-zone checks
- Statewide FEMA DFIRM flood classification and nearby flood boundaries
- Hawaiʻi DLNR-DOFAW community wildfire planning-risk classification
- FEMA/Red Cross National Shelter System open-shelter checks
- County shelter-plan provenance across four emergency-management
  jurisdictions covering Hawaiʻi's five political counties, kept separate from
  live FEMA status and practice facility records
- Four distinct County-level representative planning workflows for Urban
  Honolulu, Central/West Maui, Hilo/Lower Puna, and East Kauaʻi, each with a
  bounded AFN fixture, named practice resources, locally specific route checks,
  accountable coordination, and an explicit County shelter-plan link
- Road-following driving and walking practice routes
- A TheBus Route 1L walk-bus-walk example for Hawaiʻi Kai
- No-car, mobility, medical-power, language, written-direction, and read-aloud
  controls
- Downloadable, self-contained field briefings for printing and
  limited-connectivity coordination
- Data-derived AFN planning hotspots across communication, medical,
  independence, safety, and transportation domains
- **Compare locations**: map-linked, island-scoped geographic planning focus.
  Complete fresh center profiles with a dated SVI tract indicator form a
  provisional review queue. “Review first” requires both the highest national
  SVI quarter and an elevated official mapped hazard at the representative
  center (high flood/wildfire class or inside a tsunami evacuation zone).
  Hurricane uses flood screening only, not wind or surge exposure. This is a
  transparent screening cue, not a validated hazard-priority threshold. Source gaps,
  stale data, mismatched counties and incompatible vintages remain explicitly
  unknown. Area-center markers are not hotspot polygons or hazard intersections.
  Select a location from the map or list, review its hazard-specific next check,
  then continue to Model needs and match partners. Public indicators are kept
  separate from labeled practice-area context and synthetic readiness/exposure.
  Requests reuse the shared profile cache with a shared three-request limit
  across comparison scopes and hazard screens. Hazard responses are coalesced, cached until
  their source freshness expires, and rejected for stale, unmapped, undetermined,
  missing, or expired evidence. Outside/lower-mapped center points are not an
  all-clear for the surrounding area. Population/hazard polygon intersections
  and operational resource shortages are not calculated by this screen.
  Open comparisons revalidate their displayed cues when source evidence expires.
  The screening snapshot counts center-level review cues (never people or
  independent tracts). A selected-location decision brief keeps the mapped
  hazard signal, national SVI percentile and County-led next check together;
  its 75th-percentile reference is the existing provisional rule, not a local
  hazard forecast. Missing or incompatible evidence has no percentile marker.
  This deterministic analysis is labeled rule-based, not generated AI; the
  existing opt-in, authenticated grounded planning assist remains separate.
- Disabled-by-default grounded planning assist with an injectable provider,
  server-built structured evidence, mandatory source citations, hard policy
  validation, explicit human review, and no arbitrary browser prompt
- A disabled-by-default identity boundary with a privacy-safe session endpoint,
  fail-closed collaborative-write guard, and explicit local-only planner state
- Disabled-by-default durable shared plans with immutable versions, bounded
  decision notes, controlled role assignments, authorized approvals,
  comparison, optimistic concurrency, and append-only audit history
- Desktop and mobile Playwright coverage

The map overview keeps the neighborhood decision, coordination owner, and
validation limits visible. “Resources, routes and support” expands the supporting
resource, access, traffic, and AFN detail without burying the Map → Model → Match
summary. The full response workspace starts with that detail expanded. Mobile
navigation uses 48px-high touch targets and honors the device's bottom safe area.

## Stack

- TanStack Start, React 19, and TypeScript
- Go backend for normalized source adapters and provenance
- MapLibre GL with Esri World Street Map tiles and bundled Census coastline
  geometry. If the street provider fails, real island geography remains
  interactive and a “Street map interrupted” notice identifies missing street
  detail. A tile error keeps the notice visible for that map session; another
  successful tile does not imply full recovery. This is geographic reference,
  not a road or evacuation map.
  Geometry provenance is in `public/hawaii-coastline-source.txt`.
  The planning overview stays at island scale; route-level zoom starts when
  resident guidance is opened, not on initial page load.
- Zustand for scenario state
- OSRM driving geometry and Valhalla pedestrian geometry
- Official TheBus GTFS for the transit example
- Motion for mobile sheets and brief transitions
- Playwright for desktop and mobile interaction tests

## Run locally

Install dependencies, then run the frontend and backend as separate local
servers with one lifecycle-managed command:

```bash
npm install
npm run dev:stack
```

The frontend is available at <http://127.0.0.1:3000> and requests the Go API at
<http://127.0.0.1:8080>. Override the backend location with
`VITE_BACKEND_API_URL`; [`.env.example`](./.env.example) contains the local
default. On macOS, `dev:stack` securely reads an existing Census API key from
Keychain so the aggregate AFN profile can load all four official sources. If no
key is stored, the stack starts in explicit partial-source mode and prints the
one-time setup command instead of hiding the missing ACS coverage.

The servers can still be started independently with `npm run dev` and
`npm run backend:run`. On macOS, store the Census API key in Keychain without
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
- `GET /metrics`
- `POST /api/v1/telemetry/browser`
- `GET /api/v1/identity/session`
- `POST /api/v1/identity/authorization-check`
- `POST /api/v1/collaboration/plans`
- `GET /api/v1/collaboration/plans/{planID}`
- `PUT /api/v1/collaboration/plans/{planID}`
- Collaboration comment, assignment, approval, and version-comparison routes
- Collaboration planning-assist status, generate, reject, and explicit-apply
  routes
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
- `GET /api/v1/planning/partner-matches?jurisdiction={id}&capability={capability}`
- `GET /api/v1/planning/event-triggers`
- `GET /api/v1/planning/live-status?lat={latitude}&lon={longitude}`
- `GET /api/v1/community/profile?lat={latitude}&lon={longitude}`

Browser page lifecycle and interaction telemetry is batched, privacy-safe, and
aggregated into Prometheus metrics by the backend. It never includes addresses,
coordinates, input values, visible text, user identifiers, or URLs/query
strings. See [`docs/observability.md`](./docs/observability.md) for the metric
contract, bounded labels, Prometheus scraping, and the Grafana dashboard.

Authentication and collaboration persistence are disabled by default, so the
planner remains anonymous and local-only until both are configured. The
response checklist and field packet continue to work without server storage.
Configured collaboration stores immutable plan versions, bounded operational
notes, controlled response-role assignments, version-specific approval
decisions, and append-only audit events in SQLite with optimistic concurrency.
The identity session endpoint returns only bounded mode,
configuration, role, capability, and collaboration availability state; it
never returns user identifiers, tokens, claims, issuer metadata, or
verification errors. Collaborative mutations use reusable read, write, and
approval capability guards. Provider-backed OIDC verification remains blocked
on approved tenant/application configuration and a cryptographic verifier; OIDC
metadata alone fails closed. See
[`docs/identity-foundation.md`](./docs/identity-foundation.md) and
[`docs/collaborative-plans.md`](./docs/collaborative-plans.md). Grounded
planning assist additionally requires configured identity and collaboration,
is unavailable to anonymous/local-only use, and never changes a plan until a
human explicitly applies selected draft content. See
[`docs/grounded-planning.md`](./docs/grounded-planning.md).

The backend coalesces identical concurrent official-source cache misses so a
burst of planner requests produces one upstream refresh per source and
coordinate. Coordinate caches are size-bounded, public errors omit upstream
diagnostics and coordinates, and request-body/header timeouts bound slow
clients. Raw source failures remain available in server logs.

The Response Plan also consumes a curated County shelter-plan catalog. It
reports published, reference-only, unavailable, and stale planning sources,
explicit local-validation gaps, and a statewide coverage summary. The catalog
does not infer a facility roster, capacity, accessibility, backup power, pet
support, or opening status from planning documents. Existing synthetic
facilities remain labeled `Practice record`; only the separate FEMA National
Shelter System endpoint can report an officially open shelter.

The separate `GET /api/v1/planning-areas` catalog supplies deterministic
statewide workflow depth. It covers four Chapter 127A emergency-management
jurisdictions and five political counties while preserving Kalawao's sourced
special scope under Maui. The catalog is fetched once per browser session and
reused by the map, response workspace, neighborhood briefing, and field packet.
Maui, Hawaiʻi, and Kauaʻi receive distinct resources, routes, AFN fixtures, and
coordination details rather than cloned Oʻahu content. If the catalog is
unavailable, those representative workflows fail closed with retry controls;
the browser does not substitute an Oʻahu resource or route. Molokaʻi, Lānaʻi,
Niʻihau, and Kalawao remain explicit coverage gaps rather than inferred local
workflows.

`POST /api/v1/planning/resource-demand` turns an aggregate ACS population,
its margin of error, a bounded service duration, a shelter standard, and
unit-matched practice supply into deterministic low/planning/high ranges. The
versioned v0.1 model covers mass-care service population, shelter spaces and
floor area, cots, meals, and potable water. Sanitation, role-specific staffing,
accessible transportation, medical power, refrigeration, oxygen, backup
power, and animal support remain explicit unavailable or local-assumption
lines where no defensible statewide coefficient exists. Privacy-masked HHS
emPOWER values are never converted into numeric demand, and missing evidence is
never treated as zero. Requests are strict JSON, limited to 64 KiB, use bounded
enums and quantities, and return `Cache-Control: no-store`.

`GET /api/v1/planning/partner-matches` maps bounded mass-care capability
enums to curated Hawaiʻi State, County, nonprofit, and coordination roles.
Every association includes its claim, publisher, source URL, geographic scope,
validation state, review window, and freshness. Results always report
operational status as unvalidated and capacity/activation as not reported.
Stale sources are disabled, unsupported capabilities remain explicit gaps, and
the browser sends no organization names, free text, addresses, coordinates, or
resource values. Matches are planning evidence, not recommendations,
assignments, endorsements, contracts, or commitments.

`GET /api/v1/planning/event-triggers` composes source-specific NWS, PTWC, and
USGS ComCat adapters into a versioned planning snapshot. It preserves product
IDs, types, issue/effective/expiry times, retrieval and freshness, official
links, severity/certainty/urgency, magnitude, and tsunami flags while keeping
the deterministic planning consequence separate from source facts. Forecasts,
watches, advisories, warnings, CAP response types, earthquake tsunami flags,
and volcano levels never normalize into a legal evacuation order. Expired
products remain visible as history and are not an all-clear. HANS remains
production-disabled because no stable supported public machine contract is
configured; web pages are not scraped. County evacuation-order data is
`unavailable`, never “none” or “no order.” If NWS, PTWC, and ComCat all fail,
the route returns `502`; partial source failure returns an explicit partial
snapshot.

`GET /api/v1/planning/live-status` returns the versioned
`live-operational-status.v1` envelope for evacuation/order, road/transport,
shelter, transit/paratransit, utility-outage, and wildfire status. FEMA
National Shelter System is the only adopted live source. Its reporting
authority, retrieval/freshness, and optional capacity, accessibility, pet,
address, and organization fields remain source-specific and separate from
County shelter-plan provenance and practice facilities. A missing FEMA record
does not prove no County shelter is open. Freshness is the FEMA query/feed
retrieval window; the checked contract does not establish a per-shelter update
timestamp. The other five domains include a checked source/date, owning
authority, exact missing machine artifact, limitations, and an explicit
unavailable state; HDOT planned roadwork is reference-only and never becomes
emergency closure or passability. See
[`docs/research/live-operational-status-sources-20261027.md`](./docs/research/live-operational-status-sources-20261027.md).

Hawaiʻi has five political counties but four County emergency-management
jurisdictions under
[HRS Chapter 127A](https://data.capitol.hawaii.gov/hrscurrent/Vol03_Ch0121-0200D/HRS0127A/HRS_0127A-0002.htm).
[Kalawao remains a separate county](https://data.capitol.hawaii.gov/hrscurrent/Vol06_Ch0321-0344/HRS0326/HRS_0326-0034.htm)
under State Department of Health administration and is included with Maui for
Chapter 127A emergency-management responsibilities; the planner surfaces this
special case instead of inventing an independent Kalawao shelter agency.

After generating the response checklist, planners can download a standalone
HTML field briefing. The packet carries the selected Map → Model → Match
context, official aggregate AFN values, resource and route checks, assigned
actions, official trigger context and authority limits, quantitative
resource-demand ranges and unavailable lines, sourced
partner associations and operational-validation gaps, public guidance,
required local validation checks, and direct Hawaiʻi DHS planning-reference
URLs. It has embedded print styles and no external runtime dependencies, so it
can be printed or opened after connectivity is lost. It intentionally excludes
resident-entered addresses, coordinates, names, identifiers, and person-level
medical data.

- `GET /api/v1/community/acs?lat={latitude}&lon={longitude}`
- `GET /api/v1/community/svi?lat={latitude}&lon={longitude}`
- `GET /api/v1/community/empower?lat={latitude}&lon={longitude}`
- `GET /api/v1/community/fema-risk?lat={latitude}&lon={longitude}`
- `GET /api/v1/transportation/planned-closures?lat={latitude}&lon={longitude}`

## Validate

```bash
npm run backend:test
npm run test:integration
npm run test:journey
npm run test:matrix
npm run test:e2e
npm run build
npm run lint
npm run check
```

`npm run test:integration` starts the real frontend and Go API on isolated test
ports, drives the complete Map → Model → Match planner journey, confirms a
resource, generates the response checklist, downloads and inspects the offline
field briefing, exercises the deterministic resource-demand model and
accessible public guidance, and then verifies the resulting AFN, HTTP,
browser-interaction, and telemetry Prometheus metrics. The test also proves
that a private address entered in the guidance flow is absent from both the
downloaded packet and Prometheus output. The integration server uses
deterministic aggregate official-source fixtures; unit tests separately cover
the production community-source fan-out, partial-source behavior, demand-model
determinism, ACS uncertainty propagation, and fail-closed supply matching.
It also proves that anonymous planning remains usable and local while the
disabled identity boundary denies the protected-write authorization probe
without leaking a credential into the session response or metrics.
The named `collaborative plans preserve versions and reject stale writes` test
uses the real Go API and durable SQLite driver to create and update a plan,
compare versions, add a note and controlled assignment, record an approval,
inspect audit history, and prove that a stale revision returns `409`.

`npm run test:journey` runs the numbered resident story and writes raw timing
metrics plus a summary to `test-results/performance/`. Important browser state
changes use microsecond measurements with a 100,000 µs budget. Cached backend
requests use millisecond measurements with a 100 ms median and 500 ms p95
budget; cold authoritative source latency is recorded against a 1,000 ms target
and reported separately. The production frontend must hydrate within 2,000 ms.
Performance budgets run with one browser worker so parallel test-run contention
does not distort the user-facing timings.

`npm run test:matrix` executes deterministic cross-island scenarios for Oʻahu,
Maui, Hawaiʻi, and Kauaʻi. It verifies the expected AFN hotspot, score,
supporting evidence, generated planning action, and privacy boundary supplied to
the mock AI generator. See
[`docs/afn-planning-matrix.md`](./docs/afn-planning-matrix.md) for the matrix,
thresholds, limitations, and extension process.

The standard Playwright suite also starts the deterministic real Go fixture
server rather than depending on public DNS or upstream availability. Adapter
unit tests cover production URLs and failure behavior; browser tests remain
repeatable while still crossing the browser-to-Go HTTP boundary.

## Data truth and limitations

The planner consumes `GET /api/v1/community/profile` for privacy-safe aggregate
AFN context. It displays Census ACS disability, limited-English, and
no-vehicle estimates together with HHS emPOWER medical-equipment dependence.
The interface preserves privacy-masked emPOWER counts, supports partial source
responses, and never represents these geographic estimates as person-level
records. The response workspace also exposes population, age, poverty,
health-service equipment, overall SVI, expected annual loss, retrieval time,
and stale-source status so planners can assess both the signal and its
provenance without opening another system.

Official data is requested from:

- [Hawaiʻi Statewide GIS Hazards services](https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer)
- [FEMA National Shelter System](https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/MapServer)
- [Central Pacific Hurricane Center GIS feed](https://www.nhc.noaa.gov/gis-cp.xml)
- [Pacific Tsunami Warning Center CAP feed](https://www.tsunami.gov/events/xml/PHEBCAP.xml)
- [USGS ComCat FDSN Event API](https://earthquake.usgs.gov/fdsnws/event/1/)
- [USGS HANS public site](https://volcanoes.usgs.gov/hans-public/) — provisional
  and production-disabled until a stable supported machine contract is
  available
- [HDOT planned lane closures](https://services.arcgis.com/HQ0xoN0EzDPBOEci/arcgis/rest/services/Lane_Closure_WFL1_View_NoEd/FeatureServer/0)

Official Hawaiʻi DHS guidance is referenced separately from live or aggregate
data:

- [Hawaiʻi Department of Human Services](https://humanservices.hawaii.gov/)
- [DHS emergency planning for disability and access needs](https://humanservices.hawaii.gov/communications/are-you-ready/special-needs/)
- [DHS Maui wildfire recovery resources](https://humanservices.hawaii.gov/communications/)

The DHS emergency-planning page informs checks for accessible warnings,
mobility assistance, transportation for people without vehicles, language
access, medication refrigeration, backup medical equipment, and service-animal
supplies. The Maui recovery page documents a Maui-specific Disaster Case
Management referral through 211. These references inform planning and recovery
coordination; they are not hazard forecasts, live shelter status, or a statewide
incident feed.

The interface palette follows the official State of Hawaiʻi web style guide and
the ETS site’s ʻĀina theme: state charcoal, teal (`#18828c`), deep teal
(`#0b7482`), and aqua (`#73c9cf`) on accessible white and cool-neutral
surfaces. Red, amber, and green remain reserved for hazard and operational
status meaning.

The official sources provide planning context, not a complete live incident
picture:

- County shelter-plan references provide provenance and planning coverage, not
  an authorized County facility roster or live operating status.
- The wildfire layer is community planning risk, not a live fire perimeter.
- FEMA flood zones do not predict the exact extent of an active storm.
- The sea-level-rise layer is a long-range planning scenario, not a current
  forecast.
- Practice shelters and routes are not represented as officially open.
- HDOT planned lane closures are construction context, not live emergency road
  status or proof of passability.
- Live emergency road closures, transit arrivals, County shelter capacity, and
  incident evacuation orders are not yet integrated.

When an official source fails, the interface reports the status as unavailable
instead of substituting a reassuring answer.

## Architecture boundary

- `src/lib/mock-data.ts` contains deterministic synthetic geospatial and
  planning data.
- `src/lib/planning-analysis.ts` deterministically ranks aggregate AFN planning
  weaknesses and keeps missing-source uncertainty explicit.
- `src/lib/mock-api.ts` provides a bounded, injectable planning-response
  generator; the default mock drafts language from the deterministic analysis.
- `src/lib/backend-api.ts` is the configurable, typed request boundary between
  the separately hosted frontend and backend.
- `src/lib/official-emergency-data.ts` maps normalized backend responses into
  resident-facing hazard and shelter models without calling government sources
  directly from the browser.
- `src/lib/county-shelter-plans.ts` loads the curated County planning envelope
  and preserves unavailable, partial, stale, and retry states.
- `src/lib/planning-areas.ts` loads and caches the deterministic statewide
  practice workflow catalog, maps its resources/routes/briefings into existing
  planner models, and preserves fail-closed retry behavior.
- `src/lib/resource-demand.ts` sends only bounded aggregate inputs and
  unit-labeled practice supply to the deterministic Go resource-demand model;
  it preserves unavailable, partial, privacy-masked, and retry states.
- `src/lib/partner-matching.ts` derives controlled capability needs and
  requests provenance-aware matches by four emergency-management jurisdiction
  IDs; it never sends organization names, user text, or operational values.
- `src/store/planning-store.ts` holds the client scenario state.
- `backend/` contains the Go API, normalized source catalog, live
  NWS/CPHC/PTWC/USGS event adapters, official hazard and shelter adapters,
  community-planning
  sources, deterministic resource-demand calculator, curated partner matcher,
  and HDOT planned-closure context.

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
