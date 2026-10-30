import { useState } from 'react'

import {
  displayedShelterEvidence,
  sourceReading,
} from '../lib/lifecycle-evidence'
import type { LifecycleEvidenceState } from '../lib/lifecycle-evidence'
import {
  maxSourceClaims,
  maxSourceRechecks,
  sourceObservationState,
  sourceRetrievalState,
} from '../lib/source-evidence'
import type { SourceClaim, SourceReading } from '../lib/source-evidence'
import { practiceRoles } from '../lib/practice-lifecycle'
import type {
  LifecycleAction,
  LifecycleState,
  PracticeRole,
  RecoveryRow,
} from '../lib/practice-lifecycle'

function ClaimFacts({ claim }: { claim: SourceClaim }) {
  return (
    <dl
      className="lifecycle-source-facts"
      data-source-digest={claim.content_digest}
    >
      <dt>Report</dt>
      <dd>{claim.name}</dd>
      <dt>Reported city</dt>
      <dd>{claim.city ?? 'Unknown'}</dd>
      <dt>Reported status</dt>
      <dd>{claim.facts.reported_status ?? 'Unknown'}</dd>
      <dt>Reported capacity (not available beds)</dt>
      <dd>{claim.facts.reported_capacity ?? 'Unknown — not zero'}</dd>
      <dt>Accessibility code (not current verification)</dt>
      <dd>{claim.facts.wheelchair_accessible ?? 'Unknown'}</dd>
      <dt>Pet accommodation code (not admission)</dt>
      <dd>{claim.facts.pet_accommodations ?? 'Unknown'}</dd>
      <dt>Product / source</dt>
      <dd>
        {claim.product} · {claim.source_id} · {claim.item_id}
      </dd>
      <dt>Authority / link</dt>
      <dd>
        {claim.authority} ·{' '}
        <a href={claim.url} target="_blank" rel="noreferrer">
          Official source
        </a>
      </dd>
      <dt>Geography / scope</dt>
      <dd>
        {claim.geography} · {claim.scope}
      </dd>
      <dt>Source updated / expires</dt>
      <dd>
        {claim.source_updated_at ?? 'Unknown'} /{' '}
        {claim.source_expires_at ?? 'Unknown'}
      </dd>
      <dt>Limitations</dt>
      <dd>{claim.limitations.join(' ')}</dd>
      <dt>Fact digest / derivation</dt>
      <dd>
        {claim.content_digest} · {claim.derivation_version}
      </dd>
    </dl>
  )
}

function ReadingDetails({
  reading,
  now,
}: {
  reading: SourceReading
  now: number
}) {
  return (
    <div className="lifecycle-source-reading">
      <p>
        Source observation:{' '}
        <strong>{sourceObservationState(reading, now)}</strong> · Retrieval:{' '}
        {sourceRetrievalState(reading.context, now, reading.transport)} · Query
        processing: {reading.context?.coverage ?? 'unavailable'}
      </p>
      {reading.claim && <ClaimFacts claim={reading.claim} />}
      <p className="lifecycle-output">
        Snapshot {reading.snapshotId ?? 'unavailable'} · Generated{' '}
        {reading.generatedAt ?? 'unknown'} · Retrieved{' '}
        {reading.context?.retrieved_at ?? 'unknown'} · Retrieval deadline{' '}
        {reading.context?.fresh_until ?? 'unknown'} · Checked{' '}
        {reading.checkedAt ?? 'not checked'}
      </p>
    </div>
  )
}

type Props = {
  state: LifecycleState
  live: LifecycleEvidenceState
  act: (action: LifecycleAction) => void
}

export function SourceAcceptance({ state, live, act }: Props) {
  const [selected, setSelected] = useState<SourceReading | null>(null)
  const [gapId, setGapId] = useState('')
  const { snapshot } = displayedShelterEvidence(live)
  const claims = snapshot?.shelter_context.items ?? []
  const gap =
    state.carriedGaps.find((item) => item.gapId === gapId) ??
    state.carriedGaps.at(0)
  const duplicate =
    selected &&
    state.sourceEvidence.some(
      (item) =>
        item.gapId === gap?.gapId &&
        item.displayed.claim?.content_digest === selected.claim?.content_digest,
    )
  return (
    <section
      className="lifecycle-source-section"
      aria-label="Attach public source context"
    >
      <h4>Attach a public source claim</h4>
      <p>
        Facilitator-selected planning context only. Attachment does not record
        criteria, complete B07, or establish that this fictional event affects
        the planning location. This register accepts only bounded FEMA reports;
        NWS product revisions use the separate weather record below.
      </p>
      {!claims.length && (
        <p>No attachable reports returned. Unknown is not zero.</p>
      )}
      <div className="lifecycle-button-list">
        {claims.map((claim) => (
          <button
            type="button"
            className="secondary"
            key={claim.item_id}
            disabled={Boolean(state.h1) || state.phase !== 'before'}
            onClick={() => setSelected(sourceReading(live, claim.item_id))}
          >
            Review report {claim.name}
          </button>
        ))}
      </div>
      {selected && (
        <div data-reviewed-source={selected.claim?.content_digest}>
          <h4>Displayed revision to accept</h4>
          <p>
            Refreshes do not replace this reviewed revision. Review the report
            again to select newer facts.
          </p>
          <ReadingDetails reading={selected} now={live.now} />
          <label>
            Attach to carried gap
            <select
              value={gap?.gapId ?? ''}
              onChange={(event) => setGapId(event.target.value)}
            >
              {!gap && <option value="">Carry a gap first</option>}
              {state.carriedGaps.map((item) => (
                <option key={item.gapId} value={item.gapId}>
                  {item.gapId}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={
              !gap ||
              Boolean(state.h1) ||
              state.phase !== 'before' ||
              Boolean(duplicate) ||
              state.sourceEvidence.length >= maxSourceClaims
            }
            onClick={() =>
              gap &&
              act({
                type: 'accept-source',
                gapId: gap.gapId,
                displayed: selected,
                acceptedAt: new Date().toISOString(),
              })
            }
          >
            Accept displayed source claim
          </button>
        </div>
      )}
      <p>
        {state.sourceEvidence.length}/{maxSourceClaims} bounded source claims
        accepted; existing versions are immutable.
      </p>
      {state.sourceEvidence.map((item) => (
        <details key={item.id} data-accepted-source={item.id}>
          <summary>
            {item.id} · {item.gapId} · {item.displayed.claim?.name} ·{' '}
            {item.displayed.claim?.content_digest}
          </summary>
          <p>
            {item.acceptanceState} · Accepted {item.acceptedAt} ·{' '}
            {item.freshnessAtAcceptance} at acceptance
          </p>
          <ReadingDetails reading={item.displayed} now={live.now} />
        </details>
      ))}
    </section>
  )
}

export function ReportedShelterContext({
  live,
}: {
  live: LifecycleEvidenceState
}) {
  const { snapshot, transport } = displayedShelterEvidence(live)
  const context = snapshot?.shelter_context
  return (
    <section
      className="lifecycle-source-section"
      aria-label="FEMA-reported shelter context"
    >
      <h4>FEMA-reported shelter context</h4>
      <p>
        Separate from the manual practice service-area condition below. A report
        is not admission, available beds, complete County coverage, current
        accessibility verification, restoration, or a service condition.
      </p>
      <p role="status">
        Retrieval: {sourceRetrievalState(context ?? null, live.now, transport)}{' '}
        · Query processing:{' '}
        {transport === 'unavailable'
          ? 'unavailable'
          : (context?.coverage ?? 'unavailable')}{' '}
        · Source observation time: unknown
        {transport === 'unavailable' && context?.items.length
          ? ' · Last-known reported facts retained'
          : ''}
      </p>
      {context?.items.length ? (
        context.items.map((claim) => (
          <details key={claim.item_id} open={context.items.length === 1}>
            <summary>
              {claim.name} · reported {claim.facts.reported_status ?? 'unknown'}
            </summary>
            <ReadingDetails
              reading={sourceReading(live, claim.item_id)}
              now={live.now}
            />
          </details>
        ))
      ) : (
        <p>
          {transport === 'ok' && context?.coverage === 'complete'
            ? 'No records reported by this query. This does not mean no shelters.'
            : 'Reported shelter facts unavailable or incomplete. Unknown is not zero.'}
        </p>
      )}
    </section>
  )
}

export function SourceRechecks({ state, live, act }: Props) {
  const [owner, setOwner] = useState<PracticeRole>('Recovery lead')
  const [horizon, setHorizon] = useState<RecoveryRow['horizon']>('next shift')
  const [checking, setChecking] = useState(false)
  return (
    <section
      className="lifecycle-source-section"
      aria-label="Accepted source rechecks"
    >
      <h4>Recheck accepted public evidence</h4>
      <p>
        Unknown, stale, or unavailable accepted observations need an owned,
        bounded check. A successful retrieval is not recovery. Accepted facts
        and sealed handoffs never change.
      </p>
      <label>
        Source recheck owner
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
        Source recheck horizon
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
      {state.sourceEvidence.map((accepted) => (
        <button
          type="button"
          className="secondary"
          key={accepted.id}
          disabled={
            state.phase !== 'after' ||
            checking ||
            state.sourceRechecks.length >= maxSourceRechecks ||
            (sourceObservationState(accepted.displayed, live.now) === 'fresh' &&
              !live.error)
          }
          onClick={async () => {
            setChecking(true)
            try {
              const check = await live.refresh()
              const reading = sourceReading(
                check,
                accepted.displayed.claim!.item_id,
              )
              act({
                type: 'recheck-source',
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
          {checking ? 'Checking source…' : `Recheck source ${accepted.id}`}
        </button>
      ))}
      <p>
        {state.sourceRechecks.length}/{maxSourceRechecks} bounded checks
        recorded. Not-returned means only absent from a successful complete
        query, not closed or recovered.
      </p>
      <ul className="lifecycle-output-list">
        {state.sourceRechecks.map((check) => (
          <li key={check.id} data-source-recheck={check.result}>
            <details>
              <summary>
                {check.id} · {check.acceptedId}: {check.result} · {check.owner}{' '}
                · {check.horizon}
              </summary>
              <p>
                Checked {check.checkedAt} · Accepted record{' '}
                {check.acceptedDigest} remains unchanged.
              </p>
              <ReadingDetails reading={check.reading} now={live.now} />
            </details>
          </li>
        ))}
      </ul>
    </section>
  )
}
