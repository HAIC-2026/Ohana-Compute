import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Building2,
  ExternalLink,
  FileCheck2,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'

import {
  countyIdForIsland,
  useCountyShelterPlans,
} from '../lib/county-shelter-plans'
import type { CountyShelterPlan } from '../lib/county-shelter-plans'
import type { LocalResourceSite } from '../lib/mock-data'

const coverageLabels: Record<CountyShelterPlan['coverage'], string> = {
  published: 'Published plan reference',
  partial: 'Partial planning reference',
  unavailable: 'Plan unavailable',
}

export function CountyShelterPlanPanel({
  island,
  practiceResources,
}: {
  island: string
  practiceResources: LocalResourceSite[]
}) {
  const { status, snapshot, retry } = useCountyShelterPlans()
  const [selectedCountyId, setSelectedCountyId] = useState(
    countyIdForIsland(island),
  )

  useEffect(() => {
    setSelectedCountyId(countyIdForIsland(island))
  }, [island])

  if (status === 'loading') {
    return (
      <section
        className="county-shelter-plans is-loading"
        data-testid="county-shelter-plans"
      >
        <LoaderCircle className="spin" size={18} />
        <div>
          <strong>Checking County shelter plans</strong>
          <span>
            Loading published planning references and validation gaps…
          </span>
        </div>
      </section>
    )
  }

  if (status === 'error' || !snapshot) {
    return (
      <section
        className="county-shelter-plans is-unavailable"
        data-testid="county-shelter-plans"
      >
        <AlertTriangle size={18} />
        <div>
          <strong>County shelter-plan references unavailable</strong>
          <p>
            No plan or facility status is assumed. Continue using the practice
            inventory only after local confirmation.
          </p>
        </div>
        <button
          type="button"
          data-telemetry-action="shelter_plan_retry"
          data-telemetry-category="planning"
          onClick={retry}
        >
          <RefreshCw size={14} /> Retry
        </button>
      </section>
    )
  }

  const selectedCounty =
    snapshot.jurisdictions.find((county) => county.id === selectedCountyId) ??
    snapshot.jurisdictions[0]
  const practiceShelters = practiceResources.filter(
    (resource) => resource.kind === 'shelter',
  )
  const hasStaleRecord = selectedCounty.plan_records.some(
    (record) => record.freshness === 'stale',
  )

  return (
    <section
      className="county-shelter-plans"
      data-testid="county-shelter-plans"
      aria-labelledby="county-shelter-plans-title"
    >
      <div className="county-shelter-heading">
        <div>
          <span>County-led planning input</span>
          <h2 id="county-shelter-plans-title">County shelter plans</h2>
          <p>
            Four emergency-management jurisdictions cover Hawaiʻi's five
            political counties. Published references stay separate from practice
            facilities and live FEMA reports.
          </p>
        </div>
        <div className="county-shelter-summary">
          <strong>
            {snapshot.summary.jurisdictions_with_published_plan}/
            {snapshot.summary.planning_jurisdictions_total}
          </strong>
          <span>published plan reference</span>
        </div>
      </div>

      <div className="county-shelter-tabs" role="tablist" aria-label="County">
        {snapshot.jurisdictions.map((county) => (
          <button
            key={county.id}
            type="button"
            role="tab"
            aria-selected={county.id === selectedCounty.id}
            data-telemetry-action="shelter_county_select"
            data-telemetry-category="planning"
            className={county.id === selectedCounty.id ? 'is-active' : ''}
            onClick={() => setSelectedCountyId(county.id)}
          >
            {county.id === 'honolulu'
              ? 'Honolulu'
              : county.id === 'hawaii'
                ? 'Hawaiʻi'
                : county.id === 'kauai'
                  ? 'Kauaʻi'
                  : 'Maui'}
          </button>
        ))}
      </div>

      <div className="county-shelter-detail">
        <div className="county-shelter-status">
          <span className={`is-${selectedCounty.coverage}`}>
            {coverageLabels[selectedCounty.coverage]}
          </span>
          <span>Local validation required</span>
          {hasStaleRecord ? (
            <span className="is-stale">Review overdue</span>
          ) : null}
        </div>
        <div className="county-shelter-title">
          <Building2 size={18} />
          <div>
            <strong>{selectedCounty.name}</strong>
            <span>{selectedCounty.islands.join(' · ')}</span>
          </div>
        </div>

        {selectedCounty.special_jurisdiction ? (
          <div className="county-jurisdiction-note">
            <strong>{selectedCounty.special_jurisdiction.title}</strong>
            <p>{selectedCounty.special_jurisdiction.description}</p>
            <div className="county-jurisdiction-sources">
              {selectedCounty.special_jurisdiction.sources.map((source) => (
                <a
                  key={source.source_url}
                  href={source.source_url}
                  target="_blank"
                  rel="noreferrer"
                  data-telemetry-action="shelter_provenance_open"
                  data-telemetry-category="document"
                >
                  {source.title} <ExternalLink size={13} />
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <div className="county-shelter-grid">
          <article>
            <FileCheck2 size={16} />
            <div>
              <span>County references</span>
              <strong>{selectedCounty.plan_records.length}</strong>
            </div>
          </article>
          <article>
            <ShieldCheck size={16} />
            <div>
              <span>Official facility records</span>
              <strong>{selectedCounty.facility_records.length}</strong>
            </div>
          </article>
          <article>
            <AlertTriangle size={16} />
            <div>
              <span>Validation gaps</span>
              <strong>{selectedCounty.gaps.length}</strong>
            </div>
          </article>
        </div>

        {selectedCounty.plan_records.map((record) => (
          <div className="county-plan-record" key={record.id}>
            <div>
              <span>
                {record.source_status === 'published'
                  ? 'Published County reference'
                  : 'Agency reference only'}
              </span>
              <strong>{record.title}</strong>
              <small>
                {record.authority} · reviewed{' '}
                {new Date(record.retrieved_at).toLocaleDateString()}
              </small>
              <p>{record.notes}</p>
            </div>
            <a
              href={record.source_url}
              target="_blank"
              rel="noreferrer"
              data-telemetry-action="shelter_provenance_open"
              data-telemetry-category="document"
            >
              Open source <ExternalLink size={13} />
            </a>
          </div>
        ))}

        <div className="county-shelter-gap-list">
          <strong>What still requires County confirmation</strong>
          <ul>
            {selectedCounty.gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </div>

        <div className="county-practice-disclosure">
          <strong>
            {practiceShelters.length} practice shelter records in this workspace
          </strong>
          <span>
            They are not ingested from a County plan and do not report current
            opening status. Confirm every facility locally before use.
          </span>
        </div>
      </div>
    </section>
  )
}
