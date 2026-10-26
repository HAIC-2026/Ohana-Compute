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
  const sourceDefinitions = [
    { label: 'Census ACS', source: profile?.acs?.source },
    { label: 'CDC/ATSDR SVI', source: profile?.svi?.source },
    { label: 'HHS emPOWER', source: profile?.empower?.source },
    {
      label: 'FEMA National Risk Index',
      source: profile?.fema_national_risk?.source,
    },
  ]
  const availableSourceCount = sourceDefinitions.filter(
    ({ source }) => source !== undefined,
  ).length
  const sourceLabels = sourceDefinitions.flatMap(({ source }) => {
    if (!source) return []
    const version = source.vintage ?? source.upstream_last_modified
    return [version ? `${source.authority} · ${version}` : source.authority]
  })
  const unavailableSourceLabels = sourceDefinitions
    .filter(({ source }) => source === undefined)
    .map(({ label }) => label)

  return (
    <div className="community-afn-summary" data-testid="afn-context">
      <div className="community-afn-heading">
        <Database size={16} />
        <div>
          <strong>Official aggregate AFN context</strong>
          <span>
            {status === 'loading' && 'Checking public planning sources…'}
            {status === 'ready' && 'Official public sources available · 4 of 4'}
            {status === 'partial' &&
              `Partial official source coverage · ${availableSourceCount} of 4`}
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
              {profile.fema_national_risk ? (
                <span data-testid="afn-risk-baseline">
                  National risk baseline:{' '}
                  {profile.fema_national_risk.risk_rating || 'Unavailable'} ·
                  Social vulnerability:{' '}
                  {profile.fema_national_risk.social_vulnerability_rating ||
                    'Unavailable'}{' '}
                  · Community resilience:{' '}
                  {profile.fema_national_risk.community_resilience_rating ||
                    'Unavailable'}
                </span>
              ) : null}
              <span>Sources: {sourceLabels.join(' · ')}</span>
              {unavailableSourceLabels.length > 0 ? (
                <span>Unavailable: {unavailableSourceLabels.join(' · ')}</span>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
