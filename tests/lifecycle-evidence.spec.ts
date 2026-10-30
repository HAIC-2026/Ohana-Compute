import { expect, test } from '@playwright/test'

import {
  evidenceFeedState,
  parseLifecycleEvidence,
  parseLifecycleEvidenceJSON,
  sourceReading,
} from '../src/lib/lifecycle-evidence'
import {
  sourceObservationState,
  sourceRecheckResult,
  sourceRetrievalState,
  validSourceClaim,
  validSourceReading,
} from '../src/lib/source-evidence'
import { contentDigest } from '../src/lib/record-digest'
import {
  displayedSource,
  sourceClaim,
  sourceSnapshot,
  sourceTestTime,
} from './fixtures/lifecycle-source'

const now = Date.parse(sourceTestTime)

test('real-source age uses wall time, never practice time or successful checks', () => {
  const reading = displayedSource()
  expect(sourceObservationState(reading, now)).toBe('unknown')
  expect(sourceRetrievalState(reading.context, now)).toBe('fresh')
  expect(sourceObservationState(reading, now + 300_000)).toBe('stale')
  expect(
    sourceObservationState({ ...reading, transport: 'unavailable' }, now),
  ).toBe('unavailable')
  expect(
    sourceObservationState(
      { ...reading, context: { ...reading.context!, retrieved_at: null } },
      now,
    ),
  ).toBe('unknown')
  const dated = sourceClaim()
  dated.source_updated_at = sourceTestTime
  dated.source_expires_at = '2026-10-30T16:01:00Z'
  const { content_digest: _digest, ...contents } = dated
  dated.content_digest = contentDigest(contents)
  expect(sourceObservationState(displayedSource(dated), now)).toBe('fresh')
  expect(sourceObservationState(displayedSource(dated), now + 60_000)).toBe(
    'stale',
  )
  expect(sourceObservationState(displayedSource(dated), now - 60_000)).toBe(
    'unknown',
  )
})

test('semantic source identity ignores retrieval and snapshot churn, not fact changes', () => {
  const accepted = sourceClaim()
  const churn = displayedSource()
  churn.snapshotId = 'snapshot-new-check'
  churn.generatedAt = '2026-10-30T16:01:00Z'
  churn.checkedAt = churn.generatedAt
  churn.context!.retrieved_at = churn.generatedAt
  churn.context!.fresh_until = '2026-10-30T16:06:00Z'
  expect(sourceRecheckResult(accepted, churn, now + 60_000)).toBe('unchanged')
  expect(
    sourceRecheckResult(accepted, displayedSource(sourceClaim('CLOSED')), now),
  ).toBe('changed')
  expect(sourceRecheckResult(accepted, displayedSource(null), now)).toBe(
    'not-returned',
  )
  expect(
    sourceRecheckResult(
      accepted,
      { ...churn, context: { ...churn.context!, coverage: 'partial' } },
      now + 60_000,
    ),
  ).toBe('source-unavailable')
  expect(
    sourceRecheckResult(accepted, { ...churn, transport: 'unavailable' }, now),
  ).toBe('source-unavailable')
  expect(sourceRecheckResult(accepted, displayedSource(), now + 300_000)).toBe(
    'source-unavailable',
  )
})

test('lifecycle evidence validates item facts and malformed boundaries before caching', () => {
  const snapshot = sourceSnapshot()
  expect(parseLifecycleEvidence(snapshot)).toEqual(snapshot)
  expect(validSourceClaim(sourceClaim())).toBe(true)
  const zero = sourceClaim()
  zero.facts.reported_capacity = 0
  const { content_digest: _digest, ...contents } = zero
  zero.content_digest = contentDigest(contents)
  expect(validSourceClaim(zero)).toBe(true)
  for (const change of [
    { shelter_context: null },
    { schema_version: 'wrong' },
    { generated_at: 'yesterday' },
    { generated_at: '2026-02-31T16:00:00Z' },
    { event_triggers: { ...snapshot.event_triggers, unavailable_count: -1 } },
    {
      operational_status: {
        ...snapshot.operational_status,
        data: { ...snapshot.operational_status.data, domains: null },
      },
    },
    { shelter_context: { ...snapshot.shelter_context, extra: true } },
    {
      shelter_context: {
        ...snapshot.shelter_context,
        items: [
          snapshot.shelter_context.items[0],
          snapshot.shelter_context.items[0],
        ],
      },
    },
    {
      shelter_context: {
        ...snapshot.shelter_context,
        items: [{ ...sourceClaim(), name: 'tampered' }],
      },
    },
    {
      shelter_context: {
        ...snapshot.shelter_context,
        items: [{ ...sourceClaim(), derivation_version: 'future' }],
      },
    },
    {
      shelter_context: {
        ...snapshot.shelter_context,
        items: [{ ...sourceClaim(), authority: 'x'.repeat(257) }],
      },
    },
    {
      shelter_context: {
        ...snapshot.shelter_context,
        items: Array.from({ length: 21 }, (_, index) =>
          sourceClaim('OPEN', `id-${index}`),
        ),
      },
    },
  ])
    expect(() => parseLifecycleEvidence({ ...snapshot, ...change })).toThrow(
      /Malformed/,
    )
  expect(() => parseLifecycleEvidence(null)).toThrow(/Malformed/)
  expect(() =>
    parseLifecycleEvidenceJSON(
      JSON.stringify(snapshot).replace(
        '"snapshot_id":"snapshot-source-a"',
        '"snapshot_id":"snapshot-source-a","snapshot_id":"snapshot-source-a"',
      ),
    ),
  ).toThrow(/Duplicate/)
  expect(() =>
    parseLifecycleEvidenceJSON(' '.repeat(2 * 1024 * 1024) + '{}'),
  ).toThrow(/2 MiB/)
  expect(() => parseLifecycleEvidenceJSON('{')).toThrow()
})

test('valid empty is retained, partial/unavailable and expired 304 cannot imply fresh', () => {
  const snapshot = sourceSnapshot()
  snapshot.shelter_context.items = []
  expect(parseLifecycleEvidence(snapshot).shelter_context.items).toEqual([])
  const check = {
    snapshot,
    error: null,
    checkedAt: sourceTestTime,
    lastShelterSnapshot: snapshot,
  }
  expect(evidenceFeedState(check, 'event_triggers', now)).toBe('fresh')
  expect(evidenceFeedState(check, 'operational_status', now)).toBe('unknown')
  expect(
    evidenceFeedState(
      { ...check, checkedAt: '2026-10-30T16:10:00Z' },
      'event_triggers',
      now + 600_000,
    ),
  ).toBe('stale')
  expect(
    evidenceFeedState({ ...check, error: 'Offline' }, 'event_triggers', now),
  ).toBe('unavailable')
  const unavailable = sourceSnapshot()
  unavailable.shelter_context = {
    ...unavailable.shelter_context,
    state: 'unavailable',
    coverage: 'unavailable',
    items: [],
  }
  const fallback = sourceReading(
    { ...check, snapshot: unavailable, lastShelterSnapshot: sourceSnapshot() },
    'shelter-a',
  )
  expect(fallback.claim).toEqual(sourceClaim())
  expect(fallback.transport).toBe('unavailable')
  expect(sourceObservationState(fallback, now)).toBe('unavailable')
})

test('non-string enums are rejected at every lifecycle evidence JSON boundary', () => {
  const snapshot = sourceSnapshot()
  snapshot.event_triggers.data!.source_states = [
    {
      id: 'fixture-source',
      status: 'fresh',
      retrieved_at: sourceTestTime,
      fresh_until: '2026-10-30T16:05:00Z',
    },
  ]
  const fields: Array<[Record<string, unknown>, string, string]> = [
    [snapshot.shelter_context, 'coverage', 'partial'],
    [snapshot.shelter_context, 'state', 'stale'],
    [snapshot, 'status', 'partial'],
    [snapshot.event_triggers, 'state', 'stale'],
    [snapshot.event_triggers, 'status', 'partial'],
    [snapshot.operational_status, 'state', 'stale'],
    [snapshot.operational_status, 'status', 'partial'],
    [snapshot.event_triggers.data!, 'status', 'partial'],
    [snapshot.event_triggers.data!.source_states[0], 'status', 'stale'],
    [snapshot.operational_status.data!, 'status', 'unavailable'],
    [snapshot.operational_status.data!.domains[0], 'status', 'unavailable'],
  ]
  for (const [target, field, member] of fields) {
    const original = target[field]
    for (const invalid of [
      [member],
      [[member]],
      { value: member },
      0,
      null,
      false,
    ]) {
      target[field] = invalid
      expect(
        () => parseLifecycleEvidence(snapshot),
        `${field}: ${JSON.stringify(invalid)}`,
      ).toThrow(/Malformed/)
      expect(() =>
        parseLifecycleEvidenceJSON(JSON.stringify(snapshot)),
      ).toThrow(/Malformed/)
    }
    target[field] = original
  }
  expect(parseLifecycleEvidence(snapshot)).toEqual(snapshot)
})

test('non-string transport and source enums cannot validate a source reading', () => {
  const reading = displayedSource(null)
  const fields: Array<[Record<string, unknown>, string, string]> = [
    [reading, 'transport', 'unavailable'],
    [reading.context!, 'state', 'stale'],
    [reading.context!, 'coverage', 'partial'],
  ]
  for (const [target, field, member] of fields) {
    const original = target[field]
    for (const invalid of [
      [member],
      [[member]],
      { value: member },
      0,
      null,
      false,
    ]) {
      target[field] = invalid
      expect(
        validSourceReading(reading),
        `${field}: ${JSON.stringify(invalid)}`,
      ).toBe(false)
    }
    target[field] = original
  }
  expect(validSourceReading(reading)).toBe(true)
})
