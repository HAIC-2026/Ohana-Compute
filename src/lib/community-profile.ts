import { useEffect, useState } from 'react'

import { backendGet } from './backend-api'

export type AggregateMetric = {
  estimate: number | null
  margin_of_error: number | null
  percent?: number | null
  percent_margin_of_error?: number | null
}

type CommunitySource = {
  authority: string
  vintage?: string
  upstream_last_modified?: string
  status: 'fresh' | 'stale'
}

export type CommunityProfile = {
  acs?: {
    geography: {
      name: string
    }
    population: AggregateMetric
    no_vehicle_households: AggregateMetric
    limited_english_population: AggregateMetric
    population_with_disability: AggregateMetric
    population_below_poverty: AggregateMetric
    source: CommunitySource
  }
  svi?: {
    location: string
    population: number | null
    age_65_or_older: number | null
    with_disability: number | null
    limited_english: number | null
    no_vehicle_households: number | null
    source: CommunitySource
  }
  empower?: {
    county: string
    zip_code: string
    medicare_beneficiaries: ProtectedCount
    power_dependent_dme: ProtectedCount
    facility_dialysis_any_dme: ProtectedCount
    oxygen_services_any_dme: ProtectedCount
    home_health_services_any_dme: ProtectedCount
    at_home_hospice_any_dme: ProtectedCount
    any_healthcare_service_any_dme: ProtectedCount
    source: CommunitySource
  }
  source_errors?: Array<{
    source: string
    error: string
  }>
  disclaimer: string
}

export type ProtectedCount = {
  value: number | null
  may_represent_masked_cell: boolean
}

export type CommunityProfileState = {
  status: 'loading' | 'ready' | 'partial' | 'unavailable'
  profile: CommunityProfile | null
}

const profileCache = new Map<string, CommunityProfile>()
const profileRequests = new Map<string, Promise<CommunityProfile>>()

function loadCommunityProfile(
  cacheKey: string,
  latitude: number,
  longitude: number,
) {
  const existingRequest = profileRequests.get(cacheKey)
  if (existingRequest) return existingRequest

  const request = backendGet<CommunityProfile>('/api/v1/community/profile', {
    lat: latitude,
    lon: longitude,
  })
    .then((profile) => {
      profileCache.set(cacheKey, profile)
      return profile
    })
    .finally(() => {
      profileRequests.delete(cacheKey)
    })
  profileRequests.set(cacheKey, request)
  return request
}

export function useCommunityProfile(coordinates: [number, number]) {
  const [longitude, latitude] = coordinates
  const cacheKey = `${latitude.toFixed(5)},${longitude.toFixed(5)}`
  const [state, setState] = useState<CommunityProfileState>({
    status: 'loading',
    profile: null,
  })

  useEffect(() => {
    let active = true
    const cachedProfile = profileCache.get(cacheKey)
    if (cachedProfile) {
      setState({
        status: cachedProfile.source_errors?.length ? 'partial' : 'ready',
        profile: cachedProfile,
      })
      return () => {
        active = false
      }
    }

    setState({ status: 'loading', profile: null })

    void loadCommunityProfile(cacheKey, latitude, longitude)
      .then((profile) => {
        if (!active) return
        setState({
          status: profile.source_errors?.length ? 'partial' : 'ready',
          profile,
        })
      })
      .catch(() => {
        if (!active) return
        setState({ status: 'unavailable', profile: null })
      })

    return () => {
      active = false
    }
  }, [cacheKey, latitude, longitude])

  return state
}

export function formatAggregateMetric(
  metric: AggregateMetric | undefined,
  fallback: number | null | undefined,
) {
  const value = metric?.estimate ?? fallback
  if (value === null || value === undefined) return 'Unavailable'

  const count = Math.round(value).toLocaleString()
  if (metric?.percent === null || metric?.percent === undefined) return count
  return `${count} (${metric.percent.toFixed(1)}%)`
}

export function formatProtectedCount(count: ProtectedCount | undefined) {
  if (count?.value === null || count?.value === undefined) return 'Unavailable'
  if (count.may_represent_masked_cell) return '1–11 (privacy-protected)'
  return count.value.toLocaleString()
}
