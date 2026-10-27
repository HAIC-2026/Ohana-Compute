import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FileCheck2,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  XCircle,
} from 'lucide-react'

import type { CollaborativePlan } from '../lib/collaborative-plans'
import {
  applyGroundedPlanningDraft,
  generateGroundedPlanningDraft,
  groundedPlanningErrorStatus,
  loadGroundedPlanningStatus,
  rejectGroundedPlanningDraft,
} from '../lib/grounded-planning'
import type {
  GroundedPlanningDraft,
  GroundedPlanningOperation,
  GroundedPlanningStatus,
  GroundedPlanningStyle,
} from '../lib/grounded-planning'

type Props = {
  plan: CollaborativePlan
  canWrite: boolean
  onPlanApplied: (plan: CollaborativePlan) => void
  onRefreshPlan: () => Promise<CollaborativePlan | null>
}

type SurfaceState =
  | 'loading'
  | 'disabled'
  | 'ready'
  | 'generating'
  | 'draft'
  | 'policy-blocked'
  | 'provider-unavailable'
  | 'stale'
  | 'rejected'
  | 'applied'

export function GroundedPlanningAssist({
  plan,
  canWrite,
  onPlanApplied,
  onRefreshPlan,
}: Props) {
  const [status, setStatus] = useState<GroundedPlanningStatus | null>(null)
  const [state, setState] = useState<SurfaceState>('loading')
  const [draft, setDraft] = useState<GroundedPlanningDraft | null>(null)
  const [operation, setOperation] =
    useState<GroundedPlanningOperation>('identify_gaps')
  const [style, setStyle] = useState<GroundedPlanningStyle>('concise')
  const [selectedSections, setSelectedSections] = useState<string[]>([])
  const [selectedActions, setSelectedActions] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [messageKind, setMessageKind] = useState<'status' | 'error'>('status')
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [draftNeedsRegeneration, setDraftNeedsRegeneration] = useState(false)

  useEffect(() => {
    let active = true
    setState('loading')
    loadGroundedPlanningStatus(plan.id)
      .then((nextStatus) => {
        if (!active) return
        setStatus(nextStatus)
        setState(nextStatus.state === 'configured' ? 'ready' : 'disabled')
      })
      .catch(() => {
        if (!active) return
        setState('provider-unavailable')
      })
    return () => {
      active = false
    }
  }, [plan.id])

  const citations = useMemo(
    () => new Map(draft?.citations.map((item) => [item.source_id, item])),
    [draft],
  )

  const generate = async () => {
    setState('generating')
    setPendingAction('generate')
    setMessage(null)
    try {
      const next = await generateGroundedPlanningDraft(plan.id, {
        expected_revision: plan.revision,
        operation,
        style,
      })
      setDraft(next)
      setDraftNeedsRegeneration(false)
      setSelectedSections(next.sections.map((section) => section.id))
      setSelectedActions(next.actions.map((action) => action.id))
      setState('draft')
    } catch (error) {
      const statusCode = groundedPlanningErrorStatus(error)
      if (statusCode === 409) {
        setState('stale')
        setDraftNeedsRegeneration(draft !== null)
        setMessageKind('error')
        setMessage(null)
      } else if (statusCode === 422) {
        setState('policy-blocked')
        setMessageKind('error')
        setMessage(error instanceof Error ? error.message : null)
      } else {
        setState('provider-unavailable')
        setMessageKind('error')
        setMessage(error instanceof Error ? error.message : null)
      }
    } finally {
      setPendingAction(null)
    }
  }

  const apply = async () => {
    if (!draft) return
    setState('generating')
    setPendingAction('apply')
    setMessage(null)
    try {
      const nextPlan = await applyGroundedPlanningDraft(
        plan.id,
        draft.draft_id,
        {
          expected_revision: plan.revision,
          section_ids: selectedSections,
          action_ids: selectedActions,
        },
      )
      onPlanApplied(nextPlan)
      setDraft(null)
      setSelectedSections([])
      setSelectedActions([])
      setState('applied')
      setMessageKind('status')
      setMessage(
        'Selected draft content was applied as a human-authored plan version.',
      )
    } catch (error) {
      if (groundedPlanningErrorStatus(error) === 409) {
        setState('stale')
        setDraftNeedsRegeneration(true)
        setMessageKind('error')
        setMessage(null)
      } else {
        setState('provider-unavailable')
        setMessageKind('error')
        setMessage(error instanceof Error ? error.message : null)
      }
    } finally {
      setPendingAction(null)
    }
  }

  const reject = async () => {
    if (!draft) return
    setState('generating')
    setPendingAction('reject')
    setMessage(null)
    try {
      await rejectGroundedPlanningDraft(plan.id, draft.draft_id, {
        expected_revision: plan.revision,
      })
      setDraft(null)
      setState('rejected')
      setMessageKind('status')
      setMessage('Draft rejected. The collaborative plan was not changed.')
    } catch (error) {
      if (groundedPlanningErrorStatus(error) === 409) {
        setState('stale')
        setDraftNeedsRegeneration(true)
        setMessageKind('error')
        setMessage(null)
      } else {
        setState('provider-unavailable')
        setMessageKind('error')
        setMessage(error instanceof Error ? error.message : null)
      }
    } finally {
      setPendingAction(null)
    }
  }

  const refreshPlan = async () => {
    setPendingAction('refresh')
    setMessage(null)
    const refreshedPlan = await onRefreshPlan()
    setPendingAction(null)
    if (!refreshedPlan) {
      setMessageKind('error')
      setMessage(
        'The latest shared plan could not be loaded. Your draft is still available.',
      )
      return
    }
    setState('ready')
    setMessageKind('status')
    setMessage(
      draft
        ? 'Latest shared plan loaded. The prior draft is preserved for reference; generate a new draft before applying content.'
        : 'Latest shared plan loaded. You can generate a new grounded draft.',
    )
  }

  const showDraft =
    draft &&
    (state === 'draft' ||
      state === 'stale' ||
      state === 'provider-unavailable' ||
      state === 'policy-blocked' ||
      state === 'generating' ||
      draftNeedsRegeneration)
  const draftRevisionChanged =
    draft !== null && draft.plan_revision !== plan.revision
  const requiresRegeneration = draftNeedsRegeneration || draftRevisionChanged
  const isPending = pendingAction !== null

  return (
    <section
      className={`planning-assist is-${state}`}
      data-testid="grounded-planning-assist"
      aria-label="Planning assist review"
      aria-busy={isPending}
    >
      <header>
        <div>
          <h4>
            <Sparkles size={15} /> Planning assist — review required
          </h4>
          <p>
            Evidence and synthesis stay separate. Nothing is applied until you
            select content and confirm.
          </p>
        </div>
        <strong>Human review required</strong>
      </header>

      {state === 'loading' && (
        <div className="planning-assist-state" role="status">
          <LoaderCircle className="spin" size={17} /> Checking configured
          provider boundary
        </div>
      )}

      {state === 'disabled' && (
        <div
          className="planning-assist-state"
          data-testid="planning-assist-disabled"
        >
          <AlertTriangle size={17} />
          <span>
            Planning assist is disabled or unconfigured. Shared planning remains
            available without it.
          </span>
        </div>
      )}

      {(state === 'ready' ||
        state === 'draft' ||
        state === 'rejected' ||
        state === 'applied' ||
        state === 'provider-unavailable' ||
        state === 'policy-blocked' ||
        state === 'stale') && (
        <>
          {(message || state !== 'ready') && (
            <div
              className="planning-assist-state"
              role={
                messageKind === 'error' ||
                state === 'stale' ||
                state === 'policy-blocked' ||
                state === 'provider-unavailable'
                  ? 'alert'
                  : 'status'
              }
            >
              {state === 'applied' ? (
                <CheckCircle2 size={17} />
              ) : state === 'rejected' ? (
                <XCircle size={17} />
              ) : (
                <AlertTriangle size={17} />
              )}
              <span>
                {message ??
                  (state === 'stale'
                    ? 'The plan revision changed. Refresh the shared plan before generating or applying.'
                    : state === 'policy-blocked'
                      ? 'The provider output failed citation or policy checks and cannot be applied.'
                      : 'The configured provider is unavailable. Retry without changing the local plan.')}
              </span>
              {state === 'stale' && (
                <button
                  type="button"
                  onClick={() => void refreshPlan()}
                  disabled={isPending}
                >
                  <RefreshCw size={15} /> Refresh shared plan
                </button>
              )}
            </div>
          )}
          <div className="planning-assist-controls">
            <label>
              Controlled operation
              <select
                value={operation}
                disabled={isPending}
                onChange={(event) =>
                  setOperation(event.target.value as GroundedPlanningOperation)
                }
              >
                <option value="identify_gaps">Identify evidence gaps</option>
                <option value="draft_actions">Draft review actions</option>
                <option value="summarize_evidence">Summarize evidence</option>
              </select>
            </label>
            <label>
              Draft style
              <select
                value={style}
                disabled={isPending}
                onChange={(event) =>
                  setStyle(event.target.value as GroundedPlanningStyle)
                }
              >
                <option value="concise">Concise</option>
                <option value="structured">Structured</option>
              </select>
            </label>
            <button
              type="button"
              disabled={!canWrite || isPending || state === 'stale'}
              onClick={generate}
            >
              <RefreshCw size={15} /> Generate grounded draft
            </button>
          </div>
        </>
      )}

      {state === 'generating' && (
        <div className="planning-assist-state" role="status">
          <LoaderCircle className="spin" size={17} />
          {pendingAction === 'apply'
            ? 'Applying the selected content as a reviewed plan version'
            : pendingAction === 'reject'
              ? 'Rejecting the draft without changing the plan'
              : 'Validating bounded evidence, citations, and policy'}
        </div>
      )}

      {showDraft && (
        <div className="planning-assist-draft">
          <div className="planning-assist-label">
            <strong>AI synthesis</strong>
            <span>
              {draft.provider_class} · policy {draft.model_policy_version}
            </span>
          </div>
          {requiresRegeneration && (
            <div className="planning-assist-stale-draft" role="status">
              Preserved prior-revision draft. Generate again before selecting or
              applying content.
            </div>
          )}
          {draft.sections.map((section) => (
            <label className="planning-assist-selection" key={section.id}>
              <input
                type="checkbox"
                disabled={
                  isPending || state === 'stale' || requiresRegeneration
                }
                checked={selectedSections.includes(section.id)}
                onChange={(event) =>
                  setSelectedSections((current) =>
                    event.target.checked
                      ? [...current, section.id]
                      : current.filter((id) => id !== section.id),
                  )
                }
              />
              <span>
                <strong>{section.heading}</strong>
                {section.claims.map((claim) => (
                  <p key={claim.text}>
                    {claim.text}{' '}
                    <small>
                      {claim.citations.map((id) => `[${id}]`).join(' ')}
                    </small>
                  </p>
                ))}
              </span>
            </label>
          ))}
          {draft.actions.map((action) => (
            <label className="planning-assist-selection" key={action.id}>
              <input
                type="checkbox"
                disabled={
                  isPending || state === 'stale' || requiresRegeneration
                }
                checked={selectedActions.includes(action.id)}
                onChange={(event) =>
                  setSelectedActions((current) =>
                    event.target.checked
                      ? [...current, action.id]
                      : current.filter((id) => id !== action.id),
                  )
                }
              />
              <span>
                <strong>Draft action</strong>
                <p>
                  {action.text}{' '}
                  <small>
                    {action.citations.map((id) => `[${id}]`).join(' ')}
                  </small>
                </p>
              </span>
            </label>
          ))}
          <details className="planning-assist-citations">
            <summary>
              <ChevronDown size={15} /> Evidence citations
            </summary>
            <ul>
              {[...citations.values()].map((citation) => (
                <li key={citation.source_id}>
                  <a href={citation.url} target="_blank" rel="noreferrer">
                    {citation.source_id}
                  </a>
                  <span>{citation.authority}</span>
                  <small>Freshness: {citation.freshness}</small>
                </li>
              ))}
            </ul>
          </details>
          <div className="planning-assist-gaps">
            <strong>Uncertainty and explicit gaps</strong>
            <ul>
              {[...draft.uncertainty, ...draft.gaps].map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="planning-assist-actions">
            <button
              type="button"
              onClick={reject}
              disabled={isPending || state === 'stale' || requiresRegeneration}
            >
              <XCircle size={15} /> Reject draft
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={
                isPending ||
                state === 'stale' ||
                requiresRegeneration ||
                selectedSections.length + selectedActions.length === 0
              }
            >
              <FileCheck2 size={15} /> Apply selected content
            </button>
          </div>
        </div>
      )}
      {status?.human_review_required && (
        <small className="planning-assist-footnote">
          Generation never changes the plan, records approval, or activates a
          partner.
        </small>
      )}
    </section>
  )
}
