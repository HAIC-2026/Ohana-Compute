import { useEffect, useState } from 'react'
import { backendGet, backendPost } from './backend-api'
import { getCommunityProfile } from './community-profile'
import type { CoordinationEvidence } from './coordination-plan'
import { areas } from './mock-data'
import type { PartnerMatchResponse } from './partner-matching'
import type { PlanningAreaSnapshot } from './planning-areas'
import { createResourceDemandRequest } from './resource-demand'

export function useCoordinationEvidence(
  catalog: PlanningAreaSnapshot | null,
  revision: number,
) {
  const [rows, setRows] = useState<CoordinationEvidence[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!catalog) return
    let active = true
    setLoading(true)
    setRows([])
    void Promise.all(
      catalog.jurisdictions.map(async (county) => {
        const representative = county.areas.at(0)
        const area = areas.find((entry) => entry.id === representative?.id)
        const row: CoordinationEvidence = {
          areaId: representative?.id ?? county.id,
          areaName: representative?.name ?? 'No representative area',
          countyId: county.id,
          countyName: county.name,
          coordinates: area?.coordinates ?? null,
          profile: null,
          demand: null,
          partners: null,
          errors: [],
        }
        if (!area) {
          row.errors.push(
            'Representative geography unavailable; no substitute used.',
          )
          return row
        }
        await Promise.all([
          getCommunityProfile(area.coordinates)
            .then((profile) => {
              row.profile = profile
            })
            .catch(() => {
              row.errors.push(
                'Public AFN profile unavailable; retry or verify source access.',
              )
            }),
          backendGet<PartnerMatchResponse>(
            `/api/v1/planning/partner-matches?jurisdiction=${county.id}&capability=mass-care-coordination&capability=sheltering&capability=feeding-production&capability=feeding-distribution&capability=access-functional-needs-support&capability=information-referral&capability=reunification`,
          )
            .then((partners) => {
              row.partners = partners
            })
            .catch(() => {
              row.errors.push(
                'Partner-role evidence unavailable; verify with County coordination.',
              )
            }),
        ])
        try {
          row.demand = await backendPost(
            '/api/v1/planning/resource-demand',
            createResourceDemandRequest({
              areaId: area.id,
              population: row.profile?.acs?.population,
              populationSource: row.profile?.acs?.source,
              medicalPower: row.profile?.empower?.power_dependent_dme,
              resources: [],
              confirmedResourceIds: [],
              serviceDays: 3,
              shelterStandard: 'evacuation',
            }),
          )
        } catch {
          row.errors.push(
            'Resource model unavailable; no gap or coverage inferred.',
          )
        }
        if (!row.profile?.acs)
          row.errors.push('ACS estimates and language needs unknown.')
        if (row.profile?.source_errors?.length)
          row.errors.push(
            'Some public profile sources unavailable; see source errors.',
          )
        row.errors.push(
          'Operational capacity, partner activation and complete County coverage are not verified.',
        )
        return row
      }),
    ).then((result) => {
      if (active) {
        setRows(result)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [catalog, revision])
  return { rows, loading }
}
