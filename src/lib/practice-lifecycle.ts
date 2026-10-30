export const lifecycleSchema = 'practice-lifecycle.v1' as const
export const lifecycleStorageKey = 'practice-lifecycle.v1'
export const maxLifecycleImportBytes = 128 * 1024
export const practiceStamp = 'PRACTICE · UNSENT'

export const capabilityIds = [
  'B01',
  'B02',
  'B03',
  'B04',
  'B05',
  'B06',
  'B07',
  'B08',
  'B09',
  'B10',
  'D01',
  'D02',
  'D03',
  'D04',
  'D05',
  'D06',
  'D07',
  'D08',
  'D09',
  'D10',
  'A01',
  'A02',
  'A03',
  'A04',
  'A05',
  'A06',
  'A07',
  'A08',
  'A09',
  'A10',
] as const

export type CapabilityId = (typeof capabilityIds)[number]
export type LifecyclePhase = 'before' | 'during' | 'after' | 'complete'
export type PracticeRole =
  | 'Facilitator'
  | 'Planning lead'
  | 'Mass-care lead'
  | 'Outreach partner'
  | 'Recovery lead'
export type PracticePartner =
  | 'Practice Partner A'
  | 'Practice Partner B'
  | 'Practice Partner C'
  | 'Practice Partner D'

export const practiceRoles: PracticeRole[] = [
  'Facilitator',
  'Planning lead',
  'Mass-care lead',
  'Outreach partner',
  'Recovery lead',
]
export const practicePartners: PracticePartner[] = [
  'Practice Partner A',
  'Practice Partner B',
  'Practice Partner C',
  'Practice Partner D',
]
export const dueBands = ['T+30', 'T+60', 'T+120'] as const
export const objectiveCatalog = [
  { id: 'timing', label: 'Preserve preparation margin' },
  { id: 'transport', label: 'Resolve a support-item blocker' },
  { id: 'outreach', label: 'Prepare accessible guidance blocks' },
  { id: 'evidence', label: 'Refresh practice evidence' },
  { id: 'shift', label: 'Freeze a role-to-role handoff' },
] as const
export const gapCatalog = [
  { id: 'communication', label: 'Accessible communication gap' },
  { id: 'medical', label: 'Medical-power continuity gap' },
  { id: 'independence', label: 'Daily-living support gap' },
  { id: 'safety', label: 'Mass-care support gap' },
  { id: 'transportation', label: 'Accessible transportation gap' },
] as const
export const serviceAreas = [
  'Community outreach',
  'Mass-care support',
  'Transportation support',
] as const
export const guidanceBlocks = [
  'Situation',
  'Accessible formats',
  'Support options',
  'Next review',
] as const
export const cmistDomains = [
  'Communication',
  'Medical',
  'Independence',
  'Safety',
  'Transportation',
] as const
export const unmetNeedBands = [
  'Unknown — not zero',
  '1–9 aggregate',
  '10–49 aggregate',
  '50+ aggregate',
] as const

type GapId = (typeof gapCatalog)[number]['id']
type ObjectiveId = (typeof objectiveCatalog)[number]['id']
type ServiceArea = (typeof serviceAreas)[number]
type GuidanceBlock = (typeof guidanceBlocks)[number]
type CmistDomain = (typeof cmistDomains)[number]

export type LifecycleLedgerEvent = {
  sequence: number
  capability: CapabilityId
  cycle: number
  practiceMinute: number
  summary: string
}

export type CarriedGap = {
  gapId: GapId
  rank: number
  owner: PracticeRole
  dueBand: (typeof dueBands)[number]
}

export type PracticeEvidence = {
  id: string
  gapId: GapId
  state:
    'practice-reported criteria present' | 'unknown' | 'stale' | 'superseded'
  partner: PracticePartner
  recordedMinute: number
  supersedes: string | null
}

export type PracticeInject = {
  id: string
  stage: 'MAP' | 'MODEL' | 'MATCH'
  minute: number
  area: ServiceArea
}

export type SupportItem = {
  id: string
  gapId: GapId
  owner: PracticeRole
  dueMinute: number
  partner: PracticePartner | null
  response: 'not asked' | 'hold' | 'decline' | 'unknown'
  escalation: null | {
    reason: 'overdue' | 'all responses declined' | 'evidence needs review'
    owner: PracticeRole
    deadlineMinute: number
  }
  disposition: 'undecided' | 'carried' | 'set aside'
}

export type ServiceAreaRecord = {
  area: ServiceArea
  state: 'condition reported' | 'unknown' | 'unavailable'
  recheckMinutes: 15 | 30 | 60
  recordedMinute: number
}

export type GuidanceVersion = {
  version: number
  createdMinute: number
  status: typeof practiceStamp
  blocks: Record<GuidanceBlock, string>
  superseded: boolean
}

export type RecoveryRow = {
  supportItemId: string
  gapId: GapId
  horizon: 'next shift' | 'next day' | 'next exercise'
  state: 'pending' | 'follow-up-ready'
}

export type UnmetNeedRecord = {
  domain: CmistDomain
  band: (typeof unmetNeedBands)[number]
  basis: 'practice observation' | 'practice model' | 'unknown basis'
  owner: PracticeRole | null
}

export type LifecycleState = {
  schema: typeof lifecycleSchema
  cycle: number
  phase: LifecyclePhase
  practiceMinute: number
  event: null | {
    id: 'hurricane-amber' | 'wildfire-cinder'
    label: string
    hazard: 'hurricane' | 'wildfire'
  }
  carriedGaps: CarriedGap[]
  objectives: ObjectiveId[]
  timing: {
    warningMinutes: number
    preparationMinutes: number
    marginMinutes: number | null
  }
  assumptions: {
    r1: { uptakePercent: number; supportDays: number }
    comparison: { uptakePercent: number; supportDays: number }
    chosen: 'r1' | 'comparison' | null
    demandDelta: number | null
    r2: null | {
      uptakePercent: number
      supportDays: number
      demandDeltaFromR1: number
    }
  }
  formats: Record<
    'Plain language' | 'Large text' | 'Audio script',
    'planned' | 'gap' | 'unknown'
  >
  channel: 'trusted voice' | 'printed handout' | 'local radio'
  evidence: PracticeEvidence[]
  simulationScope: Record<ServiceArea, 'simulated' | 'unavailable'>
  injects: PracticeInject[]
  h1: null | {
    digest: string
    sealedMinute: number
    carriedGapIds: GapId[]
    objectiveIds: ObjectiveId[]
  }
  supportItems: SupportItem[]
  serviceRecords: ServiceAreaRecord[]
  guidanceVersions: GuidanceVersion[]
  shiftSnapshot: null | {
    outgoing: PracticeRole
    incoming: PracticeRole
    practiceMinute: number
    blocked: number
    overdue: number
    staleEvidence: number
  }
  h2: null | {
    digest: string
    sealedMinute: number
    carried: number
    setAside: number
  }
  recoveryRows: RecoveryRow[]
  unmetNeeds: UnmetNeedRecord[]
  holdReview: {
    attempted: boolean
    refusedItemIds: string[]
  }
  recheckPlans: Array<{
    area: ServiceArea
    owner: PracticeRole
    horizon: 'next shift' | 'next day' | 'next exercise'
  }>
  recoveryDraft: null | {
    status: typeof practiceStamp
    classifications: Record<
      GuidanceBlock,
      'withdrawn' | 'unknown' | 'carried into recovery draft r1'
    >
  }
  objectiveReview: Array<{
    objectiveId: ObjectiveId
    score: 'met' | 'partly met' | 'not met'
    reason: string
    disposition: 'undecided' | 'carry-forward' | 'note-only'
  }>
  gateDecision: null | 'gates-met' | 'gates-unmet-carry-forward'
  packetSections: Array<
    'cycle summary' | 'handoffs' | 'recovery register' | 'objective review'
  >
  previousCycle: null | {
    cycle: number
    digest: string
    carriedGapIds: GapId[]
    carriedObjectiveIds: ObjectiveId[]
  }
  comparison: null | {
    digest: string
    cycle: number
    phase: LifecyclePhase
  }
  capabilityMarkers: CapabilityId[]
  ledger: LifecycleLedgerEvent[]
}

export type LifecycleAction =
  | { type: 'lock-event'; eventId: 'hurricane-amber' | 'wildfire-cinder' }
  | {
      type: 'carry-gap'
      gapId: GapId
      owner: PracticeRole
      dueBand: (typeof dueBands)[number]
    }
  | { type: 'set-objectives'; objectiveIds: ObjectiveId[] }
  | {
      type: 'set-timing'
      warningMinutes: number
      preparationMinutes: number
    }
  | {
      type: 'choose-assumption'
      choice: 'r1' | 'comparison'
      uptakePercent: number
      supportDays: number
    }
  | {
      type: 'set-format'
      format: keyof LifecycleState['formats']
      state: LifecycleState['formats'][keyof LifecycleState['formats']]
      channel: LifecycleState['channel']
    }
  | {
      type: 'record-evidence'
      gapId: GapId
      state: PracticeEvidence['state']
      partner: PracticePartner
    }
  | {
      type: 'set-scope'
      area: ServiceArea
      state: 'simulated' | 'unavailable'
    }
  | {
      type: 'schedule-inject'
      stage: PracticeInject['stage']
      minute: number
      area: ServiceArea
    }
  | { type: 'seal-h1' }
  | { type: 'start-during' }
  | { type: 'advance-clock'; minutes: 15 | 30 | 60 }
  | {
      type: 'record-service-area'
      area: ServiceArea
      state: ServiceAreaRecord['state']
      recheckMinutes: ServiceAreaRecord['recheckMinutes']
    }
  | {
      type: 'ask-partner'
      supportItemId: string
      partner: PracticePartner
      response: Exclude<SupportItem['response'], 'not asked'>
    }
  | {
      type: 'escalate-item'
      supportItemId: string
      reason: NonNullable<SupportItem['escalation']>['reason']
      owner: PracticeRole
      deadlineMinutes: 15 | 30 | 60
    }
  | {
      type: 'add-r2'
      uptakePercent: number
      supportDays: number
    }
  | { type: 'create-guidance' }
  | {
      type: 'freeze-shift'
      outgoing: PracticeRole
      incoming: PracticeRole
    }
  | {
      type: 'replace-evidence'
      evidenceId: string
      state: Exclude<PracticeEvidence['state'], 'stale' | 'superseded'>
    }
  | {
      type: 'set-support-disposition'
      supportItemId: string
      disposition: 'carried' | 'set aside'
    }
  | { type: 'seal-h2' }
  | {
      type: 'configure-recovery-row'
      supportItemId: string
      horizon: RecoveryRow['horizon']
      state: RecoveryRow['state']
    }
  | {
      type: 'set-unmet-need'
      domain: CmistDomain
      band: UnmetNeedRecord['band']
      basis: UnmetNeedRecord['basis']
      owner: PracticeRole | null
    }
  | { type: 'review-holds' }
  | {
      type: 'plan-recheck'
      area: ServiceArea
      owner: PracticeRole
      horizon: 'next shift' | 'next day' | 'next exercise'
    }
  | {
      type: 'classify-guidance'
      block: GuidanceBlock
      classification: 'withdrawn' | 'unknown' | 'carried into recovery draft r1'
    }
  | {
      type: 'review-objective'
      objectiveId: ObjectiveId
      disposition: 'carry-forward' | 'note-only'
    }
  | {
      type: 'decide-gates'
      decision: 'gates-met' | 'gates-unmet-carry-forward'
    }
  | { type: 'pin-comparison'; text: string }
  | {
      type: 'select-packet-sections'
      sections: LifecycleState['packetSections']
    }
  | { type: 'start-next-cycle' }

const beforeActionTypes = new Set<LifecycleAction['type']>([
  'lock-event',
  'carry-gap',
  'set-objectives',
  'set-timing',
  'choose-assumption',
  'set-format',
  'record-evidence',
  'set-scope',
  'schedule-inject',
  'seal-h1',
])

const duringActionTypes = new Set<LifecycleAction['type']>([
  'advance-clock',
  'record-service-area',
  'ask-partner',
  'escalate-item',
  'add-r2',
  'create-guidance',
  'freeze-shift',
  'replace-evidence',
  'set-support-disposition',
  'seal-h2',
])

function requiredPhase(
  action: LifecycleAction,
): Exclude<LifecyclePhase, 'complete'> {
  if (beforeActionTypes.has(action.type) || action.type === 'start-during')
    return 'before'
  if (duringActionTypes.has(action.type)) return 'during'
  return 'after'
}

const eventCatalog: Record<
  'hurricane-amber' | 'wildfire-cinder',
  NonNullable<LifecycleState['event']>
> = {
  'hurricane-amber': {
    id: 'hurricane-amber',
    label: 'Practice Event Amber',
    hazard: 'hurricane',
  },
  'wildfire-cinder': {
    id: 'wildfire-cinder',
    label: 'Practice Event Cinder',
    hazard: 'wildfire',
  },
}

const emptyFormats: LifecycleState['formats'] = {
  'Plain language': 'unknown',
  'Large text': 'unknown',
  'Audio script': 'unknown',
}

const emptyScope: LifecycleState['simulationScope'] = {
  'Community outreach': 'unavailable',
  'Mass-care support': 'unavailable',
  'Transportation support': 'unavailable',
}

export function createInitialLifecycleState(): LifecycleState {
  return {
    schema: lifecycleSchema,
    cycle: 1,
    phase: 'before',
    practiceMinute: -60,
    event: null,
    carriedGaps: [],
    objectives: [],
    timing: {
      warningMinutes: 120,
      preparationMinutes: 60,
      marginMinutes: null,
    },
    assumptions: {
      r1: { uptakePercent: 10, supportDays: 3 },
      comparison: { uptakePercent: 20, supportDays: 5 },
      chosen: null,
      demandDelta: null,
      r2: null,
    },
    formats: { ...emptyFormats },
    channel: 'trusted voice',
    evidence: [],
    simulationScope: { ...emptyScope },
    injects: [],
    h1: null,
    supportItems: [],
    serviceRecords: [],
    guidanceVersions: [],
    shiftSnapshot: null,
    h2: null,
    recoveryRows: [],
    unmetNeeds: [],
    holdReview: { attempted: false, refusedItemIds: [] },
    recheckPlans: [],
    recoveryDraft: null,
    objectiveReview: [],
    gateDecision: null,
    packetSections: ['cycle summary', 'handoffs'],
    previousCycle: null,
    comparison: null,
    capabilityMarkers: [],
    ledger: [],
  }
}

function assertWholeBounded(
  value: number,
  min: number,
  max: number,
  label: string,
) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`${label} must be a whole number from ${min} to ${max}.`)
}

function record(
  state: LifecycleState,
  capability: CapabilityId,
  summary: string,
): LifecycleState {
  return {
    ...state,
    capabilityMarkers: state.capabilityMarkers.includes(capability)
      ? state.capabilityMarkers
      : [...state.capabilityMarkers, capability],
    ledger: [
      ...state.ledger,
      {
        sequence: state.ledger.length + 1,
        capability,
        cycle: state.cycle,
        practiceMinute: state.practiceMinute,
        summary,
      },
    ],
  }
}

function dueMinute(dueBand: (typeof dueBands)[number], marginMinutes: number) {
  return Number(dueBand.slice(2)) + Math.max(0, marginMinutes)
}

function assumptionDemand(uptakePercent: number, supportDays: number) {
  return Math.ceil(500 * (uptakePercent / 100) * supportDays * 3)
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function fnvDigest(text: string) {
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85ebca6b)
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`
}

export function canonicalLifecycleRecord(state: LifecycleState) {
  return {
    schema: lifecycleSchema,
    stamp: practiceStamp,
    cycle: state.cycle,
    phase: state.phase,
    practiceMinute: state.practiceMinute,
    event: state.event,
    carriedGaps: state.carriedGaps,
    objectives: state.objectives,
    timing: state.timing,
    assumptions: state.assumptions,
    formats: state.formats,
    channel: state.channel,
    evidence: state.evidence,
    simulationScope: state.simulationScope,
    injects: state.injects,
    h1: state.h1,
    supportItems: state.supportItems,
    serviceRecords: state.serviceRecords,
    guidanceVersions: state.guidanceVersions,
    shiftSnapshot: state.shiftSnapshot,
    h2: state.h2,
    recoveryRows: state.recoveryRows,
    unmetNeeds: state.unmetNeeds,
    holdReview: state.holdReview,
    recheckPlans: state.recheckPlans,
    recoveryDraft: state.recoveryDraft,
    objectiveReview: state.objectiveReview,
    gateDecision: state.gateDecision,
    packetSections: state.packetSections,
    previousCycle: state.previousCycle,
  }
}

export function lifecycleDigest(state: LifecycleState) {
  return fnvDigest(stableStringify(canonicalLifecycleRecord(state)))
}

export function exportLifecycleRecord(state: LifecycleState) {
  return JSON.stringify(canonicalLifecycleRecord(state), null, 2)
}

function exactKeys(
  value: unknown,
  keys: string[],
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key))
  )
}

function rejectDuplicateKeys(text: string) {
  const objects: Array<Set<string> | null> = []
  for (let index = 0; index < text.length; index++) {
    const token = text[index]
    if (token === '{') objects.push(new Set())
    else if (token === '[') objects.push(null)
    else if (token === '}' || token === ']') objects.pop()
    else if (token === '"') {
      const start = index++
      while (index < text.length) {
        if (text[index] === '\\') index += 2
        else if (text[index] === '"') break
        else index++
      }
      let next = index + 1
      while (next < text.length && /\s/.test(text[next] ?? '')) next++
      if (text[next] === ':') {
        const key: string = JSON.parse(text.slice(start, index + 1))
        const keys = objects[objects.length - 1]
        if (keys?.has(key))
          throw new Error('Duplicate JSON fields are not allowed.')
        keys?.add(key)
      }
    }
  }
}

const canonicalKeys = Object.keys(
  canonicalLifecycleRecord(createInitialLifecycleState()),
)

function stringIn<T extends readonly string[]>(
  value: unknown,
  choices: T,
): value is T[number] {
  return typeof value === 'string' && choices.includes(value)
}

function arrayOfExact(
  value: unknown,
  keys: string[],
  validate: (row: Record<string, unknown>) => boolean,
) {
  return (
    Array.isArray(value) &&
    value.every((row) => exactKeys(row, keys) && validate(row))
  )
}

function validCanonicalRecord(
  value: unknown,
): value is ReturnType<typeof canonicalLifecycleRecord> {
  if (!exactKeys(value, canonicalKeys)) return false
  const record = value
  const phaseChoices = ['before', 'during', 'after', 'complete'] as const
  const gapIds = gapCatalog.map((item) => item.id)
  const objectiveIds = objectiveCatalog.map((item) => item.id)
  const formatStates = ['planned', 'gap', 'unknown'] as const
  const evidenceStates = [
    'practice-reported criteria present',
    'unknown',
    'stale',
    'superseded',
  ] as const
  const supportResponses = ['not asked', 'hold', 'decline', 'unknown'] as const
  const supportDispositions = ['undecided', 'carried', 'set aside'] as const
  const serviceStates = [
    'condition reported',
    'unknown',
    'unavailable',
  ] as const
  const horizons = ['next shift', 'next day', 'next exercise'] as const
  const rowStates = ['pending', 'follow-up-ready'] as const
  const bases = [
    'practice observation',
    'practice model',
    'unknown basis',
  ] as const
  const classifications = [
    'withdrawn',
    'unknown',
    'carried into recovery draft r1',
  ] as const
  const scores = ['met', 'partly met', 'not met'] as const
  const objectiveDispositions = [
    'undecided',
    'carry-forward',
    'note-only',
  ] as const
  const packetChoices = [
    'cycle summary',
    'handoffs',
    'recovery register',
    'objective review',
  ] as const
  const validEvent =
    record.event === null ||
    (exactKeys(record.event, ['id', 'label', 'hazard']) &&
      stringIn(record.event.id, [
        'hurricane-amber',
        'wildfire-cinder',
      ] as const) &&
      typeof record.event.label === 'string' &&
      stringIn(record.event.hazard, ['hurricane', 'wildfire'] as const))
  const timing = record.timing as Record<string, unknown>
  const assumptions = record.assumptions as Record<string, unknown>
  const formats = record.formats as Record<string, unknown>
  const simulationScope = record.simulationScope as Record<string, unknown>
  if (
    record.schema !== lifecycleSchema ||
    record.stamp !== practiceStamp ||
    !Number.isSafeInteger(record.cycle) ||
    Number(record.cycle) < 1 ||
    !stringIn(record.phase, phaseChoices) ||
    !Number.isSafeInteger(record.practiceMinute) ||
    !validEvent ||
    !arrayOfExact(
      record.carriedGaps,
      ['gapId', 'rank', 'owner', 'dueBand'],
      (row) =>
        stringIn(row.gapId, gapIds) &&
        Number.isSafeInteger(row.rank) &&
        stringIn(row.owner, practiceRoles) &&
        stringIn(row.dueBand, dueBands),
    ) ||
    !Array.isArray(record.objectives) ||
    record.objectives.some((id) => !stringIn(id, objectiveIds)) ||
    !exactKeys(timing, [
      'warningMinutes',
      'preparationMinutes',
      'marginMinutes',
    ]) ||
    !Number.isSafeInteger(timing.warningMinutes) ||
    !Number.isSafeInteger(timing.preparationMinutes) ||
    !(
      timing.marginMinutes === null ||
      Number.isSafeInteger(timing.marginMinutes)
    ) ||
    !exactKeys(assumptions, ['r1', 'comparison', 'chosen', 'demandDelta', 'r2'])
  )
    return false
  const validAssumption = (item: unknown) =>
    exactKeys(item, ['uptakePercent', 'supportDays']) &&
    Number.isSafeInteger(item.uptakePercent) &&
    Number.isSafeInteger(item.supportDays)
  if (
    !validAssumption(assumptions.r1) ||
    !validAssumption(assumptions.comparison) ||
    !(
      assumptions.chosen === null ||
      stringIn(assumptions.chosen, ['r1', 'comparison'] as const)
    ) ||
    !(
      assumptions.demandDelta === null ||
      Number.isSafeInteger(assumptions.demandDelta)
    ) ||
    !(
      assumptions.r2 === null ||
      (exactKeys(assumptions.r2, [
        'uptakePercent',
        'supportDays',
        'demandDeltaFromR1',
      ]) &&
        Number.isSafeInteger(assumptions.r2.uptakePercent) &&
        Number.isSafeInteger(assumptions.r2.supportDays) &&
        Number.isSafeInteger(assumptions.r2.demandDeltaFromR1))
    ) ||
    !exactKeys(formats, ['Plain language', 'Large text', 'Audio script']) ||
    Object.values(formats).some((item) => !stringIn(item, formatStates)) ||
    !stringIn(record.channel, [
      'trusted voice',
      'printed handout',
      'local radio',
    ] as const) ||
    !arrayOfExact(
      record.evidence,
      ['id', 'gapId', 'state', 'partner', 'recordedMinute', 'supersedes'],
      (row) =>
        typeof row.id === 'string' &&
        stringIn(row.gapId, gapIds) &&
        stringIn(row.state, evidenceStates) &&
        stringIn(row.partner, practicePartners) &&
        Number.isSafeInteger(row.recordedMinute) &&
        (row.supersedes === null || typeof row.supersedes === 'string'),
    ) ||
    !exactKeys(simulationScope, [...serviceAreas]) ||
    Object.values(simulationScope).some(
      (item) => !stringIn(item, ['simulated', 'unavailable'] as const),
    ) ||
    !arrayOfExact(
      record.injects,
      ['id', 'stage', 'minute', 'area'],
      (row) =>
        typeof row.id === 'string' &&
        stringIn(row.stage, ['MAP', 'MODEL', 'MATCH'] as const) &&
        Number.isSafeInteger(row.minute) &&
        stringIn(row.area, serviceAreas),
    )
  )
    return false
  const validHandoff = (
    handoff: unknown,
    keys: string[],
    validate: (row: Record<string, unknown>) => boolean,
  ) => handoff === null || (exactKeys(handoff, keys) && validate(handoff))
  if (
    !validHandoff(
      record.h1,
      ['digest', 'sealedMinute', 'carriedGapIds', 'objectiveIds'],
      (row) =>
        typeof row.digest === 'string' &&
        Number.isSafeInteger(row.sealedMinute) &&
        Array.isArray(row.carriedGapIds) &&
        row.carriedGapIds.every((id) => stringIn(id, gapIds)) &&
        Array.isArray(row.objectiveIds) &&
        row.objectiveIds.every((id) => stringIn(id, objectiveIds)),
    ) ||
    !arrayOfExact(
      record.supportItems,
      [
        'id',
        'gapId',
        'owner',
        'dueMinute',
        'partner',
        'response',
        'escalation',
        'disposition',
      ],
      (row) =>
        typeof row.id === 'string' &&
        stringIn(row.gapId, gapIds) &&
        stringIn(row.owner, practiceRoles) &&
        Number.isSafeInteger(row.dueMinute) &&
        (row.partner === null || stringIn(row.partner, practicePartners)) &&
        stringIn(row.response, supportResponses) &&
        (row.escalation === null ||
          (exactKeys(row.escalation, ['reason', 'owner', 'deadlineMinute']) &&
            stringIn(row.escalation.reason, [
              'overdue',
              'all responses declined',
              'evidence needs review',
            ] as const) &&
            stringIn(row.escalation.owner, practiceRoles) &&
            Number.isSafeInteger(row.escalation.deadlineMinute))) &&
        stringIn(row.disposition, supportDispositions),
    ) ||
    !arrayOfExact(
      record.serviceRecords,
      ['area', 'state', 'recheckMinutes', 'recordedMinute'],
      (row) =>
        stringIn(row.area, serviceAreas) &&
        stringIn(row.state, serviceStates) &&
        [15, 30, 60].includes(Number(row.recheckMinutes)) &&
        Number.isSafeInteger(row.recordedMinute),
    ) ||
    !arrayOfExact(
      record.guidanceVersions,
      ['version', 'createdMinute', 'status', 'blocks', 'superseded'],
      (row) =>
        Number.isSafeInteger(row.version) &&
        Number.isSafeInteger(row.createdMinute) &&
        row.status === practiceStamp &&
        typeof row.superseded === 'boolean' &&
        exactKeys(row.blocks, [...guidanceBlocks]) &&
        Object.values(row.blocks).every((item) => typeof item === 'string'),
    ) ||
    !validHandoff(
      record.shiftSnapshot,
      [
        'outgoing',
        'incoming',
        'practiceMinute',
        'blocked',
        'overdue',
        'staleEvidence',
      ],
      (row) =>
        stringIn(row.outgoing, practiceRoles) &&
        stringIn(row.incoming, practiceRoles) &&
        Number.isSafeInteger(row.practiceMinute) &&
        Number.isSafeInteger(row.blocked) &&
        Number.isSafeInteger(row.overdue) &&
        Number.isSafeInteger(row.staleEvidence),
    ) ||
    !validHandoff(
      record.h2,
      ['digest', 'sealedMinute', 'carried', 'setAside'],
      (row) =>
        typeof row.digest === 'string' &&
        Number.isSafeInteger(row.sealedMinute) &&
        Number.isSafeInteger(row.carried) &&
        Number.isSafeInteger(row.setAside),
    )
  )
    return false
  if (
    !arrayOfExact(
      record.recoveryRows,
      ['supportItemId', 'gapId', 'horizon', 'state'],
      (row) =>
        typeof row.supportItemId === 'string' &&
        stringIn(row.gapId, gapIds) &&
        stringIn(row.horizon, horizons) &&
        stringIn(row.state, rowStates),
    ) ||
    !arrayOfExact(
      record.unmetNeeds,
      ['domain', 'band', 'basis', 'owner'],
      (row) =>
        stringIn(row.domain, cmistDomains) &&
        stringIn(row.band, unmetNeedBands) &&
        stringIn(row.basis, bases) &&
        (row.owner === null || stringIn(row.owner, practiceRoles)),
    ) ||
    !exactKeys(record.holdReview, ['attempted', 'refusedItemIds']) ||
    typeof record.holdReview.attempted !== 'boolean' ||
    !Array.isArray(record.holdReview.refusedItemIds) ||
    (record.holdReview.refusedItemIds as unknown[]).some(
      (id) => typeof id !== 'string',
    ) ||
    !arrayOfExact(
      record.recheckPlans,
      ['area', 'owner', 'horizon'],
      (row) =>
        stringIn(row.area, serviceAreas) &&
        stringIn(row.owner, practiceRoles) &&
        stringIn(row.horizon, horizons),
    ) ||
    !validHandoff(
      record.recoveryDraft,
      ['status', 'classifications'],
      (row) =>
        row.status === practiceStamp &&
        exactKeys(row.classifications, [...guidanceBlocks]) &&
        Object.values(row.classifications).every((item) =>
          stringIn(item, classifications),
        ),
    ) ||
    !arrayOfExact(
      record.objectiveReview,
      ['objectiveId', 'score', 'reason', 'disposition'],
      (row) =>
        stringIn(row.objectiveId, objectiveIds) &&
        stringIn(row.score, scores) &&
        typeof row.reason === 'string' &&
        stringIn(row.disposition, objectiveDispositions),
    ) ||
    !(
      record.gateDecision === null ||
      stringIn(record.gateDecision, [
        'gates-met',
        'gates-unmet-carry-forward',
      ] as const)
    ) ||
    !Array.isArray(record.packetSections) ||
    record.packetSections.some(
      (section) => !stringIn(section, packetChoices),
    ) ||
    !validHandoff(
      record.previousCycle,
      ['cycle', 'digest', 'carriedGapIds', 'carriedObjectiveIds'],
      (row) =>
        Number.isSafeInteger(row.cycle) &&
        typeof row.digest === 'string' &&
        Array.isArray(row.carriedGapIds) &&
        row.carriedGapIds.every((id) => stringIn(id, gapIds)) &&
        Array.isArray(row.carriedObjectiveIds) &&
        row.carriedObjectiveIds.every((id) => stringIn(id, objectiveIds)),
    )
  )
    return false
  return true
}

export function parseLifecycleComparison(text: string) {
  if (new TextEncoder().encode(text).byteLength > maxLifecycleImportBytes)
    throw new Error('Lifecycle record exceeds the 128 KiB limit.')
  rejectDuplicateKeys(text)
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('Lifecycle comparison must be one valid JSON record.')
  }
  if (!validCanonicalRecord(value))
    throw new Error(
      'Lifecycle comparison fields do not match the exact schema.',
    )
  const comparison = value
  return {
    digest: fnvDigest(stableStringify(comparison)),
    cycle: comparison.cycle,
    phase: comparison.phase,
  }
}

export function restoreLifecycleState(text: string): LifecycleState {
  const value: unknown = JSON.parse(text)
  const initial = createInitialLifecycleState()
  if (
    !exactKeys(value, Object.keys(initial)) ||
    value.schema !== lifecycleSchema
  )
    throw new Error('Saved lifecycle state is not supported.')
  const state = value as LifecycleState
  if (
    !validCanonicalRecord(canonicalLifecycleRecord(state)) ||
    !Number.isSafeInteger(state.cycle) ||
    state.cycle < 1 ||
    !Number.isSafeInteger(state.practiceMinute) ||
    !Array.isArray(state.capabilityMarkers) ||
    state.capabilityMarkers.some((id) => !capabilityIds.includes(id))
  )
    throw new Error('Saved lifecycle state failed validation.')
  return state
}

export function revealedInjects(state: LifecycleState) {
  return state.injects.filter((inject) => inject.minute <= state.practiceMinute)
}

export function h1Gates(state: LifecycleState) {
  return {
    event: Boolean(state.event),
    action: state.carriedGaps.length > 0,
    objectives: state.objectives.length >= 1 && state.objectives.length <= 3,
    timing:
      state.timing.marginMinutes !== null &&
      Number.isSafeInteger(state.timing.marginMinutes),
    assumptions: state.assumptions.chosen !== null,
    scope: Object.values(state.simulationScope).includes('simulated'),
    inject: state.injects.length > 0,
    evidence:
      state.evidence.length > 0 &&
      state.evidence.every((item) =>
        state.carriedGaps.some((gap) => gap.gapId === item.gapId),
      ),
  }
}

export function h1Ready(state: LifecycleState) {
  return Object.values(h1Gates(state)).every(Boolean)
}

export function lifecycleGates(state: LifecycleState) {
  const latestGuidance = state.guidanceVersions.at(-1)
  return {
    recoveryRows:
      state.recoveryRows.length > 0 &&
      state.recoveryRows.every((row) => row.state === 'follow-up-ready'),
    unknownOwners:
      state.unmetNeeds.length === cmistDomains.length &&
      state.unmetNeeds.every(
        (item) => item.band !== 'Unknown — not zero' || item.owner !== null,
      ),
    holds:
      state.holdReview.attempted &&
      state.holdReview.refusedItemIds.length === 0,
    rechecks: state.serviceRecords
      .filter((record) => ['unknown', 'unavailable'].includes(record.state))
      .every((record) =>
        state.recheckPlans.some((plan) => plan.area === record.area),
      ),
    recoveryDraft:
      Boolean(latestGuidance) &&
      Boolean(state.recoveryDraft) &&
      guidanceBlocks.every(
        (block) => state.recoveryDraft?.classifications[block],
      ),
    objectives:
      state.objectiveReview.length === state.objectives.length &&
      state.objectiveReview.every((item) => item.disposition !== 'undecided'),
  }
}

export function lifecycleGatesMet(state: LifecycleState) {
  return Object.values(lifecycleGates(state)).every(Boolean)
}

function objectiveScore(
  state: LifecycleState,
  objectiveId: ObjectiveId,
): Omit<LifecycleState['objectiveReview'][number], 'disposition'> {
  if (objectiveId === 'timing') {
    const margin = state.timing.marginMinutes ?? -1
    return {
      objectiveId,
      score: margin > 0 ? 'met' : 'not met',
      reason:
        margin > 0
          ? `Practice margin remained ${margin} minutes.`
          : 'Practice preparation window was exhausted.',
    }
  }
  if (objectiveId === 'transport') {
    const items = state.supportItems.filter(
      (item) => item.gapId === 'transportation',
    )
    const escalated = items.some((item) => item.escalation)
    return {
      objectiveId,
      score:
        items.length === 0 ? 'partly met' : escalated ? 'met' : 'partly met',
      reason:
        items.length === 0
          ? 'No transportation gap was carried.'
          : escalated
            ? 'A transportation support item received a bounded escalation.'
            : 'Transportation support remained without escalation.',
    }
  }
  if (objectiveId === 'outreach') {
    const formatsPlanned = Object.values(state.formats).some(
      (value) => value === 'planned',
    )
    return {
      objectiveId,
      score:
        formatsPlanned && state.guidanceVersions.length > 0
          ? 'met'
          : 'partly met',
      reason:
        formatsPlanned && state.guidanceVersions.length > 0
          ? 'Accessible formats and a guidance version were prepared.'
          : 'Accessible-format or guidance-version work remains.',
    }
  }
  if (objectiveId === 'evidence') {
    const refreshed = state.evidence.some((item) => item.supersedes)
    return {
      objectiveId,
      score: refreshed ? 'met' : 'partly met',
      reason: refreshed
        ? 'A prior evidence claim was superseded by a current fixed-choice claim.'
        : 'No evidence claim was refreshed during the practice response.',
    }
  }
  return {
    objectiveId,
    score: state.shiftSnapshot ? 'met' : 'not met',
    reason: state.shiftSnapshot
      ? 'A role-to-role shift snapshot was frozen.'
      : 'No shift snapshot was frozen.',
  }
}

export function generateCloseoutPacket(state: LifecycleState) {
  const digest = lifecycleDigest(state)
  const sections: string[] = [
    practiceStamp,
    `Schema: ${lifecycleSchema}`,
    `Cycle digest: ${digest}`,
  ]
  if (state.packetSections.includes('cycle summary')) {
    sections.push(
      `## Cycle summary\nCycle ${state.cycle}; phase ${state.phase}; practice time T${state.practiceMinute >= 0 ? '+' : ''}${state.practiceMinute}.`,
    )
  }
  if (state.packetSections.includes('handoffs')) {
    sections.push(
      `## Handoffs\nH1: ${state.h1?.digest ?? 'not sealed'}\nH2: ${state.h2?.digest ?? 'not sealed'}`,
    )
  }
  if (state.packetSections.includes('recovery register')) {
    sections.push(
      `## Recovery register\n${state.recoveryRows
        .map(
          (row) =>
            `${row.supportItemId} | ${row.gapId} | ${row.horizon} | ${row.state}`,
        )
        .join('\n')}`,
    )
  }
  if (state.packetSections.includes('objective review')) {
    sections.push(
      `## Objective review\n${state.objectiveReview
        .map(
          (item) => `${item.objectiveId} | ${item.score} | ${item.disposition}`,
        )
        .join('\n')}`,
    )
  }
  return {
    filename: `practice-closeout-${digest}-PRACTICE-UNSENT.txt`,
    text: sections.join('\n\n'),
  }
}

export function applyLifecycleAction(
  state: LifecycleState,
  action: LifecycleAction,
): LifecycleState {
  if (state.phase === 'complete')
    throw new Error('Cycle 1 is read-only. Start the next practice cycle.')
  const expectedPhase = requiredPhase(action)
  if (state.phase !== expectedPhase)
    throw new Error(
      `${action.type} belongs to the ${expectedPhase} phase; the current phase is ${state.phase}.`,
    )
  if (state.h1 && beforeActionTypes.has(action.type))
    throw new Error('H1 is immutable. Start response practice to continue.')
  switch (action.type) {
    case 'lock-event': {
      if (state.event) throw new Error('Reset is required to change the event.')
      return record(
        { ...state, event: eventCatalog[action.eventId] },
        'B01',
        `Locked ${eventCatalog[action.eventId].label}.`,
      )
    }
    case 'carry-gap': {
      if (state.h1) throw new Error('H1 is immutable.')
      const existing = state.carriedGaps.filter(
        (item) => item.gapId !== action.gapId,
      )
      const next = [
        ...existing,
        {
          gapId: action.gapId,
          owner: action.owner,
          dueBand: action.dueBand,
          rank: existing.length + 1,
        },
      ].map((item, index) => ({ ...item, rank: index + 1 }))
      return record(
        { ...state, carriedGaps: next },
        'B02',
        `Carried ${action.gapId} with ${action.owner} and ${action.dueBand}.`,
      )
    }
    case 'set-objectives': {
      const unique = [...new Set(action.objectiveIds)]
      if (unique.length < 1 || unique.length > 3)
        throw new Error('Choose 1–3 practice objectives.')
      return record(
        { ...state, objectives: unique },
        'B03',
        `Selected ${unique.length} measurable objectives.`,
      )
    }
    case 'set-timing': {
      assertWholeBounded(action.warningMinutes, 0, 1440, 'Warning time')
      assertWholeBounded(action.preparationMinutes, 0, 1440, 'Preparation time')
      const marginMinutes = action.warningMinutes - action.preparationMinutes
      return record(
        {
          ...state,
          timing: {
            warningMinutes: action.warningMinutes,
            preparationMinutes: action.preparationMinutes,
            marginMinutes,
          },
        },
        'B04',
        `Computed a ${marginMinutes}-minute practice margin.`,
      )
    }
    case 'choose-assumption': {
      assertWholeBounded(action.uptakePercent, 1, 100, 'Uptake')
      assertWholeBounded(action.supportDays, 1, 14, 'Support days')
      const comparison = {
        uptakePercent: action.uptakePercent,
        supportDays: action.supportDays,
      }
      const delta =
        assumptionDemand(comparison.uptakePercent, comparison.supportDays) -
        assumptionDemand(
          state.assumptions.r1.uptakePercent,
          state.assumptions.r1.supportDays,
        )
      return record(
        {
          ...state,
          assumptions: {
            ...state.assumptions,
            comparison,
            chosen: action.choice,
            demandDelta: action.choice === 'r1' ? 0 : delta,
          },
        },
        'B05',
        `Selected ${action.choice} with a ${action.choice === 'r1' ? 0 : delta}-meal practice delta.`,
      )
    }
    case 'set-format': {
      return record(
        {
          ...state,
          formats: { ...state.formats, [action.format]: action.state },
          channel: action.channel,
        },
        'B06',
        `${action.format} marked ${action.state} for ${action.channel}.`,
      )
    }
    case 'record-evidence': {
      if (!state.carriedGaps.some((item) => item.gapId === action.gapId))
        throw new Error('Carry the readiness gap before recording evidence.')
      const evidence = state.evidence.filter(
        (item) => item.gapId !== action.gapId || item.supersedes !== null,
      )
      const id = `E-${state.cycle}-${action.gapId}-${evidence.length + 1}`
      return record(
        {
          ...state,
          evidence: [
            ...evidence,
            {
              id,
              gapId: action.gapId,
              state: action.state,
              partner: action.partner,
              recordedMinute: state.practiceMinute,
              supersedes: null,
            },
          ],
        },
        'B07',
        `Recorded fixed-choice evidence for ${action.gapId}.`,
      )
    }
    case 'set-scope': {
      return record(
        {
          ...state,
          simulationScope: {
            ...state.simulationScope,
            [action.area]: action.state,
          },
        },
        'B08',
        `${action.area} marked ${action.state}.`,
      )
    }
    case 'schedule-inject': {
      assertWholeBounded(action.minute, 0, 360, 'Inject time')
      if (state.simulationScope[action.area] !== 'simulated')
        throw new Error('Injects require a simulated service area.')
      const id = `I-${state.cycle}-${state.injects.length + 1}`
      return record(
        {
          ...state,
          injects: [
            ...state.injects,
            {
              id,
              stage: action.stage,
              minute: action.minute,
              area: action.area,
            },
          ].sort(
            (first, second) =>
              first.minute - second.minute ||
              first.stage.localeCompare(second.stage),
          ),
        },
        'B09',
        `Scheduled ${action.stage} inject ${id} for T+${action.minute}.`,
      )
    }
    case 'seal-h1': {
      if (!h1Ready(state))
        throw new Error('Complete every Before handoff gate first.')
      const digest = fnvDigest(
        stableStringify({
          event: state.event,
          gaps: state.carriedGaps,
          objectives: state.objectives,
          timing: state.timing,
          assumptions: state.assumptions,
          scope: state.simulationScope,
          injects: state.injects,
          evidence: state.evidence,
        }),
      )
      return record(
        {
          ...state,
          h1: {
            digest,
            sealedMinute: state.practiceMinute,
            carriedGapIds: state.carriedGaps.map((item) => item.gapId),
            objectiveIds: state.objectives,
          },
        },
        'B10',
        `Sealed H1 ${digest}; this is not an authorization decision.`,
      )
    }
    case 'start-during': {
      if (!state.h1) throw new Error('Seal H1 before starting During.')
      const margin = state.timing.marginMinutes ?? 0
      const supportItems = state.carriedGaps.map((gap, index) => ({
        id: `S-${state.cycle}-${index + 1}`,
        gapId: gap.gapId,
        owner: gap.owner,
        dueMinute: dueMinute(gap.dueBand, margin),
        partner: null,
        response: 'not asked' as const,
        escalation: null,
        disposition: 'undecided' as const,
      }))
      return record(
        { ...state, phase: 'during', practiceMinute: 0, supportItems },
        'D01',
        `Materialized ${supportItems.length} aggregate support items from H1.`,
      )
    }
    case 'advance-clock': {
      const practiceMinute = Math.min(
        360,
        state.practiceMinute + action.minutes,
      )
      const evidence = state.evidence.map((item) =>
        item.supersedes === null && practiceMinute - item.recordedMinute >= 60
          ? { ...item, state: 'stale' as const }
          : item,
      )
      return record(
        { ...state, practiceMinute, evidence },
        'D02',
        `Advanced deterministic practice time to T+${practiceMinute}.`,
      )
    }
    case 'record-service-area': {
      if (state.simulationScope[action.area] !== 'simulated')
        throw new Error('The service area is unavailable in this simulation.')
      const recordValue: ServiceAreaRecord = {
        area: action.area,
        state: action.state,
        recheckMinutes: action.recheckMinutes,
        recordedMinute: state.practiceMinute,
      }
      return record(
        {
          ...state,
          serviceRecords: [
            ...state.serviceRecords.filter((item) => item.area !== action.area),
            recordValue,
          ],
        },
        'D03',
        `${action.area} recorded as ${action.state}.`,
      )
    }
    case 'ask-partner': {
      const supportItems = state.supportItems.map((item) =>
        item.id === action.supportItemId
          ? {
              ...item,
              partner: action.partner,
              response: action.response,
            }
          : item,
      )
      if (!supportItems.some((item) => item.id === action.supportItemId))
        throw new Error('Support item not found.')
      return record(
        { ...state, supportItems },
        'D04',
        `${action.partner} recorded ${action.response} for ${action.supportItemId}.`,
      )
    }
    case 'escalate-item': {
      assertWholeBounded(action.deadlineMinutes, 15, 60, 'Deadline')
      const supportItems = state.supportItems.map((item) =>
        item.id === action.supportItemId
          ? {
              ...item,
              owner: action.owner,
              escalation: {
                reason: action.reason,
                owner: action.owner,
                deadlineMinute: state.practiceMinute + action.deadlineMinutes,
              },
            }
          : item,
      )
      if (!supportItems.some((item) => item.id === action.supportItemId))
        throw new Error('Support item not found.')
      return record(
        { ...state, supportItems },
        'D05',
        `Escalated ${action.supportItemId} to ${action.owner}.`,
      )
    }
    case 'add-r2': {
      if (revealedInjects(state).length === 0)
        throw new Error('Reveal an inject before adding r2.')
      assertWholeBounded(action.uptakePercent, 1, 100, 'Uptake')
      assertWholeBounded(action.supportDays, 1, 14, 'Support days')
      const demandDeltaFromR1 =
        assumptionDemand(action.uptakePercent, action.supportDays) -
        assumptionDemand(
          state.assumptions.r1.uptakePercent,
          state.assumptions.r1.supportDays,
        )
      return record(
        {
          ...state,
          assumptions: {
            ...state.assumptions,
            r2: {
              uptakePercent: action.uptakePercent,
              supportDays: action.supportDays,
              demandDeltaFromR1,
            },
          },
        },
        'D06',
        `Added r2 with a ${demandDeltaFromR1}-meal practice delta from sealed r1.`,
      )
    }
    case 'create-guidance': {
      const version = state.guidanceVersions.length + 1
      const conditions =
        state.serviceRecords
          .map((item) => `${item.area}: ${item.state}`)
          .join('; ') || 'No service-area record'
      const formats = Object.entries(state.formats)
        .map(([format, status]) => `${format}: ${status}`)
        .join('; ')
      const guidanceVersions = state.guidanceVersions.map((item) => ({
        ...item,
        superseded: true,
      }))
      guidanceVersions.push({
        version,
        createdMinute: state.practiceMinute,
        status: practiceStamp,
        superseded: false,
        blocks: {
          Situation: conditions,
          'Accessible formats': formats,
          'Support options': 'Use fixed practice support references only.',
          'Next review': `Review at T+${state.practiceMinute + 30}.`,
        },
      })
      return record(
        { ...state, guidanceVersions },
        'D07',
        `Created guidance version ${version} as ${practiceStamp}.`,
      )
    }
    case 'freeze-shift': {
      if (action.outgoing === action.incoming)
        throw new Error('Incoming practice role must be different.')
      const shiftSnapshot = {
        outgoing: action.outgoing,
        incoming: action.incoming,
        practiceMinute: state.practiceMinute,
        blocked: state.supportItems.filter(
          (item) => item.response === 'decline',
        ).length,
        overdue: state.supportItems.filter(
          (item) => item.dueMinute < state.practiceMinute,
        ).length,
        staleEvidence: state.evidence.filter((item) => item.state === 'stale')
          .length,
      }
      return record(
        { ...state, shiftSnapshot },
        'D08',
        `Froze shift handoff from ${action.outgoing} to ${action.incoming}.`,
      )
    }
    case 'replace-evidence': {
      const old = state.evidence.find(
        (item) =>
          item.id === action.evidenceId &&
          item.state === 'stale' &&
          item.supersedes === null,
      )
      if (!old) throw new Error('Choose a stale current evidence claim.')
      const oldUpdated = state.evidence.map((item) =>
        item.id === old.id ? { ...item, state: 'superseded' as const } : item,
      )
      const replacement: PracticeEvidence = {
        ...old,
        id: `${old.id}-R${state.evidence.length + 1}`,
        state: action.state,
        recordedMinute: state.practiceMinute,
        supersedes: old.id,
      }
      return record(
        { ...state, evidence: [...oldUpdated, replacement] },
        'D09',
        `Replaced stale evidence ${old.id} with ${replacement.id}.`,
      )
    }
    case 'set-support-disposition': {
      const supportItems = state.supportItems.map((item) =>
        item.id === action.supportItemId
          ? { ...item, disposition: action.disposition }
          : item,
      )
      if (!supportItems.some((item) => item.id === action.supportItemId))
        throw new Error('Support item not found.')
      return record(
        { ...state, supportItems },
        'D10',
        `${action.supportItemId} marked ${action.disposition}.`,
      )
    }
    case 'seal-h2': {
      if (
        state.supportItems.length === 0 ||
        state.supportItems.some((item) => item.disposition === 'undecided')
      )
        throw new Error('Carry or set aside every support item first.')
      const carriedItems = state.supportItems.filter(
        (item) => item.disposition === 'carried',
      )
      const h2 = {
        digest: fnvDigest(
          stableStringify(
            state.supportItems.map((item) => ({
              id: item.id,
              disposition: item.disposition,
            })),
          ),
        ),
        sealedMinute: state.practiceMinute,
        carried: carriedItems.length,
        setAside: state.supportItems.length - carriedItems.length,
      }
      return record(
        {
          ...state,
          phase: 'after',
          h2,
          recoveryRows: carriedItems.map((item) => ({
            supportItemId: item.id,
            gapId: item.gapId,
            horizon: 'next shift',
            state: 'pending',
          })),
        },
        'D10',
        `Sealed H2 with ${h2.carried} carried and ${h2.setAside} set aside.`,
      )
    }
    case 'configure-recovery-row': {
      const recoveryRows = state.recoveryRows.map((row) =>
        row.supportItemId === action.supportItemId
          ? { ...row, horizon: action.horizon, state: action.state }
          : row,
      )
      if (
        !recoveryRows.some((row) => row.supportItemId === action.supportItemId)
      )
        throw new Error('Recovery row not found.')
      return record(
        { ...state, recoveryRows },
        'A01',
        `${action.supportItemId} set ${action.state} for ${action.horizon}.`,
      )
    }
    case 'set-unmet-need': {
      if (action.band === 'Unknown — not zero' && !action.owner)
        throw new Error(
          'Unknown unmet need requires a practice follow-up owner.',
        )
      const unmetNeeds = [
        ...state.unmetNeeds.filter((item) => item.domain !== action.domain),
        {
          domain: action.domain,
          band: action.band,
          basis: action.basis,
          owner: action.owner,
        },
      ]
      return record(
        { ...state, unmetNeeds },
        'A02',
        `${action.domain} recorded as ${action.band}.`,
      )
    }
    case 'review-holds': {
      const heldIds = state.supportItems
        .filter((item) => item.response === 'hold')
        .map((item) => item.id)
      const refusedItemIds = heldIds.filter((id) => {
        const row = state.recoveryRows.find((item) => item.supportItemId === id)
        return !row || row.state !== 'follow-up-ready'
      })
      return record(
        {
          ...state,
          holdReview: { attempted: true, refusedItemIds },
        },
        'A03',
        refusedItemIds.length
          ? `Hold review refused for ${refusedItemIds.length} linked items.`
          : 'Hold review completed with linked recovery work ready.',
      )
    }
    case 'plan-recheck': {
      const source = state.serviceRecords.find(
        (item) => item.area === action.area,
      )
      if (!source || !['unknown', 'unavailable'].includes(source.state))
        throw new Error('Rechecks apply to unknown or unavailable records.')
      const recheckPlans = [
        ...state.recheckPlans.filter((item) => item.area !== action.area),
        {
          area: action.area,
          owner: action.owner,
          horizon: action.horizon,
        },
      ]
      return record(
        { ...state, recheckPlans },
        'A04',
        `Planned ${action.area} recheck for ${action.horizon}.`,
      )
    }
    case 'classify-guidance': {
      if (state.guidanceVersions.length === 0)
        throw new Error(
          'Create a guidance version during the practice response.',
        )
      const classifications = {
        Situation: 'unknown',
        'Accessible formats': 'unknown',
        'Support options': 'unknown',
        'Next review': 'unknown',
        ...state.recoveryDraft?.classifications,
        [action.block]: action.classification,
      } as NonNullable<LifecycleState['recoveryDraft']>['classifications']
      return record(
        {
          ...state,
          recoveryDraft: { status: practiceStamp, classifications },
        },
        'A05',
        `${action.block} classified ${action.classification}.`,
      )
    }
    case 'review-objective': {
      if (!state.objectives.includes(action.objectiveId))
        throw new Error('Only selected objectives are exercised.')
      const scored = objectiveScore(state, action.objectiveId)
      const objectiveReview = [
        ...state.objectiveReview.filter(
          (item) => item.objectiveId !== action.objectiveId,
        ),
        { ...scored, disposition: action.disposition },
      ]
      return record(
        { ...state, objectiveReview },
        'A06',
        `${action.objectiveId} scored ${scored.score} and marked ${action.disposition}.`,
      )
    }
    case 'decide-gates': {
      if (action.decision === 'gates-met' && !lifecycleGatesMet(state))
        throw new Error('Every end-of-cycle gate must pass first.')
      return record(
        { ...state, gateDecision: action.decision },
        'A07',
        `Cycle gate decision: ${action.decision}.`,
      )
    }
    case 'pin-comparison': {
      const comparison = parseLifecycleComparison(action.text)
      return record(
        { ...state, comparison },
        'A08',
        `Pinned cycle ${comparison.cycle} comparison ${comparison.digest}.`,
      )
    }
    case 'select-packet-sections': {
      if (action.sections.length === 0)
        throw new Error('Choose at least one packet section.')
      return record(
        { ...state, packetSections: [...new Set(action.sections)] },
        'A09',
        `Selected ${action.sections.length} deterministic packet sections.`,
      )
    }
    case 'start-next-cycle': {
      if (!state.gateDecision)
        throw new Error('Record an end-of-cycle gate decision first.')
      const carriedGapIds = state.objectiveReview
        .filter((item) => item.disposition === 'carry-forward')
        .flatMap((item) =>
          item.objectiveId === 'transport'
            ? (['transportation'] as GapId[])
            : item.objectiveId === 'outreach'
              ? (['communication'] as GapId[])
              : [],
        )
      const recoveryGapIds = state.recoveryRows
        .filter((row) => row.state === 'follow-up-ready')
        .map((row) => row.gapId)
      const nextGapIds = [...new Set([...carriedGapIds, ...recoveryGapIds])]
      const carriedObjectiveIds = state.objectiveReview
        .filter((item) => item.disposition === 'carry-forward')
        .map((item) => item.objectiveId)
      const digest = lifecycleDigest(state)
      const next = createInitialLifecycleState()
      next.cycle = state.cycle + 1
      next.previousCycle = {
        cycle: state.cycle,
        digest,
        carriedGapIds: nextGapIds,
        carriedObjectiveIds,
      }
      next.carriedGaps = nextGapIds.map((gapId, index) => ({
        gapId,
        rank: index + 1,
        owner: 'Planning lead',
        dueBand: 'T+60',
      }))
      next.objectives = carriedObjectiveIds
      next.capabilityMarkers = [...state.capabilityMarkers]
      next.ledger = [...state.ledger]
      return record(
        next,
        'A10',
        `Sealed H3 ${digest} and started practice cycle ${next.cycle}.`,
      )
    }
  }
}
