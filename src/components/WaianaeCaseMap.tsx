import { useEffect, useState } from 'react'
import { setWorkerUrl } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import {
  Layer,
  Map as MapLibre,
  Marker,
  NavigationControl,
  Source,
} from 'react-map-gl/maplibre'

import { practiceLocation } from '../lib/waianae-case'
import { floodEvidenceText, parseFloodEvidence } from '../lib/waianae-geography'
import type { FloodEvidence } from '../lib/waianae-geography'

const mapStyle = {
  version: 8 as const,
  sources: {
    coastline: {
      type: 'geojson' as const,
      data: '/hawaii-coastline.geojson',
      attribution: 'U.S. Census Bureau · Hawaiʻi boundary',
    },
    streets: {
      type: 'raster' as const,
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution:
        'Esri, HERE, Garmin, USGS, OpenStreetMap contributors · Reference only, not passability',
    },
  },
  layers: [
    {
      id: 'case-ocean',
      type: 'background' as const,
      paint: { 'background-color': '#c9e2ec' },
    },
    {
      id: 'case-land',
      type: 'fill' as const,
      source: 'coastline',
      paint: { 'fill-color': '#e5e9d8' },
    },
    {
      id: 'case-coast',
      type: 'line' as const,
      source: 'coastline',
      paint: { 'line-color': '#527b83', 'line-width': 1.5 },
    },
    {
      id: 'case-streets',
      type: 'raster' as const,
      source: 'streets',
      paint: { 'raster-fade-duration': 0 },
    },
  ],
}

const disruptions = [
  {
    id: 'H1',
    longitude: -158.1900636120798,
    latitude: 21.448965580650423,
    label: 'Assumed bridge / pinch-point disruption',
  },
  {
    id: 'H2',
    longitude: -158.181,
    latitude: 21.432,
    label: 'Assumed flooded-road access disruption',
  },
]

export function WaianaeCaseMap({
  onEvidence,
}: {
  onEvidence: (text: string) => void
}) {
  const [client, setClient] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [flood, setFlood] = useState<FloodEvidence | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [showFlood, setShowFlood] = useState(true)
  const [showAssumptions, setShowAssumptions] = useState(true)
  const [streetError, setStreetError] = useState(false)
  const [coastError, setCoastError] = useState(false)

  useEffect(() => {
    setWorkerUrl(maplibreWorkerUrl)
    setClient(true)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    onEvidence('')
    void fetch('/waianae-flood-context.geojson', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Flood snapshot HTTP ${response.status}`)
        return parseFloodEvidence(await response.json())
      })
      .then((evidence) => {
        if (controller.signal.aborted) return
        setFlood(evidence)
        onEvidence(floodEvidenceText(evidence))
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setFlood(null)
        setError(
          'Official flood snapshot could not be loaded or validated. No replacement flood polygons are shown; source risk is unknown.',
        )
        onEvidence(floodEvidenceText(null))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [attempt, onEvidence])

  return (
    <section className="case-geography" aria-labelledby="case-map-title">
      <div className="case-map-heading">
        <h2 id="case-map-title">Kupuna A in Waiʻanae</h2>
        <p>
          <strong>Fictional person · illustrative point.</strong> Not a home,
          address, registry or inference about anyone living here.
        </p>
        <p>
          Public park reference only—not a pickup point, shelter or safe
          destination.
        </p>
        <div className="case-map-legend">
          <label>
            <input
              type="checkbox"
              checked={showFlood}
              onChange={(event) => setShowFlood(event.target.checked)}
            />
            <i className="case-flood-key" /> Source flood polygons
          </label>
          <label>
            <input
              type="checkbox"
              checked={showAssumptions}
              onChange={(event) => setShowAssumptions(event.target.checked)}
            />
            <i className="case-assumption-key" /> Hypothetical access concerns
          </label>
        </div>
      </div>
      <div
        className="case-interactive-map"
        data-testid="case-map"
        data-map-ready={loaded}
        data-flood-features={flood?.counts['flood-zone'] ?? 0}
      >
        {client && (
          <MapLibre
            initialViewState={{
              longitude: -158.188,
              latitude: 21.445,
              zoom: 13,
            }}
            mapStyle={mapStyle}
            minZoom={10}
            maxZoom={16}
            onLoad={() => setLoaded(true)}
            onError={(event) => {
              if ('sourceId' in event && event.sourceId === 'streets')
                setStreetError(true)
              if ('sourceId' in event && event.sourceId === 'coastline')
                setCoastError(true)
            }}
            attributionControl={{ compact: true }}
          >
            <NavigationControl position="top-right" showCompass={false} />
            {flood && (
              <Source
                id="case-official-flood"
                type="geojson"
                data={flood.geometry}
              >
                <Layer
                  id="case-flood-fill"
                  type="fill"
                  layout={{ visibility: showFlood ? 'visible' : 'none' }}
                  filter={[
                    'all',
                    ['==', ['get', 'context_kind'], 'flood-zone'],
                    ['==', ['geometry-type'], 'Polygon'],
                  ]}
                  paint={{
                    'fill-color': [
                      'match',
                      ['get', 'case_zone'],
                      ['A', 'AE', 'AH', 'AO', 'V', 'VE'],
                      '#b04b40',
                      '#527b83',
                    ],
                    'fill-opacity': 0.3,
                  }}
                />
                <Layer
                  id="case-flood-outline"
                  type="line"
                  layout={{ visibility: showFlood ? 'visible' : 'none' }}
                  filter={['==', ['get', 'context_kind'], 'flood-zone']}
                  paint={{ 'line-color': '#8c382e', 'line-width': 1.4 }}
                />
                <Layer
                  id="case-source-waterways"
                  type="line"
                  filter={['==', ['get', 'context_kind'], 'waterway']}
                  paint={{ 'line-color': '#256c9f', 'line-width': 2 }}
                />
                <Layer
                  id="case-source-roads"
                  type="line"
                  filter={['==', ['get', 'context_kind'], 'road-centerline']}
                  paint={{ 'line-color': '#526366', 'line-width': 1.5 }}
                />
                <Layer
                  id="case-source-bridges"
                  type="circle"
                  filter={[
                    '==',
                    ['get', 'context_kind'],
                    'bridge-inventory-point',
                  ]}
                  paint={{
                    'circle-color': '#ffffff',
                    'circle-stroke-color': '#263436',
                    'circle-stroke-width': 2,
                    'circle-radius': 4,
                  }}
                />
              </Source>
            )}
            <Marker
              longitude={practiceLocation[0]}
              latitude={practiceLocation[1]}
              anchor="bottom"
            >
              <div
                className="case-person-marker"
                aria-label="Kupuna A, fictional illustrative location"
              >
                <strong>A</strong>
                <span>Kupuna A · fictional</span>
              </div>
            </Marker>
            {showAssumptions &&
              disruptions.map((item) => (
                <Marker
                  key={item.id}
                  longitude={item.longitude}
                  latitude={item.latitude}
                >
                  <div
                    className="case-disruption-marker"
                    title={`${item.id}: ${item.label}. Exercise-only, not a condition report or closure.`}
                    aria-label={`${item.id}: hypothetical access concern`}
                  >
                    <strong>{item.id}</strong>
                  </div>
                </Marker>
              ))}
          </MapLibre>
        )}
      </div>
      <div className="case-map-body">
        {(streetError || coastError) && (
          <p role="status">
            {streetError ? 'Street map interrupted. ' : ''}
            {coastError
              ? 'Coastline reference unavailable. '
              : 'Bundled coastline remains as geographic reference. '}
            No road-level navigation or passability is established.
          </p>
        )}
        {loading && <p role="status">Loading saved official flood evidence…</p>}
        {error && (
          <p role="alert">
            {error}{' '}
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Retry source snapshot
            </button>
          </p>
        )}
        {flood && (
          <p data-testid="case-flood-summary">
            <strong>
              {flood.counts['flood-zone']} official flood polygons · classes{' '}
              {flood.zones.join(', ')}.
            </strong>{' '}
            Static FEMA flood hazard context, not predicted storm inundation,
            access failure or an evacuation order. A/AE/VE are mapped special
            flood hazard zones; X does not mean no flood risk.
          </p>
        )}
        {flood && (
          <p>
            {flood.counts['road-centerline']} sourced road centerlines (gray),{' '}
            {flood.counts.waterway} waterways (blue),{' '}
            {flood.counts['bridge-inventory-point']} bridge inventory points
            (white circles). Location inventory only—not inspections or live
            access.
          </p>
        )}
        <dl className="case-evidence-list">
          <div>
            <dt>H1 · assumed</dt>
            <dd>
              Hypothetical disruption at the inventoried Farr Highway / Kaupuni
              Stream crossing (NBI objectid 391). The crossing is sourced; its
              failure is not. No inspection or collapse forecast is connected.
            </dd>
          </div>
          <div>
            <dt>H2 · assumed</dt>
            <dd>
              Flooded-road disruption in the exercise. The circle does not mark
              a confirmed closure, road segment or flooded extent.
            </dd>
          </div>
        </dl>
        <details className="case-disclosure">
          <summary>Source provenance and map limits</summary>
          {flood?.sources.map((source) => (
            <p key={source.url}>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.authority}
              </a>{' '}
              · {source.vintage} · retrieved {source.retrieved_at.slice(0, 10)}.
            </p>
          ))}
          <p>
            Source polygons are preserved independently from the fictional
            marker and purple exercise overlays. No person’s flood exposure,
            safe route, road passability, bridge condition, legal evacuation
            zone or order is inferred. Street tiles are reference only.
          </p>
          <p>
            Flood geometry is server-generalized at 0.000025° (about 2.8 m), not
            clipped. Road/waterway coordinates are rounded to six decimals. No
            engineering topology or road-flood intersection analysis is
            certified.
          </p>
          <p>
            Refresh official data before operational use.{' '}
            <a href="/waianae-flood-context.geojson" download>
              Download the saved polygons and source metadata
            </a>
            .
          </p>
        </details>
      </div>
    </section>
  )
}
