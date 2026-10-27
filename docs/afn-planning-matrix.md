# AFN planning test matrix

The planner ranks access and functional needs (AFN) weaknesses before drafting
a response checklist. Hotspot selection is deterministic and explainable; the
mock AI boundary only converts the ranked aggregate analysis into draft
planning language.

## What the matrix covers

`tests/planning-matrix-cases.ts` defines representative cases across Oʻahu,
Maui, Hawaiʻi, and Kauaʻi. The current matrix exercises tsunami, hurricane,
wildfire, and flood scenarios with different:

- Disability, older-adult, limited-English, no-vehicle, poverty, and
  medical-equipment aggregate profiles.
- CMIST pressure from the selected area, hazard, and severity.
- Practice shelter capacity, backup-power, and language-assistance coverage.
- Accessible-transport confirmation and route-validation gaps.
- Social vulnerability, national risk, community resilience, and missing-source
  states.

Each case declares the expected primary weakness, minimum score, and a required
evidence phrase. Run it with:

```bash
npm run test:matrix
```

## Scoring and thresholds

`src/lib/planning-analysis.ts` evaluates five bounded domains:

| Domain         | Main evidence                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------- |
| Communication  | CMIST communication pressure, limited-English percentage, language-assistance coverage            |
| Medical        | CMIST medical pressure, disability percentage, HHS emPOWER equipment rates, backup-power coverage |
| Independence   | CMIST independence pressure, disability, older-adult, and poverty percentages                     |
| Safety         | CMIST safety pressure, SVI, national risk, community resilience, shelter capacity, readiness      |
| Transportation | CMIST transportation pressure, no-vehicle percentage, route gaps, transport-team confirmation     |

Scores are normalized to `0–100`. A score of `70–84` is **high** and `85–100`
is **critical**. Missing official sources add a small uncertainty penalty and
remain explicitly listed; missing data never becomes a reassuring zero.

These are prototype planning thresholds, not eligibility rules, predictions,
or person-level risk classifications. County and State planners must validate
the weights and thresholds before operational use.

## Mock AI boundary

`buildAiPlanningContext` creates the only object supplied to a planning-response
generator. It contains controlled area/island/hazard fields, aggregate hotspot
scores and evidence, source coverage, and pre-defined planning actions. It
does not contain:

- Coordinates, resident addresses, or input values.
- Names, user identifiers, or person-level records.
- Raw upstream errors or URLs.
- Free-form resident text.

Tests inject a capturing `PlanningResponseGenerator` and assert the exact
bounded context. The default mock generator remains deterministic and labels
its output as a draft requiring planner confirmation.

## Adding a case

1. Add a profile with `buildCommunityProfile`.
2. Select an existing planning area, hazard, and severity.
3. Adjust practice resources or routes only when the scenario is intended to
   test that gap.
4. Declare the expected primary domain, minimum score, and evidence phrase.
5. Run `npm run test:matrix` and review whether the evidence explains the
   result rather than merely matching a score.
