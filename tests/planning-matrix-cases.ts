import type { CommunityProfile } from '../src/lib/community-profile'
import type {
  HazardId,
  LocalResourceSite,
  LocalRouteCheck,
} from '../src/lib/mock-data'

type ProfileOverrides = {
  disabilityPercent?: number
  limitedEnglishPercent?: number
  noVehiclePercent?: number
  povertyPercent?: number
  age65Percent?: number
  dmePerThousand?: number
  powerDmePerThousand?: number
  sviPercentile?: number
  riskRating?: string
  resilienceRating?: string
  omit?: Array<'acs' | 'svi' | 'empower' | 'fema_national_risk'>
}

export type PlanningMatrixCase = {
  name: string
  areaId: string
  hazard: HazardId
  severity: number
  profile: CommunityProfile
  resourceAdjustment?: 'no-language' | 'no-power' | 'constrained-capacity'
  routeAdjustment?: 'all-clear' | 'all-unconfirmed'
  expectedDomain:
    'Communication' | 'Medical' | 'Independence' | 'Safety' | 'Transportation'
  minimumScore: number
  evidencePhrase: string
}

const source = {
  id: 'planning-matrix',
  authority: 'Deterministic aggregate test fixture',
  status: 'fresh' as const,
}

function metric(population: number, percent: number) {
  return {
    estimate: Math.round((population * percent) / 100),
    margin_of_error: 0,
    percent,
    percent_margin_of_error: 0,
  }
}

export function buildCommunityProfile(
  overrides: ProfileOverrides = {},
): CommunityProfile {
  const population = 10_000
  const disabilityPercent = overrides.disabilityPercent ?? 12
  const limitedEnglishPercent = overrides.limitedEnglishPercent ?? 8
  const noVehiclePercent = overrides.noVehiclePercent ?? 8
  const povertyPercent = overrides.povertyPercent ?? 10
  const age65Percent = overrides.age65Percent ?? 16
  const dmePerThousand = overrides.dmePerThousand ?? 20
  const powerDmePerThousand = overrides.powerDmePerThousand ?? 5
  const omitted = new Set(overrides.omit ?? [])
  const profile: CommunityProfile = {
    disclaimer: 'Aggregate deterministic planning fixture.',
  }

  if (!omitted.has('acs')) {
    profile.acs = {
      geography: { name: 'Aggregate planning geography' },
      population: {
        estimate: population,
        margin_of_error: 0,
      },
      no_vehicle_households: metric(population, noVehiclePercent),
      limited_english_population: metric(population, limitedEnglishPercent),
      population_with_disability: metric(population, disabilityPercent),
      population_below_poverty: metric(population, povertyPercent),
      source,
    }
  }

  if (!omitted.has('svi')) {
    profile.svi = {
      location: 'Aggregate planning geography',
      population,
      age_65_or_older: Math.round((population * age65Percent) / 100),
      with_disability: Math.round((population * disabilityPercent) / 100),
      limited_english: Math.round((population * limitedEnglishPercent) / 100),
      no_vehicle_households: Math.round((population * noVehiclePercent) / 100),
      overall_percentile: overrides.sviPercentile ?? 0.45,
      housing_transportation_percentile: 0.45,
      source,
    }
  }

  if (!omitted.has('empower')) {
    profile.empower = {
      county: 'Aggregate county',
      zip_code: '00000',
      medicare_beneficiaries: {
        value: 1000,
        may_represent_masked_cell: false,
      },
      power_dependent_dme: {
        value: Math.round((population * powerDmePerThousand) / 1000),
        may_represent_masked_cell: false,
      },
      facility_dialysis_any_dme: {
        value: 20,
        may_represent_masked_cell: false,
      },
      oxygen_services_any_dme: {
        value: 40,
        may_represent_masked_cell: false,
      },
      home_health_services_any_dme: {
        value: 50,
        may_represent_masked_cell: false,
      },
      at_home_hospice_any_dme: {
        value: 12,
        may_represent_masked_cell: false,
      },
      any_healthcare_service_any_dme: {
        value: Math.round((population * dmePerThousand) / 1000),
        may_represent_masked_cell: false,
      },
      source,
    }
  }

  if (!omitted.has('fema_national_risk')) {
    profile.fema_national_risk = {
      risk_rating: overrides.riskRating ?? 'Relatively Moderate',
      social_vulnerability_rating: 'Relatively Moderate',
      community_resilience_rating:
        overrides.resilienceRating ?? 'Relatively Moderate',
      source,
    }
  }

  if (omitted.size > 0) {
    profile.source_errors = [...omitted].map((sourceName) => ({
      source: sourceName,
      error: 'fixture-only unavailable source',
    }))
  }

  return profile
}

export function adjustResources(
  resources: LocalResourceSite[],
  adjustment: PlanningMatrixCase['resourceAdjustment'],
) {
  if (!adjustment) return resources
  if (adjustment === 'no-language') {
    return resources.map((resource) => ({
      ...resource,
      capabilities: resource.capabilities.filter(
        (capability) => capability !== 'Language assistance',
      ),
    }))
  }
  if (adjustment === 'no-power') {
    return resources.map((resource) => ({
      ...resource,
      capabilities: resource.capabilities.filter(
        (capability) => capability !== 'Backup power',
      ),
    }))
  }
  return resources.map((resource) =>
    resource.kind === 'shelter'
      ? { ...resource, capacity: Math.min(resource.capacity, 15) }
      : resource,
  )
}

export function adjustRoutes(
  routes: LocalRouteCheck[],
  adjustment: PlanningMatrixCase['routeAdjustment'],
) {
  if (!adjustment) return routes
  return routes.map((route) => ({
    ...route,
    status:
      adjustment === 'all-clear'
        ? ('clear' as const)
        : ('needs-confirmation' as const),
  }))
}

export const planningMatrixCases: PlanningMatrixCase[] = [
  {
    name: 'Koʻolauloa tsunami route isolation',
    areaId: 'oahu-koolauloa',
    hazard: 'tsunami',
    severity: 5,
    profile: buildCommunityProfile({ noVehiclePercent: 29 }),
    routeAdjustment: 'all-unconfirmed',
    expectedDomain: 'Transportation',
    minimumScore: 85,
    evidencePhrase: 'households without a vehicle',
  },
  {
    name: 'Hilo hurricane medical power continuity',
    areaId: 'hawaii-hilo',
    hazard: 'hurricane',
    severity: 5,
    profile: buildCommunityProfile({
      disabilityPercent: 27,
      age65Percent: 25,
      dmePerThousand: 85,
      powerDmePerThousand: 22,
    }),
    resourceAdjustment: 'no-power',
    routeAdjustment: 'all-clear',
    expectedDomain: 'Medical',
    minimumScore: 90,
    evidencePhrase: 'HHS emPOWER health-service/DME count',
  },
  {
    name: 'Maui wildfire daily-living continuity',
    areaId: 'maui-central',
    hazard: 'wildfire',
    severity: 4,
    profile: buildCommunityProfile({
      disabilityPercent: 25,
      age65Percent: 31,
      povertyPercent: 26,
      noVehiclePercent: 4,
    }),
    routeAdjustment: 'all-clear',
    expectedDomain: 'Independence',
    minimumScore: 90,
    evidencePhrase: 'population age 65 or older',
  },
  {
    name: 'Oʻahu Town hurricane language access',
    areaId: 'oahu-town',
    hazard: 'hurricane',
    severity: 4,
    profile: buildCommunityProfile({
      limitedEnglishPercent: 34,
      noVehiclePercent: 3,
    }),
    resourceAdjustment: 'no-language',
    routeAdjustment: 'all-clear',
    expectedDomain: 'Communication',
    minimumScore: 85,
    evidencePhrase: 'limited-English population',
  },
  {
    name: 'East Kauaʻi flood shelter and resilience gap',
    areaId: 'kauai-east',
    hazard: 'flood',
    severity: 5,
    profile: buildCommunityProfile({
      noVehiclePercent: 3,
      sviPercentile: 0.96,
      riskRating: 'Very High',
      resilienceRating: 'Very Low',
    }),
    resourceAdjustment: 'constrained-capacity',
    routeAdjustment: 'all-clear',
    expectedDomain: 'Safety',
    minimumScore: 80,
    evidencePhrase: 'community resilience',
  },
  {
    name: 'Waimānalo partial-source transportation watch',
    areaId: 'oahu-waimanalo',
    hazard: 'flood',
    severity: 4,
    profile: buildCommunityProfile({
      noVehiclePercent: 23,
      omit: ['empower', 'fema_national_risk'],
    }),
    routeAdjustment: 'all-unconfirmed',
    expectedDomain: 'Transportation',
    minimumScore: 90,
    evidencePhrase: 'practice routes need confirmation',
  },
]
