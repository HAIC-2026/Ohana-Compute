import { useCallback, useEffect, useState } from 'react'

import { backendConditionalGet } from './backend-api'
import { rejectDuplicateKeys } from './record-digest'
import { validNWSProduct } from './nws-product'
import type { NWSProduct } from './nws-product'
import {
  boundedText,
  stringIn,
  validShelterContext,
  validSourceTime,
} from './source-evidence'
import type { ShelterContext, SourceReading } from './source-evidence'

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
    nws_product?: NWSProduct
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
  planning_location: {
    point: [string, string]
    algorithm_version: 'rfc7946-planar-rational-v1'
  }
  event_triggers: LifecycleEvidenceFeed<EventTriggerEvidence>
  operational_status: LifecycleEvidenceFeed<OperationalEvidence>
  shelter_context: ShelterContext
}

export type EvidenceCheck = {
  snapshot: LifecycleEvidenceSnapshot | null
  error: string | null
  checkedAt: string | null
  lastShelterSnapshot: LifecycleEvidenceSnapshot | null
}

export type LifecycleEvidenceState = EvidenceCheck & {
  status: 'loading' | 'ready' | 'error'
  lastKnown: boolean
  refreshing: boolean
  now: number
  refresh: () => Promise<EvidenceCheck>
}

type CacheEntry = {
  snapshot: LifecycleEvidenceSnapshot | null
  lastShelterSnapshot: LifecycleEvidenceSnapshot | null
  etag: string | null
  error: string | null
  checkedAt: string | null
  loading: boolean
  listeners: Set<() => void>
  request: Promise<EvidenceCheck> | null
}

const cache = new Map<string, CacheEntry>()

export function parseLifecycleEvidenceJSON(
  text: string,
  expectedCoordinates?: [number, number],
) {
  if (new TextEncoder().encode(text).length > 2 * 1024 * 1024)
    throw new Error('Lifecycle evidence exceeds the 2 MiB limit.')
  rejectDuplicateKeys(text)
  return parseLifecycleEvidence(JSON.parse(text), expectedCoordinates)
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validFeed(value: unknown): value is Record<string, unknown> {
  return (
    object(value) &&
    stringIn(value.state, ['fresh', 'stale', 'unavailable']) &&
    stringIn(value.status, ['complete', 'partial', 'unavailable']) &&
    Number.isSafeInteger(value.unavailable_count) &&
    Number(value.unavailable_count) >= 0 &&
    Number(value.unavailable_count) <= 99 &&
    (value.error === undefined || boundedText(value.error, 2048)) &&
    (value.data !== undefined ||
      (value.state === 'unavailable' && value.status === 'unavailable'))
  )
}

function validErrors(value: unknown) {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length <= 99 &&
      value.every(
        (row) =>
          object(row) &&
          boundedText(row.source, 128) &&
          boundedText(row.error, 2048),
      ))
  )
}

function validCoordinate(value: unknown, minimum: number, maximum: number) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 128 ||
    !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)
  )
    return false
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
}

export function parseLifecycleEvidence(
  value: unknown,
  expectedCoordinates?: [number, number],
): LifecycleEvidenceSnapshot {
  const invalid = () =>
    new Error(
      'Malformed lifecycle evidence; retained validated last-known facts.',
    )
  if (
    !object(value) ||
    new TextEncoder().encode(JSON.stringify(value)).length > 2 * 1024 * 1024 ||
    value.schema_version !== 'lifecycle-evidence.v1' ||
    !boundedText(value.snapshot_id, 128) ||
    !validSourceTime(value.generated_at) ||
    !stringIn(value.status, ['complete', 'partial', 'unavailable']) ||
    (value.valid_until !== undefined && !validSourceTime(value.valid_until)) ||
    !boundedText(value.planning_disclaimer, 4096) ||
    !object(value.planning_location) ||
    value.planning_location.algorithm_version !==
      'rfc7946-planar-rational-v1' ||
    !Array.isArray(value.planning_location.point) ||
    value.planning_location.point.length !== 2 ||
    !validCoordinate(value.planning_location.point[0], -180, 180) ||
    !validCoordinate(value.planning_location.point[1], -90, 90) ||
    (expectedCoordinates !== undefined &&
      (value.planning_location.point[0] !== String(expectedCoordinates[0]) ||
        value.planning_location.point[1] !== String(expectedCoordinates[1]))) ||
    !validFeed(value.event_triggers) ||
    !validFeed(value.operational_status) ||
    !validShelterContext(value.shelter_context)
  )
    throw invalid()
  const events = value.event_triggers.data
  if (
    events !== undefined &&
    (!object(events) ||
      events.schema_version !== 'event-trigger-snapshot.v1' ||
      !validSourceTime(events.generated_at) ||
      !stringIn(events.status, ['complete', 'partial']) ||
      !Array.isArray(events.triggers) ||
      events.triggers.length > 2000 ||
      !events.triggers.every(
        (row) =>
          object(row) &&
          boundedText(row.source, 128) &&
          boundedText(row.lifecycle, 128) &&
          boundedText(row.planning_state, 128) &&
          boundedText(row.title, 2048) &&
          (row.nws_product === undefined ||
            (row.source === 'nws' &&
              validNWSProduct(
                row.nws_product,
                Date.parse(events.generated_at as string),
              ) &&
              row.nws_product.applicability_reason !== 'not_evaluated')),
      ) ||
      !validErrors(events.source_errors) ||
      !(
        events.source_states === undefined ||
        (Array.isArray(events.source_states) &&
          events.source_states.length <= 99 &&
          events.source_states.every(
            (row) =>
              object(row) &&
              boundedText(row.id, 128) &&
              stringIn(row.status, ['fresh', 'stale']) &&
              validSourceTime(row.retrieved_at) &&
              validSourceTime(row.fresh_until),
          ))
      ))
  )
    throw invalid()
  const operations = value.operational_status.data
  if (
    operations !== undefined &&
    (!object(operations) ||
      operations.schema_version !== 'live-operational-status.v1' ||
      !validSourceTime(operations.generated_at) ||
      !stringIn(operations.status, ['partial', 'unavailable']) ||
      !Array.isArray(operations.domains) ||
      operations.domains.length > 20 ||
      !operations.domains.every(
        (row) =>
          object(row) &&
          boundedText(row.domain, 128) &&
          stringIn(row.status, ['reported_live', 'stale', 'unavailable']) &&
          object(row.freshness) &&
          ['retrieved_at', 'fresh_until', 'expires_at'].every(
            (key) =>
              row.freshness &&
              object(row.freshness) &&
              (row.freshness[key] === undefined ||
                validSourceTime(row.freshness[key])),
          ),
      ) ||
      !validErrors(operations.source_errors))
  )
    throw invalid()
  // Only the validated, consumed contract is retained; raw adapter extras stay out of the cache.
  const snapshot = value as LifecycleEvidenceSnapshot
  return {
    schema_version: snapshot.schema_version,
    snapshot_id: snapshot.snapshot_id,
    generated_at: snapshot.generated_at,
    status: snapshot.status,
    ...(snapshot.valid_until ? { valid_until: snapshot.valid_until } : {}),
    planning_disclaimer: snapshot.planning_disclaimer,
    planning_location: {
      point: [...snapshot.planning_location.point],
      algorithm_version: snapshot.planning_location.algorithm_version,
    },
    event_triggers: {
      state: snapshot.event_triggers.state,
      status: snapshot.event_triggers.status,
      unavailable_count: snapshot.event_triggers.unavailable_count,
      ...(snapshot.event_triggers.error
        ? { error: snapshot.event_triggers.error }
        : {}),
      ...(snapshot.event_triggers.data
        ? {
            data: {
              schema_version: snapshot.event_triggers.data.schema_version,
              generated_at: snapshot.event_triggers.data.generated_at,
              status: snapshot.event_triggers.data.status,
              triggers: snapshot.event_triggers.data.triggers.map(
                ({
                  source,
                  lifecycle,
                  planning_state,
                  title,
                  nws_product,
                }) => ({
                  source,
                  lifecycle,
                  planning_state,
                  title,
                  ...(nws_product
                    ? { nws_product: structuredClone(nws_product) }
                    : {}),
                }),
              ),
              ...(snapshot.event_triggers.data.source_errors
                ? {
                    source_errors:
                      snapshot.event_triggers.data.source_errors.map(
                        ({ source, error }) => ({ source, error }),
                      ),
                  }
                : {}),
              ...(snapshot.event_triggers.data.source_states
                ? {
                    source_states:
                      snapshot.event_triggers.data.source_states.map(
                        ({ id, status, retrieved_at, fresh_until }) => ({
                          id,
                          status,
                          retrieved_at,
                          fresh_until,
                        }),
                      ),
                  }
                : {}),
            },
          }
        : {}),
    },
    operational_status: {
      state: snapshot.operational_status.state,
      status: snapshot.operational_status.status,
      unavailable_count: snapshot.operational_status.unavailable_count,
      ...(snapshot.operational_status.error
        ? { error: snapshot.operational_status.error }
        : {}),
      ...(snapshot.operational_status.data
        ? {
            data: {
              schema_version: snapshot.operational_status.data.schema_version,
              generated_at: snapshot.operational_status.data.generated_at,
              status: snapshot.operational_status.data.status,
              domains: snapshot.operational_status.data.domains.map(
                ({ domain, status, freshness }) => ({
                  domain,
                  status,
                  freshness: {
                    ...(freshness.retrieved_at
                      ? { retrieved_at: freshness.retrieved_at }
                      : {}),
                    ...(freshness.fresh_until
                      ? { fresh_until: freshness.fresh_until }
                      : {}),
                    ...(freshness.expires_at
                      ? { expires_at: freshness.expires_at }
                      : {}),
                  },
                }),
              ),
            },
          }
        : {}),
    },
    shelter_context: structuredClone(snapshot.shelter_context),
  }
}

function checkedEvidence(entry: CacheEntry): EvidenceCheck {
  return {
    snapshot: entry.snapshot,
    error: entry.error,
    checkedAt: entry.checkedAt,
    lastShelterSnapshot: entry.lastShelterSnapshot,
  }
}

export function displayedShelterEvidence(check: EvidenceCheck) {
  const unavailable =
    Boolean(check.error) ||
    !check.snapshot ||
    check.snapshot.shelter_context.coverage === 'unavailable'
  return {
    snapshot: unavailable
      ? (check.lastShelterSnapshot ?? check.snapshot)
      : check.snapshot,
    transport: unavailable ? ('unavailable' as const) : ('ok' as const),
  }
}

export function sourceReading(
  check: EvidenceCheck,
  itemId: string,
): SourceReading {
  const { snapshot, transport } = displayedShelterEvidence(check)
  const context = snapshot?.shelter_context
  const { items: _items, ...metadata } = context ?? { items: [] }
  return structuredClone({
    snapshotId: snapshot?.snapshot_id ?? null,
    generatedAt: snapshot?.generated_at ?? null,
    checkedAt: check.checkedAt,
    transport,
    context: context ? (metadata as Omit<ShelterContext, 'items'>) : null,
    claim: context?.items.find((item) => item.item_id === itemId) ?? null,
  })
}

export function evidenceFeedState(
  check: EvidenceCheck,
  feed: 'event_triggers' | 'operational_status',
  now: number,
) {
  const snapshot = check.snapshot
  if (!snapshot || check.error || snapshot[feed].state === 'unavailable')
    return 'unavailable'
  if (
    snapshot[feed].state === 'stale' ||
    (snapshot.valid_until && now >= Date.parse(snapshot.valid_until))
  )
    return 'stale'
  if (
    !snapshot.valid_until ||
    snapshot[feed].status !== 'complete' ||
    Date.parse(snapshot.generated_at) > now
  )
    return 'unknown'
  return 'fresh'
}

function coordinateKey(coordinates: [number, number]) {
  return `${coordinates[0]},${coordinates[1]}`
}

function entryFor(key: string) {
  let entry = cache.get(key)
  if (!entry) {
    entry = {
      snapshot: null,
      lastShelterSnapshot: null,
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
    (text) => parseLifecycleEvidenceJSON(text, coordinates),
  )
    .then((result) => {
      if (result.status === 'ok') {
        const snapshot = result.data
        entry.snapshot = snapshot
        if (snapshot.shelter_context.coverage !== 'unavailable')
          entry.lastShelterSnapshot = snapshot
      } else if (!entry.snapshot) {
        throw new Error('Evidence returned 304 without validated cached facts.')
      }
      entry.etag = result.etag
      entry.checkedAt = new Date().toISOString()
      entry.error = navigator.onLine
        ? null
        : 'Offline; source check is not current.'
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
    .then(() => checkedEvidence(entry))
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
  const [now, setNow] = useState(() => Date.now())
  const refresh = useCallback(() => {
    if (!navigator.onLine) {
      const entry = entryFor(key)
      entry.error = 'Offline; evidence was not checked.'
      entry.checkedAt = new Date().toISOString()
      notify(entry)
      return Promise.resolve(checkedEvidence(entry))
    }
    return loadEvidence(coordinates)
  }, [coordinates, key])

  useEffect(() => {
    const entry = entryFor(key)
    const listener = () => render((value) => value + 1)
    entry.listeners.add(listener)
    if (!navigator.onLine || (!entry.snapshot && !entry.request)) refresh()

    const refreshIfActive = () => {
      setNow(Date.now())
      if (document.visibilityState === 'visible' && navigator.onLine) refresh()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshIfActive()
    }
    window.addEventListener('focus', refreshIfActive)
    window.addEventListener('online', refreshIfActive)
    document.addEventListener('visibilitychange', onVisibility)
    const onOffline = () => {
      void refresh()
    }
    window.addEventListener('offline', onOffline)
    const interval = window.setInterval(refreshIfActive, 60_000)
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      entry.listeners.delete(listener)
      window.removeEventListener('focus', refreshIfActive)
      window.removeEventListener('online', refreshIfActive)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(interval)
      window.clearInterval(clock)
      window.removeEventListener('offline', onOffline)
    }
  }, [key, refresh])

  const entry = entryFor(key)
  const error =
    typeof navigator !== 'undefined' && !navigator.onLine
      ? 'Offline; evidence was not checked.'
      : entry.error
  return {
    status: error
      ? 'error'
      : entry.loading && !entry.snapshot
        ? 'loading'
        : 'ready',
    snapshot: entry.snapshot,
    error,
    checkedAt: entry.checkedAt,
    lastShelterSnapshot: entry.lastShelterSnapshot,
    lastKnown: Boolean(entry.snapshot && error),
    refreshing: Boolean(entry.snapshot && entry.loading),
    now,
    refresh,
  }
}
