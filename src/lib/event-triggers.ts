import { useEffect, useMemo, useState } from 'react'

import { backendConditionalGet } from './backend-api'
import { rejectDuplicateKeys } from './record-digest'
import { boundedText, stringIn, validSourceTime } from './source-evidence'
import {
  nwsEligibility,
  nwsProductValidity,
  retrievalState,
  validNWSProduct,
} from './nws-product'
import type { NWSProduct } from './nws-product'

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
  nws_product?: NWSProduct
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
  source_states?: Array<{
    id: string
    status: 'fresh' | 'stale'
    retrieved_at: string
    fresh_until: string
  }>
}

export type EventTriggerState = {
  status: 'loading' | 'ready' | 'partial' | 'error'
  snapshot: EventTriggerSnapshot | null
  error: string | null
  now: number
  retry: () => void
}

let cachedSnapshot: EventTriggerSnapshot | null = null
let activeRequest: Promise<void> | null = null
let lastError: string | null = null
let etag: string | null = null
const listeners = new Set<() => void>()

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function parseEventTriggerSnapshotJSON(
  text: string,
): EventTriggerSnapshot {
  if (new TextEncoder().encode(text).length > 2 * 1024 * 1024)
    throw new Error('Event evidence exceeds the 2 MiB limit.')
  rejectDuplicateKeys(text)
  const value: unknown = JSON.parse(text)
  if (
    !object(value) ||
    value.schema_version !== 'event-trigger-snapshot.v1' ||
    !validSourceTime(value.generated_at) ||
    !stringIn(value.status, ['complete', 'partial']) ||
    ![
      'planning_disclaimer',
      'county_order_notice',
      'unavailable_meaning',
    ].every((key) => boundedText(value[key], 4096)) ||
    !Array.isArray(value.triggers) ||
    value.triggers.length > 2000 ||
    !value.triggers.every(
      (row) =>
        object(row) &&
        row.schema_version === 'event-trigger-snapshot.v1' &&
        validSourceTime(row.generated_at) &&
        stringIn(row.source, [
          'nws',
          'ptwc',
          'usgs_comcat',
          'usgs_hans',
          'county_order',
        ]) &&
        stringIn(row.lifecycle, [
          'active',
          'expired',
          'stale',
          'unavailable',
        ]) &&
        stringIn(row.planning_state, [
          'monitor',
          'prepare',
          'official_warning',
          'unavailable',
        ]) &&
        stringIn(row.jurisdiction_scope, [
          'statewide',
          'county',
          'multi_county',
          'offshore',
          'unknown',
        ]) &&
        stringIn(row.legal_order_status, [
          'not_an_evacuation_order',
          'unavailable',
        ]) &&
        [
          'hazard_event_kind',
          'authority_kind',
          'authority_limitation',
          'planning_consequence',
          'title',
        ].every((key) => boundedText(row[key], 4096)) &&
        object(row.facts) &&
        object(row.provenance) &&
        [
          'source_authority',
          'product_type',
          'source_status',
          'official_instructions_url',
        ].every(
          (key) =>
            object(row.provenance) && boundedText(row.provenance[key], 2048),
        ) &&
        (row.provenance.product_id === undefined ||
          boundedText(row.provenance.product_id, 2048)) &&
        validSourceTime(row.provenance.retrieved_at) &&
        ['issued_at', 'effective_at', 'expires_at', 'fresh_until'].every(
          (key) =>
            object(row.provenance) &&
            (row.provenance[key] === undefined ||
              (row.source === 'nws' && key !== 'fresh_until'
                ? typeof row.provenance[key] === 'string' &&
                  row.provenance[key].length > 0 &&
                  row.provenance[key].length <= 64
                : validSourceTime(row.provenance[key]))),
        ) &&
        (row.nws_product === undefined ||
          (row.source === 'nws' &&
            validNWSProduct(row.nws_product, Date.parse(row.generated_at)) &&
            row.nws_product.applicability === 'unknown' &&
            row.nws_product.applicability_reason === 'not_evaluated')),
    ) ||
    !(
      value.source_errors === undefined ||
      (Array.isArray(value.source_errors) &&
        value.source_errors.length <= 99 &&
        value.source_errors.every(
          (row) =>
            object(row) &&
            boundedText(row.source, 128) &&
            boundedText(row.error, 2048),
        ))
    ) ||
    !(
      value.source_states === undefined ||
      (Array.isArray(value.source_states) &&
        value.source_states.length <= 99 &&
        value.source_states.every(
          (row) =>
            object(row) &&
            boundedText(row.id, 128) &&
            stringIn(row.status, ['fresh', 'stale']) &&
            validSourceTime(row.retrieved_at) &&
            validSourceTime(row.fresh_until),
        ))
    )
  )
    throw new Error(
      'Malformed event evidence; retained validated last-known facts.',
    )
  return value as EventTriggerSnapshot
}

export function currentEventTrigger(
  trigger: EventTrigger,
  now: number,
  unavailable = false,
): EventTrigger {
  let lifecycle = trigger.lifecycle
  let planningConsequence: string | undefined
  if (trigger.source === 'nws') {
    const validity = trigger.nws_product
      ? nwsProductValidity(trigger.nws_product, now)
      : 'unknown'
    const eligibility = trigger.nws_product
      ? nwsEligibility(trigger.nws_product)
      : 'unknown'
    const retrieval = retrievalState(
      {
        status: trigger.provenance.source_status,
        retrieved_at: trigger.provenance.retrieved_at,
        fresh_until: trigger.provenance.fresh_until,
      },
      now,
      unavailable,
    )
    lifecycle =
      validity === 'expired'
        ? 'expired'
        : validity !== 'current' || eligibility !== 'eligible'
          ? 'unavailable'
          : retrieval === 'fresh'
            ? trigger.lifecycle
            : 'stale'
    planningConsequence =
      `Retained NWS product validity: ${validity.replaceAll('_', ' ')}. ` +
      `Message eligibility: ${eligibility.replaceAll('_', ' ')}. ` +
      `Retrieval: ${retrieval}. Planning-location applicability: unknown. ` +
      'Verify the official source; this is not an all-clear.'
  } else if (
    trigger.provenance.expires_at &&
    now >= Date.parse(trigger.provenance.expires_at)
  ) {
    lifecycle = 'expired'
  } else if (
    trigger.lifecycle === 'active' &&
    (unavailable ||
      !validSourceTime(trigger.provenance.fresh_until) ||
      now >= Date.parse(trigger.provenance.fresh_until))
  ) {
    lifecycle = 'stale'
  }
  if (lifecycle === trigger.lifecycle && lifecycle === 'active') return trigger
  return {
    ...trigger,
    lifecycle,
    planning_state: 'unavailable',
    planning_consequence:
      planningConsequence ??
      `Source evidence status: ${lifecycle}. Verify the official source; this is not an all-clear.`,
  }
}

function notify() {
  for (const listener of listeners) listener()
}

function loadSnapshot() {
  if (!navigator.onLine) {
    lastError = 'Offline; showing last-known source facts.'
    notify()
    return Promise.resolve()
  }
  if (activeRequest) return activeRequest
  activeRequest = backendConditionalGet(
    '/api/v1/planning/event-triggers',
    {},
    etag,
    parseEventTriggerSnapshotJSON,
  )
    .then((result) => {
      if (result.status === 'ok') cachedSnapshot = result.data
      else if (!cachedSnapshot)
        throw new Error(
          'Event evidence returned 304 without validated cached facts.',
        )
      etag = result.etag
      lastError = navigator.onLine
        ? null
        : 'Offline; showing last-known source facts.'
    })
    .catch((error: unknown) => {
      lastError =
        error instanceof Error ? error.message : 'Event evidence check failed.'
    })
    .finally(() => {
      activeRequest = null
      notify()
    })
  return activeRequest
}

export function useEventTriggers(): EventTriggerState {
  const [, render] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const listener = () => render((value) => value + 1)
    listeners.add(listener)
    void loadSnapshot()
    const refresh = () => {
      setNow(Date.now())
      if (document.visibilityState === 'visible') void loadSnapshot()
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    window.addEventListener('offline', refresh)
    document.addEventListener('visibilitychange', refresh)
    const timer = window.setInterval(refresh, 60_000)
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      listeners.delete(listener)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
      window.removeEventListener('offline', refresh)
      document.removeEventListener('visibilitychange', refresh)
      window.clearInterval(timer)
      window.clearInterval(clock)
    }
  }, [])

  const error =
    typeof window !== 'undefined' && !navigator.onLine
      ? 'Offline; showing last-known source facts.'
      : lastError
  const snapshot = useMemo(
    () =>
      cachedSnapshot && {
        ...cachedSnapshot,
        triggers: cachedSnapshot.triggers.map((trigger) =>
          currentEventTrigger(trigger, now, Boolean(error)),
        ),
      },
    [cachedSnapshot, now, error],
  )
  return {
    snapshot,
    error,
    now,
    retry: loadSnapshot,
    status: error
      ? 'error'
      : snapshot
        ? snapshot.status === 'partial'
          ? 'partial'
          : 'ready'
        : 'loading',
  }
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
