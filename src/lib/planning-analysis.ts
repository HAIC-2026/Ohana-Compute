import type { CommunityProfile } from './community-profile'
import type {
  HazardId,
  LocalResourceSite,
  LocalRouteCheck,
  PlanningArea,
  ScenarioView,
} from './mock-data'

export type AfnPlanningDomain =
  'Communication' | 'Medical' | 'Independence' | 'Safety' | 'Transportation'

export type AfnPlanningWeakness = {
  domain: AfnPlanningDomain
  score: number
  level: 'monitor' | 'high' | 'critical'
  summary: string
  evidence: string[]
  recommendedAction: string
}

export type AfnPlanningAnalysis = {
  areaId: string
  areaName: string
  island: string
  hazard: HazardId
  exposedPopulation: number
  sourceCoverage: 'complete' | 'partial' | 'unavailable'
  unavailableSources: string[]
  operationalGaps: {
    resourcesNeedingConfirmation: number
    totalResources: number
    routesNeedingConfirmation: number
    totalRoutes: number
    sheltersWithBackupPower: number
    totalShelters: number
  }
  weaknesses: AfnPlanningWeakness[]
  hotspots: AfnPlanningWeakness[]
  primaryHotspot: AfnPlanningWeakness
}

type AnalyzeAfnPlanningInput = {
  area: PlanningArea
  hazard: HazardId
  scenario: ScenarioView
  profile: CommunityProfile | null
  resources: LocalResourceSite[]
  routes: LocalRouteCheck[]
}

type Signal = {
  value: number | null | undefined
  weight: number
}

const sourceLabels = [
  ['Census ACS', 'acs'],
  ['CDC/ATSDR SVI', 'svi'],
  ['HHS emPOWER', 'empower'],
  ['FEMA National Risk Index', 'fema_national_risk'],
] as const

const riskScores: Record<string, number> = {
  'Very High': 100,
  'Relatively High': 82,
  'Relatively Moderate': 58,
  'Relatively Low': 28,
  'Very Low': 12,
}

const resilienceDeficitScores: Record<string, number> = {
  'Very Low': 100,
  'Relatively Low': 82,
  'Relatively Moderate': 58,
  'Relatively High': 28,
  'Very High': 12,
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function thresholdScore(
  value: number | null | undefined,
  highThreshold: number,
) {
  if (value === null || value === undefined || !Number.isFinite(value))
    return null
  return clamp((value / highThreshold) * 100)
}

function weightedScore(signals: Signal[], uncertaintyPenalty: number) {
  const availableSignals = signals.filter(
    (signal): signal is { value: number; weight: number } =>
      signal.value !== null &&
      signal.value !== undefined &&
      Number.isFinite(signal.value),
  )
  const totalWeight = availableSignals.reduce(
    (total, signal) => total + signal.weight,
    0,
  )
  if (totalWeight === 0) return clamp(uncertaintyPenalty)
  const score =
    availableSignals.reduce(
      (total, signal) => total + clamp(signal.value) * signal.weight,
      0,
    ) / totalWeight
  return clamp(score + uncertaintyPenalty)
}

function metricPercent(
  metric:
    { estimate: number | null; percent?: number | null } | null | undefined,
) {
  return metric?.percent ?? null
}

function countRate(
  value: number | null | undefined,
  population: number | null | undefined,
  perPopulation = 1000,
) {
  if (
    value === null ||
    value === undefined ||
    population === null ||
    population === undefined ||
    population <= 0
  )
    return null
  return (value / population) * perPopulation
}

function cmistScore(scenario: ScenarioView, domain: AfnPlanningDomain) {
  return scenario.cmist.find((item) => item.category === domain)?.value ?? 0
}

function levelForScore(score: number): AfnPlanningWeakness['level'] {
  if (score >= 85) return 'critical'
  if (score >= 70) return 'high'
  return 'monitor'
}

function percentEvidence(value: number | null | undefined, label: string) {
  return value === null || value === undefined
    ? null
    : `${value.toFixed(1)}% ${label}`
}

function buildWeakness(
  domain: AfnPlanningDomain,
  score: number,
  summary: string,
  recommendedAction: string,
  evidence: Array<string | null>,
): AfnPlanningWeakness {
  return {
    domain,
    score,
    level: levelForScore(score),
    summary,
    recommendedAction,
    evidence: evidence.filter((item): item is string => Boolean(item)),
  }
}

export function analyzeAfnPlanning({
  area,
  hazard,
  scenario,
  profile,
  resources,
  routes,
}: AnalyzeAfnPlanningInput): AfnPlanningAnalysis {
  const unavailableSources = sourceLabels
    .filter(([, key]) => !profile?.[key])
    .map(([label]) => label)
  const sourceCoverage =
    unavailableSources.length === 0
      ? 'complete'
      : unavailableSources.length === sourceLabels.length
        ? 'unavailable'
        : 'partial'
  const uncertaintyPenalty =
    sourceCoverage === 'unavailable' ? 12 : sourceCoverage === 'partial' ? 6 : 0

  const planningPopulation =
    profile?.acs?.population.estimate ?? profile?.svi?.population ?? null
  const sviPopulation = profile?.svi?.population ?? planningPopulation
  const disabilityPercent = metricPercent(
    profile?.acs?.population_with_disability,
  )
  const limitedEnglishPercent = metricPercent(
    profile?.acs?.limited_english_population,
  )
  const noVehiclePercent = metricPercent(profile?.acs?.no_vehicle_households)
  const povertyPercent = metricPercent(profile?.acs?.population_below_poverty)
  const age65Percent =
    countRate(profile?.svi?.age_65_or_older, sviPopulation, 100) ?? null
  const dmePerThousand = countRate(
    profile?.empower?.any_healthcare_service_any_dme.value,
    planningPopulation,
  )
  const powerDmePerThousand = countRate(
    profile?.empower?.power_dependent_dme.value,
    planningPopulation,
  )

  const shelters = resources.filter((resource) => resource.kind === 'shelter')
  const transportTeams = resources.filter(
    (resource) => resource.kind === 'transport',
  )
  const backupPowerCoverage =
    shelters.length === 0
      ? 0
      : (shelters.filter((resource) =>
          resource.capabilities.includes('Backup power'),
        ).length /
          shelters.length) *
        100
  const languageCoverage =
    shelters.length === 0
      ? 0
      : (shelters.filter((resource) =>
          resource.capabilities.includes('Language assistance'),
        ).length /
          shelters.length) *
        100
  const routeGapPercent =
    routes.length === 0
      ? 100
      : (routes.filter((route) => route.status === 'needs-confirmation')
          .length /
          routes.length) *
        100
  const transportConfirmationGap =
    transportTeams.length === 0
      ? 100
      : (transportTeams.filter((team) => team.status === 'needs-confirmation')
          .length /
          transportTeams.length) *
        100
  const shelterCapacity =
    shelters.reduce((total, shelter) => total + shelter.capacity, 0) /
    Math.max(1, scenario.exposedPopulation)
  const shelterCapacityGap = clamp(100 - shelterCapacity * 500)
  const readinessGap = 100 - scenario.readiness

  const communicationScore = weightedScore(
    [
      { value: cmistScore(scenario, 'Communication'), weight: 0.4 },
      {
        value: thresholdScore(limitedEnglishPercent, 20),
        weight: 0.35,
      },
      { value: 100 - languageCoverage, weight: 0.25 },
    ],
    uncertaintyPenalty,
  )
  const medicalScore = weightedScore(
    [
      { value: cmistScore(scenario, 'Medical'), weight: 0.35 },
      { value: thresholdScore(disabilityPercent, 20), weight: 0.2 },
      { value: thresholdScore(dmePerThousand, 40), weight: 0.2 },
      { value: thresholdScore(powerDmePerThousand, 12), weight: 0.1 },
      { value: 100 - backupPowerCoverage, weight: 0.15 },
    ],
    uncertaintyPenalty,
  )
  const independenceScore = weightedScore(
    [
      { value: cmistScore(scenario, 'Independence'), weight: 0.4 },
      { value: thresholdScore(disabilityPercent, 20), weight: 0.25 },
      { value: thresholdScore(age65Percent, 25), weight: 0.2 },
      { value: thresholdScore(povertyPercent, 20), weight: 0.15 },
    ],
    uncertaintyPenalty,
  )
  const safetyScore = weightedScore(
    [
      { value: cmistScore(scenario, 'Safety'), weight: 0.3 },
      {
        value:
          (profile?.svi?.overall_percentile ?? null) === null
            ? null
            : (profile?.svi?.overall_percentile ?? 0) * 100,
        weight: 0.2,
      },
      {
        value:
          riskScores[profile?.fema_national_risk?.risk_rating ?? ''] ?? null,
        weight: 0.15,
      },
      {
        value:
          resilienceDeficitScores[
            profile?.fema_national_risk?.community_resilience_rating ?? ''
          ] ?? null,
        weight: 0.15,
      },
      { value: shelterCapacityGap, weight: 0.1 },
      { value: readinessGap, weight: 0.1 },
    ],
    uncertaintyPenalty,
  )
  const transportationScore = weightedScore(
    [
      { value: cmistScore(scenario, 'Transportation'), weight: 0.35 },
      { value: thresholdScore(noVehiclePercent, 20), weight: 0.25 },
      { value: routeGapPercent, weight: 0.25 },
      { value: transportConfirmationGap, weight: 0.15 },
    ],
    uncertaintyPenalty,
  )

  const weaknesses = [
    buildWeakness(
      'Communication',
      communicationScore,
      'Warnings and instructions may not reach every household in a usable format.',
      'Confirm translated, accessible, and redundant warning channels with trusted community messengers.',
      [
        percentEvidence(limitedEnglishPercent, 'limited-English population'),
        `${Math.round(languageCoverage)}% of practice shelters list language assistance`,
        `${cmistScore(scenario, 'Communication')}/100 communication pressure`,
      ],
    ),
    buildWeakness(
      'Medical',
      medicalScore,
      'Medical continuity may fail when power, refrigeration, oxygen, or routine care is disrupted.',
      'Confirm powered shelter capacity, medication refrigeration, oxygen support, and medical-equipment continuity.',
      [
        percentEvidence(disabilityPercent, 'population with disabilities'),
        dmePerThousand === null
          ? null
          : `${dmePerThousand.toFixed(1)} HHS emPOWER health-service/DME count per 1,000 residents`,
        `${Math.round(backupPowerCoverage)}% of practice shelters list backup power`,
      ],
    ),
    buildWeakness(
      'Independence',
      independenceScore,
      'Daily-living support and continuity of care may be strained during displacement or isolation.',
      'Confirm mobility, caregiver, medication, and daily-living support for residents who cannot relocate independently.',
      [
        percentEvidence(disabilityPercent, 'population with disabilities'),
        percentEvidence(age65Percent, 'population age 65 or older'),
        percentEvidence(povertyPercent, 'population below poverty'),
      ],
    ),
    buildWeakness(
      'Safety',
      safetyScore,
      'Shelter capacity and community resilience may be insufficient for the modeled exposure.',
      'Verify safe shelter capacity, protective actions, and neighborhood-level fallback sites before conditions worsen.',
      [
        `${Math.round(shelterCapacity * 100)} practice shelter spaces per 100 exposed residents`,
        profile?.fema_national_risk?.risk_rating
          ? `${profile.fema_national_risk.risk_rating} national risk rating`
          : null,
        profile?.fema_national_risk?.community_resilience_rating
          ? `${profile.fema_national_risk.community_resilience_rating} community resilience`
          : null,
      ],
    ),
    buildWeakness(
      'Transportation',
      transportationScore,
      'Residents may be unable to reach safe locations before routes close or congestion builds.',
      'Confirm no-vehicle pickup capacity, accessible transportation, and alternate routes before movement begins.',
      [
        percentEvidence(noVehiclePercent, 'households without a vehicle'),
        `${Math.round(routeGapPercent)}% of practice routes need confirmation`,
        `${Math.round(transportConfirmationGap)}% of practice transport teams need confirmation`,
      ],
    ),
  ].sort((first, second) => second.score - first.score)

  const hotspots = weaknesses.filter((weakness) => weakness.score >= 70)

  return {
    areaId: area.id,
    areaName: area.name,
    island: area.island,
    hazard,
    exposedPopulation: scenario.exposedPopulation,
    sourceCoverage,
    unavailableSources,
    operationalGaps: {
      resourcesNeedingConfirmation: resources.filter(
        (resource) => resource.status === 'needs-confirmation',
      ).length,
      totalResources: resources.length,
      routesNeedingConfirmation: routes.filter(
        (route) => route.status === 'needs-confirmation',
      ).length,
      totalRoutes: routes.length,
      sheltersWithBackupPower: shelters.filter((resource) =>
        resource.capabilities.includes('Backup power'),
      ).length,
      totalShelters: shelters.length,
    },
    weaknesses,
    hotspots: hotspots.length > 0 ? hotspots : weaknesses.slice(0, 1),
    primaryHotspot: weaknesses[0],
  }
}
