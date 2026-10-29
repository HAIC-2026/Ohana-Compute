import type { HazardId } from './mock-data'
import type { AggregateMetric, CommunitySource } from './community-profile'
import type { ResourceDemandRange } from './resource-demand'

export const whatIfVersion = 'afn-what-if.v1'
export type ScenarioDrivers = {
  hazard: HazardId
  warningHours: number
  outageDays: number
  shelterUptake: number
  supportDays: number
}
export const defaultScenario: ScenarioDrivers = {
  hazard: 'hurricane',
  warningHours: 24,
  outageDays: 3,
  shelterUptake: 10,
  supportDays: 3,
}
export const scenarioBounds = {
  warningHours: [0, 168],
  outageDays: [0, 30],
  shelterUptake: [0, 100],
  supportDays: [1, 30],
} as const
export function validScenario(scenario: ScenarioDrivers) {
  return (
    ['hurricane', 'tsunami', 'wildfire', 'flood'].includes(scenario.hazard) &&
    Object.entries(scenarioBounds).every(([key, [min, max]]) => {
      const value = scenario[key as keyof typeof scenarioBounds]
      return Number.isFinite(value) && value >= min && value <= max
    })
  )
}
export function currentSource(source?: CommunitySource, now = Date.now()) {
  return (
    source?.status === 'fresh' &&
    (!source.fresh_until ||
      (Number.isFinite(Date.parse(source.fresh_until)) &&
        Date.parse(source.fresh_until) > now))
  )
}
function scale(range: ResourceDemandRange, factor: number) {
  return {
    low: Math.ceil(range.low * factor),
    planning: Math.ceil(range.planning * factor),
    high: Math.ceil(range.high * factor),
  }
}
export function modelWhatIf(
  population: AggregateMetric | undefined,
  source: CommunitySource | undefined,
  scenario: ScenarioDrivers,
  mealStock: number | null = null,
  now = Date.now(),
) {
  if (!validScenario(scenario)) throw new Error('Invalid scenario drivers')
  if (
    mealStock !== null &&
    (!Number.isSafeInteger(mealStock) || mealStock < 0 || mealStock > 1e9)
  )
    throw new Error('Invalid practice meal stock')
  const estimate = population?.estimate
  const moe = population?.margin_of_error
  if (
    !currentSource(source, now) ||
    estimate == null ||
    !Number.isFinite(estimate) ||
    estimate <= 0 ||
    moe == null ||
    !Number.isFinite(moe) ||
    moe < 0
  )
    return null
  const people = scale(
    {
      low: Math.max(0, estimate - moe),
      planning: estimate,
      high: estimate + moe,
    },
    scenario.shelterUptake / 100,
  )
  const meals = scale(people, scenario.supportDays * 3)
  const water = scale(people, scenario.supportDays)
  const poweredDays = scale(people, scenario.outageDays)
  const outageBeyondSupport = scale(
    people,
    Math.max(0, scenario.outageDays - scenario.supportDays),
  )
  return {
    people,
    meals,
    water,
    poweredDays,
    outageBeyondSupport,
    mealGap:
      mealStock === null
        ? null
        : {
            low: Math.max(0, meals.low - mealStock),
            planning: Math.max(0, meals.planning - mealStock),
            high: Math.max(0, meals.high - mealStock),
          },
  }
}

export function scenarioSensitivity(
  population: AggregateMetric | undefined,
  source: CommunitySource | undefined,
  scenario: ScenarioDrivers,
  mealStock: number | null,
) {
  const now = Date.now()
  const baseline = modelWhatIf(population, source, scenario, mealStock, now)
  if (!baseline) return []
  const value = (model: NonNullable<typeof baseline>) =>
    (model.mealGap ?? model.meals).planning
  const variants = [
    {
      label: 'Shelter uptake +5 percentage points',
      scenario: {
        ...scenario,
        shelterUptake: Math.min(100, scenario.shelterUptake + 5),
      },
    },
    {
      label: 'Support +1 day',
      scenario: {
        ...scenario,
        supportDays: Math.min(30, scenario.supportDays + 1),
      },
    },
    {
      label: 'Outage +1 day (no meal multiplier)',
      scenario: {
        ...scenario,
        outageDays: Math.min(30, scenario.outageDays + 1),
      },
    },
    {
      label: 'Warning +1 hour (no meal multiplier)',
      scenario: {
        ...scenario,
        warningHours: Math.min(168, scenario.warningHours + 1),
      },
    },
  ]
  return variants
    .map((variant) => ({
      label: variant.label,
      delta:
        value(
          modelWhatIf(population, source, variant.scenario, mealStock, now)!,
        ) - value(baseline),
    }))
    .sort((a, b) => b.delta - a.delta)
}
