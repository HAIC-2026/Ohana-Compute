import { useCallback, useEffect, useState } from 'react'

import { backendGet } from './backend-api'

export type OperationalDomain =
  | 'evacuation_order'
  | 'road_transport'
  | 'shelter'
  | 'transit_paratransit'
  | 'utility_outage'
  | 'wildfire'

export type OperationalStatus = 'reported_live' | 'stale' | 'unavailable'

export type OperationalDomainStatus = {
  domain: OperationalDomain
  status: OperationalStatus
  reference_kind:
    'operational' | 'planned_reference' | 'reference_only' | 'none'
  summary: string
  coverage: {
    scope: string
    areas: string[]
    notes: string
  }
  freshness: {
    retrieved_at?: string
    fresh_until?: string
    expires_at?: string
  }
  provenance: {
    source_id: string
    authority: string
    source_url: string
    access: string
    checked_at: string
    decision: string
    data_class: string
    attribution?: string
  }
  limitations: string[]
  shelters?: Array<{
    id: string
    name: string
    address?: string
    city?: string
    reported_status: string
    capacity?: number
    wheelchair_accessible?: string
    pet_accommodations_code?: string
    reporting_organization?: string
    distance_miles: number
  }>
  unavailable_boundary?: {
    missing_artifact: string
    owning_authority: string
    verification: string
  }
}

export type OperationalStatusSnapshot = {
  schema_version: string
  generated_at: string
  status: 'partial' | 'unavailable'
  disclaimer: string
  domains: OperationalDomainStatus[]
  source_errors?: Array<{ source: string; error: string }>
}

export type OperationalStatusState = {
  status: 'loading' | 'ready' | 'partial' | 'error'
  snapshot: OperationalStatusSnapshot | null
  retry: () => void
}

const cache = new Map<string, OperationalStatusSnapshot>()
const activeRequests = new Map<string, Promise<OperationalStatusSnapshot>>()

function coordinateKey(coordinates: [number, number]) {
  return `${coordinates[0].toFixed(4)},${coordinates[1].toFixed(4)}`
}

function loadSnapshot(coordinates: [number, number]) {
  const key = coordinateKey(coordinates)
  const cached = cache.get(key)
  if (cached) return Promise.resolve(cached)
  const active = activeRequests.get(key)
  if (active) return active

  const request = backendGet<OperationalStatusSnapshot>(
    '/api/v1/planning/live-status',
    { lat: coordinates[1], lon: coordinates[0] },
  )
    .then((snapshot) => {
      cache.set(key, snapshot)
      return snapshot
    })
    .finally(() => {
      activeRequests.delete(key)
    })
  activeRequests.set(key, request)
  return request
}

export function useOperationalStatus(
  coordinates: [number, number],
): OperationalStatusState {
  const key = coordinateKey(coordinates)
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<Omit<OperationalStatusState, 'retry'>>(
    () => {
      const snapshot = cache.get(key) ?? null
      return {
        status: snapshot
          ? snapshot.status === 'partial'
            ? 'partial'
            : 'ready'
          : 'loading',
        snapshot,
      }
    },
  )

  const retry = useCallback(() => {
    cache.delete(key)
    activeRequests.delete(key)
    setState({ status: 'loading', snapshot: null })
    setRevision((value) => value + 1)
  }, [key])

  useEffect(() => {
    let active = true
    const cached = cache.get(key)
    if (cached) {
      setState({
        status: cached.status === 'partial' ? 'partial' : 'ready',
        snapshot: cached,
      })
      return () => {
        active = false
      }
    }
    setState({ status: 'loading', snapshot: null })
    void loadSnapshot(coordinates)
      .then((snapshot) => {
        if (!active) return
        setState({
          status: snapshot.status === 'partial' ? 'partial' : 'ready',
          snapshot,
        })
      })
      .catch(() => {
        if (!active) return
        setState({ status: 'error', snapshot: null })
      })
    return () => {
      active = false
    }
  }, [coordinates, key, revision])

  return { ...state, retry }
}
