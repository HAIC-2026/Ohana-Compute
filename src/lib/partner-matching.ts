import { useCallback, useEffect, useMemo, useState } from 'react'

import { backendGet } from './backend-api'
import type { AfnPlanningDomain } from './planning-analysis'

export type PartnerCapability =
  | 'mass-care-coordination'
  | 'sheltering'
  | 'feeding-production'
  | 'feeding-distribution'
  | 'emergency-supplies-distribution'
  | 'reunification'
  | 'information-referral'
  | 'human-services'
  | 'access-functional-needs-support'
  | 'pet-service-animal-support'

export type PartnerJurisdictionId = 'honolulu' | 'maui' | 'hawaii' | 'kauai'

export type PartnerMatchResponse = {
  schema_version: 'partner-match-response.v1'
  generated_at: string
  status: 'complete' | 'partial' | 'unavailable'
  jurisdiction_id: PartnerJurisdictionId
  summary: {
    requested_capabilities: number
    matched_capabilities: number
    unmatched_capabilities: number
    partner_associations: number
  }
  matches: Array<{
    capability: PartnerCapability
    status: 'matched' | 'unmatched' | 'stale'
    partners: Array<{
      id: string
      name: string
      organization_type:
        'state_agency' | 'county_agency' | 'nonprofit' | 'coordination_network'
      capability: PartnerCapability
      role: string
      coverage: string[]
      validation_state:
        | 'official_county_role'
        | 'official_plan_role'
        | 'official_plan_network'
        | 'organization_self_described'
      operational_status: 'not_validated'
      capacity_status: 'not_reported'
      activation_status: 'not_reported'
      match_basis: 'documented_role_and_geographic_scope'
      evidence: {
        source_id: string
        title: string
        publisher: string
        source_url: string
        claim: string
        published_date?: string
        accessed_at: string
        fresh_until: string
        freshness: 'fresh' | 'stale'
      }
      required_validation: string[]
    }>
    gap?: string
  }>
  disclaimers: string[]
}

export type PartnerMatchState = {
  status: 'loading' | 'ready' | 'partial' | 'unavailable' | 'error'
  response: PartnerMatchResponse | null
  retry: () => void
}

const capabilityOrder: PartnerCapability[] = [
  'mass-care-coordination',
  'sheltering',
  'feeding-production',
  'feeding-distribution',
  'emergency-supplies-distribution',
  'information-referral',
  'human-services',
  'access-functional-needs-support',
  'pet-service-animal-support',
  'reunification',
]

export function derivePartnerCapabilities(
  hotspotDomains: AfnPlanningDomain[],
): PartnerCapability[] {
  const capabilities = new Set<PartnerCapability>([
    'mass-care-coordination',
    'sheltering',
    'feeding-production',
    'feeding-distribution',
    'emergency-supplies-distribution',
    'human-services',
    'pet-service-animal-support',
  ])
  if (
    hotspotDomains.some((domain) =>
      ['Communication', 'Medical', 'Independence', 'Transportation'].includes(
        domain,
      ),
    )
  ) {
    capabilities.add('access-functional-needs-support')
  }
  if (hotspotDomains.includes('Communication')) {
    capabilities.add('information-referral')
  }
  return capabilityOrder.filter((capability) => capabilities.has(capability))
}

export function usePartnerMatches(
  jurisdictionId: PartnerJurisdictionId,
  capabilities: PartnerCapability[],
): PartnerMatchState {
  const capabilityKey = capabilities.join(',')
  const requestCapabilities = useMemo(
    () => capabilityKey.split(',').filter(Boolean) as PartnerCapability[],
    [capabilityKey],
  )
  const [retryToken, setRetryToken] = useState(0)
  const [state, setState] = useState<Omit<PartnerMatchState, 'retry'>>({
    status: 'loading',
    response: null,
  })

  useEffect(() => {
    let active = true
    setState({ status: 'loading', response: null })
    const query = new URLSearchParams({ jurisdiction: jurisdictionId })
    for (const capability of requestCapabilities) {
      query.append('capability', capability)
    }
    void backendGet<PartnerMatchResponse>(
      `/api/v1/planning/partner-matches?${query.toString()}`,
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
  }, [jurisdictionId, requestCapabilities, retryToken])

  const retry = useCallback(() => {
    setRetryToken((current) => current + 1)
  }, [])

  return { ...state, retry }
}
