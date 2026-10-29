import { useEffect, useState } from 'react'
import type { HazardId } from './mock-data'
import {
  fetchOfficialEvacuationZone,
  fetchOfficialFloodRisk,
  fetchOfficialWildfireRisk,
} from './official-emergency-data'

type HazardLayer = {
  status: 'loading' | 'ready' | 'unavailable'
  geometry: GeoJSON.FeatureCollection
  description: string
}
const empty: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
}

export function useAfnHazard(
  coordinates: [number, number],
  hazard: HazardId,
  enabled: boolean,
) {
  const [longitude, latitude] = coordinates
  const [state, setState] = useState<HazardLayer>({
    status: 'loading',
    geometry: empty,
    description: '',
  })
  const key = `${longitude},${latitude}:${hazard}`
  const [loadedKey, setLoadedKey] = useState('')
  useEffect(() => {
    let active = true
    if (!enabled) return
    setState({
      status: 'loading',
      geometry: empty,
      description: 'Checking official mapped hazard context…',
    })
    setLoadedKey(key)
    const point: [number, number] = [longitude, latitude]
    const request =
      hazard === 'tsunami'
        ? fetchOfficialEvacuationZone(point).then((result) => ({
            geometry: result.geometry,
            description: `Tsunami zone at community center: ${result.zoneType ?? result.status}. ${result.source}`,
          }))
        : hazard === 'wildfire'
          ? fetchOfficialWildfireRisk(point).then((result) => ({
              geometry: result.geometry,
              description: `${result.title}. ${result.source}`,
            }))
          : fetchOfficialFloodRisk(point).then((result) => ({
              geometry: result.nearbyRiskGeometry,
              description: `${hazard === 'hurricane' ? 'Hurricane: flood context only, not wind or surge exposure. ' : ''}${result.title}. ${result.source}`,
            }))
    void request
      .then((result) => {
        if (active) setState({ status: 'ready', ...result })
      })
      .catch(() => {
        if (active)
          setState({
            status: 'unavailable',
            geometry: empty,
            description:
              'Official hazard layer unavailable. No hazard boundary or all-clear is inferred.',
          })
      })
    return () => {
      active = false
    }
  }, [enabled, hazard, key, latitude, longitude])
  return loadedKey === key
    ? state
    : {
        status: 'loading' as const,
        geometry: empty,
        description: 'Checking official mapped hazard context…',
      }
}
