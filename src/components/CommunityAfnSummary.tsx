import { Database, ShieldCheck } from 'lucide-react'

import {
  formatAggregateMetric,
  formatProtectedCount,
  useCommunityProfile,
} from '../lib/community-profile'

export function CommunityAfnSummary({
  coordinates,
}: {
  coordinates: [number, number]
}) {
  const { status, profile } = useCommunityProfile(coordinates)
  const sourceLabels = [
    profile?.acs?.source,
    profile?.svi?.source,
    profile?.empower?.source,
  ]
    .filter((source) => source !== undefined)
    .map((source) => {
      const version = source.vintage ?? source.upstream_last_modified
      return version ? `${source.authority} · ${version}` : source.authority
    })

  return (
    <div className="community-afn-summary" data-testid="afn-context">
      <div className="community-afn-heading">
        <Database size={16} />
        <div>
          <strong>Official aggregate AFN context</strong>
          <span>
            {status === 'loading' && 'Checking public planning sources…'}
            {status === 'ready' && 'Official public sources available'}
            {status === 'partial' && 'Partial official source coverage'}
            {status === 'unavailable' && 'Official sources unavailable'}
          </span>
        </div>
      </div>

      {status === 'unavailable' ? (
        <p className="community-afn-unavailable">
          Practice needs remain visible, but they must not be treated as
          official AFN estimates.
        </p>
      ) : profile ? (
        <>
          <div className="community-afn-grid">
            <div data-testid="afn-disability">
              <span>People with disabilities</span>
              <strong>
                {formatAggregateMetric(
                  profile.acs?.population_with_disability,
                  profile.svi?.with_disability,
                )}
              </strong>
            </div>
            <div data-testid="afn-language">
              <span>Limited-English population</span>
              <strong>
                {formatAggregateMetric(
                  profile.acs?.limited_english_population,
                  profile.svi?.limited_english,
                )}
              </strong>
            </div>
            <div data-testid="afn-transportation">
              <span>Households without a vehicle</span>
              <strong>
                {formatAggregateMetric(
                  profile.acs?.no_vehicle_households,
                  profile.svi?.no_vehicle_households,
                )}
              </strong>
            </div>
            <div data-testid="afn-medical-power">
              <span>Power-dependent medical equipment</span>
              <strong>
                {formatProtectedCount(profile.empower?.power_dependent_dme)}
              </strong>
            </div>
          </div>
          <div className="community-afn-source">
            <ShieldCheck size={14} />
            <div>
              <span>
                Aggregate planning geography:{' '}
                {(profile.acs?.geography.name ??
                  profile.svi?.location ??
                  [profile.empower?.county, profile.empower?.zip_code]
                    .filter(Boolean)
                    .join(' · ')) ||
                  'source geography unavailable'}
                . No person-level records.
              </span>
              <span>Sources: {sourceLabels.join(' · ')}</span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
