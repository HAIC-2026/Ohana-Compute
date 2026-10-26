# Research: Which external data should the Hawaiʻi resilience backend integrate?

**Date:** 2026-10-26

**Asker:** Hawaiʻi Resilience Atlas project

**Decision:** ADAPT

## Question

Which authoritative external datasets should the backend integrate now,
design for later, or skip to support actionable resident routing and
pre-event/early-response planning for hurricane, flood, tsunami, and wildfire?

## TL;DR

**ADAPT:** use the named portals for discovery, but integrate a small set of
canonical services directly behind normalized adapters with freshness,
provenance, and uncertainty. Start with NWS alerts, CPHC hurricane products,
PTWC tsunami products, State GIS hazard geometry, HDOT planned closures, and
ACS; add gauges, wildfire perimeters, transit, emPOWER, SVI, and county
resources only when each enables a concrete decision.

## What I read

| Source                                                                                                                                                               | Type              |            Date | What it said (1 line)                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------: | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [HDOT Climate Resilience](https://climate-resilience.hidot.hawaii.gov/)                                                                                              | official portal   |         current | A transportation-climate planning application; the supplied information URL returned 404 and no supported public API contract was documented. |
| [Hawaiʻi Geoportal](https://geoportal.hawaii.gov/)                                                                                                                   | official catalog  |         current | A discovery catalog whose machine-readable sources resolve to State ArcGIS services rather than one ingestible backend.                       |
| [HAIC State GIS Hub](https://esri-haic-histategis.hub.arcgis.com/)                                                                                                   | event hub         |            2026 | Challenge examples and items overlap the State GIS organization; it is not an operational authority.                                          |
| [State GIS REST directory](https://geodata.hawaii.gov/arcgis/rest/services?f=pjson)                                                                                  | API metadata      |         current | Exposes canonical thematic MapServers through ArcGIS REST, GeoJSON, WFS, and WMS.                                                             |
| [Tsunami zones](https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/11?f=pjson)                                                                        | API metadata      |           mixed | Documents statewide evacuation geometry with newer Oʻahu/Hawaiʻi/Kauaʻi sources and older Maui County sources.                                |
| [State DFIRM](https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/6?f=pjson)                                                                           | API metadata      |         monthly | A statewide mirror derived from FEMA flood-hazard data, appropriate for planning rather than live inundation.                                 |
| [FEMA open shelters](https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/MapServer/0?f=pjson)                                                                 | API metadata      | incident-driven | Exposes reported open shelters with status, capacity, accessibility, pet, address, and operator fields.                                       |
| [DLNR fire risk](https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/7?f=pjson)                                                                        | API metadata      |     2007 source | Community fire-risk boundaries were re-reviewed in 2017 and 2022 but remain planning context, not live perimeters.                            |
| [NWS API](https://www.weather.gov/documentation/services-web-api)                                                                                                    | official docs     |         current | Provides GeoJSON/CAP alerts and point/grid forecasts; rate limits are undisclosed and some observations lag upstream systems.                 |
| [NHC/CPHC GIS](https://www.nhc.noaa.gov/gis/)                                                                                                                        | official docs     |        advisory | Publishes storm track, cone, wind, probability, and arrival-time products but calls GIS output a convenience service.                         |
| [PTWC products](https://www.tsunami.gov/?page=productRetrieval)                                                                                                      | official docs     |    event-driven | PTWC is Hawaiʻi’s tsunami center and publishes Atom/CAP products for watches, advisories, warnings, and cancellations.                        |
| [FEMA NFHL](https://www.fema.gov/flood-maps/national-flood-hazard-layer)                                                                                             | official docs     |         current | Identifies NFHL as effective regulatory flood data, not a live flood or road-status feed.                                                     |
| [USGS instantaneous values](https://waterservices.usgs.gov/docs/instantaneous-values/instantaneous-values-details/)                                                  | official API docs |  near-real-time | Provides recent stream measurements while warning that values are provisional.                                                                |
| [WFIGS metadata](https://www.arcgis.com/sharing/rest/content/items/d1c32af3212341869b3c810f1a215824?f=pjson)                                                         | API metadata      |       5 minutes | Current fire incidents/perimeters refresh frequently, but not every incident has perimeter geometry.                                          |
| [TheBus API](https://hea.thebus.org/api_info.asp)                                                                                                                    | official API docs |         current | Publishes active GTFS and AppID-gated vehicle-arrival APIs for Oʻahu.                                                                         |
| [ACS API](https://www.census.gov/programs-surveys/acs/data/data-via-api.html)                                                                                        | official docs     |          annual | Supplies aggregate block-group/tract demographics, including language, disability, and vehicle availability, with margins of error.           |
| [CDC SVI](https://www.atsdr.cdc.gov/place-health/php/svi/svi-data-documentation-download.html)                                                                       | official docs     |        periodic | Provides vulnerability components and warns that releases and tract rankings are not directly comparable over time.                           |
| [HHS emPOWER](https://empowerprogram.hhs.gov/empowermap/)                                                                                                            | official service  |         monthly | Publishes de-identified ZIP/county aggregates for electricity-dependent medical services with small-cell suppression.                         |
| [HI-EMA preparedness](https://dod.hawaii.gov/hiema/get-ready/)                                                                                                       | official docs     |         current | Confirms that Hawaiʻi’s four counties issue their own alerts and operational instructions.                                                    |
| [Cloud Run weather advisory example](https://github.com/GoogleCloudPlatform/serverless-expeditions/blob/main/cloud-run-alwayson-cpu-weather-advisory/python/main.py) | code repository   |         current | Demonstrates a practical five-minute refresh and 15-minute alert-cache pattern rather than per-user NWS calls.                                |

(Read budget: 24 sources across official documents, live service metadata,
vendor/API specifications, and implementation code. Stopped because the
source-selection decision and first adapter were actionable.)

## Findings

1. **Portals are discovery surfaces, not canonical feeds.** Geoportal and the
   HAIC Hub ultimately point to State ArcGIS items; ingesting portal HTML or
   duplicating Hub items creates fragile, redundant ownership.
2. **Live constraints and planning context require different contracts.** NWS,
   CPHC, PTWC, WFIGS, gauges, closures, and county orders may change an action
   now. DFIRM, tsunami zones, ACS, SVI, emPOWER, and historical risk explain
   exposure and resource needs but cannot by themselves declare a route safe.
3. **The highest-value P0 set is small.** NWS alerts, CPHC advisories, PTWC
   products, State tsunami/DFIRM geometry, HDOT planned closures, and ACS each
   enable a concrete resident or planning decision and have machine-readable
   access.
4. **Equity data must remain aggregate.** ACS, SVI, and emPOWER support
   translation, accessible transport, power, and outreach planning; they must
   not become inferred household profiles.
5. **Every response needs provenance and freshness.** Store source ID, authority,
   source update time, retrieval time, validity interval, and freshness status.
   A missing or stale feed must be visible rather than converted into a
   reassuring default.

### Phased source decision

| Phase                       | Integrate or prepare                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **P0**                      | NWS alerts; CPHC hurricane products; PTWC tsunami products; State tsunami zones and DFIRM; FEMA open shelters; HDOT planned closures; ACS. |
| **P1**                      | USGS gauges; WFIGS incidents/perimeters; verified island transit feeds; HHS emPOWER; CDC SVI; county shelter/resource adapters.            |
| **P2**                      | FEMA NRI/history; utility outages by agreement; dated DLNR fire-risk context; long-range climate and sea-level-rise analyses.              |
| **Skip as runtime sources** | Geoportal, HAIC Hub, portal HTML scraping, and any application without a supported machine contract.                                       |

## Counter-evidence

The strongest case against broad integration is operational fragility. NWS
does not publish fixed rate limits; NHC calls its GIS products a convenience;
State GIS disclaims positional and thematic accuracy; HDOT planned closures
are weekly rather than emergency status; and county shelter, transit, and
utility ecosystems are fragmented. These constraints rule out a “single
authoritative Hawaiʻi API” architecture and make aggressive scraping or
warehouse ingestion less reliable than source-specific adapters.

## Decision: ADAPT

Build a normalized adapter layer, but integrate only feeds tied to an explicit
decision. P0 establishes live alerting and canonical hazard/planning geometry;
P1 adds observations, wildfire perimeters, transit, AFN/equity, and
county-owned resources; P2 remains optional or agreement-dependent.

## What this means in practice

- **First concrete move:** expose normalized NWS Hawaiʻi alerts and a
  machine-readable source catalog from a Go backend with caching, freshness,
  provenance, stale warnings, and fail-closed behavior.
- **Watch-fors:** undocumented API changes, stale county geometry, missing
  incident perimeters, outer-island transit gaps, and any source whose terms
  prohibit caching or redistribution.
- **Out of scope for this research:**
  - Procuring private utility or county data agreements.
  - Building a historical data warehouse or prediction model.
  - Treating planning layers as live evacuation orders or road closures.

## Open questions / what I'd read next

1. What machine-readable shelter/resource feeds can each county authorize?
2. What official real-time closure feed can HDOT provide beyond planned work?
3. Which outer-island transit agencies publish current, contract-testable GTFS?
4. What cache and redistribution terms apply to each operational feed?
