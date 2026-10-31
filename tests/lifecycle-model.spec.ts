import { expect, test } from '@playwright/test'

import {
  applyLifecycleAction,
  capabilityIds,
  cmistDomains,
  createInitialLifecycleState,
  exportLifecycleRecord,
  followThroughArchiveDigest,
  generateCloseoutPacket,
  guidanceBlocks,
  h1Gates,
  lifecycleDigest,
  lifecycleGates,
  lifecycleGatesMet,
  maxLifecycleImportBytes,
  migrateLifecycleV1State,
  migrateLifecycleV2State,
  migrateLifecycleV3State,
  migrateLifecycleV4State,
  parseLifecycleComparison,
  practiceStamp,
  restoreLifecycleState,
  serializeLifecycleState,
  serviceRecordNeedsRecheck,
} from '../src/lib/practice-lifecycle'
import {
  nwsQueryReading,
  parseLifecycleEvidence,
} from '../src/lib/lifecycle-evidence'
import {
  displayedSource,
  sourceClaim,
  sourceTestTime,
} from './fixtures/lifecycle-source'
import {
  contentDigest,
  fnvDigest,
  stableStringify,
} from '../src/lib/record-digest'
import type {
  LifecycleAction,
  LifecycleState,
  PinnedEvidenceReference,
} from '../src/lib/practice-lifecycle'
import {
  nwsProduct,
  weatherSnapshot,
  weatherTime,
} from './fixtures/nws-product'
import type { NWSProduct } from '../src/lib/nws-product'
import type { NWSQueryReading } from '../src/lib/weather-evidence'

function evidenceReference(
  phase: PinnedEvidenceReference['phase'] = 'before',
  snapshotId = 'snapshot-a',
): PinnedEvidenceReference {
  return {
    phase,
    snapshotId,
    generatedAt: '2026-10-29T20:00:00Z',
    validUntil: '2026-10-29T21:00:00Z',
    overallStatus: 'partial',
    triggerCount: 2,
    domainCount: 6,
    unavailableDomainCount: 5,
    eventUnavailableSourceCount: 1,
    eventTriggerState: 'fresh',
    operationalStatusState: 'stale',
    eventTriggerStatus: 'partial',
    operationalStatusStatus: 'partial',
  }
}

function apply(state: LifecycleState, action: LifecycleAction) {
  const next = applyLifecycleAction(state, action)
  assertBoundedRoundTrip(next)
  return next
}

function assertBoundedRoundTrip(state: LifecycleState) {
  const persisted = serializeLifecycleState(state)
  const exported = exportLifecycleRecord(state)
  expect(new TextEncoder().encode(persisted).byteLength).toBeLessThanOrEqual(
    maxLifecycleImportBytes,
  )
  expect(new TextEncoder().encode(exported).byteLength).toBeLessThanOrEqual(
    maxLifecycleImportBytes,
  )
  expect(restoreLifecycleState(persisted)).toEqual(state)
  expect(parseLifecycleComparison(exported).digest).toBe(lifecycleDigest(state))
}

function completeLifecycle(startNextCycle = true) {
  let state = createInitialLifecycleState()
  state = apply(state, {
    type: 'lock-event',
    eventId: 'hurricane-amber',
  })
  state = apply(state, {
    type: 'carry-gap',
    gapId: 'transportation',
    owner: 'Planning lead',
    dueBand: 'T+30',
  })
  state = apply(state, {
    type: 'carry-gap',
    gapId: 'communication',
    owner: 'Outreach partner',
    dueBand: 'T+60',
  })
  state = apply(state, {
    type: 'set-objectives',
    objectiveIds: ['timing', 'outreach', 'shift'],
  })
  state = apply(state, {
    type: 'set-timing',
    warningMinutes: 120,
    preparationMinutes: 60,
  })
  state = apply(state, {
    type: 'choose-assumption',
    choice: 'comparison',
    uptakePercent: 20,
    supportDays: 5,
  })
  state = apply(state, {
    type: 'set-format',
    format: 'Plain language',
    state: 'planned',
    channel: 'trusted voice',
  })
  state = apply(state, {
    type: 'record-evidence',
    gapId: 'transportation',
    state: 'practice-reported criteria present',
    partner: 'Practice Partner A',
  })
  state = apply(state, {
    type: 'set-scope',
    area: 'Transportation support',
    state: 'simulated',
  })
  state = apply(state, {
    type: 'set-scope',
    area: 'Community outreach',
    state: 'simulated',
  })
  state = apply(state, {
    type: 'schedule-inject',
    stage: 'MAP',
    minute: 15,
    area: 'Transportation support',
  })
  state = apply(state, { type: 'seal-h1' })
  state = apply(state, { type: 'start-during' })
  state = apply(state, { type: 'advance-clock', minutes: 60 })
  state = apply(state, {
    type: 'record-service-area',
    area: 'Transportation support',
    state: 'unknown',
    recheckMinutes: 30,
  })
  state = apply(state, {
    type: 'record-service-area',
    area: 'Community outreach',
    state: 'unavailable',
    recheckMinutes: 30,
  })
  state = apply(state, {
    type: 'ask-partner',
    supportItemId: state.supportItems[0].id,
    partner: 'Practice Partner A',
    response: 'hold',
  })
  state = apply(state, {
    type: 'ask-partner',
    supportItemId: state.supportItems[1].id,
    partner: 'Practice Partner B',
    response: 'decline',
  })
  state = apply(state, {
    type: 'escalate-item',
    supportItemId: state.supportItems[1].id,
    reason: 'all responses declined',
    owner: 'Mass-care lead',
    deadlineMinutes: 30,
  })
  state = apply(state, {
    type: 'add-r2',
    uptakePercent: 25,
    supportDays: 5,
  })
  state = apply(state, { type: 'create-guidance' })
  state = apply(state, {
    type: 'freeze-shift',
    outgoing: 'Facilitator',
    incoming: 'Recovery lead',
  })
  const stale = state.evidence.find((item) => item.state === 'stale')
  expect(stale).toBeTruthy()
  state = apply(state, {
    type: 'replace-evidence',
    evidenceId: stale!.id,
    state: 'practice-reported criteria present',
  })
  state = apply(state, {
    type: 'set-support-disposition',
    supportItemId: state.supportItems[0].id,
    disposition: 'carried',
  })
  state = apply(state, {
    type: 'set-support-disposition',
    supportItemId: state.supportItems[1].id,
    disposition: 'set aside',
  })
  state = apply(state, { type: 'seal-h2' })
  state = apply(state, {
    type: 'configure-recovery-row',
    supportItemId: state.recoveryRows[0].supportItemId,
    horizon: 'next day',
    state: 'follow-up-ready',
  })
  state = apply(state, {
    type: 'create-follow-through',
    supportItemId: state.recoveryRows[0].supportItemId,
    owner: 'Recovery lead',
    dueHorizon: 'next day',
    doneCheck: 'practice-review-recorded',
  })
  for (const [index, domain] of cmistDomains.entries()) {
    state = apply(state, {
      type: 'set-unmet-need',
      domain,
      band: index === 0 ? 'Unknown — not zero' : '1–9 aggregate',
      basis: index === 0 ? 'unknown basis' : 'practice observation',
      owner: index === 0 ? 'Recovery lead' : null,
    })
  }
  state = apply(state, { type: 'review-holds' })
  for (const area of state.serviceRecords.map((record) => record.area)) {
    state = apply(state, {
      type: 'plan-recheck',
      area,
      owner: 'Recovery lead',
      horizon: 'next shift',
    })
  }
  for (const [index, block] of guidanceBlocks.entries()) {
    state = apply(state, {
      type: 'classify-guidance',
      block,
      classification: index % 2 ? 'unknown' : 'carried into recovery draft r1',
    })
  }
  for (const [index, objectiveId] of state.objectives.entries()) {
    state = apply(state, {
      type: 'review-objective',
      objectiveId,
      disposition: index === 0 ? 'carry-forward' : 'note-only',
    })
  }
  expect(lifecycleGatesMet(state)).toBe(true)
  state = apply(state, { type: 'decide-gates', decision: 'gates-met' })
  const beforePin = exportLifecycleRecord(state)
  state = apply(state, { type: 'pin-comparison', text: beforePin })
  expect(exportLifecycleRecord(state)).toBe(beforePin)
  state = apply(state, {
    type: 'select-packet-sections',
    sections: [
      'cycle summary',
      'handoffs',
      'recovery register',
      'objective review',
    ],
  })
  const packet = generateCloseoutPacket(state)
  expect(packet.text).toContain(practiceStamp)
  expect(packet.filename).toContain(lifecycleDigest(state))
  if (startNextCycle) state = apply(state, { type: 'start-next-cycle' })
  return state
}

function readyBefore(
  choice: 'r1' | 'comparison' = 'comparison',
  initial = createInitialLifecycleState(),
) {
  let state = initial
  state = apply(state, { type: 'lock-event', eventId: 'hurricane-amber' })
  state = apply(state, {
    type: 'carry-gap',
    gapId: 'transportation',
    owner: 'Planning lead',
    dueBand: 'T+30',
  })
  state = apply(state, {
    type: 'carry-gap',
    gapId: 'communication',
    owner: 'Outreach partner',
    dueBand: 'T+60',
  })
  state = apply(state, { type: 'set-objectives', objectiveIds: ['timing'] })
  state = apply(state, {
    type: 'set-timing',
    warningMinutes: 120,
    preparationMinutes: 60,
  })
  state = apply(state, {
    type: 'choose-assumption',
    choice,
    uptakePercent: 20,
    supportDays: 5,
  })
  state = apply(state, {
    type: 'record-evidence',
    gapId: 'transportation',
    state: 'practice-reported criteria present',
    partner: 'Practice Partner A',
  })
  state = apply(state, {
    type: 'set-scope',
    area: 'Transportation support',
    state: 'simulated',
  })
  state = apply(state, {
    type: 'set-scope',
    area: 'Community outreach',
    state: 'simulated',
  })
  return apply(state, {
    type: 'schedule-inject',
    stage: 'MAP',
    minute: 15,
    area: 'Transportation support',
  })
}

function startDuring(choice: 'r1' | 'comparison' = 'comparison') {
  return apply(apply(readyBefore(choice), { type: 'seal-h1' }), {
    type: 'start-during',
  })
}

function sealH2(state: LifecycleState) {
  let next = state
  for (const [index, item] of state.supportItems.entries())
    next = apply(next, {
      type: 'set-support-disposition',
      supportItemId: item.id,
      disposition: index === 0 ? 'carried' : 'set aside',
    })
  return apply(next, { type: 'seal-h2' })
}

test('all 30 capabilities form one deterministic immutable practice chain', () => {
  const state = completeLifecycle()
  expect(state.cycle).toBe(2)
  expect(state.phase).toBe('before')
  expect(state.previousCycle?.cycle).toBe(1)
  expect(state.capabilityMarkers).toEqual(
    expect.arrayContaining([...capabilityIds]),
  )
  expect(new Set(state.capabilityMarkers).size).toBe(30)
  for (const id of capabilityIds) {
    expect(state.ledger.some((event) => event.capability === id)).toBe(true)
  }
  expect(state.carriedGaps.map((gap) => gap.gapId)).toContain('transportation')
  expect(state.objectives).toEqual(['timing'])
})

test('phase actions cannot bypass or mutate sealed handoffs', () => {
  let state = createInitialLifecycleState()
  expect(() =>
    apply(state, {
      type: 'set-unmet-need',
      domain: 'Communication',
      band: 'Unknown — not zero',
      basis: 'unknown basis',
      owner: 'Recovery lead',
    }),
  ).toThrow(/belongs to the after phase/)

  state = apply(state, {
    type: 'lock-event',
    eventId: 'hurricane-amber',
  })
  state = apply(state, {
    type: 'carry-gap',
    gapId: 'transportation',
    owner: 'Planning lead',
    dueBand: 'T+30',
  })
  state = apply(state, {
    type: 'set-objectives',
    objectiveIds: ['timing'],
  })
  state = apply(state, {
    type: 'set-timing',
    warningMinutes: 120,
    preparationMinutes: 60,
  })
  state = apply(state, {
    type: 'choose-assumption',
    choice: 'r1',
    uptakePercent: 10,
    supportDays: 3,
  })
  state = apply(state, {
    type: 'set-format',
    format: 'Plain language',
    state: 'planned',
    channel: 'trusted voice',
  })
  state = apply(state, {
    type: 'record-evidence',
    gapId: 'transportation',
    state: 'practice-reported criteria present',
    partner: 'Practice Partner A',
  })
  state = apply(state, {
    type: 'set-scope',
    area: 'Transportation support',
    state: 'simulated',
  })
  state = apply(state, {
    type: 'schedule-inject',
    stage: 'MAP',
    minute: 15,
    area: 'Transportation support',
  })
  state = apply(state, { type: 'seal-h1' })
  const sealedDigest = state.h1?.digest
  expect(() =>
    apply(state, {
      type: 'set-objectives',
      objectiveIds: ['outreach'],
    }),
  ).toThrow(/H1 is immutable/)
  expect(state.h1?.digest).toBe(sealedDigest)

  state = apply(state, { type: 'start-during' })
  expect(() =>
    apply(state, {
      type: 'set-timing',
      warningMinutes: 30,
      preparationMinutes: 30,
    }),
  ).toThrow(/belongs to the before phase/)
})

test('strict persistence and comparison reject extra and duplicate fields', () => {
  const state = completeLifecycle()
  const restored = restoreLifecycleState(JSON.stringify(state))
  expect(restored).toEqual(state)

  const exported = exportLifecycleRecord(state)
  expect(parseLifecycleComparison(exported).digest).toBe(lifecycleDigest(state))
  expect(() =>
    parseLifecycleComparison(
      exported.replace('"schema"', '"schema":"bad","schema"'),
    ),
  ).toThrow(/Duplicate JSON fields/)
  expect(() =>
    parseLifecycleComparison(
      JSON.stringify({
        ...JSON.parse(exported),
        extra: 'not allowed',
      }),
    ),
  ).toThrow(/exact schema/)
  const nestedExtra = JSON.parse(exported)
  nestedExtra.carriedGaps[0].extra = 'not allowed'
  expect(() => parseLifecycleComparison(JSON.stringify(nestedExtra))).toThrow(
    /exact schema/,
  )
})

test('exports and packets preserve practice boundaries', () => {
  const state = completeLifecycle(false)
  const output = `${exportLifecycleRecord(state)}\n${generateCloseoutPacket(state).text}`
  expect(output).toContain(practiceStamp)
  expect(output).toContain('Unknown — not zero')
  expect(output).not.toMatch(
    /\b(open|passable|restored|normal|contained|resumed|approved|verified|confirmed|activated|dispatched|acknowledged|released|closed|cleared|all-clear)\b/i,
  )
  expect(output).toContain('Facilitator-selected planning context only')
  expect(output).not.toMatch(
    /(Hawaiʻi County|Maui County|Honolulu|HI-EMA|DHS|Red Cross)/,
  )
  expect(output).not.toMatch(/(name|address|phone|email|latitude|longitude)/i)
})

test('superseded evidence stays traceable as the practice clock advances', () => {
  let state = apply(startDuring(), { type: 'advance-clock', minutes: 60 })
  const original = state.evidence[0]
  expect(original.state).toBe('stale')
  state = apply(state, {
    type: 'replace-evidence',
    evidenceId: original.id,
    state: 'unknown',
  })
  state = apply(state, { type: 'advance-clock', minutes: 60 })
  const [superseded, replacement] = state.evidence
  expect(superseded).toMatchObject({ id: original.id, state: 'superseded' })
  expect(replacement).toMatchObject({ supersedes: original.id, state: 'stale' })
  expect(() =>
    apply(state, {
      type: 'replace-evidence',
      evidenceId: original.id,
      state: 'unknown',
    }),
  ).toThrow(/stale current evidence/)
  state = apply(state, {
    type: 'replace-evidence',
    evidenceId: replacement.id,
    state: 'practice-reported criteria present',
  })
  expect(state.evidence.map((item) => item.state)).toEqual([
    'superseded',
    'superseded',
    'practice-reported criteria present',
  ])
})

test('held items that were set aside do not block hold review', () => {
  let state = startDuring()
  for (const item of state.supportItems)
    state = apply(state, {
      type: 'ask-partner',
      supportItemId: item.id,
      partner: 'Practice Partner A',
      response: 'hold',
    })
  state = apply(sealH2(state), { type: 'review-holds' })
  const carriedId = state.recoveryRows[0].supportItemId
  expect(state.holdReview.refusedItemIds).toEqual([carriedId])
  state = apply(state, {
    type: 'configure-recovery-row',
    supportItemId: carriedId,
    horizon: 'next day',
    state: 'follow-up-ready',
  })
  state = apply(state, { type: 'review-holds' })
  expect(state.holdReview.refusedItemIds).toEqual([])
  expect(lifecycleGates(state).holds).toBe(true)
})

test('the recovery draft gate needs every guidance block classified', () => {
  let state = sealH2(apply(startDuring(), { type: 'create-guidance' }))
  const reversed = [...guidanceBlocks].reverse()
  state = apply(state, {
    type: 'classify-guidance',
    block: reversed[0],
    classification: 'withdrawn',
  })
  expect(state.recoveryDraft?.classifications).toEqual({
    [reversed[0]]: 'withdrawn',
  })
  expect(lifecycleGates(state).recoveryDraft).toBe(false)
  expect(restoreLifecycleState(JSON.stringify(state))).toEqual(state)
  for (const block of reversed.slice(1))
    state = apply(state, {
      type: 'classify-guidance',
      block,
      classification: 'unknown',
    })
  expect(Object.keys(state.recoveryDraft?.classifications ?? {})).toEqual([
    ...guidanceBlocks,
  ])
  expect(lifecycleGates(state).recoveryDraft).toBe(true)
})

test('escalation needs a blocked or overdue item with a matching reason', () => {
  let state = startDuring()
  const [first, second] = state.supportItems
  const escalate = (
    current: LifecycleState,
    supportItemId: string,
    reason: Extract<LifecycleAction, { type: 'escalate-item' }>['reason'],
  ) =>
    apply(current, {
      type: 'escalate-item',
      supportItemId,
      reason,
      owner: 'Mass-care lead',
      deadlineMinutes: 30,
    })
  expect(() => escalate(state, first.id, 'evidence needs review')).toThrow(
    /blocked or overdue/,
  )
  expect(() => escalate(state, first.id, 'overdue')).toThrow(
    /blocked or overdue/,
  )
  state = apply(state, {
    type: 'ask-partner',
    supportItemId: second.id,
    partner: 'Practice Partner B',
    response: 'decline',
  })
  expect(() => escalate(state, second.id, 'overdue')).toThrow(
    /blocked or overdue/,
  )
  expect(
    escalate(state, second.id, 'all responses declined').supportItems[1]
      .escalation?.reason,
  ).toBe('all responses declined')
  state = apply(state, { type: 'advance-clock', minutes: 60 })
  state = apply(state, { type: 'advance-clock', minutes: 60 })
  expect(first.dueMinute).toBeLessThan(state.practiceMinute)
  expect(
    escalate(state, first.id, 'overdue').supportItems[0].escalation
      ?.deadlineMinute,
  ).toBe(state.practiceMinute + 30)
  expect(
    escalate(state, first.id, 'evidence needs review').supportItems[0]
      .escalation?.reason,
  ).toBe('evidence needs review')
})

test('condition reports become stale and then need a recheck', () => {
  let state = startDuring()
  state = apply(state, {
    type: 'record-service-area',
    area: 'Transportation support',
    state: 'condition reported',
    recheckMinutes: 30,
  })
  expect(
    serviceRecordNeedsRecheck(state.serviceRecords[0], state.practiceMinute),
  ).toBe(false)
  state = apply(state, { type: 'advance-clock', minutes: 30 })
  expect(
    serviceRecordNeedsRecheck(state.serviceRecords[0], state.practiceMinute),
  ).toBe(true)
  state = apply(state, {
    type: 'record-service-area',
    area: 'Community outreach',
    state: 'condition reported',
    recheckMinutes: 60,
  })
  state = sealH2(state)
  expect(lifecycleGates(state).rechecks).toBe(false)
  expect(() =>
    apply(state, {
      type: 'plan-recheck',
      area: 'Community outreach',
      owner: 'Recovery lead',
      horizon: 'next shift',
    }),
  ).toThrow(/stale, unknown, or unavailable/)
  state = apply(state, {
    type: 'plan-recheck',
    area: 'Transportation support',
    owner: 'Recovery lead',
    horizon: 'next shift',
  })
  expect(lifecycleGates(state).rechecks).toBe(true)
  expect(state.serviceRecords.map((record) => record.state)).toEqual([
    'condition reported',
    'condition reported',
  ])
})

test('injects in unavailable areas block the Before handoff', () => {
  let state = apply(readyBefore(), {
    type: 'schedule-inject',
    stage: 'MODEL',
    minute: 30,
    area: 'Community outreach',
  })
  state = apply(state, {
    type: 'set-scope',
    area: 'Community outreach',
    state: 'unavailable',
  })
  expect(h1Gates(state).inject).toBe(false)
  expect(() => apply(state, { type: 'seal-h1' })).toThrow(/Before handoff gate/)
  state = apply(state, {
    type: 'set-scope',
    area: 'Community outreach',
    state: 'simulated',
  })
  expect(h1Gates(state).inject).toBe(true)
  expect(apply(state, { type: 'seal-h1' }).h1).not.toBeNull()
})

test('r2 is compared with the sealed assumption revision', () => {
  for (const [choice, delta] of [
    ['comparison', 375],
    ['r1', 1425],
  ] as const) {
    let state = apply(startDuring(choice), {
      type: 'advance-clock',
      minutes: 15,
    })
    state = apply(state, { type: 'add-r2', uptakePercent: 25, supportDays: 5 })
    expect(state.assumptions.r2?.demandDeltaFromSealed).toBe(delta)
    expect(state.ledger.at(-1)?.summary).toContain(`sealed ${choice}`)
  }
})

test('packet sections are canonical regardless of selection order', () => {
  const state = completeLifecycle(false)
  const forward = apply(state, {
    type: 'select-packet-sections',
    sections: ['handoffs', 'objective review'],
  })
  const reverse = apply(state, {
    type: 'select-packet-sections',
    sections: ['objective review', 'handoffs', 'handoffs'],
  })
  expect(reverse.packetSections).toEqual(['handoffs', 'objective review'])
  expect(lifecycleDigest(reverse)).toBe(lifecycleDigest(forward))
  expect(generateCloseoutPacket(reverse).filename).toBe(
    `practice-closeout-${lifecycleDigest(forward)}-PRACTICE-UNSENT.txt`,
  )
  expect(() =>
    apply(state, { type: 'select-packet-sections', sections: [] }),
  ).toThrow(/at least one/)
})

test('H3 refuses a gates-met decision after gate inputs regress', () => {
  let state = completeLifecycle(false)
  state = apply(state, {
    type: 'configure-recovery-row',
    supportItemId: state.recoveryRows[0].supportItemId,
    horizon: 'next day',
    state: 'pending',
  })
  expect(lifecycleGatesMet(state)).toBe(false)
  expect(() => apply(state, { type: 'start-next-cycle' })).toThrow(
    /record the gate decision again/,
  )
  state = apply(state, {
    type: 'decide-gates',
    decision: 'gates-unmet-carry-forward',
  })
  expect(apply(state, { type: 'start-next-cycle' }).cycle).toBe(2)
})

test('restore rejects malformed ledger and comparison metadata', () => {
  const saved = JSON.parse(JSON.stringify(completeLifecycle(false)))
  expect(saved.comparison).not.toBeNull()
  const reject = (patch: Record<string, unknown>) =>
    expect(() =>
      restoreLifecycleState(JSON.stringify({ ...saved, ...patch })),
    ).toThrow(/failed validation/)
  reject({ ledger: 'not a ledger' })
  reject({ ledger: [{ ...saved.ledger[0], extra: true }] })
  reject({ ledger: [{ ...saved.ledger[0], capability: 'Z99' }] })
  reject({ comparison: { ...saved.comparison, digest: 1 } })
  reject({ comparison: { ...saved.comparison, extra: true } })
  expect(restoreLifecycleState(JSON.stringify(saved))).toEqual(saved)
})

test('migrates saved v1 state to strict v5 preserving original seals', () => {
  const before = readyBefore()
  const originalDigest = fnvDigest(
    stableStringify({
      event: before.event,
      gaps: before.carriedGaps,
      objectives: before.objectives,
      timing: before.timing,
      assumptions: before.assumptions,
      scope: before.simulationScope,
      injects: before.injects,
      evidence: before.evidence,
    }),
  )
  let state = apply(before, { type: 'seal-h1' })
  state = apply(state, { type: 'start-during' })
  state = apply(state, { type: 'advance-clock', minutes: 60 })
  state = apply(state, { type: 'add-r2', uptakePercent: 30, supportDays: 6 })
  const legacy = JSON.parse(JSON.stringify(state)) as Record<string, any>
  legacy.h1.digest = originalDigest
  legacy.schema = 'practice-lifecycle.v1'
  delete legacy.pinnedEvidence
  delete legacy.sourceEvidence
  delete legacy.sourceRechecks
  delete legacy.sourceHistory
  delete legacy.weatherEvidence
  delete legacy.weatherRechecks
  delete legacy.weatherHistory
  delete legacy.previousWeatherCycle
  delete legacy.followThroughItems
  delete legacy.followThroughHistory
  delete legacy.legacySeals
  delete legacy.h1.evidenceReferences

  const migrated = migrateLifecycleV1State(JSON.stringify(legacy))
  expect(migrated.schema).toBe('practice-lifecycle.v5')
  expect(migrated.pinnedEvidence).toEqual([])
  expect(migrated.h1?.evidenceReferences).toEqual([])
  expect(migrated.h1?.digest).toBe(originalDigest)
  expect(restoreLifecycleState(JSON.stringify(migrated))).toEqual(migrated)
  expect(() =>
    migrateLifecycleV1State(
      JSON.stringify({
        ...legacy,
        h1: { ...legacy.h1, digest: '0000000000000000' },
      }),
    ),
  ).toThrow(/H1 integrity|legacy seal integrity/)
})

test('explicit v2 migration preserves PR3 handoffs and rejects extra fields and tampered seals', () => {
  const state = completeLifecycle(false)
  const legacy = JSON.parse(JSON.stringify(state)) as Record<string, unknown>
  legacy.schema = 'practice-lifecycle.v2'
  delete legacy.sourceEvidence
  delete legacy.sourceRechecks
  delete legacy.sourceHistory
  delete legacy.weatherEvidence
  delete legacy.weatherRechecks
  delete legacy.weatherHistory
  delete legacy.previousWeatherCycle
  delete legacy.followThroughItems
  delete legacy.followThroughHistory
  delete legacy.legacySeals
  const text = JSON.stringify(legacy)
  const migrated = migrateLifecycleV2State(text)
  expect(migrated.sourceEvidence).toEqual([])
  expect(migrated.sourceRechecks).toEqual([])
  expect(migrated.h1).toEqual(state.h1)
  expect(migrated.h2).toEqual(state.h2)
  const injectedWeather = structuredClone(migrated)
  injectedWeather.weatherEvidence = acceptWeather().weatherEvidence
  expect(() => restoreLifecycleState(JSON.stringify(injectedWeather))).toThrow(
    /H1 integrity|legacy seal integrity/,
  )
  expect(() => restoreLifecycleState(text)).toThrow()
  expect(() => parseLifecycleComparison(text)).toThrow()
  expect(() =>
    migrateLifecycleV2State(JSON.stringify({ ...legacy, sourceEvidence: [] })),
  ).toThrow()
  expect(() =>
    migrateLifecycleV2State(
      JSON.stringify({
        ...legacy,
        h1: { ...state.h1, digest: 'tampered' },
      }),
    ),
  ).toThrow(/H1 integrity|legacy seal integrity/)
  expect(() =>
    migrateLifecycleV2State(text.replace('"cycle":1', '"cycle":1,"cycle":1')),
  ).toThrow(/Duplicate/)
})

test('original v1 After restores both original handoffs and rejects changed H2 inputs', () => {
  const state = completeLifecycle(false)
  const legacy = JSON.parse(JSON.stringify(state)) as Record<string, any>
  legacy.schema = 'practice-lifecycle.v1'
  for (const key of [
    'pinnedEvidence',
    'sourceEvidence',
    'sourceRechecks',
    'sourceHistory',
    'weatherEvidence',
    'weatherRechecks',
    'weatherHistory',
    'previousWeatherCycle',
    'followThroughItems',
    'followThroughHistory',
    'legacySeals',
  ])
    delete legacy[key]
  delete legacy.h1.evidenceReferences
  delete legacy.h2.evidenceReferences
  legacy.h1.digest = fnvDigest(
    stableStringify({
      event: state.event,
      gaps: state.carriedGaps,
      objectives: state.objectives,
      timing: state.timing,
      assumptions: { ...state.assumptions, r2: null },
      scope: state.simulationScope,
      injects: state.injects,
      evidence: state.evidence
        .filter((item) => item.supersedes === null)
        .map((item) => ({
          ...item,
          state: 'practice-reported criteria present',
        })),
    }),
  )
  legacy.h2.digest = fnvDigest(
    stableStringify(
      state.supportItems.map(({ id, disposition }) => ({ id, disposition })),
    ),
  )
  const migrated = migrateLifecycleV1State(JSON.stringify(legacy))
  expect(migrated.h1?.digest).toBe(legacy.h1.digest)
  expect(migrated.h2?.digest).toBe(legacy.h2.digest)
  expect(migrated.sourceEvidence).toEqual([])
  expect(restoreLifecycleState(JSON.stringify(migrated))).toEqual(migrated)
  legacy.supportItems[0].disposition = 'set aside'
  expect(() => migrateLifecycleV1State(JSON.stringify(legacy))).toThrow(
    /H2 integrity|legacy seal integrity/,
  )
})

function acceptSource(state = readyBefore(), displayed = displayedSource()) {
  return apply(state, {
    type: 'accept-source',
    gapId: 'transportation',
    displayed,
    acceptedAt: sourceTestTime,
  })
}

test('post-action size guard includes the appended source ledger row and preserves valid input', () => {
  const state = readyBefore()
  const action: LifecycleAction = {
    type: 'accept-source',
    gapId: 'transportation',
    displayed: displayedSource(),
    acceptedAt: sourceTestTime,
  }
  const next = apply(state, action)
  const delta =
    new TextEncoder().encode(serializeLifecycleState(next)).byteLength -
    new TextEncoder().encode(serializeLifecycleState(state)).byteLength
  const padded = structuredClone(state)
  const size = new TextEncoder().encode(
    serializeLifecycleState(padded),
  ).byteLength
  padded.ledger[0].summary += 'x'.repeat(
    maxLifecycleImportBytes - delta + 1 - size,
  )
  assertBoundedRoundTrip(padded)
  const previous = JSON.stringify(padded)
  expect(() => applyLifecycleAction(padded, action)).toThrow(/128 KiB/)
  expect(JSON.stringify(padded)).toBe(previous)
  assertBoundedRoundTrip(padded)
})

for (const withHistory of [false, true]) {
  test(`post-action size guard bounds repeated pins${withHistory ? ' with multi-cycle source history' : ''}`, () => {
    let state = createInitialLifecycleState()
    if (withHistory) {
      for (let cycle = 0; cycle < 3; cycle++) {
        state = readyBefore('comparison', state)
        for (let revision = 0; revision < 8; revision++)
          state = acceptSource(
            state,
            displayedSource(sourceClaim(`REVISION-${revision}`)),
          )
        state = sealH2(
          apply(apply(state, { type: 'seal-h1' }), { type: 'start-during' }),
        )
        state = apply(state, {
          type: 'decide-gates',
          decision: 'gates-unmet-carry-forward',
        })
        state = apply(state, { type: 'start-next-cycle' })
      }
      expect(state.sourceHistory).toHaveLength(2)
    }
    const history = structuredClone(state.sourceHistory)
    for (let index = 0; index < 1000; index++) {
      const previous = JSON.stringify(state)
      let next: LifecycleState
      try {
        next = applyLifecycleAction(state, {
          type: 'pin-evidence',
          reference: evidenceReference('before', `size-pin-${index}`),
        })
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toContain('128 KiB')
        expect(JSON.stringify(state)).toBe(previous)
        expect(state.sourceHistory).toEqual(history)
        assertBoundedRoundTrip(state)
        return
      }
      assertBoundedRoundTrip(next)
      state = next
    }
    throw new Error(
      'Expected the common byte limit to refuse a pin before 1000 actions.',
    )
  })
}

function authorityState(state: LifecycleState) {
  return {
    event: state.event,
    timing: state.timing,
    evidence: state.evidence,
    support: state.supportItems,
    service: state.serviceRecords,
    review: state.objectiveReview,
    gateDecision: state.gateDecision,
    markers: state.capabilityMarkers,
    beforeGates: h1Gates(state),
    afterGates: lifecycleGates(state),
  }
}

function weatherReading(
  product: NWSProduct | null = nwsProduct(),
  checkedAt = weatherTime,
): NWSQueryReading {
  const raw = weatherSnapshot(product ?? nwsProduct())
  if (product === null) raw.event_triggers.data!.triggers = []
  return nwsQueryReading({
    snapshot: parseLifecycleEvidence(raw),
    error: null,
    checkedAt,
    lastShelterSnapshot: null,
  })
}

function reviewedWeather(product = nwsProduct(), checkedAt = weatherTime) {
  const reading = weatherReading(product, checkedAt)
  return {
    reviewedAt: checkedAt,
    reading,
    product: reading.products[0],
  }
}

function acceptWeather(
  state = readyBefore(),
  product = nwsProduct(),
  acceptedAt = weatherTime,
) {
  return apply(state, {
    type: 'accept-weather',
    reviewed: reviewedWeather(product, acceptedAt),
    acceptedAt,
  })
}

test('weather acceptance freezes the exact reviewed revision without authority effects', () => {
  const before = readyBefore()
  before.evidence = []
  before.capabilityMarkers = before.capabilityMarkers.filter(
    (id) => id !== 'B07',
  )
  const reviewed = reviewedWeather()
  const newer = structuredClone(reviewed)
  newer.product.headline = 'Newer source revision'
  newer.reading.products[0] = newer.product
  const accepted = apply(before, {
    type: 'accept-weather',
    reviewed,
    acceptedAt: weatherTime,
  })
  expect(authorityState(accepted)).toEqual(authorityState(before))
  expect(accepted.capabilityMarkers).not.toContain('B07')
  expect(accepted.weatherEvidence[0]).toMatchObject({
    acceptedBy: 'Facilitator',
    phase: 'before',
    authorityEffect: 'none',
    product: {
      id: reviewed.product.id,
      headline: reviewed.product.headline,
      relationship: 'initial',
    },
    observation: {
      retrievalState: 'fresh',
      coverage: 'complete',
      validity: 'current',
    },
  })
  expect(accepted.weatherEvidence[0].product.headline).not.toBe(
    newer.product.headline,
  )
  const raced = structuredClone(reviewed)
  raced.product = structuredClone(raced.product)
  raced.reading.products[0].headline = 'Same identity, newer query semantics'
  expect(() =>
    apply(before, {
      type: 'accept-weather',
      reviewed: raced,
      acceptedAt: weatherTime,
    }),
  ).toThrow(/no longer matches the exact query revision/)
  const futureSnapshot = reviewedWeather()
  futureSnapshot.reading.generatedAt = '2026-10-30T18:01:00Z'
  expect(() =>
    apply(before, {
      type: 'accept-weather',
      reviewed: futureSnapshot,
      acceptedAt: weatherTime,
    }),
  ).toThrow(/fresh complete source check/)
  const reviewedBeforeCheck = reviewedWeather()
  reviewedBeforeCheck.reviewedAt = '2026-10-30T17:59:59Z'
  expect(() =>
    apply(before, {
      type: 'accept-weather',
      reviewed: reviewedBeforeCheck,
      acceptedAt: weatherTime,
    }),
  ).toThrow(/fresh complete source check/)
  const legacyInline = nwsProduct()
  legacyInline.geometry = {
    status: 'valid',
    type: 'Polygon',
    shape: {
      type: 'Polygon',
      coordinates: [
        [
          [-159, 21],
          [-157, 21],
          [-157, 22],
          [-159, 22],
          [-159, 21],
        ],
      ],
    },
  }
  legacyInline.applicability = 'inside'
  legacyInline.applicability_reason = 'strict_interior'
  delete legacyInline.applicability_basis
  const legacyAccepted = acceptWeather(before, legacyInline)
  expect(
    restoreLifecycleState(JSON.stringify(legacyAccepted)).weatherEvidence[0]
      .evaluation.basis,
  ).toBe('inline_geometry')
  const falseInlineApplicability = structuredClone(legacyAccepted)
  falseInlineApplicability.weatherEvidence[0].evaluation.applicability =
    'outside'
  falseInlineApplicability.weatherEvidence[0].evaluation.reason =
    'strict_exterior'
  falseInlineApplicability.weatherEvidence[0].evaluationDigest = contentDigest({
    version: 'nws-planning-evaluation.v1',
    point: falseInlineApplicability.weatherEvidence[0].evaluation.point,
    algorithmVersion:
      falseInlineApplicability.weatherEvidence[0].evaluation.algorithmVersion,
    applicability:
      falseInlineApplicability.weatherEvidence[0].evaluation.applicability,
    reason: falseInlineApplicability.weatherEvidence[0].evaluation.reason,
    basis: falseInlineApplicability.weatherEvidence[0].evaluation.basis,
    coverage: falseInlineApplicability.weatherEvidence[0].evaluation.coverage,
    zones: [],
  })
  const { recordDigest: _inlineDigest, ...inlineContents } =
    falseInlineApplicability.weatherEvidence[0]
  falseInlineApplicability.weatherEvidence[0].recordDigest =
    contentDigest(inlineContents)
  expect(() =>
    restoreLifecycleState(JSON.stringify(falseInlineApplicability)),
  ).toThrow(/failed validation/)
  const futureAcceptedSnapshot = structuredClone(legacyAccepted)
  futureAcceptedSnapshot.weatherEvidence[0].observation.generatedAt =
    '2026-10-30T18:01:00Z'
  const { recordDigest: _futureDigest, ...futureContents } =
    futureAcceptedSnapshot.weatherEvidence[0]
  futureAcceptedSnapshot.weatherEvidence[0].recordDigest =
    contentDigest(futureContents)
  expect(() =>
    restoreLifecycleState(JSON.stringify(futureAcceptedSnapshot)),
  ).toThrow(/failed validation/)
  const boundaryProduct = structuredClone(legacyInline)
  boundaryProduct.geometry.shape = {
    type: 'Polygon',
    coordinates: [
      [
        [-158.193548, 21.450404],
        [-158.193543, 21.450499],
        [-158.3, 21.6],
        [-158.193548, 21.450404],
      ],
    ],
  }
  boundaryProduct.applicability = 'unknown'
  boundaryProduct.applicability_reason = 'boundary'
  const boundaryAccepted = acceptWeather(before, boundaryProduct)
  expect(
    restoreLifecycleState(JSON.stringify(boundaryAccepted)).weatherEvidence[0]
      .evaluation.reason,
  ).toBe('boundary')
  for (const [firstLongitude, secondLongitude] of [
    [-158, -157],
    [-160, -159],
  ]) {
    const extensionProduct = structuredClone(legacyInline)
    extensionProduct.geometry.shape = {
      type: 'Polygon',
      coordinates: [
        [
          [firstLongitude, 21.450442],
          [secondLongitude, 21.450442],
          [(firstLongitude + secondLongitude) / 2, 22],
          [firstLongitude, 21.450442],
        ],
      ],
    }
    extensionProduct.applicability = 'outside'
    extensionProduct.applicability_reason = 'strict_exterior'
    const extensionAccepted = acceptWeather(before, extensionProduct)
    expect(
      restoreLifecycleState(JSON.stringify(extensionAccepted))
        .weatherEvidence[0].evaluation.reason,
    ).toBe('strict_exterior')
  }
  const badPoint = reviewedWeather(legacyInline)
  badPoint.reading.point = ['NaN', 'NaN']
  expect(() =>
    apply(before, {
      type: 'accept-weather',
      reviewed: badPoint,
      acceptedAt: weatherTime,
    }),
  ).toThrow(/exact reviewed revision/)
  expect(Object.isFrozen(accepted.weatherEvidence[0].product)).toBe(true)
  expect(() =>
    apply(accepted, {
      type: 'accept-weather',
      reviewed,
      acceptedAt: weatherTime,
    }),
  ).toThrow(/already accepted/)
})

test('weather rechecks distinguish source lineage without mutating accepted or manual state', () => {
  let state = acceptWeather()
  state = apply(state, { type: 'seal-h1' })
  const h1 = structuredClone(state.h1)
  state = apply(state, { type: 'start-during' })
  state = sealH2(state)
  const h2 = structuredClone(state.h2)
  const accepted = structuredClone(state.weatherEvidence)
  const authority = authorityState(state)
  const same = weatherReading()
  const changedProduct = nwsProduct()
  changedProduct.headline = 'Same identity changed source content'
  const cancelledProduct = nwsProduct()
  cancelledProduct.message_type = 'Cancel'
  cancelledProduct.relationship = 'cancel'
  cancelledProduct.eligibility = 'cancellation'
  const updateProduct = nwsProduct()
  updateProduct.id = 'urn:oid:replacement-update'
  updateProduct.url =
    'https://api.weather.gov/alerts/urn:oid:replacement-update'
  updateProduct.message_type = 'Update'
  updateProduct.relationship = 'update'
  updateProduct.references = [
    {
      identifier: accepted[0].product.id,
      url: accepted[0].product.url,
      sender: accepted[0].product.sender,
      sent: accepted[0].product.sent,
    },
  ]
  const unavailable = weatherReading()
  unavailable.transport = 'unavailable'
  unavailable.retrievalState = 'unavailable'
  unavailable.coverage = 'unavailable'
  const staleZoneProduct = nwsProduct()
  staleZoneProduct.geometry = { status: 'absent', type: null, shape: null }
  staleZoneProduct.applicability_basis = 'affected_zones'
  staleZoneProduct.applicability = 'inside'
  staleZoneProduct.applicability_reason = 'strict_interior'
  staleZoneProduct.zone_evidence = {
    result: 'inside',
    reason: 'strict_interior',
    coverage: 'complete',
    zones: [
      {
        url: 'https://api.weather.gov/zones/forecast/HIZ001',
        id: 'HIZ001',
        type: 'forecast',
        source_revision: 'a'.repeat(64),
        effective: '2026-10-30T17:00:00Z',
        expires: '2026-10-30T19:00:00Z',
        retrieved_at: '2026-10-30T17:50:00Z',
        fresh_until: '2026-10-30T17:59:00Z',
        state: 'fresh',
        result: 'inside',
        reason: 'strict_interior',
      },
    ],
  }
  const scenarios: Array<[NWSQueryReading, string]> = [
    [same, 'unchanged'],
    [weatherReading(changedProduct), 'changed'],
    [weatherReading(cancelledProduct), 'cancelled'],
    [weatherReading(updateProduct), 'superseded'],
    [weatherReading(null), 'not-returned'],
    [unavailable, 'source-unavailable'],
    [weatherReading(nwsProduct(), '2026-10-30T18:03:00Z'), 'expired'],
    [
      weatherReading(staleZoneProduct, '2026-10-30T18:04:00Z'),
      'source-unavailable',
    ],
  ]
  for (const [reading, result] of scenarios) {
    state = apply(state, {
      type: 'recheck-weather',
      acceptedId: accepted[0].id,
      reading,
      checkedAt: reading.checkedAt!,
      owner: 'Recovery lead',
      horizon: 'next shift',
    })
    expect(state.weatherRechecks.at(-1)?.result).toBe(result)
    expect(state.weatherEvidence).toEqual(accepted)
    expect(state.h1).toEqual(h1)
    expect(state.h2).toEqual(h2)
    expect(authorityState(state)).toEqual(authority)
  }
  expect(restoreLifecycleState(JSON.stringify(state))).toEqual(state)
})

test('weather lineage rejects contradictory identifier and URL references', () => {
  let state = sealH2(
    apply(apply(acceptWeather(), { type: 'seal-h1' }), {
      type: 'start-during',
    }),
  )
  const accepted = state.weatherEvidence[0]
  const update = nwsProduct()
  update.id = 'urn:oid:contradictory-update'
  update.url = 'https://api.weather.gov/alerts/urn:oid:contradictory-update'
  update.message_type = 'Update'
  update.relationship = 'update'
  update.references = [
    {
      identifier: 'urn:oid:different-alert',
      url: accepted.product.url,
      sender: accepted.product.sender,
      sent: accepted.product.sent,
    },
  ]
  state = apply(state, {
    type: 'recheck-weather',
    acceptedId: accepted.id,
    reading: weatherReading(update),
    checkedAt: weatherTime,
    owner: 'Recovery lead',
    horizon: 'next shift',
  })
  expect(state.weatherRechecks[0].result).toBe('not-returned')
  expect(restoreLifecycleState(JSON.stringify(state))).toEqual(state)
})

for (const [relationship, expected] of [
  ['update', 'superseded'],
  ['cancel', 'cancelled'],
] as const) {
  test(`weather ${relationship} lineage takes precedence over a simultaneous exact revision`, () => {
    let state = sealH2(
      apply(apply(acceptWeather(), { type: 'seal-h1' }), {
        type: 'start-during',
      }),
    )
    const accepted = state.weatherEvidence[0]
    const successor = nwsProduct()
    successor.id = `urn:oid:${relationship}-successor`
    successor.url = `https://api.weather.gov/alerts/urn:oid:${relationship}-successor`
    successor.message_type = relationship === 'cancel' ? 'Cancel' : 'Update'
    successor.relationship = relationship
    successor.eligibility =
      relationship === 'cancel' ? 'cancellation' : 'eligible'
    successor.references = [
      {
        identifier: accepted.product.id,
        url: accepted.product.url,
        sender: accepted.product.sender,
        sent: accepted.product.sent,
      },
    ]
    const reading = weatherReading()
    reading.products.push(weatherReading(successor).products[0])
    state = apply(state, {
      type: 'recheck-weather',
      acceptedId: accepted.id,
      reading,
      checkedAt: weatherTime,
      owner: 'Recovery lead',
      horizon: 'next shift',
    })
    expect(state.weatherRechecks[0]).toMatchObject({
      result: expected,
      observed: { product: { id: successor.id } },
      candidates: { count: 0 },
    })
    expect(restoreLifecycleState(JSON.stringify(state))).toEqual(state)
  })
}

test('weather rechecks canonicalize identical duplicate source rows', () => {
  let state = sealH2(
    apply(apply(acceptWeather(), { type: 'seal-h1' }), {
      type: 'start-during',
    }),
  )
  const reading = weatherReading()
  reading.products.push(structuredClone(reading.products[0]))
  state = apply(state, {
    type: 'recheck-weather',
    acceptedId: state.weatherEvidence[0].id,
    reading,
    checkedAt: weatherTime,
    owner: 'Recovery lead',
    horizon: 'next shift',
  })
  expect(state.weatherRechecks[0]).toMatchObject({
    result: 'unchanged',
    candidates: { count: 0 },
  })
  expect(restoreLifecycleState(JSON.stringify(state))).toEqual(state)
})

test('weather rechecks preserve conflicting evaluations as ambiguity', () => {
  let state = sealH2(
    apply(apply(acceptWeather(), { type: 'seal-h1' }), {
      type: 'start-during',
    }),
  )
  const reading = weatherReading()
  const affected = structuredClone(reading.products[0])
  affected.applicability_basis = 'affected_zones'
  affected.applicability = 'inside'
  affected.applicability_reason = 'strict_interior'
  affected.zone_evidence = {
    result: 'inside',
    reason: 'strict_interior',
    coverage: 'complete',
    zones: [
      {
        url: 'https://api.weather.gov/zones/forecast/HIZ001',
        id: 'HIZ001',
        type: 'forecast',
        source_revision: 'c'.repeat(64),
        effective: '2026-10-30T17:00:00Z',
        expires: '2026-10-30T19:00:00Z',
        retrieved_at: '2026-10-30T17:50:00Z',
        fresh_until: '2026-10-30T18:05:00Z',
        state: 'fresh',
        result: 'inside',
        reason: 'strict_interior',
      },
    ],
  }
  reading.products.push(affected)
  state = apply(state, {
    type: 'recheck-weather',
    acceptedId: state.weatherEvidence[0].id,
    reading,
    checkedAt: weatherTime,
    owner: 'Recovery lead',
    horizon: 'next shift',
  })
  expect(state.weatherRechecks[0]).toMatchObject({
    result: 'ambiguous',
    candidates: { count: 2 },
  })
  expect(
    new Set(
      state.weatherRechecks[0].candidates.identities.map(
        (candidate) => candidate.evaluationDigest,
      ),
    ).size,
  ).toBe(2)
  expect(restoreLifecycleState(JSON.stringify(state))).toEqual(state)
})

test('weather lineage ambiguity uses canonical code-unit candidate ordering', () => {
  let state = sealH2(
    apply(apply(acceptWeather(), { type: 'seal-h1' }), {
      type: 'start-during',
    }),
  )
  const accepted = state.weatherEvidence[0]
  const update = (id: string) => {
    const product = nwsProduct()
    product.id = id
    product.url = `https://api.weather.gov/alerts/${id}`
    product.message_type = 'Update'
    product.relationship = 'update'
    product.references = [
      {
        identifier: accepted.product.id,
        url: accepted.product.url,
        sender: accepted.product.sender,
        sent: accepted.product.sent,
      },
    ]
    return product
  }
  const reading = weatherReading(update('a'))
  reading.products.push(update('Z'))
  state = apply(state, {
    type: 'recheck-weather',
    acceptedId: accepted.id,
    reading,
    checkedAt: weatherTime,
    owner: 'Recovery lead',
    horizon: 'next shift',
  })
  expect(state.weatherRechecks[0]).toMatchObject({
    result: 'ambiguous',
    candidates: {
      count: 2,
      identities: [{ id: 'Z' }, { id: 'a' }],
    },
  })
  expect(restoreLifecycleState(JSON.stringify(state))).toEqual(state)
})

test('weather counts and multi-cycle archives stay bounded and immutable', () => {
  let state = readyBefore()
  for (let index = 0; index < 4; index++) {
    const product = nwsProduct()
    product.id = `urn:oid:fixture-${index}`
    product.url = `https://api.weather.gov/alerts/urn:oid:fixture-${index}`
    state = acceptWeather(state, product)
  }
  const beforeOverflow = JSON.stringify(state)
  const overflow = nwsProduct()
  overflow.id = 'urn:oid:fixture-overflow'
  overflow.url = 'https://api.weather.gov/alerts/urn:oid:fixture-overflow'
  expect(() => acceptWeather(state, overflow)).toThrow(/limit is full/)
  expect(JSON.stringify(state)).toBe(beforeOverflow)
  state = apply(state, { type: 'seal-h1' })
  state = sealH2(apply(state, { type: 'start-during' }))
  for (let index = 0; index < 8; index++) {
    const reading = weatherReading(
      nwsProduct(),
      new Date(Date.parse(weatherTime) + index * 1000).toISOString(),
    )
    state = apply(state, {
      type: 'recheck-weather',
      acceptedId: state.weatherEvidence[0].id,
      reading,
      checkedAt: reading.checkedAt!,
      owner: 'Recovery lead',
      horizon: 'next shift',
    })
  }
  const beforeRecheckOverflow = JSON.stringify(state)
  expect(() =>
    apply(state, {
      type: 'recheck-weather',
      acceptedId: state.weatherEvidence[0].id,
      reading: weatherReading(),
      checkedAt: weatherTime,
      owner: 'Recovery lead',
      horizon: 'next shift',
    }),
  ).toThrow(/limit is full/)
  expect(JSON.stringify(state)).toBe(beforeRecheckOverflow)
  state = apply(state, {
    type: 'decide-gates',
    decision: 'gates-unmet-carry-forward',
  })
  const next = apply(state, { type: 'start-next-cycle' })
  expect(next.previousWeatherCycle?.accepted).toHaveLength(4)
  expect(next.previousWeatherCycle?.rechecks).toHaveLength(8)
  expect(next.weatherEvidence).toEqual([])
  expect(restoreLifecycleState(JSON.stringify(next))).toEqual(next)
  let cycle2 = acceptWeather(readyBefore('comparison', next))
  cycle2 = sealH2(
    apply(apply(cycle2, { type: 'seal-h1' }), { type: 'start-during' }),
  )
  cycle2 = apply(cycle2, {
    type: 'decide-gates',
    decision: 'gates-unmet-carry-forward',
  })
  const cycle3 = apply(cycle2, { type: 'start-next-cycle' })
  expect(cycle3.weatherHistory).toEqual([next.previousWeatherCycle])
  expect(cycle3.previousWeatherCycle?.accepted).toHaveLength(1)
  expect(restoreLifecycleState(JSON.stringify(cycle3))).toEqual(cycle3)
})

test('weather records reject stale acceptance, invalid enums, tampering, and re-signed invalid imports', () => {
  const stale = reviewedWeather()
  stale.reading.retrievalState = 'stale'
  expect(() =>
    apply(readyBefore(), {
      type: 'accept-weather',
      reviewed: stale,
      acceptedAt: weatherTime,
    }),
  ).toThrow(/fresh complete/)
  const good = acceptWeather()
  const tampered = structuredClone(good)
  ;(
    tampered.weatherEvidence[0].product as { eligibility: string }
  ).eligibility = 'warning'
  const { recordDigest: _digest, ...contents } = tampered.weatherEvidence[0]
  tampered.weatherEvidence[0].recordDigest = contentDigest(contents)
  expect(() => restoreLifecycleState(JSON.stringify(tampered))).toThrow(
    /failed validation/,
  )
  const falseValidity = structuredClone(good)
  falseValidity.weatherEvidence[0].observation.validity = 'expired'
  const { recordDigest: _validityDigest, ...validityContents } =
    falseValidity.weatherEvidence[0]
  falseValidity.weatherEvidence[0].recordDigest =
    contentDigest(validityContents)
  expect(() => restoreLifecycleState(JSON.stringify(falseValidity))).toThrow(
    /failed validation/,
  )
  const falseRelationship = structuredClone(good)
  falseRelationship.weatherEvidence[0].product.relationship = 'update'
  falseRelationship.weatherEvidence[0].productDigest = contentDigest({
    version: 'nws-product-semantic.v1',
    product: falseRelationship.weatherEvidence[0].product,
  })
  const { recordDigest: _relationshipDigest, ...relationshipContents } =
    falseRelationship.weatherEvidence[0]
  falseRelationship.weatherEvidence[0].recordDigest =
    contentDigest(relationshipContents)
  expect(() =>
    restoreLifecycleState(JSON.stringify(falseRelationship)),
  ).toThrow(/failed validation/)
  const falseGeometry = structuredClone(good)
  falseGeometry.weatherEvidence[0].product.geometry.status = 'unsupported'
  falseGeometry.weatherEvidence[0].productDigest = contentDigest({
    version: 'nws-product-semantic.v1',
    product: falseGeometry.weatherEvidence[0].product,
  })
  const { recordDigest: _geometryDigest, ...geometryContents } =
    falseGeometry.weatherEvidence[0]
  falseGeometry.weatherEvidence[0].recordDigest =
    contentDigest(geometryContents)
  expect(() => restoreLifecycleState(JSON.stringify(falseGeometry))).toThrow(
    /failed validation/,
  )

  const zoneProduct = nwsProduct()
  zoneProduct.geometry = { status: 'absent', type: null, shape: null }
  zoneProduct.applicability_basis = 'affected_zones'
  zoneProduct.applicability = 'outside'
  zoneProduct.applicability_reason = 'strict_exterior'
  zoneProduct.zone_evidence = {
    result: 'outside',
    reason: 'strict_exterior',
    coverage: 'complete',
    zones: [
      {
        url: 'https://api.weather.gov/zones/forecast/HIZ001',
        id: 'HIZ001',
        type: 'forecast',
        source_revision: 'b'.repeat(64),
        effective: '2026-10-30T17:00:00Z',
        expires: '2026-10-30T19:00:00Z',
        retrieved_at: '2026-10-30T17:50:00Z',
        fresh_until: '2026-10-30T18:05:00Z',
        state: 'fresh',
        result: 'outside',
        reason: 'strict_exterior',
      },
    ],
  }
  const falseApplicability = structuredClone(
    acceptWeather(readyBefore(), zoneProduct),
  )
  falseApplicability.weatherEvidence[0].evaluation.applicability = 'unknown'
  falseApplicability.weatherEvidence[0].evaluation.reason = 'zone_incomplete'
  falseApplicability.weatherEvidence[0].evaluation.coverage = 'partial'
  falseApplicability.weatherEvidence[0].evaluationDigest = contentDigest({
    version: 'nws-planning-evaluation.v1',
    point: falseApplicability.weatherEvidence[0].evaluation.point,
    algorithmVersion:
      falseApplicability.weatherEvidence[0].evaluation.algorithmVersion,
    applicability:
      falseApplicability.weatherEvidence[0].evaluation.applicability,
    reason: falseApplicability.weatherEvidence[0].evaluation.reason,
    basis: falseApplicability.weatherEvidence[0].evaluation.basis,
    coverage: falseApplicability.weatherEvidence[0].evaluation.coverage,
    zones: falseApplicability.weatherEvidence[0].evaluation.zones.map(
      (zone) => ({
        url: zone.url,
        id: zone.id,
        type: zone.type,
        source_revision: zone.source_revision,
        effective: zone.effective,
        expires: zone.expires,
        result: zone.result,
        reason: zone.reason,
      }),
    ),
  })
  const { recordDigest: _applicabilityDigest, ...applicabilityContents } =
    falseApplicability.weatherEvidence[0]
  falseApplicability.weatherEvidence[0].recordDigest = contentDigest(
    applicabilityContents,
  )
  expect(() =>
    restoreLifecycleState(JSON.stringify(falseApplicability)),
  ).toThrow(/failed validation/)

  let checked = apply(good, { type: 'seal-h1' })
  checked = sealH2(apply(checked, { type: 'start-during' }))
  const unavailable = weatherReading()
  unavailable.transport = 'unavailable'
  unavailable.retrievalState = 'unavailable'
  unavailable.coverage = 'unavailable'
  checked = apply(checked, {
    type: 'recheck-weather',
    acceptedId: checked.weatherEvidence[0].id,
    reading: unavailable,
    checkedAt: unavailable.checkedAt!,
    owner: 'Recovery lead',
    horizon: 'next shift',
  })
  const falseResult = structuredClone(checked)
  falseResult.weatherRechecks[0].result = 'cancelled'
  const { recordDigest: _resultDigest, ...resultContents } =
    falseResult.weatherRechecks[0]
  falseResult.weatherRechecks[0].recordDigest = contentDigest(resultContents)
  expect(() => restoreLifecycleState(JSON.stringify(falseResult))).toThrow(
    /failed validation/,
  )
  const falseCandidates = structuredClone(checked)
  falseCandidates.weatherRechecks[0].candidates = {
    count: 2,
    complete: true,
    identities: [
      {
        id: 'a',
        url: 'https://api.weather.gov/alerts/a',
        relationship: 'update',
        productDigest: 'fnv1a-dual-v1:1111111111111111',
        evaluationDigest: 'fnv1a-dual-v1:3333333333333333',
      },
      {
        id: 'b',
        url: 'https://api.weather.gov/alerts/b',
        relationship: 'update',
        productDigest: 'fnv1a-dual-v1:2222222222222222',
        evaluationDigest: 'fnv1a-dual-v1:4444444444444444',
      },
    ],
    digest: null,
  }
  falseCandidates.weatherRechecks[0].candidates.digest = contentDigest(
    falseCandidates.weatherRechecks[0].candidates.identities,
  )
  const { recordDigest: _candidateDigest, ...candidateContents } =
    falseCandidates.weatherRechecks[0]
  falseCandidates.weatherRechecks[0].recordDigest =
    contentDigest(candidateContents)
  expect(() => restoreLifecycleState(JSON.stringify(falseCandidates))).toThrow(
    /failed validation/,
  )
})

test('v3 migration preserves sealed digests and creates no weather facts', () => {
  let state = readyBefore()
  state = apply(state, { type: 'seal-h1' })
  const h1 = state.h1?.digest
  const legacy = structuredClone(state) as unknown as Record<string, unknown>
  legacy.schema = 'practice-lifecycle.v3'
  delete legacy.weatherEvidence
  delete legacy.weatherRechecks
  delete legacy.weatherHistory
  delete legacy.previousWeatherCycle
  delete legacy.followThroughItems
  delete legacy.followThroughHistory
  const migrated = migrateLifecycleV3State(JSON.stringify(legacy))
  expect(migrated.h1?.digest).toBe(h1)
  expect(migrated.weatherEvidence).toEqual([])
  expect(migrated.weatherRechecks).toEqual([])
  expect(migrated.weatherHistory).toEqual([])
  expect(migrated.previousWeatherCycle).toBeNull()
  expect(restoreLifecycleState(JSON.stringify(migrated))).toEqual(migrated)
})

test('v4 migration preserves sealed H1 H2 and prior H3 digests', () => {
  const sealed = completeLifecycle(false)
  const v4Sealed = structuredClone(sealed) as unknown as Record<string, any>
  v4Sealed.schema = 'practice-lifecycle.v4'
  delete v4Sealed.followThroughItems
  delete v4Sealed.followThroughHistory
  const migratedSealed = migrateLifecycleV4State(JSON.stringify(v4Sealed))
  expect(migratedSealed.h1?.digest).toBe(sealed.h1?.digest)
  expect(migratedSealed.h2?.digest).toBe(sealed.h2?.digest)

  const rolled = completeLifecycle(true)
  const v4Rolled = structuredClone(rolled) as unknown as Record<string, any>
  v4Rolled.schema = 'practice-lifecycle.v4'
  delete v4Rolled.followThroughItems
  delete v4Rolled.followThroughHistory
  const migratedRolled = migrateLifecycleV4State(JSON.stringify(v4Rolled))
  expect(migratedRolled.previousCycle?.digest).toBe(
    rolled.previousCycle?.digest,
  )
  expect(migratedRolled.followThroughItems).toEqual([])
  expect(migratedRolled.followThroughHistory).toEqual([])
})

test('v1 v2 v3 and v4 near-limit records migrate without empty-field overhead', () => {
  const cases = [
    ['practice-lifecycle.v1', migrateLifecycleV1State],
    ['practice-lifecycle.v2', migrateLifecycleV2State],
    ['practice-lifecycle.v3', migrateLifecycleV3State],
    ['practice-lifecycle.v4', migrateLifecycleV4State],
  ] as const
  for (const [schema, migrate] of cases) {
    const legacy = structuredClone(
      createInitialLifecycleState(),
    ) as unknown as Record<string, any>
    legacy.schema = schema
    for (const key of [
      ...(schema === 'practice-lifecycle.v3'
        ? []
        : ['sourceEvidence', 'sourceRechecks', 'sourceHistory', 'legacySeals']),
      'weatherEvidence',
      'weatherRechecks',
      'weatherHistory',
      'previousWeatherCycle',
      'followThroughItems',
      'followThroughHistory',
      ...(schema === 'practice-lifecycle.v1' ? ['pinnedEvidence'] : []),
    ])
      delete legacy[key]
    legacy.ledger = [
      {
        sequence: 1,
        capability: 'B01',
        cycle: 1,
        practiceMinute: -60,
        summary: '',
      },
    ]
    const baseBytes = new TextEncoder().encode(JSON.stringify(legacy)).length
    legacy.ledger[0].summary = 'x'.repeat(
      maxLifecycleImportBytes - baseBytes - 1,
    )
    const text = JSON.stringify(legacy)
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(
      maxLifecycleImportBytes,
    )
    const migrated = migrate(text)
    expect(
      new TextEncoder().encode(serializeLifecycleState(migrated)).length,
    ).toBeLessThanOrEqual(maxLifecycleImportBytes)
    expect(migrated.weatherEvidence).toEqual([])
  }
})

test('structured follow-through enforces exact records and bounded transitions', () => {
  const planned = completeLifecycle(false)
  const id = planned.followThroughItems[0].id
  expect(() => apply(planned, { type: 'finish-follow-through', id })).toThrow(
    /latest observed/,
  )

  let state = apply(planned, { type: 'start-follow-through', id })
  state = apply(state, {
    type: 'record-follow-through-observation',
    id,
    result: 'unknown',
  })
  expect(() => apply(state, { type: 'finish-follow-through', id })).toThrow(
    /latest observed/,
  )
  state = apply(state, { type: 'mark-follow-through-unable', id })
  state = apply(state, { type: 'start-follow-through', id })
  expect(() =>
    apply(state, { type: 'mark-follow-through-unable', id }),
  ).toThrow(/current PRACTICE result|not-observed or unknown/)
  for (let index = 1; index < 8; index++)
    state = apply(state, {
      type: 'record-follow-through-observation',
      id,
      result: index === 7 ? 'observed' : 'not-observed',
    })
  expect(() =>
    apply(state, {
      type: 'record-follow-through-observation',
      id,
      result: 'observed',
    }),
  ).toThrow(/observation limit/)
  expect(() =>
    apply(state, { type: 'mark-follow-through-unable', id }),
  ).toThrow(/not-observed or unknown/)
  state = apply(state, { type: 'finish-follow-through', id })
  expect(state.followThroughItems[0].status).toBe('done')

  let exhausted = apply(planned, { type: 'start-follow-through', id })
  for (let index = 0; index < 8; index++) {
    exhausted = apply(exhausted, {
      type: 'record-follow-through-observation',
      id,
      result: 'unknown',
    })
    exhausted = apply(exhausted, {
      type: 'mark-follow-through-unable',
      id,
    })
    if (index < 7)
      exhausted = apply(exhausted, { type: 'start-follow-through', id })
  }
  expect(exhausted.followThroughItems[0].status).toBe('unable')
  expect(() => apply(exhausted, { type: 'start-follow-through', id })).toThrow(
    /observation limit is full/,
  )

  const malformed = structuredClone(state) as any
  malformed.followThroughItems[0].extra = true
  expect(() => restoreLifecycleState(JSON.stringify(malformed))).toThrow(
    /failed validation/,
  )
  const duplicate = structuredClone(state) as any
  duplicate.followThroughItems.push(
    structuredClone(duplicate.followThroughItems[0]),
  )
  expect(() => restoreLifecycleState(JSON.stringify(duplicate))).toThrow(
    /failed validation/,
  )
  const orphan = structuredClone(state) as any
  orphan.followThroughItems[0].supportItemId = 'orphan'
  orphan.followThroughItems[0].id = `${orphan.cycle}:orphan`
  expect(() => restoreLifecycleState(JSON.stringify(orphan))).toThrow(
    /failed validation/,
  )
})

test('follow-through linkage gates and rollover preserve stable unresolved work', () => {
  const linked = completeLifecycle(false)
  const unlinked = {
    ...linked,
    followThroughItems: [],
  }
  expect(lifecycleGates(unlinked).recoveryRows).toBe(false)
  expect(lifecycleGates(linked).recoveryRows).toBe(true)

  const id = linked.followThroughItems[0].id
  const rolled = apply(linked, { type: 'start-next-cycle' })
  expect(rolled.followThroughItems).toEqual(linked.followThroughItems)
  expect(rolled.followThroughItems[0].id).toBe(id)
  expect(rolled.followThroughHistory).toHaveLength(1)
  expect(rolled.followThroughHistory[0].items).toEqual(
    linked.followThroughItems,
  )
  expect(rolled.carriedGaps.map((gap) => gap.gapId)).toContain(
    linked.followThroughItems[0].gapId,
  )
  expect(restoreLifecycleState(serializeLifecycleState(rolled))).toEqual(rolled)
  const missingArchive = structuredClone(rolled)
  missingArchive.followThroughHistory = []
  expect(() => restoreLifecycleState(JSON.stringify(missingArchive))).toThrow(
    /failed validation/,
  )
  const alteredArchive = structuredClone(rolled)
  alteredArchive.followThroughHistory[0].digest =
    'fnv1a-dual-v1:0000000000000000'
  expect(() => restoreLifecycleState(JSON.stringify(alteredArchive))).toThrow(
    /failed validation/,
  )

  let completed = apply(linked, { type: 'start-follow-through', id })
  completed = apply(completed, {
    type: 'record-follow-through-observation',
    id,
    result: 'observed',
  })
  completed = apply(completed, { type: 'finish-follow-through', id })
  const completedRoll = apply(completed, { type: 'start-next-cycle' })
  expect(completedRoll.followThroughItems).toEqual([])
  expect(completedRoll.followThroughHistory[0].items[0].status).toBe('done')
  expect(completedRoll.carriedGaps.map((gap) => gap.gapId)).not.toContain(
    completed.followThroughItems[0].gapId,
  )

  const disappeared = structuredClone(rolled)
  disappeared.cycle = 3
  disappeared.followThroughHistory.push({
    cycle: 2,
    items: [],
    digest: followThroughArchiveDigest({ cycle: 2, items: [] }),
  })
  disappeared.followThroughItems = []
  expect(() => restoreLifecycleState(JSON.stringify(disappeared))).toThrow(
    /failed validation/,
  )
})

test('compact restore rejects a reconstructed canonical export over 128 KiB', () => {
  const oversized = createInitialLifecycleState()
  oversized.packetSections = Array.from(
    { length: 8_000 },
    () => 'cycle summary',
  )
  const compact = serializeLifecycleState(oversized)
  expect(new TextEncoder().encode(compact).byteLength).toBeLessThanOrEqual(
    maxLifecycleImportBytes,
  )
  expect(
    new TextEncoder().encode(exportLifecycleRecord(oversized)).byteLength,
  ).toBeGreaterThan(maxLifecycleImportBytes)
  expect(() => restoreLifecycleState(compact)).toThrow(/128 KiB limit/)
})

test('source acceptance is attributable, append-only, and never criteria or authority', () => {
  const before = readyBefore()
  before.evidence = []
  before.capabilityMarkers = before.capabilityMarkers.filter(
    (id) => id !== 'B07',
  )
  const displayed = displayedSource()
  const accepted = acceptSource(before, displayed)
  expect(authorityState(accepted)).toEqual(authorityState(before))
  expect(h1Gates(accepted).evidence).toBe(false)
  expect(accepted.capabilityMarkers).not.toContain('B07')
  expect(accepted.sourceEvidence[0]).toMatchObject({
    gapId: 'transportation',
    acceptedAt: sourceTestTime,
    acceptanceState: 'facilitator-selected planning context',
    freshnessAtAcceptance: 'unknown',
    displayed: { snapshotId: 'snapshot-source-a', claim: sourceClaim() },
  })
  displayed.claim!.facts.reported_status = 'CHANGED AFTER CLICK'
  expect(
    accepted.sourceEvidence[0].displayed.claim?.facts.reported_status,
  ).toBe('OPEN')
  expect(
    Object.isFrozen(accepted.sourceEvidence[0].displayed.claim?.facts),
  ).toBe(true)
  const next = acceptSource(accepted, displayedSource(sourceClaim('CLOSED')))
  expect(next.sourceEvidence[0]).toEqual(accepted.sourceEvidence[0])
  expect(next.sourceEvidence).toHaveLength(2)
  expect(() =>
    acceptSource(next, displayedSource(sourceClaim('CLOSED'))),
  ).toThrow(/already accepted/)
  expect(() => apply(accepted, { type: 'seal-h1' })).toThrow(
    /Before handoff gate/,
  )
})

test('accept captures reviewed A even when refresh offers A-prime; sealed H1/H2 remain immutable', () => {
  const displayedA = displayedSource()
  const newerSuggestion = displayedSource(sourceClaim('CLOSED'))
  newerSuggestion.snapshotId = 'snapshot-newer'
  const before = readyBefore()
  let state = acceptSource(before, displayedA)
  expect(state.sourceEvidence[0].displayed).toEqual(displayedA)
  state = apply(state, { type: 'seal-h1' })
  const h1 = structuredClone(state.h1)
  expect(h1?.digest).not.toBe(apply(before, { type: 'seal-h1' }).h1?.digest)
  expect(() => acceptSource(state, newerSuggestion)).toThrow(/immutable/)
  state = apply(state, { type: 'start-during' })
  state = apply(state, { type: 'advance-clock', minutes: 60 })
  state = sealH2(state)
  const h2 = structuredClone(state.h2)
  const accepted = structuredClone(state.sourceEvidence)
  const authority = authorityState(state)
  const scenarios = [
    { reading: displayedSource(sourceClaim('CLOSED')), result: 'changed' },
    { reading: displayedSource(), result: 'unchanged' },
    {
      reading: { ...displayedSource(), transport: 'unavailable' as const },
      result: 'source-unavailable',
    },
    { reading: displayedSource(null), result: 'not-returned' },
  ]
  for (const { reading, result } of scenarios) {
    state = apply(state, {
      type: 'recheck-source',
      acceptedId: accepted[0].id,
      reading,
      checkedAt: sourceTestTime,
      owner: 'Recovery lead',
      horizon: 'next shift',
    })
    expect(state.sourceRechecks.at(-1)?.result).toBe(result)
    expect(state.sourceEvidence).toEqual(accepted)
    expect(state.h1).toEqual(h1)
    expect(state.h2).toEqual(h2)
    expect(authorityState(state)).toEqual(authority)
  }
  expect(restoreLifecycleState(JSON.stringify(state))).toEqual(state)
  expect(parseLifecycleComparison(exportLifecycleRecord(state)).digest).toBe(
    lifecycleDigest(state),
  )
  const packet = generateCloseoutPacket(state)
  expect(packet.text).toContain(accepted[0].displayed.claim!.content_digest)
  expect(packet.text).toContain('source-unavailable')
  expect(packet.text).toContain('fema-shelter-context.v1')
  expect(generateCloseoutPacket(structuredClone(state))).toEqual(packet)
  state = apply(state, {
    type: 'decide-gates',
    decision: 'gates-unmet-carry-forward',
  })
  const priorDigest = lifecycleDigest(state)
  const next = apply(state, { type: 'start-next-cycle' })
  expect(next.previousCycle?.digest).toBe(priorDigest)
  expect(next.previousCycle?.sourceEvidence).toEqual(accepted)
  expect(next.previousCycle?.sourceRechecks).toEqual(state.sourceRechecks)
  expect(restoreLifecycleState(JSON.stringify(next))).toEqual(next)
  let cycle2 = readyBefore('comparison', next)
  cycle2 = sealH2(
    apply(apply(cycle2, { type: 'seal-h1' }), { type: 'start-during' }),
  )
  cycle2 = apply(cycle2, {
    type: 'decide-gates',
    decision: 'gates-unmet-carry-forward',
  })
  const cycle3 = apply(cycle2, { type: 'start-next-cycle' })
  expect(cycle3.sourceHistory).toEqual([next.previousCycle])
  expect(restoreLifecycleState(JSON.stringify(cycle3))).toEqual(cycle3)
  const badHistory = structuredClone(cycle3)
  badHistory.sourceHistory[0].digest = 'tampered'
  expect(() => restoreLifecycleState(JSON.stringify(badHistory))).toThrow(
    /history integrity/,
  )
  const tampered = structuredClone(next)
  tampered.previousCycle!.sourceRechecks = []
  expect(() => restoreLifecycleState(JSON.stringify(tampered))).toThrow(
    /H3 integrity/,
  )
})

test('source records reject corrupt facts, checksums, references, enums, and oversized payloads', () => {
  const good = acceptSource()
  for (const tamper of [
    (state: LifecycleState) => {
      state.sourceEvidence[0].displayed.claim!.facts.reported_capacity = 0
    },
    (state: LifecycleState) => {
      state.sourceEvidence[0].recordDigest = 'wrong'
    },
    (state: LifecycleState) => {
      state.sourceEvidence[0].gapId = 'medical'
    },
    (state: LifecycleState) => {
      state.sourceEvidence[0].displayed.claim!.name = 'x'.repeat(257)
    },
    (state: LifecycleState) => {
      Object.assign(state.sourceEvidence[0].displayed.claim!, {
        url: 'https://example.com',
      })
    },
  ]) {
    const state = structuredClone(good)
    tamper(state)
    expect(() => restoreLifecycleState(JSON.stringify(state))).toThrow()
    expect(() =>
      parseLifecycleComparison(exportLifecycleRecord(state)),
    ).toThrow()
  }
  let after = sealH2(
    apply(apply(good, { type: 'seal-h1' }), { type: 'start-during' }),
  )
  after = apply(after, {
    type: 'recheck-source',
    acceptedId: after.sourceEvidence[0].id,
    reading: displayedSource(),
    checkedAt: sourceTestTime,
    owner: 'Recovery lead',
    horizon: 'next day',
  })
  const invalidReference = structuredClone(after)
  invalidReference.sourceRechecks[0].acceptedId = 'SA-1-99'
  const { recordDigest: _digest, ...contents } =
    invalidReference.sourceRechecks[0]
  invalidReference.sourceRechecks[0].recordDigest = contentDigest(contents)
  expect(() =>
    restoreLifecycleState(JSON.stringify(invalidReference)),
  ).toThrow()
  expect(() =>
    apply(after, {
      type: 'recheck-source',
      acceptedId: 'SA-1-1',
      reading: displayedSource(sourceClaim('OPEN', 'different-item')),
      checkedAt: sourceTestTime,
      owner: 'Recovery lead',
      horizon: 'next day',
    }),
  ).toThrow()
  expect(() =>
    restoreLifecycleState(' '.repeat(128 * 1024) + JSON.stringify(after)),
  ).toThrow(/128 KiB/)
  expect(() => migrateLifecycleV2State(' '.repeat(128 * 1024) + '{}')).toThrow(
    /128 KiB/,
  )
})

test('source acceptance and rechecks enforce bounded counts', () => {
  let state = readyBefore()
  for (let index = 0; index < 8; index++)
    state = acceptSource(state, displayedSource(sourceClaim(`STATUS-${index}`)))
  expect(() =>
    acceptSource(state, displayedSource(sourceClaim('NINTH'))),
  ).toThrow(/bounded/)
  state = sealH2(
    apply(apply(acceptSource(), { type: 'seal-h1' }), { type: 'start-during' }),
  )
  for (let index = 0; index < 16; index++) {
    state = apply(state, {
      type: 'recheck-source',
      acceptedId: 'SA-1-1',
      reading: {
        snapshotId: null,
        generatedAt: null,
        checkedAt: sourceTestTime,
        transport: 'unavailable',
        context: null,
        claim: null,
      },
      checkedAt: sourceTestTime,
      owner: 'Recovery lead',
      horizon: 'next day',
    })
  }
  expect(() =>
    apply(state, {
      type: 'recheck-source',
      acceptedId: 'SA-1-1',
      reading: displayedSource(),
      checkedAt: sourceTestTime,
      owner: 'Recovery lead',
      horizon: 'next day',
    }),
  ).toThrow(/bounded/)
})

test('non-string enums cannot be accepted, rechecked, or persisted as not-returned', () => {
  const before = readyBefore()
  const accepted = acceptSource(before)
  const after = sealH2(
    apply(apply(accepted, { type: 'seal-h1' }), { type: 'start-during' }),
  )
  const recheck: LifecycleAction = {
    type: 'recheck-source',
    acceptedId: 'SA-1-1',
    reading: displayedSource(null),
    checkedAt: sourceTestTime,
    owner: 'Recovery lead',
    horizon: 'next shift',
  }
  const checked = apply(after, recheck)
  expect(checked.sourceRechecks[0].result).toBe('not-returned')
  const original = JSON.stringify(after)
  for (const [field, member] of [
    ['coverage', 'partial'],
    ['state', 'stale'],
    ['transport', 'unavailable'],
  ]) {
    for (const invalid of [
      [member],
      [[member]],
      { value: member },
      0,
      null,
      false,
    ]) {
      const displayed = displayedSource()
      Object.assign(field === 'transport' ? displayed : displayed.context!, {
        [field]: invalid,
      })
      expect(() => acceptSource(before, displayed)).toThrow(
        /validated displayed/,
      )
      const reading = { ...displayed, claim: null }
      expect(() => apply(after, { ...recheck, reading })).toThrow(
        /explicit source check/,
      )
      expect(JSON.stringify(after)).toBe(original)
      const badAccepted = structuredClone(accepted)
      badAccepted.sourceEvidence[0].displayed = displayed
      const { recordDigest: _acceptedDigest, ...acceptedContents } =
        badAccepted.sourceEvidence[0]
      badAccepted.sourceEvidence[0].recordDigest =
        contentDigest(acceptedContents)
      const badRecheck = structuredClone(checked)
      badRecheck.sourceRechecks[0].reading = reading
      const { recordDigest: _recheckDigest, ...recheckContents } =
        badRecheck.sourceRechecks[0]
      badRecheck.sourceRechecks[0].recordDigest = contentDigest(recheckContents)
      for (const tampered of [badAccepted, badRecheck]) {
        expect(() => restoreLifecycleState(JSON.stringify(tampered))).toThrow()
        expect(() =>
          parseLifecycleComparison(exportLifecycleRecord(tampered)),
        ).toThrow()
      }
    }
  }
  assertBoundedRoundTrip(after)
})

test('compact restore permits empty omitted pins and rejects malformed pinned evidence', () => {
  const state = createInitialLifecycleState()
  const missing = JSON.parse(JSON.stringify(state)) as Record<string, unknown>
  delete missing.pinnedEvidence
  expect(restoreLifecycleState(JSON.stringify(missing))).toEqual(state)

  const malformed = {
    ...state,
    pinnedEvidence: [{ ...evidenceReference(), triggerCount: -1 }],
  }
  expect(() => restoreLifecycleState(JSON.stringify(malformed))).toThrow()
})

test('strict v2 restore verifies sealed H1 digest and exact phase references', () => {
  let state = apply(readyBefore(), {
    type: 'pin-evidence',
    reference: evidenceReference('before', 'snapshot-before'),
  })
  state = apply(state, { type: 'seal-h1' })

  const digestTamper = structuredClone(state)
  digestTamper.h1!.digest = '0000000000000000'
  expect(() => restoreLifecycleState(JSON.stringify(digestTamper))).toThrow(
    /H1 integrity/,
  )

  const inputTamper = structuredClone(state)
  inputTamper.timing.warningMinutes++
  expect(() => restoreLifecycleState(JSON.stringify(inputTamper))).toThrow(
    /H1 integrity/,
  )

  const referenceTamper = structuredClone(state)
  referenceTamper.h1!.evidenceReferences = []
  expect(() => restoreLifecycleState(JSON.stringify(referenceTamper))).toThrow(
    /H1 integrity/,
  )
})

test('strict v2 restore verifies sealed H2 digest and exact phase references', () => {
  let state = startDuring()
  state = apply(state, {
    type: 'pin-evidence',
    reference: evidenceReference('during', 'snapshot-during'),
  })
  state = sealH2(state)

  const digestTamper = structuredClone(state)
  digestTamper.h2!.digest = '0000000000000000'
  expect(() => restoreLifecycleState(JSON.stringify(digestTamper))).toThrow(
    /H2 integrity/,
  )

  const inputTamper = structuredClone(state)
  inputTamper.supportItems[0].disposition =
    inputTamper.supportItems[0].disposition === 'carried'
      ? 'set aside'
      : 'carried'
  expect(() => restoreLifecycleState(JSON.stringify(inputTamper))).toThrow(
    /H2 integrity/,
  )

  const referenceTamper = structuredClone(state)
  referenceTamper.h2!.evidenceReferences = [
    evidenceReference('before', 'snapshot-before'),
  ]
  expect(() => restoreLifecycleState(JSON.stringify(referenceTamper))).toThrow(
    /H2 integrity/,
  )
})

test('strict v3 restore checks retained H3 content and cycle relationship', () => {
  const state = completeLifecycle()
  const digestTamper = structuredClone(state)
  digestTamper.previousCycle!.digest = 'not-recomputable-after-rollover'
  expect(() => restoreLifecycleState(JSON.stringify(digestTamper))).toThrow(
    /H3 integrity/,
  )

  const cycleTamper = structuredClone(state)
  cycleTamper.previousCycle!.cycle = state.cycle
  expect(() => restoreLifecycleState(JSON.stringify(cycleTamper))).toThrow(
    /previous-cycle relationship/,
  )
})

test('rejects duplicate evidence pins without marking a capability complete', () => {
  const reference = evidenceReference()
  const pinned = apply(createInitialLifecycleState(), {
    type: 'pin-evidence',
    reference,
  })
  expect(pinned.capabilityMarkers).toEqual([])
  expect(pinned.ledger.at(-1)?.capability).toBe('EVIDENCE_PIN')
  expect(() => apply(pinned, { type: 'pin-evidence', reference })).toThrow(
    /already pinned/,
  )
})

test('pinned evidence stays immutable when later refresh inputs change', () => {
  const reference = evidenceReference()
  const state = apply(createInitialLifecycleState(), {
    type: 'pin-evidence',
    reference,
  })
  reference.snapshotId = 'snapshot-after-refresh'
  reference.triggerCount = 99
  expect(state.pinnedEvidence[0]).toEqual(evidenceReference())
})

test('sealed handoff digest and references include only phase pins', () => {
  const withoutPin = apply(readyBefore(), { type: 'seal-h1' })
  let withPin = apply(readyBefore(), {
    type: 'pin-evidence',
    reference: evidenceReference('before', 'snapshot-before'),
  })
  withPin = apply(withPin, { type: 'seal-h1' })
  expect(withPin.h1?.evidenceReferences).toEqual([
    evidenceReference('before', 'snapshot-before'),
  ])
  expect(withPin.h1?.digest).not.toBe(withoutPin.h1?.digest)
  expect(() =>
    apply(withPin, {
      type: 'pin-evidence',
      reference: evidenceReference('before', 'snapshot-late'),
    }),
  ).toThrow(/sealed/)
  const packet = generateCloseoutPacket(withPin).text
  expect(packet).toContain('snapshot-before')
  expect(packet).toContain('unavailable event sources 1')
  expect(packet).toContain('event feed fresh/partial')
  expect(exportLifecycleRecord(withPin)).toContain(
    '"eventTriggerStatus": "partial"',
  )
})

test('H2 and next-cycle records preserve their pinned evidence references', () => {
  let during = startDuring()
  during = apply(during, {
    type: 'pin-evidence',
    reference: evidenceReference('during', 'snapshot-during'),
  })
  during = sealH2(during)
  expect(during.h2?.evidenceReferences).toEqual([
    evidenceReference('during', 'snapshot-during'),
  ])

  let after = completeLifecycle(false)
  after = apply(after, {
    type: 'pin-evidence',
    reference: evidenceReference('after', 'snapshot-after'),
  })
  const next = apply(after, { type: 'start-next-cycle' })
  expect(next.previousCycle?.evidenceReferences).toEqual([
    evidenceReference('after', 'snapshot-after'),
  ])
  expect(next.previousCycle?.digest).toBe(lifecycleDigest(after))
})
