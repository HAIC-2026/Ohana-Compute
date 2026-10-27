import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileDiff,
  History,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react'

import type { IdentitySessionState } from '../lib/identity-session'
import {
  addCollaborativePlanApproval,
  addCollaborativePlanAssignment,
  addCollaborativePlanComment,
  collaborationErrorStatus,
  compareCollaborativePlanVersions,
  createCollaborativePlan,
  loadCollaborativePlan,
  updateCollaborativePlan,
} from '../lib/collaborative-plans'
import type {
  CollaborativePlan,
  CollaborativePlanComparison,
  CollaborativePlanSnapshot,
  CollaborativePlanStatus,
} from '../lib/collaborative-plans'

type Props = {
  identityState: IdentitySessionState
  jurisdiction: string
  areaRef: string
  eventRef: string
  hazard: string
  suggestedTitle: string
  suggestedSummary: string
  snapshot: CollaborativePlanSnapshot
}

const assignmentRoleLabels = {
  county_mass_care: 'County mass care',
  state_esf6: 'State ESF-6',
  shelter_operations: 'Shelter operations',
  transportation_coordination: 'Transportation coordination',
  public_information: 'Public information',
  community_support: 'Community support',
} as const

const assignmentCapabilityLabels = {
  coordinate: 'Coordinate response',
  validate_resources: 'Validate resources',
  validate_routes: 'Validate routes',
  publish_guidance: 'Publish guidance',
  support_accessibility: 'Support accessibility',
} as const

const GroundedPlanningAssist = lazy(() =>
  import('./GroundedPlanningAssist').then((module) => ({
    default: module.GroundedPlanningAssist,
  })),
)

export function CollaborativePlanPanel(props: Props) {
  const [plan, setPlan] = useState<CollaborativePlan | null>(null)
  const [title, setTitle] = useState(props.suggestedTitle)
  const [summary, setSummary] = useState(props.suggestedSummary)
  const [status, setStatus] = useState<CollaborativePlanStatus>('draft')
  const [note, setNote] = useState('')
  const [assignmentRole, setAssignmentRole] =
    useState<keyof typeof assignmentRoleLabels>('county_mass_care')
  const [assignmentCapability, setAssignmentCapability] =
    useState<keyof typeof assignmentCapabilityLabels>('coordinate')
  const [approvalDecision, setApprovalDecision] = useState('approved')
  const [approvalRationale, setApprovalRationale] = useState('')
  const [comparison, setComparison] =
    useState<CollaborativePlanComparison | null>(null)
  const [fromVersion, setFromVersion] = useState(1)
  const [toVersion, setToVersion] = useState(2)
  const [pending, setPending] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [messageKind, setMessageKind] = useState<
    'success' | 'error' | 'conflict'
  >('success')
  const [conflict, setConflict] = useState(false)

  const session =
    props.identityState.status === 'ready' ? props.identityState.session : null
  const canRead = session?.collaboration_read === 'available'
  const canWrite = session?.collaboration_write === 'available'
  const canApprove = session?.collaboration_approve === 'available'
  const isConfigured =
    session?.configuration_status === 'configured' &&
    session.state === 'authenticated'
  const activePlanStorageKey = useMemo(
    () =>
      [
        'hawaii-resilience-active-plan-v1',
        props.jurisdiction,
        props.areaRef,
        props.eventRef || 'no-event',
        props.hazard,
      ]
        .map(encodeURIComponent)
        .join(':'),
    [props.areaRef, props.eventRef, props.hazard, props.jurisdiction],
  )

  const newestVersion = plan?.versions.at(-1)
  const timeline = useMemo(
    () => [...(plan?.audit ?? [])].reverse(),
    [plan?.audit],
  )
  const pendingMessage =
    pending === 'reopen' || pending === 'refresh'
      ? 'Loading the latest shared plan while preserving your draft…'
      : pending === 'compare'
        ? 'Comparing the selected immutable versions…'
        : pending === 'note'
          ? 'Adding the bounded planning note…'
          : pending === 'assignment'
            ? 'Saving the controlled role assignment…'
            : pending === 'approval'
              ? 'Recording the approval decision…'
              : 'Saving the shared-plan change…'

  useEffect(() => {
    if (!isConfigured || !canRead || plan) return
    const storedPlanID = readStoredPlanID(activePlanStorageKey)
    if (!storedPlanID) return

    let active = true
    setPending('reopen')
    setMessage(null)
    void loadCollaborativePlan(storedPlanID)
      .then((storedPlan) => {
        if (!active) return
        setPlan(storedPlan)
        setTitle(storedPlan.title)
        setSummary(storedPlan.summary)
        setStatus(storedPlan.status)
        setFromVersion(Math.max(1, storedPlan.current_version - 1))
        setToVersion(storedPlan.current_version)
        setMessageKind('success')
        setMessage('Reopened the active shared plan.')
      })
      .catch((error) => {
        if (!active) return
        if (collaborationErrorStatus(error) === 404) {
          removeStoredPlanID(activePlanStorageKey)
          return
        }
        setMessageKind('error')
        setMessage(
          error instanceof Error
            ? error.message
            : 'The active shared plan could not be reopened.',
        )
      })
      .finally(() => {
        if (active) setPending(null)
      })
    return () => {
      active = false
    }
  }, [activePlanStorageKey, canRead, isConfigured, plan])

  const run = async (
    operation: string,
    action: () => Promise<CollaborativePlan>,
    success: string,
    syncEditor = false,
  ) => {
    setPending(operation)
    setMessage(null)
    setConflict(false)
    try {
      const next = await action()
      setPlan(next)
      storePlanID(activePlanStorageKey, next.id)
      if (syncEditor) {
        setTitle(next.title)
        setSummary(next.summary)
        setStatus(next.status)
      }
      setFromVersion(Math.max(1, next.current_version - 1))
      setToVersion(next.current_version)
      setMessageKind('success')
      setMessage(success)
      return next
    } catch (error) {
      if (collaborationErrorStatus(error) === 409) {
        setConflict(true)
        setMessageKind('conflict')
        setMessage(
          'A newer change is already stored. Your draft is preserved; refresh the shared plan before reviewing or saving again.',
        )
      } else if (collaborationErrorStatus(error) === 403) {
        setMessageKind('error')
        setMessage('Your configured role does not allow this action.')
      } else if (collaborationErrorStatus(error) === 503) {
        setMessageKind('error')
        setMessage(
          'Shared storage is unavailable. Your local checklist and field packet still work.',
        )
      } else {
        setMessageKind('error')
        setMessage(
          error instanceof Error
            ? error.message
            : 'The collaboration request could not be completed.',
        )
      }
      return null
    } finally {
      setPending(null)
    }
  }

  const refresh = async () => {
    if (!plan) return
    await run(
      'refresh',
      () => loadCollaborativePlan(plan.id),
      'Loaded the latest shared plan. Your editor draft was preserved.',
    )
  }

  if (props.identityState.status === 'loading') {
    return (
      <section className="collaboration-surface is-loading" aria-live="polite">
        <LoaderCircle className="spin" size={18} />
        <div>
          <strong>Checking shared-plan access</strong>
          <p>The local response checklist remains available.</p>
        </div>
      </section>
    )
  }

  if (!isConfigured || !canRead) {
    return (
      <section
        className="collaboration-surface is-local"
        data-testid="collaboration-local-only"
      >
        <ShieldCheck size={18} />
        <div>
          <strong>Shared planning is off</strong>
          <p>
            This response checklist stays local. Configured identity and durable
            persistence are required before plans, notes, assignments, or
            approvals can be stored on the server.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section
      className="collaboration-surface"
      data-testid="collaborative-plan-panel"
      aria-label="Shared plan workspace"
      aria-busy={pending !== null}
    >
      <div className="collaboration-heading">
        <div>
          <span>
            <ShieldCheck size={16} /> Controlled workspace
          </span>
          <h3>
            {plan
              ? `Shared plan · version ${plan.current_version}`
              : 'Save as a shared plan'}
          </h3>
          <p>
            Versions are immutable. Notes are operational only—do not enter
            names, addresses, medical details, or case records.
          </p>
        </div>
        {plan && (
          <strong className={`plan-status is-${plan.status}`}>
            {plan.status.replace('_', ' ')}
          </strong>
        )}
      </div>

      {message && (
        <div
          className={`collaboration-message${conflict ? ' is-conflict' : ''}`}
          data-kind={messageKind}
          role={messageKind === 'success' ? 'status' : 'alert'}
        >
          {messageKind === 'success' ? (
            <CheckCircle2 size={17} />
          ) : (
            <AlertTriangle size={17} />
          )}
          <span>{message}</span>
          {conflict && (
            <button type="button" onClick={refresh} disabled={pending !== null}>
              <RefreshCw size={14} /> Refresh and review
            </button>
          )}
        </div>
      )}
      {pending && (
        <p className="collaboration-pending" role="status" aria-live="polite">
          <LoaderCircle className="spin" size={14} />
          {pendingMessage}
        </p>
      )}

      <div className="collaboration-fields">
        <label>
          Plan title
          <input
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          Planning summary
          <textarea
            value={summary}
            maxLength={800}
            rows={3}
            onChange={(event) => setSummary(event.target.value)}
          />
        </label>
        <label>
          Review status
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as CollaborativePlanStatus)
            }
          >
            <option value="draft">Draft</option>
            <option value="in_review">In review</option>
            <option value="changes_needed">Changes needed</option>
            {(canApprove || status === 'approved') && (
              <option value="approved" disabled={!canApprove}>
                Approved
              </option>
            )}
            <option value="archived">Archived</option>
          </select>
        </label>
      </div>

      <button
        className="collaboration-primary"
        type="button"
        data-telemetry-action={
          plan ? 'collaboration_version_save' : 'collaboration_plan_save'
        }
        data-telemetry-category="planning"
        disabled={
          !canWrite ||
          pending !== null ||
          !title.trim() ||
          !summary.trim() ||
          (status === 'approved' && !canApprove)
        }
        onClick={() =>
          plan
            ? run(
                'save-version',
                () =>
                  updateCollaborativePlan(plan.id, {
                    expected_revision: plan.revision,
                    title,
                    summary,
                    status,
                    snapshot: props.snapshot,
                  }),
                'Saved a new immutable plan version.',
                true,
              )
            : run(
                'create',
                () =>
                  createCollaborativePlan({
                    jurisdiction: props.jurisdiction,
                    area_ref: props.areaRef,
                    event_ref: props.eventRef,
                    hazard: props.hazard,
                    title,
                    summary,
                    status,
                    snapshot: props.snapshot,
                  }),
                'Shared plan created.',
                true,
              )
        }
      >
        {pending === 'create' || pending === 'save-version' ? (
          <LoaderCircle className="spin" size={15} />
        ) : (
          <Save size={15} />
        )}
        {plan ? 'Save new version' : 'Save shared plan'}
      </button>

      {plan && (
        <Suspense
          fallback={
            <div className="planning-assist is-loading" role="status">
              <LoaderCircle className="spin" size={17} />
              Loading review-only planning assist
            </div>
          }
        >
          <GroundedPlanningAssist
            plan={plan}
            canWrite={canWrite}
            onRefreshPlan={refresh}
            onPlanApplied={(next) => {
              setPlan(next)
              setTitle(next.title)
              setSummary(next.summary)
              setStatus(next.status)
              setFromVersion(Math.max(1, next.current_version - 1))
              setToVersion(next.current_version)
            }}
          />
        </Suspense>
      )}

      {plan && (
        <div className="collaboration-workflows">
          <details open>
            <summary>
              <MessageSquareText size={16} />
              Decision notes <span>{plan.comments.length}</span>
            </summary>
            <div className="collaboration-detail-body">
              <label>
                Bounded operational note
                <textarea
                  value={note}
                  maxLength={600}
                  rows={2}
                  placeholder="Record a decision or validation needed; never include personal or case data."
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={!canWrite || pending !== null || !note.trim()}
                onClick={async () => {
                  const next = await run(
                    'note',
                    () =>
                      addCollaborativePlanComment(plan.id, {
                        expected_revision: plan.revision,
                        body: note,
                      }),
                    'Planning note added.',
                  )
                  if (next) setNote('')
                }}
              >
                Add planning note
              </button>
              {plan.comments.length === 0 ? (
                <p className="collaboration-empty">No decision notes yet.</p>
              ) : (
                <ul className="collaboration-list">
                  {plan.comments.map((comment) => (
                    <li key={comment.id}>
                      <strong>{comment.author_role.replace('_', ' ')}</strong>
                      <p>{comment.body}</p>
                      <time>{formatDate(comment.created_at)}</time>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>

          <details>
            <summary>
              <UserRoundCheck size={16} />
              Role assignments <span>{plan.assignments.length}</span>
            </summary>
            <div className="collaboration-detail-body">
              <div className="collaboration-inline-fields">
                <label>
                  Response role
                  <select
                    value={assignmentRole}
                    onChange={(event) =>
                      setAssignmentRole(
                        event.target.value as keyof typeof assignmentRoleLabels,
                      )
                    }
                  >
                    {Object.entries(assignmentRoleLabels).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Capability
                  <select
                    value={assignmentCapability}
                    onChange={(event) =>
                      setAssignmentCapability(
                        event.target
                          .value as keyof typeof assignmentCapabilityLabels,
                      )
                    }
                  >
                    {Object.entries(assignmentCapabilityLabels).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>
              <button
                type="button"
                disabled={!canWrite || pending !== null}
                onClick={() => {
                  const dueStart = new Date()
                  const dueEnd = new Date(
                    dueStart.getTime() + 24 * 60 * 60 * 1000,
                  )
                  void run(
                    'assignment',
                    () =>
                      addCollaborativePlanAssignment(plan.id, {
                        expected_revision: plan.revision,
                        role: assignmentRole,
                        capability: assignmentCapability,
                        status: 'active',
                        due_start: dueStart.toISOString(),
                        due_end: dueEnd.toISOString(),
                      }),
                    'Controlled role assigned for a 24-hour review window.',
                  )
                }}
              >
                Assign role
              </button>
              {plan.assignments.length === 0 ? (
                <p className="collaboration-empty">
                  No controlled roles assigned.
                </p>
              ) : (
                <ul className="collaboration-list is-structured">
                  {plan.assignments.map((assignment) => (
                    <li key={assignment.id}>
                      <strong>{assignment.role.replaceAll('_', ' ')}</strong>
                      <span>{assignment.capability.replaceAll('_', ' ')}</span>
                      <small>
                        {assignment.status} · due{' '}
                        {formatDate(assignment.due_end)}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>

          <details>
            <summary>
              <ShieldCheck size={16} />
              Approval record <span>{plan.approvals.length}</span>
            </summary>
            <div className="collaboration-detail-body">
              {!canApprove && (
                <p className="collaboration-permission">
                  Your configured role can review this plan but cannot record an
                  approval decision.
                </p>
              )}
              <div className="collaboration-inline-fields">
                <label>
                  Decision
                  <select
                    value={approvalDecision}
                    onChange={(event) =>
                      setApprovalDecision(event.target.value)
                    }
                  >
                    <option value="approved">Approved</option>
                    <option value="changes_requested">Changes requested</option>
                    <option value="withdrawn">Withdrawn</option>
                  </select>
                </label>
                <label>
                  Optional rationale
                  <input
                    value={approvalRationale}
                    maxLength={400}
                    onChange={(event) =>
                      setApprovalRationale(event.target.value)
                    }
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={!canApprove || pending !== null}
                onClick={() =>
                  run(
                    'approval',
                    () =>
                      addCollaborativePlanApproval(plan.id, {
                        expected_revision: plan.revision,
                        version: plan.current_version,
                        decision: approvalDecision,
                        rationale: approvalRationale,
                      }),
                    'Approval decision recorded for this version.',
                  )
                }
              >
                Record decision
              </button>
              {plan.approvals.length === 0 ? (
                <p className="collaboration-empty">
                  No approval decisions recorded.
                </p>
              ) : (
                <ul className="collaboration-list is-structured">
                  {plan.approvals.map((approval) => (
                    <li key={approval.id}>
                      <strong>{approval.decision.replace('_', ' ')}</strong>
                      <span>
                        Version {approval.version} ·{' '}
                        {approval.approver_role.replace('_', ' ')}
                      </span>
                      {approval.rationale && (
                        <small>{approval.rationale}</small>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>

          <details>
            <summary>
              <FileDiff size={16} />
              Compare versions <span>{plan.versions.length}</span>
            </summary>
            <div className="collaboration-detail-body">
              {plan.versions.length < 2 ? (
                <p className="collaboration-empty">
                  Save a second version to compare changes.
                </p>
              ) : (
                <>
                  <div className="collaboration-inline-fields">
                    <label>
                      From
                      <select
                        value={fromVersion}
                        onChange={(event) =>
                          setFromVersion(Number(event.target.value))
                        }
                      >
                        {plan.versions.map((version) => (
                          <option key={version.version} value={version.version}>
                            Version {version.version}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      To
                      <select
                        value={toVersion}
                        onChange={(event) =>
                          setToVersion(Number(event.target.value))
                        }
                      >
                        {plan.versions.map((version) => (
                          <option key={version.version} value={version.version}>
                            Version {version.version}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={pending !== null || fromVersion === toVersion}
                    onClick={async () => {
                      setPending('compare')
                      setMessage(null)
                      try {
                        setComparison(
                          await compareCollaborativePlanVersions(
                            plan.id,
                            fromVersion,
                            toVersion,
                          ),
                        )
                      } catch (error) {
                        setMessageKind('error')
                        setMessage(
                          error instanceof Error
                            ? error.message
                            : 'The versions could not be compared.',
                        )
                      } finally {
                        setPending(null)
                      }
                    }}
                  >
                    Compare selected versions
                  </button>
                  {comparison && (
                    <div
                      className="version-comparison"
                      data-testid="version-comparison"
                    >
                      <strong>
                        Version {comparison.from.version} →{' '}
                        {comparison.to.version}
                      </strong>
                      <p>
                        Changed:{' '}
                        {comparison.changed_fields.join(', ') || 'No fields'}
                      </p>
                      <div>
                        <span>{comparison.from.title}</span>
                        <span>{comparison.to.title}</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </details>

          <details>
            <summary>
              <History size={16} />
              Audit history <span>{plan.audit.length}</span>
            </summary>
            <div className="collaboration-detail-body">
              <ol className="audit-timeline">
                {timeline.map((event) => (
                  <li key={event.id}>
                    <Clock3 size={14} />
                    <div>
                      <strong>{event.action.replaceAll('_', ' ')}</strong>
                      <span>
                        {event.actor_role.replace('_', ' ')} ·{' '}
                        {formatDate(event.created_at)}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
              {newestVersion && (
                <p className="collaboration-provenance">
                  Current snapshot created by{' '}
                  {newestVersion.actor_role.replace('_', ' ')}
                  {newestVersion.ai_assistance
                    ? ' with reviewed AI-assisted content'
                    : ''}
                  . Audit entries contain controlled actions, roles, and bounded
                  assistance provenance only.
                </p>
              )}
            </div>
          </details>
        </div>
      )}
    </section>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function readStoredPlanID(key: string) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function storePlanID(key: string, planID: string) {
  try {
    window.localStorage.setItem(key, planID)
  } catch {
    // Shared-plan persistence remains available even if browser storage is blocked.
  }
}

function removeStoredPlanID(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Nothing else is required when browser storage is blocked.
  }
}
