import { exactObject, stringIn, validSourceTime } from './source-evidence'

export type NWSReference = {
  url: string | null
  identifier: string | null
  sender: string | null
  sent: string | null
}

export type NWSZoneEvidence = {
  result: 'inside' | 'outside' | 'unknown'
  reason:
    | 'strict_interior'
    | 'strict_exterior'
    | 'boundary'
    | 'zone_incomplete'
    | 'zone_pending'
  coverage: 'complete' | 'partial' | 'pending'
  zones: Array<{
    url: string
    id: string
    type: 'forecast' | 'county' | 'fire'
    source_revision: string | null
    effective: string | null
    expires: string | null
    retrieved_at: string | null
    fresh_until: string | null
    state: 'fresh' | 'stale' | 'unavailable' | 'pending'
    result: 'inside' | 'outside' | 'unknown'
    reason: string
  }>
}

export type NWSProduct = {
  id: string | null
  url: string | null
  sender: string | null
  sender_name: string | null
  sent: string | null
  effective: string | null
  onset: string | null
  expires: string | null
  ends: string | null
  status: string | null
  message_type: string | null
  scope: string | null
  event: string | null
  headline: string | null
  severity: string | null
  certainty: string | null
  urgency: string | null
  response: string | null
  area_desc: string | null
  references: NWSReference[] | null
  affected_zones: Array<{
    url: string
    id: string
    type: 'forecast' | 'county' | 'fire'
  }> | null
  geocode: { ugc: string[] | null; same: string[] | null }
  geometry: {
    status: 'absent' | 'valid' | 'invalid' | 'unsupported' | 'too_large'
    type: string | null
    shape: {
      type: 'Polygon' | 'MultiPolygon'
      coordinates: number[][][] | number[][][][]
    } | null
  }
  query_scope: {
    area: 'HI'
    coverage: 'statewide'
    url: 'https://api.weather.gov/alerts/active?area=HI'
  }
  applicability: 'inside' | 'outside' | 'unknown'
  applicability_reason:
    | 'strict_interior'
    | 'strict_exterior'
    | 'no_polygon'
    | 'boundary'
    | 'invalid_topology'
    | 'bad_point'
    | 'unsupported'
    | 'zone_incomplete'
    | 'zone_pending'
    | 'not_evaluated'
  applicability_basis?: 'inline_geometry' | 'affected_zones' | 'none'
  zone_evidence?: NWSZoneEvidence
  eligibility:
    | 'eligible'
    | 'non_actual'
    | 'non_public'
    | 'cancellation'
    | 'protocol'
    | 'unknown'
  validity: 'current' | 'expired' | 'not_yet_effective' | 'unknown'
  relationship:
    'initial' | 'update' | 'cancel' | 'acknowledgement' | 'error' | 'unknown'
}

export type Retrieval = {
  status: string
  retrieved_at?: string | null
  fresh_until?: string | null
}

export function retrievalState(
  source: Retrieval | undefined,
  now: number,
  unavailable = false,
) {
  if (unavailable) return 'unavailable'
  if (
    !source ||
    !validSourceTime(source.retrieved_at) ||
    !validSourceTime(source.fresh_until) ||
    !Number.isFinite(now)
  )
    return 'unknown'
  const retrieved = Date.parse(source.retrieved_at)
  const deadline = Date.parse(source.fresh_until)
  if (retrieved > now || deadline <= retrieved) return 'unknown'
  if (source.status === 'stale' || now >= deadline) return 'stale'
  return source.status === 'fresh' ? 'fresh' : 'unknown'
}

function nullableText(value: unknown, maximum: number) {
  return (
    value === null ||
    (typeof value === 'string' &&
      value.trim().length > 0 &&
      new TextEncoder().encode(value).length <= maximum)
  )
}

function apiURL(value: unknown, prefix: string) {
  if (typeof value !== 'string' || !nullableText(value, 512)) return false
  try {
    const url = new URL(value)
    const suffix = decodeURIComponent(url.pathname.slice(prefix.length))
    return (
      url.origin === 'https://api.weather.gov' &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      !value.includes('?') &&
      !value.includes('#') &&
      url.pathname.startsWith(prefix) &&
      suffix.length > 0 &&
      !/[/\\\s]/.test(suffix) &&
      suffix !== '.' &&
      suffix !== '..'
    )
  } catch {
    return false
  }
}

function nullableList(value: unknown, validate: (item: unknown) => boolean) {
  return (
    value === null ||
    (Array.isArray(value) && value.length <= 64 && value.every(validate))
  )
}

function validGeometry(value: unknown) {
  if (
    !exactObject(value, ['status', 'type', 'shape']) ||
    !stringIn(value.status, [
      'absent',
      'valid',
      'invalid',
      'unsupported',
      'too_large',
    ]) ||
    !nullableText(value.type, 32)
  )
    return false
  if (value.status !== 'valid')
    return (
      value.shape === null && (value.status !== 'absent' || value.type === null)
    )
  const shape = value.shape
  if (
    !exactObject(shape, ['type', 'coordinates']) ||
    !stringIn(shape.type, ['Polygon', 'MultiPolygon']) ||
    shape.type !== value.type ||
    new TextEncoder().encode(JSON.stringify(shape)).length > 16 * 1024 ||
    !Array.isArray(shape.coordinates)
  )
    return false
  const polygons =
    shape.type === 'Polygon' ? [shape.coordinates] : shape.coordinates
  let vertices = 0
  return (
    polygons.length > 0 &&
    polygons.every(
      (polygon) =>
        Array.isArray(polygon) &&
        polygon.length > 0 &&
        polygon.every((ring) => {
          if (!Array.isArray(ring) || ring.length < 4) return false
          const valid = ring.every((point) => {
            vertices++
            return (
              vertices <= 512 &&
              Array.isArray(point) &&
              point.length === 2 &&
              point.every(
                (coordinate) =>
                  typeof coordinate === 'number' && Number.isFinite(coordinate),
              ) &&
              point[0] >= -180 &&
              point[0] <= 180 &&
              point[1] >= -90 &&
              point[1] <= 90
            )
          })
          return (
            valid &&
            ring[0][0] === ring.at(-1)[0] &&
            ring[0][1] === ring.at(-1)[1]
          )
        }),
    )
  )
}

function validZoneReason(value: unknown) {
  return (
    stringIn(value, [
      'strict_interior',
      'strict_exterior',
      'boundary',
      'invalid_topology',
      'bad_point',
      'unsupported',
      'zone_incomplete',
      'zone_pending',
      'source_time_mismatch',
      'request_failed',
      'invalid_content_type',
      'invalid_payload',
      'too_complex',
      'too_large',
    ]) ||
    (typeof value === 'string' && /^http_[1-5]\d\d$/.test(value))
  )
}

function validZoneEvidence(value: unknown): value is NWSZoneEvidence {
  return (
    exactObject(value, ['result', 'reason', 'coverage', 'zones']) &&
    stringIn(value.result, ['inside', 'outside', 'unknown']) &&
    stringIn(value.reason, [
      'strict_interior',
      'strict_exterior',
      'boundary',
      'zone_incomplete',
      'zone_pending',
    ]) &&
    stringIn(value.coverage, ['complete', 'partial', 'pending']) &&
    Array.isArray(value.zones) &&
    value.zones.length > 0 &&
    value.zones.length <= 64 &&
    value.zones.every(
      (row) =>
        exactObject(row, [
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
        stringIn(row.type, ['forecast', 'county', 'fire']) &&
        typeof row.id === 'string' &&
        (row.type === 'county'
          ? /^[A-Z]{2}C\d{3}$/.test(row.id)
          : /^[A-Z]{2}Z\d{3}$/.test(row.id)) &&
        row.url === `https://api.weather.gov/zones/${row.type}/${row.id}` &&
        (row.source_revision === null ||
          (typeof row.source_revision === 'string' &&
            /^[a-f0-9]{64}$/.test(row.source_revision))) &&
        [row.effective, row.expires, row.retrieved_at, row.fresh_until].every(
          (timestamp) => timestamp === null || validSourceTime(timestamp),
        ) &&
        stringIn(row.state, ['fresh', 'stale', 'unavailable', 'pending']) &&
        stringIn(row.result, ['inside', 'outside', 'unknown']) &&
        validZoneReason(row.reason),
    ) &&
    value.result ===
      (value.reason === 'strict_interior'
        ? 'inside'
        : value.reason === 'strict_exterior'
          ? 'outside'
          : 'unknown') &&
    (value.result !== 'outside' ||
      (value.coverage === 'complete' &&
        value.zones.every(
          (row) =>
            row.state === 'fresh' &&
            row.result === 'outside' &&
            row.reason === 'strict_exterior',
        ))) &&
    (value.coverage !== 'pending' ||
      value.zones.some((row) => row.state === 'pending'))
  )
}

export function validNWSProduct(
  value: unknown,
  evaluatedAt?: number,
): value is NWSProduct {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const candidate = value as Record<string, unknown>
  const valid =
    exactObject(value, [
      'id',
      'url',
      'sender',
      'sender_name',
      'sent',
      'effective',
      'onset',
      'expires',
      'ends',
      'status',
      'message_type',
      'scope',
      'event',
      'headline',
      'severity',
      'certainty',
      'urgency',
      'response',
      'area_desc',
      'references',
      'affected_zones',
      'geocode',
      'geometry',
      'query_scope',
      'applicability',
      'applicability_reason',
      ...(candidate.applicability_basis !== undefined
        ? ['applicability_basis']
        : []),
      ...(candidate.zone_evidence !== undefined ? ['zone_evidence'] : []),
      'eligibility',
      'validity',
      'relationship',
    ]) &&
    nullableText(value.id, 512) &&
    (value.url === null || apiURL(value.url, '/alerts/')) &&
    ['sender', 'sender_name', 'event', 'headline'].every((key) =>
      nullableText(value[key], 256),
    ) &&
    ['sent', 'effective', 'onset', 'expires', 'ends'].every((key) =>
      nullableText(value[key], 64),
    ) &&
    [
      'status',
      'message_type',
      'scope',
      'severity',
      'certainty',
      'urgency',
      'response',
    ].every((key) => nullableText(value[key], 32)) &&
    nullableText(value.area_desc, 2048) &&
    nullableList(
      value.references,
      (row) =>
        exactObject(row, ['url', 'identifier', 'sender', 'sent']) &&
        (row.url === null || apiURL(row.url, '/alerts/')) &&
        nullableText(row.identifier, 512) &&
        nullableText(row.sender, 256) &&
        nullableText(row.sent, 64),
    ) &&
    nullableList(
      value.affected_zones,
      (row) =>
        exactObject(row, ['url', 'id', 'type']) &&
        stringIn(row.type, ['forecast', 'county', 'fire']) &&
        typeof row.id === 'string' &&
        (row.type === 'county' ? /^[A-Z]{2}C\d{3}$/ : /^[A-Z]{2}Z\d{3}$/).test(
          row.id,
        ) &&
        row.url === `https://api.weather.gov/zones/${row.type}/${row.id}`,
    ) &&
    exactObject(value.geocode, ['ugc', 'same']) &&
    nullableList(
      value.geocode.ugc,
      (item) => typeof item === 'string' && /^[A-Z]{2}[CZ]\d{3}$/.test(item),
    ) &&
    nullableList(
      value.geocode.same,
      (item) => typeof item === 'string' && /^\d{6}$/.test(item),
    ) &&
    validGeometry(value.geometry) &&
    exactObject(value.query_scope, ['area', 'coverage', 'url']) &&
    value.query_scope.area === 'HI' &&
    value.query_scope.coverage === 'statewide' &&
    value.query_scope.url === 'https://api.weather.gov/alerts/active?area=HI' &&
    stringIn(value.applicability, ['inside', 'outside', 'unknown']) &&
    stringIn(value.applicability_reason, [
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
    (value.applicability_basis === undefined ||
      stringIn(value.applicability_basis, [
        'inline_geometry',
        'affected_zones',
        'none',
      ])) &&
    (value.zone_evidence === undefined ||
      validZoneEvidence(value.zone_evidence)) &&
    stringIn(value.eligibility, [
      'eligible',
      'non_actual',
      'non_public',
      'cancellation',
      'protocol',
      'unknown',
    ]) &&
    stringIn(value.validity, [
      'current',
      'expired',
      'not_yet_effective',
      'unknown',
    ]) &&
    stringIn(value.relationship, [
      'initial',
      'update',
      'cancel',
      'acknowledgement',
      'error',
      'unknown',
    ])
  if (
    !valid ||
    (value.applicability === 'inside' &&
      value.applicability_reason !== 'strict_interior') ||
    (value.applicability === 'outside' &&
      value.applicability_reason !== 'strict_exterior') ||
    (value.applicability === 'unknown' &&
      !stringIn(value.applicability_reason, [
        'no_polygon',
        'boundary',
        'invalid_topology',
        'bad_point',
        'unsupported',
        'zone_incomplete',
        'zone_pending',
        'not_evaluated',
      ]))
  )
    return false
  const product = value as NWSProduct
  if (
    (product.applicability_basis === 'affected_zones' &&
      (product.geometry.status !== 'absent' ||
        !product.zone_evidence ||
        product.zone_evidence.result !== product.applicability ||
        product.zone_evidence.reason !== product.applicability_reason)) ||
    (product.applicability_basis !== 'affected_zones' &&
      product.zone_evidence !== undefined) ||
    (product.applicability_basis === 'none' &&
      (product.applicability !== 'unknown' ||
        product.applicability_reason !== 'no_polygon')) ||
    (product.applicability_basis === 'inline_geometry' &&
      product.geometry.status === 'absent')
  )
    return false
  return (
    product.eligibility === nwsEligibility(product) &&
    product.relationship === nwsRelationship(product.message_type) &&
    (evaluatedAt === undefined
      ? product.validity === 'unknown' ||
        [product.sent, product.effective, product.expires].every(
          validSourceTime,
        )
      : product.validity === nwsProductValidity(product, evaluatedAt))
  )
}

function nwsRelationship(
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

export function nwsEligibility(product: NWSProduct): NWSProduct['eligibility'] {
  if (product.status !== 'Actual')
    return stringIn(product.status, ['Test', 'Exercise', 'Draft', 'System'])
      ? 'non_actual'
      : 'unknown'
  if (product.scope !== 'Public')
    return stringIn(product.scope, ['Restricted', 'Private'])
      ? 'non_public'
      : 'unknown'
  if (product.message_type === 'Cancel') return 'cancellation'
  if (stringIn(product.message_type, ['Ack', 'Error'])) return 'protocol'
  if (
    stringIn(product.message_type, ['Alert', 'Update']) &&
    product.id &&
    product.url
  )
    return 'eligible'
  return 'unknown'
}

export function nwsProductValidity(
  product: NWSProduct,
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
