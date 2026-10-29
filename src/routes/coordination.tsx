import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useCoordinationEvidence } from '../lib/coordination-evidence'
import {
  buildAfnAnnex,
  buildReachPlan,
  buildTimeline,
  hazardTiming,
  usableTrigger,
} from '../lib/coordination-plan'
import { useCountyShelterPlans } from '../lib/county-shelter-plans'
import { useEventTriggers } from '../lib/event-triggers'
import { areas, hazards } from '../lib/mock-data'
import { useGeographicHazards } from '../lib/geographic-focus'
import type { HazardId } from '../lib/mock-data'
import { usePlanningAreaCatalog } from '../lib/planning-areas'
import { usePlanningStore } from '../store/planning-store'
import '../coordination.css'

export const Route = createFileRoute('/coordination')({
  component: Coordination,
})

function Coordination() {
  const catalog = usePlanningAreaCatalog()
  const plans = useCountyShelterPlans()
  const triggers = useEventTriggers()
  const [revision, setRevision] = useState(0)
  const { rows, loading } = useCoordinationEvidence(catalog.snapshot, revision)
  const [countyId, setCountyId] = useState('honolulu')
  const [hazard, setHazard] = useState<HazardId>('hurricane')
  const [triggerId, setTriggerId] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [canSpeak, setCanSpeak] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const mappedAreas = useMemo(
    () =>
      areas.filter((area) => rows.some((entry) => entry.areaId === area.id)),
    [rows],
  )
  const hazardScreens = useGeographicHazards(mappedAreas, hazard, true)
  useEffect(() => {
    setHydrated(true)
    setCanSpeak('speechSynthesis' in window)
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      window.clearInterval(timer)
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    }
  }, [])
  const row = rows.find((entry) => entry.countyId === countyId)
  const official =
    triggers.snapshot?.triggers.filter((trigger) =>
      usableTrigger(trigger, hazard, now),
    ) ?? []
  const trigger =
    official.find(
      (entry) => entry.provenance.product_id === triggerId && triggerId !== '',
    ) ?? null
  const timeline = buildTimeline(hazard)
  const reach = buildReachPlan(row?.profile ?? null)
  const countyPlan = plans.snapshot?.jurisdictions.find(
    (entry) => entry.id === countyId,
  )
  const selectArea = usePlanningStore((state) => state.setSelectedAreaId)

  function download() {
    if (!row) return
    const annex = buildAfnAnnex(
      row,
      hazard,
      trigger,
      countyPlan,
      Date.now(),
      hazardScreens[row.areaId],
    )
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(annex, null, 2)], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `afn-annex-${row.countyId}-${hazard}-UNSENT.json`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <main className="coordination-page" data-hydrated={hydrated}>
      <header className="coordination-header">
        <Link to="/">← Planning map</Link>
        <span>County-led · State ESF-6 support · Nothing auto-sent</span>
      </header>
      <div className="coordination-title">
        <div>
          <h1>From forecast to coordinated plan</h1>
          <p>
            Prepare the decisions before the emergency. Public evidence informs
            an unsent County AFN annex—not an activation, dispatch or evacuation
            order.
          </p>
        </div>
        <button type="button" disabled={!row || loading} onClick={download}>
          Download unsent AFN annex
        </button>
      </div>
      <section className="coordination-controls" aria-label="Plan assumptions">
        <label>
          County review
          <select
            aria-label="County review"
            disabled={!hydrated}
            value={countyId}
            onChange={(event) => setCountyId(event.target.value)}
          >
            <option value="honolulu">City and County of Honolulu</option>
            <option value="maui">Maui County</option>
            <option value="hawaii">Hawaiʻi County</option>
            <option value="kauai">Kauaʻi County</option>
          </select>
        </label>
        <label>
          Hazard
          <select
            aria-label="Hazard"
            disabled={!hydrated}
            value={hazard}
            onChange={(event) => {
              setHazard(event.target.value as HazardId)
              setTriggerId('')
            }}
          >
            {hazards.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Trigger context
          <select
            aria-label="Trigger context"
            disabled={!hydrated}
            value={trigger ? triggerId : ''}
            onChange={(event) => setTriggerId(event.target.value)}
          >
            <option value="">Practice scenario — not live</option>
            {official
              .filter((entry) => entry.provenance.product_id)
              .map((entry) => (
                <option
                  key={entry.provenance.product_id}
                  value={entry.provenance.product_id}
                >
                  Official statewide: {entry.title}
                </option>
              ))}
          </select>
        </label>
      </section>
      <p className="coordination-notice" role="status">
        <strong>
          {trigger
            ? 'Official statewide trigger context · draft actions'
            : 'Practice scenario · not a live event'}
        </strong>
        {' · '}
        {trigger ? trigger.title : 'No official trigger has been applied.'} Only
        fresh, active, hazard-matched statewide products are eligible; County
        applicability and orders require local verification.
        {trigger && (
          <>
            {' '}
            <a href={trigger.provenance.official_instructions_url}>
              Official instructions
            </a>{' '}
            · Retrieved {trigger.provenance.retrieved_at}
          </>
        )}{' '}
        Source feed: {triggers.status}.{' '}
        <button type="button" onClick={triggers.retry}>
          Refresh official triggers
        </button>
      </p>

      <section aria-labelledby="timeline-heading">
        <h2 id="timeline-heading">The action timeline</h2>
        <p>{hazardTiming[hazard].window}</p>
        <div className="coordination-timeline">
          {timeline.map((action) => (
            <article key={action.phase}>
              <h3>{action.phase}</h3>
              <p>{action.action}</p>
              <dl>
                <dt>County lead</dt>
                <dd>{action.lead}</dd>
                <dt>State support</dt>
                <dd>{action.support}</dd>
                <dt>Partner role</dt>
                <dd>{action.partners}</dd>
              </dl>
              <details>
                <summary>Decision point &amp; evidence</summary>
                <p>
                  <strong>{action.decision}</strong>
                </p>
                <p>{action.evidence}</p>
                <p>
                  <strong>When:</strong> {action.when}
                </p>
              </details>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="rollup-heading">
        <h2 id="rollup-heading">State ESF-6 · County roll-up</h2>
        <p>
          Four emergency-management jurisdictions; five political counties. Each
          row is one representative planning area,{' '}
          <strong>not County totals</strong>. Same three-day evacuation-shelter
          assumption; no practice inventory is counted as operational supply.
        </p>
        {catalog.status === 'error' || catalog.status === 'unavailable' ? (
          <p role="alert">
            County catalog unavailable. No geography was substituted.{' '}
            <button onClick={catalog.retry}>Retry catalog</button>
          </p>
        ) : loading ? (
          <p role="status">Loading public evidence and resource models…</p>
        ) : null}
        <div
          className="coordination-table-scroll"
          tabIndex={0}
          role="region"
          aria-label="County comparison table"
        >
          <table>
            <caption>
              Representative-area AFN needs, modeled demand and coverage gaps
            </caption>
            <thead>
              <tr>
                <th scope="col">County / coverage</th>
                <th scope="col">Public AFN signals</th>
                <th scope="col">Needs / gaps</th>
                <th scope="col">Partner coverage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr key={entry.countyId}>
                  <th scope="row">
                    {entry.countyName}
                    <small>{entry.areaName} · area-center tract only</small>
                  </th>
                  <td>
                    {entry.profile?.acs?.geography.name ?? 'Tract unknown'}
                    <small>
                      Disability:{' '}
                      {entry.profile?.acs?.population_with_disability.estimate?.toLocaleString() ??
                        'Unknown'}{' '}
                      ±
                      {entry.profile?.acs?.population_with_disability.margin_of_error?.toLocaleString() ??
                        'unknown'}{' '}
                      · No-vehicle households:{' '}
                      {entry.profile?.acs?.no_vehicle_households.estimate?.toLocaleString() ??
                        'Unknown'}{' '}
                      ±
                      {entry.profile?.acs?.no_vehicle_households.margin_of_error?.toLocaleString() ??
                        'unknown'}
                    </small>
                    <small>
                      ACS{' '}
                      {entry.profile?.acs?.source.vintage ?? 'vintage unknown'}{' '}
                      ·{' '}
                      {entry.profile?.acs?.source.status === 'fresh' &&
                      Date.parse(entry.profile.acs.source.fresh_until ?? '') >
                        now
                        ? 'fresh'
                        : 'stale or unavailable'}
                    </small>
                    <small>
                      Mapped hazard:{' '}
                      {(hazardScreens[entry.areaId]?.freshUntil ?? 0) > now
                        ? hazardScreens[entry.areaId]?.reason
                        : 'Unknown or stale; not a current forecast.'}
                    </small>
                  </td>
                  <td>
                    {entry.demand?.lines
                      .filter((line) =>
                        [
                          'shelter_spaces',
                          'meals',
                          'potable_water_liters',
                        ].includes(line.id),
                      )
                      .map((line) => (
                        <small key={line.id}>
                          {line.label}:{' '}
                          {line.demand
                            ? `${line.demand.low.toLocaleString()}–${line.demand.high.toLocaleString()} ${line.unit} modeled`
                            : 'Unknown'}
                        </small>
                      )) ?? 'Model unavailable'}
                    <small>
                      <strong>Operational gap unknown</strong> · No verified
                      supply deducted.
                    </small>
                    {entry.demand && (
                      <details>
                        <summary>All modeled needs &amp; unknowns</summary>
                        {entry.demand.lines.map((line) => (
                          <small key={line.id}>
                            {line.label}:{' '}
                            {line.demand
                              ? `${line.demand.low.toLocaleString()}–${line.demand.high.toLocaleString()} ${line.unit}`
                              : 'Unknown'}
                            {line.unavailable_reason
                              ? ` · ${line.unavailable_reason}`
                              : ''}
                          </small>
                        ))}
                      </details>
                    )}
                    <small>
                      Communication, Independence, Safety &amp; Support and
                      transport staffing require local assessment; population is
                      not AFN prevalence.
                    </small>
                  </td>
                  <td>
                    {entry.partners
                      ? `${entry.partners.summary.matched_capabilities} documented capability matches; ${entry.partners.summary.unmatched_capabilities} unmatched`
                      : 'Documented roles unknown'}
                    <small>Capacity / activation unknown</small>
                  </td>
                </tr>
              ))}
              <tr>
                <th scope="row">Kalawao County</th>
                <td>Separate AFN coverage unknown</td>
                <td>Needs and gaps unknown</td>
                <td>
                  Special jurisdiction; coordinate with State health authorities
                  and Maui emergency management. No independent workflow
                  inferred.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Molokaʻi, Lānaʻi, Niʻihau, rural and off-grid coverage is not
          established by these representative tracts. Unknown is never zero.{' '}
          <button
            type="button"
            onClick={() => setRevision((value) => value + 1)}
          >
            Retry County evidence
          </button>
        </p>
      </section>

      <section aria-labelledby="reach-heading">
        <h2 id="reach-heading">
          Reach residents · {row?.areaName ?? 'County evidence pending'}
        </h2>
        <p>
          {reach.geography} · {reach.languageTable}.{' '}
          <a href={reach.languageSource}>Public ACS language table</a>
        </p>
        <p>{reach.limitation}</p>
        <ul className="coordination-languages">
          {reach.languages.length ? (
            reach.languages.map((language) => (
              <li key={language.variable}>
                <strong>{language.label}</strong>:{' '}
                {language.speakers.estimate?.toLocaleString() ?? 'Unknown'}{' '}
                speakers, ±
                {language.speakers.margin_of_error?.toLocaleString() ??
                  'unknown'}{' '}
                margin of error
              </li>
            ))
          ) : (
            <li>
              Language-specific estimates unavailable. Do not substitute assumed
              languages; verify with County language-access staff and trusted
              local organizations.
            </li>
          )}
        </ul>
        <div className="coordination-reach">
          <div>
            <h3>Accessible formats</h3>
            <ul>
              {reach.formats.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                window.speechSynthesis.cancel()
                window.speechSynthesis.speak(
                  new SpeechSynthesisUtterance(
                    `${reach.guidance} ${reach.review}`,
                  ),
                )
              }}
              disabled={!canSpeak}
            >
              Read review guidance aloud
            </button>
            <small>
              Device speech is a convenience, not a substitute for reviewed
              accessible alerts.
            </small>
          </div>
          <div>
            <h3>Low-connectivity reach</h3>
            <ul>
              {reach.channels.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </div>
        </div>
        <p>{reach.owner}</p>
        <p>{reach.guidance}</p>
        <p className="coordination-notice">
          <strong>{reach.review}</strong>
        </p>
      </section>
      <section aria-labelledby="annex-heading">
        <h2 id="annex-heading">County AFN annex · review before use</h2>
        <p>
          The structured JSON draft consolidates purpose and scope, situation
          and assumptions, public map/needs evidence, resource-model ranges,
          sourced partner roles, concept of operations, resident communications
          and administration/review. The outline supports an ESF-6 mass-care
          annex; it is not an official County template.
        </p>
        <p>
          County shelter-plan provenance:{' '}
          {countyPlan
            ? `${countyPlan.coverage} · ${countyPlan.validation_status}`
            : `unknown (${plans.status})`}
          . County approval, operational capacity and activation remain pending.
        </p>
        {row?.errors.map((error) => (
          <p key={error} className="coordination-gap">
            {error}
          </p>
        ))}
        <div className="coordination-footer-actions">
          <button type="button" disabled={!row || loading} onClick={download}>
            Download unsent AFN annex
          </button>
          <Link
            to="/"
            onClick={() => {
              if (row) selectArea(row.areaId)
            }}
          >
            Review selected area on map →
          </Link>
        </div>
      </section>
    </main>
  )
}
