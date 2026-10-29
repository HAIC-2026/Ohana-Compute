# Resource-demand model v0.2

The deterministic Go model extends the existing mass-care calculator. It uses
public, de-identified aggregate inputs and returns low, planning, and high
stress-test values. It does not estimate where an incident will affect people,
forecast actual uptake, issue an evacuation order, allocate resources, or
identify individuals. CMIST categories can overlap and must not be added
together.

## CMIST ranges

Each response contains Communication, Medical, Independence, Safety & support,
and Transportation for each accepted hazard and political county. Missing
indicators or a privacy-masked emPOWER cell keep that category unavailable;
they never become zero.

The model applies the ACS margin-of-error interval to each available input,
then multiplies its low/planning/high values by the category's published
planning fractions and a hazard modifier. The fractions are intentionally
visible and unvalidated:

| CMIST category   | Aggregate input                                | Low / planning / high fractions | Unit and interpretation                                                                          |
| ---------------- | ---------------------------------------------- | ------------------------------: | ------------------------------------------------------------------------------------------------ |
| Communication    | ACS limited-English population                 |                 10% / 20% / 35% | People for interpreter, translated-alert, plain-language, and accessible-format planning         |
| Medical          | Unmasked HHS emPOWER power-dependent DME count |                50% / 75% / 100% | Medicare-only power-dependent people; not all medical need or all ages                           |
| Independence     | ACS population with disability                 |                 10% / 25% / 40% | Accessible sleeping-space and mobility-aid review candidates                                     |
| Safety & support | ACS population below poverty                   |                  5% / 15% / 30% | Broad outreach proxy only; not a measured caregiver or behavioral-health need                    |
| Transportation   | ACS no-vehicle households                      |               50% / 100% / 150% | Household-equivalent accessible-trip planning; not a person count or wheelchair-vehicle estimate |

Hazard modifiers are local model assumptions, not empirically calibrated
exposure multipliers:

| Hazard    | Communication | Medical | Independence | Safety & support | Transportation |
| --------- | ------------: | ------: | -----------: | ---------------: | -------------: |
| Flood     |           1.0 |     1.2 |          1.2 |              1.1 |            1.3 |
| Hurricane |           1.1 |     1.3 |          1.2 |              1.2 |            1.3 |
| Tsunami   |           1.3 |     1.1 |          1.2 |              1.3 |            1.4 |
| Wildfire  |           1.2 |     1.4 |          1.3 |              1.2 |            1.3 |

The frontend shows each modeled range, basis, and needed capability beside the
category, with a compatible supply unit and a concrete County or partner
validation question. CMIST supply is shown as unknown: the model has no
County-published or matched partner supply for these domains, so nothing is
subtracted and no CMIST gap is calculated. The evidence disclosure lists every
returned assumption with its readable unit and values, and explains that
low/planning/high values are stress-test bounds rather than statistical
confidence intervals. These screening estimates prompt State ESF-6 and County
partners to validate interpreters, accessible formats, medications and
refrigeration, power, accessible cots and mobility aids, caregiver and
behavioral-health support, and accessible transport seats. They are not
validated operational requirement rates or operational requests.

## Separate demand lines

**Visitors.** The 2025 DBEDT Annual Visitor Research Report Table 8 provides an
average daily census by island for arrivals by air: Oʻahu 107,479; Maui 54,500;
Molokaʻi 385; Lānaʻi 406; Kauaʻi 28,577; Hawaiʻi Island 35,640. The model
applies the 11% / 23% / 35% mass-care scenario envelope to this island census
as a visitor shelter-and-feeding stress test. It is not a stranded-person
count, hazard exposure estimate, or cruise census. Molokaʻi and Lānaʻi counts
remain island-scoped and are not apportioned to a County; Niʻihau is
unavailable.

Source: [DBEDT 2025 Annual Visitor Research Report workbook](https://files.hawaii.gov/dbedt/economic/tourism/annual-reports/2025-annual-visitor.xlsx),
Table 8, 2025 data. The [annual reports index](https://dbedt.hawaii.gov/economic/tourism/annual-reports/)
provides publication context.

**People experiencing homelessness.** The model applies the same stress-test
envelope to one-night 2026 Point-in-Time counts: Oʻahu 4,539; Hawaiʻi Island
696; Kauaʻi 516; Maui County 651. The count was for the night of January 25, 2026. This is a separate reference cohort, not a hazard-exposure estimate or
an additive population total. Maui County's published figure includes its
reported Molokaʻi count; Kalawao has no separate published count and remains
unavailable.

Sources: [Hawaiʻi DHS PIT report index](https://humanservices.hawaii.gov/annual-homeless-persons-point-in-time-count-pit-report/)
and the [2026 Bridging the Gap Neighbor Island PIT report](https://www.btghawaii.org/media/uploads/2026_btg_pit_report_final.pdf).
The Oʻahu report is linked from the DHS index.

**Pets and service animals.** The pet-sheltering line uses the ACS local
household estimate and margin of error, a national 71.6% pet-owning-household
assumption, and the 11% / 23% / 35% mass-care envelope. The rate is derived,
not directly reported by APPA: 95 million U.S. pet-owning households in APPA's
2025 National Pet Owners Survey divided by 132,737,144 U.S. households in the
2024 ACS 1-year estimate. One animal space per pet-owning household is an
additional planning assumption, not a Hawaiʻi survey or an animal count.

Sources: [APPA 2025 National Pet Owners Survey statistics](https://americanpetproducts.org/industry-trends-and-stats)
and [ACS 2024 Table B11001](https://data.census.gov/table/ACSDT1Y2024.B11001?g=010XX00US).
Service animals are not included in pet demand; plan access and arrangements
with the handler and validate shelter policy using [U.S. DOJ ADA guidance](https://www.ada.gov/resources/service-animals-2010-requirements/).
No service-animal population estimate is asserted.

**Power continuity.** For an unmasked emPOWER count, `beneficiary-hours =
beneficiaries × outage-hours`. The planner selects the central outage window;
the model uses half-duration and double-duration bounds. Device-hours are
planning estimates for charging, generator, and cooling-site screening, not
Beneficiary-hours are a planning estimate for charging, generator, and
cooling-site screening; they are not device-hours, generator kilowatts,
equipment inventory, or verified site demand. A masked or unavailable source
produces no numeric result. emPOWER covers Medicare
beneficiaries and is not a person-level registry.

**Shelter capacity.** County-published current capacity and openings were not
found in the reviewed public planning references. The API returns
`county_capacity.status = not_published`, omits a numeric capacity, and leaves
the capacity-gap line unavailable. Confirmed practice supply remains a
separate fixture and is never represented as County-published capacity.

## Geography, sources, and validation gaps

Accepted county identifiers are `honolulu`, `maui`, `hawaii`, `kauai`, and
`kalawao`; accepted hazards are `hurricane`, `flood`, `tsunami`, and `wildfire`.
Kalawao remains a separate political county even though emergency-management
scope combines it with Maui. County-level PIT or shelter capacity is not
fabricated for Kalawao. Community ACS estimates are for the selected aggregate
Census tract, not countywide residents. Visitor census is island-scoped.
Geographic levels remain labeled separately.

External sources carry a data date, URL, review date, and freshness window in
the API response. Planner-model coefficients are labeled as assumptions, not
external observations. The main validation gaps for State ESF-6 and partners
are incident-specific exposure, local need coefficients, all-age power
dependency, equipment load and runtime, current County shelter capacity,
accessible vehicle inventory, service-animal accommodations, and small-area
data quality.
