import { expect, test } from '@playwright/test'
import {
  handoffDecision,
  nextHandoff,
  readinessGaps,
  readinessOverdue,
} from '../src/lib/staff-operations'
import type {
  AssistanceRequest,
  ReadinessTask,
} from '../src/lib/staff-operations'

const now = Date.parse('2026-10-29T12:00:00Z')
const request: AssistanceRequest = {
  id: 'opaque-request',
  revision: 1,
  mode: 'exercise',
  county: '003',
  hazard: 'flood',
  intake_ref: 'TEST-001',
  incident_ref: 'DRILL-001',
  people: 1,
  assistance: 'accessible_vehicle',
  coordinator: 'county-team',
  receiving: '',
  receiving_ready: false,
  transport: '',
  status: 'requested',
  verified: true,
  released: false,
  escalated: false,
  blocker: '',
  due_at: '2026-10-29T14:00:00Z',
  created_at: '2026-10-29T11:00:00Z',
  updated_at: '2026-10-29T11:00:00Z',
  events: [],
}

test('decision priority names the real next owner and preserves deadlines independently of blockers', () => {
  expect(nextHandoff(request, now)).toBe('County: choose a receiving partner')
  expect(handoffDecision(request, now).owner).toBe('county-team')
  const offered = {
    ...request,
    receiving: 'receiving-team',
    receiving_ready: true,
    transport: 'transport-one',
    status: 'offered',
  }
  expect(handoffDecision(offered, now).owner).toBe('transport-one')
  expect(
    handoffDecision({ ...offered, receiving_ready: false }, now).owner,
  ).toBe('receiving-team')
  const late = {
    ...offered,
    status: 'accepted',
    released: true,
    eta: '2026-10-29T11:59:00Z',
  }
  expect(handoffDecision(late, now)).toMatchObject({
    urgency: 'overdue',
    owner: 'county-team',
    deadline: late.eta,
  })
  const impossible = { ...late, eta: '2026-10-29T15:00:00Z' }
  expect(handoffDecision(impossible, now)).toMatchObject({
    urgency: 'deadline_risk',
    owner: 'county-team',
    deadlineRisk: true,
  })
  expect(
    handoffDecision({ ...impossible, blocker: 'unsafe_route' }, now).action,
  ).toContain('Blocked')
  expect(handoffDecision({ ...late, status: 'picked_up' }, now)).toMatchObject({
    owner: 'receiving-team',
    urgency: 'waiting',
  })
  for (const status of ['closed', 'cancelled']) {
    expect(handoffDecision({ ...late, status }, now)).toMatchObject({
      urgency: 'complete',
      deadlineRisk: false,
      dueSoon: false,
    })
  }
  const blockedSoon = {
    ...offered,
    blocker: 'equipment',
    due_at: '2026-10-29T12:30:00Z',
  }
  expect(handoffDecision(blockedSoon, now)).toMatchObject({
    urgency: 'blocked',
    dueSoon: true,
    owner: 'county-team',
  })
  expect(
    handoffDecision({ ...offered, due_at: '2026-10-29T11:59:00Z' }, now)
      .priority,
  ).toBeLessThan(handoffDecision(blockedSoon, now).priority)
})

test('preparedness deadlines include evidence waiting for County review but not closed tasks', () => {
  expect(
    new Set(Object.values(readinessGaps).map((gap) => gap.domain)),
  ).toEqual(
    new Set([
      'Communication',
      'Medical',
      'Independence',
      'Safety',
      'Transportation',
    ]),
  )
  const task: ReadinessTask = {
    id: 'task',
    request_id: '',
    source_ref: 'ASSESS-001',
    revision: 1,
    mode: 'exercise',
    county: '003',
    coordinator: 'county-team',
    organization: 'transport-one',
    gap: 'transport_agreement',
    status: 'in_review',
    due_at: '2026-10-29T11:59:00Z',
    incident_ref: '',
    evidence_ref: 'EVIDENCE-001',
    events: [],
  }
  expect(readinessOverdue(task, now)).toBe(true)
  expect(readinessOverdue({ ...task, status: 'closed' }, now)).toBe(false)
})
