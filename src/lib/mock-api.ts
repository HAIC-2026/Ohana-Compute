import type { HazardId, LocalReliefStep, PlanningArea } from './mock-data'
import type { AfnPlanningAnalysis } from './planning-analysis'

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

export type AiPlanningContext = {
  area: {
    id: string
    name: string
    island: string
  }
  hazard: HazardId
  severity: number
  exposedPopulation: number
  primarySignal: string
  hotspot: {
    domain: string
    score: number
    level: string
    summary: string
    evidence: string[]
    recommendedAction: string
  } | null
  additionalHotspots: Array<{
    domain: string
    score: number
    recommendedAction: string
  }>
  operationalGaps: AfnPlanningAnalysis['operationalGaps'] | null
  sourceCoverage: AfnPlanningAnalysis['sourceCoverage']
  localSteps: LocalReliefStep[]
}

export type PlanningResponseGenerator = {
  generate: (context: AiPlanningContext) => Promise<PlanningBrief>
}

const wait = (duration: number) =>
  new Promise((resolve) => setTimeout(resolve, duration))

export function buildAiPlanningContext(input: {
  area: PlanningArea
  hazard: HazardId
  severity: number
  exposedPopulation: number
  primarySignal: string
  locationName?: string
  localSteps?: LocalReliefStep[]
  analysis?: AfnPlanningAnalysis
}): AiPlanningContext {
  return {
    area: {
      id: input.area.id,
      name: input.locationName ?? input.area.name,
      island: input.area.island,
    },
    hazard: input.hazard,
    severity: input.severity,
    exposedPopulation: input.exposedPopulation,
    primarySignal: input.primarySignal,
    hotspot: input.analysis
      ? {
          domain: input.analysis.primaryHotspot.domain,
          score: input.analysis.primaryHotspot.score,
          level: input.analysis.primaryHotspot.level,
          summary: input.analysis.primaryHotspot.summary,
          evidence: input.analysis.primaryHotspot.evidence,
          recommendedAction: input.analysis.primaryHotspot.recommendedAction,
        }
      : null,
    additionalHotspots:
      input.analysis?.hotspots.slice(1, 3).map((hotspot) => ({
        domain: hotspot.domain,
        score: hotspot.score,
        recommendedAction: hotspot.recommendedAction,
      })) ?? [],
    operationalGaps: input.analysis?.operationalGaps ?? null,
    sourceCoverage: input.analysis?.sourceCoverage ?? 'unavailable',
    localSteps: input.localSteps ?? [],
  }
}

export const mockPlanningResponseGenerator: PlanningResponseGenerator = {
  async generate(context) {
    await wait(850)
    const hazardNames: Record<HazardId, string> = {
      tsunami: 'tsunami evacuation',
      wildfire: 'wildfire and smoke',
      flood: 'flood isolation',
      hurricane: 'hurricane outage',
    }
    const hotspotAction = context.hotspot?.recommendedAction

    return {
      headline: hotspotAction
        ? `Start in ${context.area.name}: ${hotspotAction.toLowerCase()}`
        : context.localSteps.length > 0
          ? `Start in ${context.area.name}: ${context.localSteps[0].title.toLowerCase()}.`
          : `Start with ${context.primarySignal.toLowerCase()} support in ${context.area.name}.`,
      explanation:
        context.hotspot === null
          ? `The practice map shows about ${context.exposedPopulation.toLocaleString()} people in areas that may be affected by ${hazardNames[context.hazard]}. Use this list as a starting point, then confirm local conditions before sending people or supplies.`
          : `${context.hotspot.domain} is the highest data-derived planning weakness at ${context.hotspot.score}/100. ${context.hotspot.summary} ${context.hotspot.evidence.join(' · ')}. This practice synthesis requires planner confirmation of conditions and assignments.`,
      priorities:
        context.localSteps.length > 0
          ? [
              ...(hotspotAction
                ? [
                    {
                      title: hotspotAction,
                      owner: `${context.area.name} AFN coordination lead`,
                      timing: 'Before local access or services deteriorate',
                    },
                  ]
                : []),
              ...context.localSteps.filter(
                (step) => step.title !== hotspotAction,
              ),
            ].slice(0, 4)
          : [
              {
                title:
                  hotspotAction ??
                  'Confirm who can provide accessible transportation',
                owner: 'AFN coordination lead',
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
      citations: [
        'ACS-2024',
        'SVI-2022',
        'HHS-EMPOWER',
        'FEMA-NRI',
        'STATE-GIS-DEMO',
      ],
    }
  },
}

export async function generatePlanningBrief(
  input: {
    area: PlanningArea
    hazard: HazardId
    severity: number
    exposedPopulation: number
    primarySignal: string
    locationName?: string
    localSteps?: LocalReliefStep[]
    analysis?: AfnPlanningAnalysis
  },
  generator: PlanningResponseGenerator = mockPlanningResponseGenerator,
): Promise<PlanningBrief> {
  return generator.generate(buildAiPlanningContext(input))
}
