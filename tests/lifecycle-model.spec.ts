import { expect, test } from '@playwright/test'

import {
  applyLifecycleAction,
  capabilityIds,
  cmistDomains,
  createInitialLifecycleState,
  exportLifecycleRecord,
  generateCloseoutPacket,
  guidanceBlocks,
  lifecycleDigest,
  lifecycleGatesMet,
  parseLifecycleComparison,
  practiceStamp,
  restoreLifecycleState,
} from '../src/lib/practice-lifecycle'
import type {
  LifecycleAction,
  LifecycleState,
} from '../src/lib/practice-lifecycle'

function apply(state: LifecycleState, action: LifecycleAction) {
  return applyLifecycleAction(state, action)
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
    /\b(open|passable|restored|normal|contained|resumed|approved|verified|confirmed|activated|dispatched|accepted|acknowledged|released|closed|cleared|all-clear)\b/i,
  )
  expect(output).not.toMatch(
    /(Hawaiʻi County|Maui County|Honolulu|HI-EMA|DHS|Red Cross)/,
  )
  expect(output).not.toMatch(/(name|address|phone|email|latitude|longitude)/i)
})
