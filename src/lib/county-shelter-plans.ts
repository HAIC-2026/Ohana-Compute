import { useCallback, useEffect, useState } from 'react'

import { backendGet } from './backend-api'

export type ShelterPlanCoverage = 'published' | 'partial' | 'unavailable'
export type ShelterPlanIngestionStatus =
  'curated' | 'reference_only' | 'unavailable'

export type CountyShelterPlanRecord = {
  id: string
  title: string
  record_type: string
  jurisdiction: string
  authority: string
  source_url: string
  source_status: 'published' | 'reference_only'
  effective_date?: string
  retrieved_at: string
  fresh_until: string
  freshness: 'fresh' | 'stale'
  operational_use: 'planning_reference_only' | 'agency_reference_only'
  notes: string
}

export type CountyShelterPlan = {
  id: 'honolulu' | 'maui' | 'hawaii' | 'kauai'
  name: string
  islands: string[]
  political_counties: string[]
  coverage: ShelterPlanCoverage
  ingestion_status: ShelterPlanIngestionStatus
  validation_status: 'local_validation_required' | 'validated'
  special_jurisdiction?: {
    title: string
    description: string
    sources: Array<{
      title: string
      source_url: string
    }>
  }
  plan_records: CountyShelterPlanRecord[]
  facility_records: Array<{
    id: string
    name: string
    capacity: number | null
    capabilities: string[]
    opening_status: string
    validation_status: string
    source_plan_record_id: string
  }>
  gaps: string[]
}

export type CountyShelterPlanSnapshot = {
  generated_at: string
  status: 'partial' | 'complete' | 'unavailable'
  summary: {
    jurisdictions_with_published_plan: number
    planning_jurisdictions_total: number
    political_counties_total: number
    official_facility_records: number
    jurisdictions_requiring_review: number
  }
  jurisdictions: CountyShelterPlan[]
}

export type CountyShelterPlanState = {
  status: 'loading' | 'ready' | 'partial' | 'unavailable' | 'error'
  snapshot: CountyShelterPlanSnapshot | null
  retry: () => void
}

let cachedSnapshot: CountyShelterPlanSnapshot | null = null
let activeRequest: Promise<CountyShelterPlanSnapshot> | null = null

function loadSnapshot() {
  if (cachedSnapshot) return Promise.resolve(cachedSnapshot)
  if (activeRequest) return activeRequest

  activeRequest = backendGet<CountyShelterPlanSnapshot>('/api/v1/shelter-plans')
    .then((snapshot) => {
      cachedSnapshot = snapshot
      return snapshot
    })
    .finally(() => {
      activeRequest = null
    })
  return activeRequest
}

export function preloadCountyShelterPlans() {
  void loadSnapshot().catch(() => undefined)
}

export function useCountyShelterPlans(): CountyShelterPlanState {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<Omit<CountyShelterPlanState, 'retry'>>(
    () => {
      if (!cachedSnapshot) return { status: 'loading', snapshot: null }
      return {
        status:
          cachedSnapshot.status === 'complete'
            ? 'ready'
            : cachedSnapshot.status === 'partial'
              ? 'partial'
              : 'unavailable',
        snapshot: cachedSnapshot,
      }
    },
  )

  const retry = useCallback(() => {
    cachedSnapshot = null
    activeRequest = null
    setState({ status: 'loading', snapshot: null })
    setRevision((value) => value + 1)
  }, [])

  useEffect(() => {
    let active = true
    void loadSnapshot()
      .then((snapshot) => {
        if (!active) return
        setState({
          status:
            snapshot.status === 'complete'
              ? 'ready'
              : snapshot.status === 'partial'
                ? 'partial'
                : 'unavailable',
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
  }, [revision])

  return { ...state, retry }
}

export function countyIdForIsland(island: string): CountyShelterPlan['id'] {
  if (island === 'Oʻahu') return 'honolulu'
  if (island === 'Maui' || island === 'Molokaʻi' || island === 'Lānaʻi')
    return 'maui'
  if (island === 'Hawaiʻi') return 'hawaii'
  return 'kauai'
}
