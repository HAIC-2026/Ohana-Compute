import { useEffect, useState } from 'react'

import { backendGet } from './backend-api'
import type { BackendSourceStatus } from './backend-api'
import {
  getCommunityProfile,
  getCommunityProfileStatus,
} from './community-profile'
import type {
  CommunityProfile,
  CommunityProfileState,
  CommunitySource,
} from './community-profile'
import type { HazardId, PlanningArea } from './mock-data'

function sviVintage(profile: CommunityProfile | null | undefined) {
  const source = profile?.svi?.source
  // The backend's cdc-svi-2022 adapter is pinned to the CDC 2022 tract service.
  return (
    source?.vintage?.trim() ||
    (source?.id === 'cdc-svi-2022' ? '2022' : undefined)
  )
}

export type FocusTier = 'review-first' | 'review-locally' | 'verify'
export type GeographicFocus = {
  tier: FocusTier
  label: string
  reason: string
  action: string
  evidence: string
  signals: {
    sviPercentile: number | null
    hazard: PointHazardScreen['status']
    hazardReason: string
  }
}

export type PointHazardScreen = {
  sources?: Array<{ authority: string; url: string }>
  status: 'elevated' | 'other-mapped' | 'unknown'
  reason: string
  evidence: string
  freshUntil: number
}

type PointRiskResponse = {
  classification?: string
  status?: string
  rating?: string
  sources?: BackendSourceStatus[]
}

export function assessPointHazard(
  result: PointRiskResponse,
  hazard: HazardId,
  now = Date.now(),
): PointHazardScreen {
  const sources = result.sources ?? []
  const freshUntil = Math.min(
    ...sources.map((source) => Date.parse(source.fresh_until)),
  )
  const evidence = sources
    .map((source) => `${source.authority} · checked ${source.retrieved_at}`)
    .join(' · ')
  const unknown: PointHazardScreen = {
    sources: sources.map(({ authority, url }) => ({ authority, url })),
    status: 'unknown',
    reason:
      'Hazard evidence unavailable, unmapped or stale at the area center.',
    evidence,
    freshUntil: 0,
  }
  if (
    !sources.length ||
    !Number.isFinite(freshUntil) ||
    freshUntil <= now ||
    sources.some((source) => source.status !== 'fresh')
  )
    return unknown

  if (hazard === 'flood' || hazard === 'hurricane') {
    const classification = result.classification
    if (
      !classification ||
      !['high', 'moderate', 'lower-mapped'].includes(classification)
    )
      return unknown
    return {
      sources: unknown.sources,
      status: classification === 'high' ? 'elevated' : 'other-mapped',
      reason: `${classification === 'lower-mapped' ? 'Lower' : classification === 'high' ? 'High' : 'Moderate'} mapped flood classification at the area center.${hazard === 'hurricane' ? ' Flood screening only; wind and surge are not assessed.' : ''} Not a current flood forecast.`,
      evidence,
      freshUntil,
    }
  }
  if (hazard === 'tsunami') {
    if (result.status !== 'inside' && result.status !== 'outside')
      return unknown
    return {
      sources: unknown.sources,
      status: result.status === 'inside' ? 'elevated' : 'other-mapped',
      reason: `Area center is ${result.status} the mapped tsunami evacuation zone. Not an evacuation order or an all-clear.`,
      evidence,
      freshUntil,
    }
  }
  if (!result.rating || !['High', 'Medium', 'Low'].includes(result.rating))
    return unknown
  return {
    sources: unknown.sources,
    status: result.rating === 'High' ? 'elevated' : 'other-mapped',
    reason: `${result.rating} mapped wildfire risk at the area center. Not a current fire perimeter or warning.`,
    evidence,
    freshUntil,
  }
}

const hazardActions: Record<HazardId, string> = {
  hurricane:
    'Confirm wind-safe shelter, backup power and accessible pickup plans.',
  flood: 'Verify low-crossing access, accessible pickup and shelter routes.',
  tsunami:
    'Verify official evacuation zones and accessible routes to safe areas.',
  wildfire:
    'Verify current warnings, smoke-safe shelter and accessible evacuation routes.',
}

export function analyzeGeographicFocus(
  state: CommunityProfileState | undefined,
  hazard: HazardId,
  now = Date.now(),
  pointHazard?: PointHazardScreen,
): GeographicFocus {
  const profile = state?.profile
  const svi = profile?.svi
  const percentile = svi?.overall_percentile
  const usable =
    state?.status === 'ready' &&
    svi !== undefined &&
    isCurrentSource(svi.source, now) &&
    Boolean(sviVintage(profile)) &&
    /\bCensus Tract\b/i.test(svi.location) &&
    typeof percentile === 'number' &&
    Number.isFinite(percentile) &&
    percentile >= 0 &&
    percentile <= 1 &&
    !profile?.source_errors?.length &&
    [profile?.acs, profile?.empower, profile?.fema_national_risk].every(
      (source) => isCurrentSource(source?.source, now),
    )
  const evidence = svi
    ? `${svi.source.authority} · ${sviVintage(profile) || 'vintage unavailable'} release · ${svi.location} · ${svi.source.status}`
    : 'SVI tract evidence unavailable'
  const currentHazard =
    pointHazard && pointHazard.freshUntil > now ? pointHazard : undefined
  const signals: GeographicFocus['signals'] = {
    sviPercentile: usable ? percentile : null,
    hazard: currentHazard?.status ?? 'unknown',
    hazardReason:
      currentHazard?.reason ??
      'Hazard evidence unavailable, unmapped or stale at the area center.',
  }

  if (!usable) {
    return {
      signals,
      tier: 'verify',
      label:
        state?.status === 'loading' || !state
          ? 'Loading evidence'
          : 'Verify evidence',
      reason:
        state?.status === 'loading' || !state
          ? 'Public indicators are being checked.'
          : 'Missing, partial, stale or incompatible evidence. Priority is unknown, not low.',
      action: `County lead: verify local evidence before comparing. ${hazardActions[hazard]}`,
      evidence,
    }
  }
  if (
    !pointHazard ||
    pointHazard.status === 'unknown' ||
    pointHazard.freshUntil <= now
  ) {
    return {
      signals,
      tier: 'verify',
      label: 'Verify hazard evidence',
      reason:
        'Public vulnerability indicators are available, but hazard priority is unknown. Check mapped coverage at the area center.',
      action: `County lead: ${hazardActions[hazard]}`,
      evidence: `${evidence} · ${pointHazard?.evidence || 'Hazard source unavailable'}`,
    }
  }
  const elevated = percentile >= 0.75 && pointHazard.status === 'elevated'
  return {
    signals,
    tier: elevated ? 'review-first' : 'review-locally',
    label: elevated
      ? 'Review first · provisional'
      : 'Review locally · provisional',
    reason: `${pointHazard.reason} SVI ${(percentile * 100).toFixed(1)}th national percentile${percentile >= 0.75 ? ' (highest quarter)' : ''}; social vulnerability, not an exposed-population estimate.`,
    action: `County lead: ${hazardActions[hazard]}`,
    evidence: `${evidence} · ${pointHazard.evidence}`,
  }
}

function isCurrentSource(source: CommunitySource | undefined, now: number) {
  if (source?.status !== 'fresh') return false
  if (!source.fresh_until) return true
  const expiry = Date.parse(source.fresh_until)
  return Number.isFinite(expiry) && expiry > now
}

export function orderGeographicFocus<
  T extends { area: PlanningArea; focus: GeographicFocus },
>(entries: T[]): T[] {
  const order: Record<FocusTier, number> = {
    'review-first': 0,
    'review-locally': 1,
    verify: 2,
  }
  return [...entries].sort(
    (a, b) =>
      order[a.focus.tier] - order[b.focus.tier] ||
      a.area.name.localeCompare(b.area.name, 'en'),
  )
}

export function summarizeGeographicFocus(
  entries: Array<{ focus: GeographicFocus }>,
) {
  const counts: Record<FocusTier, number> = {
    'review-first': 0,
    'review-locally': 0,
    verify: 0,
  }
  for (const { focus } of entries) counts[focus.tier]++
  return {
    counts,
    total: entries.length,
    finding: !entries.length
      ? 'No area centers in this scope.'
      : counts['review-first'] > 0
        ? counts.verify > 0
          ? 'Review centers with both screening signals; verify unknowns in parallel.'
          : 'Start with centers where both screening signals support local review.'
        : counts.verify > 0
          ? 'Resolve evidence gaps before drawing an island-wide conclusion.'
          : 'No center meets both review-first signals. This is not an all-clear.',
  }
}

export function planningCountyForIsland(island: string) {
  if (island === 'Oʻahu') return 'Honolulu'
  if (island === 'Kauaʻi' || island === 'Niʻihau') return 'Kauai'
  if (island === 'Hawaiʻi') return 'Hawaii'
  if (['Maui', 'Molokaʻi', 'Lānaʻi', 'Kahoʻolawe'].includes(island))
    return 'Maui'
  return null
}

export function buildGeographicFocus(
  areas: PlanningArea[],
  profiles: Partial<Record<string, CommunityProfileState>>,
  hazard: HazardId,
  pointHazards: Partial<Record<string, PointHazardScreen>> = {},
) {
  const vintages = new Set(
    areas.map((area) => sviVintage(profiles[area.id]?.profile)).filter(Boolean),
  )
  return areas.map((area) => {
    const state = profiles[area.id]
    const focus = analyzeGeographicFocus(
      state,
      hazard,
      Date.now(),
      pointHazards[area.id],
    )
    const county = planningCountyForIsland(area.island)
    const location = state?.profile?.svi?.location.replace(/[ʻ’']/g, '') ?? ''
    if (
      focus.signals.sviPercentile !== null &&
      (!county ||
        vintages.size > 1 ||
        !location.toLowerCase().includes(`${county.toLowerCase()} county`))
    ) {
      return {
        area,
        focus: {
          ...focus,
          signals: { ...focus.signals, sviPercentile: null },
          tier: 'verify' as const,
          label: 'Verify evidence',
          reason:
            'Incompatible source vintage or county geography. Priority is unknown, not low.',
          action: `County lead: reconcile source geography and dates. ${hazardActions[hazard]}`,
        },
      }
    }
    return { area, focus }
  })
}

const pointRequests = new Map<string, Promise<PointHazardScreen>>()
const pointCache = new Map<string, PointHazardScreen>()
let activeRequests = 0
const waitingRequests: Array<() => void> = []

function limitedFocusRequest<T>(load: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = () => {
      activeRequests++
      void Promise.resolve()
        .then(load)
        .then(resolve, reject)
        .finally(() => {
          activeRequests--
          waitingRequests.shift()?.()
        })
    }
    if (activeRequests < 3) start()
    else waitingRequests.push(start)
  })
}

export function useGeographicEvidenceExpiry(
  profiles: Partial<Record<string, CommunityProfileState>>,
  hazards: Partial<Record<string, PointHazardScreen>>,
  enabled: boolean,
) {
  const [version, revalidate] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const now = Date.now()
    const expiries = [
      ...Object.values(hazards).map((screen) => screen?.freshUntil ?? 0),
      ...Object.values(profiles).flatMap((state) =>
        [
          state?.profile?.acs,
          state?.profile?.svi,
          state?.profile?.empower,
          state?.profile?.fema_national_risk,
        ].map((entry) => Date.parse(entry?.source.fresh_until ?? '')),
      ),
    ].filter((expiry) => Number.isFinite(expiry) && expiry > now)
    if (!expiries.length) return
    const timeout = window.setTimeout(
      () => revalidate((version) => version + 1),
      Math.min(Math.min(...expiries) - now + 1, 2_147_483_647),
    )
    return () => window.clearTimeout(timeout)
  }, [profiles, hazards, enabled, version])
}

export function useGeographicHazards(
  areas: PlanningArea[],
  hazard: HazardId,
  enabled: boolean,
) {
  const [results, setResults] = useState<
    Partial<Record<string, PointHazardScreen>>
  >({})
  useEffect(() => {
    if (!enabled) return
    let active = true
    const isActive = () => active
    let next = 0
    const endpoint = hazard === 'hurricane' ? 'flood' : hazard
    async function worker() {
      while (isActive() && next < areas.length) {
        const area = areas[next++]
        const key = `${hazard}:${area.id}`
        const cached = pointCache.get(key)
        let screen = cached && cached.freshUntil > Date.now() ? cached : null
        if (!screen) {
          screen = await limitedFocusRequest(() => {
            if (!isActive()) return Promise.resolve(null)
            let request = pointRequests.get(key)
            if (!request) {
              request = backendGet<PointRiskResponse>(
                `/api/v1/risk/${endpoint}`,
                {
                  lat: area.coordinates[1],
                  lon: area.coordinates[0],
                },
              )
                .then((response) => assessPointHazard(response, hazard))
                .catch(() => assessPointHazard({}, hazard))
                .finally(() => pointRequests.delete(key))
              pointRequests.set(key, request)
            }
            return request
          })
          if (!screen) return
          if (screen.status !== 'unknown') pointCache.set(key, screen)
        }
        if (!isActive()) return
        setResults((previous) => ({ ...previous, [key]: screen }))
      }
    }
    void Promise.all(Array.from({ length: Math.min(3, areas.length) }, worker))
    return () => {
      active = false
    }
  }, [areas, hazard, enabled])
  return Object.fromEntries(
    areas.map((area) => [area.id, results[`${hazard}:${area.id}`]]),
  )
}

export function useGeographicProfiles(areas: PlanningArea[], enabled: boolean) {
  const [profiles, setProfiles] = useState<
    Partial<Record<string, CommunityProfileState>>
  >({})
  useEffect(() => {
    if (!enabled) return
    let active = true
    const isActive = () => active
    let next = 0
    async function worker() {
      while (isActive() && next < areas.length) {
        const area = areas[next++]
        let profile: CommunityProfile | null = null
        try {
          profile = await limitedFocusRequest(() =>
            isActive()
              ? getCommunityProfile(area.coordinates)
              : Promise.resolve(null),
          )
        } catch {
          // A failed source stays unknown; there is no automatic retry.
        }
        if (!isActive()) return
        const status = profile
          ? getCommunityProfileStatus(profile)
          : 'unavailable'
        setProfiles((previous) => ({
          ...previous,
          [area.id]: { status, profile },
        }))
      }
    }
    void Promise.all(Array.from({ length: Math.min(3, areas.length) }, worker))
    return () => {
      active = false
    }
  }, [areas, enabled])
  return profiles
}
