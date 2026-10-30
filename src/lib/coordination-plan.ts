import type { CommunityProfile } from './community-profile'
import type { CountyShelterPlan } from './county-shelter-plans'
import type { EventTrigger } from './event-triggers'
import type { HazardId } from './mock-data'
import type { PointHazardScreen } from './geographic-focus'
import type { PartnerMatchResponse } from './partner-matching'
import type { ResourceDemandResponse } from './resource-demand'

export type CoordinationEvidence = {
  areaId: string
  areaName: string
  countyId: string
  countyName: string
  coordinates: [number, number] | null
  profile: CommunityProfile | null
  demand: ResourceDemandResponse | null
  partners: PartnerMatchResponse | null
  errors: string[]
}

export const hazardTiming: Record<
  HazardId,
  { window: string; before: string; during: string; after: string }
> = {
  hurricane: {
    window:
      'Days may be available. Practice sequence: review at 72 hours, stage at 48 hours, recheck at 24 hours before expected impacts. Official forecasts and County deadlines override these assumptions.',
    before:
      'Pre-position accessible shelter supplies, feeding, medication continuity and equipment-specific backup power; complete assisted transport before County travel cutoffs.',
    during:
      'Shelter and do not drive during dangerous winds or flooding. County emergency instructions govern any necessary movement.',
    after:
      'Wait for County clearance; verify roads, power and accessible return destinations before arranging transport.',
  },
  flood: {
    window:
      'Flash flooding can develop in minutes. Agreements, accessible warnings and transport contingencies must already exist; do not assume a preparation window.',
    before:
      'Before flood season, verify low-crossing alternatives, accessible receiving sites and trusted warning channels. Pre-position away from flood exposure.',
    during:
      'Shelter away from floodwater as directed; never drive through flooded roads. Follow official warnings and County instructions for immediate protective action.',
    after:
      'Require County route and building checks; reconnect displaced residents with medication, caregivers and clean water.',
  },
  wildfire: {
    window:
      'Minutes or no warning may be available. Accessible evacuation and smoke-safe receiving arrangements must already exist, not be assembled after ignition.',
    before:
      'Pre-agree accessible transport, smoke-safe receiving locations, caregiver continuity and backup communications before fire weather.',
    during:
      'Follow immediate County evacuation instructions. Do not start uncoordinated trips into fire or smoke; shelter only where authorities direct.',
    after:
      'County controls re-entry. Verify smoke, utilities, accessible housing and replacement assistive equipment before reconnecting households.',
  },
  tsunami: {
    window:
      'Local tsunami: minutes or no official warning. Strong or long shaking and other natural warning signs require immediate protective action under official guidance. A distant-source event may allow hours; never assume that lead time.',
    before:
      'Before any event, rehearse accessible evacuation out of mapped zones, caregiver support and routes on foot or with mobility assistance. Do not wait to assemble a new transport plan.',
    during:
      'Follow official tsunami and natural-warning guidance immediately; do not wait for this tool. Avoid uncoordinated driving and stay out of evacuation zones until the official all-clear.',
    after:
      'Wait for the official all-clear; multiple waves are possible. County verifies receiving sites, return routes and reunification arrangements.',
  },
}

export function usableTrigger(
  trigger: EventTrigger,
  hazard: HazardId,
  now: number,
) {
  const terms: Record<HazardId, RegExp> = {
    hurricane: /hurricane|tropical|cyclone/i,
    flood: /flood/i,
    wildfire: /wildfire|fire weather|red flag/i,
    tsunami: /tsunami/i,
  }
  const fresh = Date.parse(trigger.provenance.fresh_until ?? '')
  const expires = trigger.provenance.expires_at
  return (
    trigger.lifecycle === 'active' &&
    trigger.provenance.source_status === 'fresh' &&
    Number.isFinite(fresh) &&
    fresh > now &&
    (!expires || Date.parse(expires) > now) &&
    terms[hazard].test(`${trigger.hazard_event_kind} ${trigger.title}`) &&
    trigger.source !== 'county_order' &&
    trigger.source !== 'nws' &&
    trigger.jurisdiction_scope === 'statewide'
  )
}

export function buildTimeline(hazard: HazardId) {
  const timing = hazardTiming[hazard]
  return [
    {
      phase: 'Before · pre-position',
      action: timing.before,
      lead: 'County emergency management / mass-care lead',
      support:
        'State ESF-6 (HI-EMA + DHS): support County requests and coordinate unmet needs across jurisdictions.',
      partners:
        'Shelter, feeding, health, disability and community organizations: verify capability, capacity and activation with the County.',
      decision: 'County decides whether to stage or activate resources.',
      evidence:
        'Official forecast or standing little-notice plan; receiving-site accessibility, power, staffing, transport and route verification.',
      when: 'Before hazard onset and before the County travel cutoff; already agreed for little-notice events.',
    },
    {
      phase: 'During · shelter, do not drive',
      action: timing.during,
      lead: 'County incident command / emergency management',
      support:
        'State ESF-6: coordinate requested shelter, feeding and AFN support; do not issue County movement decisions.',
      partners:
        'Activated partners report aggregate unmet needs, accessibility barriers and verified remaining capacity through County coordination.',
      decision:
        'County decides protective actions, site opening/closure and any movement; official natural-warning guidance still applies.',
      evidence:
        'Official warnings and orders; verified site conditions, staffing, route status and accessible communications.',
      when: 'At each official warning update or material change in site or route conditions.',
    },
    {
      phase: 'After · recover, reconnect',
      action: timing.after,
      lead: 'County recovery / mass-care lead',
      support:
        'State ESF-6: support continuing shelter, feeding, human services and unresolved inter-County requests.',
      partners:
        'Community and human-services partners support voluntary reunification, accessible recovery information and referrals.',
      decision:
        'County decides re-entry and transition from emergency shelter to recovery support.',
      evidence:
        'Official all-clear where applicable; verified safe access, housing, utilities, caregiver and medical continuity.',
      when: 'Only after official clearance and reassessment; continue until remaining gaps have a County-owned handoff.',
    },
  ]
}

export function buildReachPlan(profile: CommunityProfile | null) {
  return {
    geography: profile?.acs?.geography.name ?? 'ACS tract unknown',
    source: profile?.acs?.source ?? null,
    languageTable: '2024 ACS 5-year B16001, population age 5 and older',
    languageSource: 'https://data.census.gov/table/ACSDT5Y2024.B16001',
    languages: profile?.acs?.languages ?? [],
    limitation:
      'Selected ACS language groups, not an exhaustive language inventory or individual preferences. Grouped Austronesian data cannot distinguish Ilocano, Samoan, Hawaiian or other languages. Confirm specific languages and dialects with local organizations; zero or missing estimates do not rule out a need.',
    formats: [
      'Qualified ASL interpretation and captions',
      'Screen-reader-accessible text and large print',
      'Plain-language read-aloud / audio',
    ],
    channels: [
      'County radio / broadcast partners',
      'Printed notices at locally verified accessible sites',
      'Trusted community, faith and disability messengers',
      'Low-bandwidth text where available; do not rely on internet alone',
    ],
    owner:
      'County public information / language-access lead approves messages; partners validate language and channel reach; State ESF-6 supports unmet requests.',
    guidance:
      'Draft for County review: shelters serve everyone. Confirm actual access arrangements; use trauma-informed, non-stigmatizing wording, explain what to expect, and do not promise immigration, confidentiality or eligibility policies that have not been verified. No names, immigration status or individual needs collected here.',
    review:
      'No machine translation of life-safety messages. Qualified language review, disability-access review and County approval are required before release.',
  }
}

export function buildAfnAnnex(
  evidence: CoordinationEvidence,
  hazard: HazardId,
  trigger: EventTrigger | null,
  countyPlan: CountyShelterPlan | undefined,
  now: number,
  hazardScreen?: PointHazardScreen,
) {
  const currentTrigger =
    trigger && usableTrigger(trigger, hazard, now) ? trigger : null
  return {
    schema_version: 'county-afn-annex-draft.v1',
    generated_at: new Date(now).toISOString(),
    status: 'UNSENT DRAFT — COUNTY REVIEW REQUIRED',
    authority:
      'Counties lead mass care; State ESF-6 (HI-EMA + DHS) supports. Not an approved annex, evacuation order, activation or dispatch.',
    purpose_and_scope: {
      county: evidence.countyName,
      representative_area: evidence.areaName,
      area_id: evidence.areaId,
      limitation:
        'Representative area-center Census tract, not County totals or complete island coverage.',
      hazard,
    },
    situation_and_assumptions: {
      mode: currentTrigger
        ? 'official statewide trigger context; actions remain a planning draft'
        : 'practice scenario — not a live event',
      trigger: currentTrigger,
      timing: hazardTiming[hazard].window,
      county_shelter_plan: countyPlan ?? null,
    },
    map_and_needs: {
      coordinates: evidence.coordinates,
      coordinate_scope: 'Representative area center, not a resident location',
      hazard_screen:
        hazardScreen && hazardScreen.freshUntil > now
          ? hazardScreen
          : {
              status: 'unknown',
              reason:
                'Current mapped hazard evidence unavailable or stale. Not a forecast.',
            },
      aggregate_profile: evidence.profile,
    },
    resource_model: evidence.demand,
    partner_matches: evidence.partners,
    concept_of_operations: buildTimeline(hazard),
    resident_communications: buildReachPlan(evidence.profile),
    administration_and_review: {
      county_approval: 'Pending — no approval recorded',
      operational_capacity:
        'Unknown — directory matches and practice supplies are not available resources.',
      remaining_gaps: evidence.errors,
      maintenance:
        'County reviews source dates, assumptions, site capacity, partner activation and communications before each use and after material changes.',
      privacy:
        'Public de-identified aggregates only. Do not add individual records. This download is local and nothing is sent.',
    },
  }
}
