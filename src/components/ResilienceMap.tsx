import {
  memo,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { setWorkerUrl } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import {
  Layer,
  Map as MapLibre,
  Marker,
  NavigationControl,
  Source,
} from 'react-map-gl/maplibre'
import type { MapRef } from 'react-map-gl/maplibre'
import { useShallow } from 'zustand/react/shallow'
import {
  BusFront,
  HousePlus,
  MapPin,
  Route as RouteIcon,
  ShieldCheck,
  Users,
} from 'lucide-react'

import {
  areas,
  activeEvents,
  getLocalResourceInventory,
  hazardGeometry,
  hazards,
  residentRoutePlans,
  vulnerabilityGeometry,
} from '../lib/mock-data'
import type { LayerId } from '../lib/mock-data'
import type { GeographicFocus } from '../lib/geographic-focus'
import {
  fetchOfficialEvacuationZone,
  fetchOfficialFloodRisk,
  fetchOfficialWildfireRisk,
} from '../lib/official-emergency-data'
import { markBrowserLifecycle } from '../lib/browser-telemetry'
import {
  findStatewidePlanningArea,
  getCatalogResourceInventory,
  usesCatalogWorkflow,
  usePlanningAreaCatalog,
} from '../lib/planning-areas'
import type {
  OfficialEvacuationZone,
  OfficialFloodRisk,
  OfficialWildfireRisk,
} from '../lib/official-emergency-data'
import { usePlanningStore } from '../store/planning-store'
import {
  afnCountyForArea,
  afnCounties,
  afnDisplayGeometry,
  afnIndicators,
  useAfnMap,
  useCountyAfnLayer,
} from '../lib/afn-map'
import { useAfnHazard } from '../lib/afn-hazard'
import { formatAggregateMetric } from '../lib/community-profile'

const emptyHazardGeometry = {
  type: 'FeatureCollection' as const,
  features: [],
}
const emptyOfficialGeometry: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
}

const mapStyle = {
  version: 8 as const,
  sources: {
    coastline: {
      type: 'geojson' as const,
      data: '/hawaii-coastline.geojson',
      attribution: 'U.S. Census Bureau · Hawaiʻi state boundary',
    },
    carto: {
      type: 'raster' as const,
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        'Sources: Esri, HERE, Garmin, USGS, OpenStreetMap contributors, and the GIS user community · Synthetic planning overlays',
    },
  },
  layers: [
    {
      id: 'ocean',
      type: 'background' as const,
      paint: { 'background-color': '#c9e2ec' },
    },
    {
      id: 'hawaii-land',
      type: 'fill' as const,
      source: 'coastline',
      paint: { 'fill-color': '#e5e9d8' },
    },
    {
      id: 'hawaii-coastline',
      type: 'line' as const,
      source: 'coastline',
      paint: { 'line-color': '#527b83', 'line-width': 1.5 },
    },
    {
      id: 'carto',
      type: 'raster' as const,
      source: 'carto',
      minzoom: 0,
      maxzoom: 20,
      paint: {
        'raster-fade-duration': 0,
      },
    },
  ],
}

function readColor(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
}

const selectPlanningMapState = (
  state: ReturnType<typeof usePlanningStore.getState>,
) => ({
  statewideOverview: state.statewideOverview,
  activeLayers: state.activeLayers,
  hazard: state.hazard,
  selectedEventId: state.selectedEventId,
  confirmedResourceIds: state.confirmedResourceIds,
  selectedAreaId: state.selectedAreaId,
  selectedResidentPlanId: state.selectedResidentPlanId,
  selectedResidentResourceId: state.selectedResidentResourceId,
  residentNoCar: state.residentNoCar,
  mobilePanel: state.mobilePanel,
  locationFocus: state.locationFocus,
  selectedPlanningZoneId: state.selectedPlanningZoneId,
  setSelectedAreaId: state.setSelectedAreaId,
  selectPlanningZone: state.selectPlanningZone,
  setMobilePanel: state.setMobilePanel,
  selectResource: state.selectResource,
  toggleLayer: state.toggleLayer,
})

type PlanningMapState = ReturnType<typeof selectPlanningMapState>

type FocusEntry = { area: { id: string }; focus: GeographicFocus }

export function ResilienceMap({
  focusEntries,
}: {
  focusEntries?: FocusEntry[]
}) {
  const planningState = usePlanningStore(useShallow(selectPlanningMapState))
  const deferredPlanningState = useDeferredValue(planningState)

  return (
    <ResilienceMapContent
      planningState={deferredPlanningState}
      displayEventId={planningState.selectedEventId}
      displayHazard={planningState.hazard}
      focusEntries={focusEntries}
    />
  )
}

const ResilienceMapContent = memo(function ResilienceMapContent({
  planningState,
  displayEventId,
  displayHazard,
  focusEntries,
}: {
  planningState: PlanningMapState
  displayEventId: string | null
  displayHazard: PlanningMapState['hazard']
  focusEntries?: FocusEntry[]
}) {
  const {
    statewideOverview,
    activeLayers,
    hazard,
    selectedEventId,
    confirmedResourceIds,
    selectedAreaId,
    selectedResidentPlanId,
    selectedResidentResourceId,
    residentNoCar,
    mobilePanel,
    locationFocus,
    selectedPlanningZoneId,
    setSelectedAreaId,
    selectPlanningZone,
    setMobilePanel,
    selectResource,
    toggleLayer,
  } = planningState
  const [isClient, setIsClient] = useState(false)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [streetMapUnavailable, setStreetMapUnavailable] = useState(false)
  const [geographyUnavailable, setGeographyUnavailable] = useState(false)
  const [geographyVisible, setGeographyVisible] = useState(false)
  const [afnVisible, setAfnVisible] = useState(false)
  const [colorVersion, setColorVersion] = useState(0)
  const [officialEvacuationZone, setOfficialEvacuationZone] =
    useState<OfficialEvacuationZone | null>(null)
  const [officialFloodRisk, setOfficialFloodRisk] =
    useState<OfficialFloodRisk | null>(null)
  const [officialWildfireRisk, setOfficialWildfireRisk] =
    useState<OfficialWildfireRisk | null>(null)
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 900
  const mapRef = useRef<MapRef>(null)
  const selectedPlanningZone = locationFocus?.planningZones.find(
    (zone) => zone.id === selectedPlanningZoneId,
  )
  const selectedArea =
    areas.find((area) => area.id === selectedAreaId) ?? areas[0]
  const afn = useAfnMap()
  const afnCounty = afnCountyForArea(selectedArea.id, selectedArea.island)
  const afnEnabled = afn.enabled && !statewideOverview
  const afnLayer = useCountyAfnLayer(afnCounty, afnEnabled)
  const afnHazard = useAfnHazard(selectedArea.coordinates, hazard, afnEnabled)
  const afnGeometry = useMemo(
    () => afnDisplayGeometry(afnLayer.data, afn.indicator),
    [afnLayer.data, afn.indicator],
  )
  useEffect(() => afn.setCounty(afnCounty), [afnCounty, afn.setCounty])
  const planningAreaCatalog = usePlanningAreaCatalog()
  const catalogArea = findStatewidePlanningArea(
    planningAreaCatalog.snapshot,
    selectedArea.id,
  )
  const activeEvent =
    activeEvents.find((item) => item.id === selectedEventId) ?? null
  const displayEvent =
    activeEvents.find((item) => item.id === displayEventId) ?? null
  const displaySelectedHazard =
    hazards.find((item) => item.id === displayHazard) ?? hazards[0]
  const currentHazard = activeEvent?.hazard ?? hazard
  const comparingLocations = Boolean(focusEntries)
  const residentPlan =
    residentRoutePlans.find((item) => item.id === selectedResidentPlanId) ??
    residentRoutePlans[0]
  const residentResource =
    residentPlan.resources.find(
      (resource) => resource.id === selectedResidentResourceId,
    ) ?? residentPlan.resources[0]
  const residentTravel = residentNoCar
    ? residentResource.noCar
    : residentResource.drive
  const showResidentRoute =
    !statewideOverview && selectedArea.id === residentPlan.areaId
  const showTsunamiZone = showResidentRoute && currentHazard === 'tsunami'
  const showFloodRisk =
    showResidentRoute && ['hurricane', 'flood'].includes(currentHazard)
  const showWildfireRisk = showResidentRoute && currentHazard === 'wildfire'
  const residentRouteSegments = useMemo(
    () =>
      residentTravel.segments ?? [
        {
          mode: residentNoCar ? ('walk' as const) : ('drive' as const),
          label: residentTravel.label,
          coordinates: residentTravel.coordinates,
        },
      ],
    [residentNoCar, residentTravel],
  )
  const residentRouteGeometry = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: residentRouteSegments.map((segment) => ({
        type: 'Feature' as const,
        properties: {
          mode: segment.mode,
          label: segment.label,
        },
        geometry: {
          type: 'LineString' as const,
          coordinates: segment.coordinates,
        },
      })),
    }),
    [residentRouteSegments],
  )
  const residentFloodGeometry = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: residentPlan.floodZones.map((zone) => ({
        type: 'Feature' as const,
        properties: { name: zone.name },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [zone.coordinates],
        },
      })),
    }),
    [residentPlan.floodZones],
  )
  const localResources =
    (usesCatalogWorkflow(selectedArea)
      ? getCatalogResourceInventory(selectedArea, catalogArea)
      : null) ??
    (usesCatalogWorkflow(selectedArea) && !catalogArea
      ? []
      : getLocalResourceInventory(selectedArea))
  const resourceGroups = (['shelter', 'transport'] as const)
    .map((kind) => {
      const sites = localResources.filter((site) => site.kind === kind)
      const pendingSites = sites.filter(
        (site) =>
          site.status === 'needs-confirmation' &&
          !confirmedResourceIds.includes(site.id),
      )
      return {
        kind,
        sites,
        pendingSites,
        selectedSite: pendingSites[0] ?? sites[0],
        coordinates: [
          sites.reduce((total, site) => total + site.coordinates[0], 0) /
            sites.length +
            (kind === 'shelter' ? -0.07 : 0.07),
          sites.reduce((total, site) => total + site.coordinates[1], 0) /
            sites.length +
            (kind === 'shelter' ? 0.04 : 0.03),
        ] as [number, number],
      }
    })
    .filter((group) => group.sites.length > 0)

  useEffect(() => {
    setWorkerUrl(maplibreWorkerUrl)
    setIsClient(true)
    const observer = new MutationObserver(() =>
      setColorVersion((version) => version + 1),
    )
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    setOfficialEvacuationZone(null)
    setOfficialFloodRisk(null)
    setOfficialWildfireRisk(null)
    if (!showResidentRoute) {
      return () => {
        cancelled = true
      }
    }
    if (currentHazard === 'tsunami') {
      void fetchOfficialEvacuationZone(residentPlan.startCoordinates)
        .then((result) => {
          if (!cancelled) setOfficialEvacuationZone(result)
        })
        .catch(() => {
          if (!cancelled) setOfficialEvacuationZone(null)
        })
    }
    if (currentHazard === 'hurricane' || currentHazard === 'flood') {
      void fetchOfficialFloodRisk(residentPlan.startCoordinates)
        .then((result) => {
          if (!cancelled) setOfficialFloodRisk(result)
        })
        .catch(() => {
          if (!cancelled) setOfficialFloodRisk(null)
        })
    }
    if (currentHazard === 'wildfire') {
      void fetchOfficialWildfireRisk(residentPlan.startCoordinates)
        .then((result) => {
          if (!cancelled) setOfficialWildfireRisk(result)
        })
        .catch(() => {
          if (!cancelled) setOfficialWildfireRisk(null)
        })
    }
    return () => {
      cancelled = true
    }
  }, [
    currentHazard,
    residentPlan.id,
    residentPlan.startCoordinates,
    showResidentRoute,
  ])

  useEffect(() => {
    const focus = selectedPlanningZone ?? locationFocus
    if (!mapLoaded || !focus) return
    mapRef.current?.flyTo({
      center: focus.coordinates,
      zoom: focus.zoom,
      duration: 900,
      essential: true,
    })
  }, [locationFocus, mapLoaded, selectedPlanningZone])

  useEffect(() => {
    if (
      !mapLoaded ||
      statewideOverview ||
      locationFocus ||
      mobilePanel === 'resident' ||
      comparingLocations
    )
      return
    mapRef.current?.flyTo({
      center: selectedArea.coordinates,
      zoom: selectedArea.island === 'Oʻahu' ? 9.15 : 9.3,
      duration: 900,
      essential: true,
    })
  }, [
    locationFocus,
    mapLoaded,
    mobilePanel,
    selectedArea,
    comparingLocations,
    statewideOverview,
  ])

  useEffect(() => {
    if (!mapLoaded || !statewideOverview) return
    const narrow = window.innerWidth <= 900
    mapRef.current?.fitBounds(
      [
        [-160.35, 18.8],
        [-154.7, 22.35],
      ],
      {
        padding: narrow
          ? { top: 100, bottom: 160, left: 25, right: 70 }
          : { top: 90, bottom: 80, left: 340, right: 500 },
        duration: 0,
      },
    )
  }, [mapLoaded, statewideOverview])

  useEffect(() => {
    if (!mapLoaded || !comparingLocations) return
    const points = areas
      .filter(
        (area) =>
          area.island === selectedArea.island &&
          area.showOnStatewideMap !== false,
      )
      .map((area) => area.coordinates)
    if (!points.length) return
    const narrow = window.innerWidth <= 900
    const frameHeight =
      mapRef.current?.getContainer().clientHeight ?? window.innerHeight
    mapRef.current?.fitBounds(
      [
        [
          Math.min(...points.map(([lon]) => lon)) - 0.02,
          Math.min(...points.map(([, lat]) => lat)) - 0.02,
        ],
        [
          Math.max(...points.map(([lon]) => lon)) + 0.02,
          Math.max(...points.map(([, lat]) => lat)) + 0.02,
        ],
      ],
      {
        padding: narrow
          ? {
              top: 100,
              bottom: Math.round(frameHeight * 0.65),
              left: 50,
              right: 50,
            }
          : { top: 80, bottom: 80, left: 470, right: 530 },
        duration: 700,
        maxZoom: 10,
      },
    )
  }, [mapLoaded, comparingLocations, selectedArea.island])

  useEffect(() => {
    if (!mapLoaded || !showResidentRoute || mobilePanel !== 'resident') return
    const coordinates = residentRouteSegments.flatMap(
      (segment) => segment.coordinates,
    )
    const longitudes = coordinates.map((coordinate) => coordinate[0])
    const latitudes = coordinates.map((coordinate) => coordinate[1])
    mapRef.current?.fitBounds(
      [
        [Math.min(...longitudes), Math.min(...latitudes)],
        [Math.max(...longitudes), Math.max(...latitudes)],
      ],
      {
        padding: isMobile
          ? 90
          : {
              top: 100,
              right: 100,
              bottom: 100,
              left: 620,
            },
        maxZoom: 15.5,
        duration: 800,
      },
    )
  }, [
    isMobile,
    mapLoaded,
    mobilePanel,
    residentRouteSegments,
    showResidentRoute,
  ])

  const colors = useMemo(
    () => ({
      danger: readColor('--cp-danger', 'currentColor'),
      accent: readColor('--cp-accent', 'currentColor'),
      warning: readColor('--cp-warning', 'currentColor'),
      success: readColor('--cp-success', 'currentColor'),
      surface: readColor('--cp-surface', 'currentColor'),
      text: readColor('--cp-text', 'currentColor'),
      link: readColor('--cp-link', 'currentColor'),
    }),
    [colorVersion],
  )

  if (!isClient) {
    return <div className="map-loading">Loading island response zones…</div>
  }

  return (
    <div
      className="map-frame"
      data-map-loaded={mapLoaded}
      data-map-geography-visible={geographyVisible}
      data-map-scope={statewideOverview ? 'statewide' : selectedArea.id}
      data-map-afn-county={afnEnabled ? afnCounty : ''}
      data-map-afn-indicator={afnEnabled ? afn.indicator : ''}
      data-map-afn-visible={afnEnabled && afnVisible}
      data-telemetry-category="map"
    >
      {(streetMapUnavailable || geographyUnavailable) && (
        <div className="map-availability" role="status">
          {geographyUnavailable
            ? 'Coastline unavailable'
            : 'Street map interrupted · Coastline view'}
        </div>
      )}
      {afnEnabled && (
        <details
          className="afn-map-legend"
          aria-label="Aggregate AFN map legend"
        >
          <summary>
            {afn.domain} ·{' '}
            {afnCounties.find((item) => item.id === afnCounty)?.name} ·{' '}
            {displayHazard}
          </summary>
          <strong>{afnIndicators[afn.indicator].label}</strong>
          {afnLayer.data?.indicator_definitions?.[afn.indicator] && (
            <p>
              Percentage universe:{' '}
              {afnLayer.data.indicator_definitions[afn.indicator]?.universe}
            </p>
          )}
          <p>{afnIndicators[afn.indicator].note}</p>
          <p className="afn-map-scale">
            <span>0%</span>
            <span>10%</span>
            <span>25%</span>
            <span>50%+</span>
          </p>
          <p>
            Blue: share of the indicator’s ACS universe. Gray: unknown. Amber
            outline: official mapped hazard near community center; not
            countywide hazard coverage or an AFN/hazard intersection.
          </p>
          <p role="status">
            {afnLayer.error ??
              (afnLayer.data
                ? `${afnLayer.data.features.length} public tracts · ${afnLayer.data.status}`
                : 'Loading public tract geometry and estimates…')}
          </p>
          {afnLayer.error && (
            <button type="button" onClick={afnLayer.retry}>
              Retry AFN map
            </button>
          )}
          <p>{afnHazard.description}</p>
          {afnHazard.status === 'ready' &&
            afnHazard.geometry.features.length === 0 && (
              <p>
                No hazard polygon returned near the selected center. This is not
                an all-clear.
              </p>
            )}
          {afnLayer.data?.sources.map((source) => (
            <p key={`${source.id}:${source.county_code}`}>
              {source.authority} · {source.vintage ?? ''} · {source.status}
              {' · '}
              {source.retrieved_at
                ? new Date(source.retrieved_at).toLocaleString()
                : 'Retrieval time unavailable'}
            </p>
          ))}
          {afnLayer.data?.warnings?.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          {afnLayer.data?.source_errors?.map((error) => (
            <p key={error.source}>{error.source}: unavailable</p>
          ))}
          {afnLayer.data && (
            <details>
              <summary>Inspect tract estimates and uncertainty</summary>
              <table>
                <thead>
                  <tr>
                    <th>Tract</th>
                    <th>Estimate</th>
                    <th>± ACS MOE</th>
                  </tr>
                </thead>
                <tbody>
                  {afnLayer.data.features.map((feature) => {
                    const metric = feature.properties.indicators[afn.indicator]
                    return (
                      <tr key={feature.properties.tract_fips}>
                        <th>{feature.properties.name}</th>
                        <td>{formatAggregateMetric(metric, null)}</td>
                        <td>
                          {metric?.margin_of_error?.toLocaleString() ??
                            'Unknown'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </details>
          )}
          <button type="button" onClick={() => afn.setEnabled(false)}>
            Hide aggregate AFN layer
          </button>
        </details>
      )}
      {!statewideOverview && !selectedArea.screeningOnly && !afnEnabled && (
        <nav className="map-story-chips" aria-label="Quick map layers">
          <button
            type="button"
            className={activeLayers.includes('mobility') ? 'is-active' : ''}
            aria-pressed={activeLayers.includes('mobility')}
            onClick={() => toggleLayer('mobility')}
          >
            <Users size={15} />
            People
          </button>
          <button
            type="button"
            className={activeLayers.includes('shelters') ? 'is-active' : ''}
            aria-pressed={activeLayers.includes('shelters')}
            onClick={() => toggleLayer('shelters')}
          >
            <HousePlus size={15} />
            Resources
          </button>
          <button
            type="button"
            className={
              activeLayers.includes('transportation') ? 'is-active' : ''
            }
            aria-pressed={activeLayers.includes('transportation')}
            onClick={() => toggleLayer('transportation')}
          >
            <RouteIcon size={15} />
            Transport needs
          </button>
        </nav>
      )}
      {!statewideOverview && !selectedArea.screeningOnly && !afnEnabled && (
        <div
          className="hazard-legend"
          aria-label={
            selectedArea.island === 'Oʻahu'
              ? `${displayEvent?.name ?? displaySelectedHazard.shortLabel} synthetic scenario footprint; not an official forecast`
              : `${selectedArea.island} regional scenario footprint; validation pending`
          }
        >
          <span className="hazard-legend-swatch" aria-hidden="true" />
          <span className="hazard-legend-copy">
            <strong>
              {selectedArea.island === 'Oʻahu'
                ? `${displayEvent?.name ?? displaySelectedHazard.shortLabel} scenario footprint`
                : `${selectedArea.island} regional scenario footprint`}
            </strong>
            <small>
              {selectedArea.island === 'Oʻahu'
                ? 'Synthetic practice data · not an official forecast'
                : 'Synthetic practice data · validation pending'}
            </small>
          </span>
        </div>
      )}
      {showTsunamiZone &&
        officialEvacuationZone &&
        officialEvacuationZone.geometry.features.length > 0 && (
          <div className="evacuation-zone-legend">
            <span
              aria-hidden="true"
              className={
                officialEvacuationZone.zoneType === 'Tsunami Safe Zone'
                  ? 'is-safe'
                  : ''
              }
            />
            Official {officialEvacuationZone.zoneType?.toLowerCase()}
          </div>
        )}
      {showFloodRisk &&
        officialFloodRisk &&
        officialFloodRisk.nearbyRiskGeometry.features.length > 0 && (
          <div
            className={`flood-risk-legend ${
              showTsunamiZone ? 'has-tsunami' : ''
            }`}
          >
            <span aria-hidden="true" className="is-high" />
            <span aria-hidden="true" className="is-moderate" />
            FEMA flood risk areas · 1% and 0.2% annual chance
          </div>
        )}
      {showWildfireRisk && officialWildfireRisk && (
        <div className="wildfire-risk-legend">
          <span aria-hidden="true" />
          Official wildfire planning risk · {officialWildfireRisk.rating}
        </div>
      )}
      <MapLibre
        ref={mapRef}
        onLoad={() => {
          setMapLoaded(true)
          markBrowserLifecycle('map_ready')
        }}
        onError={(event) => {
          if (!('sourceId' in event)) return
          if (event.sourceId === 'carto') setStreetMapUnavailable(true)
          if (event.sourceId === 'coastline') setGeographyUnavailable(true)
        }}
        onIdle={() => {
          const map = mapRef.current
          if (!map) return
          setAfnVisible(
            Boolean(map.getLayer('county-afn-tract-fill')) &&
              map.queryRenderedFeatures(undefined, {
                layers: ['county-afn-tract-fill'],
              }).length > 0,
          )
          setGeographyVisible(
            map.queryRenderedFeatures(undefined, {
              layers: ['hawaii-coastline'],
            }).length > 0,
          )
        }}
        initialViewState={{
          longitude: statewideOverview ? -157.5 : -157.97,
          latitude: statewideOverview ? 20.6 : isMobile ? 21.39 : 21.45,
          zoom: statewideOverview ? 6 : isMobile ? 8.85 : 9.15,
        }}
        mapStyle={mapStyle}
        minZoom={5}
        maxZoom={16}
        fadeDuration={0}
        attributionControl={{}}
      >
        <NavigationControl position="bottom-right" showCompass={false} />
        {afnEnabled && (
          <>
            <Source id="county-afn-tracts" type="geojson" data={afnGeometry}>
              <Layer
                id="county-afn-tract-fill"
                type="fill"
                paint={{
                  'fill-color': [
                    'case',
                    ['==', ['get', 'percent'], null],
                    '#858c92',
                    [
                      'interpolate',
                      ['linear'],
                      ['get', 'percent'],
                      0,
                      '#e8f4fa',
                      10,
                      '#9ccfe6',
                      25,
                      '#4388ba',
                      50,
                      '#173f72',
                    ],
                  ],
                  'fill-opacity': 0.6,
                }}
              />
              <Layer
                id="county-afn-tract-line"
                type="line"
                paint={{ 'line-color': '#315c78', 'line-width': 0.8 }}
              />
            </Source>
            <Source
              id="afn-official-hazard"
              type="geojson"
              data={afnHazard.geometry}
            >
              <Layer
                id="afn-official-hazard-fill"
                type="fill"
                paint={{ 'fill-color': '#ad5200', 'fill-opacity': 0.12 }}
              />
              <Layer
                id="afn-official-hazard-line"
                type="line"
                paint={{ 'line-color': '#ad5200', 'line-width': 2.5 }}
              />
            </Source>
          </>
        )}

        <Source
          id="hazard-exposure"
          type="geojson"
          data={
            !statewideOverview && !afnEnabled && selectedArea.island === 'Oʻahu'
              ? hazardGeometry[hazard]
              : emptyHazardGeometry
          }
        >
          <Layer
            id="hazard-exposure-fill"
            type="fill"
            paint={{
              'fill-color': colors.danger,
              'fill-opacity': 0.045,
            }}
          />
          <Layer
            id="hazard-exposure-line"
            type="line"
            paint={{
              'line-color': colors.danger,
              'line-width': 2,
              'line-opacity': 0.72,
              'line-dasharray': [2, 2],
            }}
          />
        </Source>

        {showResidentRoute && (
          <>
            {showTsunamiZone && (
              <Source
                id="official-evacuation-zone"
                type="geojson"
                data={officialEvacuationZone?.geometry ?? emptyOfficialGeometry}
              >
                <Layer
                  id="official-evacuation-zone-fill"
                  type="fill"
                  paint={{
                    'fill-color':
                      officialEvacuationZone?.zoneType === 'Tsunami Safe Zone'
                        ? colors.success
                        : colors.warning,
                    'fill-opacity': 0.12,
                  }}
                />
                <Layer
                  id="official-evacuation-zone-line"
                  type="line"
                  paint={{
                    'line-color':
                      officialEvacuationZone?.zoneType === 'Tsunami Safe Zone'
                        ? colors.success
                        : colors.warning,
                    'line-width': 2.4,
                    'line-opacity': 0.9,
                    'line-dasharray': [3, 1.5],
                  }}
                />
              </Source>
            )}

            {showFloodRisk && (
              <>
                <Source
                  id="official-flood-risk-areas"
                  type="geojson"
                  data={
                    officialFloodRisk?.nearbyRiskGeometry ??
                    emptyOfficialGeometry
                  }
                >
                  <Layer
                    id="official-flood-high-fill"
                    type="fill"
                    filter={['==', ['get', 'sfha_tf'], 'T']}
                    paint={{
                      'fill-color': colors.danger,
                      'fill-opacity': 0.14,
                    }}
                  />
                  <Layer
                    id="official-flood-high-line"
                    type="line"
                    filter={['==', ['get', 'sfha_tf'], 'T']}
                    paint={{
                      'line-color': colors.danger,
                      'line-width': 1.7,
                      'line-opacity': 0.85,
                    }}
                  />
                  <Layer
                    id="official-flood-moderate-fill"
                    type="fill"
                    filter={[
                      '==',
                      ['get', 'zone_subty'],
                      '0.2 PCT ANNUAL CHANCE FLOOD HAZARD',
                    ]}
                    paint={{
                      'fill-color': colors.link,
                      'fill-opacity': 0.1,
                    }}
                  />
                  <Layer
                    id="official-flood-moderate-line"
                    type="line"
                    filter={[
                      '==',
                      ['get', 'zone_subty'],
                      '0.2 PCT ANNUAL CHANCE FLOOD HAZARD',
                    ]}
                    paint={{
                      'line-color': colors.link,
                      'line-width': 1.4,
                      'line-opacity': 0.8,
                      'line-dasharray': [2, 1.5],
                    }}
                  />
                </Source>
              </>
            )}

            {showWildfireRisk && (
              <Source
                id="official-wildfire-risk-area"
                type="geojson"
                data={officialWildfireRisk?.geometry ?? emptyOfficialGeometry}
              >
                <Layer
                  id="official-wildfire-risk-area-fill"
                  type="fill"
                  paint={{
                    'fill-color':
                      officialWildfireRisk?.rating === 'High'
                        ? colors.danger
                        : officialWildfireRisk?.rating === 'Medium'
                          ? colors.warning
                          : colors.success,
                    'fill-opacity': 0.14,
                  }}
                />
                <Layer
                  id="official-wildfire-risk-area-line"
                  type="line"
                  paint={{
                    'line-color':
                      officialWildfireRisk?.rating === 'High'
                        ? colors.danger
                        : officialWildfireRisk?.rating === 'Medium'
                          ? colors.warning
                          : colors.success,
                    'line-width': 2.2,
                    'line-opacity': 0.9,
                  }}
                />
              </Source>
            )}

            {showFloodRisk && !officialFloodRisk && (
              <Source
                id="resident-flood-zones"
                type="geojson"
                data={residentFloodGeometry}
              >
                <Layer
                  id="resident-flood-zones-fill"
                  type="fill"
                  paint={{
                    'fill-color': colors.danger,
                    'fill-opacity': 0.18,
                  }}
                />
                <Layer
                  id="resident-flood-zones-line"
                  type="line"
                  paint={{
                    'line-color': colors.danger,
                    'line-width': 2,
                    'line-opacity': 0.86,
                    'line-dasharray': [2, 1.5],
                  }}
                />
              </Source>
            )}

            <Source
              id="resident-safe-route"
              type="geojson"
              data={residentRouteGeometry}
            >
              <Layer
                id="resident-safe-route-casing"
                type="line"
                paint={{
                  'line-color': colors.surface,
                  'line-width': 7,
                  'line-opacity': 0.9,
                }}
              />
              <Layer
                id="resident-safe-route-drive"
                type="line"
                filter={['==', ['get', 'mode'], 'drive']}
                paint={{
                  'line-color': colors.accent,
                  'line-width': 4,
                  'line-opacity': 0.95,
                }}
              />
              <Layer
                id="resident-safe-route-walk"
                type="line"
                filter={['==', ['get', 'mode'], 'walk']}
                paint={{
                  'line-color': colors.warning,
                  'line-width': 4,
                  'line-opacity': 0.95,
                  'line-dasharray': [1.4, 1.2],
                }}
              />
              <Layer
                id="resident-safe-route-transit"
                type="line"
                filter={['==', ['get', 'mode'], 'transit']}
                paint={{
                  'line-color': colors.link,
                  'line-width': 5,
                  'line-opacity': 0.98,
                }}
              />
            </Source>

            <Marker
              longitude={residentPlan.startCoordinates[0]}
              latitude={residentPlan.startCoordinates[1]}
              anchor="bottom"
            >
              <div className="resident-route-marker is-home">
                <MapPin size={16} />
                <span>Home</span>
              </div>
            </Marker>
            {residentTravel.transit && (
              <>
                <Marker
                  longitude={residentTravel.transit.boardCoordinates[0]}
                  latitude={residentTravel.transit.boardCoordinates[1]}
                  anchor="bottom"
                >
                  <div className="transit-stop-marker">
                    <BusFront size={15} />
                    <span>Board {residentTravel.transit.route}</span>
                  </div>
                </Marker>
                <Marker
                  longitude={residentTravel.transit.exitCoordinates[0]}
                  latitude={residentTravel.transit.exitCoordinates[1]}
                  anchor="bottom"
                >
                  <div className="transit-stop-marker">
                    <BusFront size={15} />
                    <span>Exit bus</span>
                  </div>
                </Marker>
              </>
            )}
            <Marker
              longitude={residentResource.coordinates[0]}
              latitude={residentResource.coordinates[1]}
              anchor="bottom"
            >
              <div className="resident-route-marker is-destination">
                {residentResource.kind === 'accessible-transport' ? (
                  <BusFront size={16} />
                ) : (
                  <HousePlus size={16} />
                )}
                <span>{residentResource.name}</span>
              </div>
            </Marker>
          </>
        )}

        {(
          [
            ['mobility', colors.warning],
            ['medical-power', colors.danger],
            ['language', colors.link],
            ['transportation', colors.accent],
          ] as Array<[Exclude<LayerId, 'shelters'>, string]>
        ).map(
          ([layerId, color]) =>
            !statewideOverview &&
            !selectedArea.screeningOnly &&
            !afnEnabled &&
            activeLayers.includes(layerId) && (
              <Source
                key={layerId}
                id={`vulnerability-${layerId}`}
                type="geojson"
                data={vulnerabilityGeometry[layerId]}
              >
                <Layer
                  id={`vulnerability-fill-${layerId}`}
                  type="fill"
                  paint={{
                    'fill-color': color,
                    'fill-opacity': 0.11,
                  }}
                />
                <Layer
                  id={`vulnerability-line-${layerId}`}
                  type="line"
                  paint={{
                    'line-color': color,
                    'line-width': 1.35,
                    'line-opacity': 0.72,
                  }}
                />
              </Source>
            ),
        )}

        {!statewideOverview &&
          activeLayers.includes('shelters') &&
          resourceGroups.map((group) => (
            <Marker
              key={group.kind}
              longitude={group.coordinates[0]}
              latitude={group.coordinates[1]}
              anchor="bottom"
              onClick={(event) => {
                event.originalEvent.stopPropagation()
                selectResource(group.selectedSite.id)
                setMobilePanel('insights')
              }}
            >
              <button
                className={`resource-site-marker ${group.pendingSites.length === 0 ? 'is-confirmed' : 'is-needs-confirmation'}`}
                type="button"
                aria-label={`${group.sites.length} ${group.kind === 'shelter' ? 'shelters' : 'transport teams'}, ${group.pendingSites.length} need confirmation`}
                title="Open the complete local resource inventory"
              >
                {group.kind === 'transport' ? (
                  <BusFront size={15} />
                ) : (
                  <HousePlus size={15} />
                )}
                <span>
                  {group.sites.length}{' '}
                  {group.kind === 'shelter' ? 'shelters' : 'transport teams'}
                </span>
              </button>
            </Marker>
          ))}

        {locationFocus && (
          <Marker
            longitude={locationFocus.coordinates[0]}
            latitude={locationFocus.coordinates[1]}
            anchor="bottom"
          >
            <div
              className="location-focus-marker"
              aria-label={`Showing ZIP code ${locationFocus.postalCode}`}
            >
              <MapPin size={18} />
              <span>{locationFocus.postalCode}</span>
            </div>
          </Marker>
        )}

        {locationFocus?.planningZones.map((zone) => {
          const selected = zone.id === selectedPlanningZoneId
          return (
            <Marker
              key={zone.id}
              longitude={zone.coordinates[0]}
              latitude={zone.coordinates[1]}
              anchor="bottom"
              onClick={(event) => {
                event.originalEvent.stopPropagation()
                selectPlanningZone(zone.id, zone.areaId)
                setMobilePanel('insights')
              }}
            >
              <button
                className={`planning-zone-marker ${selected ? 'is-selected' : ''}`}
                aria-label={`Open ${zone.name} planning view`}
                data-testid={`planning-zone-${zone.id}`}
                type="button"
              >
                {zone.name}
              </button>
            </Marker>
          )
        })}

        {statewideOverview &&
          Array.from(
            new Set(
              areas
                .filter((area) => area.showOnStatewideMap !== false)
                .map((area) => area.island),
            ),
          ).map((island) => {
            const first = areas.find(
              (area) =>
                area.island === island && area.showOnStatewideMap !== false,
            )!
            return (
              <Marker
                key={island}
                longitude={first.coordinates[0]}
                latitude={first.coordinates[1]}
                anchor="bottom"
              >
                <button
                  type="button"
                  className="area-marker"
                  aria-label={`Explore ${island}`}
                  onClick={() => setSelectedAreaId(first.id)}
                >
                  <MapPin size={17} />
                  <span>{island}</span>
                </button>
              </Marker>
            )
          })}
        {!statewideOverview &&
          areas
            .filter(
              (area) =>
                area.showOnStatewideMap !== false &&
                area.island === selectedArea.island,
            )
            .map((area) => {
              const selected = area.id === selectedAreaId
              const focus = focusEntries?.find(
                (entry) => entry.area.id === area.id,
              )?.focus
              return (
                <Marker
                  key={area.id}
                  longitude={area.coordinates[0]}
                  latitude={area.coordinates[1]}
                  anchor="bottom"
                  onClick={(event) => {
                    event.originalEvent.stopPropagation()
                    setSelectedAreaId(area.id)
                    if (!focusEntries) setMobilePanel('insights')
                  }}
                >
                  <button
                    className={`area-marker ${selected ? 'is-selected' : ''} ${focus ? `focus-marker is-${focus.tier}` : ''}`}
                    aria-label={`Select ${area.name}`}
                    aria-description={focus?.label}
                    aria-pressed={selected}
                    title={
                      focus
                        ? `${area.name}: ${focus.label}. Area-center indicator, not hazard overlap.`
                        : undefined
                    }
                    data-testid={`response-zone-${area.id}`}
                    type="button"
                  >
                    {selected ? (
                      <ShieldCheck size={18} />
                    ) : (
                      <MapPin size={17} />
                    )}
                    <span>{area.name}</span>
                    {focus && focus.tier !== 'verify' && (
                      <small>
                        {focus.tier === 'review-first' ? 'Review' : 'Check'}
                      </small>
                    )}
                  </button>
                </Marker>
              )
            })}
      </MapLibre>
    </div>
  )
})
