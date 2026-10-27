import type { FeatureCollection, Point, Polygon } from 'geojson'

export type HazardId = 'tsunami' | 'wildfire' | 'flood' | 'hurricane'
export type LayerId =
  'mobility' | 'medical-power' | 'language' | 'transportation' | 'shelters'

export type PlanningArea = {
  id: string
  name: string
  island: string
  coordinates: [number, number]
  population: number
  exposedPopulation: number
  households: number
  readiness: number
  change: number
  summary: string
  cmist: Array<{ category: string; value: number }>
  showOnStatewideMap?: boolean
  responseFocus?: Partial<Record<HazardId, string>>
  communities?: string[]
}

export type LocalReliefStep = {
  title: string
  owner: string
  timing: string
}

export type NeighborhoodPlan = {
  id: string
  name: string
  areaId: string
  coordinates: [number, number]
  zoom: number
  summary: string
  localFacts: Array<{ label: string; value: string }>
  hazardPlans: Partial<
    Record<
      HazardId,
      {
        summary: string
        steps: LocalReliefStep[]
      }
    >
  >
}

export type PostalLocation = {
  postalCode: string
  name: string
  county: string
  island: string
  coordinates: [number, number]
  zoom: number
  areaId: string
  summary: string
  localFacts: Array<{ label: string; value: string }>
  planningZones: NeighborhoodPlan[]
}

export type ScenarioView = {
  exposedPopulation: number
  readiness: number
  validationCount: number
  primarySignal: string
  cmist: Array<{ category: string; value: number }>
}

export type ChallengeSnapshot = {
  topNeeds: string[]
  sheltersNearby: number
  backupPowerSites: number
  transportTeams: number
  routesToVerify: number
}

export type LocalResourceSite = {
  id: string
  name: string
  areaId: string
  coordinates: [number, number]
  kind: 'shelter' | 'medical-power' | 'transport'
  capacity: number
  capabilities: string[]
  status: 'confirmed' | 'needs-confirmation'
}

export type LocalRouteCheck = {
  name: string
  status: 'clear' | 'needs-confirmation'
}

export type NeighborhoodBriefing = {
  id: string
  areaId: string
  name: string
  summary: string
  closestResources: Array<{
    name: string
    kind: string
    distance: string
    note: string
  }>
  routes: Array<{
    name: string
    purpose: string
  }>
  trafficHazards: string[]
  coordination: {
    decisionOwner: string
    communicationPath: string
    afnActions: string[]
  }
  evidence: {
    status: 'Practice estimate' | 'County-validated'
    basis: string
    updated: string
    validation: string
  }
  decisions: Partial<
    Record<
      HazardId,
      {
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
    >
  >
}

export type ResidentResourceKind =
  'shelter' | 'food-water' | 'medical-power' | 'accessible-transport'

export type ResidentTravelOption = {
  label: string
  eta: string
  distance: string
  steps: string[]
  avoid: string[]
  coordinates: Array<[number, number]>
  segments?: Array<{
    mode: 'drive' | 'walk' | 'transit'
    label: string
    coordinates: Array<[number, number]>
  }>
  transit?: {
    route: string
    headsign: string
    boardStop: string
    boardCoordinates: [number, number]
    exitStop: string
    exitCoordinates: [number, number]
    stops: number
    scheduleBasis: string
    realtimeStatus: string
  }
}

export type ResidentResource = {
  id: string
  name: string
  kind: ResidentResourceKind
  coordinates: [number, number]
  status: string
  available: string
  accessibility: string
  languages: string[]
  drive: ResidentTravelOption
  noCar: ResidentTravelOption
}

export type ResidentRoutePlan = {
  id: string
  neighborhoodId: string
  areaId: string
  name: string
  searchTerms: string[]
  startLabel: string
  startCoordinates: [number, number]
  whatMayHappen: string[]
  floodWarning: string
  floodZones: Array<{
    name: string
    coordinates: Array<[number, number]>
  }>
  stayOrGo: string
  resources: ResidentResource[]
}

export type Hazard = {
  id: HazardId
  label: string
  shortLabel: string
  description: string
  timeline: string
}

export type ActiveEvent = {
  id: string
  name: string
  hazard: HazardId
  severity: number
  status: 'Watch' | 'Warning' | 'Monitoring'
  arrival: string
  trend: 'Strengthening' | 'Steady' | 'Weakening'
  confidence: 'High' | 'Medium'
  updated: string
  summary: string
  dominantThreats: string[]
  publicGuidance: string[]
  needAdjustments: Record<string, number>
  exposureFactor: number
  readinessPenalty: number
  firstAction: string
}

export const hazards: Hazard[] = [
  {
    id: 'tsunami',
    label: 'Tsunami',
    shortLabel: 'Tsunami',
    description: 'Coastal evacuation exposure and transportation constraints.',
    timeline: '0–6 hours',
  },
  {
    id: 'wildfire',
    label: 'Wildfire',
    shortLabel: 'Fire',
    description:
      'Fast-moving fire risk, smoke exposure, and constrained egress.',
    timeline: '0–24 hours',
  },
  {
    id: 'flood',
    label: 'Flood',
    shortLabel: 'Flood',
    description: 'Flash flooding, road isolation, and shelter-in-place needs.',
    timeline: '6–48 hours',
  },
  {
    id: 'hurricane',
    label: 'Hurricane',
    shortLabel: 'Storm',
    description: 'Wind, surge, extended outages, and island-wide logistics.',
    timeline: '48–120 hours',
  },
]

export const activeEvents: ActiveEvent[] = [
  {
    id: 'hurricane-lala',
    name: 'Hurricane Lala',
    hazard: 'hurricane',
    severity: 4,
    status: 'Warning',
    arrival: 'Damaging conditions possible in 48–72 hours',
    trend: 'Strengthening',
    confidence: 'High',
    updated: 'Practice update · 4:00 PM HST',
    summary:
      'Lala is approaching from the southeast with increasing wind, heavy rain, coastal surge, and a high likelihood of extended power interruptions.',
    dominantThreats: [
      'Damaging winds before the center arrives',
      'Heavy rain and flash flooding',
      'South- and east-facing coastal surge',
      'Multi-day power and communication outages',
    ],
    publicGuidance: [
      'Finish travel and supply pickup before tropical-storm-force winds begin.',
      'Prepare for at least three days without power or reliable communications.',
      'Know whether your nearest shelter has backup power and accessible transportation.',
    ],
    needAdjustments: {
      Communication: 10,
      Medical: 16,
      Independence: 12,
      Safety: 11,
      Transportation: 9,
    },
    exposureFactor: 1.18,
    readinessPenalty: 10,
    firstAction:
      'Confirm powered shelter and accessible transportation capacity before damaging winds arrive.',
  },
  {
    id: 'storm-nolo',
    name: 'Tropical Storm Nolo',
    hazard: 'flood',
    severity: 3,
    status: 'Watch',
    arrival: 'Heaviest rain bands possible in 24–48 hours',
    trend: 'Steady',
    confidence: 'Medium',
    updated: 'Practice update · 4:00 PM HST',
    summary:
      'Nolo is forecast to pass north of Oʻahu, but its broad rain shield and large swell may isolate low-lying communities well away from the storm center.',
    dominantThreats: [
      'Repeated heavy rain bands',
      'Flash flooding and drainage overflow',
      'Road isolation in low-lying areas',
      'High surf along north- and east-facing shores',
    ],
    publicGuidance: [
      'Do not use the storm-center track as the boundary of risk.',
      'Plan around flood-prone roads and identify an alternate route now.',
      'Move medicines, mobility devices, and charging equipment above expected flood levels.',
    ],
    needAdjustments: {
      Communication: 5,
      Medical: 7,
      Independence: 11,
      Safety: 7,
      Transportation: 14,
    },
    exposureFactor: 0.92,
    readinessPenalty: 5,
    firstAction:
      'Verify flood-prone roads and alternate access before the heaviest rain bands arrive.',
  },
  {
    id: 'tsunami-warning-pacific',
    name: 'Pacific Tsunami Warning',
    hazard: 'tsunami',
    severity: 5,
    status: 'Warning',
    arrival: 'First waves possible in 2–3 hours',
    trend: 'Steady',
    confidence: 'High',
    updated: 'Practice update · 4:00 PM HST',
    summary:
      'A distant-source earthquake has generated a tsunami warning for Hawaiʻi. Coastal evacuation zones may need to clear before the first wave arrives, and dangerous currents can continue for hours.',
    dominantThreats: [
      'Rapid coastal inundation in evacuation zones',
      'Repeated waves and dangerous harbor currents',
      'Gridlock on limited mauka evacuation routes',
      'Communication barriers during a compressed warning window',
    ],
    publicGuidance: [
      'If you are in an official tsunami evacuation zone, move inland or to higher ground now.',
      'Walk or use assisted pickup when roads are congested; do not drive toward the shoreline.',
      'Remain out of the evacuation zone until officials issue an all-clear.',
    ],
    needAdjustments: {
      Communication: 18,
      Medical: 8,
      Independence: 12,
      Safety: 18,
      Transportation: 20,
    },
    exposureFactor: 1.24,
    readinessPenalty: 15,
    firstAction:
      'Clear official tsunami evacuation zones and deploy accessible pickup before coastal roads gridlock.',
  },
  {
    id: 'wildfire-koa',
    name: 'Leeward Wildfire Koa',
    hazard: 'wildfire',
    severity: 4,
    status: 'Warning',
    arrival: 'Wind-driven spread possible in the next 6–12 hours',
    trend: 'Strengthening',
    confidence: 'Medium',
    updated: 'Practice update · 4:00 PM HST',
    summary:
      'A fast-moving brush fire is spreading near populated leeward communities under dry, gusty conditions. Smoke, power loss, and limited road capacity may force early evacuation.',
    dominantThreats: [
      'Wind-driven fire spread with little notice',
      'Heavy smoke and poor air quality',
      'Single-road evacuation bottlenecks',
      'Power and communications loss near the fire area',
    ],
    publicGuidance: [
      'Leave early when officials warn your area; do not wait to see flames.',
      'Keep medicines, mobility equipment, masks, and pet supplies ready to move.',
      'Use routes away from the fire and smoke; never drive through a closure.',
    ],
    needAdjustments: {
      Communication: 16,
      Medical: 13,
      Independence: 10,
      Safety: 19,
      Transportation: 18,
    },
    exposureFactor: 1.08,
    readinessPenalty: 12,
    firstAction:
      'Confirm early evacuation triggers, accessible vehicles, and two routes away from the fire area.',
  },
]

export const neighborhoodBriefings: NeighborhoodBriefing[] = [
  {
    id: 'manoa-makiki',
    areaId: 'oahu-town',
    name: 'Mānoa–Makiki',
    summary:
      'Valley rain, steep streets, streams, and university traffic make access conditions more important than shoreline evacuation.',
    closestResources: [
      {
        name: 'Mānoa community shelter',
        kind: 'Shelter · practice site',
        distance: 'About 0.8 mi',
        note: 'Accessible entry; backup power requires confirmation',
      },
      {
        name: 'University powered support hub',
        kind: 'Medical power · practice site',
        distance: 'About 1.2 mi',
        note: 'Charging and medication refrigeration support',
      },
      {
        name: 'Makiki accessible transport team',
        kind: 'Transportation · practice team',
        distance: 'About 1.5 mi',
        note: 'Wheelchair transport; pickup queue requires confirmation',
      },
    ],
    routes: [
      {
        name: 'University Avenue to South King Street',
        purpose: 'Primary valley exit toward urban services',
      },
      {
        name: 'East Mānoa Road to Mānoa Road',
        purpose: 'Local access when lower valley streets remain passable',
      },
    ],
    trafficHazards: [
      'Ponding and stream overflow can close low points before the wider area appears flooded.',
      'University and school traffic can block the valley exit if movement starts too late.',
      'Steep side streets may be unsafe for large vehicles or residents with limited mobility.',
    ],
    coordination: {
      decisionOwner: 'Mānoa–Makiki neighborhood lead',
      communicationPath:
        'Neighborhood lead → Honolulu EOC mass-care desk → shelter and transport partners → public alert channels',
      afnActions: [
        'Prioritize powered shelter outreach for residents using medical equipment.',
        'Send plain-language and translated route updates before valley access deteriorates.',
        'Assign accessible vehicles to steep streets before general pickups begin.',
      ],
    },
    evidence: {
      status: 'Practice estimate',
      basis:
        'Synthetic neighborhood exposure, aggregate AFN indicators, and practice resource records',
      updated: 'Practice update · 4:00 PM HST',
      validation:
        'County review required for shelter opening, capacity, and road status',
    },
    decisions: {
      hurricane: {
        label: 'Stay in place',
        action:
          'Use an interior room if the building is sound; seek a powered shelter before winds arrive if you depend on electricity or the structure is vulnerable.',
        reason:
          'Mānoa is inland, so unnecessary cross-town travel during strengthening winds adds risk.',
        trigger:
          'Complete shelter moves before tropical-storm-force winds; stop routine travel when local roads become unsafe.',
      },
      flood: {
        label: 'Prepare to leave',
        action:
          'Stay on higher ground, but leave stream edges, ground-floor units, and known ponding areas before the heaviest rain bands.',
        reason:
          'Flash flooding can isolate individual streets even when nearby uphill blocks remain safe.',
        trigger:
          'Leave when a flash-flood warning includes the valley or when access roads begin ponding.',
      },
    },
  },
  {
    id: 'kakaako-ala-moana',
    areaId: 'oahu-town',
    name: 'Kakaʻako–Ala Moana',
    summary:
      'Dense towers, ground-floor businesses, coastal exposure, and heavy east-west traffic require block-level shelter decisions.',
    closestResources: [
      {
        name: 'Kakaʻako community shelter',
        kind: 'Shelter · practice site',
        distance: 'About 0.6 mi',
        note: 'Accessible entry; limited parking',
      },
      {
        name: 'McKinley powered shelter',
        kind: 'Powered shelter · practice site',
        distance: 'About 1.0 mi',
        note: 'Backup power and language assistance',
      },
      {
        name: 'Ala Moana transport staging point',
        kind: 'Transportation · practice site',
        distance: 'About 0.7 mi',
        note: 'Accessible vans; staging location requires confirmation',
      },
    ],
    routes: [
      {
        name: 'Ward Avenue toward higher inland blocks',
        purpose: 'Preferred inland movement from the shoreline',
      },
      {
        name: 'Piʻikoi Street toward Kapiʻolani Boulevard',
        purpose: 'Alternate inland route if Ward Avenue is congested',
      },
    ],
    trafficHazards: [
      'Ala Moana Boulevard may flood or become gridlocked and should not be treated as the evacuation route.',
      'Garage exits and tower loading zones can create severe local backups.',
      'Debris and signal outages can slow Ward Avenue and Piʻikoi Street.',
    ],
    coordination: {
      decisionOwner: 'Kakaʻako–Ala Moana neighborhood lead',
      communicationPath:
        'Neighborhood lead → Honolulu EOC mass-care desk → building managers and transport partners → resident and visitor alerts',
      afnActions: [
        'Contact ground-floor and medically dependent residents before elevators or power are lost.',
        'Issue multilingual building-level instructions for vertical sheltering versus inland movement.',
        'Reserve accessible pickup space away from flooded garages and loading zones.',
      ],
    },
    evidence: {
      status: 'Practice estimate',
      basis:
        'Synthetic coastal exposure, aggregate AFN indicators, and practice high-rise resource records',
      updated: 'Practice update · 4:00 PM HST',
      validation:
        'County and building-manager review required before operational use',
    },
    decisions: {
      hurricane: {
        label: 'Move inland',
        action:
          'Leave shoreline, ground-floor, and surge-exposed locations before winds begin; residents in sound upper floors outside the surge area should stay inside.',
        reason:
          'The correct action changes by building and elevation, so coastal movement must finish before roads deteriorate.',
        trigger:
          'Move surge-exposed and vulnerable-building residents before tropical-storm-force winds begin.',
      },
      flood: {
        label: 'Move inland',
        action:
          'Move vehicles, medicines, and mobility equipment out of low garages and ground floors before heavy rain; use an upper safe floor only if the building is outside surge exposure.',
        reason:
          'Low streets and below-grade parking can flood before primary roads are formally closed.',
        trigger:
          'Move when flood alerts include coastal Honolulu or water begins entering low streets and garages.',
      },
    },
  },
  {
    id: 'kaimuki-kahala',
    areaId: 'oahu-town',
    name: 'Kaimukī–Kāhala',
    summary:
      'Inland ridges and low shoreline blocks sit close together, so the plan must distinguish Kaimukī sheltering from Kāhala coastal movement.',
    closestResources: [
      {
        name: 'Kaimukī powered community shelter',
        kind: 'Powered shelter · practice site',
        distance: 'About 0.9 mi',
        note: 'Accessible entry and charging support',
      },
      {
        name: 'Kāhala evacuation support point',
        kind: 'Transportation · practice site',
        distance: 'About 0.8 mi',
        note: 'Pickup support for shoreline residents',
      },
      {
        name: 'Waialae medical support hub',
        kind: 'Medical power · practice site',
        distance: 'About 1.1 mi',
        note: 'Medication refrigeration; capacity requires confirmation',
      },
    ],
    routes: [
      {
        name: 'Kāhala Avenue to Waialae Avenue',
        purpose: 'Move shoreline residents toward inland Kaimukī',
      },
      {
        name: 'Kilauea Avenue toward higher ground',
        purpose: 'Alternate local movement away from coastal blocks',
      },
    ],
    trafficHazards: [
      'Waialae Avenue and H-1 ramps may gridlock as coastal and neighborhood traffic merge.',
      'Kalanianaʻole Highway can become unreliable from coastal flooding, debris, or stalled vehicles.',
      'Steep Kaimukī side streets may limit accessible transport and emergency vehicles.',
    ],
    coordination: {
      decisionOwner: 'Kaimukī–Kāhala neighborhood lead',
      communicationPath:
        'Neighborhood lead → Honolulu EOC mass-care desk → coastal evacuation, shelter, and transport partners → resident alerts',
      afnActions: [
        'Separate Kāhala shoreline pickup lists from inland Kaimukī wellness checks.',
        'Confirm powered support for medical equipment before moving residents uphill.',
        'Send translated route guidance that distinguishes coastal blocks from inland blocks.',
      ],
    },
    evidence: {
      status: 'Practice estimate',
      basis:
        'Synthetic coastal and inland exposure, aggregate AFN indicators, and practice resource records',
      updated: 'Practice update · 4:00 PM HST',
      validation:
        'County review required for block-level evacuation boundaries and resource status',
    },
    decisions: {
      hurricane: {
        label: 'Prepare to leave',
        action:
          'Kāhala shoreline and vulnerable homes should move inland early; sound inland Kaimukī homes should shelter in an interior room.',
        reason:
          'One instruction for the whole district would send inland residents into traffic while leaving shoreline residents too late.',
        trigger:
          'Move Kāhala shoreline residents before winds begin; tell inland residents to stop travel once coastal movement is underway.',
      },
      flood: {
        label: 'Stay in place',
        action:
          'Inland Kaimukī residents should stay off roads; move from low Kāhala blocks or flood-prone ground floors before heavy rain.',
        reason:
          'Most inland blocks are safer than congested roads, while low coastal blocks face localized flooding.',
        trigger:
          'Move low-block residents when flood warnings include Kāhala; keep inland residents off roads during heavy rain.',
      },
    },
  },
  {
    id: 'waikiki-kapahulu',
    areaId: 'oahu-town',
    name: 'Waikīkī–Kapahulu',
    summary:
      'Large visitor populations, vertical housing, canals, and limited inland streets require simple directions and early movement.',
    closestResources: [
      {
        name: 'Waikīkī visitor shelter',
        kind: 'Shelter · practice site',
        distance: 'About 0.5 mi',
        note: 'Multilingual support; backup power requires confirmation',
      },
      {
        name: 'Kapahulu powered shelter',
        kind: 'Powered shelter · practice site',
        distance: 'About 1.0 mi',
        note: 'Accessible entry and charging support',
      },
      {
        name: 'Waikīkī accessible pickup point',
        kind: 'Transportation · practice site',
        distance: 'About 0.4 mi',
        note: 'Pickup point may move as roads close',
      },
    ],
    routes: [
      {
        name: 'Kapahulu Avenue toward Kaimukī',
        purpose: 'Primary inland movement from eastern Waikīkī',
      },
      {
        name: 'McCully Street toward South King Street',
        purpose: 'Alternate inland movement from western Waikīkī',
      },
    ],
    trafficHazards: [
      'Kalākaua and Kuhio avenues can lock quickly with visitor, bus, and hotel traffic.',
      'Ala Wai crossings are limited and may be affected by flooding or debris.',
      'People unfamiliar with local routes may stop or reverse direction during warnings.',
    ],
    coordination: {
      decisionOwner: 'Waikīkī–Kapahulu neighborhood lead',
      communicationPath:
        'Neighborhood lead → Honolulu EOC mass-care desk → hotels, shelters, and transit partners → multilingual visitor and resident alerts',
      afnActions: [
        'Require hotels and shelters to identify accessible rooms and backup-power capacity.',
        'Use multilingual visual instructions for visitors unfamiliar with evacuation routes.',
        'Stage accessible pickup before buses and hotel traffic congest the limited inland streets.',
      ],
    },
    evidence: {
      status: 'Practice estimate',
      basis:
        'Synthetic visitor and resident exposure, aggregate AFN indicators, and practice hotel-area resources',
      updated: 'Practice update · 4:00 PM HST',
      validation:
        'County, hotel, and transit-partner review required before operational use',
    },
    decisions: {
      hurricane: {
        label: 'Seek shelter',
        action:
          'Visitors and residents in vulnerable or surge-exposed buildings should move to a designated shelter or safe inland building before winds begin.',
        reason:
          'Late movement through Waikīkī creates dangerous congestion and exposes people to wind and debris.',
        trigger:
          'Complete movement before tropical-storm-force winds or hotel elevator restrictions begin.',
      },
      flood: {
        label: 'Stay in place',
        action:
          'Use a safe upper floor outside surge exposure and avoid street travel; leave ground floors and canal-adjacent locations before heavy rain.',
        reason:
          'Flooded intersections and limited canal crossings can make short trips more dangerous than sheltering vertically.',
        trigger:
          'Use vertical sheltering when streets begin flooding; move ground-floor occupants before that point.',
      },
    },
  },
  {
    id: 'downtown-kalihi',
    areaId: 'oahu-town',
    name: 'Downtown–Kalihi',
    summary:
      'Older buildings, harbor exposure, streams, medical facilities, and commuter traffic create different risks within a short distance.',
    closestResources: [
      {
        name: 'Downtown civic shelter',
        kind: 'Shelter · practice site',
        distance: 'About 0.7 mi',
        note: 'Accessible entry; limited overnight capacity',
      },
      {
        name: 'Kalihi powered support hub',
        kind: 'Powered shelter · practice site',
        distance: 'About 1.1 mi',
        note: 'Backup power and language assistance',
      },
      {
        name: 'Urban medical transport team',
        kind: 'Transportation · practice team',
        distance: 'About 0.8 mi',
        note: 'Priority for medical and mobility needs',
      },
    ],
    routes: [
      {
        name: 'Nimitz Highway to inland connectors',
        purpose:
          'Leave harbor-adjacent blocks before coastal conditions worsen',
      },
      {
        name: 'Dillingham Boulevard toward Middle Street',
        purpose: 'Alternate access for Kalihi support and medical movement',
      },
    ],
    trafficHazards: [
      'Nimitz Highway and harbor approaches may be affected by coastal flooding and freight traffic.',
      'H-1 ramps can gridlock and block ambulance or shelter access.',
      'Kalihi Stream and low underpasses may isolate individual blocks during heavy rain.',
    ],
    coordination: {
      decisionOwner: 'Downtown–Kalihi neighborhood lead',
      communicationPath:
        'Neighborhood lead → Honolulu EOC mass-care desk → medical, harbor, shelter, and transport partners → community alerts',
      afnActions: [
        'Protect medical transport access before commuter and freight traffic peaks.',
        'Send translated alerts through trusted community organizations and public channels.',
        'Prioritize powered shelter placement for medically dependent and mobility-limited residents.',
      ],
    },
    evidence: {
      status: 'Practice estimate',
      basis:
        'Synthetic harbor, stream, building, and aggregate AFN indicators with practice resources',
      updated: 'Practice update · 4:00 PM HST',
      validation:
        'County, medical, and transportation-partner review required before operational use',
    },
    decisions: {
      hurricane: {
        label: 'Seek shelter',
        action:
          'People in older, vulnerable, harbor-adjacent, or medically dependent households should reach a powered shelter before winds begin; others should stay in a sound interior space.',
        reason:
          'Building condition and medical dependence matter more than distance alone.',
        trigger:
          'Move vulnerable-building and medically dependent residents before winds restrict bridge and ramp access.',
      },
      flood: {
        label: 'Prepare to leave',
        action:
          'Leave stream edges, low underpasses, and ground-floor units early; otherwise stay off roads and use a safe upper floor.',
        reason:
          'Localized flooding can separate neighboring blocks and cut access to medical facilities.',
        trigger:
          'Leave when flood warnings include Kalihi Stream or low underpasses begin closing.',
      },
    },
  },
]

export function getNeighborhoodBriefings(areaId: string) {
  return neighborhoodBriefings.filter((briefing) => briefing.areaId === areaId)
}

const hawaiiKaiDriveToShelter: Array<[number, number]> = [
  [-157.688623, 21.296675],
  [-157.688962, 21.296203],
  [-157.689135, 21.295968],
  [-157.689381, 21.295719],
  [-157.690324, 21.294929],
  [-157.691243, 21.294165],
  [-157.691844, 21.29366],
  [-157.692631, 21.292779],
  [-157.693271, 21.292153],
  [-157.693939, 21.291524],
  [-157.694645, 21.290876],
  [-157.695003, 21.290477],
  [-157.696041, 21.288966],
  [-157.69658, 21.288153],
  [-157.696994, 21.287496],
  [-157.697373, 21.286753],
  [-157.697725, 21.286066],
  [-157.697389, 21.285915],
  [-157.697107, 21.285833],
  [-157.696454, 21.28552],
  [-157.696023, 21.285312],
]

const hawaiiKaiWalkToBus: Array<[number, number]> = [
  [-157.688623, 21.296675],
  [-157.688962, 21.296203],
  [-157.689012, 21.296134],
  [-157.689078, 21.296044],
]

const hawaiiKaiRoute1L: Array<[number, number]> = [
  [-157.689076, 21.296043],
  [-157.68919, 21.2959],
  [-157.68964, 21.2955],
  [-157.69014, 21.29509],
  [-157.69049, 21.294805],
  [-157.69089, 21.29448],
  [-157.69148, 21.29398],
  [-157.69183, 21.29368],
  [-157.69222, 21.29327],
  [-157.69291, 21.2925],
  [-157.69328, 21.29215],
  [-157.69395, 21.29154],
  [-157.69442, 21.29112],
  [-157.69483, 21.29073],
  [-157.69513, 21.29034],
  [-157.69554, 21.28968],
  [-157.69609, 21.28886],
  [-157.696653, 21.288025],
  [-157.69707, 21.28728],
  [-157.697316, 21.286804],
]

const hawaiiKaiWalkFromBus: Array<[number, number]> = [
  [-157.697341, 21.286816],
  [-157.697725, 21.286065],
  [-157.697389, 21.285915],
  [-157.697107, 21.285833],
  [-157.696454, 21.28552],
  [-157.696022, 21.285311],
]

export const residentRoutePlans: ResidentRoutePlan[] = [
  {
    id: 'resident-manoa',
    neighborhoodId: 'manoa-makiki',
    areaId: 'oahu-town',
    name: 'Mānoa–Makiki',
    searchTerms: ['manoa', 'mānoa', 'makiki', 'punahou', 'university'],
    startLabel: 'Mānoa Road & University Avenue · practice start',
    startCoordinates: [-157.8124, 21.3077],
    whatMayHappen: [
      'Heavy rain can fill streams and low intersections before the wider valley appears flooded.',
      'Wind and power loss may stop traffic signals, elevators, and home medical equipment.',
      'University and school traffic can delay the only practical valley exits.',
    ],
    floodWarning:
      'Avoid low stream crossings and ponding near the lower valley. Do not drive through standing water.',
    floodZones: [
      {
        name: 'Lower Mānoa stream and ponding area',
        coordinates: [
          [-157.8168, 21.3035],
          [-157.8112, 21.3032],
          [-157.8088, 21.306],
          [-157.8138, 21.307],
          [-157.8168, 21.3035],
        ],
      },
    ],
    stayOrGo:
      'Stay in a sound inland building unless your street is flooding, your home is unsafe, or you need powered medical support.',
    resources: [
      {
        id: 'manoa-shelter',
        name: 'Mānoa community shelter',
        kind: 'shelter',
        coordinates: [-157.8087, 21.3045],
        status: 'Practice site · opening must be confirmed',
        available: 'Shelter space, water, basic information',
        accessibility: 'Accessible entrance; backup power needs confirmation',
        languages: ['English', 'Hawaiian', 'Tagalog', 'Japanese'],
        drive: {
          label: 'Drive',
          eta: '5–8 min',
          distance: '1.0 mi',
          steps: [
            'Take Mānoa Road toward University Avenue.',
            'Turn toward the community shelter before reaching South King Street traffic.',
          ],
          avoid: ['Do not use flooded stream-side streets as shortcuts.'],
          coordinates: [
            [-157.8124, 21.3077],
            [-157.811, 21.3061],
            [-157.8087, 21.3045],
          ],
        },
        noCar: {
          label: 'Walk or accessible pickup',
          eta: '18–25 min',
          distance: '0.9 mi',
          steps: [
            'Use the mauka sidewalk on Mānoa Road.',
            'If walking is unsafe, request the Makiki accessible pickup before winds increase.',
          ],
          avoid: [
            'Avoid low crossings and unlit side streets after power loss.',
          ],
          coordinates: [
            [-157.8124, 21.3077],
            [-157.8104, 21.3064],
            [-157.8087, 21.3045],
          ],
        },
      },
      {
        id: 'manoa-food',
        name: 'University food and water hub',
        kind: 'food-water',
        coordinates: [-157.8168, 21.3005],
        status: 'Practice distribution point · hours require confirmation',
        available: 'Water, shelf-stable food, hygiene supplies',
        accessibility: 'Level access; walk-up and vehicle pickup',
        languages: ['English', 'Hawaiian', 'Ilocano', 'Tagalog'],
        drive: {
          label: 'Drive',
          eta: '6–10 min',
          distance: '1.3 mi',
          steps: [
            'Use University Avenue toward Dole Street.',
            'Enter the signed distribution lane from the inland side.',
          ],
          avoid: [
            'Avoid lower University Avenue if water is covering lane markings.',
          ],
          coordinates: [
            [-157.8124, 21.3077],
            [-157.8141, 21.304],
            [-157.8168, 21.3005],
          ],
        },
        noCar: {
          label: 'Walk + shuttle',
          eta: '20–30 min',
          distance: '1.1 mi',
          steps: [
            'Walk toward the university on the signed pedestrian route.',
            'Use the practice community shuttle if carrying supplies is difficult.',
          ],
          avoid: ['Do not wait at an unsheltered stop during high winds.'],
          coordinates: [
            [-157.8124, 21.3077],
            [-157.8146, 21.304],
            [-157.8168, 21.3005],
          ],
        },
      },
      {
        id: 'manoa-medical',
        name: 'University powered support hub',
        kind: 'medical-power',
        coordinates: [-157.8191, 21.2973],
        status: 'Practice powered site · capacity requires confirmation',
        available: 'Device charging, medication refrigeration, wellness checks',
        accessibility: 'Accessible entrance and charging stations',
        languages: ['English', 'Hawaiian', 'Tagalog', 'Korean'],
        drive: {
          label: 'Drive',
          eta: '8–12 min',
          distance: '1.8 mi',
          steps: [
            'Use University Avenue toward Dole Street.',
            'Follow powered-support signs instead of hospital emergency traffic.',
          ],
          avoid: ['Keep Pali and hospital routes clear unless directed there.'],
          coordinates: [
            [-157.8124, 21.3077],
            [-157.8152, 21.302],
            [-157.8191, 21.2973],
          ],
        },
        noCar: {
          label: 'Accessible pickup',
          eta: '15–30 min after confirmation',
          distance: 'Pickup required',
          steps: [
            'Request pickup before home battery power becomes critical.',
            'Bring medication, charging cables, and device instructions.',
          ],
          avoid: ['Do not wait until elevators or communications fail.'],
          coordinates: [
            [-157.8124, 21.3077],
            [-157.8152, 21.302],
            [-157.8191, 21.2973],
          ],
        },
      },
      {
        id: 'manoa-transport',
        name: 'Makiki accessible pickup point',
        kind: 'accessible-transport',
        coordinates: [-157.8264, 21.307],
        status: 'Practice pickup point · dispatch must be confirmed',
        available: 'Accessible vans and assisted boarding',
        accessibility: 'Wheelchair and mobility-device support',
        languages: ['English', 'Hawaiian', 'Tagalog', 'Ilocano'],
        drive: {
          label: 'Call for pickup instead',
          eta: 'Pickup window varies',
          distance: 'Pickup service',
          steps: [
            'Do not drive to the pickup point unless directed.',
            'Share mobility-device size and whether a companion is traveling.',
          ],
          avoid: ['Do not block the pickup lane with private vehicles.'],
          coordinates: [
            [-157.8124, 21.3077],
            [-157.8192, 21.3075],
            [-157.8264, 21.307],
          ],
        },
        noCar: {
          label: 'Accessible pickup',
          eta: 'Request early',
          distance: 'Home pickup when available',
          steps: [
            'Request an accessible pickup before roads or elevators fail.',
            'Wait indoors until the driver confirms arrival.',
          ],
          avoid: ['Do not walk to the staging point during heavy rain.'],
          coordinates: [
            [-157.8124, 21.3077],
            [-157.8192, 21.3075],
            [-157.8264, 21.307],
          ],
        },
      },
    ],
  },
  {
    id: 'resident-kakaako',
    neighborhoodId: 'kakaako-ala-moana',
    areaId: 'oahu-town',
    name: 'Kakaʻako–Ala Moana',
    searchTerms: ['kakaako', 'kakaʻako', 'ala moana', 'ward', '96814'],
    startLabel: 'Ward Avenue & Queen Street · practice start',
    startCoordinates: [-157.8584, 21.295],
    whatMayHappen: [
      'Low streets and below-grade parking may flood before nearby towers lose access.',
      'Power loss can stop elevators and trap vehicles behind garage gates.',
      'Ala Moana Boulevard and shoreline traffic may become unsafe or gridlocked.',
    ],
    floodWarning:
      'Move away from low garages and shoreline streets. Use Ward Avenue or Piʻikoi Street inland only while they remain open.',
    floodZones: [
      {
        name: 'Ala Moana shoreline and low garage area',
        coordinates: [
          [-157.865, 21.289],
          [-157.843, 21.289],
          [-157.842, 21.295],
          [-157.863, 21.296],
          [-157.865, 21.289],
        ],
      },
    ],
    stayOrGo:
      'Leave ground-floor, surge-exposed, or vulnerable buildings early. In a sound upper floor outside surge exposure, stay inside after roads deteriorate.',
    resources: [
      {
        id: 'kakaako-shelter',
        name: 'McKinley powered shelter',
        kind: 'shelter',
        coordinates: [-157.8503, 21.3007],
        status: 'Practice site · opening must be confirmed',
        available: 'Shelter, water, charging, language assistance',
        accessibility: 'Accessible entrance and backup power',
        languages: ['English', 'Hawaiian', 'Tagalog', 'Ilocano', 'Japanese'],
        drive: {
          label: 'Drive inland',
          eta: '6–12 min',
          distance: '1.1 mi',
          steps: [
            'Take Ward Avenue inland.',
            'Turn toward the powered shelter before reaching H-1 ramp traffic.',
          ],
          avoid: ['Avoid Ala Moana Boulevard and flooded garage exits.'],
          coordinates: [
            [-157.8584, 21.295],
            [-157.855, 21.298],
            [-157.8503, 21.3007],
          ],
        },
        noCar: {
          label: 'Walk inland or use accessible pickup',
          eta: '20–30 min',
          distance: '1.0 mi',
          steps: [
            'Walk inland on Ward Avenue while conditions are safe.',
            'Use the accessible pickup option if elevators or mobility are a concern.',
          ],
          avoid: [
            'Do not walk through standing water or along Ala Moana Boulevard.',
          ],
          coordinates: [
            [-157.8584, 21.295],
            [-157.8544, 21.2981],
            [-157.8503, 21.3007],
          ],
        },
      },
      {
        id: 'kakaako-food',
        name: 'Kakaʻako food and water hub',
        kind: 'food-water',
        coordinates: [-157.8561, 21.2984],
        status: 'Practice distribution point · hours require confirmation',
        available: 'Water, food, infant supplies, hygiene supplies',
        accessibility: 'Walk-up lane and accessible pickup',
        languages: ['English', 'Hawaiian', 'Tagalog', 'Marshallese'],
        drive: {
          label: 'Drive',
          eta: '4–7 min',
          distance: '0.6 mi',
          steps: [
            'Use Queen Street inland of the shoreline.',
            'Enter the signed pickup lane.',
          ],
          avoid: ['Avoid low parking entrances and blocked loading zones.'],
          coordinates: [
            [-157.8584, 21.295],
            [-157.8572, 21.297],
            [-157.8561, 21.2984],
          ],
        },
        noCar: {
          label: 'Walk',
          eta: '10–15 min',
          distance: '0.5 mi',
          steps: [
            'Use the inland sidewalk on Queen Street.',
            'Bring a cart only if sidewalks remain clear.',
          ],
          avoid: ['Avoid water-covered intersections.'],
          coordinates: [
            [-157.8584, 21.295],
            [-157.8572, 21.297],
            [-157.8561, 21.2984],
          ],
        },
      },
      {
        id: 'kakaako-medical',
        name: 'Ala Moana medical power point',
        kind: 'medical-power',
        coordinates: [-157.8453, 21.2938],
        status: 'Practice powered site · capacity requires confirmation',
        available: 'Charging, medication refrigeration, basic medical support',
        accessibility: 'Accessible entrance and transfer support',
        languages: ['English', 'Hawaiian', 'Japanese', 'Korean', 'Chinese'],
        drive: {
          label: 'Drive inland first',
          eta: '8–15 min',
          distance: '1.2 mi',
          steps: [
            'Use Queen Street to Piʻikoi Street.',
            'Approach from the inland side.',
          ],
          avoid: ['Avoid Ala Moana Boulevard if water or debris is present.'],
          coordinates: [
            [-157.8584, 21.295],
            [-157.8516, 21.297],
            [-157.8453, 21.2938],
          ],
        },
        noCar: {
          label: 'Accessible pickup',
          eta: '15–30 min after confirmation',
          distance: 'Pickup required',
          steps: [
            'Request pickup before elevator shutdown.',
            'Bring medication and device supplies.',
          ],
          avoid: ['Do not rely on shoreline bus stops during flooding.'],
          coordinates: [
            [-157.8584, 21.295],
            [-157.8516, 21.297],
            [-157.8453, 21.2938],
          ],
        },
      },
      {
        id: 'kakaako-transport',
        name: 'Ward accessible transport pickup',
        kind: 'accessible-transport',
        coordinates: [-157.8534, 21.2993],
        status: 'Practice pickup point · dispatch must be confirmed',
        available: 'Accessible vans and assisted boarding',
        accessibility: 'Wheelchair and mobility-device support',
        languages: ['English', 'Hawaiian', 'Tagalog', 'Ilocano'],
        drive: {
          label: 'Do not drive to pickup',
          eta: 'Pickup window varies',
          distance: 'Pickup service',
          steps: [
            'Request pickup and wait inside.',
            'Tell dispatch your floor and elevator status.',
          ],
          avoid: ['Keep the pickup lane clear for accessible vehicles.'],
          coordinates: [
            [-157.8584, 21.295],
            [-157.8554, 21.2975],
            [-157.8534, 21.2993],
          ],
        },
        noCar: {
          label: 'Accessible pickup',
          eta: 'Request early',
          distance: 'Home or building pickup when available',
          steps: [
            'Request before roads flood.',
            'Wait inside until the driver confirms arrival.',
          ],
          avoid: ['Do not wait in a flooded loading zone.'],
          coordinates: [
            [-157.8584, 21.295],
            [-157.8554, 21.2975],
            [-157.8534, 21.2993],
          ],
        },
      },
    ],
  },
  {
    id: 'resident-kaimuki',
    neighborhoodId: 'kaimuki-kahala',
    areaId: 'oahu-town',
    name: 'Kaimukī–Kāhala',
    searchTerms: ['kaimuki', 'kaimukī', 'kahala', '96816', 'waialae'],
    startLabel: '12th Avenue & Waiʻalae Avenue · practice start',
    startCoordinates: [-157.8018, 21.2838],
    whatMayHappen: [
      'Kāhala shoreline blocks may need early inland movement while Kaimukī remains safer for sheltering.',
      'Waialae Avenue and H-1 ramps may gridlock as coastal traffic moves uphill.',
      'Wind, debris, and power loss may make steep side streets difficult for accessible vehicles.',
    ],
    floodWarning:
      'Avoid Kalanianaʻole Highway and low Kāhala streets when water rises. Use inland routes only while officials report them open.',
    floodZones: [
      {
        name: 'Kāhala shoreline and low streets',
        coordinates: [
          [-157.795, 21.266],
          [-157.776, 21.266],
          [-157.776, 21.274],
          [-157.791, 21.276],
          [-157.795, 21.266],
        ],
      },
    ],
    stayOrGo:
      'Inland Kaimukī residents should stay in a sound building. Kāhala shoreline, flood-prone ground floors, and vulnerable homes should move inland early.',
    resources: [
      {
        id: 'kaimuki-shelter',
        name: 'Kaimukī powered community shelter',
        kind: 'shelter',
        coordinates: [-157.7986, 21.2808],
        status: 'Practice site · opening must be confirmed',
        available: 'Shelter, water, charging, basic supplies',
        accessibility: 'Accessible entrance and backup power',
        languages: ['English', 'Hawaiian', 'Tagalog', 'Japanese'],
        drive: {
          label: 'Drive locally',
          eta: '4–7 min',
          distance: '0.7 mi',
          steps: [
            'Use 12th Avenue mauka.',
            'Turn toward the shelter before reaching H-1 ramp traffic.',
          ],
          avoid: [
            'Avoid Waialae Avenue if traffic is stopped across intersections.',
          ],
          coordinates: [
            [-157.8018, 21.2838],
            [-157.8005, 21.2822],
            [-157.7986, 21.2808],
          ],
        },
        noCar: {
          label: 'Walk or accessible pickup',
          eta: '12–20 min',
          distance: '0.6 mi',
          steps: [
            'Use the inland sidewalk on 12th Avenue.',
            'Request pickup if steep grades are unsafe.',
          ],
          avoid: ['Avoid dark or debris-covered side streets.'],
          coordinates: [
            [-157.8018, 21.2838],
            [-157.8003, 21.2823],
            [-157.7986, 21.2808],
          ],
        },
      },
      {
        id: 'kaimuki-food',
        name: 'Waiʻalae food and water hub',
        kind: 'food-water',
        coordinates: [-157.8061, 21.2821],
        status: 'Practice distribution point · hours require confirmation',
        available: 'Water, food, infant supplies, hygiene supplies',
        accessibility: 'Walk-up and accessible pickup lanes',
        languages: ['English', 'Hawaiian', 'Tagalog', 'Ilocano'],
        drive: {
          label: 'Drive',
          eta: '5–9 min',
          distance: '0.9 mi',
          steps: [
            'Use Waiʻalae Avenue west only while traffic is moving.',
            'Enter from the inland side street.',
          ],
          avoid: ['Do not block through traffic while waiting for supplies.'],
          coordinates: [
            [-157.8018, 21.2838],
            [-157.8036, 21.283],
            [-157.8061, 21.2821],
          ],
        },
        noCar: {
          label: 'Walk',
          eta: '15–22 min',
          distance: '0.8 mi',
          steps: [
            'Use the mauka sidewalk on Waiʻalae Avenue.',
            'Use the priority line if carrying supplies is difficult.',
          ],
          avoid: ['Avoid H-1 ramp crossings when signals are out.'],
          coordinates: [
            [-157.8018, 21.2838],
            [-157.8036, 21.283],
            [-157.8061, 21.2821],
          ],
        },
      },
      {
        id: 'kaimuki-medical',
        name: 'Waiʻalae medical power hub',
        kind: 'medical-power',
        coordinates: [-157.7935, 21.2791],
        status: 'Practice powered site · capacity requires confirmation',
        available: 'Charging, medication refrigeration, wellness checks',
        accessibility: 'Accessible entrance and transfer support',
        languages: ['English', 'Hawaiian', 'Tagalog', 'Japanese'],
        drive: {
          label: 'Drive',
          eta: '5–10 min',
          distance: '1.0 mi',
          steps: [
            'Use Kilauea Avenue toward the powered hub.',
            'Approach from the inland side.',
          ],
          avoid: ['Avoid Kalanianaʻole Highway and shoreline traffic.'],
          coordinates: [
            [-157.8018, 21.2838],
            [-157.7974, 21.2815],
            [-157.7935, 21.2791],
          ],
        },
        noCar: {
          label: 'Accessible pickup',
          eta: '15–30 min after confirmation',
          distance: 'Pickup required',
          steps: [
            'Request pickup before battery power becomes critical.',
            'Bring medication and charging equipment.',
          ],
          avoid: [
            'Do not attempt steep routes with a mobility device during high winds.',
          ],
          coordinates: [
            [-157.8018, 21.2838],
            [-157.7974, 21.2815],
            [-157.7935, 21.2791],
          ],
        },
      },
      {
        id: 'kaimuki-transport',
        name: 'Kilauea accessible transport pickup',
        kind: 'accessible-transport',
        coordinates: [-157.796, 21.2847],
        status: 'Practice pickup point · dispatch must be confirmed',
        available: 'Accessible vans and assisted boarding',
        accessibility: 'Wheelchair and mobility-device support',
        languages: ['English', 'Hawaiian', 'Tagalog', 'Ilocano'],
        drive: {
          label: 'Do not drive to pickup',
          eta: 'Pickup window varies',
          distance: 'Pickup service',
          steps: [
            'Request pickup and wait inside.',
            'Keep the pickup lane clear.',
          ],
          avoid: [
            'Do not enter congested Waialae Avenue just to reach staging.',
          ],
          coordinates: [
            [-157.8018, 21.2838],
            [-157.799, 21.2842],
            [-157.796, 21.2847],
          ],
        },
        noCar: {
          label: 'Accessible pickup',
          eta: 'Request early',
          distance: 'Home pickup when available',
          steps: [
            'Request before winds or flooding worsen.',
            'Wait inside until arrival is confirmed.',
          ],
          avoid: ['Do not wait outdoors on a steep or exposed street.'],
          coordinates: [
            [-157.8018, 21.2838],
            [-157.799, 21.2842],
            [-157.796, 21.2847],
          ],
        },
      },
    ],
  },
  {
    id: 'resident-hawaii-kai',
    neighborhoodId: 'hawaii-kai',
    areaId: 'oahu-east-honolulu',
    name: 'Hawaiʻi Kai',
    searchTerms: [
      'hawaii kai',
      'hawaiʻi kai',
      'koko head',
      'koko marina',
      'lunalilo home',
      '96825',
    ],
    startLabel:
      'Hawaiʻi Kai Drive & Lunalilo Home Road · generic practice start',
    startCoordinates: [-157.6886009, 21.2966614],
    whatMayHappen: [
      'Coastal surge and heavy rain can flood low streets near Kuapā Pond, the marina, and the shoreline.',
      'Kalanianaʻole Highway is the main east-west route and can become gridlocked or blocked by debris.',
      'Power loss can affect traffic signals, elevators, communications, and home medical equipment.',
    ],
    floodWarning:
      'Avoid marina-side roads, low bridges, and shoreline sections of Kalanianaʻole Highway when water rises. Move mauka before the single main corridor becomes congested.',
    floodZones: [
      {
        name: 'Kuapā Pond, marina, and low coastal streets',
        coordinates: [
          [-157.716, 21.278],
          [-157.699, 21.278],
          [-157.697, 21.289],
          [-157.706, 21.294],
          [-157.716, 21.289],
          [-157.716, 21.278],
        ],
      },
    ],
    stayOrGo:
      'Stay in a sound, elevated inland building if officials have not ordered evacuation. Leave low marina, shoreline, flood-prone, or medically vulnerable housing early using a mauka route.',
    resources: [
      {
        id: 'hawaii-kai-shelter',
        name: 'Kaiser High School practice shelter',
        kind: 'shelter',
        coordinates: [-157.6961378, 21.2851056],
        status: 'Practice site · opening must be confirmed',
        available: 'Shelter space, water, basic information',
        accessibility: 'Accessible entrance; backup power needs confirmation',
        languages: ['English', 'Hawaiian', 'Japanese', 'Tagalog'],
        drive: {
          label: 'Drive on Lunalilo Home Road',
          eta: '4–8 min',
          distance: '1.1 mi',
          steps: [
            'Follow Lunalilo Home Road southwest for about one mile.',
            'Turn left into the Kaiser High School campus access and follow shelter signs.',
          ],
          avoid: [
            'Do not divert to marina-side streets if Lunalilo Home Road is congested.',
          ],
          coordinates: hawaiiKaiDriveToShelter,
          segments: [
            {
              mode: 'drive',
              label: 'Lunalilo Home Road',
              coordinates: hawaiiKaiDriveToShelter,
            },
          ],
        },
        noCar: {
          label: 'Walk + TheBus Route 1L + walk',
          eta: '8–20 min + wait',
          distance: 'About 1.0 mi total',
          steps: [
            'Walk about one minute to stop 1189 at Lunalilo Home Road and Hawaiʻi Kai Drive.',
            'Board TheBus Route 1L toward Hālawa Aloha Stadium Station.',
            'Ride seven stops and exit at stop 1196, Lunalilo Home Road opposite Kapaia Street.',
            'Walk about four minutes to the Kaiser High School practice shelter entrance.',
          ],
          avoid: [
            'Confirm service before leaving; disaster detours or suspension are not included in the static schedule.',
          ],
          coordinates: [
            ...hawaiiKaiWalkToBus,
            ...hawaiiKaiRoute1L,
            ...hawaiiKaiWalkFromBus,
          ],
          segments: [
            {
              mode: 'walk',
              label: 'Walk to stop 1189',
              coordinates: hawaiiKaiWalkToBus,
            },
            {
              mode: 'transit',
              label: 'TheBus Route 1L',
              coordinates: hawaiiKaiRoute1L,
            },
            {
              mode: 'walk',
              label: 'Walk from stop 1196',
              coordinates: hawaiiKaiWalkFromBus,
            },
          ],
          transit: {
            route: 'TheBus Route 1L',
            headsign: 'Hālawa Aloha Stadium Station · Limited Stops',
            boardStop: 'Stop 1189 · Lunalilo Home Road + Hawaiʻi Kai Drive',
            boardCoordinates: [-157.689109, 21.296064],
            exitStop: 'Stop 1196 · Lunalilo Home Road + Opp Kapaia Street',
            exitCoordinates: [-157.697352, 21.286821],
            stops: 7,
            scheduleBasis:
              'TheBus GTFS feed active September 28–December 5, 2026',
            realtimeStatus:
              'Live arrivals and disaster detours require TheBus confirmation.',
          },
        },
      },
      {
        id: 'hawaii-kai-food',
        name: 'Lunalilo Home food and water hub',
        kind: 'food-water',
        coordinates: [-157.7131, 21.296],
        status: 'Practice distribution point · hours require confirmation',
        available: 'Water, shelf-stable food, infant and hygiene supplies',
        accessibility: 'Level access with walk-up and vehicle pickup',
        languages: ['English', 'Hawaiian', 'Japanese', 'Chinese'],
        drive: {
          label: 'Drive mauka',
          eta: '5–9 min',
          distance: '0.8 mi',
          steps: [
            'Use Lunalilo Home Road away from the marina.',
            'Enter the signed pickup lane from the inland side.',
          ],
          avoid: [
            'Avoid cutting through low marina streets to bypass highway traffic.',
          ],
          coordinates: [
            [-157.6886009, 21.2966614],
            [-157.7088, 21.295],
            [-157.7131, 21.296],
          ],
        },
        noCar: {
          label: 'Walk inland or use community shuttle',
          eta: '18–28 min',
          distance: '0.8 mi',
          steps: [
            'Use the mauka sidewalk along Lunalilo Home Road.',
            'Use the practice community shuttle if carrying supplies is difficult.',
          ],
          avoid: ['Do not cross water-covered intersections.'],
          coordinates: [
            [-157.6886009, 21.2966614],
            [-157.7088, 21.295],
            [-157.7131, 21.296],
          ],
        },
      },
      {
        id: 'hawaii-kai-medical',
        name: 'East Honolulu powered support hub',
        kind: 'medical-power',
        coordinates: [-157.7115, 21.2976],
        status: 'Practice powered site · capacity requires confirmation',
        available: 'Device charging, medication refrigeration, wellness checks',
        accessibility: 'Accessible entrance and transfer support',
        languages: ['English', 'Hawaiian', 'Japanese', 'Korean'],
        drive: {
          label: 'Drive mauka',
          eta: '6–10 min',
          distance: '1.0 mi',
          steps: [
            'Use Hawaiʻi Kai Drive to Lunalilo Home Road.',
            'Approach the powered hub from the inland side.',
          ],
          avoid: [
            'Do not use shoreline shortcuts or hospital routes unless directed.',
          ],
          coordinates: [
            [-157.6886009, 21.2966614],
            [-157.7084, 21.2957],
            [-157.7115, 21.2976],
          ],
        },
        noCar: {
          label: 'Accessible pickup',
          eta: '15–30 min after confirmation',
          distance: 'Pickup required',
          steps: [
            'Request pickup before home battery power becomes critical.',
            'Bring medication, charging cables, and device instructions.',
          ],
          avoid: [
            'Do not wait until communications or building elevators fail.',
          ],
          coordinates: [
            [-157.6886009, 21.2966614],
            [-157.7084, 21.2957],
            [-157.7115, 21.2976],
          ],
        },
      },
      {
        id: 'hawaii-kai-transport',
        name: 'Hawaiʻi Kai accessible pickup point',
        kind: 'accessible-transport',
        coordinates: [-157.7148, 21.2938],
        status: 'Practice pickup point · dispatch must be confirmed',
        available: 'Accessible vans, assisted boarding, and inland transfer',
        accessibility: 'Wheelchair and mobility-device support',
        languages: ['English', 'Hawaiian', 'Japanese', 'Tagalog'],
        drive: {
          label: 'Call for pickup instead',
          eta: 'Pickup window varies',
          distance: 'Pickup service',
          steps: [
            'Request pickup and wait inside unless dispatch gives a staging time.',
            'Share mobility-device size and whether a companion is traveling.',
          ],
          avoid: [
            'Do not add a private vehicle to the pickup queue unless directed.',
          ],
          coordinates: [
            [-157.6886009, 21.2966614],
            [-157.7098, 21.294],
            [-157.7148, 21.2938],
          ],
        },
        noCar: {
          label: 'Accessible pickup',
          eta: 'Request early',
          distance: 'Home pickup when available',
          steps: [
            'Request an accessible pickup before the highway corridor deteriorates.',
            'Wait indoors until the driver confirms arrival.',
          ],
          avoid: [
            'Do not walk to the staging point through rain, heat, or floodwater.',
          ],
          coordinates: [
            [-157.6886009, 21.2966614],
            [-157.7098, 21.294],
            [-157.7148, 21.2938],
          ],
        },
      },
    ],
  },
]

export function findResidentRoutePlan(value: string) {
  const normalized = value.toLowerCase().replace(/[ʻ’]/g, '').trim()
  return residentRoutePlans.find((plan) =>
    plan.searchTerms.some((term) =>
      normalized.includes(term.toLowerCase().replace(/[ʻ’]/g, '')),
    ),
  )
}

export function getNearestResidentRoutePlan(
  coordinates: [number, number],
): ResidentRoutePlan {
  return [...residentRoutePlans].sort((first, second) => {
    const firstDistance =
      (first.startCoordinates[0] - coordinates[0]) ** 2 +
      (first.startCoordinates[1] - coordinates[1]) ** 2
    const secondDistance =
      (second.startCoordinates[0] - coordinates[0]) ** 2 +
      (second.startCoordinates[1] - coordinates[1]) ** 2
    return firstDistance - secondDistance
  })[0]
}

export const layers: Array<{
  id: LayerId
  label: string
  description: string
}> = [
  {
    id: 'mobility',
    label: 'Mobility & independence',
    description: 'Aggregate disability and mobility indicators',
  },
  {
    id: 'medical-power',
    label: 'Medical power dependence',
    description: 'De-identified HHS emPOWER estimates',
  },
  {
    id: 'language',
    label: 'Language access',
    description: 'Limited English proficiency indicators',
  },
  {
    id: 'transportation',
    label: 'Transportation access',
    description: 'Households without a private vehicle',
  },
  {
    id: 'shelters',
    label: 'Shelters & community hubs',
    description: 'Synthetic capacity and capability inventory',
  },
]

export const areas: PlanningArea[] = [
  {
    id: 'oahu-kaimuki',
    name: 'Kaimukī',
    island: 'Oʻahu',
    coordinates: [-157.802, 21.281],
    population: 18900,
    exposedPopulation: 2180,
    households: 940,
    readiness: 76,
    change: 8,
    summary:
      'An inland residential district with steep streets, older housing, and strong dependence on Waialae Avenue and H-1 connections.',
    cmist: [
      { category: 'Communication', value: 61 },
      { category: 'Medical', value: 73 },
      { category: 'Independence', value: 78 },
      { category: 'Safety', value: 58 },
      { category: 'Transportation', value: 82 },
    ],
    showOnStatewideMap: false,
  },
  {
    id: 'oahu-kahala',
    name: 'Kahala',
    island: 'Oʻahu',
    coordinates: [-157.782, 21.273],
    population: 9800,
    exposedPopulation: 2860,
    households: 1210,
    readiness: 78,
    change: 7,
    summary:
      'A coastal district where shoreline exposure, private-vehicle evacuation, and access to higher ground differ block by block.',
    cmist: [
      { category: 'Communication', value: 58 },
      { category: 'Medical', value: 69 },
      { category: 'Independence', value: 66 },
      { category: 'Safety', value: 72 },
      { category: 'Transportation', value: 80 },
    ],
    showOnStatewideMap: false,
  },
  {
    id: 'oahu-diamond-head',
    name: 'Diamond Head',
    island: 'Oʻahu',
    coordinates: [-157.808, 21.259],
    population: 7600,
    exposedPopulation: 2540,
    households: 1180,
    readiness: 70,
    change: 13,
    summary:
      'Coastal parks, visitor traffic, and constrained routes around the crater increase the need for clear evacuation direction.',
    cmist: [
      { category: 'Communication', value: 76 },
      { category: 'Medical', value: 64 },
      { category: 'Independence', value: 62 },
      { category: 'Safety', value: 79 },
      { category: 'Transportation', value: 84 },
    ],
    showOnStatewideMap: false,
  },
  {
    id: 'oahu-palolo',
    name: 'Pālolo',
    island: 'Oʻahu',
    coordinates: [-157.803, 21.305],
    population: 13100,
    exposedPopulation: 1320,
    households: 670,
    readiness: 62,
    change: 16,
    summary:
      'A steep valley community where narrow roads, stream flooding, and hillside access shape response more than shoreline evacuation.',
    cmist: [
      { category: 'Communication', value: 68 },
      { category: 'Medical', value: 77 },
      { category: 'Independence', value: 81 },
      { category: 'Safety', value: 74 },
      { category: 'Transportation', value: 88 },
    ],
    showOnStatewideMap: false,
  },
  {
    id: 'oahu-town',
    name: 'Town',
    island: 'Oʻahu',
    coordinates: [-157.862, 21.304],
    population: 338000,
    exposedPopulation: 48200,
    households: 19800,
    readiness: 72,
    change: 12,
    summary:
      'The dense urban corridor from Downtown through Waikīkī and Kaimukī has vertical housing, visitor populations, hospitals, and heavy traffic.',
    communities: [
      'Downtown–Kalihi',
      'Makiki–Mānoa',
      'Ala Moana–Kakaʻako',
      'Waikīkī–Kapahulu',
      'Kaimukī',
    ],
    responseFocus: {
      tsunami:
        'Separate shoreline evacuation from inland sheltering and keep the main urban corridors moving.',
      flood:
        'Protect low crossings, dense housing, and access to hospitals and shelters.',
    },
    cmist: [
      { category: 'Communication', value: 82 },
      { category: 'Medical', value: 71 },
      { category: 'Independence', value: 68 },
      { category: 'Safety', value: 77 },
      { category: 'Transportation', value: 89 },
    ],
  },
  {
    id: 'oahu-kailua',
    name: 'Kailua',
    island: 'Oʻahu',
    coordinates: [-157.739, 21.397],
    population: 40900,
    exposedPopulation: 9900,
    households: 4200,
    readiness: 70,
    change: 10,
    summary:
      'A low-lying coastal community with beach evacuation demand, stream flooding, and limited routes across the Koʻolau.',
    communities: ['Kailua', 'Maunawili'],
    responseFocus: {
      tsunami:
        'Move shoreline households inland without blocking the few routes out of Kailua.',
      flood:
        'Check streams, low crossings, and isolated residential pockets first.',
    },
    cmist: [
      { category: 'Communication', value: 64 },
      { category: 'Medical', value: 69 },
      { category: 'Independence', value: 70 },
      { category: 'Safety', value: 76 },
      { category: 'Transportation', value: 86 },
    ],
  },
  {
    id: 'oahu-kaneohe',
    name: 'Kāneʻohe',
    island: 'Oʻahu',
    coordinates: [-157.803, 21.421],
    population: 51000,
    exposedPopulation: 8700,
    households: 3600,
    readiness: 68,
    change: 14,
    summary:
      'Bay shoreline, steep valleys, military access, and the Likelike, Pali, and H-3 corridors create distinct response constraints.',
    communities: ['Kāneʻohe', 'Heʻeia', 'ʻĀhuimanu'],
    responseFocus: {
      tsunami:
        'Clear bay-side exposure while protecting cross-island access and valley routes.',
      flood:
        'Check valley streams and road cuts before sending relief vehicles.',
    },
    cmist: [
      { category: 'Communication', value: 66 },
      { category: 'Medical', value: 72 },
      { category: 'Independence', value: 73 },
      { category: 'Safety', value: 72 },
      { category: 'Transportation', value: 87 },
    ],
  },
  {
    id: 'oahu-waimanalo',
    name: 'Waimānalo',
    island: 'Oʻahu',
    coordinates: [-157.715, 21.342],
    population: 6200,
    exposedPopulation: 2100,
    households: 820,
    readiness: 57,
    change: 19,
    summary:
      'A rural coastal community with agricultural roads, limited route redundancy, and different resource access from nearby Kailua.',
    communities: ['Waimānalo', 'Waimānalo Beach'],
    responseFocus: {
      tsunami:
        'Move people off the coastal plain early and preserve the limited routes toward higher ground.',
      flood:
        'Check drainage, rural road access, and households isolated from services.',
    },
    cmist: [
      { category: 'Communication', value: 75 },
      { category: 'Medical', value: 81 },
      { category: 'Independence', value: 79 },
      { category: 'Safety', value: 72 },
      { category: 'Transportation', value: 91 },
    ],
  },
  {
    id: 'oahu-central',
    name: 'Central Oʻahu',
    island: 'Oʻahu',
    coordinates: [-158.015, 21.47],
    population: 167000,
    exposedPopulation: 12400,
    households: 5100,
    readiness: 74,
    change: 9,
    summary:
      'Mililani, Wahiawā, and surrounding communities serve as inland support areas but depend on major north-south corridors.',
    communities: ['Mililani', 'Wahiawā', 'Whitmore'],
    responseFocus: {
      tsunami:
        'Prepare inland reception and logistics without congesting routes used by coastal evacuees.',
      wildfire:
        'Watch dryland edges and protect the H-2 and Kamehameha Highway corridors.',
    },
    cmist: [
      { category: 'Communication', value: 61 },
      { category: 'Medical', value: 63 },
      { category: 'Independence', value: 65 },
      { category: 'Safety', value: 69 },
      { category: 'Transportation', value: 78 },
    ],
  },
  {
    id: 'oahu-north-shore',
    name: 'North Shore',
    island: 'Oʻahu',
    coordinates: [-158.063, 21.594],
    population: 17800,
    exposedPopulation: 6400,
    households: 2500,
    readiness: 60,
    change: 18,
    summary:
      'Long shoreline exposure, visitor traffic, and two-lane roads make early movement and local staging essential.',
    communities: ['Waialua', 'Haleʻiwa', 'Pūpūkea', 'Sunset Beach'],
    responseFocus: {
      tsunami:
        'Clear beaches and low coastal roads before traffic blocks the few inland connections.',
      flood:
        'Check stream crossings and road closures before moving supplies around the coast.',
    },
    cmist: [
      { category: 'Communication', value: 72 },
      { category: 'Medical', value: 77 },
      { category: 'Independence', value: 73 },
      { category: 'Safety', value: 80 },
      { category: 'Transportation', value: 93 },
    ],
  },
  {
    id: 'oahu-koolauloa',
    name: 'Koʻolauloa',
    island: 'Oʻahu',
    coordinates: [-157.921, 21.599],
    population: 20500,
    exposedPopulation: 5900,
    households: 2300,
    readiness: 58,
    change: 21,
    summary:
      'Small coastal communities from Kahuku through Hauʻula share long travel distances and a single primary coastal highway.',
    communities: ['Kahuku', 'Lāʻie', 'Hauʻula', 'Kaʻaʻawa'],
    responseFocus: {
      tsunami:
        'Use local high-ground routes and avoid relying on island-wide movement after the warning.',
      flood:
        'Treat each community as potentially isolated when streams or the coastal highway close.',
    },
    cmist: [
      { category: 'Communication', value: 79 },
      { category: 'Medical', value: 84 },
      { category: 'Independence', value: 82 },
      { category: 'Safety', value: 76 },
      { category: 'Transportation', value: 95 },
    ],
  },
  {
    id: 'oahu-ewa',
    name: 'ʻEwa',
    island: 'Oʻahu',
    coordinates: [-158.04, 21.335],
    population: 151000,
    exposedPopulation: 23500,
    households: 8900,
    readiness: 67,
    change: 16,
    summary:
      'Fast-growing communities, low coastal land, and dependence on H-1 and Farrington Highway create large evacuation and shelter demand.',
    communities: ['ʻEwa', 'Kapolei', 'Makakilo'],
    responseFocus: {
      tsunami:
        'Move low-lying neighborhoods inland while protecting H-1 and Farrington Highway capacity.',
      hurricane:
        'Plan for extended outages and high shelter demand across newer dense communities.',
    },
    cmist: [
      { category: 'Communication', value: 68 },
      { category: 'Medical', value: 70 },
      { category: 'Independence', value: 72 },
      { category: 'Safety', value: 78 },
      { category: 'Transportation', value: 90 },
    ],
  },
  {
    id: 'oahu-east-honolulu',
    name: 'East Honolulu',
    island: 'Oʻahu',
    coordinates: [-157.724, 21.287],
    population: 52400,
    exposedPopulation: 8460,
    households: 3740,
    readiness: 73,
    change: 11,
    summary:
      'Past the Town corridor, Waiʻalae-Kāhala, Kuliʻouʻou-Kalani Iki, and Hawaiʻi Kai have coastal exposure and limited east-west road redundancy.',
    communities: ['Waiʻalae–Kāhala', 'Kuliʻouʻou–Kalani Iki', 'Hawaiʻi Kai'],
    responseFocus: {
      tsunami:
        'Clear shoreline neighborhoods and preserve Kalanianaʻole Highway for evacuation and emergency access.',
      flood:
        'Check valley streams, low coastal roads, and the single east-west corridor.',
    },
    cmist: [
      { category: 'Communication', value: 67 },
      { category: 'Medical', value: 76 },
      { category: 'Independence', value: 72 },
      { category: 'Safety', value: 64 },
      { category: 'Transportation', value: 79 },
    ],
  },
  {
    id: 'maui-central',
    name: 'Central & West Maui',
    island: 'Maui',
    coordinates: [-156.49, 20.86],
    population: 112400,
    exposedPopulation: 18420,
    households: 7960,
    readiness: 64,
    change: 18,
    summary:
      'Two coastal communities combine elevated evacuation demand with limited redundant road access.',
    cmist: [
      { category: 'Communication', value: 58 },
      { category: 'Medical', value: 72 },
      { category: 'Independence', value: 81 },
      { category: 'Safety', value: 62 },
      { category: 'Transportation', value: 88 },
    ],
  },
  {
    id: 'oahu-leeward',
    name: 'Waiʻanae Coast',
    island: 'Oʻahu',
    coordinates: [-158.181169, 21.435848],
    population: 226800,
    exposedPopulation: 31760,
    households: 12480,
    readiness: 71,
    change: 9,
    summary:
      'Coastal communities depend heavily on Farrington Highway, with long travel distances and limited alternate routes.',
    communities: ['Nānākuli', 'Māʻili', 'Waiʻanae', 'Mākaha'],
    responseFocus: {
      tsunami:
        'Use local high ground and keep Farrington Highway clear instead of depending on cross-island evacuation.',
      wildfire:
        'Protect valley exits and identify communities that could lose their only road access.',
    },
    cmist: [
      { category: 'Communication', value: 73 },
      { category: 'Medical', value: 64 },
      { category: 'Independence', value: 69 },
      { category: 'Safety', value: 77 },
      { category: 'Transportation', value: 74 },
    ],
  },
  {
    id: 'hawaii-hilo',
    name: 'Hilo & Lower Puna',
    island: 'Hawaiʻi',
    coordinates: [-155.07, 19.63],
    population: 94700,
    exposedPopulation: 14280,
    households: 6210,
    readiness: 59,
    change: 22,
    summary:
      'Flood and tsunami exposure overlap with rural isolation and medical power continuity concerns.',
    cmist: [
      { category: 'Communication', value: 61 },
      { category: 'Medical', value: 84 },
      { category: 'Independence', value: 74 },
      { category: 'Safety', value: 65 },
      { category: 'Transportation', value: 79 },
    ],
  },
  {
    id: 'kauai-east',
    name: 'East Kauaʻi',
    island: 'Kauaʻi',
    coordinates: [-159.35, 22.05],
    population: 41200,
    exposedPopulation: 7340,
    households: 2980,
    readiness: 68,
    change: 12,
    summary:
      'Low-lying communities and single-route dependencies increase the value of early staging.',
    cmist: [
      { category: 'Communication', value: 54 },
      { category: 'Medical', value: 66 },
      { category: 'Independence', value: 71 },
      { category: 'Safety', value: 58 },
      { category: 'Transportation', value: 82 },
    ],
  },
]

export const postalLocations: PostalLocation[] = [
  {
    postalCode: '96816',
    name: 'ZIP 96816',
    county: 'Honolulu County',
    island: 'Oʻahu',
    coordinates: [-157.795, 21.282],
    zoom: 11.8,
    areaId: 'oahu-east-honolulu',
    summary:
      'This ZIP spans inland slopes, a valley, and shoreline neighborhoods. The planning view must be selected at neighborhood scale.',
    localFacts: [
      {
        label: 'Why ZIP is not enough',
        value:
          'Kaimukī, Kahala, Diamond Head, and Pālolo have different hazards and access constraints',
      },
      {
        label: 'Next step',
        value:
          'Choose a neighborhood planning view before using response actions',
      },
    ],
    planningZones: [
      {
        id: 'kaimuki-96816',
        name: 'Kaimukī',
        areaId: 'oahu-kaimuki',
        coordinates: [-157.802, 21.281],
        zoom: 13.6,
        summary:
          'Inland residential streets, steep grades, and Waialae Avenue access shape the plan.',
        localFacts: [
          {
            label: 'Movement',
            value: 'Keep relief traffic inland and verify Waialae Avenue flow',
          },
          {
            label: 'Access',
            value: 'Steep side streets may limit mobility and large vehicles',
          },
        ],
        hazardPlans: {
          tsunami: {
            summary:
              'Use Kaimukī as an inland reception and support area while keeping traffic away from lower coastal routes.',
            steps: [
              {
                title: 'Verify Waialae Avenue can receive uphill traffic',
                owner: 'Transportation team',
                timing: 'Check now',
              },
              {
                title: 'Prepare inland reception points for coastal evacuees',
                owner: 'Shelter team',
                timing: 'Before evacuation peaks',
              },
              {
                title:
                  'Check steep streets for residents needing mobility help',
                owner: 'Community support team',
                timing: 'First neighborhood sweep',
              },
            ],
          },
        },
      },
      {
        id: 'kahala-96816',
        name: 'Kahala',
        areaId: 'oahu-kahala',
        coordinates: [-157.782, 21.273],
        zoom: 13.6,
        summary:
          'Low shoreline blocks and inland blocks require different evacuation timing and routes.',
        localFacts: [
          {
            label: 'Movement',
            value: 'Keep Kahala Avenue and routes toward higher ground clear',
          },
          {
            label: 'Exposure',
            value: 'Shoreline blocks require the earliest evacuation checks',
          },
        ],
        hazardPlans: {
          tsunami: {
            summary:
              'Start with shoreline evacuation, accessible transportation, and clear routes toward higher ground.',
            steps: [
              {
                title: 'Confirm evacuation of the lowest shoreline blocks',
                owner: 'Evacuation team',
                timing: 'Immediately',
              },
              {
                title: 'Keep Kahala Avenue routes toward higher ground clear',
                owner: 'Transportation team',
                timing: 'During evacuation',
              },
              {
                title: 'Identify residents needing accessible transportation',
                owner: 'Community support team',
                timing: 'First door-to-door check',
              },
            ],
          },
        },
      },
      {
        id: 'diamond-head-96816',
        name: 'Diamond Head',
        areaId: 'oahu-diamond-head',
        coordinates: [-157.808, 21.259],
        zoom: 13.6,
        summary:
          'Shoreline recreation areas, visitor traffic, and constrained roads around the crater shape the plan.',
        localFacts: [
          {
            label: 'Visitors',
            value: 'Expect people who do not know local evacuation routes',
          },
          {
            label: 'Movement',
            value: 'Protect Monsarrat and Kapahulu connections',
          },
        ],
        hazardPlans: {
          tsunami: {
            summary:
              'Clear shoreline recreation areas and give visitors direct inland route instructions before roads congest.',
            steps: [
              {
                title: 'Clear shoreline parks and recreation areas',
                owner: 'Public safety team',
                timing: 'Immediately',
              },
              {
                title: 'Direct visitors toward Monsarrat and Kapahulu',
                owner: 'Public information team',
                timing: 'With the first warning',
              },
              {
                title: 'Keep crater-side roads open for emergency movement',
                owner: 'Transportation team',
                timing: 'Until evacuation is complete',
              },
            ],
          },
        },
      },
      {
        id: 'palolo-96816',
        name: 'Pālolo',
        areaId: 'oahu-palolo',
        coordinates: [-157.803, 21.305],
        zoom: 13.3,
        summary:
          'Valley access, narrow hillside roads, and stream conditions shape the plan more than shoreline exposure.',
        localFacts: [
          {
            label: 'Movement',
            value: 'Verify Pālolo Avenue and narrow hillside access',
          },
          {
            label: 'Role in a tsunami',
            value: 'Use as inland support without blocking coastal evacuation',
          },
        ],
        hazardPlans: {
          tsunami: {
            summary:
              'Use Pālolo as an inland support area and keep local relief traffic away from coastal evacuation routes.',
            steps: [
              {
                title: 'Keep support traffic off coastal evacuation routes',
                owner: 'Transportation team',
                timing: 'During evacuation',
              },
              {
                title: 'Check narrow hillside streets for mobility needs',
                owner: 'Community support team',
                timing: 'First neighborhood sweep',
              },
              {
                title: 'Prepare inland support for displaced households',
                owner: 'Shelter team',
                timing: 'Before arrivals begin',
              },
            ],
          },
        },
      },
    ],
  },
]

export function findPostalLocation(value: string) {
  const postalCode = value.trim().replace(/\D/g, '').slice(0, 5)
  return postalLocations.find((location) => location.postalCode === postalCode)
}

export function getLocalReliefSteps(
  area: PlanningArea,
  hazard: HazardId,
): LocalReliefStep[] {
  return [
    {
      title:
        area.responseFocus?.[hazard] ??
        `Confirm the first local actions for ${area.name}`,
      owner: `${area.name} zone lead`,
      timing: 'Start now',
    },
    {
      title: `Check access and transportation in ${area.communities?.slice(0, 2).join(' and ') ?? area.name}`,
      owner: 'Transportation team',
      timing: 'Before moving people or supplies',
    },
    {
      title: `Share one clear update for the ${area.name} response zone`,
      owner: 'Public information team',
      timing: 'As conditions change',
    },
  ]
}

export const oahuResponseZoneGeometry: FeatureCollection<Polygon> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 'oahu-town', name: 'Town' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-158.015, 21.286],
            [-157.99, 21.35],
            [-157.905, 21.375],
            [-157.81, 21.345],
            [-157.785, 21.29],
            [-157.825, 21.245],
            [-157.94, 21.255],
            [-158.015, 21.286],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'oahu-east-honolulu', name: 'East Honolulu' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-157.81, 21.345],
            [-157.755, 21.37],
            [-157.675, 21.33],
            [-157.65, 21.285],
            [-157.71, 21.245],
            [-157.785, 21.29],
            [-157.81, 21.345],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'oahu-kailua', name: 'Kailua' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-157.79, 21.36],
            [-157.735, 21.355],
            [-157.69, 21.395],
            [-157.72, 21.445],
            [-157.78, 21.44],
            [-157.79, 21.36],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'oahu-kaneohe', name: 'Kāneʻohe' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-157.87, 21.37],
            [-157.79, 21.36],
            [-157.78, 21.44],
            [-157.82, 21.495],
            [-157.89, 21.47],
            [-157.87, 21.37],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'oahu-waimanalo', name: 'Waimānalo' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-157.755, 21.37],
            [-157.69, 21.395],
            [-157.655, 21.35],
            [-157.675, 21.33],
            [-157.755, 21.37],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'oahu-central', name: 'Central Oʻahu' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-158.08, 21.39],
            [-157.96, 21.38],
            [-157.89, 21.47],
            [-157.93, 21.56],
            [-158.06, 21.55],
            [-158.08, 21.39],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'oahu-north-shore', name: 'North Shore' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-158.24, 21.5],
            [-158.06, 21.55],
            [-157.99, 21.63],
            [-158.08, 21.71],
            [-158.22, 21.65],
            [-158.24, 21.5],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'oahu-koolauloa', name: 'Koʻolauloa' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-157.99, 21.63],
            [-157.93, 21.56],
            [-157.82, 21.495],
            [-157.84, 21.59],
            [-157.91, 21.68],
            [-157.99, 21.63],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'oahu-ewa', name: 'ʻEwa' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-158.14, 21.31],
            [-158.08, 21.39],
            [-157.96, 21.38],
            [-157.99, 21.35],
            [-158.015, 21.286],
            [-158.11, 21.285],
            [-158.14, 21.31],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'oahu-leeward', name: 'Waiʻanae Coast' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-158.27, 21.32],
            [-158.14, 21.31],
            [-158.08, 21.39],
            [-158.06, 21.55],
            [-158.24, 21.5],
            [-158.27, 21.32],
          ],
        ],
      },
    },
  ],
}

function circlePolygon(
  center: [number, number],
  radius: number,
  properties: Record<string, string | number>,
): FeatureCollection<Polygon> {
  const coordinates: Array<[number, number]> = []
  for (let index = 0; index <= 64; index += 1) {
    const angle = (index / 64) * Math.PI * 2
    coordinates.push([
      center[0] + Math.cos(angle) * radius,
      center[1] + Math.sin(angle) * radius * 0.72,
    ])
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties,
        geometry: {
          type: 'Polygon',
          coordinates: [coordinates],
        },
      },
    ],
  }
}

function mergeCollections(
  collections: Array<FeatureCollection<Polygon>>,
): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: collections.flatMap((collection) => collection.features),
  }
}

export const hazardGeometry: Record<HazardId, FeatureCollection<Polygon>> = {
  tsunami: mergeCollections([
    circlePolygon([-159.38, 21.98], 0.22, { intensity: 0.58 }),
    circlePolygon([-158.06, 21.4], 0.32, { intensity: 0.82 }),
    circlePolygon([-156.48, 20.88], 0.28, { intensity: 0.92 }),
    circlePolygon([-155.1, 19.68], 0.34, { intensity: 0.76 }),
  ]),
  wildfire: mergeCollections([
    circlePolygon([-156.42, 20.86], 0.38, { intensity: 0.94 }),
    circlePolygon([-155.68, 19.72], 0.42, { intensity: 0.72 }),
    circlePolygon([-158.12, 21.47], 0.25, { intensity: 0.64 }),
  ]),
  flood: mergeCollections([
    circlePolygon([-159.36, 22.05], 0.34, { intensity: 0.88 }),
    circlePolygon([-157.92, 21.42], 0.3, { intensity: 0.66 }),
    circlePolygon([-155.08, 19.7], 0.42, { intensity: 0.83 }),
  ]),
  hurricane: mergeCollections([
    circlePolygon([-158.25, 21.0], 1.15, { intensity: 0.68 }),
    circlePolygon([-156.1, 20.2], 1.05, { intensity: 0.88 }),
  ]),
}

export const vulnerabilityGeometry: Record<
  Exclude<LayerId, 'shelters'>,
  FeatureCollection<Polygon>
> = {
  mobility: mergeCollections([
    circlePolygon([-158.18, 21.38], 0.13, { score: 84 }),
    circlePolygon([-156.5, 20.87], 0.14, { score: 91 }),
    circlePolygon([-155.08, 19.65], 0.16, { score: 87 }),
    circlePolygon([-159.34, 22.05], 0.12, { score: 73 }),
  ]),
  'medical-power': mergeCollections([
    circlePolygon([-157.96, 21.36], 0.1, { score: 77 }),
    circlePolygon([-156.46, 20.9], 0.11, { score: 86 }),
    circlePolygon([-155.14, 19.7], 0.14, { score: 92 }),
  ]),
  language: mergeCollections([
    circlePolygon([-158.02, 21.33], 0.15, { score: 89 }),
    circlePolygon([-156.58, 20.84], 0.09, { score: 65 }),
    circlePolygon([-155.04, 19.72], 0.1, { score: 71 }),
  ]),
  transportation: mergeCollections([
    circlePolygon([-158.2, 21.42], 0.17, { score: 88 }),
    circlePolygon([-156.67, 20.89], 0.13, { score: 94 }),
    circlePolygon([-155.12, 19.58], 0.18, { score: 83 }),
    circlePolygon([-159.38, 22.08], 0.1, { score: 79 }),
  ]),
}

export const coordinationRoute: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'State support corridor' },
      geometry: {
        type: 'LineString',
        coordinates: areas.map((area) => area.coordinates),
      },
    },
  ],
}

export const resourcePoints: FeatureCollection<Point> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'West Maui Community Hub', capacity: 240 },
      geometry: { type: 'Point', coordinates: [-156.67, 20.89] },
    },
    {
      type: 'Feature',
      properties: { name: 'Central Maui Shelter', capacity: 480 },
      geometry: { type: 'Point', coordinates: [-156.46, 20.89] },
    },
    {
      type: 'Feature',
      properties: { name: 'Hilo Community Shelter', capacity: 360 },
      geometry: { type: 'Point', coordinates: [-155.08, 19.71] },
    },
    {
      type: 'Feature',
      properties: { name: 'Leeward Support Hub', capacity: 520 },
      geometry: { type: 'Point', coordinates: [-158.15, 21.39] },
    },
  ],
}

export const statewideTrend = [
  { time: 'Now', exposed: 18, capacity: 72 },
  { time: '+12h', exposed: 31, capacity: 67 },
  { time: '+24h', exposed: 48, capacity: 61 },
  { time: '+48h', exposed: 63, capacity: 54 },
  { time: '+72h', exposed: 71, capacity: 49 },
]

export const sources = [
  { name: 'Census ACS', updated: '2024 5-year estimates' },
  { name: 'CDC/ATSDR SVI', updated: '2022 release' },
  { name: 'HHS emPOWER', updated: 'Illustrative aggregate' },
  { name: 'Statewide GIS', updated: 'Layer dates vary' },
]

const hazardFactors: Record<HazardId, number> = {
  tsunami: 1,
  wildfire: 0.82,
  flood: 0.71,
  hurricane: 1.24,
}

const hazardAdjustments: Record<HazardId, Record<string, number>> = {
  tsunami: {
    Communication: 2,
    Medical: 4,
    Independence: 7,
    Safety: 3,
    Transportation: 11,
  },
  wildfire: {
    Communication: 9,
    Medical: 7,
    Independence: 5,
    Safety: 8,
    Transportation: 6,
  },
  flood: {
    Communication: 3,
    Medical: 6,
    Independence: 8,
    Safety: 4,
    Transportation: 9,
  },
  hurricane: {
    Communication: 7,
    Medical: 12,
    Independence: 9,
    Safety: 8,
    Transportation: 7,
  },
}

export function getScenarioView(
  area: PlanningArea,
  hazard: HazardId,
  severity: number,
  activeLayers: LayerId[],
  activeEvent?: ActiveEvent | null,
): ScenarioView {
  const severityFactor = 0.55 + severity * 0.15
  const exposedPopulation = Math.min(
    area.population,
    Math.round(
      area.exposedPopulation *
        hazardFactors[hazard] *
        severityFactor *
        (activeEvent?.exposureFactor ?? 1),
    ),
  )
  const layerBoost = activeLayers.length > 2 ? 2 : 0
  const cmist = area.cmist.map((item) => ({
    ...item,
    value: Math.min(
      100,
      item.value +
        hazardAdjustments[hazard][item.category] +
        (activeEvent?.needAdjustments[item.category] ?? 0) +
        (severity - 3) * 3 +
        layerBoost,
    ),
  }))
  const primarySignal =
    [...cmist].sort((first, second) => second.value - first.value)[0]
      ?.category ?? 'Transportation'

  return {
    exposedPopulation,
    readiness: Math.max(
      28,
      Math.min(
        92,
        area.readiness -
          (severity - 3) * 5 -
          Math.round((hazardFactors[hazard] - 1) * 12) -
          (activeEvent?.readinessPenalty ?? 0),
      ),
    ),
    validationCount: Math.max(
      2,
      Math.round(exposedPopulation / 4200 + activeLayers.length / 2),
    ),
    primarySignal,
    cmist,
  }
}

export function getEventReliefSteps(
  area: PlanningArea,
  event: ActiveEvent | null,
): LocalReliefStep[] {
  if (!event) return getLocalReliefSteps(area, 'hurricane')

  const localSteps = getLocalReliefSteps(area, event.hazard)
  const timingByHazard: Record<HazardId, string> = {
    hurricane: 'Before tropical-storm-force winds',
    flood: 'Before the heaviest rain bands',
    tsunami: 'Before the first possible wave',
    wildfire: 'Before smoke or closures block evacuation routes',
  }

  return [
    {
      title: event.firstAction,
      owner: `${area.name} zone lead`,
      timing: timingByHazard[event.hazard],
    },
    ...localSteps.slice(1),
  ]
}

const plainNeedLabels: Record<string, string> = {
  Communication: 'Clear information and language help',
  Medical: 'Medical support and backup power',
  Independence: 'Mobility and daily-living support',
  Safety: 'Safe shelter and protection',
  Transportation: 'Transportation and evacuation help',
}

const routeNamesByArea: Record<string, string[]> = {
  'oahu-town': [
    'H-1 urban corridor',
    'Ala Moana–Waikīkī shoreline route',
    'Pali Highway medical access',
  ],
  'oahu-east-honolulu': [
    'Kalanianaʻole Highway',
    'Hawaiʻi Kai Drive',
    'Lunalilo Home Road',
  ],
  'oahu-kailua': ['Kailua Road', 'Mokapu Boulevard', 'Pali Highway access'],
  'oahu-kaneohe': [
    'Kamehameha Highway',
    'Likelike Highway',
    'Kāneʻohe Bay Drive',
  ],
  'oahu-waimanalo': [
    'Kalanianaʻole Highway',
    'Waimānalo Beach Road',
    'Kailua connection',
  ],
  'oahu-central': [
    'H-2 central corridor',
    'Kamehameha Highway',
    'Wahiawā emergency access',
  ],
  'oahu-north-shore': [
    'Kamehameha Highway north',
    'Waialua coastal access',
    'Haleʻiwa bypass',
  ],
  'oahu-koolauloa': [
    'Kamehameha Highway windward',
    'Lāʻie community access',
    'Kahuku medical access',
  ],
  'oahu-ewa': [
    'H-1 west corridor',
    'Fort Weaver Road',
    'Farrington Highway connection',
  ],
  'oahu-leeward': [
    'Farrington Highway',
    'Nānākuli coastal access',
    'Māʻili emergency route',
  ],
}

export function getLocalResourceInventory(
  area: PlanningArea,
): LocalResourceSite[] {
  const shelterCount = Math.max(2, Math.round(area.population / 75000) + 1)
  const backupPowerCount = Math.max(
    1,
    Math.min(shelterCount, Math.round((shelterCount * area.readiness) / 100)),
  )
  const transportCount = Math.max(
    1,
    Math.min(3, Math.round(area.households / 4500)),
  )
  const offsets: Array<[number, number]> = [
    [-0.018, 0.012],
    [0.016, 0.01],
    [-0.012, -0.014],
    [0.019, -0.011],
    [0.002, 0.022],
    [-0.024, -0.002],
  ]
  const shelters = Array.from({ length: shelterCount }, (_, index) => ({
    id: `${area.id}-shelter-${index + 1}`,
    name:
      index === 0
        ? `${area.name} Community Shelter`
        : `${area.name} Shelter ${index + 1}`,
    areaId: area.id,
    coordinates: [
      area.coordinates[0] + offsets[index % offsets.length][0],
      area.coordinates[1] + offsets[index % offsets.length][1],
    ] as [number, number],
    kind: 'shelter' as const,
    capacity: 120 + index * 60,
    capabilities: [
      'Accessible entry',
      ...(index < backupPowerCount ? ['Backup power'] : []),
      ...(index % 2 === 0 ? ['Language assistance'] : []),
    ],
    status:
      index < Math.max(1, shelterCount - 1)
        ? ('confirmed' as const)
        : ('needs-confirmation' as const),
  }))
  const transport = Array.from({ length: transportCount }, (_, index) => ({
    id: `${area.id}-transport-${index + 1}`,
    name:
      index === 0
        ? `${area.name} Accessible Transport Team`
        : `${area.name} Transport Team ${index + 1}`,
    areaId: area.id,
    coordinates: [
      area.coordinates[0] + offsets[(index + shelterCount) % offsets.length][0],
      area.coordinates[1] + offsets[(index + shelterCount) % offsets.length][1],
    ] as [number, number],
    kind: 'transport' as const,
    capacity: 18 + index * 8,
    capabilities: ['Wheelchair transport', 'Driver coordination'],
    status:
      index === 0 ? ('confirmed' as const) : ('needs-confirmation' as const),
  }))

  return [...shelters, ...transport]
}

export function getLocalRouteChecks(area: PlanningArea): LocalRouteCheck[] {
  return (routeNamesByArea[area.id] ?? [`${area.name} primary access`]).map(
    (name, index) => ({
      name,
      status: index === 1 ? 'clear' : 'needs-confirmation',
    }),
  )
}

export function getChallengeSnapshot(
  area: PlanningArea,
  scenario: ScenarioView,
  resources = getLocalResourceInventory(area),
  routes = getLocalRouteChecks(area),
): ChallengeSnapshot {
  const topNeeds = [...scenario.cmist]
    .sort((first, second) => second.value - first.value)
    .slice(0, 2)
    .map((item) => plainNeedLabels[item.category] ?? item.category)
  const shelters = resources.filter((site) => site.kind === 'shelter')

  return {
    topNeeds,
    sheltersNearby: shelters.length,
    backupPowerSites: shelters.filter((site) =>
      site.capabilities.includes('Backup power'),
    ).length,
    transportTeams: resources.filter((site) => site.kind === 'transport')
      .length,
    routesToVerify: routes.filter(
      (route) => route.status === 'needs-confirmation',
    ).length,
  }
}
