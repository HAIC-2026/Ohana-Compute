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

type ArcGisFeature = {
  type: 'Feature'
  id?: number | string
  geometry: GeoJSON.Geometry | null
  properties: Record<string, unknown>
}

type ArcGisFeatureCollection = {
  type: 'FeatureCollection'
  features: ArcGisFeature[]
}

const evacuationCache = new Map<string, Promise<OfficialEvacuationZone>>()
const floodRiskCache = new Map<string, Promise<OfficialFloodRisk>>()
const wildfireRiskCache = new Map<string, Promise<OfficialWildfireRisk>>()
let openSheltersRequest: Promise<OfficialOpenShelter[]> | null = null

function coordinateKey(coordinates: [number, number]) {
  return coordinates.map((value) => value.toFixed(5)).join(',')
}

export function fetchOfficialEvacuationZone(coordinates: [number, number]) {
  const key = coordinateKey(coordinates)
  const cached = evacuationCache.get(key)
  if (cached) return cached

  const params = new URLSearchParams({
    geometry: coordinates.join(','),
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'zone_type,zone_desc,zone_code,evac_zone,mapname',
    returnGeometry: 'true',
    outSR: '4326',
    maxAllowableOffset: '0.0001',
    geometryPrecision: '5',
    f: 'geojson',
  })
  const request = fetch(
    `https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/11/query?${params}`,
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `Hawaiʻi evacuation-zone request failed with ${response.status}`,
        )
      }
      return (await response.json()) as ArcGisFeatureCollection
    })
    .then((collection): OfficialEvacuationZone => {
      const feature = collection.features.at(0)
      if (!feature) {
        return {
          status: 'outside',
          zoneType: null,
          description:
            'This point is outside the mapped tsunami evacuation and extreme tsunami evacuation zones.',
          geometry: {
            type: 'FeatureCollection',
            features: [],
          },
          source: 'Hawaiʻi Statewide GIS Program · Oʻahu source April 2025',
        }
      }

      return {
        status: 'inside',
        zoneType: String(
          feature.properties.zone_type ?? 'Tsunami evacuation zone',
        ),
        description: String(
          feature.properties.zone_desc ??
            'Follow official tsunami evacuation instructions.',
        ),
        geometry: {
          type: 'FeatureCollection',
          features: [feature as GeoJSON.Feature],
        },
        source: 'Hawaiʻi Statewide GIS Program · Oʻahu source April 2025',
      }
    })

  evacuationCache.set(key, request)
  void request.catch(() => {
    evacuationCache.delete(key)
  })
  return request
}

function floodClassification(properties: Record<string, unknown> | undefined) {
  const zoneCode = properties?.fld_zone ? String(properties.fld_zone) : null
  const zoneSubtype = properties?.zone_subty
    ? String(properties.zone_subty)
    : null
  const isSpecialFloodHazardArea = properties?.sfha_tf === 'T'

  if (isSpecialFloodHazardArea) {
    return {
      classification: 'high' as const,
      zoneCode,
      zoneSubtype,
      title: `Inside FEMA Zone ${zoneCode ?? 'A'} high-risk flood area`,
      description:
        'This is a Special Flood Hazard Area with at least a 1% annual chance of flooding. A specific storm can flood beyond the mapped boundary.',
    }
  }

  if (zoneSubtype?.includes('0.2 PCT ANNUAL CHANCE')) {
    return {
      classification: 'moderate' as const,
      zoneCode,
      zoneSubtype,
      title: 'Inside the 0.2%-annual-chance flood area',
      description:
        'This is a mapped moderate-risk flood area. Flooding can still be deeper or wider during a specific storm.',
    }
  }

  if (zoneCode === 'D') {
    return {
      classification: 'undetermined' as const,
      zoneCode,
      zoneSubtype,
      title: 'Flood risk is undetermined (FEMA Zone D)',
      description:
        'FEMA has not completed a detailed flood analysis for this zone. Zone D does not mean low risk.',
    }
  }

  if (zoneCode === 'X') {
    return {
      classification: 'lower-mapped' as const,
      zoneCode,
      zoneSubtype,
      title: 'Outside FEMA’s mapped high-risk flood area',
      description:
        'This point is in Zone X, but flooding can still occur outside mapped floodplains and during drainage, rainfall, or coastal events.',
    }
  }

  return {
    classification: 'unmapped' as const,
    zoneCode,
    zoneSubtype,
    title: 'No FEMA flood-zone classification returned',
    description:
      'The official layer did not return a mapped classification for this point. Do not interpret that as no flood risk.',
  }
}

export function fetchOfficialFloodRisk(coordinates: [number, number]) {
  const key = coordinateKey(coordinates)
  const cached = floodRiskCache.get(key)
  if (cached) return cached

  const [longitude, latitude] = coordinates
  const envelope = [
    longitude - 0.04,
    latitude - 0.035,
    longitude + 0.04,
    latitude + 0.035,
  ].join(',')
  const pointParams = new URLSearchParams({
    geometry: coordinates.join(','),
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'fld_zone,zone_subty,sfha_tf,static_bfe,depth',
    returnGeometry: 'false',
    outSR: '4326',
    maxAllowableOffset: '0.00015',
    geometryPrecision: '5',
    f: 'geojson',
  })
  const nearbyParams = new URLSearchParams({
    where: "sfha_tf='T' OR zone_subty='0.2 PCT ANNUAL CHANCE FLOOD HAZARD'",
    geometry: envelope,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'fld_zone,zone_subty,sfha_tf',
    returnGeometry: 'true',
    outSR: '4326',
    maxAllowableOffset: '0.00015',
    geometryPrecision: '5',
    f: 'geojson',
  })
  const coastalParams = new URLSearchParams({
    geometry: coordinates.join(','),
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'zone',
    returnGeometry: 'false',
    f: 'geojson',
  })

  const request = Promise.all([
    fetch(
      `https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/6/query?${pointParams}`,
    ),
    fetch(
      `https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/6/query?${nearbyParams}`,
    ),
    fetch(
      `https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/15/query?${coastalParams}`,
    ),
  ])
    .then(async (responses) => {
      const failedResponse = responses.find((response) => !response.ok)
      if (failedResponse) {
        throw new Error(
          `Hawaiʻi flood-risk request failed with ${failedResponse.status}`,
        )
      }
      return Promise.all(
        responses.map(
          async (response) =>
            (await response.json()) as ArcGisFeatureCollection,
        ),
      )
    })
    .then(([pointCollection, nearbyCollection, coastalCollection]) => {
      const pointFeature = pointCollection.features.at(0)
      const classification = floodClassification(pointFeature?.properties)
      return {
        ...classification,
        coastalPlanningExposure: coastalCollection.features.length > 0,
        nearbyRiskGeometry: nearbyCollection as GeoJSON.FeatureCollection,
        source:
          'FEMA National Flood Hazard Layer via Hawaiʻi Statewide GIS · June 2026',
      }
    })

  floodRiskCache.set(key, request)
  void request.catch(() => {
    floodRiskCache.delete(key)
  })
  return request
}

export function fetchOfficialWildfireRisk(coordinates: [number, number]) {
  const key = coordinateKey(coordinates)
  const cached = wildfireRiskCache.get(key)
  if (cached) return cached

  const params = new URLSearchParams({
    geometry: coordinates.join(','),
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'commu_name,risk_rating,island,zone',
    returnGeometry: 'true',
    outSR: '4326',
    maxAllowableOffset: '0.00015',
    geometryPrecision: '5',
    f: 'geojson',
  })
  const request = fetch(
    `https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/7/query?${params}`,
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `Hawaiʻi wildfire-risk request failed with ${response.status}`,
        )
      }
      return (await response.json()) as ArcGisFeatureCollection
    })
    .then((collection): OfficialWildfireRisk => {
      const feature = collection.features.at(0)
      if (!feature) {
        return {
          rating: 'Unmapped',
          communityName: null,
          title: 'No statewide wildfire-risk area returned',
          description:
            'The planning layer does not classify this point. That does not mean there is no wildfire or smoke risk during an active incident.',
          geometry: {
            type: 'FeatureCollection',
            features: [],
          },
          source:
            'Hawaiʻi DLNR-DOFAW Fire Risk Areas · planning boundaries reviewed 2022',
        }
      }

      const rawRating = String(feature.properties.risk_rating ?? 'N/A')
      const rating = (
        ['High', 'Medium', 'Low', 'N/A'].includes(rawRating) ? rawRating : 'N/A'
      ) as OfficialWildfireRisk['rating']
      const communityName = feature.properties.commu_name
        ? String(feature.properties.commu_name)
        : null
      return {
        rating,
        communityName,
        title: `${rating} mapped wildfire risk${
          communityName ? ` · ${communityName}` : ''
        }`,
        description:
          'This is a community planning risk rating, not a live fire perimeter. Follow current evacuation warnings, smoke conditions, and road closures.',
        geometry: {
          type: 'FeatureCollection',
          features: [feature as GeoJSON.Feature],
        },
        source:
          'Hawaiʻi DLNR-DOFAW Fire Risk Areas · planning boundaries reviewed 2022',
      }
    })

  wildfireRiskCache.set(key, request)
  void request.catch(() => {
    wildfireRiskCache.delete(key)
  })
  return request
}

export function fetchOfficialOpenShelters() {
  if (openSheltersRequest) return openSheltersRequest

  const params = new URLSearchParams({
    where: '1=1',
    geometry: '-161,18,-154,23',
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
  })
  openSheltersRequest = fetch(
    `https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/MapServer/0/query?${params}`,
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `FEMA open-shelter request failed with ${response.status}`,
        )
      }
      return (await response.json()) as ArcGisFeatureCollection
    })
    .then((collection) =>
      collection.features.flatMap((feature) => {
        if (feature.geometry?.type !== 'Point') return []
        const properties = feature.properties
        return [
          {
            id: String(
              properties.shelter_id ?? feature.id ?? properties.objectid,
            ),
            name: String(properties.shelter_name ?? 'Open shelter'),
            address: String(properties.address ?? ''),
            city: String(properties.city ?? ''),
            status: String(properties.shelter_status ?? 'OPEN'),
            capacity:
              typeof properties.evacuation_capacity === 'number'
                ? properties.evacuation_capacity
                : null,
            wheelchairAccessible: String(
              properties.wheelchair_accessible ?? 'Unknown',
            ),
            coordinates: feature.geometry.coordinates as [number, number],
          },
        ]
      }),
    )

  void openSheltersRequest.catch(() => {
    openSheltersRequest = null
  })
  return openSheltersRequest
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
