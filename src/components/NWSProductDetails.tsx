import {
  nwsEligibility,
  nwsProductValidity,
  retrievalState,
} from '../lib/nws-product'
import type { NWSProduct, Retrieval } from '../lib/nws-product'
import type { LifecycleEvidenceState } from '../lib/lifecycle-evidence'

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
  const applicability = {
    inside:
      'Inside the retained source polygon. This does not establish impact, authority, an order, or an instruction.',
    outside:
      'Outside the retained source polygon. This is not an all-clear and does not establish that the location is unaffected.',
    unknown:
      product.applicability_reason === 'no_polygon'
        ? 'Unknown because this product has no retained source polygon. Coverage is limited to products that include polygons.'
        : `Unknown (${product.applicability_reason.replaceAll('_', ' ')}). No local-impact conclusion is available.`,
  }[product.applicability]
  return (
    <div className="nws-product" data-nws-product={product.id ?? 'unknown'}>
      <p className="nws-product-state">
        Product validity:{' '}
        <strong data-nws-validity={validity}>
          {validity.replaceAll('_', ' ')}
        </strong>
        {' · '}Message eligibility:{' '}
        <strong data-nws-eligibility={eligibility}>
          {eligibility.replaceAll('_', ' ')}
        </strong>
        {' · '}Retrieval:{' '}
        <strong>{retrievalState(retrieval, now, unavailable)}</strong>
      </p>
      <p>
        Planning-location applicability:{' '}
        <strong data-nws-applicability={product.applicability}>
          {product.applicability}
        </strong>
        . {applicability}
      </p>
      <details>
        <summary>
          Product facts:{' '}
          {product.headline ?? product.event ?? product.id ?? 'Not reported'}
        </summary>
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
            {product.geometry.type ?? 'Type not reported'}. Applicability
            reason: {product.applicability_reason.replaceAll('_', ' ')}.
          </dd>
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
}: {
  live: LifecycleEvidenceState
}) {
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
  return (
    <section
      className="lifecycle-source-section"
      aria-label="NWS product provenance"
    >
      <h3>NWS-reported products</h3>
      <p data-nws-retrieval={retrieval}>
        NWS retrieval: <strong>{retrieval}</strong>
        {sourceFailed &&
          ' · NWS source reported an error; facts may be incomplete.'}
      </p>
      <p>
        Statewide Hawaiʻi query; only retained source polygons are evaluated
        against the displayed planning point. Products without polygons remain
        unknown. Product expiry uses wall time, never practice T+ or the last
        successful check. B04 remains manual.
      </p>
      {!products.length && (
        <p>
          {retrieval === 'fresh' && !sourceFailed && !missingProvenance
            ? 'No products returned by this query. This does not mean no hazard or order.'
            : 'NWS product availability is unknown. This does not mean no hazard or order.'}
        </p>
      )}
      {products.map((product, index) => (
        <NWSProductDetails
          key={`${product.id}:${index}`}
          product={product}
          now={live.now}
          retrieval={source}
          unavailable={unavailable || (Boolean(sourceFailed) && !source)}
        />
      ))}
    </section>
  )
}
