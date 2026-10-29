import { useEffect, useState } from 'react'

import { backendGet } from './backend-api'

export type AggregateMetric = {
  estimate: number | null
  margin_of_error: number | null
  percent?: number | null
  percent_margin_of_error?: number | null
}

export type CommunitySource = {
  id: string
  authority: string
  vintage?: string
  upstream_last_modified?: string
  retrieved_at?: string
  fresh_until?: string
  status: 'fresh' | 'stale'
}

export type CommunityProfile = {
  acs?: {
    geography: {
      name: string
      state_code?: string
      county_code?: string
      resolution?: {
        method: string
        vintage: string
        source_url: string
        warnings?: string[]
      }
    }
    warnings?: string[]
    population: AggregateMetric
    households: AggregateMetric
    no_vehicle_households: AggregateMetric
    limited_english_population: AggregateMetric
    population_with_disability: AggregateMetric
    population_below_poverty: AggregateMetric
    languages?: Array<{
      label: string
      variable: string
      speakers: AggregateMetric
    }>
    kupuna_living_alone?: AggregateMetric
    housing_50_plus_units?: AggregateMetric
    incomplete_plumbing?: AggregateMetric
    no_internet_subscription?: AggregateMetric
    source: CommunitySource
  }
  svi?: {
    location: string
    population: number | null
    age_65_or_older: number | null
    with_disability: number | null
    limited_english: number | null
    no_vehicle_households: number | null
    overall_percentile?: number | null
    housing_transportation_percentile?: number | null
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
  fema_national_risk?: {
    risk_rating: string
    expected_annual_loss_rating?: string
    social_vulnerability_rating: string
    community_resilience_rating: string
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
// Panels mounting just after a failure share it instead of re-requesting.
const failureCooldownMs = 10_000
const profileFailures = new Map<string, { at: number; error: unknown }>()

export function getCommunityProfileStatus(
  profile: CommunityProfile,
): CommunityProfileState['status'] {
  const availableSources = [
    profile.acs,
    profile.svi,
    profile.empower,
    profile.fema_national_risk,
  ].filter(Boolean).length
  if (availableSources === 4 && !profile.source_errors?.length) return 'ready'
  if (availableSources > 0) return 'partial'
  return 'unavailable'
}

function stateForProfile(profile: CommunityProfile): CommunityProfileState {
  const status = getCommunityProfileStatus(profile)
  return {
    status,
    profile: status === 'unavailable' ? null : profile,
  }
}

function loadCommunityProfile(
  cacheKey: string,
  latitude: number,
  longitude: number,
) {
  const existingRequest = profileRequests.get(cacheKey)
  if (existingRequest) return existingRequest
  const recentFailure = profileFailures.get(cacheKey)
  if (recentFailure && Date.now() - recentFailure.at < failureCooldownMs) {
    return Promise.reject(recentFailure.error)
  }

  const request = backendGet<CommunityProfile>('/api/v1/community/profile', {
    lat: latitude,
    lon: longitude,
  })
    .then((profile) => {
      profileCache.set(cacheKey, profile)
      profileFailures.delete(cacheKey)
      return profile
    })
    .catch((error: unknown) => {
      profileFailures.set(cacheKey, { at: Date.now(), error })
      throw error
    })
    .finally(() => {
      profileRequests.delete(cacheKey)
    })
  profileRequests.set(cacheKey, request)
  return request
}

export function getCommunityProfile(coordinates: [number, number]) {
  const [longitude, latitude] = coordinates
  const cacheKey = `${latitude.toFixed(5)},${longitude.toFixed(5)}`
  const cached = profileCache.get(cacheKey)
  return cached
    ? Promise.resolve(cached)
    : loadCommunityProfile(cacheKey, latitude, longitude)
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
      setState(stateForProfile(cachedProfile))
      return () => {
        active = false
      }
    }

    setState({ status: 'loading', profile: null })

    void loadCommunityProfile(cacheKey, latitude, longitude)
      .then((profile) => {
        if (!active) return
        setState(stateForProfile(profile))
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

export function formatPercentile(value: number | null | undefined) {
  if (value === null || value === undefined) return 'Unavailable'
  const percentile = Math.round(value * 100)
  const lastTwoDigits = percentile % 100
  const suffix =
    lastTwoDigits >= 11 && lastTwoDigits <= 13
      ? 'th'
      : percentile % 10 === 1
        ? 'st'
        : percentile % 10 === 2
          ? 'nd'
          : percentile % 10 === 3
            ? 'rd'
            : 'th'
  return `${percentile}${suffix} percentile`
}
