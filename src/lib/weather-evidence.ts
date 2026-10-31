import { contentDigest } from './record-digest'
import { nwsProductValidity, validNWSProduct } from './nws-product'
import type { NWSProduct, NWSReference, NWSZoneEvidence } from './nws-product'
import {
  boundedText,
  exactObject,
  stringIn,
  validSourceTime,
} from './source-evidence'

export const weatherProductDigestVersion = 'nws-product-semantic.v1' as const
export const weatherEvaluationDigestVersion =
  'nws-planning-evaluation.v1' as const
export const weatherQueryScope = 'nws-hi-active-alerts' as const
export const maxWeatherAcceptances = 4
export const maxWeatherRechecks = 8
export const maxWeatherListItems = 16
export const maxWeatherRecordBytes = 12 * 1024
export const maxWeatherRecordsBytes = 40 * 1024

export type NWSQueryReading = {
  snapshotId: string | null
  generatedAt: string | null
  checkedAt: string | null
  transport: 'ok' | 'unavailable'
  queryScope: typeof weatherQueryScope
  retrievalState: 'fresh' | 'stale' | 'unknown' | 'unavailable'
  coverage: 'complete' | 'partial' | 'unavailable'
  retrievedAt: string | null
  freshUntil: string | null
  point: [string, string] | null
  algorithmVersion: 'rfc7946-planar-rational-v1' | null
  products: NWSProduct[]
}

export type ReviewedNWSProduct = {
  reviewedAt: string
  reading: NWSQueryReading
  product: NWSProduct
}

type WeatherReference = NWSReference & { sourceOrder: number }
type WeatherZone = NonNullable<NWSProduct['affected_zones']>[number]

export type WeatherProductRevision = {
  id: string
  url: string
  sender: string
  senderName: string | null
  sent: string
  effective: string | null
  onset: string | null
  expires: string | null
  ends: string | null
  status: string | null
  messageType: string | null
  scope: string | null
  event: string | null
  headline: string | null
  severity: string | null
  certainty: string | null
  urgency: string | null
  response: string | null
  areaDesc: string | null
  references: WeatherReference[]
  affectedZones: WeatherZone[]
  geocode: { ugc: string[]; same: string[] }
  geometry: {
    status: NWSProduct['geometry']['status']
    type: string | null
    shape: NWSProduct['geometry']['shape']
    contentDigest: string | null
  }
  eligibility: NWSProduct['eligibility']
  relationship: NWSProduct['relationship']
}

export type WeatherEvaluation = {
  point: [string, string]
  algorithmVersion: 'rfc7946-planar-rational-v1'
  applicability: 'inside' | 'outside' | 'unknown'
  reason: NWSProduct['applicability_reason']
  basis: 'inline_geometry' | 'affected_zones' | 'none'
  coverage: NWSZoneEvidence['coverage'] | null
  zones: NWSZoneEvidence['zones']
}

export type AcceptedWeatherEvidence = {
  id: string
  cycle: number
  acceptedAt: string
  acceptedBy: 'Facilitator'
  phase: 'before'
  action: 'facilitator-selected planning context'
  authorityEffect: 'none'
  snapshotId: string
  queryScope: typeof weatherQueryScope
  productDigestVersion: typeof weatherProductDigestVersion
  productDigest: string
  evaluationDigestVersion: typeof weatherEvaluationDigestVersion
  evaluationDigest: string
  product: WeatherProductRevision
  evaluation: WeatherEvaluation
  observation: {
    generatedAt: string
    checkedAt: string
    retrievalState: 'fresh'
    retrievedAt: string
    freshUntil: string
    coverage: 'complete'
    validity: NWSProduct['validity']
  }
  limitations: string[]
  recordDigest: string
}

export type WeatherRecheckResult =
  | 'unchanged'
  | 'changed'
  | 'not-returned'
  | 'source-unavailable'
  | 'superseded'
  | 'cancelled'
  | 'expired'
  | 'ambiguous'

export type WeatherRecheck = {
  id: string
  acceptedId: string
  acceptedDigest: string
  owner:
    | 'Facilitator'
    | 'Planning lead'
    | 'Mass-care lead'
    | 'Outreach partner'
    | 'Recovery lead'
  horizon: 'next shift' | 'next day' | 'next exercise'
  checkedAt: string
  result: WeatherRecheckResult
  retrievalState: NWSQueryReading['retrievalState']
  validityAtCheck: NWSProduct['validity']
  observed: null | {
    productDigest: string
    evaluationDigest: string
    product: WeatherProductRevision
    evaluation: WeatherEvaluation
  }
  candidates: {
    count: number
    digest: string | null
    complete: boolean
    identities: Array<{
      id: string
      url: string
      relationship: NWSProduct['relationship']
      productDigest: string
      evaluationDigest: string
    }>
  }
  recordDigest: string
}

export type WeatherCycleArchive = {
  cycle: number
  accepted: AcceptedWeatherEvidence[]
  rechecks: WeatherRecheck[]
  digest: string
}

const limitations = [
  'Planning context only; acceptance does not create authority, criteria, an order, dispatch, impact, timing margin, passability, restoration, containment, or all-clear.',
  'Statewide query membership and reported geography do not establish planning-location impact.',
  'Inside, outside, and unknown are source-applicability classifications, not safety claims.',
  'Official zone boundaries are area-level and do not establish individual-address precision.',
  'Checksums detect inconsistent content; they are not signatures or proof of authenticity.',
]

function sortedUnique(values: string[], label: string) {
  const sorted = [...values].sort()
  if (new Set(sorted).size !== sorted.length)
    throw new Error(`Weather ${label} contains duplicate identities.`)
  if (sorted.length > maxWeatherListItems)
    throw new Error(`Weather ${label} exceeds the bounded record limit.`)
  return sorted
}

function zoneIdentity(zone: WeatherZone) {
  return `${zone.type}:${zone.id}:${zone.url}`
}

function projectedProduct(product: NWSProduct): WeatherProductRevision {
  if (!product.id || !product.url || !product.sender || !product.sent)
    throw new Error(
      'Weather acceptance requires product ID, source link, sender, and sent time.',
    )
  const references = (product.references ?? []).map(
    (reference, sourceOrder) => ({
      ...reference,
      sourceOrder,
    }),
  )
  if (references.length > maxWeatherListItems)
    throw new Error('Weather references exceed the bounded record limit.')
  const affectedZones = [...(product.affected_zones ?? [])].sort((a, b) =>
    zoneIdentity(a).localeCompare(zoneIdentity(b)),
  )
  if (
    affectedZones.length > maxWeatherListItems ||
    new Set(affectedZones.map(zoneIdentity)).size !== affectedZones.length
  )
    throw new Error(
      'Weather affected zones exceed the bounded record limit or contain duplicates.',
    )
  return {
    id: product.id,
    url: product.url,
    sender: product.sender,
    senderName: product.sender_name,
    sent: product.sent,
    effective: product.effective,
    onset: product.onset,
    expires: product.expires,
    ends: product.ends,
    status: product.status,
    messageType: product.message_type,
    scope: product.scope,
    event: product.event,
    headline: product.headline,
    severity: product.severity,
    certainty: product.certainty,
    urgency: product.urgency,
    response: product.response,
    areaDesc: product.area_desc,
    references,
    affectedZones,
    geocode: {
      ugc: sortedUnique(product.geocode.ugc ?? [], 'UGC codes'),
      same: sortedUnique(product.geocode.same ?? [], 'SAME codes'),
    },
    geometry: {
      status: product.geometry.status,
      type: product.geometry.type,
      shape: product.geometry.shape
        ? structuredClone(product.geometry.shape)
        : null,
      contentDigest: product.geometry.shape
        ? contentDigest(product.geometry.shape)
        : null,
    },
    eligibility: product.eligibility,
    relationship: product.relationship,
  }
}

function zoneFresh(row: NWSZoneEvidence['zones'][number], now: number) {
  return (
    row.state === 'fresh' &&
    row.fresh_until !== null &&
    Date.parse(row.fresh_until) > now
  )
}

export function currentNWSApplicability(
  product: NWSProduct,
  now: number,
): {
  result: 'inside' | 'outside' | 'unknown'
  reason: NWSProduct['applicability_reason']
  coverage: NWSZoneEvidence['coverage'] | null
} {
  const evidence = product.zone_evidence
  if (product.applicability_basis !== 'affected_zones' || !evidence)
    return {
      result: product.applicability,
      reason: product.applicability_reason,
      coverage: evidence?.coverage ?? null,
    }
  let inside = false
  let boundary = false
  let incomplete = evidence.coverage !== 'complete'
  let pending = evidence.coverage === 'pending'
  let completeOutside = evidence.coverage === 'complete'
  for (const row of evidence.zones) {
    if (row.state === 'pending') {
      pending = true
      incomplete = true
      completeOutside = false
    } else if (!zoneFresh(row, now)) {
      incomplete = true
      completeOutside = false
    } else if (row.result === 'inside' && row.reason === 'strict_interior') {
      inside = true
      completeOutside = false
    } else if (row.result === 'unknown' && row.reason === 'boundary') {
      boundary = true
      completeOutside = false
    } else if (row.result !== 'outside' || row.reason !== 'strict_exterior') {
      incomplete = true
      completeOutside = false
    }
  }
  if (evidence.result === 'inside' && inside)
    return {
      result: 'inside' as const,
      reason: 'strict_interior' as const,
      coverage: pending
        ? ('pending' as const)
        : incomplete
          ? ('partial' as const)
          : ('complete' as const),
    }
  if (evidence.result === 'outside' && completeOutside)
    return {
      result: 'outside' as const,
      reason: 'strict_exterior' as const,
      coverage: 'complete' as const,
    }
  if (
    evidence.result === 'unknown' &&
    evidence.reason === 'boundary' &&
    !incomplete &&
    !inside &&
    boundary
  )
    return {
      result: 'unknown' as const,
      reason: 'boundary' as const,
      coverage: 'complete' as const,
    }
  return {
    result: 'unknown' as const,
    reason: pending ? ('zone_pending' as const) : ('zone_incomplete' as const),
    coverage: pending ? ('pending' as const) : ('partial' as const),
  }
}

function projectedEvaluation(
  reading: NWSQueryReading,
  product: NWSProduct,
  now: number,
): WeatherEvaluation {
  if (!reading.point || !reading.algorithmVersion)
    throw new Error('Weather acceptance requires an evaluated planning point.')
  const applicability = currentNWSApplicability(product, now)
  const zones = [...(product.zone_evidence?.zones ?? [])].sort((a, b) =>
    `${a.type}:${a.id}:${a.url}`.localeCompare(`${b.type}:${b.id}:${b.url}`),
  )
  if (
    zones.length > maxWeatherListItems ||
    new Set(zones.map((zone) => `${zone.type}:${zone.id}:${zone.url}`)).size !==
      zones.length
  )
    throw new Error(
      'Weather zone evidence exceeds the bounded record limit or contains duplicates.',
    )
  return {
    point: reading.point,
    algorithmVersion: reading.algorithmVersion,
    applicability: applicability.result,
    reason: applicability.reason,
    basis:
      product.applicability_basis ??
      (product.geometry.status === 'absent' ? 'none' : 'inline_geometry'),
    coverage: applicability.coverage,
    zones,
  }
}

function productDigest(product: WeatherProductRevision) {
  return contentDigest({
    version: weatherProductDigestVersion,
    product,
  })
}

function projectedValidity(
  product: WeatherProductRevision,
  now: number,
): NWSProduct['validity'] {
  if (
    !validSourceTime(product.sent) ||
    !validSourceTime(product.effective) ||
    !validSourceTime(product.expires) ||
    !Number.isFinite(now)
  )
    return 'unknown'
  const sent = Date.parse(product.sent)
  const effective = Date.parse(product.effective)
  const expires = Date.parse(product.expires)
  if (sent > now || expires <= sent || expires <= effective) return 'unknown'
  if (now >= expires) return 'expired'
  return now < effective ? 'not_yet_effective' : 'current'
}

function projectedRelationship(
  messageType: string | null,
): NWSProduct['relationship'] {
  switch (messageType) {
    case 'Alert':
      return 'initial'
    case 'Update':
      return 'update'
    case 'Cancel':
      return 'cancel'
    case 'Ack':
      return 'acknowledgement'
    case 'Error':
      return 'error'
    default:
      return 'unknown'
  }
}

function projectedEligibility(
  product: WeatherProductRevision,
): NWSProduct['eligibility'] {
  if (product.status !== 'Actual')
    return ['Test', 'Exercise', 'Draft', 'System'].includes(
      product.status ?? '',
    )
      ? 'non_actual'
      : 'unknown'
  if (product.scope !== 'Public')
    return ['Restricted', 'Private'].includes(product.scope ?? '')
      ? 'non_public'
      : 'unknown'
  if (product.messageType === 'Cancel') return 'cancellation'
  if (['Ack', 'Error'].includes(product.messageType ?? '')) return 'protocol'
  if (
    ['Alert', 'Update'].includes(product.messageType ?? '') &&
    product.id &&
    product.url
  )
    return 'eligible'
  return 'unknown'
}

function storedZoneApplicability(evaluation: WeatherEvaluation, now: number) {
  let inside = false
  let boundary = false
  let incomplete = false
  let pending = false
  let completeOutside = true
  for (const zone of evaluation.zones) {
    if (zone.state === 'pending') {
      pending = true
      incomplete = true
      completeOutside = false
    } else if (!zoneFresh(zone, now)) {
      incomplete = true
      completeOutside = false
    } else if (zone.result === 'inside' && zone.reason === 'strict_interior') {
      inside = true
      completeOutside = false
    } else if (zone.result === 'unknown' && zone.reason === 'boundary') {
      boundary = true
      completeOutside = false
    } else if (zone.result !== 'outside' || zone.reason !== 'strict_exterior') {
      incomplete = true
      completeOutside = false
    }
  }
  if (inside)
    return {
      applicability: 'inside' as const,
      reason: 'strict_interior' as const,
      coverage: pending
        ? ('pending' as const)
        : incomplete
          ? 'partial'
          : 'complete',
    }
  if (completeOutside)
    return {
      applicability: 'outside' as const,
      reason: 'strict_exterior' as const,
      coverage: 'complete' as const,
    }
  if (!incomplete && boundary)
    return {
      applicability: 'unknown' as const,
      reason: 'boundary' as const,
      coverage: 'complete' as const,
    }
  return {
    applicability: 'unknown' as const,
    reason: pending ? ('zone_pending' as const) : ('zone_incomplete' as const),
    coverage: pending ? ('pending' as const) : ('partial' as const),
  }
}

function validStoredEvaluation(
  product: WeatherProductRevision,
  evaluation: WeatherEvaluation,
  evaluatedAt: number,
) {
  if (
    product.relationship !== projectedRelationship(product.messageType) ||
    product.eligibility !== projectedEligibility(product)
  )
    return false
  if (evaluation.basis === 'affected_zones') {
    const affected = product.affectedZones.map(zoneIdentity)
    const evaluated = evaluation.zones.map((zone) =>
      zoneIdentity({ url: zone.url, id: zone.id, type: zone.type }),
    )
    const expected = storedZoneApplicability(evaluation, evaluatedAt)
    return (
      affected.length > 0 &&
      affected.length === evaluated.length &&
      affected.every((identity, index) => identity === evaluated[index]) &&
      evaluation.applicability === expected.applicability &&
      evaluation.reason === expected.reason &&
      evaluation.coverage === expected.coverage
    )
  }
  if (evaluation.zones.length || evaluation.coverage !== null) return false
  if (evaluation.basis === 'none')
    return (
      product.geometry.status === 'absent' &&
      evaluation.applicability === 'unknown' &&
      evaluation.reason === 'no_polygon'
    )
  const retainedApplicability =
    product.geometry.shape === null
      ? null
      : classifyRetainedGeometry(product.geometry.shape, evaluation.point)
  switch (evaluation.reason) {
    case 'strict_interior':
      return (
        evaluation.applicability === 'inside' &&
        product.geometry.status === 'valid' &&
        retainedApplicability === 'inside'
      )
    case 'strict_exterior':
      return (
        evaluation.applicability === 'outside' &&
        product.geometry.status === 'valid' &&
        retainedApplicability === 'outside'
      )
    case 'boundary':
      return (
        evaluation.applicability === 'unknown' &&
        product.geometry.status === 'valid' &&
        retainedApplicability === 'boundary'
      )
    case 'unsupported':
      return (
        evaluation.applicability === 'unknown' &&
        ['unsupported', 'too_large'].includes(product.geometry.status)
      )
    case 'invalid_topology':
      return (
        evaluation.applicability === 'unknown' &&
        ['valid', 'invalid'].includes(product.geometry.status)
      )
    case 'bad_point':
      return (
        evaluation.applicability === 'unknown' &&
        product.geometry.status !== 'absent'
      )
    default:
      return false
  }
}

type Rational = { numerator: bigint; denominator: bigint }
type RationalPoint = [Rational, Rational]

function rational(value: string | number): Rational {
  const match = String(value).match(/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i)
  if (!match) throw new Error('Invalid retained weather coordinate.')
  const fraction = match[3] || ''
  const exponent = Number(match[4] || 0)
  let numerator = BigInt(`${match[1]}${match[2]}${fraction}`)
  const scale = fraction.length - exponent
  let denominator = 1n
  if (scale >= 0) denominator = 10n ** BigInt(scale)
  else numerator *= 10n ** BigInt(-scale)
  return { numerator, denominator }
}

function add(left: Rational, right: Rational): Rational {
  return {
    numerator:
      left.numerator * right.denominator + right.numerator * left.denominator,
    denominator: left.denominator * right.denominator,
  }
}

function subtract(left: Rational, right: Rational): Rational {
  return {
    numerator:
      left.numerator * right.denominator - right.numerator * left.denominator,
    denominator: left.denominator * right.denominator,
  }
}

function multiply(left: Rational, right: Rational): Rational {
  return {
    numerator: left.numerator * right.numerator,
    denominator: left.denominator * right.denominator,
  }
}

function divide(left: Rational, right: Rational): Rational {
  const sign = right.numerator < 0n ? -1n : 1n
  return {
    numerator: left.numerator * right.denominator * sign,
    denominator: left.denominator * right.numerator * sign,
  }
}

function compare(left: Rational, right: Rational) {
  const difference =
    left.numerator * right.denominator - right.numerator * left.denominator
  return difference < 0n ? -1 : difference > 0n ? 1 : 0
}

function rationalPoint(point: number[]): RationalPoint {
  return [rational(point[0]), rational(point[1])]
}

function between(value: Rational, start: Rational, end: Rational) {
  const startComparison = compare(value, start)
  const endComparison = compare(value, end)
  return (
    (startComparison >= 0 && endComparison <= 0) ||
    (startComparison <= 0 && endComparison >= 0)
  )
}

function pointOnSegment(
  point: RationalPoint,
  start: RationalPoint,
  end: RationalPoint,
) {
  const cross = subtract(
    multiply(subtract(point[1], start[1]), subtract(end[0], start[0])),
    multiply(subtract(point[0], start[0]), subtract(end[1], start[1])),
  )
  return (
    cross.numerator === 0n &&
    between(point[0], start[0], end[0]) &&
    between(point[1], start[1], end[1])
  )
}

function classifyRing(point: RationalPoint, ring: number[][]) {
  let inside = false
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index++
  ) {
    const start = rationalPoint(ring[previous])
    const end = rationalPoint(ring[index])
    if (pointOnSegment(point, start, end)) return 'boundary' as const
    if (compare(start[1], point[1]) > 0 !== compare(end[1], point[1]) > 0) {
      const intersection = add(
        start[0],
        divide(
          multiply(subtract(end[0], start[0]), subtract(point[1], start[1])),
          subtract(end[1], start[1]),
        ),
      )
      if (compare(point[0], intersection) < 0) inside = !inside
    }
  }
  return inside ? ('inside' as const) : ('outside' as const)
}

function classifyPolygon(point: RationalPoint, polygon: number[][][]) {
  const exterior = classifyRing(point, polygon[0])
  if (exterior !== 'inside') return exterior
  for (const hole of polygon.slice(1)) {
    const result = classifyRing(point, hole)
    if (result === 'boundary') return result
    if (result === 'inside') return 'outside' as const
  }
  return 'inside' as const
}

function classifyRetainedGeometry(
  shape: NonNullable<NWSProduct['geometry']['shape']>,
  point: [string, string],
) {
  const evaluatedPoint: RationalPoint = [rational(point[0]), rational(point[1])]
  const polygons =
    shape.type === 'Polygon' ? [shape.coordinates] : shape.coordinates
  let inside = false
  for (const polygon of polygons as number[][][][]) {
    const result = classifyPolygon(evaluatedPoint, polygon)
    if (result === 'boundary') return result
    if (result === 'inside') inside = true
  }
  return inside ? ('inside' as const) : ('outside' as const)
}

function evaluationDigest(evaluation: WeatherEvaluation) {
  return contentDigest({
    version: weatherEvaluationDigestVersion,
    point: evaluation.point,
    algorithmVersion: evaluation.algorithmVersion,
    applicability: evaluation.applicability,
    reason: evaluation.reason,
    basis: evaluation.basis,
    coverage: evaluation.coverage,
    zones: evaluation.zones.map((zone) => ({
      url: zone.url,
      id: zone.id,
      type: zone.type,
      source_revision: zone.source_revision,
      effective: zone.effective,
      expires: zone.expires,
      result: zone.result,
      reason: zone.reason,
    })),
  })
}

function qualifiedReading(reading: NWSQueryReading, at: string) {
  return (
    reading.transport === 'ok' &&
    reading.retrievalState === 'fresh' &&
    reading.coverage === 'complete' &&
    reading.snapshotId !== null &&
    reading.generatedAt !== null &&
    reading.checkedAt !== null &&
    reading.retrievedAt !== null &&
    reading.freshUntil !== null &&
    reading.point !== null &&
    reading.algorithmVersion !== null &&
    Date.parse(reading.generatedAt) <= Date.parse(reading.checkedAt) &&
    Date.parse(reading.checkedAt) <= Date.parse(at) &&
    Date.parse(reading.freshUntil) > Date.parse(at)
  )
}

export function createAcceptedWeatherEvidence(
  cycle: number,
  index: number,
  reviewed: ReviewedNWSProduct,
  acceptedAt: string,
): AcceptedWeatherEvidence {
  if (
    !validSourceTime(reviewed.reviewedAt) ||
    !validSourceTime(acceptedAt) ||
    Date.parse(reviewed.reviewedAt) > Date.parse(acceptedAt) ||
    (reviewed.reading.checkedAt !== null &&
      Date.parse(reviewed.reading.checkedAt) >
        Date.parse(reviewed.reviewedAt)) ||
    !validNWSQueryReading(reviewed.reading) ||
    !validNWSProduct(reviewed.product) ||
    !qualifiedReading(reviewed.reading, acceptedAt)
  )
    throw new Error(
      'Accept weather context only from the exact reviewed revision of a fresh complete source check.',
    )
  const matching = reviewed.reading.products.filter(
    (product) =>
      product.id === reviewed.product.id &&
      product.url === reviewed.product.url &&
      product.sender === reviewed.product.sender &&
      product.sent === reviewed.product.sent,
  )
  if (matching.length !== 1)
    throw new Error('The reviewed weather revision is not unique in its query.')
  const product = projectedProduct(reviewed.product)
  const evaluation = projectedEvaluation(
    reviewed.reading,
    reviewed.product,
    Date.parse(acceptedAt),
  )
  const queryProduct = projectedProduct(matching[0])
  const queryEvaluation = projectedEvaluation(
    reviewed.reading,
    matching[0],
    Date.parse(acceptedAt),
  )
  if (
    productDigest(product) !== productDigest(queryProduct) ||
    evaluationDigest(evaluation) !== evaluationDigest(queryEvaluation)
  )
    throw new Error(
      'The reviewed weather revision no longer matches the exact query revision.',
    )
  const contents = {
    id: `WA-${cycle}-${index + 1}`,
    cycle,
    acceptedAt,
    acceptedBy: 'Facilitator' as const,
    phase: 'before' as const,
    action: 'facilitator-selected planning context' as const,
    authorityEffect: 'none' as const,
    snapshotId: reviewed.reading.snapshotId!,
    queryScope: weatherQueryScope,
    productDigestVersion: weatherProductDigestVersion,
    productDigest: productDigest(product),
    evaluationDigestVersion: weatherEvaluationDigestVersion,
    evaluationDigest: evaluationDigest(evaluation),
    product,
    evaluation,
    observation: {
      generatedAt: reviewed.reading.generatedAt!,
      checkedAt: reviewed.reading.checkedAt!,
      retrievalState: 'fresh' as const,
      retrievedAt: reviewed.reading.retrievedAt!,
      freshUntil: reviewed.reading.freshUntil!,
      coverage: 'complete' as const,
      validity: nwsProductValidity(reviewed.product, Date.parse(acceptedAt)),
    },
    limitations,
  }
  const accepted = { ...contents, recordDigest: contentDigest(contents) }
  if (
    new TextEncoder().encode(JSON.stringify(accepted)).byteLength >
    maxWeatherRecordBytes
  )
    throw new Error('Weather acceptance exceeds the per-record byte limit.')
  return accepted
}

function referenceMatches(
  reference: NWSReference,
  accepted: AcceptedWeatherEvidence,
) {
  const identity =
    (reference.identifier !== null || reference.url !== null) &&
    (reference.identifier === null ||
      reference.identifier === accepted.product.id) &&
    (reference.url === null || reference.url === accepted.product.url)
  return (
    identity &&
    (reference.sender === null ||
      reference.sender === accepted.product.sender) &&
    (reference.sent === null || reference.sent === accepted.product.sent)
  )
}

function projectedReferenceMatches(
  reference: WeatherReference,
  accepted: AcceptedWeatherEvidence,
) {
  const identity =
    (reference.identifier !== null || reference.url !== null) &&
    (reference.identifier === null ||
      reference.identifier === accepted.product.id) &&
    (reference.url === null || reference.url === accepted.product.url)
  return (
    identity &&
    (reference.sender === null ||
      reference.sender === accepted.product.sender) &&
    (reference.sent === null || reference.sent === accepted.product.sent)
  )
}

function sameProductIdentity(
  product: WeatherProductRevision,
  accepted: AcceptedWeatherEvidence,
) {
  return (
    product.id === accepted.product.id &&
    product.url === accepted.product.url &&
    product.sender === accepted.product.sender &&
    product.sent === accepted.product.sent
  )
}

function evaluationAvailable(product: NWSProduct, now: number) {
  if (product.applicability_basis !== 'affected_zones') return true
  const applicability = currentNWSApplicability(product, now)
  return !['zone_incomplete', 'zone_pending'].includes(applicability.reason)
}

function observedRevision(
  reading: NWSQueryReading,
  product: NWSProduct,
  checkedAt: string,
) {
  const projected = projectedProduct(product)
  const evaluation = projectedEvaluation(
    reading,
    product,
    Date.parse(checkedAt),
  )
  return {
    productDigest: productDigest(projected),
    evaluationDigest: evaluationDigest(evaluation),
    product: projected,
    evaluation,
  }
}

function distinctObservedRevisions(
  reading: NWSQueryReading,
  products: NWSProduct[],
  checkedAt: string,
) {
  const distinct = new Map<string, NonNullable<WeatherRecheck['observed']>>()
  for (const product of products) {
    const observed = observedRevision(reading, product, checkedAt)
    distinct.set(
      `${observed.productDigest}:${observed.evaluationDigest}`,
      observed,
    )
  }
  return [...distinct.values()]
}

export function createWeatherRecheck(
  cycle: number,
  index: number,
  accepted: AcceptedWeatherEvidence,
  reading: NWSQueryReading,
  checkedAt: string,
  owner: WeatherRecheck['owner'],
  horizon: WeatherRecheck['horizon'],
): WeatherRecheck {
  if (
    !validNWSQueryReading(reading) ||
    !validSourceTime(checkedAt) ||
    reading.checkedAt !== checkedAt ||
    Date.parse(checkedAt) < Date.parse(accepted.acceptedAt)
  )
    throw new Error(
      'Weather recheck requires the accepted revision and an explicit source check.',
    )
  const validityAtCheck = projectedValidity(
    accepted.product,
    Date.parse(checkedAt),
  )
  let result: WeatherRecheckResult = 'source-unavailable'
  let observed: WeatherRecheck['observed'] = null
  let candidates: WeatherRecheck['candidates'] = {
    count: 0,
    digest: null,
    complete: true,
    identities: [],
  }
  if (qualifiedReading(reading, checkedAt)) {
    const exact = reading.products.filter(
      (product) =>
        product.id === accepted.product.id &&
        product.url === accepted.product.url &&
        product.sender === accepted.product.sender &&
        product.sent === accepted.product.sent,
    )
    const exactRevisions = distinctObservedRevisions(reading, exact, checkedAt)
    const lineage = reading.products.filter(
      (product) =>
        ['update', 'cancel'].includes(product.relationship) &&
        (product.references ?? []).some((reference) =>
          referenceMatches(reference, accepted),
        ),
    )
    const lineageRevisions = distinctObservedRevisions(
      reading,
      lineage,
      checkedAt,
    )
    if (exactRevisions.length > 1 || lineageRevisions.length > 1) {
      result = 'ambiguous'
      candidates = candidateSummary([...exactRevisions, ...lineageRevisions])
    } else if (lineageRevisions.length === 1) {
      observed = lineageRevisions[0]
      result =
        observed.product.relationship === 'cancel' ? 'cancelled' : 'superseded'
    } else if (exactRevisions.length === 1) {
      observed = exactRevisions[0]
      result =
        observed.product.relationship === 'cancel'
          ? 'cancelled'
          : observed.productDigest !== accepted.productDigest
            ? 'changed'
            : !evaluationAvailable(exact[0], Date.parse(checkedAt))
              ? 'source-unavailable'
              : observed.evaluationDigest !== accepted.evaluationDigest
                ? 'changed'
                : validityAtCheck === 'expired'
                  ? 'expired'
                  : 'unchanged'
    } else result = 'not-returned'
  }
  const contents = {
    id: `WR-${cycle}-${index + 1}`,
    acceptedId: accepted.id,
    acceptedDigest: accepted.recordDigest,
    owner,
    horizon,
    checkedAt,
    result,
    retrievalState: reading.retrievalState,
    validityAtCheck,
    observed,
    candidates,
  }
  const recheck = { ...contents, recordDigest: contentDigest(contents) }
  if (
    new TextEncoder().encode(JSON.stringify(recheck)).byteLength >
    maxWeatherRecordBytes
  )
    throw new Error('Weather recheck exceeds the per-record byte limit.')
  return recheck
}

function candidateSummary(
  rows: NonNullable<WeatherRecheck['observed']>[],
): WeatherRecheck['candidates'] {
  const identities = [
    ...new Map(
      rows.map((row) => {
        const identity = {
          id: row.product.id,
          url: row.product.url,
          relationship: row.product.relationship,
          productDigest: row.productDigest,
          evaluationDigest: row.evaluationDigest,
        }
        return [candidateIdentityKey(identity), identity] as const
      }),
    ).values(),
  ].sort((a, b) => compareCandidateIdentity(a, b))
  return {
    count: identities.length,
    digest: contentDigest(identities),
    complete: identities.length <= 8,
    identities: identities.slice(0, 8),
  }
}

function candidateIdentityKey(
  identity: WeatherRecheck['candidates']['identities'][number],
) {
  return `${identity.id}:${identity.url}:${identity.productDigest}:${identity.evaluationDigest}`
}

function compareCandidateIdentity(
  left: WeatherRecheck['candidates']['identities'][number],
  right: WeatherRecheck['candidates']['identities'][number],
) {
  const leftKey = candidateIdentityKey(left)
  const rightKey = candidateIdentityKey(right)
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
}

function nullableTime(value: unknown) {
  return value === null || validSourceTime(value)
}

function nullableBoundedText(value: unknown, maximum: number) {
  return value === null || boundedText(value, maximum)
}

function validPlanningPoint(value: unknown): value is [string, string] {
  if (!Array.isArray(value) || value.length !== 2) return false
  return value.every((coordinate, index) => {
    if (
      typeof coordinate !== 'string' ||
      coordinate.length > 64 ||
      !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(coordinate)
    )
      return false
    const numeric = Number(coordinate)
    return (
      Number.isFinite(numeric) &&
      numeric >= (index === 0 ? -180 : -90) &&
      numeric <= (index === 0 ? 180 : 90)
    )
  })
}

function canonicalAPIURL(value: string, prefix: string) {
  try {
    const url = new URL(value)
    return (
      url.origin === 'https://api.weather.gov' &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === '' &&
      url.pathname.startsWith(prefix) &&
      url.pathname.length > prefix.length
    )
  } catch {
    return false
  }
}

function sortedUniqueStrings(value: unknown) {
  return (
    Array.isArray(value) &&
    value.length <= maxWeatherListItems &&
    value.every((item) => boundedText(item, 128)) &&
    value.every((item, index) => index === 0 || value[index - 1] < item)
  )
}

function validWeatherProductRevision(
  value: unknown,
): value is WeatherProductRevision {
  if (
    !exactObject(value, [
      'id',
      'url',
      'sender',
      'senderName',
      'sent',
      'effective',
      'onset',
      'expires',
      'ends',
      'status',
      'messageType',
      'scope',
      'event',
      'headline',
      'severity',
      'certainty',
      'urgency',
      'response',
      'areaDesc',
      'references',
      'affectedZones',
      'geocode',
      'geometry',
      'eligibility',
      'relationship',
    ]) ||
    !boundedText(value.id, 512) ||
    !boundedText(value.url, 512) ||
    !canonicalAPIURL(value.url, '/alerts/') ||
    !boundedText(value.sender, 256) ||
    !nullableBoundedText(value.senderName, 256) ||
    !validSourceTime(value.sent) ||
    ![value.effective, value.onset, value.expires, value.ends].every(
      nullableTime,
    ) ||
    ![
      value.status,
      value.messageType,
      value.scope,
      value.event,
      value.headline,
      value.severity,
      value.certainty,
      value.urgency,
      value.response,
      value.areaDesc,
    ].every((item) => nullableBoundedText(item, 2048)) ||
    !Array.isArray(value.references) ||
    value.references.length > maxWeatherListItems ||
    !value.references.every(
      (reference, index) =>
        exactObject(reference, [
          'url',
          'identifier',
          'sender',
          'sent',
          'sourceOrder',
        ]) &&
        reference.sourceOrder === index &&
        nullableBoundedText(reference.url, 512) &&
        (reference.url === null ||
          canonicalAPIURL(reference.url, '/alerts/')) &&
        nullableBoundedText(reference.identifier, 512) &&
        nullableBoundedText(reference.sender, 256) &&
        nullableTime(reference.sent),
    ) ||
    !Array.isArray(value.affectedZones) ||
    value.affectedZones.length > maxWeatherListItems ||
    !value.affectedZones.every(
      (zone) =>
        exactObject(zone, ['url', 'id', 'type']) &&
        zone.url ===
          `https://api.weather.gov/zones/${String(zone.type)}/${String(zone.id)}` &&
        boundedText(zone.id, 16) &&
        stringIn(zone.type, ['forecast', 'county', 'fire']),
    ) ||
    !exactObject(value.geocode, ['ugc', 'same']) ||
    !sortedUniqueStrings(value.geocode.ugc) ||
    !sortedUniqueStrings(value.geocode.same) ||
    !exactObject(value.geometry, [
      'status',
      'type',
      'shape',
      'contentDigest',
    ]) ||
    !stringIn(value.geometry.status, [
      'absent',
      'valid',
      'invalid',
      'unsupported',
      'too_large',
    ]) ||
    !nullableBoundedText(value.geometry.type, 32) ||
    !validRetainedGeometry(
      value.geometry as WeatherProductRevision['geometry'],
    ) ||
    !(
      value.geometry.contentDigest === null ||
      (typeof value.geometry.contentDigest === 'string' &&
        /^fnv1a-dual-v1:[0-9a-f]{16}$/.test(value.geometry.contentDigest))
    ) ||
    !stringIn(value.eligibility, [
      'eligible',
      'non_actual',
      'non_public',
      'cancellation',
      'protocol',
      'unknown',
    ]) ||
    !stringIn(value.relationship, [
      'initial',
      'update',
      'cancel',
      'acknowledgement',
      'error',
      'unknown',
    ])
  )
    return false
  const zoneIdentities = value.affectedZones.map(zoneIdentity)
  return (
    new Set(zoneIdentities).size === zoneIdentities.length &&
    zoneIdentities.every(
      (identity, index) => index === 0 || zoneIdentities[index - 1] < identity,
    )
  )
}

function validRetainedGeometry(geometry: WeatherProductRevision['geometry']) {
  if (geometry.status !== 'valid')
    return geometry.shape === null && geometry.contentDigest === null
  if (
    geometry.shape === null ||
    geometry.type !== geometry.shape.type ||
    geometry.contentDigest !== contentDigest(geometry.shape)
  )
    return false
  const encoded = new TextEncoder().encode(JSON.stringify(geometry.shape))
  if (encoded.byteLength > 16 * 1024) return false
  const polygons =
    geometry.shape.type === 'Polygon'
      ? [geometry.shape.coordinates]
      : geometry.shape.coordinates
  let vertices = 0
  return (polygons as number[][][][]).every(
    (polygon) =>
      polygon.length > 0 &&
      polygon.every(
        (ring) =>
          ring.length >= 4 &&
          ring.every((point) => {
            vertices++
            return (
              vertices <= 512 &&
              point.length === 2 &&
              point.every(Number.isFinite) &&
              point[0] >= -180 &&
              point[0] <= 180 &&
              point[1] >= -90 &&
              point[1] <= 90
            )
          }) &&
          ring[0][0] === ring.at(-1)![0] &&
          ring[0][1] === ring.at(-1)![1],
      ),
  )
}

function validWeatherEvaluation(value: unknown): value is WeatherEvaluation {
  return (
    exactObject(value, [
      'point',
      'algorithmVersion',
      'applicability',
      'reason',
      'basis',
      'coverage',
      'zones',
    ]) &&
    validPlanningPoint(value.point) &&
    value.algorithmVersion === 'rfc7946-planar-rational-v1' &&
    stringIn(value.applicability, ['inside', 'outside', 'unknown']) &&
    stringIn(value.reason, [
      'strict_interior',
      'strict_exterior',
      'no_polygon',
      'boundary',
      'invalid_topology',
      'bad_point',
      'unsupported',
      'zone_incomplete',
      'zone_pending',
      'not_evaluated',
    ]) &&
    stringIn(value.basis, ['inline_geometry', 'affected_zones', 'none']) &&
    (value.coverage === null ||
      stringIn(value.coverage, ['complete', 'partial', 'pending'])) &&
    Array.isArray(value.zones) &&
    value.zones.length <= maxWeatherListItems &&
    value.zones.every(
      (zone) =>
        exactObject(zone, [
          'url',
          'id',
          'type',
          'source_revision',
          'effective',
          'expires',
          'retrieved_at',
          'fresh_until',
          'state',
          'result',
          'reason',
        ]) &&
        zone.url ===
          `https://api.weather.gov/zones/${String(zone.type)}/${String(zone.id)}` &&
        boundedText(zone.id, 16) &&
        stringIn(zone.type, ['forecast', 'county', 'fire']) &&
        nullableBoundedText(zone.source_revision, 64) &&
        [
          zone.effective,
          zone.expires,
          zone.retrieved_at,
          zone.fresh_until,
        ].every(nullableTime) &&
        stringIn(zone.state, ['fresh', 'stale', 'unavailable', 'pending']) &&
        stringIn(zone.result, ['inside', 'outside', 'unknown']) &&
        boundedText(zone.reason, 64),
    )
  )
}

export function validNWSQueryReading(value: unknown): value is NWSQueryReading {
  return (
    exactObject(value, [
      'snapshotId',
      'generatedAt',
      'checkedAt',
      'transport',
      'queryScope',
      'retrievalState',
      'coverage',
      'retrievedAt',
      'freshUntil',
      'point',
      'algorithmVersion',
      'products',
    ]) &&
    (value.snapshotId === null || boundedText(value.snapshotId, 128)) &&
    nullableTime(value.generatedAt) &&
    nullableTime(value.checkedAt) &&
    stringIn(value.transport, ['ok', 'unavailable']) &&
    value.queryScope === weatherQueryScope &&
    stringIn(value.retrievalState, [
      'fresh',
      'stale',
      'unknown',
      'unavailable',
    ]) &&
    stringIn(value.coverage, ['complete', 'partial', 'unavailable']) &&
    nullableTime(value.retrievedAt) &&
    nullableTime(value.freshUntil) &&
    (value.point === null || validPlanningPoint(value.point)) &&
    (value.algorithmVersion === null ||
      value.algorithmVersion === 'rfc7946-planar-rational-v1') &&
    Array.isArray(value.products) &&
    value.products.length <= 100 &&
    value.products.every((product) => validNWSProduct(product)) &&
    (value.transport !== 'ok' || value.snapshotId !== null)
  )
}

export function validAcceptedWeatherEvidence(
  value: unknown,
  cycle: number,
  index: number,
): value is AcceptedWeatherEvidence {
  if (
    !exactObject(value, [
      'id',
      'cycle',
      'acceptedAt',
      'acceptedBy',
      'phase',
      'action',
      'authorityEffect',
      'snapshotId',
      'queryScope',
      'productDigestVersion',
      'productDigest',
      'evaluationDigestVersion',
      'evaluationDigest',
      'product',
      'evaluation',
      'observation',
      'limitations',
      'recordDigest',
    ]) ||
    value.id !== `WA-${cycle}-${index + 1}` ||
    value.cycle !== cycle ||
    !validSourceTime(value.acceptedAt) ||
    value.acceptedBy !== 'Facilitator' ||
    value.phase !== 'before' ||
    value.action !== 'facilitator-selected planning context' ||
    value.authorityEffect !== 'none' ||
    !boundedText(value.snapshotId, 128) ||
    value.queryScope !== weatherQueryScope ||
    value.productDigestVersion !== weatherProductDigestVersion ||
    value.evaluationDigestVersion !== weatherEvaluationDigestVersion ||
    !validWeatherProductRevision(value.product) ||
    !validWeatherEvaluation(value.evaluation) ||
    !exactObject(value.observation, [
      'generatedAt',
      'checkedAt',
      'retrievalState',
      'retrievedAt',
      'freshUntil',
      'coverage',
      'validity',
    ]) ||
    !Array.isArray(value.limitations) ||
    value.limitations.length !== limitations.length ||
    value.limitations.some((item, itemIndex) => item !== limitations[itemIndex])
  )
    return false
  const product = value.product
  const evaluation = value.evaluation
  if (
    !validSourceTime(value.observation.generatedAt) ||
    !validSourceTime(value.observation.checkedAt) ||
    value.observation.retrievalState !== 'fresh' ||
    !validSourceTime(value.observation.retrievedAt) ||
    !validSourceTime(value.observation.freshUntil) ||
    value.observation.coverage !== 'complete' ||
    !stringIn(value.observation.validity, [
      'current',
      'expired',
      'not_yet_effective',
      'unknown',
    ]) ||
    Date.parse(value.observation.generatedAt) >
      Date.parse(value.observation.checkedAt) ||
    Date.parse(value.observation.checkedAt) > Date.parse(value.acceptedAt) ||
    Date.parse(value.observation.retrievedAt) >
      Date.parse(value.observation.checkedAt) ||
    Date.parse(value.observation.freshUntil) <= Date.parse(value.acceptedAt) ||
    value.observation.validity !==
      projectedValidity(product, Date.parse(value.acceptedAt)) ||
    !validStoredEvaluation(product, evaluation, Date.parse(value.acceptedAt)) ||
    value.productDigest !== productDigest(product) ||
    value.evaluationDigest !== evaluationDigest(evaluation)
  )
    return false
  const { recordDigest, ...contents } = value
  return (
    recordDigest === contentDigest(contents) &&
    new TextEncoder().encode(JSON.stringify(value)).byteLength <=
      maxWeatherRecordBytes
  )
}

export function validWeatherRecords(
  accepted: unknown,
  rechecks: unknown,
  cycle: number,
): accepted is AcceptedWeatherEvidence[] {
  if (
    !Array.isArray(accepted) ||
    !Array.isArray(rechecks) ||
    accepted.length > maxWeatherAcceptances ||
    rechecks.length > maxWeatherRechecks ||
    new TextEncoder().encode(JSON.stringify([accepted, rechecks])).byteLength >
      maxWeatherRecordsBytes ||
    !accepted.every((row, index) =>
      validAcceptedWeatherEvidence(row, cycle, index),
    )
  )
    return false
  return rechecks.every((row, index) => {
    if (
      !exactObject(row, [
        'id',
        'acceptedId',
        'acceptedDigest',
        'owner',
        'horizon',
        'checkedAt',
        'result',
        'retrievalState',
        'validityAtCheck',
        'observed',
        'candidates',
        'recordDigest',
      ]) ||
      row.id !== `WR-${cycle}-${index + 1}` ||
      !validSourceTime(row.checkedAt) ||
      !stringIn(row.owner, [
        'Facilitator',
        'Planning lead',
        'Mass-care lead',
        'Outreach partner',
        'Recovery lead',
      ]) ||
      !stringIn(row.horizon, ['next shift', 'next day', 'next exercise']) ||
      !stringIn(row.result, [
        'unchanged',
        'changed',
        'not-returned',
        'source-unavailable',
        'superseded',
        'cancelled',
        'expired',
        'ambiguous',
      ]) ||
      !stringIn(row.retrievalState, [
        'fresh',
        'stale',
        'unknown',
        'unavailable',
      ]) ||
      !stringIn(row.validityAtCheck, [
        'current',
        'expired',
        'not_yet_effective',
        'unknown',
      ]) ||
      !(
        row.observed === null ||
        (exactObject(row.observed, [
          'productDigest',
          'evaluationDigest',
          'product',
          'evaluation',
        ]) &&
          validWeatherProductRevision(row.observed.product) &&
          validWeatherEvaluation(row.observed.evaluation) &&
          validStoredEvaluation(
            row.observed.product,
            row.observed.evaluation,
            Date.parse(row.checkedAt),
          ) &&
          row.observed.productDigest === productDigest(row.observed.product) &&
          row.observed.evaluationDigest ===
            evaluationDigest(row.observed.evaluation))
      ) ||
      !exactObject(row.candidates, [
        'count',
        'digest',
        'complete',
        'identities',
      ]) ||
      !Number.isSafeInteger(row.candidates.count) ||
      Number(row.candidates.count) < 0 ||
      !(
        row.candidates.digest === null || boundedText(row.candidates.digest, 64)
      ) ||
      typeof row.candidates.complete !== 'boolean' ||
      !Array.isArray(row.candidates.identities) ||
      row.candidates.identities.length > 8 ||
      !row.candidates.identities.every(
        (identity) =>
          exactObject(identity, [
            'id',
            'url',
            'relationship',
            'productDigest',
            'evaluationDigest',
          ]) &&
          boundedText(identity.id, 512) &&
          boundedText(identity.url, 512) &&
          stringIn(identity.relationship, [
            'initial',
            'update',
            'cancel',
            'acknowledgement',
            'error',
            'unknown',
          ]) &&
          boundedText(identity.productDigest, 64) &&
          boundedText(identity.evaluationDigest, 64),
      )
    )
      return false
    const prior = accepted.find((item) => item.id === row.acceptedId)
    if (
      !prior ||
      row.acceptedDigest !== prior.recordDigest ||
      Date.parse(row.checkedAt) < Date.parse(prior.acceptedAt) ||
      (index > 0 &&
        Date.parse(row.checkedAt) <
          Date.parse((rechecks[index - 1] as WeatherRecheck).checkedAt))
    )
      return false
    const observed = row.observed as WeatherRecheck['observed']
    const candidates = row.candidates as WeatherRecheck['candidates']
    const sameIdentity = observed
      ? sameProductIdentity(observed.product, prior)
      : false
    const lineage =
      observed &&
      observed.product.references.some((reference) =>
        projectedReferenceMatches(reference, prior),
      )
    const stableObservation = Boolean(
      observed &&
      observed.productDigest === prior.productDigest &&
      observed.evaluationDigest === prior.evaluationDigest,
    )
    const incompleteEvaluation = Boolean(
      observed &&
      (observed.evaluation.reason === 'zone_incomplete' ||
        observed.evaluation.reason === 'zone_pending'),
    )
    const canonicalCandidates =
      candidates.identities.every(
        (identity, candidateIndex) =>
          candidateIndex === 0 ||
          compareCandidateIdentity(
            candidates.identities[candidateIndex - 1],
            identity,
          ) < 0,
      ) &&
      new Set(candidates.identities.map(candidateIdentityKey)).size ===
        candidates.identities.length &&
      candidates.count >= candidates.identities.length &&
      candidates.complete === candidates.count <= 8 &&
      (candidates.complete
        ? candidates.count === candidates.identities.length &&
          (candidates.count === 0
            ? candidates.digest === null
            : candidates.digest === contentDigest(candidates.identities))
        : candidates.digest !== null)
    const emptyCandidates =
      candidates.count === 0 &&
      candidates.digest === null &&
      candidates.complete &&
      candidates.identities.length === 0
    const consistentResult =
      canonicalCandidates &&
      (row.result === 'ambiguous' || emptyCandidates) &&
      row.validityAtCheck ===
        projectedValidity(prior.product, Date.parse(row.checkedAt)) &&
      (row.result === 'source-unavailable'
        ? (row.retrievalState !== 'fresh' && observed === null) ||
          (row.retrievalState === 'fresh' &&
            observed !== null &&
            sameIdentity &&
            observed.productDigest === prior.productDigest &&
            incompleteEvaluation)
        : row.result === 'not-returned'
          ? row.retrievalState === 'fresh' &&
            observed === null &&
            candidates.count === 0
          : row.result === 'ambiguous'
            ? row.retrievalState === 'fresh' &&
              observed === null &&
              candidates.count > 1
            : row.result === 'unchanged'
              ? row.retrievalState === 'fresh' &&
                observed !== null &&
                sameIdentity &&
                stableObservation &&
                row.validityAtCheck !== 'expired'
              : row.result === 'expired'
                ? row.retrievalState === 'fresh' &&
                  observed !== null &&
                  sameIdentity &&
                  stableObservation &&
                  row.validityAtCheck === 'expired'
                : row.result === 'changed'
                  ? row.retrievalState === 'fresh' &&
                    observed !== null &&
                    sameIdentity &&
                    observed.product.relationship !== 'cancel' &&
                    (observed.productDigest !== prior.productDigest ||
                      observed.evaluationDigest !== prior.evaluationDigest)
                  : row.result === 'cancelled'
                    ? row.retrievalState === 'fresh' &&
                      observed !== null &&
                      observed.product.relationship === 'cancel' &&
                      (sameIdentity || lineage)
                    : row.result === 'superseded'
                      ? row.retrievalState === 'fresh' &&
                        observed !== null &&
                        !sameIdentity &&
                        observed.product.relationship === 'update' &&
                        lineage
                      : false)
    if (!consistentResult) return false
    const { recordDigest, ...contents } = row
    return (
      recordDigest === contentDigest(contents) &&
      new TextEncoder().encode(JSON.stringify(row)).byteLength <=
        maxWeatherRecordBytes
    )
  })
}

export function weatherArchiveDigest(
  archive: Omit<WeatherCycleArchive, 'digest'>,
) {
  return contentDigest(archive)
}

export function validWeatherArchive(value: unknown) {
  if (
    !exactObject(value, ['cycle', 'accepted', 'rechecks', 'digest']) ||
    !Number.isSafeInteger(value.cycle) ||
    Number(value.cycle) < 1 ||
    !validWeatherRecords(value.accepted, value.rechecks, Number(value.cycle))
  )
    return false
  const { digest, ...contents } = value
  return (
    digest ===
    weatherArchiveDigest(contents as Omit<WeatherCycleArchive, 'digest'>)
  )
}
