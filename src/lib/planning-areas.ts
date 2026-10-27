import { useCallback, useEffect, useSyncExternalStore } from 'react'

import { backendGet } from './backend-api'
import type {
  HazardId,
  LocalResourceSite,
  LocalRouteCheck,
  NeighborhoodBriefing,
  PlanningArea,
} from './mock-data'

export type PlanningAreaVerificationStatus =
  'practice_confirmed' | 'needs_confirmation'

export type PlanningAreaResource = {
  id: string
  name: string
  kind: LocalResourceSite['kind']
  coordinates: [number, number]
  capacity: number
  capabilities: string[]
  verification_status: PlanningAreaVerificationStatus
}

export type PlanningAreaRoute = {
  name: string
  purpose: string
  verification_status: PlanningAreaVerificationStatus
}

type PlanningAreaDecision = {
  label:
    | 'Stay in place'
    | 'Seek shelter'
    | 'Move inland'
    | 'Prepare to leave'
    | 'Follow local alert'
  action: string
  reason: string
  trigger: string
}

export type StatewidePlanningArea = {
  id: string
  name: string
  island: string
  jurisdiction_id: 'honolulu' | 'maui' | 'hawaii' | 'kauai'
  communities: string[]
  summary: string
  response_focus: Partial<Record<HazardId, string>>
  afn_fixture_key: string
  shelter_plan_jurisdiction_id: 'honolulu' | 'maui' | 'hawaii' | 'kauai'
  briefing: {
    id: string
    name: string
    summary: string
    closest_resources: Array<{
      name: string
      kind: string
      distance: string
      note: string
    }>
    routes: PlanningAreaRoute[]
    traffic_hazards: string[]
    coordination: {
      decision_owner: string
      communication_path: string
      afn_actions: string[]
    }
    evidence: {
      status: 'Practice estimate' | 'County-validated'
      basis: string
      updated: string
      validation: string
    }
    decisions: Partial<Record<HazardId, PlanningAreaDecision>>
  }
  practice_resources: PlanningAreaResource[]
  practice_routes: PlanningAreaRoute[]
}

export type PlanningJurisdiction = {
  id: StatewidePlanningArea['jurisdiction_id']
  name: string
  islands: string[]
  political_counties: string[]
  coverage: 'representative'
  scope_note: string
  areas: StatewidePlanningArea[]
}

export type PlanningAreaSnapshot = {
  generated_at: string
  status: 'complete' | 'partial' | 'unavailable'
  summary: {
    planning_jurisdictions_total: number
    political_counties_total: number
    representative_workflows: number
  }
  provenance: {
    dataset_mode: 'practice'
    methodology: string
    reviewed_at: string
    fresh_until: string
    freshness: 'fresh' | 'stale'
  }
  jurisdictions: PlanningJurisdiction[]
  unsupported_areas: string[]
}

export type PlanningAreaCatalogState = {
  status: 'loading' | 'ready' | 'partial' | 'unavailable' | 'error'
  snapshot: PlanningAreaSnapshot | null
  retry: () => void
}

let activeRequest: Promise<PlanningAreaSnapshot> | null = null
const representativeAreaIds = new Set([
  'oahu-town',
  'maui-central',
  'hawaii-hilo',
  'kauai-east',
])

type PlanningAreaCatalogSnapshot = Omit<PlanningAreaCatalogState, 'retry'>

let catalogState: PlanningAreaCatalogSnapshot = {
  status: 'loading',
  snapshot: null,
}
const catalogListeners = new Set<() => void>()

function setCatalogState(nextState: PlanningAreaCatalogSnapshot) {
  catalogState = nextState
  for (const listener of catalogListeners) listener()
}

function snapshotStatus(
  snapshot: PlanningAreaSnapshot,
): PlanningAreaCatalogSnapshot['status'] {
  if (snapshot.status === 'complete') return 'ready'
  if (snapshot.status === 'partial') return 'partial'
  return 'unavailable'
}

function loadSnapshot() {
  if (catalogState.snapshot) return Promise.resolve(catalogState.snapshot)
  if (activeRequest) return activeRequest

  activeRequest = backendGet<PlanningAreaSnapshot>('/api/v1/planning-areas')
    .then((snapshot) => {
      setCatalogState({
        status: snapshotStatus(snapshot),
        snapshot,
      })
      return snapshot
    })
    .catch((error: unknown) => {
      setCatalogState({ status: 'error', snapshot: null })
      throw error
    })
    .finally(() => {
      activeRequest = null
    })
  return activeRequest
}

function subscribeCatalog(listener: () => void) {
  catalogListeners.add(listener)
  return () => catalogListeners.delete(listener)
}

function getCatalogState() {
  return catalogState
}

export function usePlanningAreaCatalog(): PlanningAreaCatalogState {
  const state = useSyncExternalStore(
    subscribeCatalog,
    getCatalogState,
    getCatalogState,
  )

  useEffect(() => {
    if (state.status !== 'loading' || state.snapshot) return
    void loadSnapshot().catch(() => undefined)
  }, [state.snapshot, state.status])

  const retry = useCallback(() => {
    activeRequest = null
    setCatalogState({ status: 'loading', snapshot: null })
    void loadSnapshot().catch(() => undefined)
  }, [])

  return { ...state, retry }
}

export function findStatewidePlanningArea(
  snapshot: PlanningAreaSnapshot | null,
  areaId: string,
) {
  return snapshot?.jurisdictions
    .flatMap((jurisdiction) => jurisdiction.areas)
    .find((area) => area.id === areaId)
}

export function hasRepresentativeWorkflow(areaId: string) {
  return representativeAreaIds.has(areaId)
}

export function usesCatalogWorkflow(area: PlanningArea) {
  return area.island !== 'Oʻahu' && hasRepresentativeWorkflow(area.id)
}

export function findPlanningJurisdiction(
  snapshot: PlanningAreaSnapshot | null,
  areaId: string,
) {
  return snapshot?.jurisdictions.find((jurisdiction) =>
    jurisdiction.areas.some((area) => area.id === areaId),
  )
}

export function getCatalogResourceInventory(
  area: PlanningArea,
  record: StatewidePlanningArea | undefined,
): LocalResourceSite[] | null {
  if (!record) return null
  return record.practice_resources.map((resource) => ({
    id: resource.id,
    name: resource.name,
    areaId: area.id,
    coordinates: resource.coordinates,
    kind: resource.kind,
    capacity: resource.capacity,
    capabilities: resource.capabilities,
    status:
      resource.verification_status === 'practice_confirmed'
        ? 'confirmed'
        : 'needs-confirmation',
  }))
}

export function getCatalogRouteChecks(
  record: StatewidePlanningArea | undefined,
): LocalRouteCheck[] | null {
  if (!record) return null
  return record.practice_routes.map((route) => ({
    name: route.name,
    status:
      route.verification_status === 'practice_confirmed'
        ? 'clear'
        : 'needs-confirmation',
  }))
}

export function getCatalogBriefing(
  area: PlanningArea,
  record: StatewidePlanningArea | undefined,
): NeighborhoodBriefing | null {
  if (!record) return null
  return {
    id: record.briefing.id,
    areaId: area.id,
    name: record.briefing.name,
    summary: record.briefing.summary,
    closestResources: record.briefing.closest_resources.map((resource) => ({
      name: resource.name,
      kind: resource.kind,
      distance: resource.distance,
      note: resource.note,
    })),
    routes: record.briefing.routes.map((route) => ({
      name: route.name,
      purpose: route.purpose,
    })),
    trafficHazards: record.briefing.traffic_hazards,
    coordination: {
      decisionOwner: record.briefing.coordination.decision_owner,
      communicationPath: record.briefing.coordination.communication_path,
      afnActions: record.briefing.coordination.afn_actions,
    },
    evidence: record.briefing.evidence,
    decisions: record.briefing.decisions,
  }
}
