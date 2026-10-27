import { useCallback, useEffect, useState } from 'react'

import { backendGet } from './backend-api'

export type EventTriggerSource =
  'nws' | 'ptwc' | 'usgs_comcat' | 'usgs_hans' | 'county_order'
export type EventTriggerLifecycle =
  'active' | 'expired' | 'stale' | 'unavailable'
export type EventTriggerPlanningState =
  'monitor' | 'prepare' | 'official_warning' | 'unavailable'

export type EventTrigger = {
  schema_version: string
  generated_at: string
  source: EventTriggerSource
  hazard_event_kind: string
  jurisdiction_scope:
    'statewide' | 'county' | 'multi_county' | 'offshore' | 'unknown'
  lifecycle: EventTriggerLifecycle
  planning_state: EventTriggerPlanningState
  authority_kind: string
  legal_order_status: 'not_an_evacuation_order' | 'unavailable'
  authority_limitation: string
  planning_consequence: string
  title: string
  facts: {
    severity?: string
    certainty?: string
    urgency?: string
    response_type?: string
    magnitude?: number
    tsunami_flag?: boolean
    volcano_alert_level?: string
  }
  provenance: {
    source_authority: string
    product_id?: string
    product_type: string
    issued_at?: string
    effective_at?: string
    expires_at?: string
    retrieved_at: string
    fresh_until?: string
    source_status: string
    official_instructions_url: string
  }
}

export type EventTriggerSnapshot = {
  schema_version: string
  generated_at: string
  status: 'complete' | 'partial'
  planning_disclaimer: string
  county_order_notice: string
  unavailable_meaning: string
  triggers: EventTrigger[]
  source_errors?: Array<{ source: string; error: string }>
}

export type EventTriggerState = {
  status: 'loading' | 'ready' | 'partial' | 'error'
  snapshot: EventTriggerSnapshot | null
  retry: () => void
}

let cachedSnapshot: EventTriggerSnapshot | null = null
let activeRequest: Promise<EventTriggerSnapshot> | null = null

function loadSnapshot() {
  if (cachedSnapshot) return Promise.resolve(cachedSnapshot)
  if (activeRequest) return activeRequest
  activeRequest = backendGet<EventTriggerSnapshot>(
    '/api/v1/planning/event-triggers',
  )
    .then((snapshot) => {
      cachedSnapshot = snapshot
      return snapshot
    })
    .finally(() => {
      activeRequest = null
    })
  return activeRequest
}

export function useEventTriggers(): EventTriggerState {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<Omit<EventTriggerState, 'retry'>>(() => ({
    status: cachedSnapshot
      ? cachedSnapshot.status === 'partial'
        ? 'partial'
        : 'ready'
      : 'loading',
    snapshot: cachedSnapshot,
  }))

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
  }, [revision])

  return { ...state, retry }
}

export function primaryOperationalTrigger(
  snapshot: EventTriggerSnapshot | null,
) {
  return (
    snapshot?.triggers.find(
      (trigger) =>
        trigger.lifecycle === 'active' &&
        trigger.source !== 'county_order' &&
        trigger.source !== 'usgs_hans',
    ) ??
    snapshot?.triggers.find(
      (trigger) =>
        trigger.source !== 'county_order' && trigger.source !== 'usgs_hans',
    ) ??
    null
  )
}
