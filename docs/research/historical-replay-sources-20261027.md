# Hawaiʻi historical replay source review — 2026-10-27

## Research question

Which official aggregate Hawaiʻi incident reports, public datasets, and
exercises provide enough defensible evidence to replay representative flood,
wildfire, hurricane, tsunami/earthquake, and volcanic planning conditions
without inventing operational outcomes or using person-level data?

## Method and verification limit

The requested installed `research` skill was unavailable in this runtime. A
time-boxed research agent and direct web search were used instead. Direct
source retrieval was retried with `curl`, but this execution host could not
resolve the official domains. The catalog therefore freezes no newly derived
incident counts. It uses official source references and bounded qualitative
domains only, with unsupported numeric, legal, route, partner, shelter, and
person-level assertions explicitly unavailable.

Before a future fixture adds an exact historical number, a reviewer must fetch
the primary source directly and record the cited page/table.

## Decisions

| Candidate                                         | Official authority and URL                                                                                                                                                                               | Decision                                                                                             | Supported use                                                                                                         | Steelmanned limitation                                                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 2023 Lahaina wildfire Phase Two incident analysis | Hawaiʻi Department of the Attorney General / FSRI: <https://fsri.org/resource/phase-two-lahaina-fire-incident-analysis-report>                                                                           | **ADOPT** published coordination domains; **ADAPT** mutable FEMA recovery totals                     | Aggregate warning, communication, road-network, infrastructure, and coordination gaps                                 | Investigatory analysis is not a measured time series or proof of historical correctness. Raw evidentiary material is excluded. |
| 2018 Kīlauea LERZ eruption and summit collapse    | USGS HVO OFR 2020-1041: <https://pubs.usgs.gov/publication/ofr20201041>                                                                                                                                  | **ADOPT** chronology/geologic domains; **FURTHER-RESEARCH** section-level coordination claims        | Stable geologic chronology, aggregate structural/geographic effects, M6.9 trigger, USGS alert/County order separation | Rural LERZ event does not represent every summit or urban volcanic condition.                                                  |
| April 2018 Kauaʻi/Oʻahu record flood              | NOAA/NWS Honolulu: <https://www.weather.gov/hfo/RecordKauaiandOahuRainfallAndFlooding-April2018>; Hawaiʻi DOH CASPER: <https://health.hawaii.gov/kauai/files/2018/11/Kauai-CASPER-2018-Final-Report.pdf> | **ADOPT** rainfall/trigger evidence; **ADAPT** live NCEI data; **FURTHER-RESEARCH** urban comparator | Rainfall/flash-flood chronology, corridor isolation, stale aggregate preparedness themes                              | North Shore rural conditions cannot be generalized statewide; exact damage/demand fields were not verified.                    |
| 2018 Hurricane Lane                               | NOAA NHC/CPHC TCR: <https://www.nhc.noaa.gov/data/tcr/EP142018_Lane.pdf>                                                                                                                                 | **ADOPT** rainfall/flood analog; **FURTHER-RESEARCH** ʻIniki wind/surge analog                       | Storm chronology, rainfall/stream-gauge and access domains, advisory/order separation                                 | Lane did not make landfall and cannot validate a wind/surge scenario.                                                          |
| Pacific Wave / ITIC tsunami exercise              | NOAA/PTWC: <https://www.tsunami.gov/>                                                                                                                                                                    | **FURTHER-RESEARCH** public AAR/IP; **ADAPT** as clearly synthetic exercise                          | Controlled statewide warning-flow and SOP training only                                                               | No stable public numbered Hawaiʻi AAR/IP was verified; no real outcome may be inferred.                                        |
| 2018 Kīlauea M6.9 earthquake                      | USGS OFR above                                                                                                                                                                                           | **ADOPT** minimal observed trigger; **FURTHER-RESEARCH** standalone earthquake case                  | Magnitude/date/scientific trigger within the volcanic fixture                                                         | Embedded earthquake evidence is too narrow for a standalone statewide earthquake outcome fixture.                              |
| Makani Pāhili hurricane exercise                  | HI-EMA: <https://dod.hawaii.gov/blog/exercise-makani-pahili/>                                                                                                                                            | **FURTHER-RESEARCH**                                                                                 | Confirms an exercise program exists                                                                                   | No public numbered AAR/IP was verified, so it was not used as fixture truth.                                                   |

## Supporting aggregate datasets

- NOAA NCEI Storm Events: <https://www.ncei.noaa.gov/stormevents/> — **ADAPT**;
  query for reviewed event facts rather than freezing secondary summaries.
- FEMA disaster pages, including DR-4382 and DR-4724 — **ADAPT**; assistance
  totals are mutable and may support bounded direction only.
- Census ACS, CDC/ATSDR SVI, and HHS emPOWER — **ADOPT** under the repository's
  existing aggregate/privacy decisions. emPOWER masked values remain masked.

## Result

The five implemented fixtures cover hurricane, tsunami/earthquake, flood,
wildfire, and volcanic planning across Oʻahu, Maui, Hawaiʻi, and Kauaʻi. Only
the tsunami fixture uses controlled synthetic demand. Historical fixtures do
not reconstruct demand, shelter status, route passability, partner activation,
evacuation authority, casualties, or individual outcomes.
