import { useCallback, useEffect, useState } from 'react'

import { backendConditionalGet } from './backend-api'

export type LifecycleEvidenceFeedState = 'fresh' | 'stale' | 'unavailable'

export type EventTriggerEvidence = {
  schema_version: string
  generated_at: string
  status: 'complete' | 'partial'
  triggers: Array<{
    source: string
    lifecycle: string
    planning_state: string
    title: string
  }>
  source_errors?: Array<{ source: string; error: string }>
  source_states?: Array<{
    id: string
    status: 'fresh' | 'stale'
    retrieved_at: string
    fresh_until: string
  }>
}

export type OperationalEvidence = {
  schema_version: string
  generated_at: string
  status: 'partial' | 'unavailable'
  domains: Array<{
    domain: string
    status: 'reported_live' | 'stale' | 'unavailable'
    freshness: {
      retrieved_at?: string
      fresh_until?: string
      expires_at?: string
    }
  }>
  source_errors?: Array<{ source: string; error: string }>
}

export type LifecycleEvidenceFeed<T> = {
  state: LifecycleEvidenceFeedState
  status: 'complete' | 'partial' | 'unavailable'
  unavailable_count: number
  error?: string
  data?: T
}

export type LifecycleEvidenceSnapshot = {
  schema_version: 'lifecycle-evidence.v1'
  snapshot_id: string
  generated_at: string
  status: 'complete' | 'partial' | 'unavailable'
  valid_until?: string
  planning_disclaimer: string
  event_triggers: LifecycleEvidenceFeed<EventTriggerEvidence>
  operational_status: LifecycleEvidenceFeed<OperationalEvidence>
}

export type LifecycleEvidenceState = {
  status: 'loading' | 'ready' | 'error'
  snapshot: LifecycleEvidenceSnapshot | null
  error: string | null
  checkedAt: string | null
  lastKnown: boolean
  refreshing: boolean
  refresh: () => void
}

type CacheEntry = {
  snapshot: LifecycleEvidenceSnapshot | null
  etag: string | null
  error: string | null
  checkedAt: string | null
  loading: boolean
  listeners: Set<() => void>
  request: Promise<void> | null
}

const cache = new Map<string, CacheEntry>()

function coordinateKey(coordinates: [number, number]) {
  return `${coordinates[0].toFixed(4)},${coordinates[1].toFixed(4)}`
}

function entryFor(key: string) {
  let entry = cache.get(key)
  if (!entry) {
    entry = {
      snapshot: null,
      etag: null,
      error: null,
      checkedAt: null,
      loading: false,
      listeners: new Set(),
      request: null,
    }
    cache.set(key, entry)
  }
  return entry
}

function notify(entry: CacheEntry) {
  for (const listener of entry.listeners) listener()
}

function loadEvidence(coordinates: [number, number]) {
  const key = coordinateKey(coordinates)
  const entry = entryFor(key)
  if (entry.request) return entry.request
  entry.loading = true
  notify(entry)
  entry.request = backendConditionalGet<LifecycleEvidenceSnapshot>(
    '/api/v1/lifecycle/evidence',
    { lat: coordinates[1], lon: coordinates[0] },
    entry.etag,
  )
    .then((result) => {
      if (result.status === 'ok') entry.snapshot = result.data
      entry.etag = result.etag
      entry.checkedAt = new Date().toISOString()
      entry.error = null
    })
    .catch((error: unknown) => {
      entry.checkedAt = new Date().toISOString()
      entry.error =
        error instanceof Error ? error.message : 'Evidence check failed'
    })
    .finally(() => {
      entry.loading = false
      entry.request = null
      notify(entry)
    })
  return entry.request
}

export function lifecycleEvidenceCounts(snapshot: LifecycleEvidenceSnapshot) {
  const triggers = snapshot.event_triggers.data?.triggers.length ?? null
  const domains = snapshot.operational_status.data?.domains ?? []
  return {
    triggers,
    unavailableEventSources: snapshot.event_triggers.unavailable_count,
    domains: snapshot.operational_status.data ? domains.length : null,
    unavailableDomains: snapshot.operational_status.data
      ? domains.filter((domain) => domain.status === 'unavailable').length
      : null,
  }
}

export function useLifecycleEvidence(
  coordinates: [number, number],
): LifecycleEvidenceState {
  const key = coordinateKey(coordinates)
  const [, render] = useState(0)
  const refresh = useCallback(() => {
    if (!navigator.onLine) {
      const entry = entryFor(key)
      entry.error = 'Offline; evidence was not checked.'
      entry.checkedAt = new Date().toISOString()
      notify(entry)
      return
    }
    void loadEvidence(coordinates)
  }, [coordinates, key])

  useEffect(() => {
    const entry = entryFor(key)
    const listener = () => render((value) => value + 1)
    entry.listeners.add(listener)
    if (!entry.snapshot && !entry.request) refresh()

    const refreshIfActive = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) refresh()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshIfActive()
    }
    window.addEventListener('focus', refreshIfActive)
    window.addEventListener('online', refreshIfActive)
    document.addEventListener('visibilitychange', onVisibility)
    const interval = window.setInterval(refreshIfActive, 60_000)
    return () => {
      entry.listeners.delete(listener)
      window.removeEventListener('focus', refreshIfActive)
      window.removeEventListener('online', refreshIfActive)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(interval)
    }
  }, [key, refresh])

  const entry = entryFor(key)
  return {
    status:
      entry.loading && !entry.snapshot
        ? 'loading'
        : entry.error
          ? 'error'
          : 'ready',
    snapshot: entry.snapshot,
    error: entry.error,
    checkedAt: entry.checkedAt,
    lastKnown: Boolean(entry.snapshot && entry.error),
    refreshing: Boolean(entry.snapshot && entry.loading),
    refresh,
  }
}
