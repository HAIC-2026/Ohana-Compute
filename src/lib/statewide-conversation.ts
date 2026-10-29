import { areas } from './mock-data'
import type { GeographicFocus } from './geographic-focus'

export const statewidePlanningAreas = areas.filter(
  (area) => area.showOnStatewideMap !== false,
)
export const planningIslands = Array.from(
  new Set(statewidePlanningAreas.map((area) => area.island)),
)
export const statewidePrompts = [
  'Choose a planning area',
  'What evidence is missing?',
  'Prepare County questions',
  'Recommend next step',
] as const

export const decisionActions = {
  'choose-area': 'Choose a planning area',
  'review-evidence': 'Review evidence and gaps',
  'county-questions': 'Prepare County questions',
  compare: 'Compare locations on this island',
} as const

type DecisionAction = keyof typeof decisionActions
type PlanningDecision = {
  rule: 'choose-scope' | 'verify-evidence' | 'combined-signals' | 'local-review'
  title: string
  rationale: string
  evidence: string
  primary: DecisionAction
  alternative: DecisionAction | null
}

export function recommendPlanningStep(
  statewide: boolean,
  focus?: GeographicFocus,
): PlanningDecision {
  if (statewide)
    return {
      rule: 'choose-scope',
      title: 'Choose a community before drawing local conclusions',
      rationale:
        'There is no comparable statewide exposure or operational-capacity model here. Start with a supported community and check its public evidence.',
      evidence: 'No local evidence is used while the scope is statewide.',
      primary: 'choose-area',
      alternative: 'county-questions',
    }
  if (
    !focus ||
    focus.tier === 'verify' ||
    focus.signals.sviPercentile === null ||
    focus.signals.hazard === 'unknown'
  )
    return {
      rule: 'verify-evidence',
      title: 'Resolve evidence gaps before setting a local priority',
      rationale:
        focus?.reason ?? 'Local screening evidence has not been evaluated.',
      evidence: focus?.evidence ?? 'Local evidence unavailable.',
      primary: 'review-evidence',
      alternative: 'county-questions',
    }
  if (focus.tier === 'review-first')
    return {
      rule: 'combined-signals',
      title: 'Bring the combined screening signals to County review',
      rationale: focus.reason,
      evidence: focus.evidence,
      primary: 'county-questions',
      alternative: 'compare',
    }
  return {
    rule: 'local-review',
    title: 'Compare local evidence before choosing a planning focus',
    rationale: `${focus.reason} Not meeting both review-first signals is not an all-clear.`,
    evidence: focus.evidence,
    primary: 'compare',
    alternative: 'county-questions',
  }
}

function normalized(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036fʻ’']/g, '')
    .replace(/[?.!]$/, '')
}
export function interpretStatewidePrompt(value: string) {
  if (value.length > 256) return null
  const text = normalized(value)
  const prompt = statewidePrompts.find((item) => normalized(item) === text)
  if (prompt) return { type: 'question' as const, prompt }
  if (text === 'statewide' || text === 'show all islands')
    return { type: 'statewide' as const }
  const place = text.replace(/^(?:focus on|explore|show) /, '')
  const island = planningIslands.find((item) => normalized(item) === place)
  if (island) return { type: 'island' as const, island }
  const area = statewidePlanningAreas.find(
    (item) => normalized(item.name) === place,
  )
  if (area) return { type: 'area' as const, id: area.id }
  return null
}
