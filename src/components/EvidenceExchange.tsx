import { useEffect, useRef, useState } from 'react'
import {
  exportEvidenceBundle,
  maxEvidenceBundleBytes,
  previewEvidenceBundle,
} from '../lib/evidence-bundle'
import {
  contributionState,
  evaluatePlanningEvidence,
  evidenceKinds,
  evidenceStateLabels,
} from '../lib/planning-evidence'
import type {
  EvidenceScenario,
  PlanningContribution,
} from '../lib/planning-evidence'

type Preview = {
  text: string
  baseline: string
  revision: string
  result: ReturnType<typeof previewEvidenceBundle>
}

export function EvidenceExchange({
  scenario,
  contributions,
  now,
  timingValid,
  onChange,
  initiallyOpen = false,
}: {
  scenario: EvidenceScenario
  contributions: PlanningContribution[]
  now: number
  timingValid: boolean
  onChange: (items: PlanningContribution[], message: string) => void
  initiallyOpen?: boolean
}) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const request = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (preview) heading.current?.focus()
  }, [preview])
  useEffect(
    () => () => {
      request.current++
    },
    [],
  )

  function discard() {
    request.current++
    setReading(false)
    setPreview(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  async function read(file: File | undefined) {
    discard()
    setError('')
    setMessage('')
    if (!file) return
    const token = request.current
    setReading(true)
    try {
      if (file.size > maxEvidenceBundleBytes)
        throw new Error('Bundle exceeds the 128 KiB limit. No claims changed.')
      // Fatal UTF-8 decoding rejects corrupt bytes rather than replacing them.
      const text = new TextDecoder('utf-8', { fatal: true }).decode(
        await file.arrayBuffer(),
      )
      if (token !== request.current) return
      const result = previewEvidenceBundle(text, scenario, contributions)
      setPreview({
        text,
        baseline: JSON.stringify(contributions),
        revision: scenario.modelRevision,
        result,
      })
    } catch (reason) {
      if (token === request.current)
        setError(
          reason instanceof Error &&
            reason.message.endsWith('No claims changed.')
            ? reason.message
            : 'Could not read the file as UTF-8 JSON. Choose a valid evidence bundle. No claims changed.',
        )
    } finally {
      if (token === request.current) setReading(false)
    }
  }

  function apply() {
    if (!preview) return
    try {
      if (
        !timingValid ||
        preview.baseline !== JSON.stringify(contributions) ||
        preview.revision !== scenario.modelRevision
      )
        throw new Error(
          'Working evidence or timing changed. Select the bundle again to review. No claims changed.',
        )
      const result = previewEvidenceBundle(
        preview.text,
        scenario,
        contributions,
      )
      if (result.additions.length)
        onChange(
          result.merged,
          `Imported ${result.additions.length} unverified local claims. Agenda preparation cleared; review the changed evidence.`,
        )
      setMessage(
        `${result.additions.length} new claims applied; ${result.duplicates} exact duplicates skipped. No claims were overwritten. Reports remain author-entered and unverified.`,
      )
      discard()
      fileInput.current?.focus()
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Import failed. No claims changed.',
      )
      discard()
    }
  }

  function download() {
    setError('')
    setMessage('')
    try {
      const text = exportEvidenceBundle(scenario, contributions)
      const url = URL.createObjectURL(
        new Blob([text], { type: 'application/json' }),
      )
      const link = document.createElement('a')
      link.href = url
      link.download = 'waianae-local-evidence.v1.json'
      try {
        link.click()
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      setMessage(
        'Evidence bundle downloaded, not sent. Share only through your approved channels.',
      )
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Bundle export failed. Try again.',
      )
    }
  }

  const before = evaluatePlanningEvidence(scenario, contributions, now)
  const after = preview
    ? evaluatePlanningEvidence(scenario, preview.result.merged, now)
    : []
  return (
    <details
      className="case-disclosure evidence-exchange"
      open={initiallyOpen || undefined}
    >
      <summary>Exchange local evidence bundles</summary>
      <p id="evidence-exchange-limits">
        JSON only · 128 KiB · 1–32 claims per bundle and 32 combined. Bound to
        this exercise, model revision and transfer window. No attachments,
        personal data, free-text attribution or source links. Imported reports
        remain local and unverified—not authenticated provenance or team sync.
      </p>
      <button
        type="button"
        disabled={!timingValid || contributions.length === 0}
        onClick={download}
      >
        Export evidence bundle
      </button>
      <div className="case-inputs">
        <label>
          <span>Import evidence bundle for review</span>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            aria-describedby="evidence-exchange-limits"
            disabled={!timingValid}
            onChange={(event) => void read(event.target.files?.[0])}
          />
        </label>
      </div>
      {!timingValid && <p>Resolve timing errors before exchanging evidence.</p>}
      {reading && <p role="status">Reading bundle. No claims changed.</p>}
      {error && (
        <p role="alert" className="case-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {preview && (
        <section aria-label="Evidence import preview">
          <h3 ref={heading} tabIndex={-1}>
            Review before applying
          </h3>
          <p>
            {preview.result.additions.length} new claims ·{' '}
            {preview.result.duplicates} exact duplicates skipped. Nothing has
            changed yet. Observation times, review intervals, basis and
            set-aside status are preserved.
          </p>
          <ul className="evidence-register">
            {preview.result.incoming.map((item) => (
              <li key={item.id}>
                <strong>
                  {item.id} ·{' '}
                  {
                    scenario.targets.find(
                      (target) => target.id === item.targetId,
                    )?.label
                  }
                </strong>
                <p>
                  {preview.result.additions.some((row) => row.id === item.id)
                    ? 'New'
                    : 'Exact duplicate'}
                  {' · '}
                  {item.basis} · {contributionState(item, scenario, now)}
                  <br />
                  {item.sourceRole} (author-entered, not authenticated)
                  <br />
                  Observed {item.observedAt} · review interval{' '}
                  {item.validForHours}h
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
              </li>
            ))}
          </ul>
          <h4>County review after apply</h4>
          <ul>
            {after
              .filter((insight) =>
                preview.result.incoming.some(
                  (item) => item.targetId === insight.targetId,
                ),
              )
              .map((insight) => (
                <li key={insight.id}>
                  <strong>{insight.label}</strong>:{' '}
                  {
                    evidenceStateLabels[
                      before.find((item) => item.id === insight.id)!.state
                    ]
                  }
                  {' → '}
                  {evidenceStateLabels[insight.state]}
                  <p>{insight.action}</p>
                </li>
              ))}
          </ul>
          <div className="case-step-actions">
            <button
              type="button"
              className="case-primary"
              disabled={!timingValid}
              onClick={apply}
            >
              Confirm bundle import
            </button>
            <button
              type="button"
              onClick={() => {
                discard()
                setMessage('Import cancelled. No claims changed.')
                fileInput.current?.focus()
              }}
            >
              Cancel import
            </button>
          </div>
        </section>
      )}
    </details>
  )
}
