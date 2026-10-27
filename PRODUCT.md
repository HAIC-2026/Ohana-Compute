# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are county and state emergency planners, mass-care coordinators, community partners, and challenge evaluators working under operational pressure. Hawaiʻi residents are the downstream public audience, including people without cars, people who use mobility or medical equipment, and people who prefer a language other than English.

## Product Purpose

The product turns fragmented public hazard, population, shelter, transportation, food, medical-power, and infrastructure information into an emergency-planning workflow. Planners identify affected communities, estimate likely access and functional needs, confirm resources and routes, expose response gaps, assign a first coordinated action, and preview how the approved plan becomes accessible resident guidance.

Success means a first-time planner can move from an island-wide event picture to a defensible planning priority, human-reviewable response checklist, and offline field briefing in a few minutes, with every metric tied to visible evidence and no implication that the system identifies individual residents.

## Base Use Case

The minimum complete planner journey is:

1. **Map:** open a named event and planning area, then inspect official
   aggregate AFN context with source geography and privacy limitations.
2. **Model:** compare the affected-community estimate with shelter, backup
   power, transportation, and route gaps that still require confirmation. Use
   the deterministic resource-demand panel to inspect low/planning/high service
   ranges, matched practice supply, ACS uncertainty, and unavailable
   coefficients without presenting the result as a forecast.
3. **Match:** identify the accountable response partner, first action, and
   decision window.
4. Confirm a local resource and generate a human-reviewable response
   checklist.
5. Download a self-contained field briefing for printing or
   limited-connectivity coordination.
6. Preview how the plan becomes accessible resident guidance, including
   no-car and preferred-language needs.
7. Verify that the browser interactions, backend routes, AFN source health,
   profile completeness, and telemetry delivery appear in Prometheus metrics.

`npm run test:integration` exercises this complete journey through a real Go API
server with deterministic official-source fixtures and verifies the resulting
Prometheus metrics.

## Positioning

The product joins a statewide geospatial operating picture with a CMIST-oriented emergency-planning layer. Unlike a generic disaster map or chatbot, the map computes and displays evidence, resource checks, and operational gaps while the model explains only the selected, structured scenario context. Resident routing is a downstream preview of approved public guidance, not the primary planning product.

## Operating Context

- Pre-event planning and early response for hurricanes, wildfires, tsunamis, and floods.
- County-led mass-care planning supported by State ESF-6 and community partners.
- Desktop use in planning meetings and emergency operations settings, plus mobile use in the field.
- Public, aggregate datasets with different geographic resolution, update cadence, and uncertainty.
- A public read-only first release backed by normalized Go API contracts, with
  deterministic source fixtures reserved for end-to-end integration testing.

## Capabilities and Constraints

- Interactive Hawaiʻi map with selectable hazard, AFN indicator, shelter, and infrastructure layers.
- Official aggregate AFN context for the selected planning area from Census ACS,
  CDC/ATSDR SVI, and HHS emPOWER, with partial-source and unavailable states.
- One clearly labeled practice exposure overlay for the selected emergency, with unrelated hazard geometry hidden.
- An active-event briefing model that combines a named event, expected arrival window, forecast trend, confidence, severity, dominant threats, and event-specific public guidance.
- Practice active events cover all four challenge scenarios: Hurricane Lala, Tropical Storm Nolo flooding, a Pacific Tsunami Warning, and Leeward Wildfire Koa.
- Island-first navigation that displays one island at a time, divides it into recognizable response zones grounded in official planning-region and neighborhood-board geography, and then produces a local plan for the selected zone.
- A statewide island selector with four distinct County-level representative
  workflows: Urban Honolulu, Central/West Maui, Hilo/Lower Puna, and East
  Kauaʻi. Each has a unique briefing, AFN fixture, practice resources, route
  checks, coordination owner, communications path, and County shelter-plan
  linkage. Molokaʻi, Lānaʻi, Niʻihau, and Kalawao remain explicit unsupported
  workflow scope rather than inheriting another island's content.
- Town neighborhood briefings for Mānoa–Makiki, Kakaʻako–Ala Moana, Kaimukī–Kāhala, Waikīkī–Kapahulu, and Downtown–Kalihi.
- A resident-guidance preview with address/landmark/ZIP lookup, current-location support, road-level practice routes, mapped flood-avoidance zones, shelter, food and water, medical-power, and accessible-transport destinations.
- Practice resident-route coverage currently includes Mānoa–Makiki, Kakaʻako–Ala Moana, Kaimukī–Kāhala, and Hawaiʻi Kai, including 96816 and 96825 lookup examples.
- Address-level resident-route coverage remains Oʻahu-only. Selecting a Maui,
  Hawaiʻi, or Kauaʻi representative workflow clears the prior Oʻahu resident
  route and reports the limitation instead of displaying stale Oʻahu
  destinations or directions.
- The Hawaiʻi Kai reference route uses street-snapped geometry for driving and a current TheBus GTFS Route 1L walk–bus–walk itinerary; realtime arrivals and disaster detours remain unavailable until the required TheBus API integration is added.
- The resident route checks the selected point against the official Hawaiʻi Statewide GIS tsunami evacuation layer and renders the matched standard, extreme, or safe-zone polygon separately from synthetic flood overlays.
- The resident route checks the selected point against the statewide June 2026 FEMA DFIRM layer, classifies high, moderate, lower-mapped, undetermined, or unmapped flood status, and outlines nearby 1% and 0.2% annual-chance flood areas.
- The resident route checks Hawaiʻi DLNR-DOFAW community wildfire-risk areas and outlines the matched planning polygon while explicitly distinguishing it from a live fire perimeter.
- The State’s 1%-annual-chance coastal flood area with 3.2 ft of sea-level rise is shown only as a long-range planning exposure, never as the current storm forecast.
- Official resident risk is event-dependent: hurricane and flood show FEMA flood risk, tsunami shows the tsunami evacuation classification, and wildfire shows the community fire-risk classification. Unrelated hazard cards and polygons are hidden.
- The resident route checks FEMA National Shelter System open-shelter data live. If no open Hawaiʻi shelter is reported, the interface says so explicitly and keeps all practice destinations secondary and unverified.
- The Response Plan shows curated County shelter-plan provenance across four
  Chapter 127A emergency-management jurisdictions covering Hawaiʻi's five
  political counties, including stale, unavailable, and
  local-validation-required states. Kalawao remains a separate political
  county under State Department of Health administration and is explicitly
  included with Maui only for emergency-management scope. This planning
  catalog has no official facility records and stays separate from FEMA live
  status and synthetic practice inventory.
- The Response Plan includes a deterministic, versioned quantitative
  resource-demand model. It propagates aggregate ACS population uncertainty,
  returns low/planning/high ranges for service population, shelter space and
  floor area, cots, meals, and potable water, and subtracts only confirmed
  unit- and geography-matched practice supply. It reports sanitation,
  role-specific staffing, transportation, medical-power, refrigeration,
  oxygen, backup-power, and animal-support coefficients as unavailable or
  locally required rather than inventing values. HHS emPOWER remains
  Medicare-only aggregate context, and privacy-masked cells never become
  numeric demand.
- Route guidance changes for residents without cars, residents needing mobility help, and residents needing powered medical support.
- Residents can choose a preferred language, see whether the selected resource lists that support, and ask the browser to read route directions aloud.
- Each neighborhood briefing includes a shelter-versus-move decision, decision trigger, responsible lead, communication path, nearest practice resources, evacuation/access routes, traffic hazards, AFN and language-access actions, evidence basis, freshness, and validation status.
- A primary planning sequence that shows people who may need help, likely needs, resources and routes to confirm, and the first coordinated action.
- A self-contained HTML field briefing that preserves Map–Model–Match evidence,
  resource and route status, accountable actions, public guidance, and explicit
  local checks for connectivity fallback, trusted multilingual outreach,
  elevator outages, pets, and working animals. It is printable, works without
  external assets, and excludes resident-entered addresses and coordinates.
- A synthetic local resource inventory with names, capacity, capabilities, shared confirmation status, grouped map markers, and an explicit completion state.
- Scenario controls and aggregate impact summaries for selected planning areas.
- CMIST categories: Communication, Medical, Independence, Safety/Support, and Transportation.
- AI-assisted explanation and planning summaries grounded only in structured map context.
- AI does not generate or modify quantitative demand values; the Go calculator
  is deterministic, versioned, and auditable.
- No personally identifiable information, stored addresses, individual registry, live tracking, dispatch, or autonomous resource allocation.
- Responsive web interface deployed later as a frontend container beside a Go API container.
- The production target is a new AKS environment with public Istio ingress and a managed Luna 6 endpoint accessed only through the backend.
- Scenario exposure, resources, routes, and response recommendations are
  synthetic demonstrations and must be labeled as such. Official aggregate AFN
  values retain their source geography and privacy limitations.
- A visible challenge-readiness section must distinguish implemented prototype behavior from county validation, live-data integration, and deployment work that remains pending.

## Evidence on Hand

- The official HAIC 2026 DHS challenge pitch defines the required framework as **Map, Model, Match**: map people with AFN and hazard exposure, model hazard-specific resource needs and gaps, then match needs to agencies and community partners with clear roles, decision points, and ways to reach residents.
- Counties lead mass care, with State ESF-6 supporting County efforts. Evaluation is explicitly based on whether the framework is actionable, usable, private, equitable, and sustainable.
- The prompt names Census ACS, CDC/ATSDR Social Vulnerability Index, HHS emPOWER, FEMA risk and flood data, tsunami evacuation zones, wildfire risk layers, and Hawaiʻi Statewide GIS data.
- The prototype now reads Hawaiʻi Statewide GIS tsunami, DFIRM flood, and DLNR wildfire-risk services plus the FEMA National Shelter System open-shelter service directly. It also exposes curated County shelter-plan provenance without inferring facilities or operating status.
- The backend exposes a deterministic statewide planning-area catalog for four
  representative workflows. This closes the product-depth gap for Maui,
  Hawaiʻi, and Kauaʻi without claiming operational County inventory. County
  incident perimeters, County shelter openings and capacity, live road
  closures, customer claims, measured impact, and current local resource
  inventories remain unintegrated.

## Product Principles

1. The map is the primary interface; AI supports interpretation rather than replacing evidence.
2. Move from hazard to affected communities to likely needs to coordinated action.
3. Make uncertainty, source age, and aggregation visible instead of presenting false precision.
4. Protect privacy by design and describe areas of elevated need, never identified individuals.
5. Keep the critical planning path understandable on both desktop and mobile.
6. Use readable operational text and preserve action ownership, timing, resource status, and route status when the interface reflows.
7. Derive the plan from the forecast pattern, not only the hazard category: two storms with different tracks, timing, and dominant threats must produce different needs and actions.
8. Never present a recommendation without its owner, decision point, evidence status, and required local validation.
9. Demonstrate privacy through the actual data shape: aggregate area totals and resource records only, with no names, household addresses, medical records, or person-level movement histories.
10. Never assume a resident drives, can walk long distances, can use stairs, has reliable power, or reads English.
11. Put flood and traffic avoidance beside the route, not in a separate technical layer the resident must interpret.
12. A failed official-data request must produce an unavailable state, never a reassuring safe-zone or shelter-available result.
13. Never present a practice site as an open shelter. Only a current authoritative shelter record can receive an officially open label.
14. FEMA Zone D means flood risk is undetermined, not low. Zone X and areas outside mapped floodplains must still warn that event flooding can exceed mapped boundaries.
15. Keep regulatory flood zones, tsunami evacuation zones, and future sea-level-rise scenarios visibly and verbally distinct.

## Accessibility & Inclusion

The interface must support keyboard navigation, high contrast, reduced motion, screen-reader summaries, touch targets, and non-map access to the same planning information. Language and disability indicators must be described respectfully and without treating demographic proxies as individual facts.
