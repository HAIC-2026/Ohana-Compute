import { expect, test } from '@playwright/test'
import { parseLifecycleEvidence } from '../src/lib/lifecycle-evidence'
import {
  currentEventTrigger,
  parseEventTriggerSnapshotJSON,
} from '../src/lib/event-triggers'
import {
  nwsEligibility,
  nwsProductValidity,
  retrievalState,
  validNWSProduct,
} from '../src/lib/nws-product'
import {
  nwsProduct,
  weatherLegacySnapshot,
  weatherSnapshot,
  weatherTime,
} from './fixtures/nws-product'

const now = Date.parse(weatherTime)

test('lifecycle projection retains source product provenance rather than only a title', () => {
  const snapshot = weatherSnapshot()
  const trigger = snapshot.event_triggers.data!.triggers[0]
  expect(
    parseLifecycleEvidence(snapshot).event_triggers.data!.triggers[0],
  ).toEqual(trigger)
  expect(
    new Set(
      ['sent', 'effective', 'onset', 'expires', 'ends'].map(
        (key) => trigger.nws_product![key as 'sent'],
      ),
    ).size,
  ).toBe(5)
  const nullable = nwsProduct()
  nullable.onset = null
  nullable.ends = null
  const lifecycleNullable = {
    ...nullable,
    applicability_reason: 'no_polygon' as const,
    applicability_basis: 'none' as const,
  }
  expect(
    parseLifecycleEvidence(weatherSnapshot(nullable)).event_triggers.data!
      .triggers[0].nws_product,
  ).toEqual(lifecycleNullable)
})

test('wall-time product expiry is independent of retrieval deadlines, checks and practice time', () => {
  const product = nwsProduct()
  const retrieval = weatherSnapshot().event_triggers.data!.source_states![0]
  expect(nwsProductValidity(product, now)).toBe('current')
  expect(nwsProductValidity(product, now + 120_000)).toBe('expired')
  expect(retrievalState(retrieval, now + 120_000)).toBe('fresh')
  const longProduct = { ...product, expires: '2026-10-30T19:00:00Z' }
  expect(nwsProductValidity(longProduct, now + 300_000)).toBe('current')
  expect(retrievalState(retrieval, now + 300_000)).toBe('stale')
  expect(
    retrievalState({ ...retrieval, retrieved_at: '2026-10-30T18:01:00Z' }, now),
  ).toBe('unknown')
  expect(
    nwsProductValidity({ ...product, effective: '2026-10-30T18:01:00Z' }, now),
  ).toBe('not_yet_effective')
  // Onset and ends are facts, not substitutes for product expiry.
  expect(
    nwsProductValidity(
      { ...product, ends: '2026-10-30T17:00:00Z', onset: null },
      now,
    ),
  ).toBe('current')
  for (const field of ['sent', 'effective', 'expires'] as const) {
    for (const invalid of [
      null,
      'tomorrow',
      '2026-02-31T12:00:00Z',
      '2026-10-30T18:00:00+25:00',
    ]) {
      expect(
        nwsProductValidity({ ...product, [field]: invalid }, now),
        `${field}=${invalid}`,
      ).toBe('unknown')
    }
  }
})

test('actual public Alert/Update eligibility is never conferred by warning titles or future expiry', () => {
  const product = nwsProduct()
  for (const message_type of ['Alert', 'Update'])
    expect(nwsEligibility({ ...product, message_type })).toBe('eligible')
  for (const status of ['Test', 'Exercise', 'Draft', 'System'])
    expect(nwsEligibility({ ...product, status })).toBe('non_actual')
  for (const message_type of ['Cancel', 'Ack', 'Error'])
    expect(nwsEligibility({ ...product, message_type })).not.toBe('eligible')
  for (const field of ['status', 'scope', 'message_type', 'id', 'url'] as const)
    expect(nwsEligibility({ ...product, [field]: null })).toBe('unknown')
  expect(nwsEligibility({ ...product, scope: 'Private' })).toBe('non_public')
  const trigger = weatherLegacySnapshot().triggers[0]
  expect(currentEventTrigger(trigger, now).lifecycle).toBe('active')
  expect(currentEventTrigger(trigger, now + 120_000).planning_state).toBe(
    'unavailable',
  )
  for (const message_type of ['Cancel', 'Ack', 'Error'])
    expect(
      currentEventTrigger(
        { ...trigger, nws_product: { ...product, message_type } },
        now,
      ).lifecycle,
    ).not.toBe('active')
  expect(
    currentEventTrigger({ ...trigger, nws_product: undefined }, now).lifecycle,
  ).toBe('unavailable')
  expect(currentEventTrigger(trigger, now, true).lifecycle).toBe('stale')
})

for (const retrieval of ['unavailable', 'stale'] as const) {
  test(`retained current product wording separates ${retrieval} retrieval from unknown applicability`, () => {
    const snapshot = weatherLegacySnapshot({
      ...nwsProduct(),
      expires: '2026-10-30T19:00:00Z',
    })
    const parsed = parseEventTriggerSnapshotJSON(JSON.stringify(snapshot))
    const trigger = currentEventTrigger(
      parsed.triggers[0],
      retrieval === 'stale' ? now + 300_000 : now,
      retrieval === 'unavailable',
    )
    expect(trigger.lifecycle).toBe('stale')
    expect(trigger.planning_state).toBe('unavailable')
    expect(trigger.planning_consequence).toContain(
      'Retained NWS product validity: current.',
    )
    expect(trigger.planning_consequence).toContain(`Retrieval: ${retrieval}.`)
    expect(trigger.planning_consequence).toContain(
      'Planning-location applicability: unknown.',
    )
    expect(trigger.planning_consequence).not.toMatch(
      /Not current|Not a current warning for this location/i,
    )
    expect(trigger.nws_product).toEqual(snapshot.triggers[0].nws_product)
    expect(trigger.provenance).toEqual(snapshot.triggers[0].provenance)
    expect(parsed).toEqual(snapshot)
  })
}

test('retained expired product wording is product-specific, never a negative local-warning claim', () => {
  const parsed = parseEventTriggerSnapshotJSON(
    JSON.stringify(weatherLegacySnapshot()),
  )
  for (const unavailable of [false, true]) {
    const trigger = currentEventTrigger(
      parsed.triggers[0],
      now + 120_000,
      unavailable,
    )
    expect(trigger.lifecycle).toBe('expired')
    expect(trigger.planning_state).toBe('unavailable')
    expect(trigger.planning_consequence).toContain(
      'Retained NWS product validity: expired.',
    )
    expect(trigger.planning_consequence).toContain(
      `Retrieval: ${unavailable ? 'unavailable' : 'fresh'}.`,
    )
    expect(trigger.planning_consequence).toContain(
      'Planning-location applicability: unknown.',
    )
    expect(trigger.planning_consequence).toContain('this is not an all-clear')
    expect(trigger.planning_consequence).not.toContain(
      'Not a current warning for this location',
    )
    expect(trigger.provenance).toEqual(parsed.triggers[0].provenance)
  }
})

test('ordered references, same-ID changes, query scope and unknown geography survive projection', () => {
  const product = nwsProduct()
  const parsed = parseLifecycleEvidence(weatherSnapshot(product)).event_triggers
    .data!.triggers[0].nws_product!
  expect(parsed.references?.map((row) => row.identifier)).toEqual([
    'previous-b',
    'previous-a',
  ])
  const changed = {
    ...product,
    headline: 'Revised facts',
    message_type: 'Cancel',
    relationship: 'cancel' as const,
    eligibility: 'cancellation' as const,
  }
  const lifecycleChanged = {
    ...changed,
    applicability_reason: 'no_polygon' as const,
    applicability_basis: 'none' as const,
  }
  expect(
    parseLifecycleEvidence(weatherSnapshot(changed)).event_triggers.data!
      .triggers[0].nws_product,
  ).toEqual(lifecycleChanged)
  expect(changed.id).toBe(parsed.id)
  expect(parsed.query_scope.coverage).toBe('statewide')
  expect(parsed.area_desc).toBe(product.area_desc)
  expect(parsed.applicability).toBe('unknown')
  expect(parsed.geometry.shape).toBeNull()
  expect(
    validNWSProduct({
      ...product,
      geometry: { status: 'invalid', type: 'Polygon', shape: null },
    }),
  ).toBe(true)
})

test('runtime validation rejects malformed nested facts, coerced enums, and unbounded geometry', () => {
  const product = nwsProduct()
  const invalidProducts: unknown[] = [
    { ...product, applicability: 'inside' },
    { ...product, references: [{ identifier: 'incomplete' }] },
    { ...product, sent: false },
    { ...product, expires: 'tomorrow' },
    { ...product, eligibility: 'non_actual' },
    { ...product, relationship: 'cancel' },
    {
      ...product,
      affected_zones: [
        {
          url: 'https://api.weather.gov/zones/forecast/HIZ001',
          id: 'HIZ002',
          type: 'forecast',
        },
      ],
    },
    { ...product, geocode: { ugc: ['bad'], same: null } },
    { ...product, area_desc: 'x'.repeat(2049) },
    {
      ...product,
      references: Array.from({ length: 65 }, () => product.references![0]),
    },
    { ...product, extra: true },
    { ...product, url: 'javascript:alert(1)' },
    {
      ...product,
      geometry: {
        status: 'valid',
        type: 'Polygon',
        shape: {
          type: 'Polygon',
          coordinates: [
            [
              [-157, 21],
              [-156, 21],
              [-156, 22],
              [-156, 23],
            ],
          ],
        },
      },
    },
    {
      ...product,
      geometry: {
        status: 'valid',
        type: 'Polygon',
        shape: {
          type: 'Polygon',
          coordinates: [
            [
              [181, 21],
              [181, 21],
              [181, 21],
              [181, 21],
            ],
          ],
        },
      },
    },
  ]
  for (const field of [
    'status',
    'message_type',
    'scope',
    'eligibility',
    'validity',
    'relationship',
  ] as const) {
    for (const value of [
      [product[field]],
      [[product[field]]],
      { value: product[field] },
      false,
      0,
    ])
      invalidProducts.push({ ...product, [field]: value })
  }
  for (const malformed of invalidProducts) {
    expect(validNWSProduct(malformed)).toBe(false)
    const snapshot = weatherSnapshot()
    Object.assign(snapshot.event_triggers.data!.triggers[0], {
      nws_product: malformed,
    })

    expect(() => parseLifecycleEvidence(snapshot)).toThrow(/Malformed/)
    const legacy = weatherLegacySnapshot()
    Object.assign(legacy.triggers[0], { nws_product: malformed })
    expect(() => parseEventTriggerSnapshotJSON(JSON.stringify(legacy))).toThrow(
      /Malformed/,
    )
  }
  const polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [-157, 21],
        [-156, 21],
        [-156, 22],
        [-157, 21],
      ],
    ],
  }
  const sourceInvalidTime = {
    ...product,
    sent: 'tomorrow',
    validity: 'unknown' as const,
  }
  expect(
    parseLifecycleEvidence(weatherSnapshot(sourceInvalidTime)).event_triggers
      .data!.triggers[0].nws_product?.sent,
  ).toBe('tomorrow')
  expect(() =>
    parseLifecycleEvidence(
      weatherSnapshot({
        ...product,
        expires: '2026-10-30T17:59:00Z',
      }),
    ),
  ).toThrow(/Malformed/)
  expect(
    validNWSProduct({
      ...product,
      geometry: { status: 'valid', type: 'Polygon', shape: polygon },
    }),
  ).toBe(true)
  expect(
    validNWSProduct({
      ...product,
      geometry: {
        status: 'valid',
        type: 'Polygon',
        shape: {
          ...polygon,
          coordinates: [Array.from({ length: 513 }, () => [-157, 21])],
        },
      },
    }),
  ).toBe(false)
})

test('lifecycle applicability reasons agree with retained geometry status', () => {
  const product = nwsProduct()
  const polygon = {
    status: 'valid' as const,
    type: 'Polygon',
    shape: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    },
  }
  expect(() =>
    parseLifecycleEvidence(
      weatherSnapshot({
        ...product,
        geometry: polygon,
        applicability: 'unknown',
        applicability_reason: 'no_polygon',
        applicability_basis: 'inline_geometry',
      }),
    ),
  ).toThrow(/Malformed/)
  expect(
    parseLifecycleEvidence(
      weatherSnapshot({
        ...product,
        geometry: polygon,
        applicability: 'unknown',
        applicability_reason: 'invalid_topology',
        applicability_basis: 'inline_geometry',
      }),
    ).event_triggers.data!.triggers[0].nws_product?.applicability_reason,
  ).toBe('invalid_topology')
})
