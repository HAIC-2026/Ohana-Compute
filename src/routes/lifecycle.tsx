import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactElement, ReactNode } from 'react'

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
import { nwsEligibility, nwsProductValidity } from '../lib/nws-product'
import { currentNWSApplicability } from '../lib/weather-evidence'
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

type CapabilitySnapshot = {
  fact: string
  owner?: string
  exceptions?: string[]
}

type PrimaryActionContext = {
  comparisonText: string
  packetSelectionSaved: boolean
}

function capabilityPhase(id: CapabilityId) {
  return id.startsWith('B') ? 'before' : id.startsWith('D') ? 'during' : 'after'
}

function exceptionSeverity(exception: string) {
  const value = exception.toLowerCase()
  const priorities = [
    [
      'decline',
      'unable',
      'blocked',
      'overdue',
      'exhausted',
      'rechecks need attention',
    ],
    [
      'unavailable',
      'cancelled',
      'expired',
      'ambiguous',
      'ineligible',
      'cancellation',
      'non_actual',
      'non_public',
      'not_yet_effective',
      'public evidence',
    ],
    ['stale', 'not-returned', 'unknown'],
    ['pending', 'needed', 'not asked'],
  ]
  const index = priorities.findIndex((terms) =>
    terms.some((term) => value.includes(term)),
  )
  return index === -1 ? priorities.length : index
}

function compareExceptions(left: string, right: string) {
  return (
    exceptionSeverity(left) - exceptionSeverity(right) ||
    left.localeCompare(right)
  )
}

function primaryKey(capability: CapabilityId, target: string, action: string) {
  return `${capability}:${target}:${action}`
}

function capabilitySnapshot(
  id: CapabilityId,
  state: LifecycleState,
): CapabilitySnapshot {
  const unavailableAreas = serviceAreas.filter(
    (area) => state.simulationScope[area] === 'unavailable',
  )
  const staleServices = state.serviceRecords.filter((record) =>
    serviceRecordStale(record, state.practiceMinute),
  )
  const openFollowThrough = state.followThroughItems.filter(
    (item) => item.status === 'planned' || item.status === 'in-progress',
  )
  const unableFollowThrough = state.followThroughItems.filter(
    (item) => item.status === 'unable',
  )
  const unknownNeeds = state.unmetNeeds.filter((item) =>
    item.band.startsWith('Unknown'),
  )
  const gateEntries = Object.entries(lifecycleGates(state))
  const blockedItems = state.supportItems.filter(
    (item) =>
      item.response === 'decline' || item.dueMinute < state.practiceMinute,
  )

  switch (id) {
    case 'B01':
      return {
        fact: state.event
          ? `${state.event.label} locked for cycle ${state.cycle}`
          : 'Event not locked',
      }
    case 'B02':
      return {
        fact: `${state.carriedGaps.length} gaps queued`,
        owner: state.carriedGaps[0]?.owner,
      }
    case 'B03':
      return {
        fact: state.objectives.length
          ? `${state.objectives.length} measurable objectives frozen`
          : 'Objectives not frozen',
      }
    case 'B04':
      return {
        fact:
          state.timing.marginMinutes === null
            ? 'Margin not computed'
            : `${state.timing.marginMinutes} practice minutes of margin`,
        exceptions:
          state.timing.marginMinutes !== null && state.timing.marginMinutes <= 0
            ? ['window exhausted']
            : undefined,
      }
    case 'B05':
      return {
        fact: state.assumptions.chosen
          ? `${state.assumptions.chosen} assumption sealed`
          : 'Assumption not chosen',
      }
    case 'B06': {
      const exceptions = Object.entries(state.formats)
        .filter(([, value]) => value !== 'planned')
        .map(([format, value]) => `${format}: ${value}`)
      return {
        fact: `${state.channel} · ${3 - exceptions.length}/3 formats planned`,
        exceptions,
      }
    }
    case 'B07':
      return {
        fact: `${state.evidence.length} practice records · ${state.sourceEvidence.length} source claims`,
        exceptions: state.evidence
          .filter((item) => item.state !== 'practice-reported criteria present')
          .map((item) => `${item.gapId}: ${item.state}`),
      }
    case 'B08':
      return {
        fact: `${serviceAreas.length - unavailableAreas.length}/${serviceAreas.length} service areas simulated`,
        exceptions: unavailableAreas.map((area) => `${area}: unavailable`),
      }
    case 'B09':
      return { fact: `${state.injects.length} injects scheduled` }
    case 'B10': {
      const missing = Object.entries(h1Gates(state))
        .filter(([, passed]) => !passed)
        .map(([name]) => `${name}: needed`)
      return {
        fact: state.h1 ? `H1 sealed · ${state.h1.digest}` : 'H1 not sealed',
        exceptions: missing,
      }
    }
    case 'D01':
      return {
        fact: state.h1
          ? `${state.supportItems.length} H1 support items materialized`
          : 'H1 required',
      }
    case 'D02': {
      const overdue = state.supportItems.filter(
        (item) => item.dueMinute < state.practiceMinute,
      ).length
      return {
        fact: `T+${state.practiceMinute} · ${revealedInjects(state).length} injects revealed`,
        exceptions: overdue ? [`${overdue} overdue`] : undefined,
      }
    }
    case 'D03':
      return {
        fact: `${state.serviceRecords.length} conditions recorded`,
        exceptions: [
          ...state.serviceRecords
            .filter((record) => record.state !== 'condition reported')
            .map((record) => `${record.area}: ${record.state}`),
          ...staleServices.map((record) => `${record.area}: stale`),
        ],
      }
    case 'D04':
      return {
        fact: `${state.supportItems.filter((item) => item.response !== 'not asked').length}/${state.supportItems.length} responses`,
        exceptions: state.supportItems
          .filter((item) => item.response !== 'hold')
          .map((item) => `${item.id}: ${item.response}`),
      }
    case 'D05':
      return {
        fact: `${blockedItems.length} blocked or overdue items`,
        owner: blockedItems[0]?.owner,
        exceptions: blockedItems.map((item) =>
          item.response === 'decline'
            ? `${item.id}: blocked (declined)`
            : `${item.id}: overdue`,
        ),
      }
    case 'D06':
      return {
        fact: state.assumptions.r2
          ? `r2 added · delta ${state.assumptions.r2.demandDeltaFromSealed} practice meals`
          : 'r2 not added',
      }
    case 'D07':
      return {
        fact: `${state.guidanceVersions.length} UNSENT drafts`,
      }
    case 'D08':
      return {
        fact: state.shiftSnapshot
          ? `Shift frozen at T+${state.shiftSnapshot.practiceMinute}`
          : 'Shift not frozen',
        owner: state.shiftSnapshot?.incoming,
        exceptions: state.shiftSnapshot
          ? [
              ...(state.shiftSnapshot.blocked
                ? [`${state.shiftSnapshot.blocked} blocked`]
                : []),
              ...(state.shiftSnapshot.overdue
                ? [`${state.shiftSnapshot.overdue} overdue`]
                : []),
              ...(state.shiftSnapshot.staleEvidence
                ? [`${state.shiftSnapshot.staleEvidence} stale evidence`]
                : []),
            ]
          : undefined,
      }
    case 'D09': {
      const stale = state.evidence.filter((item) => item.state === 'stale')
      return {
        fact: `${stale.length} stale claims`,
        exceptions: stale.map((item) => `${item.id}: stale`),
      }
    }
    case 'D10': {
      const undecided = state.supportItems.filter(
        (item) => item.disposition === 'undecided',
      )
      return {
        fact: state.h2
          ? `H2 sealed · ${state.h2.digest}`
          : `${undecided.length} dispositions pending`,
        exceptions: undecided.map((item) => `${item.id}: pending`),
      }
    }
    case 'A01':
      return {
        fact: unableFollowThrough.length
          ? `${openFollowThrough.length} open · ${unableFollowThrough.length} unable follow-through`
          : `${openFollowThrough.length} open follow-through`,
        owner: openFollowThrough[0]?.owner ?? unableFollowThrough[0]?.owner,
        exceptions: [...openFollowThrough, ...unableFollowThrough].map(
          (item) => `${item.gapId}: ${item.status}`,
        ),
      }
    case 'A02':
      return {
        fact: `${state.unmetNeeds.length}/${cmistDomains.length} need bands`,
        owner: unknownNeeds[0]?.owner ?? undefined,
        exceptions: unknownNeeds.map((item) => `${item.domain}: unknown`),
      }
    case 'A03':
      return {
        fact: state.holdReview.attempted
          ? `${state.holdReview.refusedItemIds.length} holds refused`
          : 'Hold review pending',
        exceptions: state.holdReview.refusedItemIds.map(
          (item) => `${item}: blocked`,
        ),
      }
    case 'A04': {
      const sourceRecheckExceptions = state.sourceRechecks
        .filter((item) => item.result !== 'unchanged')
        .map((item) => `${item.id}: ${item.result}`)
      const weatherRecheckExceptions = state.weatherRechecks
        .filter((item) => item.result !== 'unchanged')
        .map((item) => `${item.id}: ${item.result}`)
      return {
        fact: `${state.recheckPlans.length}/${state.sourceRechecks.length}/${state.weatherRechecks.length} service/source/weather rechecks`,
        owner:
          state.sourceRechecks.find((item) => item.result !== 'unchanged')
            ?.owner ??
          state.weatherRechecks.find((item) => item.result !== 'unchanged')
            ?.owner ??
          state.recheckPlans[0]?.owner,
        exceptions: [...sourceRecheckExceptions, ...weatherRecheckExceptions],
      }
    }
    case 'A05':
      return {
        fact: state.recoveryDraft
          ? `${Object.keys(state.recoveryDraft.classifications).length}/${guidanceBlocks.length} guidance blocks classified`
          : 'Draft not started',
      }
    case 'A06':
      return {
        fact: `${state.objectiveReview.length}/${state.objectives.length} objectives reviewed`,
        exceptions: state.objectiveReview
          .filter((item) => item.score !== 'met')
          .map((item) => `${item.objectiveId}: ${item.score}`),
      }
    case 'A07': {
      const missing = gateEntries
        .filter(([, passed]) => !passed)
        .map(([name]) => `${name}: needed`)
      return {
        fact: `${gateEntries.length - missing.length}/${gateEntries.length} gates ready`,
        exceptions: missing,
      }
    }
    case 'A08':
      return {
        fact: state.comparison
          ? `Comparison ${state.comparison.digest} pinned`
          : 'Comparison not pinned',
      }
    case 'A09':
      return {
        fact: `${state.packetSections.length} packet sections`,
      }
    case 'A10': {
      const impliedDecision = lifecycleGatesMet(state)
        ? 'gates-met'
        : 'gates-unmet-carry-forward'
      const decisionCurrent = state.gateDecision === impliedDecision
      return {
        fact: state.previousCycle
          ? `Cycle ${state.previousCycle.cycle} sealed read-only`
          : decisionCurrent
            ? 'Gate decision recorded; H3 can be sealed'
            : state.gateDecision
              ? 'Gate decision stale; record the current result'
              : 'H3 needs gate decision',
        exceptions: state.previousCycle
          ? undefined
          : decisionCurrent
            ? undefined
            : [
                state.gateDecision
                  ? `gate decision stale: ${impliedDecision}`
                  : 'gate decision pending',
              ],
      }
    }
  }
}

function primaryActionSelector(
  id: CapabilityId,
  state: LifecycleState,
  context: PrimaryActionContext,
): string | null {
  if (id.startsWith('B') && id !== 'B10' && state.h1) return null
  switch (id) {
    case 'B01':
      return state.event ? null : primaryKey(id, 'event', 'lock')
    case 'B02': {
      const gap = gapCatalog.find(
        (candidate) =>
          !state.carriedGaps.some((item) => item.gapId === candidate.id),
      )
      return gap ? primaryKey(id, gap.id, 'carry') : null
    }
    case 'B03':
      return state.objectives.length
        ? null
        : primaryKey(id, 'objectives', 'freeze')
    case 'B04':
      return state.timing.marginMinutes === null
        ? primaryKey(id, 'margin', 'compute')
        : null
    case 'B05':
      return state.assumptions.chosen
        ? null
        : primaryKey(id, 'comparison', 'carry')
    case 'B06': {
      const format = Object.entries(state.formats).find(
        ([, formatState]) => formatState !== 'planned',
      )?.[0]
      return format ? primaryKey(id, format, 'planned') : null
    }
    case 'B07': {
      const gap = state.carriedGaps.find(
        (candidate) =>
          !state.evidence.some((item) => item.gapId === candidate.gapId),
      )
      return gap ? primaryKey(id, gap.gapId, 'criteria-present') : null
    }
    case 'B08': {
      const area = serviceAreas.find(
        (candidate) => state.simulationScope[candidate] !== 'simulated',
      )
      return area ? primaryKey(id, area, 'simulated') : null
    }
    case 'B09': {
      const area = serviceAreas.find(
        (candidate) =>
          state.simulationScope[candidate] === 'simulated' &&
          !state.injects.some((inject) => inject.area === candidate),
      )
      return area ? primaryKey(id, area, 'schedule-inject') : null
    }
    case 'B10':
      return !state.h1 && h1Ready(state) ? primaryKey(id, 'h1', 'seal') : null
    case 'D01':
      return state.h1 && state.phase === 'before'
        ? primaryKey(id, 'h1', 'start-response')
        : null
    case 'D02':
      return state.phase === 'during'
        ? primaryKey(id, 'clock', 'advance-60')
        : null
    case 'D03': {
      const area = serviceAreas.find(
        (candidate) =>
          state.simulationScope[candidate] === 'simulated' &&
          !state.serviceRecords.some((record) => record.area === candidate),
      )
      return area ? primaryKey(id, area, 'unknown') : null
    }
    case 'D04': {
      const item = state.supportItems.find(
        (candidate) => candidate.response === 'not asked',
      )
      if (!item) return null
      return primaryKey(id, item.id, 'hold')
    }
    case 'D05': {
      const item = state.supportItems.find(
        (candidate) =>
          !candidate.escalation &&
          (candidate.response === 'decline' ||
            candidate.dueMinute < state.practiceMinute),
      )
      return item ? primaryKey(id, item.id, 'escalate') : null
    }
    case 'D06':
      return !state.assumptions.r2 && revealedInjects(state).length
        ? primaryKey(id, 'r2', 'add')
        : null
    case 'D07': {
      const guidanceBasisMinute = revealedInjects(state).at(-1)?.minute ?? 0
      const hasCurrentVersion = state.guidanceVersions.some(
        (version) => version.createdMinute >= guidanceBasisMinute,
      )
      return state.phase === 'during' && !hasCurrentVersion
        ? primaryKey(id, String(guidanceBasisMinute), 'create-guidance')
        : null
    }
    case 'D08':
      return state.shiftSnapshot ? null : primaryKey(id, 'shift', 'freeze')
    case 'D09': {
      const evidence = state.evidence.find((item) => item.state === 'stale')
      return evidence ? primaryKey(id, evidence.id, 'replace') : null
    }
    case 'D10': {
      const item = state.supportItems.find(
        (candidate) => candidate.disposition === 'undecided',
      )
      if (item) return primaryKey(id, item.id, 'carried')
      return state.supportItems.length && !state.h2
        ? primaryKey(id, 'h2', 'seal')
        : null
    }
    case 'A01': {
      const active = state.followThroughItems.find(
        (item) => item.status === 'planned' || item.status === 'in-progress',
      )
      if (active?.status === 'planned')
        return primaryKey(id, active.id, 'start')
      if (active?.status === 'in-progress') {
        const latest = active.observations.at(-1)
        const hasObservation =
          active.observations.length > active.attemptObservationStart
        if (!hasObservation) return primaryKey(id, active.id, 'observe')
        return latest?.result === 'observed'
          ? primaryKey(id, active.id, 'finish')
          : primaryKey(id, active.id, 'unable')
      }
      const row = state.recoveryRows.find(
        (candidate) => candidate.state !== 'follow-up-ready',
      )
      if (row) return primaryKey(id, row.supportItemId, 'ready')
      const readyWithoutFollowThrough = state.recoveryRows.find(
        (candidate) =>
          candidate.state === 'follow-up-ready' &&
          !state.followThroughItems.some(
            (item) =>
              item.supportItemId === candidate.supportItemId ||
              ((item.status === 'planned' || item.status === 'in-progress') &&
                item.gapId === candidate.gapId),
          ),
      )
      return readyWithoutFollowThrough
        ? primaryKey(
            id,
            readyWithoutFollowThrough.supportItemId,
            'create-follow-through',
          )
        : null
    }
    case 'A02': {
      const domain = cmistDomains.find(
        (candidate) =>
          !state.unmetNeeds.some((item) => item.domain === candidate),
      )
      return domain ? primaryKey(id, domain, 'unknown') : null
    }
    case 'A03':
      return state.holdReview.attempted
        ? null
        : primaryKey(id, 'holds', 'review')
    case 'A04': {
      const record = state.serviceRecords.find(
        (candidate) =>
          serviceRecordNeedsRecheck(candidate, state.practiceMinute) &&
          !state.recheckPlans.some((plan) => plan.area === candidate.area),
      )
      return record ? primaryKey(id, record.area, 'plan-recheck') : null
    }
    case 'A05': {
      const block = guidanceBlocks.find(
        (candidate) => !state.recoveryDraft?.classifications[candidate],
      )
      return block ? primaryKey(id, block, 'carry-recovery') : null
    }
    case 'A06': {
      const objective = state.objectives.find(
        (candidate) =>
          !state.objectiveReview.some(
            (review) => review.objectiveId === candidate,
          ),
      )
      return objective ? primaryKey(id, objective, 'carry-forward') : null
    }
    case 'A07': {
      const canonicalDecision = lifecycleGatesMet(state)
        ? 'gates-met'
        : 'gates-unmet-carry-forward'
      if (state.gateDecision === canonicalDecision) return null
      return canonicalDecision === 'gates-met'
        ? primaryKey(id, 'gates', 'met')
        : primaryKey(id, 'gates', 'carry-unmet')
    }
    case 'A08':
      if (state.comparison) return null
      return context.comparisonText.trim()
        ? primaryKey(id, 'comparison', 'pin')
        : primaryKey(id, 'comparison', 'copy')
    case 'A09':
      return context.packetSelectionSaved
        ? primaryKey(id, 'packet', 'download')
        : primaryKey(id, 'packet', 'save-selection')
    case 'A10': {
      const impliedDecision = lifecycleGatesMet(state)
        ? 'gates-met'
        : 'gates-unmet-carry-forward'
      return state.gateDecision === impliedDecision && !state.previousCycle
        ? primaryKey(id, 'cycle', 'seal')
        : null
    }
  }
}

function splitPrimaryAction(children: ReactNode, selector: string | null) {
  const result: { primary: ReactElement | null } = { primary: null }

  const visit = (node: ReactNode): ReactNode => {
    if (!isValidElement(node)) return node
    const element = node as ReactElement<{
      children?: ReactNode
      disabled?: boolean
      className?: string
      'data-primary-key'?: string
    }>
    if (
      !result.primary &&
      selector === element.props['data-primary-key'] &&
      element.type === 'button' &&
      element.props.disabled !== true
    ) {
      result.primary = cloneElement(element, {
        className: [element.props.className, 'lifecycle-primary-action']
          .filter(Boolean)
          .join(' '),
      })
      return null
    }
    if (!element.props.children) return element
    return cloneElement(element, {
      children: Children.map(element.props.children, visit),
    })
  }

  const detail = Children.map(children, visit)
  return { primary: result.primary, detail }
}

function Capability({
  state,
  id,
  title,
  marker,
  primaryActionContext = {
    comparisonText: '',
    packetSelectionSaved: false,
  },
  children,
}: {
  state: LifecycleState
  id: CapabilityId
  title: string
  marker: boolean
  primaryActionContext?: PrimaryActionContext
  children: React.ReactNode
}) {
  const snapshot = capabilitySnapshot(id, state)
  const exceptions = [...(snapshot.exceptions ?? [])].sort(compareExceptions)
  const phase = capabilityPhase(id)
  const phaseOrder = ['before', 'during', 'after']
  const phaseIndex = phaseOrder.indexOf(phase)
  const currentPhaseIndex = ['before', 'during', 'after', 'complete'].indexOf(
    state.phase,
  )
  const isFuture = phaseIndex > currentPhaseIndex
  const isPast = phaseIndex < currentPhaseIndex
  const isSealedBeforeReview =
    Boolean(state.h1) && phase === 'before' && id !== 'B10'
  const isTransitionAction =
    id === 'D01' && state.phase === 'before' && Boolean(state.h1)
  const selector =
    !isPast && !isSealedBeforeReview && (!isFuture || isTransitionAction)
      ? primaryActionSelector(id, state, primaryActionContext)
      : null
  const { primary, detail } = splitPrimaryAction(children, selector)
  const status =
    isPast || isSealedBeforeReview
      ? 'Review'
      : isFuture && !isTransitionAction
        ? 'Waiting'
        : primary
          ? 'Ready'
          : marker
            ? 'Recorded'
            : 'Open'

  return (
    <article
      className={`lifecycle-capability ${marker ? 'is-complete' : ''}`}
      data-capability={id}
      id={`capability-${id.toLowerCase()}`}
    >
      <header>
        <span className="lifecycle-id">{id}</span>
        <h3>{title}</h3>
        <span className="lifecycle-marker" aria-label={`${id} marker`}>
          {status}
        </span>
      </header>
      <div className="lifecycle-capability-snapshot">
        <p>{snapshot.fact}</p>
        {snapshot.owner && (
          <p>
            <strong>Owner:</strong> {snapshot.owner}
          </p>
        )}
        {exceptions.length ? (
          <div
            className="lifecycle-status-chips"
            aria-label={`${id} attention states`}
          >
            {exceptions.slice(0, 4).map((exception) => (
              <span
                className="lifecycle-status-chip is-attention"
                key={exception}
              >
                {exception}
              </span>
            ))}
            {exceptions.length > 4 && (
              <span className="lifecycle-status-chip">
                +{exceptions.length - 4} more
              </span>
            )}
          </div>
        ) : null}
        <div className="lifecycle-next-action">
          <span>
            {primary ? 'Next' : isFuture ? phase : marker ? 'Review' : 'Open'}
          </span>
          {primary}
        </div>
      </div>
      <details className="lifecycle-capability-details">
        <summary
          aria-label={`${id} Details: ${title} options and exact record`}
        >
          Details
        </summary>
        <div className="lifecycle-capability-detail-body">{detail}</div>
      </details>
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
  const guidanceBasisMinute = injects.at(-1)?.minute ?? 0
  const guidanceNeeded = !state.guidanceVersions.some(
    (version) => version.createdMinute >= guidanceBasisMinute,
  )
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
  const openFollowThroughCount = state.followThroughItems.filter(
    (item) => item.status === 'planned' || item.status === 'in-progress',
  ).length
  const unableFollowThroughCount = state.followThroughItems.filter(
    (item) => item.status === 'unable',
  ).length
  const recheckAttentionCount =
    state.sourceRechecks.filter((item) => item.result !== 'unchanged').length +
    state.weatherRechecks.filter((item) => item.result !== 'unchanged').length
  const evidenceAttention = liveEvidence.snapshot
    ? evidenceCounts?.unavailableDomains ||
      evidenceCounts?.unavailableEventSources ||
      liveEvidence.snapshot.status !== 'complete'
    : true
  const capabilityExceptions = capabilityIds.flatMap((id) => {
    const phaseIndex = ['before', 'during', 'after'].indexOf(
      capabilityPhase(id),
    )
    if (phaseIndex > currentPhaseIndex) return []
    return (capabilitySnapshot(id, state).exceptions ?? []).map(
      (exception) => `${id}: ${exception}`,
    )
  })
  const nwsProducts =
    liveEvidence.snapshot?.event_triggers.data?.triggers.flatMap((trigger) =>
      trigger.source === 'nws' && trigger.nws_product
        ? [trigger.nws_product]
        : [],
    ) ?? []
  const sourceExceptions = nwsProducts.flatMap((product) => {
    const label = product.headline ?? product.event ?? product.id ?? 'NWS'
    const validity = nwsProductValidity(product, liveEvidence.now)
    const eligibility = nwsEligibility(product)
    const applicability = currentNWSApplicability(
      product,
      liveEvidence.now,
    ).result
    return [
      ...(validity === 'current' ? [] : [`${label}: ${validity}`]),
      ...(eligibility === 'eligible' ? [] : [`${label}: ${eligibility}`]),
      ...(applicability === 'unknown'
        ? [`${label}: applicability unknown`]
        : []),
    ]
  })
  const activeExceptions = Array.from(
    new Set([
      ...capabilityExceptions,
      ...sourceExceptions,
      ...(liveEvidence.lastKnown ? ['last-known evidence'] : []),
      ...(evidenceAttention ? ['public evidence needs attention'] : []),
      ...(openFollowThroughCount
        ? [`${openFollowThroughCount} open follow-through`]
        : []),
      ...(unableFollowThroughCount
        ? [`${unableFollowThroughCount} unable follow-through`]
        : []),
      ...(recheckAttentionCount
        ? [`${recheckAttentionCount} rechecks need attention`]
        : []),
      ...(restoreFailed ? ['saved record invalid'] : []),
    ]),
  ).sort(compareExceptions)
  const visibleActiveExceptions = activeExceptions.slice(0, 6)
  const blockedOrOverdueOwner = [...state.supportItems]
    .filter(
      (item) =>
        item.response === 'decline' || item.dueMinute < state.practiceMinute,
    )
    .sort(
      (left, right) =>
        Number(right.response === 'decline') -
          Number(left.response === 'decline') ||
        left.dueMinute - right.dueMinute,
    )
    .at(0)?.owner

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
        <strong>{practiceStamp}</strong>
        <div className="lifecycle-boundary" aria-label="Workspace boundaries">
          <span>PRACTICE</span>
          <span>LOCAL</span>
          <span>UNSENT</span>
          <span>NO AUTHORITY</span>
        </div>
        <details>
          <summary>What this boundary means</summary>
          <p>
            Fixed fictional roles and partners only. No resident records, staff
            writes, messages, resource movement, protective actions, or live
            condition claims are created here.
          </p>
        </details>
      </div>
      <section
        className="lifecycle-overview"
        aria-labelledby="lifecycle-overview-heading"
      >
        <div className="lifecycle-overview-heading">
          <div>
            <h2 id="lifecycle-overview-heading">
              {state.phase === 'complete'
                ? 'Cycle complete'
                : `${state.phase[0].toUpperCase()}${state.phase.slice(1)} phase`}
            </h2>
            <p>
              {markerCount}/30 capabilities recorded · T
              {state.practiceMinute >= 0 ? '+' : ''}
              {state.practiceMinute}
            </p>
          </div>
          <div
            className="lifecycle-status-chips"
            aria-label="Lifecycle attention summary"
          >
            {activeExceptions.length ? (
              <>
                {visibleActiveExceptions.map((exception) => (
                  <span
                    className="lifecycle-status-chip is-attention"
                    key={exception}
                  >
                    {exception}
                  </span>
                ))}
                {activeExceptions.length > visibleActiveExceptions.length && (
                  <details className="lifecycle-attention-more">
                    <summary className="lifecycle-status-chip is-attention">
                      +
                      {activeExceptions.length - visibleActiveExceptions.length}{' '}
                      more attention states
                    </summary>
                    <ul>
                      {activeExceptions
                        .slice(visibleActiveExceptions.length)
                        .map((exception) => (
                          <li key={exception}>{exception}</li>
                        ))}
                    </ul>
                  </details>
                )}
              </>
            ) : (
              <span className="lifecycle-status-chip">no exception</span>
            )}
          </div>
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
            <span>Needs attention</span>
            <strong>{activeExceptions.length}</strong>
          </div>
          <div>
            <span>Next owner</span>
            <strong>
              {state.phase === 'before'
                ? 'Facilitator'
                : state.phase === 'during'
                  ? (blockedOrOverdueOwner ??
                    state.supportItems.find(
                      (item) => item.disposition === 'undecided',
                    )?.owner ??
                    'Facilitator')
                  : (state.followThroughItems.find(
                      (item) =>
                        item.status === 'planned' ||
                        item.status === 'in-progress' ||
                        item.status === 'unable',
                    )?.owner ?? 'Recovery lead')}
            </strong>
          </div>
        </div>
        <details className="lifecycle-overview-record">
          <summary>Cycle identity and digest</summary>
          <p>
            Cycle {state.cycle} · {state.schema} · digest{' '}
            {lifecycleDigest(state)}
          </p>
        </details>
      </section>
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
            <div>
              <strong>{phase}</strong>
              <small>
                {
                  capabilityIds.filter(
                    (id) =>
                      capabilityPhase(id) === phase.toLowerCase() && marked(id),
                  ).length
                }
                /10 recorded
              </small>
            </div>
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
            <p className="operations-stamp">PUBLIC EVIDENCE · READ ONLY</p>
            <h2 id="lifecycle-evidence-heading">Live lifecycle evidence</h2>
          </div>
          <button type="button" onClick={liveEvidence.refresh}>
            Refresh
          </button>
        </div>
        <p>
          Read-only context. Not dispatch, an order, restoration, or an
          all-clear.
        </p>
        <details className="lifecycle-evidence-limits">
          <summary>Evidence authority limits</summary>
          <p>
            Public evidence is planning context only—not dispatch, an order,
            passability, restoration, containment, shelter completeness, partner
            acceptance, resource movement, recovery completion, or all-clear
            truth.
          </p>
        </details>
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
                <span>Shelter reports</span>
                <strong>
                  {liveEvidence.snapshot.shelter_context.items.length} ·{' '}
                  {liveEvidence.snapshot.shelter_context.state}
                </strong>
                <small>
                  Coverage {liveEvidence.snapshot.shelter_context.coverage}
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
      <nav className="lifecycle-jump" aria-label="Lifecycle sections">
        <a href="#before">Before</a>
        <a href="#during">During</a>
        <a href="#after">After</a>
        <a href="#ledger">Ledger</a>
        <Link to="/operations">Staff operations</Link>
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
            <h2 id="before-heading">Prepare the cycle</h2>
          </div>
          {state.h1 && <span>H1 sealed · {state.h1.digest}</span>}
        </div>
        <div className="lifecycle-grid">
          <Capability
            state={state}
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
              data-primary-key={primaryKey('B01', 'event', 'lock')}
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
            state={state}
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
                  data-primary-key={primaryKey('B02', gap.id, 'carry')}
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
            state={state}
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
              data-primary-key={primaryKey('B03', 'objectives', 'freeze')}
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
            state={state}
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
              data-primary-key={primaryKey('B04', 'margin', 'compute')}
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
            state={state}
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
                data-primary-key={primaryKey('B05', 'comparison', 'carry')}
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
            state={state}
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
                      data-primary-key={
                        choice === 'planned'
                          ? primaryKey('B06', format, 'planned')
                          : undefined
                      }
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
            state={state}
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
                    data-primary-key={primaryKey(
                      'B07',
                      gap.gapId,
                      'criteria-present',
                    )}
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
            state={state}
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
                  data-primary-key={
                    state.simulationScope[area] === 'simulated'
                      ? undefined
                      : primaryKey('B08', area, 'simulated')
                  }
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
            state={state}
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
                    data-primary-key={primaryKey(
                      'B09',
                      area,
                      'schedule-inject',
                    )}
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
            state={state}
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
              data-primary-key={primaryKey('B10', 'h1', 'seal')}
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
            state={state}
            id="D01"
            title="Materialize the H1 support queue"
            marker={marked('D01')}
          >
            <button
              type="button"
              data-primary-key={primaryKey('D01', 'h1', 'start-response')}
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
            state={state}
            id="D02"
            title="Advance deterministic practice time"
            marker={marked('D02')}
          >
            <div className="operations-actions">
              {[15, 30, 60].map((minutes) => (
                <button
                  type="button"
                  className="secondary"
                  data-primary-key={
                    minutes === 60
                      ? primaryKey('D02', 'clock', 'advance-60')
                      : undefined
                  }
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
            state={state}
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
                        data-primary-key={
                          serviceState === 'unknown'
                            ? primaryKey('D03', area, 'unknown')
                            : undefined
                        }
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
            state={state}
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
                    data-primary-key={
                      response === 'hold'
                        ? primaryKey('D04', item.id, 'hold')
                        : undefined
                    }
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
            state={state}
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
                    data-primary-key={primaryKey('D05', item.id, 'escalate')}
                    disabled={!reason || Boolean(item.escalation)}
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
                    Escalate {item.id} with bounded deadline
                  </button>
                </div>
              )
            })}
          </Capability>

          <Capability
            state={state}
            id="D06"
            title="Add assumption revision r2"
            marker={marked('D06')}
          >
            <button
              type="button"
              data-primary-key={primaryKey('D06', 'r2', 'add')}
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
            state={state}
            id="D07"
            title="Create versioned guidance drafts"
            marker={marked('D07')}
          >
            <button
              type="button"
              data-primary-key={primaryKey(
                'D07',
                String(guidanceBasisMinute),
                'create-guidance',
              )}
              disabled={state.phase !== 'during' || !guidanceNeeded}
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
            state={state}
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
              data-primary-key={primaryKey('D08', 'shift', 'freeze')}
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
            state={state}
            id="D09"
            title="Replace stale practice evidence"
            marker={marked('D09')}
          >
            <div className="lifecycle-button-list">
              {staleEvidence.map((item) => (
                <button
                  type="button"
                  className="secondary"
                  data-primary-key={primaryKey('D09', item.id, 'replace')}
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
            state={state}
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
                    data-primary-key={
                      disposition === 'carried'
                        ? primaryKey('D10', item.id, 'carried')
                        : undefined
                    }
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
              data-primary-key={primaryKey('D10', 'h2', 'seal')}
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
            <h2 id="after-heading">Close and carry forward</h2>
          </div>
          {state.previousCycle && (
            <span>H3 sealed · {state.previousCycle.digest}</span>
          )}
        </div>
        <div className="lifecycle-grid">
          <Capability
            state={state}
            id="A01"
            title="Build the recovery register"
            marker={marked('A01')}
          >
            {state.recoveryRows.map((row) => {
              const canCreateFollowThrough =
                row.state === 'follow-up-ready' &&
                !state.followThroughItems.some(
                  (item) =>
                    item.supportItemId === row.supportItemId ||
                    ((item.status === 'planned' ||
                      item.status === 'in-progress') &&
                      item.gapId === row.gapId),
                )
              return (
                <div key={row.supportItemId}>
                  <div className="lifecycle-row">
                    <span>
                      {row.supportItemId} · {row.gapId} · {row.horizon} ·{' '}
                      {row.state}
                    </span>
                    <button
                      type="button"
                      className="secondary"
                      aria-label={`Set ${row.supportItemId} follow-up ready`}
                      data-primary-key={
                        row.state === 'follow-up-ready'
                          ? undefined
                          : primaryKey('A01', row.supportItemId, 'ready')
                      }
                      disabled={row.state === 'follow-up-ready'}
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
                  {canCreateFollowThrough && (
                    <>
                      <button
                        type="button"
                        className="secondary"
                        aria-label={`Create structured follow-through for ${row.supportItemId}`}
                        data-primary-key={primaryKey(
                          'A01',
                          row.supportItemId,
                          'create-follow-through',
                        )}
                        onClick={() =>
                          act({
                            type: 'create-follow-through',
                            supportItemId: row.supportItemId,
                            owner: 'Recovery lead',
                            dueHorizon: 'next day',
                            doneCheck: 'practice-review-recorded',
                          })
                        }
                      >
                        Create structured follow-through
                      </button>
                      <FollowThroughCreator row={row} act={act} />
                    </>
                  )}
                </div>
              )
            })}
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
                      <summary>
                        {item.gapId} · {item.status} · exact practice record and
                        actions
                      </summary>
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
                          aria-label={`Start follow-through for ${item.id}`}
                          data-primary-key={primaryKey('A01', item.id, 'start')}
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
                              aria-label={`Record ${result} for ${item.id}`}
                              data-primary-key={
                                result === 'observed'
                                  ? primaryKey('A01', item.id, 'observe')
                                  : undefined
                              }
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
                          aria-label={`Finish follow-through for ${item.id}`}
                          data-primary-key={primaryKey(
                            'A01',
                            item.id,
                            'finish',
                          )}
                          disabled={
                            !inProgress ||
                            !hasCurrentAttemptObservation ||
                            latest?.result !== 'observed'
                          }
                          onClick={() =>
                            act({
                              type: 'finish-follow-through',
                              id: item.id,
                            })
                          }
                        >
                          Finish
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          aria-label={`Mark ${item.id} unable`}
                          data-primary-key={primaryKey(
                            'A01',
                            item.id,
                            'unable',
                          )}
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
            state={state}
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
                    data-primary-key={primaryKey('A02', domain, 'unknown')}
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
            state={state}
            id="A03"
            title="Review linked practice holds"
            marker={marked('A03')}
          >
            <button
              type="button"
              data-primary-key={primaryKey('A03', 'holds', 'review')}
              onClick={() => act({ type: 'review-holds' })}
            >
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
            state={state}
            id="A04"
            title="Plan service-area rechecks"
            marker={marked('A04')}
          >
            <div className="lifecycle-button-list">
              {state.serviceRecords
                .filter(
                  (record) =>
                    serviceRecordNeedsRecheck(record, state.practiceMinute) &&
                    !state.recheckPlans.some(
                      (plan) => plan.area === record.area,
                    ),
                )
                .map((record) => (
                  <button
                    type="button"
                    className="secondary"
                    data-primary-key={primaryKey(
                      'A04',
                      record.area,
                      'plan-recheck',
                    )}
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
            state={state}
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
                    data-primary-key={
                      classification === 'carried into recovery draft r1'
                        ? primaryKey('A05', block, 'carry-recovery')
                        : undefined
                    }
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
            state={state}
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
                        data-primary-key={
                          disposition === 'carry-forward'
                            ? primaryKey('A06', objectiveId, 'carry-forward')
                            : undefined
                        }
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
            state={state}
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
                data-primary-key={primaryKey('A07', 'gates', 'carry-unmet')}
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
                data-primary-key={primaryKey('A07', 'gates', 'met')}
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
            state={state}
            id="A08"
            title="Export or pin a strict comparison"
            marker={marked('A08')}
            primaryActionContext={{ comparisonText, packetSelectionSaved }}
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
                data-primary-key={primaryKey('A08', 'comparison', 'copy')}
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
              data-primary-key={primaryKey('A08', 'comparison', 'pin')}
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
            state={state}
            id="A09"
            title="Generate a deterministic closeout packet"
            marker={marked('A09')}
            primaryActionContext={{ comparisonText, packetSelectionSaved }}
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
              data-primary-key={primaryKey('A09', 'packet', 'save-selection')}
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
              data-primary-key={primaryKey('A09', 'packet', 'download')}
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
            state={state}
            id="A10"
            title="Seal H3 and start cycle 2"
            marker={marked('A10')}
          >
            <button
              type="button"
              data-primary-key={primaryKey('A10', 'cycle', 'seal')}
              disabled={
                state.gateDecision !==
                (lifecycleGatesMet(state)
                  ? 'gates-met'
                  : 'gates-unmet-carry-forward')
              }
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
        <div className="lifecycle-ledger-summary">
          <strong>{state.ledger.length} deterministic local events</strong>
          <span>Canonical export remains unchanged.</span>
        </div>
        <details>
          <summary>Inspect capability ledger</summary>
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
        </details>
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
