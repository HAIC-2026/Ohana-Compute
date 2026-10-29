import { useCallback, useEffect, useMemo, useState } from 'react'

import { backendPost } from './backend-api'
import type {
  AggregateMetric,
  CommunitySource,
  ProtectedCount,
} from './community-profile'
import type { HazardId, LocalResourceSite } from './mock-data'

export type ResourceDemandCountyId =
  'hawaii' | 'honolulu' | 'kalawao' | 'kauai' | 'maui'
export type ResourceDemandIslandId =
  'hawaii' | 'kauai' | 'lanai' | 'maui' | 'molokai' | 'niihau' | 'oahu'

export function resourceDemandIslandId(island: string): ResourceDemandIslandId {
  switch (island) {
    case 'Oʻahu':
      return 'oahu'
    case 'Maui':
      return 'maui'
    case 'Molokaʻi':
      return 'molokai'
    case 'Lānaʻi':
      return 'lanai'
    case 'Hawaiʻi':
      return 'hawaii'
    case 'Kauaʻi':
      return 'kauai'
    default:
      return 'niihau'
  }
}

export type ResourceDemandStandard = 'evacuation' | 'short_term'

export type ResourceDemandRange = {
  low: number
  planning: number
  high: number
}

export type ResourceDemandLine = {
  id: string
  label: string
  status: 'modeled' | 'unavailable'
  unit: string
  demand?: ResourceDemandRange
  supply?: {
    applied_quantity: number
    applied_records: number
  }
  gap?: ResourceDemandRange
  basis: string
  evidence: string[]
  notes: string[]
  unavailable_reason?: string
}

export type ResourceDemandNeed = {
  domain: string
  label: string
  status: 'modeled' | 'unavailable'
  unit: string
  demand?: ResourceDemandRange
  basis: string
  evidence: string[]
  unavailable_reason?: string
}

export type ResourceDemandResponse = {
  schema_version: 'resource-demand-response.v2'
  model_version: string
  assumption_version: string
  calculation_id: string
  status: 'complete' | 'partial' | 'unavailable'
  geography: {
    id: string
    kind: 'planning_area'
    county_id: ResourceDemandCountyId
    island_id: ResourceDemandIslandId
  }
  community: ResourceDemandRequest['community']
  population: {
    status: 'available' | 'unavailable'
    estimate?: number
    margin_of_error?: number
    range?: ResourceDemandRange
    source: {
      id: 'acs-5-year' | 'unavailable'
      freshness: 'fresh' | 'stale' | 'unavailable'
    }
  }
  scenario: {
    service_days: number
    shelter_standard: ResourceDemandStandard
    hazard: HazardId
    outage_hours: number
  }
  assumptions: Array<{
    id: string
    label: string
    unit: string
    values: number[]
    basis: string
    evidence: string[]
  }>
  cmist: ResourceDemandNeed[]
  county_capacity: {
    status: 'published' | 'not_published'
    capacity?: number
    unit: string
    source_id: string
    notes: string[]
  }
  service_animal_provisions: string[]
  lines: ResourceDemandLine[]
  supply_assessments: Array<{
    category: string
    unit: string
    quantity: number
    status: 'applied' | 'excluded'
    reason?: 'not_confirmed' | 'geography_mismatch' | 'unit_mismatch'
  }>
  sources: Array<{
    id: string
    title: string
    authority: string
    url: string
    data_date: string
    reviewed_at: string
    fresh_until: string
    use: string
  }>
  disclaimers: string[]
}

export type ResourceDemandRequest = {
  schema_version: 'resource-demand-request.v2'
  geography: {
    id: string
    kind: 'planning_area'
    county_id: ResourceDemandCountyId
    island_id: ResourceDemandIslandId
  }
  community: {
    households: ResourceDemandCountInput
    limited_english_population: ResourceDemandCountInput
    population_with_disability: ResourceDemandCountInput
    population_below_poverty: ResourceDemandCountInput
    no_vehicle_households: ResourceDemandCountInput
  }
  population:
    | {
        status: 'available'
        estimate: number
        margin_of_error?: number
        source: {
          id: 'acs-5-year'
          freshness: 'fresh' | 'stale'
        }
      }
    | {
        status: 'unavailable'
        source: {
          id: 'unavailable'
          freshness: 'unavailable'
        }
      }
  medical_power:
    | {
        status: 'available'
        value?: number
        masked: boolean
        source_id: 'hhs-empower'
        source_date?: string
      }
    | {
        status: 'unavailable'
        masked: false
        source_id: 'unavailable'
        source_date?: string
      }
  scenario: {
    service_days: number
    shelter_standard: ResourceDemandStandard
    hazard: HazardId
    outage_hours: number
  }
  practice_supplies: Array<{
    category: 'shelter_spaces'
    unit: 'people'
    quantity: number
    geography_id: string
    validation_status: 'practice_confirmed' | 'needs_confirmation'
  }>
}

export type ResourceDemandCountInput =
  | {
      status: 'available'
      estimate: number
      margin_of_error?: number
    }
  | { status: 'unavailable' }

export type ResourceDemandState = {
  status: 'loading' | 'ready' | 'partial' | 'unavailable' | 'error'
  response: ResourceDemandResponse | null
  retry: () => void
}

type RequestInput = {
  areaId: string
  population: AggregateMetric | undefined
  populationSource: CommunitySource | undefined
  medicalPower: ProtectedCount | undefined
  medicalPowerSourceDate: string | undefined
  resources: LocalResourceSite[]
  confirmedResourceIds: string[]
  countyId: ResourceDemandCountyId
  islandId: ResourceDemandIslandId
  hazard: HazardId
  households: AggregateMetric | undefined
  limitedEnglish: AggregateMetric | undefined
  disability: AggregateMetric | undefined
  belowPoverty: AggregateMetric | undefined
  noVehicleHouseholds: AggregateMetric | undefined
  serviceDays: number
  shelterStandard: ResourceDemandStandard
  outageHours: number
}

function countInput(
  metric: AggregateMetric | undefined,
): ResourceDemandCountInput {
  const estimate = metric?.estimate
  if (estimate === null || estimate === undefined || estimate < 0) {
    return { status: 'unavailable' }
  }
  return {
    status: 'available',
    estimate: Math.round(estimate),
    ...(metric?.margin_of_error !== null &&
    metric?.margin_of_error !== undefined
      ? {
          margin_of_error: Math.max(0, Math.round(metric.margin_of_error)),
        }
      : {}),
  }
}

function dateOnly(value: string | undefined) {
  if (!value) return undefined
  const parsed = Date.parse(value)
  return Number.isNaN(parsed)
    ? undefined
    : new Date(parsed).toISOString().slice(0, 10)
}

export function createResourceDemandRequest({
  areaId,
  countyId,
  islandId,
  hazard,
  population,
  populationSource,
  medicalPower,
  medicalPowerSourceDate,
  households,
  limitedEnglish,
  disability,
  belowPoverty,
  noVehicleHouseholds,
  resources,
  confirmedResourceIds,
  serviceDays,
  shelterStandard,
  outageHours,
}: RequestInput): ResourceDemandRequest {
  const estimate = population?.estimate
  const populationInput: ResourceDemandRequest['population'] =
    estimate !== null && estimate !== undefined && estimate > 0
      ? {
          status: 'available',
          estimate: Math.round(estimate),
          ...(population?.margin_of_error !== null &&
          population?.margin_of_error !== undefined
            ? {
                margin_of_error: Math.max(
                  0,
                  Math.round(population.margin_of_error),
                ),
              }
            : {}),
          source: {
            id: 'acs-5-year',
            freshness: populationSource?.status ?? 'stale',
          },
        }
      : {
          status: 'unavailable',
          source: {
            id: 'unavailable',
            freshness: 'unavailable',
          },
        }

  const medicalPowerInput: ResourceDemandRequest['medical_power'] =
    medicalPower === undefined
      ? {
          status: 'unavailable',
          masked: false,
          source_id: 'unavailable',
          ...(dateOnly(medicalPowerSourceDate)
            ? { source_date: dateOnly(medicalPowerSourceDate) }
            : {}),
        }
      : medicalPower.may_represent_masked_cell
        ? {
            status: 'available',
            masked: true,
            source_id: 'hhs-empower',
            ...(dateOnly(medicalPowerSourceDate)
              ? { source_date: dateOnly(medicalPowerSourceDate) }
              : {}),
          }
        : medicalPower.value !== null
          ? {
              status: 'available',
              value: Math.max(0, Math.round(medicalPower.value)),
              masked: false,
              source_id: 'hhs-empower',
              ...(dateOnly(medicalPowerSourceDate)
                ? { source_date: dateOnly(medicalPowerSourceDate) }
                : {}),
            }
          : {
              status: 'unavailable',
              masked: false,
              source_id: 'unavailable',
              ...(dateOnly(medicalPowerSourceDate)
                ? { source_date: dateOnly(medicalPowerSourceDate) }
                : {}),
            }

  return {
    schema_version: 'resource-demand-request.v2',
    geography: {
      id: areaId,
      kind: 'planning_area',
      county_id: countyId,
      island_id: islandId,
    },
    community: {
      households: countInput(households),
      limited_english_population: countInput(limitedEnglish),
      population_with_disability: countInput(disability),
      population_below_poverty: countInput(belowPoverty),
      no_vehicle_households: countInput(noVehicleHouseholds),
    },
    population: populationInput,
    medical_power: medicalPowerInput,
    scenario: {
      service_days: serviceDays,
      shelter_standard: shelterStandard,
      hazard,
      outage_hours: outageHours,
    },
    practice_supplies: resources
      .filter((resource) => resource.kind === 'shelter')
      .map((resource) => ({
        category: 'shelter_spaces' as const,
        unit: 'people' as const,
        quantity: resource.capacity,
        geography_id: areaId,
        validation_status:
          resource.status === 'confirmed' ||
          confirmedResourceIds.includes(resource.id)
            ? ('practice_confirmed' as const)
            : ('needs_confirmation' as const),
      })),
  }
}

export function useResourceDemand(
  request: ResourceDemandRequest,
): ResourceDemandState {
  const requestKey = JSON.stringify(request)
  const requestPayload = useMemo(
    () => JSON.parse(requestKey) as ResourceDemandRequest,
    [requestKey],
  )
  const [retryToken, setRetryToken] = useState(0)
  const [state, setState] = useState<Omit<ResourceDemandState, 'retry'>>({
    status: 'loading',
    response: null,
  })

  useEffect(() => {
    let active = true
    setState({ status: 'loading', response: null })
    void backendPost<ResourceDemandRequest, ResourceDemandResponse>(
      '/api/v1/planning/resource-demand',
      requestPayload,
    )
      .then((response) => {
        if (!active) return
        setState({
          status:
            response.status === 'complete'
              ? 'ready'
              : response.status === 'partial'
                ? 'partial'
                : 'unavailable',
          response,
        })
      })
      .catch(() => {
        if (!active) return
        setState({ status: 'error', response: null })
      })
    return () => {
      active = false
    }
  }, [requestPayload, retryToken])

  const retry = useCallback(() => {
    setRetryToken((current) => current + 1)
  }, [])

  return { ...state, retry }
}

export function findResourceDemandLine(
  response: ResourceDemandResponse | null,
  id: string,
) {
  return response?.lines.find((line) => line.id === id)
}
