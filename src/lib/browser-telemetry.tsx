import { useEffect } from 'react'

import { getBackendApiUrl } from './backend-api'

const telemetryVersion = 1
const flushIntervalMs = 5_000
const maxBatchSize = 40
const maxQueuedEvents = 200

const actions = [
  'navigation',
  'dom_content_loaded',
  'load',
  'hydration',
  'map_ready',
  'hazard_select',
  'severity_change',
  'area_select',
  'layer_toggle',
  'planning_brief_generate',
  'planning_brief_update',
  'field_packet_download',
  'collaboration_plan_save',
  'collaboration_version_save',
  'shelter_county_select',
  'shelter_provenance_open',
  'shelter_plan_retry',
  'resource_demand_duration',
  'resource_demand_standard',
  'resource_demand_retry',
  'partner_capability_select',
  'partner_provenance_open',
  'partner_match_retry',
  'event_trigger_select',
  'event_trigger_provenance_open',
  'event_trigger_retry',
  'live_status_select',
  'live_status_provenance_open',
  'live_status_retry',
  'replay_fixture_select',
  'replay_run',
  'replay_export',
  'replay_retry',
  'map_interact',
  'activate',
  'change',
  'submit',
  'keyboard',
] as const

const categories = [
  'page',
  'button',
  'link',
  'select',
  'range',
  'input',
  'checkbox',
  'map',
  'form',
  'planning',
  'document',
  'other',
] as const

type TelemetryAction = (typeof actions)[number]
type TelemetryCategory = (typeof categories)[number]
type TelemetryKind = 'page_load' | 'interaction' | 'interaction_timing'
type TelemetryOutcome = 'success' | 'error' | 'unknown'
type ViewportClass = 'small' | 'medium' | 'large'
type RouteTemplate = 'home' | 'other'

type BrowserTelemetryEvent = {
  kind: TelemetryKind
  action: TelemetryAction
  category: TelemetryCategory
  route: RouteTemplate
  viewport: ViewportClass
  outcome: TelemetryOutcome
  duration_ms?: number
}

const actionSet = new Set<string>(actions)
const categorySet = new Set<string>(categories)
const recordedLifecycleActions = new Set<TelemetryAction>()
let queuedEvents: BrowserTelemetryEvent[] = []
let flushTimer: number | undefined
let activeInstallation = false
let eventTimingObserver: PerformanceObserver | undefined

export function BrowserTelemetry() {
  useEffect(() => {
    try {
      return installBrowserTelemetry()
    } catch {
      return undefined
    }
  }, [])
  return null
}

export function markBrowserLifecycle(
  action: Extract<
    TelemetryAction,
    'hydration' | 'map_ready' | 'dom_content_loaded' | 'load' | 'navigation'
  >,
  durationMs?: number,
) {
  try {
    if (typeof window === 'undefined' || recordedLifecycleActions.has(action)) {
      return
    }
    recordedLifecycleActions.add(action)
    enqueue({
      kind: 'page_load',
      action,
      category: 'page',
      route: routeTemplate(),
      viewport: viewportClass(),
      outcome: 'success',
      duration_ms: sanitizeDuration(durationMs ?? performance.now()),
    })
  } catch {
    return
  }
}

function installBrowserTelemetry() {
  if (typeof window === 'undefined' || activeInstallation) {
    return () => undefined
  }
  activeInstallation = true

  recordNavigationMilestones()

  const interactionHandler = (event: Event) => {
    if (!event.isTrusted) return
    const target = event.target instanceof Element ? event.target : null
    const category = categoryForTarget(target)
    if (event.type === 'pointerup' && category !== 'map') return

    enqueue({
      kind: 'interaction',
      action: actionForEvent(event.type, target, category),
      category,
      route: routeTemplate(),
      viewport: viewportClass(),
      outcome: 'success',
      duration_ms: eventInputDelay(event),
    })
  }

  const interactionEvents = [
    'click',
    'input',
    'change',
    'submit',
    'keydown',
    'pointerup',
  ]
  for (const eventName of interactionEvents) {
    document.addEventListener(eventName, interactionHandler, true)
  }

  installEventTimingObserver()

  const flushOnHide = () => {
    if (document.visibilityState === 'hidden') flush(true)
  }
  const flushOnPageHide = () => flush(true)
  document.addEventListener('visibilitychange', flushOnHide)
  window.addEventListener('pagehide', flushOnPageHide)
  flushTimer = window.setInterval(() => flush(false), flushIntervalMs)

  return () => {
    activeInstallation = false
    for (const eventName of interactionEvents) {
      document.removeEventListener(eventName, interactionHandler, true)
    }
    document.removeEventListener('visibilitychange', flushOnHide)
    window.removeEventListener('pagehide', flushOnPageHide)
    eventTimingObserver?.disconnect()
    eventTimingObserver = undefined
    if (flushTimer !== undefined) window.clearInterval(flushTimer)
    flushTimer = undefined
  }
}

function recordNavigationMilestones() {
  const navigation = performance.getEntriesByType('navigation')[0] as
    PerformanceNavigationTiming | undefined
  markBrowserLifecycle(
    'navigation',
    navigation?.responseStart || performance.now(),
  )

  const recordDOMContentLoaded = () =>
    markBrowserLifecycle(
      'dom_content_loaded',
      navigation?.domContentLoadedEventEnd || performance.now(),
    )
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', recordDOMContentLoaded, {
      once: true,
    })
  } else {
    recordDOMContentLoaded()
  }

  const recordLoad = () =>
    markBrowserLifecycle('load', navigation?.loadEventEnd || performance.now())
  if (document.readyState === 'complete') {
    recordLoad()
  } else {
    window.addEventListener('load', recordLoad, { once: true })
  }

  markBrowserLifecycle('hydration')
}

function installEventTimingObserver() {
  if (typeof PerformanceObserver === 'undefined') return
  const supportedEntryTypes = PerformanceObserver.supportedEntryTypes as
    readonly string[] | undefined
  if (!supportedEntryTypes?.includes('event')) return

  eventTimingObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const eventEntry = entry as PerformanceEventTiming
      if (eventEntry.duration <= 0) continue
      const target =
        eventEntry.target instanceof Element ? eventEntry.target : null
      const category = categoryForTarget(target)
      enqueue({
        kind: 'interaction_timing',
        action: actionForEvent(eventEntry.name, target, category),
        category,
        route: routeTemplate(),
        viewport: viewportClass(),
        outcome: 'success',
        duration_ms: sanitizeDuration(eventEntry.duration),
      })
    }
  })
  try {
    eventTimingObserver.observe({
      type: 'event',
      buffered: true,
      durationThreshold: 16,
    } as PerformanceObserverInit & { durationThreshold: number })
  } catch {
    eventTimingObserver.disconnect()
    eventTimingObserver = undefined
  }
}

function enqueue(event: BrowserTelemetryEvent) {
  queuedEvents.push(event)
  if (queuedEvents.length > maxQueuedEvents) {
    queuedEvents = queuedEvents.slice(-maxQueuedEvents)
  }
  if (queuedEvents.length >= maxBatchSize) flush(false)
}

function flush(useBeacon: boolean) {
  if (queuedEvents.length === 0) return
  const events = queuedEvents.splice(0, maxBatchSize)
  const body = JSON.stringify({ version: telemetryVersion, events })
  const endpoint = `${getBackendApiUrl()}/api/v1/telemetry/browser`

  try {
    if (
      useBeacon &&
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon(
        endpoint,
        new Blob([body], { type: 'text/plain;charset=UTF-8' }),
      )
    ) {
      if (queuedEvents.length > 0) flush(true)
      return
    }

    void fetch(endpoint, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      keepalive: true,
      credentials: 'omit',
    }).catch(() => undefined)
    if (useBeacon && queuedEvents.length > 0) flush(true)
  } catch {
    // Telemetry is best effort and must never disrupt resident workflows.
  }
}

function actionForEvent(
  eventType: string,
  target: Element | null,
  category: TelemetryCategory,
): TelemetryAction {
  const controlledAction = target
    ?.closest('[data-telemetry-action]')
    ?.getAttribute('data-telemetry-action')
  if (controlledAction && actionSet.has(controlledAction)) {
    return controlledAction as TelemetryAction
  }
  if (category === 'map') return 'map_interact'
  if (eventType === 'change' || eventType === 'input') return 'change'
  if (eventType === 'submit') return 'submit'
  if (eventType === 'keydown' || eventType === 'keyup') return 'keyboard'
  return 'activate'
}

function categoryForTarget(target: Element | null): TelemetryCategory {
  const controlledCategory = target
    ?.closest('[data-telemetry-category]')
    ?.getAttribute('data-telemetry-category')
  if (controlledCategory && categorySet.has(controlledCategory)) {
    return controlledCategory as TelemetryCategory
  }
  const element = target?.closest('button,a,select,input,form')
  if (element instanceof HTMLButtonElement) return 'button'
  if (element instanceof HTMLAnchorElement) return 'link'
  if (element instanceof HTMLSelectElement) return 'select'
  if (element instanceof HTMLFormElement) return 'form'
  if (element instanceof HTMLInputElement) {
    if (element.type === 'range') return 'range'
    if (element.type === 'checkbox' || element.type === 'radio') {
      return 'checkbox'
    }
    return 'input'
  }
  if (target === document.documentElement || target === document.body) {
    return 'document'
  }
  return 'other'
}

function routeTemplate(): RouteTemplate {
  return window.location.pathname === '/' ? 'home' : 'other'
}

function viewportClass(): ViewportClass {
  if (window.innerWidth < 640) return 'small'
  if (window.innerWidth < 1024) return 'medium'
  return 'large'
}

function eventInputDelay(event: Event) {
  const now = performance.now()
  const eventTime =
    event.timeStamp > now + 60_000
      ? Date.now() - event.timeStamp
      : now - event.timeStamp
  return sanitizeDuration(eventTime)
}

function sanitizeDuration(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), 600_000)
}
