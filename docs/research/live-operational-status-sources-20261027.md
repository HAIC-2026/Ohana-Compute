# Hawaiʻi live operational-status source decision

Checked 2026-10-27 against public official source contracts and current runtime
behavior. The product adopts only sources whose authority, machine contract,
coverage, freshness, and operational semantics can be preserved without
scraping or inference.

## Frozen decision matrix

| Domain              | Decision                                                                              | Public contract checked                                                                                                                                                                                                        | Shipped boundary                                                                                                                                                               | Counter-evidence and limitation                                                                                                                                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evacuation/order    | **FURTHER-RESEARCH**; explicitly unavailable                                          | [HI-EMA preparedness and official-channel guidance](https://dod.hawaii.gov/hiema/get-ready/) plus County emergency-management channels                                                                                         | `unavailable`; exact missing artifact is a verified statewide machine-readable contract for attributable current legal orders owned by the governor and County mayors          | NWS/PTWC products, CAP response types, forecasts, earthquake tsunami flags, fire perimeters, and social posts are not legal orders. Missing data never means no order.                                                                                                                                                       |
| Road/transport      | **ADAPT** planned reference; **SKIP** emergency status                                | [HDOT planned lane-closure FeatureServer](https://services.arcgis.com/HQ0xoN0EzDPBOEci/arcgis/rest/services/Lane_Closure_WFL1_View_NoEd/FeatureServer/0) and [HDOT roadwork page](https://hidot.hawaii.gov/highways/roadwork/) | Emergency closure/passability is `unavailable`; the existing HDOT adapter remains labeled `planned_reference`                                                                  | The machine feed is planned construction/maintenance. HDOT removed GoAkamai's prior real-time flow, incident, and travel-time features, and no supported replacement emergency-passability API is documented. Planned work must never become “road closed” or “route passable.”                                              |
| Shelter             | **ADOPT** with feed-level freshness                                                   | [FEMA National Shelter System Open Shelters layer](https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/MapServer/0) and its ArcGIS query contract                                                                       | Production-shaped FEMA adapter reports query retrieval/freshness and only fields actually returned: status, capacity, accessibility, pets, address, organization, and distance | Reporting is contributed by participating authorities. The public contract checked here does not establish a per-shelter update timestamp, so freshness stays feed-level. No returned record does not prove no County shelter is open. FEMA records remain separate from County plan provenance and all practice facilities. |
| Transit/paratransit | **ADAPT** static/scheduled planning context; **FURTHER-RESEARCH** operational status  | [TheBus API information](https://hea.thebus.org/api_info.asp) and [HDOT transit directory](https://hidot.hawaii.gov/mobility/transit/)                                                                                         | `unavailable`; exact missing artifact is a documented statewide public service-disruption and paratransit-availability contract owned by County operators                      | TheBus live interfaces are AppID-gated and Oʻahu-specific. Schedules or vehicle arrivals do not establish emergency service, detours, accessibility, or paratransit availability. Outer-island providers need separate contracts.                                                                                            |
| Utility outage      | **FURTHER-RESEARCH**; explicitly unavailable                                          | [Hawaiian Electric outage information](https://www.hawaiianelectric.com/safety-and-outages/power-outages) and public provider outage maps                                                                                      | `unavailable`; exact missing artifact is a supported public machine outage/restoration contract with provider and island coverage                                              | A candidate ArcGIS FeatureServer surfaced only through secondary search, without directly verified publisher support, terms, rate limits, or redistribution rights. It is not adopted. Map applications are not scraped, and Hawaiian Electric coverage cannot be substituted for KIUC.                                      |
| Wildfire            | **FURTHER-RESEARCH** for bounded federal context; **SKIP** Hawaiʻi operational status | [WFIGS item metadata](https://www.arcgis.com/sharing/rest/content/items/d1c32af3212341869b3c810f1a215824?f=pjson), Hawaiʻi DLNR-DOFAW planning layers, and County/State authority boundaries                                   | `unavailable`; exact missing artifact is a Hawaiʻi-authoritative contract for complete incident, containment, protective-action, and evacuation status                         | WFIGS can provide national incident/perimeter context but may omit incidents or perimeters and does not establish local containment, road, or evacuation truth. Satellite hot spots are detections; the DLNR layer is historical planning risk. Neither is substituted.                                                      |

## Acceptance checks frozen before implementation

1. The real Go endpoint returns exactly six required domains; FEMA shelters are
   `reported_live` or `stale`, while order, road, transit/paratransit, utility,
   and wildfire remain explicit `unavailable` boundaries.
2. A FEMA record preserves reporting authority, retrieval/freshness, and
   optional capacity/accessibility/pet fields, while the UI and field packet
   state that it is not a County plan record or practice facility.
3. Planned HDOT roadwork never appears as emergency closure or passability,
   and every unavailable domain carries the checked URL/date, owning authority,
   exact missing artifact, verification note, UI state, and contract test.
4. Browser telemetry and Prometheus use only bounded
   domain/source/status/route/action enums; facility names, IDs, addresses,
   coordinates, organizations, URLs, and upstream text never become labels.

## Shipped versus blocked

The shipped `live-operational-status.v1` envelope is intentionally not a
universal “all clear” model. Each domain keeps its own authority, coverage,
freshness, provenance, limitations, and bounded facts. FEMA shelter facts are
the only supported live records. The other domains ship a working adapter
interface and deterministic unavailable contract so a future authorized source
can be added without changing the fail-closed product semantics.

## Verification caveat

Outbound DNS and direct source fetches were unavailable during the 2026-10-27
refresh. Net-new leads were therefore downgraded to `FURTHER-RESEARCH` unless
the repository's 2026-10-26 primary-source contract check already supported
adoption. In particular, the Hawaiian Electric FeatureServer lead, outer-island
canonical GTFS URLs, WFIGS Hawaiʻi reporting completeness, and any FEMA
per-shelter update field require a future direct primary-source verification.
