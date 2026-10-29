# Forecast-to-plan coordination

Open **Coordinate plan** from `/`, or visit `/coordination`. This is a County
review surface, not an emergency instruction, approved annex or live operations
dashboard.

For authenticated shared requests, provider acceptance, destination confirmation,
escalation and preparedness tasks, use **Staff response workspace** at
`/operations`. See [staff response coordination](operational-coordination.md).
The evidence/annex surface documented here remains separate; its export is not
automatically an operational request.

## Timeline and authority

Choose a County and hazard. The default is explicitly **Practice scenario — not
live**. Only active, fresh, unexpired, hazard-matched statewide official products
can be selected as context. County/multi-County products are not automatically
applied because the current trigger contract does not identify their precise
County applicability. Context never grants authority or activates resources.
Eligibility is rechecked every 30 seconds and on export. Refresh official triggers
to retrieve a new snapshot; unavailable is not an all-clear.

The before/during/after sequence shows County leadership, State ESF-6 (HI-EMA +
DHS) support, partner verification duties and expandable decision points with
evidence and timing. Hurricane 72/48/24-hour checkpoints are practice assumptions,
not official deadlines. Wildfire, local tsunami and flash-flood plans must already
exist; no preparation window is promised. Official protective-action and natural
warning guidance takes precedence over the generic shelter/do-not-drive phase.

## State roll-up and evidence boundary

Four emergency-management jurisdictions are compared using one representative
area-center Census tract each, not County totals. Kalawao is explicitly unknown
and requires special-jurisdiction coordination. Molokaʻi, Lānaʻi, Niʻihau, rural
and off-grid coverage is not established by those four tracts.

The existing versioned resource-demand API is consumed without assuming future
CMIST-model work. Every row uses the same three-day evacuation-shelter assumptions
and an empty supply input: no practice capacity is subtracted from operational
needs. Model ranges, source dates, documented capability associations and unknown
operational gaps stay distinct. Public profile, model and partner failures are
shown and can be retried. No cross-County sum or inferred individual prevalence
is produced.

## Resident reach

The existing Census adapter requests estimates and margins of error for eight
selected 2024 ACS five-year B16001 language groups in the same detailed-table
request. They describe languages spoken at home by people age five and older,
not individual language preferences or an exhaustive translation list.
The grouped Austronesian category cannot be disaggregated into Ilocano, Samoan,
Hawaiian or other languages. Missing/zero estimates never rule out a need.
Metadata: <https://api.census.gov/data/2024/acs/acs5/groups/B16001.json>.

County language-access staff and local organizations must validate languages,
dialects, trusted messengers and actual access arrangements. The plan includes
qualified ASL/captions, accessible text/large print, audio/read-aloud, radio,
print and low-bandwidth community channels. Optional browser read-aloud uses the
device speech capability; it is not an accessible-alert certification.
Life-safety messages are not machine translated. Qualified language and
disability-access review plus County approval are required before release.
Trust-aware wording must not invent immigration, eligibility or confidentiality
promises.

## Unsent annex

**Download unsent AFN annex** writes a local JSON file with schema
`county-afn-annex-draft.v1`: purpose/scope, situation/assumptions, County shelter
plan provenance, aggregate map/needs evidence, model output, sourced partner
matches, timeline/roles/decisions, resident communications, gaps and County review.
This is an ESF-6-style outline, not an official County template. Missing evidence
is exported as null or an explicit gap, never replaced with an invented value.
Approval, operational capacity and activation remain pending. No PII, recipient
registry, auto-send, plan storage or new telemetry dimensions are added.

For a short demo: `/` → **Coordinate plan** → choose **Tsunami** → open **Decision
point & evidence** → scan the County comparison → choose a different County →
review reach gaps → **Download unsent AFN annex**.
