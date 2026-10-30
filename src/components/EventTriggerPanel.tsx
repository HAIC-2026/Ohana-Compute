import { memo, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Clock3,
  ExternalLink,
  RefreshCw,
  RadioTower,
  ShieldAlert,
} from 'lucide-react'

import {
  primaryOperationalTrigger,
  useEventTriggers,
} from '../lib/event-triggers'
import type { EventTrigger, EventTriggerSource } from '../lib/event-triggers'
import { NWSProductDetails } from './NWSProductDetails'

const sourceLabels: Record<EventTriggerSource, string> = {
  nws: 'NWS',
  ptwc: 'PTWC',
  usgs_comcat: 'USGS ComCat',
  usgs_hans: 'USGS HANS',
  county_order: 'County order',
}

const planningLabels: Record<EventTrigger['planning_state'], string> = {
  monitor: 'Monitor',
  prepare: 'Prepare',
  official_warning: 'Official warning product',
  unavailable: 'Unavailable',
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

export const EventTriggerPanel = memo(function EventTriggerPanel({
  compact = false,
}: {
  compact?: boolean
}) {
  const { status, snapshot, retry, error, now } = useEventTriggers()
  const operationalTriggers = useMemo(
    () =>
      snapshot?.triggers.filter(
        (trigger) =>
          trigger.source !== 'county_order' && trigger.source !== 'usgs_hans',
      ) ?? [],
    [snapshot],
  )
  const defaultTrigger = primaryOperationalTrigger(snapshot)
  const defaultKey = defaultTrigger
    ? `${defaultTrigger.source}:${defaultTrigger.provenance.product_id ?? defaultTrigger.title}`
    : ''
  const [selectedKey, setSelectedKey] = useState('')

  useEffect(() => {
    setSelectedKey(defaultKey)
  }, [defaultKey])

  if (status === 'loading') {
    return (
      <section
        className={`event-trigger-panel is-loading ${compact ? 'is-compact' : ''}`}
        data-testid="event-trigger-panel"
      >
        <div className="event-trigger-heading">
          <RadioTower size={18} />
          <div>
            <strong>Loading official alerts…</strong>
          </div>
        </div>
        <div className="event-trigger-county">
          <strong>County evacuation-order data unavailable</strong>
          <span>Unavailable does not mean no order.</span>
        </div>
      </section>
    )
  }

  if (!snapshot) {
    return (
      <section
        className={`event-trigger-panel is-error ${compact ? 'is-compact' : ''}`}
        data-testid="event-trigger-panel"
      >
        <AlertTriangle size={19} />
        <div>
          <strong>Official trigger sources unavailable</strong>
          <p>{error ?? 'Check official sources or retry.'}</p>
          <span>County evacuation-order data unavailable</span>
          <small>Unavailable does not mean no order.</small>
        </div>
        <button
          type="button"
          data-telemetry-action="event_trigger_retry"
          data-telemetry-category="planning"
          onClick={retry}
        >
          <RefreshCw size={14} /> Retry trigger sources
        </button>
      </section>
    )
  }

  const selected =
    operationalTriggers.find(
      (trigger) =>
        `${trigger.source}:${trigger.provenance.product_id ?? trigger.title}` ===
        selectedKey,
    ) ??
    defaultTrigger ??
    operationalTriggers[0]

  return (
    <section
      className={`event-trigger-panel ${compact ? 'is-compact' : ''}`}
      data-testid="event-trigger-panel"
      aria-label="Official operational event triggers"
    >
      <div className="event-trigger-heading">
        <ShieldAlert size={19} />
        <div>
          <strong>Official alerts</strong>
          <span>
            {snapshot.status === 'partial'
              ? 'Partial coverage'
              : 'Sources checked'}{' '}
            · Not an evacuation order
          </span>
        </div>
      </div>

      {error && (
        <p role="status">
          LAST KNOWN · {error}{' '}
          <button type="button" onClick={retry}>
            Retry trigger sources
          </button>
        </p>
      )}
      {operationalTriggers.length > 0 ? (
        <>
          <div
            className="event-trigger-selector"
            role="list"
            aria-label="Operational trigger products"
          >
            {operationalTriggers.map((trigger) => {
              const key = `${trigger.source}:${trigger.provenance.product_id ?? trigger.title}`
              return (
                <button
                  key={key}
                  type="button"
                  className={selected === trigger ? 'is-active' : ''}
                  aria-pressed={selected === trigger}
                  data-telemetry-action="event_trigger_select"
                  data-telemetry-category="planning"
                  onClick={() => setSelectedKey(key)}
                >
                  <strong>{sourceLabels[trigger.source]}</strong>
                  <span>
                    {trigger.lifecycle === 'active'
                      ? planningLabels[trigger.planning_state]
                      : `Not current · ${trigger.lifecycle}`}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="event-trigger-detail">
            <div className="event-trigger-title">
              <div>
                <span className={`is-${selected.lifecycle}`}>
                  {selected.lifecycle}
                </span>
                <span>{selected.hazard_event_kind.replaceAll('_', ' ')}</span>
              </div>
              <strong>
                {selected.title || selected.provenance.product_type}
              </strong>
            </div>
            <p>{selected.planning_consequence}</p>
            {selected.source === 'nws' &&
              (selected.nws_product ? (
                <NWSProductDetails
                  product={selected.nws_product}
                  now={now}
                  retrieval={{
                    status: selected.provenance.source_status,
                    retrieved_at: selected.provenance.retrieved_at,
                    fresh_until: selected.provenance.fresh_until,
                  }}
                  unavailable={Boolean(error)}
                />
              ) : (
                <p>
                  NWS product provenance unavailable · Applicability unknown.
                </p>
              ))}
            <div className="event-trigger-timing">
              <Clock3 size={14} />
              <span>
                Retrieved {formatTime(selected.provenance.retrieved_at)}
                {selected.provenance.expires_at
                  ? ` · expires ${formatTime(selected.provenance.expires_at)}`
                  : ''}
              </span>
            </div>
            {!compact ? (
              <details className="event-trigger-provenance">
                <summary
                  data-telemetry-action="event_trigger_provenance_open"
                  data-telemetry-category="document"
                >
                  Source facts and authority limits
                </summary>
                <div>
                  <p>{selected.authority_limitation}</p>
                  <dl>
                    <div>
                      <dt>Authority</dt>
                      <dd>{selected.provenance.source_authority}</dd>
                    </div>
                    <div>
                      <dt>Product</dt>
                      <dd>{selected.provenance.product_type}</dd>
                    </div>
                    <div>
                      <dt>Legal order status</dt>
                      <dd>
                        {selected.legal_order_status.replaceAll('_', ' ')}
                      </dd>
                    </div>
                  </dl>
                  <a
                    href={selected.provenance.official_instructions_url}
                    target="_blank"
                    rel="noreferrer"
                    data-telemetry-action="event_trigger_provenance_open"
                    data-telemetry-category="document"
                  >
                    Open official source <ExternalLink size={13} />
                  </a>
                </div>
              </details>
            ) : null}
          </div>
        </>
      ) : (
        <div className="event-trigger-empty">
          No products returned · Not an all-clear
        </div>
      )}

      <div className="event-trigger-county">
        <strong>County order data unavailable</strong>
        <span>Check County alerts; an order may still be in effect.</span>
      </div>
    </section>
  )
})
