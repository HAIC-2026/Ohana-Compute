import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'

import { OperationsLayout } from '../components/OperationsLayout'
import {
  ReportedShelterContext,
  SourceAcceptance,
  SourceRechecks,
} from '../components/LifecycleSourceContext'
import {
  evidenceFeedState,
  lifecycleEvidenceCounts,
  useLifecycleEvidence,
} from '../lib/lifecycle-evidence'
import { LifecycleWeatherContext } from '../components/NWSProductDetails'
import {
  applyLifecycleAction,
  canonicalLifecycleRecord,
  capabilityIds,
  cmistDomains,
  createInitialLifecycleState,
  dueBands,
  exportLifecycleRecord,
  followThroughDoneChecks,
  gapCatalog,
  generateCloseoutPacket,
  guidanceBlocks,
  h1Gates,
  h1Ready,
  lifecycleDigest,
  lifecycleGates,
  lifecycleGatesMet,
  lifecycleStorageKey,
  legacyLifecycleStorageKey,
  maxFollowThroughObservations,
  migrateLifecycleV1State,
  migrateLifecycleV2State,
  migrateLifecycleV3State,
  migrateLifecycleV4State,
  v2LifecycleStorageKey,
  v3LifecycleStorageKey,
  v4LifecycleStorageKey,
  objectiveCatalog,
  packetSectionChoices,
  practicePartners,
  practiceRoles,
  practiceStamp,
  restoreLifecycleState,
  revealedInjects,
  serviceAreas,
  serviceRecordNeedsRecheck,
  serviceRecordStale,
  serializeLifecycleState,
} from '../lib/practice-lifecycle'
import type {
  CapabilityId,
  LifecycleAction,
  LifecycleState,
  PracticeRole,
  RecoveryRow,
} from '../lib/practice-lifecycle'
import { practiceLocation } from '../lib/waianae-case'
import '../lifecycle.css'

export const Route = createFileRoute('/lifecycle')({
  component: PracticeLifecycle,
  head: () => ({
    meta: [{ title: 'Practice lifecycle · Hawaiʻi Mass Care Planner' }],
  }),
})

const channelChoices: Array<LifecycleState['channel']> = [
  'trusted voice',
  'printed handout',
  'local radio',
]
const formatChoices: Array<
  LifecycleState['formats'][keyof LifecycleState['formats']]
> = ['planned', 'gap', 'unknown']
const defaultObjectives: LifecycleState['objectives'] = [
  'timing',
  'outreach',
  'shift',
]

function Capability({
  id,
  title,
  marker,
  children,
}: {
  id: CapabilityId
  title: string
  marker: boolean
  children: React.ReactNode
}) {
  return (
    <article
      className={`lifecycle-capability ${marker ? 'is-complete' : ''}`}
      data-capability={id}
    >
      <header>
        <span className="lifecycle-id">{id}</span>
        <h3>{title}</h3>
        <span className="lifecycle-marker" aria-label={`${id} marker`}>
          {marker ? 'Recorded' : 'Ready'}
        </span>
      </header>
      {children}
    </article>
  )
}

function Choice({
  label,
  value,
  checked,
  onChange,
}: {
  label: string
  value: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <label className="lifecycle-choice">
      <input
        type="checkbox"
        value={value}
        checked={checked}
        onChange={onChange}
      />
      {label}
    </label>
  )
}

function download(filename: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function FollowThroughCreator({
  row,
  act,
}: {
  row: RecoveryRow
  act: (action: LifecycleAction) => void
}) {
  const [owner, setOwner] = useState<PracticeRole>('Recovery lead')
  const [dueHorizon, setDueHorizon] =
    useState<RecoveryRow['horizon']>('next day')
  const [doneCheck, setDoneCheck] = useState<
    (typeof followThroughDoneChecks)[number]
  >('practice-review-recorded')
  return (
    <details className="lifecycle-choice-group">
      <summary>Create follow-through for {row.gapId}</summary>
      <label>
        Owner
        <select
          aria-label={`Follow-through owner for ${row.supportItemId}`}
          value={owner}
          onChange={(event) => setOwner(event.target.value as PracticeRole)}
        >
          {practiceRoles.map((role) => (
            <option key={role}>{role}</option>
          ))}
        </select>
      </label>
      <label>
        Due horizon
        <select
          aria-label={`Follow-through due horizon for ${row.supportItemId}`}
          value={dueHorizon}
          onChange={(event) =>
            setDueHorizon(event.target.value as RecoveryRow['horizon'])
          }
        >
          {['next shift', 'next day', 'next exercise'].map((horizon) => (
            <option key={horizon}>{horizon}</option>
          ))}
        </select>
      </label>
      <label>
        Done check
        <select
          aria-label={`Follow-through done check for ${row.supportItemId}`}
          value={doneCheck}
          onChange={(event) =>
            setDoneCheck(
              event.target.value as (typeof followThroughDoneChecks)[number],
            )
          }
        >
          {followThroughDoneChecks.map((check) => (
            <option key={check}>{check}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() =>
          act({
            type: 'create-follow-through',
            supportItemId: row.supportItemId,
            owner,
            dueHorizon,
            doneCheck,
          })
        }
      >
        Create structured follow-through
      </button>
    </details>
  )
}

function PracticeLifecycle() {
  const [state, setState] = useState(createInitialLifecycleState)
  const [restored, setRestored] = useState(false)
  const [restoreFailed, setRestoreFailed] = useState(false)
  const stateRef = useRef(state)
  stateRef.current = state
  const [message, setMessage] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [selectedObjectives, setSelectedObjectives] =
    useState<LifecycleState['objectives']>(defaultObjectives)
  const [comparisonText, setComparisonText] = useState('')
  const [packetSections, setPacketSections] = useState<
    LifecycleState['packetSections']
  >(() => createInitialLifecycleState().packetSections)
  const [channel, setChannel] = useState<LifecycleState['channel']>(
    () => createInitialLifecycleState().channel,
  )
  const [incomingRole, setIncomingRole] =
    useState<PracticeRole>('Recovery lead')
  const liveEvidence = useLifecycleEvidence(practiceLocation)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(lifecycleStorageKey)
      const v4 = saved
        ? null
        : window.localStorage.getItem(v4LifecycleStorageKey)
      const v3 =
        saved || v4 ? null : window.localStorage.getItem(v3LifecycleStorageKey)
      const v2 =
        saved || v4 || v3
          ? null
          : window.localStorage.getItem(v2LifecycleStorageKey)
      const legacy =
        saved || v4 || v3 || v2
          ? null
          : window.localStorage.getItem(legacyLifecycleStorageKey)
      if (saved || v4 || v3 || v2 || legacy) {
        const next = saved
          ? restoreLifecycleState(saved)
          : v4
            ? migrateLifecycleV4State(v4)
            : v3
              ? migrateLifecycleV3State(v3)
              : v2
                ? migrateLifecycleV2State(v2)
                : migrateLifecycleV1State(legacy!)
        setState(next)
        setSelectedObjectives(
          next.objectives.length ? next.objectives : defaultObjectives,
        )
        setPacketSections(next.packetSections)
        setChannel(next.channel)
      }
    } catch (error) {
      setRestoreFailed(true)
      setMessage(
        error instanceof Error
          ? `${error.message} Reset to start a new local practice cycle.`
          : 'Saved lifecycle state could not be restored.',
      )
    } finally {
      setRestored(true)
    }
  }, [])

  useEffect(() => {
    if (!restored || restoreFailed) return
    try {
      window.localStorage.setItem(
        lifecycleStorageKey,
        serializeLifecycleState(state),
      )
    } catch {
      setMessage(
        'Local persistence failed. Keep this page open and export the strict record before leaving.',
      )
    }
  }, [restored, restoreFailed, state])

  const act = (action: LifecycleAction) => {
    try {
      if (restoreFailed)
        throw new Error(
          'Reset the invalid saved record before recording new actions.',
        )
      const next = applyLifecycleAction(stateRef.current, action)
      stateRef.current = next
      setState(next)
      setMessage('')
      setAnnouncement(
        `Recorded ${action.type.replaceAll('-', ' ')} in the local practice ledger.`,
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Action unavailable.')
      setAnnouncement('Practice lifecycle action was not recorded.')
    }
  }
  const marked = (id: CapabilityId) => state.capabilityMarkers.includes(id)
  const h1 = h1Gates(state)
  const gates = lifecycleGates(state)
  const injects = revealedInjects(state)
  const staleEvidence = state.evidence.filter((item) => item.state === 'stale')
  const sealedChoice = state.assumptions.chosen ?? 'r1'
  const sealedRevision = state.assumptions[sealedChoice]
  const packetSelectionSaved =
    packetSections.length === state.packetSections.length &&
    packetSections.every((section) => state.packetSections.includes(section))
  const currentPhaseIndex = ['before', 'during', 'after', 'complete'].indexOf(
    state.phase,
  )
  const markerCount = capabilityIds.filter(marked).length
  const canonicalExport = useMemo(() => exportLifecycleRecord(state), [state])
  const evidenceCounts = liveEvidence.snapshot
    ? lifecycleEvidenceCounts(liveEvidence.snapshot)
    : null
  const evidencePhase = state.phase === 'complete' ? null : state.phase
  const evidencePhaseSealed =
    (evidencePhase === 'before' && Boolean(state.h1)) ||
    (evidencePhase === 'during' && Boolean(state.h2))
  const visibleSnapshotPinned = Boolean(
    liveEvidence.snapshot &&
    evidencePhase &&
    state.pinnedEvidence.some(
      (item) =>
        item.phase === evidencePhase &&
        item.snapshotId === liveEvidence.snapshot?.snapshot_id,
    ),
  )

  return (
    <OperationsLayout title="Practice the complete event lifecycle">
      <div
        hidden
        dangerouslySetInnerHTML={{
          __html: `<!--
THESIS: The lifecycle is one auditable practice chain, not a dashboard of disconnected phase cards.
OWN-WORLD: State-charcoal headers, atlas-paper work surfaces, teal current-state controls, and dense operational registers.
STORY: Lock bounded preparation facts, carry them through response practice, then close every recovery loop into the next cycle.
FIRST VIEWPORT: Safety boundary, cycle/time/digest instruments, and a three-phase rail establish state before the first action.
FORM: Established Hawaiʻi Mass Care Planner operating console; responsive two-column register becomes a single mobile workstream.
-->`,
        }}
      />
      <div
        className="lifecycle-banner"
        role="note"
        data-lifecycle-restored={restored}
      >
        <strong>{practiceStamp} · LOCAL PRACTICE WORKSPACE</strong>
        <p>
          Fixed fictional roles and partners only. No resident records, staff
          writes, messages, resource movement, protective actions, or live
          condition claims are created here.
        </p>
      </div>
      <div className="lifecycle-toolbar" aria-label="Lifecycle status">
        <div>
          <span>Cycle</span>
          <strong>{state.cycle}</strong>
        </div>
        <div>
          <span>Practice time</span>
          <strong>
            T{state.practiceMinute >= 0 ? '+' : ''}
            {state.practiceMinute}
          </strong>
        </div>
        <div>
          <span>Capabilities</span>
          <strong>{markerCount}/30</strong>
        </div>
        <div>
          <span>Open follow-through</span>
          <strong>
            {
              state.followThroughItems.filter(
                (item) =>
                  item.status === 'planned' || item.status === 'in-progress',
              ).length
            }
          </strong>
        </div>
        <div>
          <span>Cycle digest</span>
          <strong>{lifecycleDigest(state)}</strong>
        </div>
      </div>
      <ol
        className="lifecycle-phases"
        aria-label="Before during after progress"
      >
        {['Before', 'During', 'After'].map((phase, index) => (
          <li
            key={phase}
            className={index === currentPhaseIndex ? 'is-current' : ''}
            data-reached={index <= currentPhaseIndex}
            aria-current={index === currentPhaseIndex ? 'step' : undefined}
          >
            <span>{index + 1}</span>
            <strong>{phase}</strong>
          </li>
        ))}
      </ol>
      <section
        className="lifecycle-evidence-panel"
        aria-labelledby="lifecycle-evidence-heading"
        data-evidence-state={
          liveEvidence.snapshot?.status ?? liveEvidence.status
        }
      >
        <div className="lifecycle-evidence-heading">
          <div>
            <p className="operations-stamp">
              PUBLIC SOURCE EVIDENCE · READ ONLY
            </p>
            <h2 id="lifecycle-evidence-heading">Live lifecycle evidence</h2>
          </div>
          <button type="button" onClick={liveEvidence.refresh}>
            Refresh
          </button>
        </div>
        <p>
          Public evidence is planning context only—not dispatch, an order,
          passability, restoration, containment, shelter completeness, partner
          acceptance, resource movement, recovery completion, or all-clear
          truth.
        </p>
        {liveEvidence.snapshot ? (
          <>
            <div className="lifecycle-evidence-summary">
              <div>
                <span>Snapshot</span>
                <strong>{liveEvidence.snapshot.snapshot_id}</strong>
                <small>
                  Generated{' '}
                  {new Date(
                    liveEvidence.snapshot.generated_at,
                  ).toLocaleString()}
                </small>
              </div>
              <div>
                <span>Overall</span>
                <strong>{liveEvidence.snapshot.status}</strong>
                <small>
                  Retrieval deadline{' '}
                  {liveEvidence.snapshot.valid_until
                    ? new Date(
                        liveEvidence.snapshot.valid_until,
                      ).toLocaleString()
                    : 'unknown'}
                </small>
              </div>
              <div>
                <span>Event triggers</span>
                <strong>
                  {evidenceCounts?.triggers ?? 'unavailable'} ·{' '}
                  {evidenceFeedState(
                    liveEvidence,
                    'event_triggers',
                    liveEvidence.now,
                  )}
                </strong>
                <small>
                  Feed {liveEvidence.snapshot.event_triggers.status} ·{' '}
                  {evidenceCounts?.unavailableEventSources ?? 'unknown'} source
                  unavailable
                </small>
              </div>
              <div>
                <span>Operational domains</span>
                <strong>
                  {evidenceCounts?.domains ?? 'unavailable'} ·{' '}
                  {evidenceFeedState(
                    liveEvidence,
                    'operational_status',
                    liveEvidence.now,
                  )}
                </strong>
                <small>
                  {evidenceCounts?.unavailableDomains ?? 'unknown'} unavailable
                </small>
              </div>
            </div>
            {liveEvidence.lastKnown && (
              <p className="lifecycle-evidence-warning" role="status">
                LAST KNOWN · The latest check failed: {liveEvidence.error}
              </p>
            )}
            {liveEvidence.refreshing && (
              <p className="lifecycle-evidence-refreshing" role="status">
                Refreshing public evidence…
              </p>
            )}
            <LifecycleWeatherContext
              live={liveEvidence}
              state={state}
              act={act}
            />
            <button
              type="button"
              disabled={
                !evidencePhase || evidencePhaseSealed || visibleSnapshotPinned
              }
              onClick={() => {
                if (!liveEvidence.snapshot || !evidencePhase || !evidenceCounts)
                  return
                act({
                  type: 'pin-evidence',
                  reference: {
                    phase: evidencePhase,
                    snapshotId: liveEvidence.snapshot.snapshot_id,
                    generatedAt: liveEvidence.snapshot.generated_at,
                    validUntil: liveEvidence.snapshot.valid_until ?? null,
                    overallStatus: liveEvidence.snapshot.status,
                    triggerCount: evidenceCounts.triggers,
                    domainCount: evidenceCounts.domains,
                    unavailableDomainCount: evidenceCounts.unavailableDomains,
                    eventUnavailableSourceCount:
                      evidenceCounts.unavailableEventSources,
                    eventTriggerState: evidenceFeedState(
                      liveEvidence,
                      'event_triggers',
                      Date.now(),
                    ),
                    operationalStatusState: evidenceFeedState(
                      liveEvidence,
                      'operational_status',
                      Date.now(),
                    ),
                    eventTriggerStatus:
                      liveEvidence.snapshot.event_triggers.status,
                    operationalStatusStatus:
                      liveEvidence.snapshot.operational_status.status,
                  },
                })
              }}
            >
              {visibleSnapshotPinned
                ? `Pinned in ${evidencePhase}`
                : evidencePhaseSealed
                  ? `${evidencePhase} handoff sealed`
                  : evidencePhase
                    ? `Pin snapshot into ${evidencePhase}`
                    : 'Cycle complete'}
            </button>
          </>
        ) : (
          <p className="lifecycle-evidence-warning" role="status">
            {liveEvidence.status === 'loading'
              ? 'Checking authoritative public evidence…'
              : `Evidence unavailable: ${liveEvidence.error ?? 'No valid snapshot returned.'}`}
          </p>
        )}
        {liveEvidence.checkedAt && (
          <p className="lifecycle-evidence-checked">
            Last check {new Date(liveEvidence.checkedAt).toLocaleString()}
          </p>
        )}
      </section>
      <p className="operations-lead">
        One immutable chain carries planning decisions into response practice,
        recovery review, and the next cycle. Each capability changes local
        state, records a stable marker, and appends a deterministic ledger
        event.
      </p>
      <nav className="lifecycle-jump" aria-label="Lifecycle sections">
        <a href="#before">Before</a>
        <a href="#during">During</a>
        <a href="#after">After</a>
        <a href="#ledger">Ledger</a>
        <Link to="/operations">Restricted staff operations</Link>
        <Link to="/source-health">Source health</Link>
      </nav>
      {message && (
        <p className="lifecycle-message" role="status">
          {message}
        </p>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <section id="before" aria-labelledby="before-heading">
        <div className="lifecycle-section-heading">
          <div>
            <p className="operations-stamp">PHASE 1 · BEFORE</p>
            <h2 id="before-heading">Prepare a bounded practice cycle</h2>
          </div>
          {state.h1 && <span>H1 sealed · {state.h1.digest}</span>}
        </div>
        <div className="lifecycle-grid">
          <Capability
            id="B01"
            title="Lock the fictional event"
            marker={marked('B01')}
          >
            <p>The event seed cannot change without an explicit full reset.</p>
            <label>
              Fictional hazard event
              <select
                aria-label="Fictional hazard event"
                defaultValue="hurricane-amber"
                disabled={Boolean(state.event)}
                id="event-choice"
              >
                <option value="hurricane-amber">Practice Event Amber</option>
                <option value="wildfire-cinder">Practice Event Cinder</option>
              </select>
            </label>
            <button
              type="button"
              disabled={Boolean(state.event)}
              onClick={() => {
                const element =
                  document.querySelector<HTMLSelectElement>('#event-choice')
                act({
                  type: 'lock-event',
                  eventId:
                    element?.value === 'wildfire-cinder'
                      ? 'wildfire-cinder'
                      : 'hurricane-amber',
                })
              }}
            >
              Lock practice event
            </button>
            {state.event && (
              <p className="lifecycle-output">
                Cycle {state.cycle} · {state.event.label} · {state.event.hazard}
              </p>
            )}
          </Capability>

          <Capability
            id="B02"
            title="Rank and carry readiness gaps"
            marker={marked('B02')}
          >
            <p>
              Add owned, bounded actions. Their order becomes the support queue.
            </p>
            <div className="lifecycle-button-list">
              {gapCatalog.map((gap, index) => (
                <button
                  type="button"
                  className="secondary"
                  key={gap.id}
                  onClick={() =>
                    act({
                      type: 'carry-gap',
                      gapId: gap.id,
                      owner: practiceRoles[(index + 1) % practiceRoles.length],
                      dueBand: dueBands[index % dueBands.length],
                    })
                  }
                >
                  Carry {gap.label}
                </button>
              ))}
            </div>
            <ol className="lifecycle-output-list">
              {state.carriedGaps.map((gap) => (
                <li key={gap.gapId}>
                  {gap.rank}. {gap.gapId} · {gap.owner} · {gap.dueBand}
                </li>
              ))}
            </ol>
          </Capability>

          <Capability
            id="B03"
            title="Choose measurable objectives"
            marker={marked('B03')}
          >
            <fieldset>
              <legend>Select 1–3 objectives</legend>
              {objectiveCatalog.map((objective) => (
                <Choice
                  key={objective.id}
                  label={objective.label}
                  value={objective.id}
                  checked={selectedObjectives.includes(objective.id)}
                  onChange={() =>
                    setSelectedObjectives((current) =>
                      current.includes(objective.id)
                        ? current.filter((id) => id !== objective.id)
                        : [...current, objective.id],
                    )
                  }
                />
              ))}
            </fieldset>
            <button
              type="button"
              onClick={() =>
                act({
                  type: 'set-objectives',
                  objectiveIds: selectedObjectives,
                })
              }
            >
              Freeze objective selection
            </button>
            <p className="lifecycle-output">
              {state.objectives.join(', ') || 'No objectives frozen'}
            </p>
          </Capability>

          <Capability
            id="B04"
            title="Compute preparation margin"
            marker={marked('B04')}
          >
            <div className="lifecycle-inline-fields">
              <label>
                Warning minutes
                <input
                  id="warning-minutes"
                  type="number"
                  min="0"
                  max="1440"
                  defaultValue="120"
                />
              </label>
              <label>
                Preparation minutes
                <input
                  id="preparation-minutes"
                  type="number"
                  min="0"
                  max="1440"
                  defaultValue="60"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() =>
                act({
                  type: 'set-timing',
                  warningMinutes: Number(
                    document.querySelector<HTMLInputElement>('#warning-minutes')
                      ?.value,
                  ),
                  preparationMinutes: Number(
                    document.querySelector<HTMLInputElement>(
                      '#preparation-minutes',
                    )?.value,
                  ),
                })
              }
            >
              Compute bounded margin
            </button>
            <p className="lifecycle-output">
              {state.timing.marginMinutes === null
                ? 'Margin not computed'
                : state.timing.marginMinutes > 0
                  ? `${state.timing.marginMinutes} practice minutes remain`
                  : `Window exhausted by ${Math.abs(state.timing.marginMinutes)} practice minutes`}
            </p>
          </Capability>

          <Capability
            id="B05"
            title="Compare assumption sets"
            marker={marked('B05')}
          >
            <p>Fixed practice population: 500 aggregate people.</p>
            <div className="lifecycle-inline-fields">
              <label>
                Comparison uptake %
                <input
                  id="comparison-uptake"
                  type="number"
                  min="1"
                  max="100"
                  defaultValue="20"
                />
              </label>
              <label>
                Comparison support days
                <input
                  id="comparison-days"
                  type="number"
                  min="1"
                  max="14"
                  defaultValue="5"
                />
              </label>
            </div>
            <div className="operations-actions">
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  act({
                    type: 'choose-assumption',
                    choice: 'r1',
                    uptakePercent: 10,
                    supportDays: 3,
                  })
                }
              >
                Carry sealed r1
              </button>
              <button
                type="button"
                onClick={() =>
                  act({
                    type: 'choose-assumption',
                    choice: 'comparison',
                    uptakePercent: Number(
                      document.querySelector<HTMLInputElement>(
                        '#comparison-uptake',
                      )?.value,
                    ),
                    supportDays: Number(
                      document.querySelector<HTMLInputElement>(
                        '#comparison-days',
                      )?.value,
                    ),
                  })
                }
              >
                Carry comparison
              </button>
            </div>
            <p className="lifecycle-output">
              Chosen: {state.assumptions.chosen ?? 'none'} · Demand delta:{' '}
              {state.assumptions.demandDelta ?? 'unknown'} practice meals
            </p>
          </Capability>

          <Capability
            id="B06"
            title="Plan accessible outreach formats"
            marker={marked('B06')}
          >
            <label>
              Practice channel class
              <select
                value={channel}
                onChange={(event) =>
                  setChannel(event.target.value as LifecycleState['channel'])
                }
              >
                {channelChoices.map((choice) => (
                  <option key={choice}>{choice}</option>
                ))}
              </select>
            </label>
            {Object.entries(state.formats).map(([format, status]) => (
              <div className="lifecycle-choice-group" key={format}>
                <strong>
                  {format}: {status}
                </strong>
                {formatChoices
                  .filter((choice) => choice !== status)
                  .map((choice) => (
                    <button
                      type="button"
                      className="secondary"
                      key={choice}
                      onClick={() =>
                        act({
                          type: 'set-format',
                          format: format as keyof LifecycleState['formats'],
                          state: choice,
                          channel,
                        })
                      }
                    >
                      Mark {format} {choice}
                    </button>
                  ))}
              </div>
            ))}
            <p className="lifecycle-output">
              Recorded channel class: {state.channel}; no recipient or delivery
              record.
            </p>
          </Capability>

          <Capability
            id="B07"
            title="Record practice evidence"
            marker={marked('B07')}
          >
            <p>
              Evidence is fixed-choice, aggregate, and separate from any
              operating condition.
            </p>
            <div className="lifecycle-button-list">
              {state.carriedGaps.map((gap, index) => (
                <div className="lifecycle-choice-group" key={gap.gapId}>
                  <strong>
                    {gap.gapId} ·{' '}
                    {practicePartners[index % practicePartners.length]}
                  </strong>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      act({
                        type: 'record-evidence',
                        gapId: gap.gapId,
                        state: 'practice-reported criteria present',
                        partner:
                          practicePartners[index % practicePartners.length],
                      })
                    }
                  >
                    Record criteria present for {gap.gapId}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      act({
                        type: 'record-evidence',
                        gapId: gap.gapId,
                        state: 'unknown',
                        partner:
                          practicePartners[index % practicePartners.length],
                      })
                    }
                  >
                    Record unknown for {gap.gapId}
                  </button>
                </div>
              ))}
            </div>
            <ul className="lifecycle-output-list">
              {state.evidence.map((item) => (
                <li key={item.id}>
                  {item.id} · {item.gapId} · {item.state}
                </li>
              ))}
            </ul>
            <SourceAcceptance
              key={state.cycle}
              state={state}
              live={liveEvidence}
              act={act}
            />
          </Capability>

          <Capability
            id="B08"
            title="Declare simulation scope"
            marker={marked('B08')}
          >
            {serviceAreas.map((area) => (
              <div className="lifecycle-row" key={area}>
                <span>
                  {area}: {state.simulationScope[area]}
                </span>
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    act({
                      type: 'set-scope',
                      area,
                      state:
                        state.simulationScope[area] === 'simulated'
                          ? 'unavailable'
                          : 'simulated',
                    })
                  }
                >
                  Mark {area}{' '}
                  {state.simulationScope[area] === 'simulated'
                    ? 'unavailable'
                    : 'simulated'}
                </button>
              </div>
            ))}
            <p className="lifecycle-output">
              Protective-action controls are not part of this workspace.
            </p>
          </Capability>

          <Capability
            id="B09"
            title="Schedule deterministic injects"
            marker={marked('B09')}
          >
            <div className="lifecycle-button-list">
              {serviceAreas
                .filter((area) => state.simulationScope[area] === 'simulated')
                .map((area, index) => (
                  <button
                    type="button"
                    className="secondary"
                    key={area}
                    onClick={() =>
                      act({
                        type: 'schedule-inject',
                        stage: (['MAP', 'MODEL', 'MATCH'] as const)[index % 3],
                        minute: 15 * (index + 1),
                        area,
                      })
                    }
                  >
                    Schedule {area} inject
                  </button>
                ))}
            </div>
            <ol className="lifecycle-output-list">
              {state.injects.map((inject) => (
                <li key={inject.id}>
                  {inject.id} · {inject.stage} · T+{inject.minute} ·{' '}
                  {inject.area}
                  {state.simulationScope[inject.area] !== 'simulated' &&
                    ' · area unavailable; re-simulate before H1'}
                </li>
              ))}
            </ol>
          </Capability>

          <Capability
            id="B10"
            title="Seal the Before handoff"
            marker={marked('B10')}
          >
            <ul className="lifecycle-gates">
              {Object.entries(h1).map(([name, passed]) => (
                <li key={name} data-pass={passed}>
                  {name}: {passed ? 'ready' : 'needed'}
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={!h1Ready(state) || Boolean(state.h1)}
              onClick={() => act({ type: 'seal-h1' })}
            >
              Seal immutable H1
            </button>
            <p className="lifecycle-output">
              Sealing records a practice handoff, not an authorization.
            </p>
          </Capability>
        </div>
      </section>

      <section id="during" aria-labelledby="during-heading">
        <div className="lifecycle-section-heading">
          <div>
            <p className="operations-stamp">PHASE 2 · DURING</p>
            <h2 id="during-heading">Coordinate without overpromising</h2>
          </div>
          {state.h2 && <span>H2 sealed · {state.h2.digest}</span>}
        </div>
        <div className="lifecycle-grid">
          <Capability
            id="D01"
            title="Materialize the H1 support queue"
            marker={marked('D01')}
          >
            <button
              type="button"
              disabled={!state.h1 || state.phase !== 'before'}
              onClick={() => act({ type: 'start-during' })}
            >
              Start response practice
            </button>
            <p className="lifecycle-output">
              H1 carried gaps: {state.h1?.carriedGapIds.length ?? 0} · Queue:{' '}
              {state.supportItems.length}
            </p>
          </Capability>

          <Capability
            id="D02"
            title="Advance deterministic practice time"
            marker={marked('D02')}
          >
            <div className="operations-actions">
              {[15, 30, 60].map((minutes) => (
                <button
                  type="button"
                  className="secondary"
                  key={minutes}
                  disabled={state.phase !== 'during'}
                  onClick={() =>
                    act({
                      type: 'advance-clock',
                      minutes: minutes as 15 | 30 | 60,
                    })
                  }
                >
                  Advance {minutes}m
                </button>
              ))}
            </div>
            <p className="lifecycle-output" aria-live="polite">
              T+{state.practiceMinute} · {injects.length} injects revealed ·{' '}
              {
                state.supportItems.filter(
                  (item) => item.dueMinute < state.practiceMinute,
                ).length
              }{' '}
              overdue
            </p>
          </Capability>

          <Capability
            id="D03"
            title="Record service-area conditions"
            marker={marked('D03')}
          >
            <ReportedShelterContext live={liveEvidence} />
            <h4>Manual practice service-area condition</h4>
            <div className="lifecycle-button-list">
              {serviceAreas
                .filter((area) => state.simulationScope[area] === 'simulated')
                .map((area) => (
                  <div className="lifecycle-choice-group" key={area}>
                    <strong>{area}</strong>
                    {(
                      ['condition reported', 'unknown', 'unavailable'] as const
                    ).map((serviceState) => (
                      <button
                        type="button"
                        className="secondary"
                        key={serviceState}
                        onClick={() =>
                          act({
                            type: 'record-service-area',
                            area,
                            state: serviceState,
                            recheckMinutes: 30,
                          })
                        }
                      >
                        Record {area} as {serviceState}
                      </button>
                    ))}
                  </div>
                ))}
            </div>
            <ul className="lifecycle-output-list">
              {state.serviceRecords.map((record) => (
                <li key={record.area}>
                  {record.area} · {record.state} · recheck interval{' '}
                  {record.recheckMinutes}m
                  {serviceRecordStale(record, state.practiceMinute) &&
                    ' · stale'}
                </li>
              ))}
            </ul>
          </Capability>

          <Capability
            id="D04"
            title="Ask practice partners for support"
            marker={marked('D04')}
          >
            {state.supportItems.map((item, index) => (
              <div className="lifecycle-choice-group" key={item.id}>
                <strong>
                  {item.id} · {item.response} ·{' '}
                  {practicePartners[index % practicePartners.length]}
                </strong>
                {(['hold', 'decline', 'unknown'] as const).map((response) => (
                  <button
                    type="button"
                    className="secondary"
                    key={response}
                    onClick={() =>
                      act({
                        type: 'ask-partner',
                        supportItemId: item.id,
                        partner:
                          practicePartners[index % practicePartners.length],
                        response,
                      })
                    }
                  >
                    Record {response} from{' '}
                    {practicePartners[index % practicePartners.length]} for{' '}
                    {item.id}
                  </button>
                ))}
              </div>
            ))}
            <p className="lifecycle-output">
              A hold is only a practice response category.
            </p>
          </Capability>

          <Capability
            id="D05"
            title="Escalate a blocked or overdue item"
            marker={marked('D05')}
          >
            {state.supportItems.map((item) => {
              const reason =
                item.response === 'decline'
                  ? ('all responses declined' as const)
                  : item.dueMinute < state.practiceMinute
                    ? ('overdue' as const)
                    : null
              return (
                <div className="lifecycle-row" key={item.id}>
                  <span>
                    {item.id} · owner {item.owner} ·{' '}
                    {reason ?? 'not blocked or overdue'}
                  </span>
                  <button
                    type="button"
                    className="secondary"
                    disabled={!reason}
                    onClick={() => {
                      if (reason)
                        act({
                          type: 'escalate-item',
                          supportItemId: item.id,
                          reason,
                          owner: 'Mass-care lead',
                          deadlineMinutes: 30,
                        })
                    }}
                  >
                    Escalate with bounded deadline
                  </button>
                </div>
              )
            })}
          </Capability>

          <Capability
            id="D06"
            title="Add assumption revision r2"
            marker={marked('D06')}
          >
            <button
              type="button"
              disabled={injects.length === 0}
              onClick={() =>
                act({
                  type: 'add-r2',
                  uptakePercent: 25,
                  supportDays: 5,
                })
              }
            >
              Add r2 after revealed inject
            </button>
            <p className="lifecycle-output">
              r1: {state.assumptions.r1.uptakePercent}% /{' '}
              {state.assumptions.r1.supportDays} days · sealed:{' '}
              {state.assumptions.chosen
                ? `${state.assumptions.chosen} ${sealedRevision.uptakePercent}% / ${sealedRevision.supportDays} days`
                : 'not chosen'}{' '}
              · r2:{' '}
              {state.assumptions.r2
                ? `${state.assumptions.r2.uptakePercent}% / ${state.assumptions.r2.supportDays} days · delta ${state.assumptions.r2.demandDeltaFromSealed} practice meals from sealed ${sealedChoice}`
                : 'not added'}
            </p>
          </Capability>

          <Capability
            id="D07"
            title="Create versioned guidance drafts"
            marker={marked('D07')}
          >
            <button
              type="button"
              disabled={state.phase !== 'during'}
              onClick={() => act({ type: 'create-guidance' })}
            >
              Create next guidance version
            </button>
            <ol className="lifecycle-output-list">
              {state.guidanceVersions.map((version) => (
                <li key={version.version}>
                  v{version.version} · {version.status} ·{' '}
                  {version.superseded ? 'superseded' : 'current'}
                </li>
              ))}
            </ol>
          </Capability>

          <Capability
            id="D08"
            title="Freeze a role-to-role shift handoff"
            marker={marked('D08')}
          >
            <label>
              Incoming practice role
              <select
                value={incomingRole}
                onChange={(event) =>
                  setIncomingRole(event.target.value as PracticeRole)
                }
              >
                {practiceRoles
                  .filter((role) => role !== 'Facilitator')
                  .map((role) => (
                    <option key={role}>{role}</option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() =>
                act({
                  type: 'freeze-shift',
                  outgoing: 'Facilitator',
                  incoming: incomingRole,
                })
              }
            >
              Freeze shift counts
            </button>
            {state.shiftSnapshot && (
              <p className="lifecycle-output">
                T+{state.shiftSnapshot.practiceMinute} · blocked{' '}
                {state.shiftSnapshot.blocked} · overdue{' '}
                {state.shiftSnapshot.overdue} · stale evidence{' '}
                {state.shiftSnapshot.staleEvidence}
              </p>
            )}
          </Capability>

          <Capability
            id="D09"
            title="Replace stale practice evidence"
            marker={marked('D09')}
          >
            <div className="lifecycle-button-list">
              {staleEvidence.map((item) => (
                <button
                  type="button"
                  className="secondary"
                  key={item.id}
                  onClick={() =>
                    act({
                      type: 'replace-evidence',
                      evidenceId: item.id,
                      state: 'practice-reported criteria present',
                    })
                  }
                >
                  Replace {item.id}
                </button>
              ))}
            </div>
            <p className="lifecycle-output">
              {staleEvidence.length
                ? `${staleEvidence.length} stale claims need replacement`
                : 'No stale current claim'}
            </p>
          </Capability>

          <Capability
            id="D10"
            title="Disposition every support item and seal H2"
            marker={marked('D10')}
          >
            {state.supportItems.map((item) => (
              <div className="lifecycle-choice-group" key={item.id}>
                <strong>
                  {item.id} · {item.disposition}
                </strong>
                {(['carried', 'set aside'] as const).map((disposition) => (
                  <button
                    type="button"
                    className="secondary"
                    key={disposition}
                    onClick={() =>
                      act({
                        type: 'set-support-disposition',
                        supportItemId: item.id,
                        disposition,
                      })
                    }
                  >
                    Mark {item.id} {disposition}
                  </button>
                ))}
              </div>
            ))}
            <button
              type="button"
              disabled={
                state.supportItems.length === 0 ||
                state.supportItems.some(
                  (item) => item.disposition === 'undecided',
                ) ||
                Boolean(state.h2)
              }
              onClick={() => act({ type: 'seal-h2' })}
            >
              Seal immutable H2
            </button>
          </Capability>
        </div>
      </section>

      <section id="after" aria-labelledby="after-heading">
        <div className="lifecycle-section-heading">
          <div>
            <p className="operations-stamp">PHASE 3 · AFTER</p>
            <h2 id="after-heading">
              Close the loop and carry learning forward
            </h2>
          </div>
          {state.previousCycle && (
            <span>H3 sealed · {state.previousCycle.digest}</span>
          )}
        </div>
        <div className="lifecycle-grid">
          <Capability
            id="A01"
            title="Build the recovery register"
            marker={marked('A01')}
          >
            {state.recoveryRows.map((row) => (
              <div key={row.supportItemId}>
                <div className="lifecycle-row">
                  <span>
                    {row.supportItemId} · {row.gapId} · {row.horizon} ·{' '}
                    {row.state}
                  </span>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      act({
                        type: 'configure-recovery-row',
                        supportItemId: row.supportItemId,
                        horizon: 'next day',
                        state: 'follow-up-ready',
                      })
                    }
                  >
                    Set follow-up ready
                  </button>
                </div>
                {row.state === 'follow-up-ready' &&
                  !state.followThroughItems.some(
                    (item) =>
                      item.supportItemId === row.supportItemId ||
                      ((item.status === 'planned' ||
                        item.status === 'in-progress') &&
                        item.gapId === row.gapId),
                  ) && <FollowThroughCreator row={row} act={act} />}
              </div>
            ))}
            <p className="lifecycle-output">
              These are local PRACTICE observations only. They do not record
              external execution, acceptance, or adoption.
            </p>
            <div className="lifecycle-button-list">
              {state.followThroughItems.map((item) => {
                const latest = item.observations.at(-1)
                const inProgress = item.status === 'in-progress'
                const hasCurrentAttemptObservation =
                  item.observations.length > item.attemptObservationStart
                const nextAction =
                  item.status === 'planned'
                    ? 'Start practice check'
                    : item.status === 'in-progress'
                      ? hasCurrentAttemptObservation
                        ? latest?.result === 'observed'
                          ? 'Finish or record another observation'
                          : 'Mark unable or record another observation'
                        : 'Record an observation'
                      : item.status === 'done'
                        ? 'No carry-forward required'
                        : 'Terminal: no verified practice result'
                return (
                  <div className="lifecycle-choice-group" key={item.id}>
                    <div className="lifecycle-row">
                      <strong>
                        {item.gapId} · {item.status}
                      </strong>
                      <span>
                        {item.owner} · {item.dueHorizon}
                      </span>
                    </div>
                    <span>Next: {nextAction}</span>
                    <details>
                      <summary>Exact practice record and actions</summary>
                      <p>
                        {item.id} · origin cycle {item.originCycle} ·{' '}
                        {item.doneCheck} · PRACTICE only
                      </p>
                      <p>
                        Latest observation:{' '}
                        {latest
                          ? `${latest.result} · cycle ${latest.cycle} · T${latest.practiceMinute >= 0 ? '+' : ''}${latest.practiceMinute}`
                          : 'none'}
                      </p>
                      <ul className="lifecycle-output-list">
                        {item.observations.map((observation, index) => (
                          <li
                            key={`${observation.cycle}-${observation.practiceMinute}-${index}`}
                          >
                            Cycle {observation.cycle} · T
                            {observation.practiceMinute >= 0 ? '+' : ''}
                            {observation.practiceMinute} · {observation.result}
                          </li>
                        ))}
                      </ul>
                      <div className="lifecycle-row">
                        <button
                          type="button"
                          disabled={
                            item.status !== 'planned' ||
                            item.observations.length >=
                              maxFollowThroughObservations
                          }
                          onClick={() =>
                            act({ type: 'start-follow-through', id: item.id })
                          }
                        >
                          Start follow-through
                        </button>
                        {(['observed', 'not-observed', 'unknown'] as const).map(
                          (result) => (
                            <button
                              type="button"
                              className="secondary"
                              disabled={!inProgress}
                              key={result}
                              onClick={() =>
                                act({
                                  type: 'record-follow-through-observation',
                                  id: item.id,
                                  result,
                                })
                              }
                            >
                              Record {result}
                            </button>
                          ),
                        )}
                        <button
                          type="button"
                          disabled={
                            !inProgress ||
                            !hasCurrentAttemptObservation ||
                            latest?.result !== 'observed'
                          }
                          onClick={() =>
                            act({ type: 'finish-follow-through', id: item.id })
                          }
                        >
                          Finish
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={
                            !inProgress ||
                            !hasCurrentAttemptObservation ||
                            (latest?.result !== 'not-observed' &&
                              latest?.result !== 'unknown')
                          }
                          onClick={() =>
                            act({
                              type: 'mark-follow-through-unable',
                              id: item.id,
                            })
                          }
                        >
                          Mark unable
                        </button>
                      </div>
                    </details>
                  </div>
                )
              })}
            </div>
            <details>
              <summary>
                Archived follow-through · {state.followThroughHistory.length}{' '}
                cycles
              </summary>
              {state.followThroughHistory.map((archive) => (
                <div className="lifecycle-choice-group" key={archive.cycle}>
                  <strong>
                    Cycle {archive.cycle} · {archive.items.length} records
                  </strong>
                  <span>{archive.digest}</span>
                </div>
              ))}
            </details>
            <p className="lifecycle-output">
              Recovery review revision:{' '}
              {state.assumptions.r2
                ? `r2 ${state.assumptions.r2.uptakePercent}% / ${state.assumptions.r2.supportDays} days · delta ${state.assumptions.r2.demandDeltaFromSealed} practice meals from sealed ${sealedChoice}`
                : state.assumptions.chosen
                  ? `sealed ${state.assumptions.chosen}; r2 not added`
                  : 'not chosen'}
            </p>
          </Capability>

          <Capability
            id="A02"
            title="Record aggregate unmet-need bands"
            marker={marked('A02')}
          >
            <div className="lifecycle-button-list">
              {cmistDomains.map((domain) => (
                <div className="lifecycle-choice-group" key={domain}>
                  <strong>{domain}</strong>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      act({
                        type: 'set-unmet-need',
                        domain,
                        band: 'Unknown — not zero',
                        basis: 'unknown basis',
                        owner: 'Recovery lead',
                      })
                    }
                  >
                    Record {domain} as Unknown — not zero
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      act({
                        type: 'set-unmet-need',
                        domain,
                        band: '1–9 aggregate',
                        basis: 'practice observation',
                        owner: null,
                      })
                    }
                  >
                    Record {domain} as 1–9 aggregate
                  </button>
                </div>
              ))}
            </div>
            <ul className="lifecycle-output-list">
              {state.unmetNeeds.map((item) => (
                <li key={item.domain}>
                  {item.domain} · {item.band} ·{' '}
                  {item.owner ?? 'no owner needed'}
                </li>
              ))}
            </ul>
          </Capability>

          <Capability
            id="A03"
            title="Review linked practice holds"
            marker={marked('A03')}
          >
            <button type="button" onClick={() => act({ type: 'review-holds' })}>
              Attempt hold review
            </button>
            <p className="lifecycle-output">
              {state.holdReview.attempted
                ? state.holdReview.refusedItemIds.length
                  ? `Refused while ${state.holdReview.refusedItemIds.join(', ')} lacks linked follow-up readiness.`
                  : 'Linked recovery work is follow-up-ready.'
                : 'Not reviewed'}
            </p>
          </Capability>

          <Capability
            id="A04"
            title="Plan service-area rechecks"
            marker={marked('A04')}
          >
            <div className="lifecycle-button-list">
              {state.serviceRecords
                .filter((record) =>
                  serviceRecordNeedsRecheck(record, state.practiceMinute),
                )
                .map((record) => (
                  <button
                    type="button"
                    className="secondary"
                    key={record.area}
                    onClick={() =>
                      act({
                        type: 'plan-recheck',
                        area: record.area,
                        owner: 'Recovery lead',
                        horizon: 'next shift',
                      })
                    }
                  >
                    Plan {record.area} recheck
                  </button>
                ))}
            </div>
            <p className="lifecycle-output">
              Recheck plans: {state.recheckPlans.length}; last recorded service
              states remain unchanged.
            </p>
            <SourceRechecks state={state} live={liveEvidence} act={act} />
          </Capability>

          <Capability
            id="A05"
            title="Classify guidance into recovery draft r1"
            marker={marked('A05')}
          >
            {guidanceBlocks.map((block) => (
              <div className="lifecycle-choice-group" key={block}>
                <strong>
                  {block}:{' '}
                  {state.recoveryDraft?.classifications[block] ??
                    'unclassified'}
                </strong>
                {(
                  [
                    'carried into recovery draft r1',
                    'unknown',
                    'withdrawn',
                  ] as const
                ).map((classification) => (
                  <button
                    type="button"
                    className="secondary"
                    key={classification}
                    onClick={() =>
                      act({
                        type: 'classify-guidance',
                        block,
                        classification,
                      })
                    }
                  >
                    Classify {block} as {classification}
                  </button>
                ))}
              </div>
            ))}
            <p className="lifecycle-output">{practiceStamp}</p>
          </Capability>

          <Capability
            id="A06"
            title="Score and disposition objectives"
            marker={marked('A06')}
          >
            {state.objectives.map((objectiveId) => {
              const review = state.objectiveReview.find(
                (item) => item.objectiveId === objectiveId,
              )
              return (
                <div className="lifecycle-choice-group" key={objectiveId}>
                  <strong>
                    {objectiveId} · {review?.score ?? 'not scored'} ·{' '}
                    {review?.disposition ?? 'undecided'}
                  </strong>
                  {(['carry-forward', 'note-only'] as const).map(
                    (disposition) => (
                      <button
                        type="button"
                        className="secondary"
                        key={disposition}
                        onClick={() =>
                          act({
                            type: 'review-objective',
                            objectiveId,
                            disposition,
                          })
                        }
                      >
                        Score {objectiveId} and mark {disposition}
                      </button>
                    ),
                  )}
                </div>
              )
            })}
          </Capability>

          <Capability
            id="A07"
            title="Evaluate six end-of-cycle gates"
            marker={marked('A07')}
          >
            <ul className="lifecycle-gates">
              {Object.entries(gates).map(([name, passed]) => (
                <li key={name} data-pass={passed}>
                  {name}: {passed ? 'ready' : 'needed'}
                </li>
              ))}
            </ul>
            <div className="operations-actions">
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  act({
                    type: 'decide-gates',
                    decision: 'gates-unmet-carry-forward',
                  })
                }
              >
                Carry unmet gates
              </button>
              <button
                type="button"
                disabled={!lifecycleGatesMet(state)}
                onClick={() =>
                  act({ type: 'decide-gates', decision: 'gates-met' })
                }
              >
                Record gates met
              </button>
            </div>
          </Capability>

          <Capability
            id="A08"
            title="Export or pin a strict comparison"
            marker={marked('A08')}
          >
            <div className="operations-actions">
              <button
                type="button"
                onClick={() =>
                  download(
                    `practice-lifecycle-${lifecycleDigest(state)}.json`,
                    canonicalExport,
                    'application/json',
                  )
                }
              >
                Download strict record
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setComparisonText(canonicalExport)}
              >
                Copy current record into comparison field
              </button>
            </div>
            <label>
              Comparison-only JSON
              <textarea
                rows={5}
                value={comparisonText}
                onChange={(event) => setComparisonText(event.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() =>
                act({ type: 'pin-comparison', text: comparisonText })
              }
            >
              Pin read-only comparison
            </button>
            <p className="lifecycle-output">
              {state.comparison
                ? `Pinned ${state.comparison.digest}; content not merged.`
                : 'No comparison pinned'}
            </p>
          </Capability>

          <Capability
            id="A09"
            title="Generate a deterministic closeout packet"
            marker={marked('A09')}
          >
            <fieldset>
              <legend>Packet sections</legend>
              {packetSectionChoices.map((section) => (
                <Choice
                  key={section}
                  label={section}
                  value={section}
                  checked={packetSections.includes(section)}
                  onChange={() =>
                    setPacketSections((current) =>
                      current.includes(section)
                        ? current.filter((item) => item !== section)
                        : [...current, section],
                    )
                  }
                />
              ))}
            </fieldset>
            <button
              type="button"
              onClick={() =>
                act({
                  type: 'select-packet-sections',
                  sections: packetSections,
                })
              }
            >
              Save packet section selection
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!packetSelectionSaved}
              onClick={() => {
                try {
                  const packet = generateCloseoutPacket(state)
                  download(packet.filename, packet.text)
                  setMessage(
                    'Closeout packet downloaded locally and not added to offline field-packet storage.',
                  )
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : 'Packet generation failed.',
                  )
                }
              }}
            >
              Download {practiceStamp} packet
            </button>
            {!packetSelectionSaved && (
              <p className="lifecycle-output">
                Save the section selection to download it.
              </p>
            )}
          </Capability>

          <Capability
            id="A10"
            title="Seal H3 and start cycle 2"
            marker={marked('A10')}
          >
            <button
              type="button"
              disabled={!state.gateDecision}
              onClick={() => act({ type: 'start-next-cycle' })}
            >
              Seal carry-forward and start next cycle
            </button>
            <p className="lifecycle-output">
              {state.previousCycle
                ? `Cycle ${state.previousCycle.cycle} is read-only. Carried gaps: ${state.previousCycle.carriedGapIds.join(', ') || 'none'}; objectives: ${state.previousCycle.carriedObjectiveIds.join(', ') || 'none'}.`
                : 'A gate decision is required before H3.'}
            </p>
          </Capability>
        </div>
      </section>

      <section id="ledger" aria-labelledby="ledger-heading">
        <div className="lifecycle-section-heading">
          <div>
            <p className="operations-stamp">DETERMINISTIC LOCAL RECORD</p>
            <h2 id="ledger-heading">Capability ledger</h2>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              const initial = createInitialLifecycleState()
              window.localStorage.removeItem(lifecycleStorageKey)
              window.localStorage.removeItem(legacyLifecycleStorageKey)
              window.localStorage.removeItem(v2LifecycleStorageKey)
              window.localStorage.removeItem(v3LifecycleStorageKey)
              window.localStorage.removeItem(v4LifecycleStorageKey)
              setRestoreFailed(false)
              stateRef.current = initial
              setState(initial)
              setSelectedObjectives(defaultObjectives)
              setPacketSections(initial.packetSections)
              setChannel(initial.channel)
              setComparisonText('')
              setMessage('Local practice lifecycle reset.')
            }}
          >
            Reset lifecycle
          </button>
        </div>
        <p>
          Canonical export excludes this ledger and comparison metadata. The
          displayed digest is derived from canonical cycle content only.
        </p>
        <ol className="lifecycle-ledger">
          {state.ledger
            .slice()
            .reverse()
            .map((event) => (
              <li key={`${event.sequence}-${event.capability}`}>
                <span>{event.sequence}</span>
                <strong>{event.capability}</strong>
                <span>
                  T{event.practiceMinute >= 0 ? '+' : ''}
                  {event.practiceMinute}
                </span>
                <p>{event.summary}</p>
              </li>
            ))}
        </ol>
        <details>
          <summary>Inspect canonical record shape</summary>
          <pre className="lifecycle-json">
            {JSON.stringify(canonicalLifecycleRecord(state), null, 2)}
          </pre>
        </details>
      </section>
    </OperationsLayout>
  )
}
