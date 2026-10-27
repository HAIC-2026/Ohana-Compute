import { useCallback, useEffect, useMemo, useState } from 'react'

import { backendPost } from './backend-api'
import type {
  AggregateMetric,
  CommunitySource,
  ProtectedCount,
} from './community-profile'
import type { LocalResourceSite } from './mock-data'

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

export type ResourceDemandResponse = {
  schema_version: 'resource-demand-response.v1'
  model_version: string
  assumption_version: string
  calculation_id: string
  status: 'complete' | 'partial' | 'unavailable'
  geography: {
    id: string
    kind: 'planning_area'
  }
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
  }
  assumptions: Array<{
    id: string
    label: string
    unit: string
    values: number[]
    basis: string
    evidence: string[]
  }>
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
    reviewed_at: string
    fresh_until: string
    use: string
  }>
  disclaimers: string[]
}

export type ResourceDemandRequest = {
  schema_version: 'resource-demand-request.v1'
  geography: {
    id: string
    kind: 'planning_area'
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
      }
    | {
        status: 'unavailable'
        masked: false
        source_id: 'unavailable'
      }
  scenario: {
    service_days: number
    shelter_standard: ResourceDemandStandard
  }
  practice_supplies: Array<{
    category: 'shelter_spaces'
    unit: 'people'
    quantity: number
    geography_id: string
    validation_status: 'practice_confirmed' | 'needs_confirmation'
  }>
}

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
  resources: LocalResourceSite[]
  confirmedResourceIds: string[]
  serviceDays: number
  shelterStandard: ResourceDemandStandard
}

export function createResourceDemandRequest({
  areaId,
  population,
  populationSource,
  medicalPower,
  resources,
  confirmedResourceIds,
  serviceDays,
  shelterStandard,
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
        }
      : medicalPower.may_represent_masked_cell
        ? {
            status: 'available',
            masked: true,
            source_id: 'hhs-empower',
          }
        : medicalPower.value !== null
          ? {
              status: 'available',
              value: Math.max(0, Math.round(medicalPower.value)),
              masked: false,
              source_id: 'hhs-empower',
            }
          : {
              status: 'unavailable',
              masked: false,
              source_id: 'unavailable',
            }

  return {
    schema_version: 'resource-demand-request.v1',
    geography: {
      id: areaId,
      kind: 'planning_area',
    },
    population: populationInput,
    medical_power: medicalPowerInput,
    scenario: {
      service_days: serviceDays,
      shelter_standard: shelterStandard,
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
