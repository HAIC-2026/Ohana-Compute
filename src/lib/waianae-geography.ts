type Shape =
  | GeoJSON.Point
  | GeoJSON.Polygon
  | GeoJSON.MultiPolygon
  | GeoJSON.LineString
  | GeoJSON.MultiLineString
export type FloodEvidence = {
  geometry: GeoJSON.FeatureCollection<Shape>
  sources: Array<{
    authority: string
    url: string
    retrieved_at: string
    vintage: string
  }>
  zones: string[]
  counts: Partial<Record<string, number>>
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function position(point: unknown): point is number[] {
  return (
    Array.isArray(point) &&
    point.length >= 2 &&
    typeof point[0] === 'number' &&
    Number.isFinite(point[0]) &&
    Math.abs(point[0]) <= 180 &&
    typeof point[1] === 'number' &&
    Number.isFinite(point[1]) &&
    Math.abs(point[1]) <= 90
  )
}

function positions(value: unknown): value is number[][] {
  return Array.isArray(value) && value.length >= 2 && value.every(position)
}

function rings(value: unknown): value is number[][][] {
  return Array.isArray(value) && value.length > 0 && value.every(positions)
}

function shape(value: unknown): Shape {
  if (!record(value)) throw new Error('Missing source geometry.')
  if (value.type === 'Point' && position(value.coordinates)) {
    return { type: 'Point', coordinates: value.coordinates }
  }
  if (value.type === 'Polygon' && rings(value.coordinates))
    return { type: value.type, coordinates: value.coordinates }
  if (
    value.type === 'MultiPolygon' &&
    Array.isArray(value.coordinates) &&
    value.coordinates.every(rings)
  )
    return { type: value.type, coordinates: value.coordinates }
  if (value.type === 'LineString' && positions(value.coordinates))
    return { type: value.type, coordinates: value.coordinates }
  if (value.type === 'MultiLineString' && rings(value.coordinates))
    return { type: value.type, coordinates: value.coordinates }
  throw new Error('Unsupported or invalid source geometry.')
}

export function parseFloodEvidence(value: unknown): FloodEvidence {
  if (
    !record(value) ||
    value.type !== 'FeatureCollection' ||
    !Array.isArray(value.features) ||
    !value.features.length ||
    !record(value.metadata) ||
    !Array.isArray(value.metadata.sources)
  ) {
    throw new Error('Flood source snapshot is invalid or empty.')
  }
  const zones = new Set<string>()
  const counts: Record<string, number> = {}
  const features: GeoJSON.Feature<Shape>[] = value.features.map(
    (feature: unknown) => {
      if (
        !record(feature) ||
        feature.type !== 'Feature' ||
        !record(feature.properties)
      )
        throw new Error('Flood source feature is invalid.')
      const kind = feature.properties.context_kind
      if (typeof kind !== 'string')
        throw new Error('Missing source feature kind.')
      counts[kind] = (counts[kind] ?? 0) + 1
      const rawZone =
        feature.properties.FLD_ZONE ??
        feature.properties.fld_zone ??
        feature.properties.zone
      const zone = typeof rawZone === 'string' ? rawZone : 'Unclassified'
      if (kind === 'flood-zone') zones.add(zone)
      return {
        type: 'Feature',
        geometry: shape(feature.geometry),
        properties: { ...feature.properties, case_zone: zone },
      }
    },
  )
  const sources = value.metadata.sources.map((source: unknown) => {
    if (
      !record(source) ||
      typeof source.authority !== 'string' ||
      typeof source.url !== 'string' ||
      typeof source.retrieved_at !== 'string' ||
      !record(source.vintage) ||
      !source.url.startsWith('https://')
    )
      throw new Error('Flood source provenance is incomplete.')
    return {
      authority: source.authority,
      url: source.url,
      retrieved_at: source.retrieved_at,
      vintage: Object.entries(source.vintage)
        .map(
          ([key, description]) =>
            `${key.replaceAll('_', ' ')}: ${String(description)}`,
        )
        .join('; '),
    }
  })
  if (!sources.length || !counts['flood-zone'])
    throw new Error('Flood source provenance is missing.')
  return {
    geometry: { type: 'FeatureCollection', features },
    zones: [...zones].sort(),
    counts,
    sources,
  }
}

export function floodEvidenceText(evidence: FloodEvidence | null) {
  return evidence
    ? `Saved official flood geometry: ${evidence.counts['flood-zone']} source polygons; published zones ${evidence.zones.join(', ')}. Source context also includes ${evidence.counts['road-centerline'] ?? 0} road centerlines, ${evidence.counts.waterway ?? 0} waterways and ${evidence.counts['bridge-inventory-point'] ?? 0} bridge inventory points. These are area-level flood hazard classes and inventory locations, not an event inundation forecast, person exposure assessment or road-level passability. Flood geometry server-generalized at 0.000025 degrees (about 2.8 m), not clipped; road/waterway coordinates rounded to six decimals. No engineering topology or road-flood intersection analysis is certified.\n${evidence.sources.map((source) => `${source.authority}; source vintage ${source.vintage}; retrieved ${source.retrieved_at}; ${source.url}`).join('\n')}`
    : 'Official flood geometry unavailable in this session. No replacement hazard polygons or source risk classification are invented. The fictional story and access disruptions remain exercise assumptions only.'
}
