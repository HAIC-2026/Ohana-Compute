import { contentDigest } from './record-digest'

export const sourceDerivationVersion = 'fema-shelter-context.v1'
export const sourceId = 'fema-open-shelters'
export const sourceScope = 'hawaii-open-shelter-query'
export const sourceGeography =
  'Hawaii query envelope; not County coverage or planning-location applicability'
export const sourceProduct = 'FEMA National Shelter System public report'
export const sourceUrl =
  'https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/MapServer/0'
export const maxSourceClaims = 8
export const maxSourceRechecks = 16

export type SourceClaim = {
  item_id: string
  source_id: typeof sourceId
  product: typeof sourceProduct
  authority: string
  url: typeof sourceUrl
  geography: typeof sourceGeography
  scope: typeof sourceScope
  name: string
  city: string | null
  facts: {
    reported_status: string | null
    reported_capacity: number | null
    wheelchair_accessible: string | null
    pet_accommodations: string | null
  }
  source_updated_at: string | null
  source_expires_at: string | null
  limitations: string[]
  derivation_version: typeof sourceDerivationVersion
  content_digest: string
}

export type ShelterContext = {
  derivation_version: typeof sourceDerivationVersion
  source_id: typeof sourceId
  query_scope: typeof sourceScope
  state: 'fresh' | 'stale' | 'unavailable'
  coverage: 'complete' | 'partial' | 'unavailable'
  retrieved_at: string | null
  fresh_until: string | null
  items: SourceClaim[]
}

export type SourceReading = {
  snapshotId: string | null
  generatedAt: string | null
  checkedAt: string | null
  transport: 'ok' | 'unavailable'
  context: Omit<ShelterContext, 'items'> | null
  claim: SourceClaim | null
}

export type SourceFreshness = 'fresh' | 'stale' | 'unknown' | 'unavailable'
export type SourceRecheckResult =
  'unchanged' | 'changed' | 'not-returned' | 'source-unavailable'

export function stringIn<T extends readonly string[]>(
  value: unknown,
  choices: T,
): value is T[number] {
  return typeof value === 'string' && choices.includes(value)
}

export function exactObject(
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

export function boundedText(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    new TextEncoder().encode(value).length <= max &&
    !Array.from(value).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
}

export function validSourceTime(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 40 &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(`${value.slice(0, 19)}Z`).toISOString().slice(0, 19) ===
      value.slice(0, 19)
  )
}

function nullableTime(value: unknown) {
  return value === null || validSourceTime(value)
}

function nullableText(value: unknown, max: number) {
  return value === null || boundedText(value, max)
}

export function validSourceClaim(value: unknown): value is SourceClaim {
  if (
    !exactObject(value, [
      'item_id',
      'source_id',
      'product',
      'authority',
      'url',
      'geography',
      'scope',
      'name',
      'city',
      'facts',
      'source_updated_at',
      'source_expires_at',
      'limitations',
      'derivation_version',
      'content_digest',
    ]) ||
    !boundedText(value.item_id, 128) ||
    value.source_id !== sourceId ||
    value.product !== sourceProduct ||
    !boundedText(value.authority, 256) ||
    value.url !== sourceUrl ||
    value.geography !== sourceGeography ||
    value.scope !== sourceScope ||
    !boundedText(value.name, 256) ||
    !nullableText(value.city, 128) ||
    !exactObject(value.facts, [
      'reported_status',
      'reported_capacity',
      'wheelchair_accessible',
      'pet_accommodations',
    ]) ||
    !nullableText(value.facts.reported_status, 64) ||
    !nullableText(value.facts.wheelchair_accessible, 64) ||
    !nullableText(value.facts.pet_accommodations, 64) ||
    !(
      value.facts.reported_capacity === null ||
      (Number.isSafeInteger(value.facts.reported_capacity) &&
        Number(value.facts.reported_capacity) >= 0 &&
        Number(value.facts.reported_capacity) <= 1_000_000)
    ) ||
    !nullableTime(value.source_updated_at) ||
    !nullableTime(value.source_expires_at) ||
    !Array.isArray(value.limitations) ||
    value.limitations.length < 1 ||
    value.limitations.length > 8 ||
    !value.limitations.every((item) => boundedText(item, 256)) ||
    value.derivation_version !== sourceDerivationVersion ||
    new TextEncoder().encode(JSON.stringify(value)).length > 4096
  )
    return false
  const { content_digest, ...facts } = value
  return content_digest === contentDigest(facts)
}

export function validSourceContext(
  value: unknown,
): value is Omit<ShelterContext, 'items'> {
  return (
    exactObject(value, [
      'derivation_version',
      'source_id',
      'query_scope',
      'state',
      'coverage',
      'retrieved_at',
      'fresh_until',
    ]) &&
    value.derivation_version === sourceDerivationVersion &&
    value.source_id === sourceId &&
    value.query_scope === sourceScope &&
    stringIn(value.state, ['fresh', 'stale', 'unavailable']) &&
    stringIn(value.coverage, ['complete', 'partial', 'unavailable']) &&
    nullableTime(value.retrieved_at) &&
    nullableTime(value.fresh_until) &&
    (value.retrieved_at === null ||
      value.fresh_until === null ||
      Date.parse(String(value.fresh_until)) >
        Date.parse(String(value.retrieved_at))) &&
    (value.state !== 'unavailable' || value.coverage === 'unavailable')
  )
}

export function validShelterContext(value: unknown): value is ShelterContext {
  if (
    !exactObject(value, [
      'derivation_version',
      'source_id',
      'query_scope',
      'state',
      'coverage',
      'retrieved_at',
      'fresh_until',
      'items',
    ])
  )
    return false
  const { items, ...context } = value
  return (
    validSourceContext(context) &&
    Array.isArray(items) &&
    items.length <= 20 &&
    items.every(validSourceClaim) &&
    new Set(items.map((item) => item.item_id)).size === items.length
  )
}

export function validSourceReading(value: unknown): value is SourceReading {
  return (
    exactObject(value, [
      'snapshotId',
      'generatedAt',
      'checkedAt',
      'transport',
      'context',
      'claim',
    ]) &&
    (value.snapshotId === null || boundedText(value.snapshotId, 128)) &&
    nullableTime(value.generatedAt) &&
    nullableTime(value.checkedAt) &&
    stringIn(value.transport, ['ok', 'unavailable']) &&
    (value.context === null || validSourceContext(value.context)) &&
    (value.claim === null || validSourceClaim(value.claim)) &&
    (value.snapshotId !== null
      ? value.generatedAt !== null && value.context !== null
      : value.generatedAt === null &&
        value.context === null &&
        value.claim === null) &&
    (value.transport !== 'ok' || value.snapshotId !== null)
  )
}

export function sourceRetrievalState(
  context: Omit<ShelterContext, 'items'> | null,
  now: number,
  transport: SourceReading['transport'] = 'ok',
): SourceFreshness {
  if (
    !context ||
    transport === 'unavailable' ||
    context.state === 'unavailable' ||
    context.coverage === 'unavailable'
  )
    return 'unavailable'
  if (context.state === 'stale') return 'stale'
  if (
    !context.retrieved_at ||
    !context.fresh_until ||
    Date.parse(context.retrieved_at) > now
  )
    return 'unknown'
  if (now >= Date.parse(context.fresh_until)) return 'stale'
  return context.coverage === 'partial' ? 'unknown' : 'fresh'
}

export function sourceObservationState(
  reading: SourceReading,
  now: number,
): SourceFreshness {
  const retrieval = sourceRetrievalState(
    reading.context,
    now,
    reading.transport,
  )
  if (retrieval === 'unavailable' || retrieval === 'stale') return retrieval
  const claim = reading.claim
  if (claim?.source_expires_at && now >= Date.parse(claim.source_expires_at))
    return 'stale'
  if (
    !claim?.source_updated_at ||
    !claim.source_expires_at ||
    Date.parse(claim.source_updated_at) > now
  )
    return 'unknown'
  return retrieval
}

export function sourceRecheckResult(
  accepted: SourceClaim,
  reading: SourceReading,
  now: number,
): SourceRecheckResult {
  if (sourceRetrievalState(reading.context, now, reading.transport) !== 'fresh')
    return 'source-unavailable'
  if (!reading.claim) return 'not-returned'
  if (reading.claim.item_id !== accepted.item_id)
    throw new Error('Recheck must refer to the accepted source item and scope.')
  return reading.claim.content_digest === accepted.content_digest
    ? 'unchanged'
    : 'changed'
}
