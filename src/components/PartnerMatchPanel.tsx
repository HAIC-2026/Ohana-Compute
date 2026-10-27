import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ExternalLink,
  Handshake,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'

import type {
  PartnerCapability,
  PartnerMatchState,
} from '../lib/partner-matching'

const capabilityLabels: Record<PartnerCapability, string> = {
  'mass-care-coordination': 'Mass-care coordination',
  sheltering: 'Sheltering',
  'feeding-production': 'Meal production',
  'feeding-distribution': 'Feeding distribution',
  'emergency-supplies-distribution': 'Emergency supplies',
  reunification: 'Reunification',
  'information-referral': 'Information and referral',
  'human-services': 'Human services',
  'access-functional-needs-support': 'AFN support',
  'pet-service-animal-support': 'Pets and service animals',
}

const validationLabels = {
  official_county_role: 'Official County role',
  official_plan_role: 'Official plan role',
  official_plan_network: 'Official plan network',
  organization_self_described: 'Organization-described',
} as const

function formatEvidenceDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

export function PartnerMatchPanel({ state }: { state: PartnerMatchState }) {
  const [selectedCapability, setSelectedCapability] =
    useState<PartnerCapability | null>(null)
  const response = state.response

  useEffect(() => {
    if (!response?.matches.length) {
      setSelectedCapability(null)
      return
    }
    const currentExists = response.matches.some(
      (match) => match.capability === selectedCapability,
    )
    if (!currentExists) {
      setSelectedCapability(
        response.matches.find((match) => match.status !== 'matched')
          ?.capability ?? response.matches[0].capability,
      )
    }
  }, [response, selectedCapability])

  if (state.status === 'loading') {
    return (
      <section
        className="partner-match-panel is-loading"
        data-testid="partner-matches"
      >
        <LoaderCircle className="spin" size={18} />
        <div>
          <strong>Matching sourced response roles</strong>
          <span>
            Checking documented capability and geographic associations…
          </span>
        </div>
      </section>
    )
  }

  if (state.status === 'error' || !response) {
    return (
      <section
        className="partner-match-panel is-unavailable"
        data-testid="partner-matches"
      >
        <AlertTriangle size={18} />
        <div>
          <strong>Partner matching unavailable</strong>
          <p>
            No organization is assumed available or assigned. Retry the sourced
            directory.
          </p>
        </div>
        <button
          type="button"
          data-telemetry-action="partner_match_retry"
          data-telemetry-category="planning"
          onClick={state.retry}
        >
          <RefreshCw size={14} /> Retry
        </button>
      </section>
    )
  }

  const selected =
    response.matches.find((match) => match.capability === selectedCapability) ??
    response.matches[0]

  return (
    <section
      className="partner-match-panel"
      data-testid="partner-matches"
      aria-labelledby="partner-match-title"
    >
      <div className="partner-match-heading">
        <div>
          <span>
            <Handshake size={15} /> Sourced planning associations
          </span>
          <h2 id="partner-match-title">Response partner matches</h2>
          <p>
            Documented roles are matched to bounded needs. They are not
            assignments, endorsements, commitments, or proof of availability.
          </p>
        </div>
        <div className="partner-match-summary">
          <strong>
            {response.summary.matched_capabilities}/
            {response.summary.requested_capabilities}
          </strong>
          <span>capabilities with current sources</span>
        </div>
      </div>

      <div
        className="partner-capability-tabs"
        role="tablist"
        aria-label="Response capability"
      >
        {response.matches.map((match) => (
          <button
            key={match.capability}
            type="button"
            role="tab"
            aria-selected={match.capability === selected.capability}
            className={[
              match.capability === selected.capability ? 'is-active' : '',
              `is-${match.status}`,
            ]
              .filter(Boolean)
              .join(' ')}
            data-telemetry-action="partner_capability_select"
            data-telemetry-category="planning"
            onClick={() => setSelectedCapability(match.capability)}
          >
            {match.status === 'matched' ? (
              <CheckCircle2 size={13} />
            ) : (
              <ShieldAlert size={13} />
            )}
            {capabilityLabels[match.capability]}
          </button>
        ))}
      </div>

      <div className="partner-match-detail" role="tabpanel">
        <div className="partner-match-title">
          <div>
            <span>Selected capability</span>
            <strong>{capabilityLabels[selected.capability]}</strong>
          </div>
          <em className={`is-${selected.status}`}>
            {selected.status === 'matched'
              ? `${selected.partners.length} sourced association${selected.partners.length === 1 ? '' : 's'}`
              : selected.status === 'stale'
                ? 'Review overdue'
                : 'No sourced association'}
          </em>
        </div>

        {selected.status === 'matched' ? (
          <div className="partner-card-list">
            {selected.partners.map((partner) => (
              <article key={`${selected.capability}-${partner.id}`}>
                <div className="partner-card-heading">
                  <Building2 size={17} />
                  <div>
                    <strong>{partner.name}</strong>
                    <span>{partner.role}</span>
                  </div>
                </div>
                <div className="partner-card-badges">
                  <span>{validationLabels[partner.validation_state]}</span>
                  <span>
                    {partner.coverage.includes('statewide')
                      ? 'Statewide scope'
                      : 'Jurisdiction-specific scope'}
                  </span>
                  <span>
                    Source review current through{' '}
                    {formatEvidenceDate(partner.evidence.fresh_until)}
                  </span>
                </div>
                <div className="partner-operational-gap">
                  <ShieldAlert size={15} />
                  <span>
                    <strong>Operational status not validated</strong>
                    Activation and capacity are not reported. Confirm
                    assignment, staffing, logistics, agreements, and contacts
                    through official channels.
                  </span>
                </div>
                <div className="partner-evidence">
                  <p>{partner.evidence.claim}</p>
                  <a
                    href={partner.evidence.source_url}
                    target="_blank"
                    rel="noreferrer"
                    data-telemetry-action="partner_provenance_open"
                    data-telemetry-category="document"
                  >
                    {partner.evidence.title} <ExternalLink size={13} />
                  </a>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="partner-match-gap">
            <ShieldAlert size={18} />
            <div>
              <strong>Keep this as an explicit coordination gap</strong>
              <p>{selected.gap}</p>
              <span>
                Do not substitute a nearby organization, historical responder,
                or network member without current sourced validation.
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
