import type { HazardId, LocalReliefStep, PlanningArea } from './mock-data'

export type PlanningBrief = {
  headline: string
  explanation: string
  priorities: Array<{
    title: string
    owner: string
    timing: string
  }>
  citations: string[]
}

const wait = (duration: number) =>
  new Promise((resolve) => setTimeout(resolve, duration))

export async function generatePlanningBrief(input: {
  area: PlanningArea
  hazard: HazardId
  severity: number
  exposedPopulation: number
  primarySignal: string
  locationName?: string
  localContext?: string
  localSteps?: LocalReliefStep[]
}): Promise<PlanningBrief> {
  await wait(850)

  const hazardNames: Record<HazardId, string> = {
    tsunami: 'tsunami evacuation',
    wildfire: 'wildfire and smoke',
    flood: 'flood isolation',
    hurricane: 'hurricane outage',
  }

  return {
    headline: input.localSteps?.[0]
      ? `Start in ${input.locationName ?? input.area.name}: ${input.localSteps[0].title.toLowerCase()}.`
      : `Start with ${input.primarySignal.toLowerCase()} support in ${input.locationName ?? input.area.name}.`,
    explanation:
      input.localContext ??
      `The practice map shows about ${input.exposedPopulation.toLocaleString()} people in areas that may be affected by ${hazardNames[input.hazard]}. Use this list as a starting point, then confirm local conditions before sending people or supplies.`,
    priorities: input.localSteps ?? [
      {
        title: 'Confirm who can provide accessible transportation',
        owner: 'Transportation team',
        timing: 'Check now',
      },
      {
        title: 'Check backup power at shelters and care sites',
        owner: 'Shelter team',
        timing: 'Before opening',
      },
      {
        title: 'Share clear updates in the languages people use',
        owner: 'Public information team',
        timing: 'As soon as possible',
      },
    ],
    citations: ['ACS-2024', 'SVI-2022', 'EMPOWER-DEMO', 'STATE-GIS-DEMO'],
  }
}
