import {
  nwsEligibility,
  nwsProductValidity,
  retrievalState,
} from '../lib/nws-product'
import type { NWSProduct, NWSZoneEvidence, Retrieval } from '../lib/nws-product'
import type { LifecycleEvidenceState } from '../lib/lifecycle-evidence'
import { nwsQueryReading } from '../lib/lifecycle-evidence'
import {
  currentNWSApplicability,
  maxWeatherAcceptances,
  maxWeatherRechecks,
} from '../lib/weather-evidence'
import type { ReviewedNWSProduct } from '../lib/weather-evidence'
import { practiceRoles } from '../lib/practice-lifecycle'
import type {
  LifecycleAction,
  LifecycleState,
  PracticeRole,
  RecoveryRow,
} from '../lib/practice-lifecycle'
import { useState } from 'react'

export { currentNWSApplicability as currentZoneApplicability } from '../lib/weather-evidence'

function freshZoneRow(row: NWSZoneEvidence['zones'][number], now: number) {
  return (
    row.state === 'fresh' &&
    row.fresh_until !== null &&
    Date.parse(row.fresh_until) > now
  )
}

export function NWSProductDetails({
  product,
  now,
  retrieval,
  unavailable = false,
}: {
  product: NWSProduct
  now: number
  retrieval?: Retrieval
  unavailable?: boolean
}) {
  const validity = nwsProductValidity(product, now)
  const eligibility = nwsEligibility(product)
  const currentApplicability = currentNWSApplicability(product, now)
  const applicability = {
    inside:
      product.applicability_basis === 'affected_zones'
        ? `Inside at least one official NWS zone boundary. ${
            currentApplicability.coverage === 'complete'
              ? 'All referenced zones were evaluated.'
              : currentApplicability.coverage === 'pending'
                ? 'Some referenced zones are still being checked; coverage is pending, but one valid zone contains the point.'
                : 'Some referenced zones were unavailable, but one valid zone contains the point.'
          } Zone boundaries are area-level and do not establish address-level impact, authority, an order, or an instruction. This is not an all-clear.`
        : 'Inside the retained source polygon. This does not establish impact, authority, an order, or an instruction.',
    outside:
      product.applicability_basis === 'affected_zones'
        ? 'Outside every referenced official NWS zone boundary after complete valid coverage. This is not an all-clear and does not establish that the location is unaffected.'
        : 'Outside the retained source polygon. This is not an all-clear and does not establish that the location is unaffected.',
    unknown:
      currentApplicability.reason === 'zone_pending'
        ? 'Unknown while official NWS zone boundaries are being checked. No local-impact conclusion is available.'
        : currentApplicability.reason === 'zone_incomplete'
          ? 'Unknown because one or more referenced official NWS zone boundaries were unavailable, stale, invalid, or not bound to this product time. Partial coverage cannot establish outside.'
          : currentApplicability.reason === 'no_polygon'
            ? 'Unknown because this product has no retained source polygon. Coverage is limited to products that include polygons.'
            : `Unknown (${currentApplicability.reason.replaceAll('_', ' ')}). No local-impact conclusion is available.`,
  }[currentApplicability.result]
  return (
    <div className="nws-product" data-nws-product={product.id ?? 'unknown'}>
      <div className="lifecycle-source-card-heading">
        <strong>
          {product.headline ?? product.event ?? product.id ?? 'NWS product'}
        </strong>
        <div className="lifecycle-status-chips">
          <span className="lifecycle-status-chip">
            validity:{' '}
            <span data-nws-validity={validity}>
              {validity.replaceAll('_', ' ')}
            </span>
          </span>
          <span className="lifecycle-status-chip">
            eligibility:{' '}
            <span data-nws-eligibility={eligibility}>
              {eligibility.replaceAll('_', ' ')}
            </span>
          </span>
          <span
            className="lifecycle-status-chip"
            data-nws-retrieval={retrievalState(retrieval, now, unavailable)}
          >
            retrieval: {retrievalState(retrieval, now, unavailable)}
          </span>
          <span className="lifecycle-status-chip">
            applicability:{' '}
            <span data-nws-applicability={currentApplicability.result}>
              {currentApplicability.result}
            </span>
          </span>
        </div>
      </div>
      <p className="nws-product-state">
        {currentApplicability.result === 'inside'
          ? 'Inside an evaluated source area; this is not an order or impact determination.'
          : currentApplicability.result === 'outside'
            ? 'Outside evaluated source areas; this is not an all-clear.'
            : 'Local applicability is unknown and no impact conclusion is available.'}
      </p>
      <details>
        <summary>Why applicability is {currentApplicability.result}</summary>
        <p>{applicability}</p>
      </details>
      <details>
        <summary>Exact product facts and provenance</summary>
        <dl className="nws-product-facts">
          <dt>Product / message ID</dt>
          <dd>{product.id ?? 'Not reported'}</dd>
          <dt>Canonical source</dt>
          <dd>
            {product.url ? (
              <a href={product.url} target="_blank" rel="noreferrer">
                Open NWS product
              </a>
            ) : (
              'Not reported'
            )}
          </dd>
          <dt>Sender / sender name</dt>
          <dd>
            {product.sender ?? 'Not reported'} /{' '}
            {product.sender_name ?? 'Not reported'}
          </dd>
          <dt>CAP status / scope / message type</dt>
          <dd>
            {product.status ?? 'Not reported'} /{' '}
            {product.scope ?? 'Not reported'} /{' '}
            {product.message_type ?? 'Not reported'}
          </dd>
          <dt>Message relationship</dt>
          <dd>
            {product.relationship}. References are source-reported
            relationships, never an app all-clear or restoration.
          </dd>
          <dt>Sent (issued)</dt>
          <dd>{product.sent ?? 'Not reported'}</dd>
          <dt>Effective</dt>
          <dd>{product.effective ?? 'Not reported'}</dd>
          <dt>Onset</dt>
          <dd>{product.onset ?? 'Not reported'}</dd>
          <dt>Expires (product)</dt>
          <dd>{product.expires ?? 'Not reported'}</dd>
          <dt>Ends (reported event)</dt>
          <dd>{product.ends ?? 'Not reported'}</dd>
          <dt>Event / headline</dt>
          <dd>
            {product.event ?? 'Not reported'} /{' '}
            {product.headline ?? 'Not reported'}
          </dd>
          <dt>Severity / certainty / urgency / response</dt>
          <dd>
            {product.severity ?? 'Not reported'} /{' '}
            {product.certainty ?? 'Not reported'} /{' '}
            {product.urgency ?? 'Not reported'} /{' '}
            {product.response ?? 'Not reported'}
          </dd>
          <dt>Reported area</dt>
          <dd>{product.area_desc ?? 'Not reported'}</dd>
          <dt>Query scope (not product coverage)</dt>
          <dd>
            Statewide Hawaiʻi (HI) ·{' '}
            <a href={product.query_scope.url} target="_blank" rel="noreferrer">
              NWS active-products query
            </a>
          </dd>
          <dt>Affected zones</dt>
          <dd>
            {product.affected_zones === null
              ? 'Not reported or invalid'
              : product.affected_zones.length === 0
                ? 'None reported'
                : product.affected_zones.map((zone, index) => (
                    <div key={`${zone.url}:${index}`}>
                      <a href={zone.url} target="_blank" rel="noreferrer">
                        {zone.type} {zone.id}
                      </a>
                    </div>
                  ))}
          </dd>
          <dt>Reported UGC / SAME codes</dt>
          <dd>
            {product.geocode.ugc === null
              ? 'Not reported or invalid'
              : product.geocode.ugc.join(', ') || 'None reported'}{' '}
            /{' '}
            {product.geocode.same === null
              ? 'Not reported or invalid'
              : product.geocode.same.join(', ') || 'None reported'}
          </dd>
          <dt>Source geometry</dt>
          <dd>
            {product.geometry.status.replaceAll('_', ' ')} ·{' '}
            {product.geometry.type ?? 'Type not reported'}. Applicability basis:{' '}
            {(product.applicability_basis ?? 'not evaluated').replaceAll(
              '_',
              ' ',
            )}
            . Reason: {currentApplicability.reason.replaceAll('_', ' ')}.
          </dd>
          {product.zone_evidence && (
            <>
              <dt>Official NWS zone coverage</dt>
              <dd>
                {currentApplicability.coverage} ·{' '}
                {product.zone_evidence.zones
                  .map(
                    (zone) =>
                      `${zone.id}: ${
                        zone.state === 'fresh' && !freshZoneRow(zone, now)
                          ? 'stale'
                          : zone.state
                      }/${zone.result} (${zone.reason.replaceAll('_', ' ')})`,
                  )
                  .join('; ')}
                . Boundaries are area-level source geometry; no zone result is
                an order, impact determination, or all-clear.
              </dd>
            </>
          )}
          <dt>Explicit references (source order)</dt>
          <dd>
            {product.references === null ? (
              'Not reported or invalid'
            ) : product.references.length === 0 ? (
              'None reported'
            ) : (
              <ol>
                {product.references.map((reference, index) => (
                  <li key={index}>
                    {reference.identifier ?? 'Identifier not reported'} · Sender{' '}
                    {reference.sender ?? 'not reported'} · Sent{' '}
                    {reference.sent ?? 'not reported'}
                    {reference.url && (
                      <>
                        {' '}
                        ·{' '}
                        <a
                          href={reference.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Referenced product
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </dd>
          <dt>Retrieval observation / deadline</dt>
          <dd>
            {retrieval?.retrieved_at ?? 'Unknown'} /{' '}
            {retrieval?.fresh_until ?? 'Unknown'}
          </dd>
        </dl>
      </details>
    </div>
  )
}

export function LifecycleWeatherContext({
  live,
  state,
  act,
}: {
  live: LifecycleEvidenceState
  state: LifecycleState
  act: (action: LifecycleAction) => void
}) {
  const [reviewed, setReviewed] = useState<ReviewedNWSProduct | null>(null)
  const [owner, setOwner] = useState<PracticeRole>('Recovery lead')
  const [horizon, setHorizon] = useState<RecoveryRow['horizon']>('next shift')
  const [checking, setChecking] = useState(false)
  const feed = live.snapshot?.event_triggers
  const events = feed?.data
  const source = events?.source_states?.find(
    (row) => row.id === 'nws-hi-alerts',
  )
  const sourceFailed = events?.source_errors?.some(
    (row) => row.source === 'nws',
  )
  const unavailable = Boolean(
    live.error || !events || feed.state === 'unavailable',
  )
  const retrieval = retrievalState(
    source,
    live.now,
    unavailable || (Boolean(sourceFailed) && !source),
  )
  const products =
    events?.triggers.flatMap((row) =>
      row.source === 'nws' && row.nws_product ? [row.nws_product] : [],
    ) ?? []
  const missingProvenance = events?.triggers.some(
    (row) => row.source === 'nws' && !row.nws_product,
  )
  const firstProduct = products.at(0)
  const firstValidity = firstProduct
    ? nwsProductValidity(firstProduct, live.now)
    : null
  const firstEligibility = firstProduct ? nwsEligibility(firstProduct) : null
  const firstApplicability = firstProduct
    ? currentNWSApplicability(firstProduct, live.now).result
    : null
  return (
    <section
      className="lifecycle-source-section"
      aria-label="NWS product provenance"
    >
      <div className="lifecycle-source-card-heading">
        <div>
          <h3>NWS-reported products</h3>
          <p>
            {products.length} product{products.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="lifecycle-status-chips">
          <span
            className="lifecycle-status-chip"
            data-nws-retrieval={retrieval}
          >
            retrieval: {retrieval}
          </span>
          {firstValidity && (
            <span className="lifecycle-status-chip">
              validity: {firstValidity.replaceAll('_', ' ')}
            </span>
          )}
          {firstEligibility && (
            <span className="lifecycle-status-chip">
              eligibility: {firstEligibility.replaceAll('_', ' ')}
            </span>
          )}
          {firstApplicability && (
            <span className="lifecycle-status-chip">
              applicability: {firstApplicability}
            </span>
          )}
          {sourceFailed && (
            <span className="lifecycle-status-chip is-attention">
              source error · facts may be incomplete
            </span>
          )}
        </div>
      </div>
      {!products.length && (
        <p className="lifecycle-source-alert">
          {retrieval === 'fresh' && !sourceFailed && !missingProvenance
            ? 'No products returned by this query. This does not mean no hazard or order.'
            : 'NWS product availability is unknown. This does not mean no hazard or order.'}
        </p>
      )}
      <details className="lifecycle-source-detail">
        <summary>Inspect NWS products, immutable records, and rechecks</summary>
        <p>
          Statewide Hawaiʻi query; retained source polygons take precedence.
          Missing, stale, invalid, or incomplete zone coverage remains unknown.
          Product expiry uses wall time. B04 remains manual.
        </p>
        {products.map((product, index) => (
          <div key={`${product.id}:${index}`}>
            <NWSProductDetails
              product={product}
              now={live.now}
              retrieval={source}
              unavailable={unavailable || (Boolean(sourceFailed) && !source)}
            />
            <button
              type="button"
              className="secondary"
              disabled={Boolean(state.h1) || state.phase !== 'before'}
              onClick={() =>
                setReviewed({
                  reviewedAt: new Date().toISOString(),
                  reading: nwsQueryReading(live),
                  product: structuredClone(product),
                })
              }
            >
              Review exact product revision
            </button>
          </div>
        ))}
        {reviewed && (
          <div data-reviewed-weather={reviewed.product.id}>
            <h4>Displayed weather revision to accept</h4>
            <p>
              This frozen review is not replaced by refresh. Acceptance records
              source context only, including cancellation, test, expired,
              outside, or unknown states exactly as displayed.
            </p>
            <NWSProductDetails
              product={reviewed.product}
              now={Date.parse(reviewed.reviewedAt)}
              retrieval={{
                status: reviewed.reading.retrievalState,
                retrieved_at: reviewed.reading.retrievedAt,
                fresh_until: reviewed.reading.freshUntil,
              }}
              unavailable={reviewed.reading.transport === 'unavailable'}
            />
            <button
              type="button"
              disabled={
                Boolean(state.h1) ||
                state.phase !== 'before' ||
                state.weatherEvidence.length >= maxWeatherAcceptances
              }
              onClick={() => {
                act({
                  type: 'accept-weather',
                  reviewed,
                  acceptedAt: new Date().toISOString(),
                })
                setReviewed(null)
              }}
            >
              Accept displayed weather revision
            </button>
          </div>
        )}
        <p>
          {state.weatherEvidence.length}/{maxWeatherAcceptances} immutable
          weather revisions accepted. These records do not mark B07 complete or
          change B04.
        </p>
        {state.weatherEvidence.map((accepted) => (
          <details key={accepted.id} data-accepted-weather={accepted.id}>
            <summary>
              {accepted.id} ·{' '}
              {accepted.product.headline ??
                accepted.product.event ??
                accepted.product.id}{' '}
              · {accepted.product.relationship} ·{' '}
              {accepted.observation.validity}
            </summary>
            <p>
              Accepted {accepted.acceptedAt} by {accepted.acceptedBy} ·{' '}
              {accepted.product.eligibility} ·{' '}
              {accepted.evaluation.applicability}/{accepted.evaluation.reason} ·
              retrieval {accepted.observation.retrievalState}. Planning context
              only; no authority effect.
            </p>
            <p className="lifecycle-output">
              Product digest {accepted.productDigest} · evaluation digest{' '}
              {accepted.evaluationDigest} · snapshot {accepted.snapshotId}
            </p>
            <p>{accepted.limitations.join(' ')}</p>
          </details>
        ))}
        <section aria-label="Accepted weather rechecks">
          <h4>Recheck accepted weather revisions</h4>
          <p>
            Results describe source lineage only: unchanged, changed, expired,
            superseded, cancelled, ambiguous, not returned, or unavailable. None
            means safety, impact, recovery, or all-clear.
          </p>
          <label>
            Weather recheck owner
            <select
              value={owner}
              onChange={(event) => setOwner(event.target.value as PracticeRole)}
            >
              {practiceRoles.map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
          </label>
          <label>
            Weather recheck horizon
            <select
              value={horizon}
              onChange={(event) =>
                setHorizon(event.target.value as RecoveryRow['horizon'])
              }
            >
              {(['next shift', 'next day', 'next exercise'] as const).map(
                (value) => (
                  <option key={value}>{value}</option>
                ),
              )}
            </select>
          </label>
          {state.weatherEvidence.map((accepted) => (
            <button
              type="button"
              className="secondary"
              key={accepted.id}
              disabled={
                state.phase !== 'after' ||
                checking ||
                state.weatherRechecks.length >= maxWeatherRechecks
              }
              onClick={async () => {
                setChecking(true)
                try {
                  const check = await live.refresh()
                  const reading = nwsQueryReading(check)
                  act({
                    type: 'recheck-weather',
                    acceptedId: accepted.id,
                    reading,
                    checkedAt: reading.checkedAt!,
                    owner,
                    horizon,
                  })
                } finally {
                  setChecking(false)
                }
              }}
            >
              {checking
                ? 'Checking weather source…'
                : `Recheck weather ${accepted.id}`}
            </button>
          ))}
          <p>
            {state.weatherRechecks.length}/{maxWeatherRechecks} bounded weather
            checks recorded.
          </p>
          <ul className="lifecycle-output-list">
            {state.weatherRechecks.map((check) => (
              <li key={check.id} data-weather-recheck={check.result}>
                {check.id} · {check.acceptedId}: {check.result} · {check.owner}{' '}
                · {check.horizon}. Retrieval {check.retrievalState}; product
                validity {check.validityAtCheck}. Accepted facts remain
                unchanged.
              </li>
            ))}
          </ul>
        </section>
      </details>
    </section>
  )
}
