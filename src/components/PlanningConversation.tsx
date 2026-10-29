import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Check, MessageSquare, X } from 'lucide-react'
import { EvidenceExchange } from './EvidenceExchange'
import {
  answerClaim,
  claimQuestion,
  interpretPlanningPrompt,
  planningPrompts,
  proposedTiming,
  startClaim,
  validatedChatClaim,
} from '../lib/planning-conversation'
import type { ClaimDraft, PlanningPrompt } from '../lib/planning-conversation'
import {
  contributionState,
  evaluatePlanningEvidence,
  evidenceKinds,
  evidenceStateLabels,
  maxContributions,
} from '../lib/planning-evidence'
import type {
  EvidenceScenario,
  PlanningContribution,
} from '../lib/planning-evidence'
import {
  caseChecks,
  evaluateTiming,
  residentDraft,
  timingFields,
} from '../lib/waianae-case'
import type { PreparedChecks, TimingInputs } from '../lib/waianae-case'

type View =
  'needs' | 'timing' | 'claims' | 'county' | 'resident' | 'exchange' | 'map'
type Pending =
  | { type: 'claim'; draft: ClaimDraft; baseline: string; revision: string }
  | { type: 'timing-field' }
  | { type: 'timing-value'; field: string }
  | { type: 'timing-confirm'; timing: TimingInputs; baseline: string }
  | { type: 'claim-action'; id: string; remove: boolean; baseline: string }
type Turn = { id: number; user: string; reply: string }
const initialPrompts: PlanningPrompt[] = [
  'What does the plan still need?',
  'Change the planning window',
  'Add transport evidence',
]
const targetPrompts: Partial<Record<PlanningPrompt, string>> = {
  'Add transport evidence': 'vehicle-a',
  'Add power evidence': 'equipment-a',
  'Add receiving evidence': 'site-a',
  'Add H1 evidence': 'H1',
  'Add H2 evidence': 'H2',
}

export function PlanningConversation({
  scenario,
  contributions,
  timing,
  checks,
  now,
  ready,
  active,
  canDownload,
  onTiming,
  onChange,
  onChecks,
  onMapAnchor,
  onDownload,
  onDetails,
}: {
  scenario: EvidenceScenario
  contributions: PlanningContribution[]
  timing: TimingInputs
  checks: PreparedChecks
  now: number
  ready: boolean
  active: boolean
  canDownload: boolean
  onTiming: (next: TimingInputs) => void
  onChange: (items: PlanningContribution[], message: string) => void
  onChecks: (next: PreparedChecks) => void
  onMapAnchor: (anchor: string) => void
  onDownload: () => void
  onDetails: () => void
}) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [view, setView] = useState<View | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [trimmed, setTrimmed] = useState(false)
  const serial = useRef(0)
  const latest = useRef<HTMLDivElement>(null)
  const proposalHeading = useRef<HTMLHeadingElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const insights = evaluatePlanningEvidence(scenario, contributions, now)
  const { result } = evaluateTiming(timing)
  const question =
    pending?.type === 'claim' ? claimQuestion(pending.draft, scenario) : null
  const baseline = JSON.stringify(contributions)
  const proposedClaim =
    pending?.type === 'claim' && !question
      ? validatedChatClaim(pending.draft, scenario, 'E-preview')
      : null
  const projected = proposedClaim
    ? evaluatePlanningEvidence(
        scenario,
        [...contributions, proposedClaim],
        Math.max(now, Date.now()),
      ).find((item) => item.targetId === proposedClaim.targetId)
    : null

  useEffect(() => {
    const scroll = viewport.current
    const response = latest.current
    if (active && turns.length > 0 && scroll && response)
      scroll.scrollTo({
        top:
          scroll.scrollTop +
          response.getBoundingClientRect().top -
          scroll.getBoundingClientRect().top -
          16,
        behavior: 'instant',
      })
  }, [active, turns.at(-1)?.id, pending, view])

  useEffect(() => {
    if (!active) return
    if (pending?.type === 'claim' && question)
      composer.current?.focus({ preventScroll: true })
    else if (pending) proposalHeading.current?.focus({ preventScroll: true })
  }, [active, pending, question?.label])

  function record(user: string, reply: string) {
    if (turns.length >= 24) setTrimmed(true)
    const turn = { id: ++serial.current, user, reply }
    setTurns((previous) => [...previous.slice(-23), turn])
    setError('')
    setInput('')
  }
  function cancel() {
    setPending(null)
    record('Cancel proposal', 'Canceled. No planning data changed.')
    composer.current?.focus()
  }
  function timingProposal(field: string, value: string) {
    const proposal = proposedTiming(timing, field, value)
    if ('error' in proposal) {
      setInput('')
      setError(proposal.error)
      return
    }
    setPending({
      type: 'timing-confirm',
      timing: proposal.timing,
      baseline: JSON.stringify(timing),
    })
    setView(null)
    record(
      'Propose a timing change',
      'Review the complete exercise window below. Nothing changes until you apply it.',
    )
  }
  function ask(prompt: PlanningPrompt) {
    if (!ready) return
    setPending(null)
    const targetId = targetPrompts[prompt]
    if (targetId) {
      if (!result) {
        setError(
          'Correct the timing in the detailed workspace before adding a claim.',
        )
        return
      }
      if (contributions.length >= maxContributions) {
        setError(
          `The exercise already has ${maxContributions} claims. Remove one before adding another.`,
        )
        return
      }
      setPending({
        type: 'claim',
        draft: startClaim(targetId, scenario),
        baseline,
        revision: scenario.modelRevision,
      })
      if (targetId === 'H1' || targetId === 'H2') onMapAnchor(targetId)
      setView(null)
      record(
        prompt,
        'Let’s build one local claim, one answer at a time. Unknowns stay unknown. I’ll ask for its basis, source category and observation time before you review it.',
      )
      return
    }
    const replies: Partial<Record<PlanningPrompt, [View, string]>> = {
      'What does the plan still need?': [
        'needs',
        'Here is the current evidence and the next County question for each need. This is a rule-based review, not operational approval.',
      ],
      'Review local claims': [
        'claims',
        'These are the current local reports. Setting one aside changes the working analysis; it does not decide which report is true.',
      ],
      'Prepare County review': [
        'county',
        'Prepare questions across all five CMIST needs. Marking a question prepared does not answer it or assign a team.',
      ],
      'Draft a resident message': [
        'resident',
        'This fixed exercise draft makes no pickup, route or destination promise. It is not an alert and must not be sent without County review.',
      ],
      'Exchange evidence': [
        'exchange',
        'You can review a file before applying it, or export local claims. This is a manual handoff, not authenticated team synchronization.',
      ],
    }
    if (prompt === 'Change the planning window') {
      setPending({ type: 'timing-field' })
      setView('timing')
      record(
        prompt,
        'Which exercise assumption would you like to change? You’ll review the result before applying it.',
      )
    } else if (
      prompt === 'Show H1 on the map' ||
      prompt === 'Show H2 on the map'
    ) {
      onMapAnchor(prompt.includes('H1') ? 'H1' : 'H2')
      setView('map')
      record(
        prompt,
        'The map highlights the selected hypothetical access concern. It is not an official closure, predicted failure or safe-route assessment.',
      )
    } else {
      const response = replies[prompt]
      if (response) {
        setView(response[0])
        record(prompt, response[1])
      }
    }
  }
  function submit(value: string) {
    if (!ready || !value.trim()) return
    if (pending?.type === 'claim' && question) {
      const choice = question.choices.find(
        (item) => item.label.toLowerCase() === value.trim().toLowerCase(),
      )
      const answer = answerClaim(
        pending.draft,
        scenario,
        choice?.value ?? value,
        Date.now(),
      )
      if ('error' in answer) {
        setInput('')
        setError(answer.error)
        return
      }
      setPending({ ...pending, draft: answer.draft })
      record(
        answer.label,
        claimQuestion(answer.draft, scenario)
          ? 'Noted for the proposal only.'
          : 'Review this proposed claim and its projected effect. No claim has been saved yet.',
      )
      return
    }
    if (pending?.type === 'timing-value') {
      timingProposal(pending.field, value.trim())
      return
    }
    if (pending) {
      setInput('')
      setError(
        'Use the proposal controls below, or Cancel proposal, before starting another request.',
      )
      return
    }
    const intent = interpretPlanningPrompt(value)
    if (!intent) {
      setInput('')
      setError(
        'This local prototype is not a general AI chat. Your text was not retained or sent. Choose a suggested question, or try “What if the storm arrives in 12 hours?”',
      )
      return
    }
    if ('arrival' in intent) timingProposal('arrival', intent.arrival)
    else ask(intent.prompt)
  }
  function confirm() {
    if (!pending) return
    if (pending.type === 'timing-confirm') {
      if (pending.baseline !== JSON.stringify(timing)) {
        setError(
          'Timing changed since this proposal. Cancel and review a new proposal. Nothing changed.',
        )
        return
      }
      onTiming(pending.timing)
      setView('timing')
      record(
        'Apply timing change',
        'Exercise assumptions updated. Previous agenda preparation cleared; review the timing and equipment-power criteria again.',
      )
    } else if (pending.type === 'claim' && proposedClaim) {
      if (
        pending.baseline !== baseline ||
        pending.revision !== scenario.modelRevision ||
        !result ||
        contributions.length >= maxContributions
      ) {
        setError(
          'Working evidence or timing changed. Cancel and start a fresh proposal. Nothing changed.',
        )
        return
      }
      const item = validatedChatClaim(
        pending.draft,
        scenario,
        `E-${crypto.randomUUID().slice(0, 8)}`,
      )
      if (!item || Date.parse(item.observedAt) > Date.now()) {
        setError(
          'The claim could not be validated. Cancel and review the observation time.',
        )
        return
      }
      onChange(
        [...contributions, item],
        `Added local claim ${item.id}. Previous agenda preparation cleared.`,
      )
      setView('needs')
      record(
        'Apply local claim',
        'The unverified claim is now in the working evidence. Review its effect below; no resource was confirmed or assigned.',
      )
    } else if (pending.type === 'claim-action') {
      if (pending.baseline !== baseline) {
        setError(
          'Working evidence changed. Cancel and review the claims again. Nothing changed.',
        )
        return
      }
      const item = contributions.find((entry) => entry.id === pending.id)
      if (!item) {
        setError(
          'This claim no longer exists. Cancel and review the working claims.',
        )
        return
      }
      onChange(
        pending.remove
          ? contributions.filter((entry) => entry.id !== item.id)
          : contributions.map((entry) =>
              entry.id === item.id
                ? { ...entry, suppressed: !entry.suppressed }
                : entry,
            ),
        'Local working set changed. Previous agenda preparation cleared.',
      )
      setView('claims')
      record(
        pending.remove
          ? 'Remove local claim'
          : item.suppressed
            ? 'Reinstate local claim'
            : 'Set aside local claim',
        'The working set changed. No report was verified and no operational approval was granted.',
      )
    } else return
    setPending(null)
    composer.current?.focus()
  }
  function timingSummary(value: TimingInputs) {
    const evaluation = evaluateTiming(value).result
    return (
      <div className="conversation-timing">
        <dl>
          {timingFields.map((field) => (
            <div key={field.id}>
              <dt>{field.label}</dt>
              <dd>{value[field.id]}h</dd>
            </div>
          ))}
        </dl>
        {evaluation ? (
          <p>
            <strong>
              {evaluation.margin > 0
                ? `${evaluation.margin}h exercise planning margin`
                : 'Exercise window exhausted'}
            </strong>
            <br />
            {evaluation.accessWindow}h access window −{' '}
            {evaluation.mobilise + evaluation.travel + evaluation.buffer}h
            preparation. Not a safe-departure deadline; County approval and
            current conditions remain required.
          </p>
        ) : (
          <p role="alert">
            Timing is invalid. No margin or evidence conclusions can be used
            until corrected.
          </p>
        )}
      </div>
    )
  }
  function needs() {
    return result ? (
      <ul className="conversation-needs">
        {insights.map((item) => (
          <li
            key={item.id}
            data-testid={`chat-insight-${item.id}`}
            data-state={item.state}
          >
            <h3>{item.label}</h3>
            <strong className={`conversation-state state-${item.state}`}>
              {evidenceStateLabels[item.state]}
            </strong>
            <p>{item.action}</p>
            <details>
              <summary>Why this result</summary>
              <ul>
                {item.criteria.map((criterion) => (
                  <li key={criterion.field}>
                    {criterion.description}: <strong>{criterion.state}</strong>
                  </li>
                ))}
              </ul>
              <p>
                Eligible evidence: {item.evidenceIds.join(', ') || 'none'}.
                Excluded: {item.excluded}. Assumptions not used:{' '}
                {item.assumptionsNotUsed}.
              </p>
            </details>
          </li>
        ))}
      </ul>
    ) : (
      <p role="alert">
        Correct invalid timing in the detailed workspace before using evidence
        conclusions.
      </p>
    )
  }

  return (
    <div className="planning-conversation">
      <header className="conversation-header">
        <div>
          <MessageSquare size={19} aria-hidden="true" />
          <h2>Plan with the evidence</h2>
        </div>
        <span>Local planning guide · not a live AI model</span>
      </header>
      <div
        className="conversation-scroll"
        ref={viewport}
        role="region"
        tabIndex={0}
        aria-label="Planning conversation"
      >
        <div className="conversation-welcome">
          <p>
            Let’s get Kupuna A’s assistance plan ready before access is lost.
          </p>
          <p>
            The exercise assumes two passengers, assisted boarding and
            power-dependent equipment. Ask what’s missing, try a timing change,
            or bring in a report.
          </p>
          <small>
            Fictional practice only. County leads; team availability, assignment
            and activation are unconfirmed.
          </small>
        </div>
        {trimmed && (
          <p className="conversation-note">
            Earlier conversation turns were cleared to keep this local session
            bounded. Saved evidence is unchanged.
          </p>
        )}
        <div
          role="log"
          aria-label="Conversation messages"
          aria-live="polite"
          aria-relevant="additions"
        >
          {turns.map((turn) => (
            <div className="conversation-turn" key={turn.id}>
              <p className="conversation-user">
                <span className="sr-only">You: </span>
                {turn.user}
              </p>
              <p className="conversation-reply">
                <span className="sr-only">Planning guide: </span>
                {turn.reply}
              </p>
            </div>
          ))}
        </div>
        <div ref={latest} className="conversation-response">
          {pending?.type === 'claim' && question && (
            <section
              aria-label="Proposed claim interview"
              className="conversation-question"
            >
              <span>
                {
                  scenario.targets.find(
                    (item) => item.id === pending.draft.targetId,
                  )?.label
                }
              </span>
              <h3 id="conversation-question-label" role="status">
                {question.label}
              </h3>
              <p>{question.hint}</p>
              <div className="conversation-choices">
                {question.choices.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    onClick={() => submit(choice.value)}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </section>
          )}
          {pending?.type === 'claim' && !question && proposedClaim && (
            <section
              className="conversation-proposal"
              aria-label="Review proposed claim"
            >
              <h3 ref={proposalHeading} tabIndex={-1}>
                Review before applying
              </h3>
              <p>
                {
                  scenario.targets.find(
                    (item) => item.id === proposedClaim.targetId,
                  )?.label
                }
              </p>
              <dl>
                {evidenceKinds[proposedClaim.kind].fields.map((field) => (
                  <div key={field.id}>
                    <dt>{field.label}</dt>
                    <dd>
                      {field.choices?.find(
                        (choice) =>
                          choice.value === proposedClaim.values[field.id],
                      )?.label ?? proposedClaim.values[field.id]}
                    </dd>
                  </div>
                ))}
                <div>
                  <dt>Basis</dt>
                  <dd>{proposedClaim.basis} · unverified</dd>
                </div>
                <div>
                  <dt>Source category</dt>
                  <dd>{proposedClaim.sourceRole} · author-entered</dd>
                </div>
                <div>
                  <dt>Observed</dt>
                  <dd>{proposedClaim.observedAt}</dd>
                </div>
                <div>
                  <dt>Review interval</dt>
                  <dd>{proposedClaim.validForHours}h</dd>
                </div>
              </dl>
              {projected && (
                <p>
                  Projected result:{' '}
                  <strong>{evidenceStateLabels[projected.state]}</strong>. No
                  claims have changed. This does not confirm availability or
                  permission to move.
                </p>
              )}
              <button type="button" className="case-primary" onClick={confirm}>
                Apply local claim
              </button>
            </section>
          )}
          {pending?.type === 'timing-field' && (
            <section
              className="conversation-question"
              aria-label="Choose timing assumption"
            >
              <h3>Which assumption should change?</h3>
              <div className="conversation-choices">
                {timingFields.map((field) => (
                  <button
                    key={field.id}
                    type="button"
                    onClick={() => {
                      setPending({ type: 'timing-value', field: field.id })
                      record(
                        field.label,
                        `Enter whole hours from ${field.min} to ${field.max}. Current assumption: ${timing[field.id]}h.`,
                      )
                      composer.current?.focus()
                    }}
                  >
                    {field.label}
                  </button>
                ))}
              </div>
            </section>
          )}
          {pending?.type === 'timing-value' && (
            <p className="conversation-question">
              Type the new number of hours below. This changes an exercise
              assumption only.
            </p>
          )}
          {pending?.type === 'timing-confirm' && (
            <section
              className="conversation-proposal"
              aria-label="Review proposed timing"
            >
              <h3 ref={proposalHeading} tabIndex={-1}>
                Proposed exercise window
              </h3>
              {timingSummary(pending.timing)}
              <p>
                No assumptions changed yet. Applying clears previous agenda
                preparation and re-evaluates power continuity.
              </p>
              <button type="button" className="case-primary" onClick={confirm}>
                Apply timing change
              </button>
            </section>
          )}
          {pending?.type === 'claim-action' && (
            <section
              className="conversation-proposal"
              aria-label="Review working-set change"
            >
              <h3 ref={proposalHeading} tabIndex={-1}>
                {pending.remove
                  ? 'Remove this local claim?'
                  : 'Change this claim’s working-set status?'}
              </h3>
              <p>
                {pending.id}. This clears previous agenda preparation.{' '}
                {pending.remove
                  ? 'Removal cannot be undone here.'
                  : 'Excluded claims remain traceable and can be reinstated.'}{' '}
                Nothing changes until you confirm.
              </p>
              <button type="button" className="case-primary" onClick={confirm}>
                Confirm claim change
              </button>
            </section>
          )}
          {pending && (
            <button
              className="conversation-cancel"
              type="button"
              onClick={cancel}
            >
              <X size={15} />
              Cancel proposal
            </button>
          )}
          {!pending && view === 'needs' && (
            <section aria-label="Current evidence review">
              <h3>What the plan still needs</h3>
              {needs()}
            </section>
          )}
          {!pending && view === 'timing' && (
            <section aria-label="Current exercise timing">
              <h3>Current exercise window</h3>
              {timingSummary(timing)}
            </section>
          )}
          {!pending && view === 'map' && (
            <a href="#case-map-title">
              View the highlighted concern on the map
            </a>
          )}
          {!pending && view === 'claims' && (
            <section aria-label="Local working claims">
              <h3>
                Local claims · {contributions.length}/{maxContributions}
              </h3>
              {!contributions.length && (
                <p>
                  No local claims yet. Start with transport, power, receiving
                  support or an access concern.
                </p>
              )}
              <ul className="conversation-claims">
                {contributions.map((item) => (
                  <li key={item.id}>
                    <strong>
                      {
                        scenario.targets.find(
                          (target) => target.id === item.targetId,
                        )?.label
                      }
                    </strong>
                    <p>
                      {item.id} · {contributionState(item, scenario, now)} ·{' '}
                      {item.basis}
                      <br />
                      {item.sourceRole} · observed {item.observedAt} · review{' '}
                      {item.validForHours}h
                    </p>
                    <dl>
                      {evidenceKinds[item.kind].fields.map((field) => (
                        <div key={field.id}>
                          <dt>{field.label}</dt>
                          <dd>{item.values[field.id]}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="conversation-choices">
                      <button
                        type="button"
                        onClick={() => {
                          setPending({
                            type: 'claim-action',
                            id: item.id,
                            remove: false,
                            baseline,
                          })
                          setError('')
                        }}
                      >
                        {item.suppressed ? 'Reinstate' : 'Set aside'} {item.id}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPending({
                            type: 'claim-action',
                            id: item.id,
                            remove: true,
                            baseline,
                          })
                          setError('')
                        }}
                      >
                        Remove {item.id}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={onDetails}>
                Edit claims in detailed workspace
              </button>
            </section>
          )}
          {!pending && view === 'county' && (
            <section aria-label="County review agenda">
              <h3>Five needs. Accountable questions.</h3>
              <p>
                Honolulu County leads; State ESF6 supports. Specialist help,
                transport and destination acceptance still need verification.
              </p>
              <ul className="conversation-needs">
                {caseChecks.map((check) => (
                  <li key={check.id}>
                    <h3>{check.name}</h3>
                    <p>{check.question}</p>
                    <button
                      type="button"
                      disabled={!result}
                      aria-pressed={checks[check.id]}
                      onClick={() =>
                        onChecks({ ...checks, [check.id]: !checks[check.id] })
                      }
                    >
                      {checks[check.id] && <Check size={15} />}
                      {checks[check.id]
                        ? `Unprepare ${check.name} question`
                        : `Prepare ${check.name} question`}
                    </button>
                    {checks[check.id] && (
                      <small>Question prepared; answer unresolved.</small>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!pending && view === 'resident' && (
            <section aria-label="Unsent resident draft">
              <h3>Resident draft · not sent</h3>
              <pre className="case-resident-draft">{residentDraft}</pre>
              <p>
                County review, human-reviewed translation and accessible/offline
                formats remain required. No inputs were sent to an AI provider.
              </p>
              <button
                type="button"
                className="case-primary"
                onClick={onDownload}
                disabled={!canDownload}
              >
                Download request for review
              </button>
              {!canDownload && (
                <p>
                  Valid timing and loaded source evidence are required before
                  export. Review source status on the map.
                </p>
              )}
            </section>
          )}
          {!pending && view === 'exchange' && (
            <EvidenceExchange
              key="chat-exchange"
              scenario={scenario}
              contributions={contributions}
              now={now}
              timingValid={Boolean(result)}
              onChange={onChange}
              initiallyOpen
            />
          )}
        </div>
        {!pending && (
          <div
            className="conversation-suggestions"
            aria-label="Suggested planning questions"
          >
            {initialPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={!ready}
                onClick={() => ask(prompt)}
              >
                {prompt}
              </button>
            ))}
            <details>
              <summary>More planning questions</summary>
              <div className="conversation-choices">
                {planningPrompts
                  .filter((prompt) => !initialPrompts.includes(prompt))
                  .map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      disabled={!ready}
                      onClick={() => ask(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
              </div>
            </details>
          </div>
        )}
      </div>
      <form
        className="conversation-composer"
        onSubmit={(event) => {
          event.preventDefault()
          submit(input)
        }}
      >
        {error && (
          <p role="alert" id="conversation-error">
            {error}
          </p>
        )}
        <label htmlFor="planning-message">Your planning question</label>
        <div>
          <textarea
            ref={composer}
            id="planning-message"
            value={input}
            rows={2}
            maxLength={256}
            disabled={!ready}
            placeholder={
              question
                ? 'Answer this question…'
                : 'Ask about the plan, or try a timing change…'
            }
            aria-describedby={`conversation-privacy${question ? ' conversation-question-label' : ''}${error ? ' conversation-error' : ''}`}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault()
                submit(input)
              }
            }}
          />
          <button
            type="submit"
            className="case-primary"
            aria-label="Send planning message"
            disabled={!ready || !input.trim()}
          >
            <ArrowUp size={19} />
          </button>
        </div>
        <div className="conversation-composer-note">
          <small id="conversation-privacy">
            Local, rule-based prototype. No general AI. Do not enter personal
            data. Conversation is not saved or sent.
          </small>
          {turns.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setTurns([])
                setView(null)
                setPending(null)
                setError('')
                setInput('')
                setTrimmed(false)
              }}
            >
              Clear conversation
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
