import { create } from 'zustand'
import { useEffect, useState } from 'react'
import { backendGet } from './backend-api'
import type { AggregateMetric, CommunitySource } from './community-profile'

export const afnCounties = [
  { id: '001', name: 'Hawaiʻi County' },
  { id: '003', name: 'Honolulu County' },
  { id: '005', name: 'Kalawao County' },
  { id: '007', name: 'Kauaʻi County' },
  { id: '009', name: 'Maui County' },
] as const
export type AfnCounty = (typeof afnCounties)[number]['id']
export type CmistDomain =
  'Communication' | 'Medical' | 'Independence' | 'Safety' | 'Transportation'

export const afnIndicators = {
  no_internet_subscription: {
    domains: ['Communication'],
    label: 'Households without internet subscription',
    note: 'Offline outreach indicator; not a measure of mobile signal coverage.',
  },
  limited_english_population: {
    domains: ['Communication'],
    label: 'Limited-English population',
    note: 'Language-access planning; not an individual language preference.',
  },
  population_with_disability: {
    domains: ['Medical', 'Independence'],
    label: 'Population with disability · support proxy',
    note: 'Broad support proxy, not a medical caseload or power-equipment count.',
  },
  kupuna_living_alone: {
    domains: ['Safety'],
    label: 'Kūpuna (65+) living alone',
    note: 'Outreach/support indicator; does not establish an individual care need.',
  },
  housing_50_plus_units: {
    domains: ['Independence'],
    label: 'Housing units in 50+ unit structures',
    note: 'Elevator-risk proxy; neither building height nor elevator dependence is known.',
  },
  incomplete_plumbing: {
    domains: ['Medical'],
    label: 'Housing units lacking complete plumbing',
    note: 'Infrastructure proxy only; not a count of off-grid or catchment-dependent households.',
  },
  no_vehicle_households: {
    domains: ['Transportation'],
    label: 'Households without a vehicle',
    note: 'Transport-support planning; accessible vehicle demand requires local assessment.',
  },
} as const
export type AfnIndicator = keyof typeof afnIndicators
const defaultIndicators: Record<CmistDomain, AfnIndicator> = {
  Communication: 'no_internet_subscription',
  Medical: 'population_with_disability',
  Independence: 'housing_50_plus_units',
  Safety: 'kupuna_living_alone',
  Transportation: 'no_vehicle_households',
}

export const useAfnMap = create<{
  enabled: boolean
  county: AfnCounty
  domain: CmistDomain
  indicator: AfnIndicator
  setEnabled: (enabled: boolean) => void
  setCounty: (county: AfnCounty) => void
  setDomain: (domain: CmistDomain) => void
  setIndicator: (indicator: AfnIndicator) => void
}>((set) => ({
  enabled: false,
  county: '003',
  domain: 'Communication',
  indicator: 'no_internet_subscription',
  setEnabled: (enabled) => set({ enabled }),
  setCounty: (county) => set({ county }),
  setDomain: (domain) => set({ domain, indicator: defaultIndicators[domain] }),
  setIndicator: (indicator) => set({ indicator }),
}))

export function afnCountyForArea(areaId: string, island: string): AfnCounty {
  if (areaId === 'molokai-kalaupapa') return '005'
  if (island === 'Oʻahu') return '003'
  if (island === 'Kauaʻi') return '007'
  if (island === 'Hawaiʻi') return '001'
  return '009'
}

export type AfnLayerResponse = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  {
    tract_fips: string
    county_code: string
    name: string
    indicators: Partial<Record<AfnIndicator, AggregateMetric>>
  }
> & {
  status: 'complete' | 'partial'
  sources: Array<CommunitySource & { county_code: string; url: string }>
  indicator_definitions?: Partial<
    Record<
      AfnIndicator,
      {
        label: string
        universe: string
        variables: string[]
        proxy: boolean
        limitations: string
      }
    >
  >
  warnings?: string[]
  source_errors?: Array<{ source: string; error: string }>
}

export function useCountyAfnLayer(county: AfnCounty, enabled: boolean) {
  const [state, setState] = useState<{
    county: AfnCounty
    data: AfnLayerResponse | null
    error: string | null
  }>({ county, data: null, error: null })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    if (!enabled) return
    setState({ county, data: null, error: null })
    void backendGet<AfnLayerResponse>('/api/v1/community/afn-layer', { county })
      .then((data) => {
        if (active) setState({ county, data, error: null })
      })
      .catch(() => {
        if (active)
          setState({
            county,
            data: null,
            error:
              'County AFN layer unavailable. No tract values or boundaries were invented. Retry when public sources are available.',
          })
      })
    return () => {
      active = false
    }
  }, [county, enabled, revision])
  const current =
    state.county === county ? state : { county, data: null, error: null }
  return { ...current, retry: () => setRevision((value) => value + 1) }
}

export function afnDisplayGeometry(
  data: AfnLayerResponse | null,
  indicator: AfnIndicator,
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: (data?.features ?? []).map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        percent: feature.properties.indicators[indicator]?.percent ?? null,
        estimate: feature.properties.indicators[indicator]?.estimate ?? null,
      },
    })),
  }
}
