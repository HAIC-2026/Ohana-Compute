import { memo, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Clock3,
  ExternalLink,
  RadioTower,
  RefreshCw,
} from 'lucide-react'

import { useOperationalStatus } from '../lib/operational-status'
import type {
  OperationalDomain,
  OperationalDomainStatus,
} from '../lib/operational-status'
import { useRovingTabs } from '../lib/use-roving-tabs'

const domainLabels: Record<OperationalDomain, string> = {
  evacuation_order: 'Orders',
  road_transport: 'Roads',
  shelter: 'Shelters',
  transit_paratransit: 'Transit',
  utility_outage: 'Utilities',
  wildfire: 'Wildfire',
}

const statusLabels: Record<OperationalDomainStatus['status'], string> = {
  reported_live: 'Reported live',
  stale: 'Stale',
  unavailable: 'Unavailable',
}

const referenceLabels: Record<
  OperationalDomainStatus['reference_kind'],
  string | null
> = {
  operational: null,
  planned_reference: 'Planned/reference only',
  reference_only: 'Reference only',
  none: null,
}

function formatTime(value?: string) {
  if (!value) return 'Not reported'
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return 'Not reported'
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export const LiveOperationalStatusPanel = memo(
  function LiveOperationalStatusPanel({
    coordinates,
  }: {
    coordinates: [number, number]
  }) {
    const { status, snapshot, retry } = useOperationalStatus(coordinates)
    const domains = useMemo(() => snapshot?.domains ?? [], [snapshot])
    const defaultDomain =
      domains.find((domain) => domain.domain === 'shelter') ?? domains.at(0)
    const [selectedDomain, setSelectedDomain] =
      useState<OperationalDomain>('shelter')

    useEffect(() => {
      if (defaultDomain) setSelectedDomain(defaultDomain.domain)
    }, [defaultDomain])

    const selected =
      domains.find((domain) => domain.domain === selectedDomain) ??
      defaultDomain
    const domainTabs = useRovingTabs({
      values: domains.map((domain) => domain.domain),
      selectedValue: selected?.domain ?? null,
      onSelect: setSelectedDomain,
    })

    if (status === 'loading') {
      return (
        <section
          className="live-status-panel is-loading"
          data-testid="live-operational-status"
        >
          <div className="live-status-heading">
            <RadioTower size={19} />
            <div>
              <strong>Checking reported live operations</strong>
              <span>
                Shelter reporting and explicit unsupported-domain boundaries
              </span>
            </div>
          </div>
          <p>
            Unavailable never means normal, passable, restored, or all clear.
          </p>
        </section>
      )
    }

    if (status === 'error' || !snapshot) {
      return (
        <section
          className="live-status-panel is-error"
          data-testid="live-operational-status"
        >
          <AlertTriangle size={19} />
          <div>
            <strong>Operational-status boundary unavailable</strong>
            <p>
              Do not infer shelter, order, road, transit, utility, or wildfire
              conditions. Verify each responsible authority directly.
            </p>
          </div>
          <button
            type="button"
            data-telemetry-action="live_status_retry"
            data-telemetry-category="planning"
            onClick={retry}
          >
            <RefreshCw size={14} /> Retry live status
          </button>
        </section>
      )
    }

    if (!selected) return null

    return (
      <section
        className="live-status-panel"
        data-testid="live-operational-status"
        aria-label="Live operational status"
      >
        <div className="live-status-heading">
          <RadioTower size={19} />
          <div>
            <strong>Reported live operations</strong>
            <span>
              One supported source · five explicit external-data boundaries
            </span>
          </div>
          <span className={`live-status-overall is-${snapshot.status}`}>
            {snapshot.status}
          </span>
        </div>

        <p className="live-status-disclaimer">{snapshot.disclaimer}</p>

        <div
          className="live-status-domains"
          role="tablist"
          aria-label="Operational domains"
        >
          {domains.map((domain) => (
            <button
              key={domain.domain}
              type="button"
              {...domainTabs.getTabProps(domain.domain)}
              className={selected.domain === domain.domain ? 'is-active' : ''}
              data-status={domain.status}
              data-telemetry-action="live_status_select"
              data-telemetry-category="planning"
              onClick={() => setSelectedDomain(domain.domain)}
            >
              <strong>{domainLabels[domain.domain]}</strong>
              <span>{statusLabels[domain.status]}</span>
            </button>
          ))}
        </div>

        <div
          className="live-status-detail"
          {...domainTabs.getPanelProps(selected.domain)}
        >
          <div className="live-status-title">
            <div>
              <span className={`is-${selected.status}`}>
                {statusLabels[selected.status]}
              </span>
              {referenceLabels[selected.reference_kind] ? (
                <span className="is-reference">
                  {referenceLabels[selected.reference_kind]}
                </span>
              ) : null}
            </div>
            <strong>{selected.summary}</strong>
          </div>

          {selected.domain === 'shelter' &&
          selected.shelters &&
          selected.shelters.length > 0 ? (
            <div className="live-shelter-list">
              {selected.shelters.slice(0, 3).map((shelter) => (
                <article key={shelter.id}>
                  <div>
                    <strong>{shelter.name}</strong>
                    <span>
                      {shelter.reported_status} · {shelter.distance_miles} mi
                    </span>
                  </div>
                  <p>
                    {shelter.address || 'Address not reported'}
                    {shelter.city ? ` · ${shelter.city}` : ''}
                  </p>
                  <dl>
                    <div>
                      <dt>Capacity</dt>
                      <dd>{shelter.capacity ?? 'Not reported'}</dd>
                    </div>
                    <div>
                      <dt>Accessibility</dt>
                      <dd>{shelter.wheelchair_accessible || 'Not reported'}</dd>
                    </div>
                    <div>
                      <dt>Pets</dt>
                      <dd>
                        {shelter.pet_accommodations_code || 'Not reported'}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
              <small>
                FEMA-reported records are separate from County plans and
                practice facilities; they do not imply County validation.
              </small>
            </div>
          ) : null}

          {selected.unavailable_boundary ? (
            <div className="live-status-boundary">
              <strong>Blocked external contract</strong>
              <p>{selected.unavailable_boundary.missing_artifact}</p>
              <dl>
                <div>
                  <dt>Owning authority</dt>
                  <dd>{selected.unavailable_boundary.owning_authority}</dd>
                </div>
                <div>
                  <dt>Verification</dt>
                  <dd>{selected.unavailable_boundary.verification}</dd>
                </div>
              </dl>
            </div>
          ) : null}

          <div className="live-status-meta">
            <div>
              <strong>{selected.provenance.authority}</strong>
              <span>
                {selected.coverage.scope.replaceAll('_', ' ')} · checked{' '}
                {selected.provenance.checked_at}
              </span>
            </div>
            <div>
              <Clock3 size={13} />
              <span>
                Retrieved {formatTime(selected.freshness.retrieved_at)}
                {selected.freshness.fresh_until
                  ? ` · fresh until ${formatTime(selected.freshness.fresh_until)}`
                  : ''}
              </span>
            </div>
          </div>

          <details className="live-status-provenance">
            <summary
              data-telemetry-action="live_status_provenance_open"
              data-telemetry-category="document"
            >
              Coverage, source, and limitations
            </summary>
            <div>
              <p>{selected.coverage.notes}</p>
              <ul>
                {selected.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
              <a
                href={selected.provenance.source_url}
                target="_blank"
                rel="noreferrer"
                data-telemetry-action="live_status_provenance_open"
                data-telemetry-category="document"
              >
                Open checked source <ExternalLink size={13} />
              </a>
            </div>
          </details>
        </div>
      </section>
    )
  },
)
