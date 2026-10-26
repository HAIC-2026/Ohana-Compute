# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users include Hawaiʻi residents trying to reach safety and essential resources under stress, including people without cars, people who use mobility or medical equipment, and people who prefer a language other than English. County and state emergency planners, community partners, and challenge evaluators use the same evidence through the deeper planning workflow.

## Product Purpose

The product turns fragmented public hazard, population, shelter, transportation, food, medical-power, and infrastructure information into a resident route and shared planning view. A resident should be able to start from home, understand what may happen nearby, see where not to travel, and find a safe practice route to shelter, food and water, medical power, or accessible pickup. Planners can inspect the aggregate evidence and coordination workflow behind that guidance.

Success means a first-time user can move from an island-wide picture to a defensible planning priority in a few minutes, with every metric tied to a visible source and no implication that the system identifies individual residents.

## Positioning

The product joins a statewide geospatial operating picture with a CMIST-oriented decision layer. Unlike a generic disaster map or chatbot, the map computes and displays the evidence while the model explains only the selected, structured scenario context.

## Operating Context

- Pre-event planning and early response for hurricanes, wildfires, tsunamis, and floods.
- County-led mass-care planning supported by State ESF-6 and community partners.
- Desktop use in planning meetings and emergency operations settings, plus mobile use in the field.
- Public, aggregate datasets with different geographic resolution, update cadence, and uncertainty.
- A public read-only first release with mocked backend responses until the service contract is implemented.

## Capabilities and Constraints

- Interactive Hawaiʻi map with selectable hazard, AFN indicator, shelter, and infrastructure layers.
- One clearly labeled practice exposure overlay for the selected emergency, with unrelated hazard geometry hidden.
- An active-event briefing model that combines a named event, expected arrival window, forecast trend, confidence, severity, dominant threats, and event-specific public guidance.
- Practice active events cover all four challenge scenarios: Hurricane Lala, Tropical Storm Nolo flooding, a Pacific Tsunami Warning, and Leeward Wildfire Koa.
- Island-first navigation that displays one island at a time, divides it into recognizable response zones grounded in official planning-region and neighborhood-board geography, and then produces a local plan for the selected zone.
- A statewide island selector with honest coverage states: Oʻahu currently has the deepest local prototype, while Maui, Hawaiʻi, and Kauaʻi expose regional practice views and a visible validation-pending state instead of reusing Oʻahu geometry.
- Town neighborhood briefings for Mānoa–Makiki, Kakaʻako–Ala Moana, Kaimukī–Kāhala, Waikīkī–Kapahulu, and Downtown–Kalihi.
- A resident-first route planner with address/landmark/ZIP lookup, current-location support, road-level practice routes, mapped flood-avoidance zones, shelter, food and water, medical-power, and accessible-transport destinations.
- Practice resident-route coverage currently includes Mānoa–Makiki, Kakaʻako–Ala Moana, Kaimukī–Kāhala, and Hawaiʻi Kai, including 96816 and 96825 lookup examples.
- The Hawaiʻi Kai reference route uses street-snapped geometry for driving and a current TheBus GTFS Route 1L walk–bus–walk itinerary; realtime arrivals and disaster detours remain unavailable until the required TheBus API integration is added.
- The resident route checks the selected point against the official Hawaiʻi Statewide GIS tsunami evacuation layer and renders the matched standard, extreme, or safe-zone polygon separately from synthetic flood overlays.
- The resident route checks the selected point against the statewide June 2026 FEMA DFIRM layer, classifies high, moderate, lower-mapped, undetermined, or unmapped flood status, and outlines nearby 1% and 0.2% annual-chance flood areas.
- The resident route checks Hawaiʻi DLNR-DOFAW community wildfire-risk areas and outlines the matched planning polygon while explicitly distinguishing it from a live fire perimeter.
- The State’s 1%-annual-chance coastal flood area with 3.2 ft of sea-level rise is shown only as a long-range planning exposure, never as the current storm forecast.
- Official resident risk is event-dependent: hurricane and flood show FEMA flood risk, tsunami shows the tsunami evacuation classification, and wildfire shows the community fire-risk classification. Unrelated hazard cards and polygons are hidden.
- The resident route checks FEMA National Shelter System open-shelter data live. If no open Hawaiʻi shelter is reported, the interface says so explicitly and keeps all practice destinations secondary and unverified.
- Route guidance changes for residents without cars, residents needing mobility help, and residents needing powered medical support.
- Residents can choose a preferred language, see whether the selected resource lists that support, and ask the browser to read route directions aloud.
- Each neighborhood briefing includes a shelter-versus-move decision, decision trigger, responsible lead, communication path, nearest practice resources, evacuation/access routes, traffic hazards, AFN and language-access actions, evidence basis, freshness, and validation status.
- A primary planning sequence that shows people who may need help, likely needs, resources and routes to confirm, and the first coordinated action.
- A synthetic local resource inventory with names, capacity, capabilities, shared confirmation status, grouped map markers, and an explicit completion state.
- Scenario controls and aggregate impact summaries for selected planning areas.
- CMIST categories: Communication, Medical, Independence, Safety/Support, and Transportation.
- AI-assisted explanation and planning summaries grounded only in structured map context.
- No personally identifiable information, stored addresses, individual registry, live tracking, dispatch, or autonomous resource allocation.
- Responsive web interface deployed later as a frontend container beside a Go API container.
- The production target is a new AKS environment with public Istio ingress and a managed Luna 6 endpoint accessed only through the backend.
- Initial values and responses are synthetic demonstrations and must be labeled as such.
- A visible challenge-readiness section must distinguish implemented prototype behavior from county validation, live-data integration, and deployment work that remains pending.

## Evidence on Hand

- `../HAIC_AI-Challenge_Submission_DHS_Disaster_2026.pdf` is not inside this project; the source challenge document is attached to the originating Copilot session.
- The prompt names Census ACS, CDC/ATSDR Social Vulnerability Index, HHS emPOWER, FEMA risk and flood data, tsunami evacuation zones, wildfire risk layers, and Hawaiʻi Statewide GIS data.
- The prototype now reads Hawaiʻi Statewide GIS tsunami, DFIRM flood, and DLNR wildfire-risk services plus the FEMA National Shelter System open-shelter service directly. County incident perimeters, shelter openings, road closures, customer claims, measured impact, and current local resource inventories are not yet integrated.

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
