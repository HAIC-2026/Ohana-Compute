import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  contributionState,
  evaluatePlanningEvidence,
  evidenceKinds,
  evidenceRoles,
  evidenceStateLabels,
  maxContributions,
  parseContribution,
  validityHours,
} from '../lib/planning-evidence'
import type {
  EvidenceScenario,
  EvidenceTarget,
  PlanningContribution,
} from '../lib/planning-evidence'

function localMinute(now: number) {
  const date = new Date(now)
  return new Date(now - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
}

function unknownValues(target: EvidenceTarget) {
  return Object.fromEntries(
    evidenceKinds[target.kind].fields.map((field) => [field.id, 'unknown']),
  )
}

export function PlanningEvidencePanel({
  scenario,
  contributions,
  now,
  timingValid,
  onChange,
  onMapAnchor,
}: {
  scenario: EvidenceScenario
  contributions: PlanningContribution[]
  now: number
  timingValid: boolean
  onChange: (items: PlanningContribution[], message: string) => void
  onMapAnchor: (anchor: string) => void
}) {
  const [targetId, setTargetId] = useState(scenario.targets[0].id)
  const [values, setValues] = useState<Record<string, string>>(
    unknownValues(scenario.targets[0]),
  )
  const [basis, setBasis] = useState('assumption')
  const [sourceRole, setSourceRole] = useState('')
  const [observed, setObserved] = useState(() => localMinute(now))
  const [validity, setValidity] = useState('6')
  const [editing, setEditing] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})
  const target = scenario.targets.find((item) => item.id === targetId)!
  const insights = evaluatePlanningEvidence(scenario, contributions, now)

  function clearError(key: string) {
    setErrors((previous) => {
      const next = { ...previous }
      delete next[key]
      return next
    })
  }

  function chooseTarget(next: EvidenceTarget) {
    setTargetId(next.id)
    setValues(unknownValues(next))
    setErrors({})
    setEditing(null)
    if (next.mapAnchor) onMapAnchor(next.mapAnchor)
  }

  function edit(item: PlanningContribution) {
    setTargetId(item.targetId)
    setValues(item.values)
    setBasis(item.basis)
    setSourceRole(item.sourceRole)
    setObserved(localMinute(Date.parse(item.observedAt)))
    setValidity(String(item.validForHours))
    setEditing(item.id)
    setErrors({})
    setFormOpen(true)
    requestAnimationFrame(() =>
      document
        .getElementById('evidence-editor')
        ?.scrollIntoView({ block: 'start' }),
    )
  }

  function save(event: FormEvent) {
    event.preventDefault()
    const nextErrors: Partial<Record<string, string>> = {}
    const time = new Date(observed).getTime()
    if (!sourceRole)
      nextErrors.source =
        'Select the source category. It is not a verified identity.'
    if (!Number.isFinite(time))
      nextErrors.observed = 'Enter the observation date and time.'
    else if (time > Date.now())
      nextErrors.observed = 'Observation time cannot be in the future.'
    for (const field of evidenceKinds[target.kind].fields) {
      const value = values[field.id]
      if (
        !field.choices &&
        value !== 'unknown' &&
        value !== '' &&
        (!/^\d+$/.test(value) || Number(value) > (field.max ?? 0))
      )
        nextErrors[field.id] =
          `Enter a whole number from 0 to ${field.max}, or leave blank for unknown.`
    }
    if (!editing && contributions.length >= maxContributions)
      nextErrors.form = `This local exercise supports ${maxContributions} reports. Remove a report before adding another.`
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>('#evidence-editor [aria-invalid="true"]')
          ?.focus(),
      )
      return
    }
    const item = parseContribution(
      {
        id: editing ?? `E-${crypto.randomUUID().slice(0, 8)}`,
        scenarioId: scenario.id,
        targetId: target.id,
        kind: target.kind,
        basis,
        sourceRole,
        observedAt: new Date(time).toISOString(),
        validForHours: Number(validity),
        values: Object.fromEntries(
          Object.entries(values).map(([key, value]) => [
            key,
            value || 'unknown',
          ]),
        ),
        suppressed:
          contributions.find((entry) => entry.id === editing)?.suppressed ??
          false,
      },
      scenario,
    )
    if (!item) {
      setErrors({
        form: 'This report could not be validated. Review the controlled fields before saving.',
      })
      return
    }
    onChange(
      editing
        ? contributions.map((entry) => (entry.id === editing ? item : entry))
        : [...contributions, item],
      `${editing ? 'Updated' : 'Added'} local claim ${item.id}. Previous agenda preparation cleared; review the changed evidence.`,
    )
    setEditing(null)
    setValues(unknownValues(target))
    setErrors({})
    setFormOpen(false)
  }

  return (
    <div className="planning-evidence">
      <h2>Add evidence. See what the plan still needs.</h2>
      <p>
        Structured claims for this fictional transfer—not a person registry. No
        names, addresses, contacts, medical records, links or coordinates. These
        entries stay in this browser; they are not synchronized team records.
      </p>
      <div className="case-boundary">
        <strong>Deterministic review · never automatic clearance</strong>
        <p>
          Reports are author-entered and unverified. Unknown is not zero or
          safe. Even complete reported criteria remain a County review
          checklist—not confirmed transport, an open shelter, road clearance or
          permission to move.
        </p>
      </div>
      <details
        className="case-disclosure evidence-editor"
        open={formOpen}
        onToggle={(event) => setFormOpen(event.currentTarget.open)}
      >
        <summary>
          {editing
            ? `Edit local claim ${editing}`
            : 'Add a local planning claim'}
        </summary>
        <form id="evidence-editor" onSubmit={save} noValidate>
          <div className="case-inputs">
            <label>
              <span id="evidence-target-label">Planning subject</span>
              <select
                aria-labelledby="evidence-target-label"
                value={targetId}
                onChange={(event) => {
                  const next = scenario.targets.find(
                    (item) => item.id === event.target.value,
                  )
                  if (next) chooseTarget(next)
                }}
              >
                {scenario.targets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span id="evidence-basis-label">Claim basis</span>
              <select
                aria-labelledby="evidence-basis-label"
                value={basis}
                onChange={(event) => setBasis(event.target.value)}
              >
                <option value="assumption">Exercise assumption</option>
                <option value="reported">
                  Reported claim · not independently verified
                </option>
              </select>
            </label>
            <label>
              <span id="evidence-source-label">
                Source category (author-entered)
              </span>
              <select
                aria-labelledby="evidence-source-label"
                value={sourceRole}
                onChange={(event) => {
                  setSourceRole(event.target.value)
                  clearError('source')
                }}
                aria-invalid={Boolean(errors.source)}
                aria-describedby={
                  errors.source ? 'evidence-source-error' : undefined
                }
              >
                <option value="">Select a source category</option>
                {evidenceRoles.map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
              {errors.source && (
                <span className="case-error" id="evidence-source-error">
                  {errors.source}
                </span>
              )}
            </label>
            <label>
              <span id="evidence-observed-label">
                Observed at (your local time)
              </span>
              <input
                aria-labelledby="evidence-observed-label"
                type="datetime-local"
                value={observed}
                onChange={(event) => {
                  setObserved(event.target.value)
                  clearError('observed')
                }}
                aria-invalid={Boolean(errors.observed)}
                aria-describedby={
                  errors.observed ? 'evidence-time-error' : undefined
                }
              />
              {errors.observed && (
                <span className="case-error" id="evidence-time-error">
                  {errors.observed}
                </span>
              )}
            </label>
            <label>
              <span id="evidence-validity-label">
                Review interval from observation
              </span>
              <select
                aria-labelledby="evidence-validity-label"
                value={validity}
                onChange={(event) => setValidity(event.target.value)}
              >
                {validityHours.map((hours) => (
                  <option key={hours} value={hours}>
                    {hours} hour{hours === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p>
            Self-selected freshness is a review reminder, not an authority’s
            validity guarantee. Claims expire from analysis at the interval
            boundary.
          </p>
          <fieldset>
            <legend>{evidenceKinds[target.kind].label}</legend>
            <div className="case-inputs">
              {evidenceKinds[target.kind].fields.map((field) => (
                <label key={field.id}>
                  <span id={`evidence-field-${field.id}`}>{field.label}</span>
                  {field.choices ? (
                    <select
                      aria-labelledby={`evidence-field-${field.id}`}
                      value={values[field.id]}
                      onChange={(event) => {
                        setValues({ ...values, [field.id]: event.target.value })
                        clearError(field.id)
                      }}
                    >
                      <option value="unknown">Unknown / not assessed</option>
                      {field.choices.map((choice) => (
                        <option key={choice.value} value={choice.value}>
                          {choice.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      aria-labelledby={`evidence-field-${field.id}`}
                      type="text"
                      inputMode="numeric"
                      placeholder="Unknown / not assessed"
                      value={
                        values[field.id] === 'unknown' ? '' : values[field.id]
                      }
                      onChange={(event) => {
                        setValues({ ...values, [field.id]: event.target.value })
                        clearError(field.id)
                      }}
                      aria-invalid={Boolean(errors[field.id])}
                      aria-describedby={
                        errors[field.id]
                          ? `evidence-${field.id}-error`
                          : undefined
                      }
                    />
                  )}
                  {errors[field.id] && (
                    <span
                      className="case-error"
                      id={`evidence-${field.id}-error`}
                    >
                      {errors[field.id]}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </fieldset>
          {Object.keys(errors).length > 0 && (
            <p role="alert" className="case-error">
              {errors.form ??
                'Resolve the report errors before saving. No claim has been changed.'}
            </p>
          )}
          <div className="case-step-actions">
            <button type="submit" className="case-primary">
              {editing ? 'Update local claim' : 'Save local claim'}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(null)
                  setValues(unknownValues(target))
                  setErrors({})
                  setFormOpen(false)
                }}
              >
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </details>
      <h3>Evidence → next County question</h3>
      {!timingValid ? (
        <p role="alert" className="case-error">
          Resolve timing errors in Before arrival. Evidence analysis is
          withheld; no power-window conclusion is shown.
        </p>
      ) : (
        <ul className="evidence-insights" aria-label="Derived evidence review">
          {insights.map((insight) => (
            <li
              key={insight.id}
              data-testid={`insight-${insight.id}`}
              data-state={insight.state}
            >
              <strong>{insight.label}</strong>
              <span
                className={`evidence-state evidence-state-${insight.state}`}
              >
                {evidenceStateLabels[insight.state]}
              </span>
              <p>{insight.action}</p>
              <details>
                <summary>
                  Why this result · {insight.evidenceIds.length} eligible claim
                  {insight.evidenceIds.length === 1 ? '' : 's'}
                </summary>
                <ul>
                  {insight.criteria.map((criterion) => (
                    <li key={criterion.field}>
                      {criterion.description}:{' '}
                      <strong>{criterion.state}</strong>
                    </li>
                  ))}
                </ul>
                <p>
                  Evidence: {insight.evidenceIds.join(', ') || 'none eligible'}.
                  Excluded stale, future, set-aside or mismatched:{' '}
                  {insight.excluded}. Assumptions set aside in favor of reports:{' '}
                  {insight.assumptionsNotUsed}.
                </p>
              </details>
              <button
                type="button"
                onClick={() => {
                  const next = scenario.targets.find(
                    (item) => item.id === insight.targetId,
                  )
                  if (next) chooseTarget(next)
                  setFormOpen(true)
                  requestAnimationFrame(() =>
                    document
                      .getElementById('evidence-editor')
                      ?.scrollIntoView({ block: 'start' }),
                  )
                }}
              >
                Add evidence for this question
              </button>
            </li>
          ))}
        </ul>
      )}
      <details className="case-disclosure">
        <summary>
          Local claim register · {contributions.length}/{maxContributions}
        </summary>
        <p>
          Different reports are never summed. Current conflicting values are
          shown together, not silently replaced by the newest. Exercise
          assumptions cannot fill unknown fields in a reported claim.
        </p>
        {!contributions.length && (
          <p>
            No claims yet. Missing evidence is not evidence that support is
            unavailable.
          </p>
        )}
        <ul className="evidence-register">
          {contributions.map((item) => (
            <li key={item.id} data-testid="evidence-claim">
              <strong>
                {item.id} ·{' '}
                {
                  scenario.targets.find((entry) => entry.id === item.targetId)
                    ?.label
                }
              </strong>
              <p>
                {item.basis === 'reported'
                  ? 'Reported local claim'
                  : 'Exercise assumption'}{' '}
                · {contributionState(item, scenario, now)}
                <br />
                {item.sourceRole} (author-entered, not authenticated)
                <br />
                Observed {new Date(item.observedAt).toLocaleString()} · review
                interval {item.validForHours}h
              </p>
              <dl>
                {evidenceKinds[item.kind].fields.map((field) => (
                  <div key={field.id}>
                    <dt>{field.label}</dt>
                    <dd>
                      {field.choices?.find(
                        (choice) => choice.value === item.values[field.id],
                      )?.label ?? item.values[field.id]}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="evidence-register-actions">
                <button type="button" onClick={() => edit(item)}>
                  Edit {item.id}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (editing === item.id) {
                      setEditing(null)
                      setValues(unknownValues(target))
                      setFormOpen(false)
                    }
                    onChange(
                      contributions.map((entry) =>
                        entry.id === item.id
                          ? { ...entry, suppressed: !entry.suppressed }
                          : entry,
                      ),
                      `Local claim ${item.id} ${item.suppressed ? 'reinstated' : 'set aside'}. Agenda preparation cleared.`,
                    )
                  }}
                >
                  {item.suppressed ? 'Reinstate' : 'Set aside'} {item.id}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (editing === item.id) {
                      setEditing(null)
                      setValues(unknownValues(target))
                      setFormOpen(false)
                    }
                    onChange(
                      contributions.filter((entry) => entry.id !== item.id),
                      `Removed local claim ${item.id}. Agenda preparation cleared.`,
                    )
                  }}
                >
                  Remove {item.id}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
