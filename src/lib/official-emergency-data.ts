import { backendGet, describeBackendSources } from './backend-api'
import type { BackendSourceStatus } from './backend-api'

export type OfficialEvacuationZone = {
  status: 'inside' | 'outside'
  zoneType: string | null
  description: string
  geometry: GeoJSON.FeatureCollection
  source: string
}

export type OfficialOpenShelter = {
  id: string
  name: string
  address: string
  city: string
  status: string
  capacity: number | null
  wheelchairAccessible: string
  coordinates: [number, number]
}

export type OfficialFloodRisk = {
  classification:
    'high' | 'moderate' | 'lower-mapped' | 'undetermined' | 'unmapped'
  zoneCode: string | null
  zoneSubtype: string | null
  title: string
  description: string
  coastalPlanningExposure: boolean
  nearbyRiskGeometry: GeoJSON.FeatureCollection
  source: string
}

export type OfficialWildfireRisk = {
  rating: 'High' | 'Medium' | 'Low' | 'N/A' | 'Unmapped'
  communityName: string | null
  title: string
  description: string
  geometry: GeoJSON.FeatureCollection
  source: string
}

type BackendTsunamiRisk = {
  status: 'inside' | 'outside'
  zone_type: string | null
  description: string
  geometry: GeoJSON.FeatureCollection
  sources: BackendSourceStatus[]
}

type BackendFloodRisk = {
  classification: OfficialFloodRisk['classification']
  zone_code: string | null
  zone_subtype: string | null
  title: string
  description: string
  coastal_planning_exposure: boolean
  nearby_risk_geometry: GeoJSON.FeatureCollection
  sources: BackendSourceStatus[]
}

type BackendWildfireRisk = {
  rating: OfficialWildfireRisk['rating']
  community_name: string | null
  title: string
  description: string
  geometry: GeoJSON.FeatureCollection
  sources: BackendSourceStatus[]
}

type BackendOpenShelters = {
  shelters: Array<{
    id: string
    name: string
    address: string
    city: string
    status: string
    capacity: number | null
    wheelchair_accessible: string
    coordinates: [number, number]
  }>
}

const evacuationCache = new Map<string, Promise<OfficialEvacuationZone>>()
const floodRiskCache = new Map<string, Promise<OfficialFloodRisk>>()
const wildfireRiskCache = new Map<string, Promise<OfficialWildfireRisk>>()
const openSheltersCache = new Map<string, Promise<OfficialOpenShelter[]>>()

function coordinateKey(coordinates: [number, number]) {
  return coordinates.map((value) => value.toFixed(5)).join(',')
}

function coordinateParams(coordinates: [number, number]) {
  return { lat: coordinates[1], lon: coordinates[0] }
}

function cachedRequest<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>,
) {
  const cached = cache.get(key)
  if (cached) return cached

  const request = load()
  cache.set(key, request)
  void request.catch(() => cache.delete(key))
  return request
}

export function fetchOfficialEvacuationZone(coordinates: [number, number]) {
  const key = coordinateKey(coordinates)
  return cachedRequest(evacuationCache, key, async () => {
    const result = await backendGet<BackendTsunamiRisk>(
      '/api/v1/risk/tsunami',
      coordinateParams(coordinates),
    )
    return {
      status: result.status,
      zoneType: result.zone_type,
      description: result.description,
      geometry: result.geometry,
      source: describeBackendSources(result.sources),
    }
  })
}

export function fetchOfficialFloodRisk(coordinates: [number, number]) {
  const key = coordinateKey(coordinates)
  return cachedRequest(floodRiskCache, key, async () => {
    const result = await backendGet<BackendFloodRisk>(
      '/api/v1/risk/flood',
      coordinateParams(coordinates),
    )
    return {
      classification: result.classification,
      zoneCode: result.zone_code,
      zoneSubtype: result.zone_subtype,
      title: result.title,
      description: result.description,
      coastalPlanningExposure: result.coastal_planning_exposure,
      nearbyRiskGeometry: result.nearby_risk_geometry,
      source: describeBackendSources(result.sources),
    }
  })
}

export function fetchOfficialWildfireRisk(coordinates: [number, number]) {
  const key = coordinateKey(coordinates)
  return cachedRequest(wildfireRiskCache, key, async () => {
    const result = await backendGet<BackendWildfireRisk>(
      '/api/v1/risk/wildfire',
      coordinateParams(coordinates),
    )
    return {
      rating: result.rating,
      communityName: result.community_name,
      title: result.title,
      description: result.description,
      geometry: result.geometry,
      source: describeBackendSources(result.sources),
    }
  })
}

export function fetchOfficialOpenShelters(coordinates: [number, number]) {
  const key = coordinateKey(coordinates)
  return cachedRequest(openSheltersCache, key, async () => {
    const result = await backendGet<BackendOpenShelters>(
      '/api/v1/shelters/open',
      coordinateParams(coordinates),
    )
    return result.shelters.map((shelter) => ({
      id: shelter.id,
      name: shelter.name,
      address: shelter.address,
      city: shelter.city,
      status: shelter.status,
      capacity: shelter.capacity,
      wheelchairAccessible: shelter.wheelchair_accessible,
      coordinates: shelter.coordinates,
    }))
  })
}

function distanceSquared(first: [number, number], second: [number, number]) {
  return (first[0] - second[0]) ** 2 + (first[1] - second[1]) ** 2
}

export function findNearestOfficialOpenShelter(
  shelters: OfficialOpenShelter[],
  coordinates: [number, number],
) {
  return [...shelters].sort(
    (first, second) =>
      distanceSquared(first.coordinates, coordinates) -
      distanceSquared(second.coordinates, coordinates),
  )[0]
}
