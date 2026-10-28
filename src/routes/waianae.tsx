import { createFileRoute, Link } from '@tanstack/react-router'
import { lazy, Suspense, useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Download, RotateCcw } from 'lucide-react'

import { useRovingTabs } from '../components/RovingTabs'
import { usePartnerMatches } from '../lib/partner-matching'
import type { PartnerCapability } from '../lib/partner-matching'
import {
  caseChecks,
  caseStorageKey,
  createAssistancePacket,
  defaultTiming,
  emptyChecks,
  evaluateTiming,
  residentDraft,
  restoreCase,
  timingFields,
} from '../lib/waianae-case'
import type { PreparedChecks, TimingInputs } from '../lib/waianae-case'
import caseCss from '../waianae-case.css?url'

export const Route = createFileRoute('/waianae')({
  head: () => ({
    meta: [{ title: 'Kupuna A · Waiʻanae storm assistance exercise' }],
    links: [{ rel: 'stylesheet', href: caseCss }],
  }),
  component: WaianaeCase,
})

const CaseMap = lazy(() =>
  import('../components/WaianaeCaseMap').then((module) => ({
    default: module.WaianaeCaseMap,
  })),
)
const steps = [
  'Story & risk',
  'Before arrival',
  'County request',
  'Resident message',
] as const
type Step = (typeof steps)[number]
const capabilities: PartnerCapability[] = [
  'mass-care-coordination',
  'information-referral',
  'access-functional-needs-support',
  'pet-service-animal-support',
]

function WaianaeCase() {
  const [step, setStep] = useState<Step>('Story & risk')
  const [timing, setTiming] = useState<TimingInputs>(defaultTiming)
  const [checks, setChecks] = useState<PreparedChecks>(emptyChecks)
  const [restored, setRestored] = useState(false)
  const [storageMessage, setStorageMessage] = useState('')
  const [downloadMessage, setDownloadMessage] = useState('')
  const [evidence, setEvidence] = useState<string | null>(null)
  const partnerState = usePartnerMatches('honolulu', capabilities)
  const { result, errors } = evaluateTiming(timing)
  const tabs = useRovingTabs({
    label: 'Assistance planning workflow',
    values: steps,
    selectedValue: step,
    onSelect: setStep,
  })
  const prepared = Object.values(checks).filter(Boolean).length

  useEffect(() => {
    try {
      const saved = localStorage.getItem(caseStorageKey)
      if (saved) {
        const state = restoreCase(JSON.parse(saved))
        if (state) {
          setTiming(state.timing)
          setChecks(state.checks)
        } else {
          setStorageMessage(
            'Saved exercise could not be restored. Default assumptions are shown; review before use.',
          )
        }
      }
    } catch {
      setStorageMessage(
        'Browser storage is unavailable or unreadable. Download a request packet to keep your work.',
      )
    }
    setRestored(true)
  }, [])

  useEffect(() => {
    if (!restored || !evaluateTiming(timing).result) return
    try {
      localStorage.setItem(caseStorageKey, JSON.stringify({ timing, checks }))
    } catch {
      setStorageMessage(
        'Changes could not be saved in this browser. Download the request packet to keep them.',
      )
    }
  }, [timing, checks, restored])

  const partners =
    partnerState.response?.matches
      .map(
        (match) =>
          `${match.capability}: ${match.status}. ${match.partners.map((partner) => `${partner.name}: ${partner.evidence.claim} Source: ${partner.evidence.source_url}; review through ${partner.evidence.fresh_until}.`).join(' ') || match.gap || 'No current sourced association.'}`,
      )
      .join('\n') ??
    'Partner directory unavailable. No organization is assumed available; County must identify and validate contacts.'

  function download() {
    if (!result || !evidence) return
    const text = createAssistancePacket({ timing, checks, evidence, partners })
    const url = URL.createObjectURL(
      new Blob([text], { type: 'text/markdown;charset=utf-8' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = 'waianae-fictional-assistance-request.md'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setDownloadMessage(
      'Exercise request downloaded, not sent. County approval and operational checks remain required.',
    )
  }

  function updateTiming(next: TimingInputs) {
    setTiming(next)
    setChecks(emptyChecks)
    setDownloadMessage('')
  }

  return (
    <main className="waianae-case" data-hydrated={restored}>
      <header className="case-header">
        <Link to="/">
          <ArrowLeft size={17} /> Statewide planner
        </Link>
        <strong>Kupuna A · Waiʻanae storm assistance</strong>
        <span>Fictional practice scenario · no real person</span>
      </header>
      <div className="case-introduction">
        <div>
          <h1>Plan the assistance before access is lost.</h1>
          <p>
            Imagine Kupuna A in Waiʻanae before a storm. Prepare a County-owned
            support request now—not a rescue promise after roads are cut.
          </p>
        </div>
        <div className="case-introduction-actions">
          <button
            type="button"
            className="case-primary"
            onClick={() => {
              setStep('Before arrival')
              requestAnimationFrame(() =>
                document
                  .getElementById('case-workflow')
                  ?.scrollIntoView({ block: 'start' }),
              )
            }}
          >
            Build the assistance request <ArrowRight size={17} />
          </button>
          <button
            type="button"
            disabled={!result || !evidence}
            onClick={download}
          >
            <Download size={17} /> Download request for review
          </button>
        </div>
      </div>
      <div className="case-workspace">
        <Suspense
          fallback={
            <section className="case-geography case-map-notice" role="status">
              Loading the evidence map…
            </section>
          }
        >
          <CaseMap onEvidence={setEvidence} />
        </Suspense>
        <section
          id="case-workflow"
          className="case-workflow"
          aria-label="Before-storm assistance planning"
        >
          <nav className="case-tabs" {...tabs.tabListProps}>
            {steps.map((item, index) => (
              <button
                key={item}
                type="button"
                {...tabs.getTabProps(item)}
                onClick={() => setStep(item)}
              >
                <span aria-hidden="true">{index + 1}</span>
                {item}
              </button>
            ))}
          </nav>
          <div className="case-step" {...tabs.panelProps}>
            {step === 'Story & risk' && (
              <>
                <h2>One fictional kupuna. A plan with accountable checks.</h2>
                <p>
                  Kupuna A is <strong>not a real person</strong>. The map point
                  is illustrative, not a resident’s home, address or registry.
                  The exercise assumes no car, assisted step-free boarding, a
                  caregiver and power-dependent equipment. Public demographics
                  do not establish these needs.
                </p>
                <div className="case-boundary">
                  <strong>Source risk ≠ predicted access failure.</strong>
                  <p>
                    FEMA flood polygons are mapped planning context. The two
                    purple access-disruption areas are{' '}
                    <strong>hypothetical exercise assumptions</strong>: one
                    bridge/pinch-point concern and one flooded-road concern. No
                    connected feed predicts collapse, confirms a closure or
                    establishes a legal evacuation zone.
                  </p>
                </div>
                <h3>What must be ready before movement</h3>
                <dl className="case-evidence-list">
                  <div>
                    <dt>Access</dt>
                    <dd>
                      County verifies roads, crossing condition, pickup access
                      and current official instructions. No safe route is
                      certified here.
                    </dd>
                  </div>
                  <div>
                    <dt>Assistance</dt>
                    <dd>
                      County assesses whether firefighters or another specialist
                      team are appropriate. No team is available, assigned or
                      activated by this example.
                    </dd>
                  </div>
                  <div>
                    <dt>Destination</dt>
                    <dd>
                      Accessible receiving-site acceptance, equipment support
                      and caregiver arrangements remain unresolved. No shelter
                      opening is assumed.
                    </dd>
                  </div>
                </dl>
                <button
                  type="button"
                  className="case-primary"
                  onClick={() => setStep('Before arrival')}
                >
                  Bound the pre-arrival window <ArrowRight size={16} />
                </button>
              </>
            )}
            {step === 'Before arrival' && (
              <>
                <h2>Work backward from an assumed access-loss window.</h2>
                <p>
                  All times below are{' '}
                  <strong>editable exercise assumptions</strong>, not a weather
                  forecast or permission to travel. No clock starts, alerts fire
                  or assignments are sent.
                </p>
                <div className="case-inputs">
                  {timingFields.map((field) => (
                    <label key={field.id}>
                      {field.label}
                      <input
                        type="number"
                        inputMode="numeric"
                        min={field.min}
                        max={field.max}
                        step="1"
                        value={timing[field.id]}
                        aria-invalid={Boolean(errors[field.id])}
                        aria-describedby={
                          errors[field.id]
                            ? `case-error-${field.id}`
                            : undefined
                        }
                        onChange={(event) =>
                          updateTiming({
                            ...timing,
                            [field.id]: event.target.value,
                          })
                        }
                      />
                      {errors[field.id] && (
                        <span
                          className="case-error"
                          id={`case-error-${field.id}`}
                        >
                          {errors[field.id]}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
                {result ? (
                  <div className="case-results" aria-live="polite">
                    <ol className="case-timeline">
                      <li>
                        <strong>Now</strong>
                        <span>
                          County reviews support, authority and current
                          conditions.
                        </span>
                      </li>
                      <li>
                        <strong>+{result.accessWindow}h</strong>
                        <span>
                          Assumed access loss: {result.arrival}h arrival −{' '}
                          {result.accessLoss}h lead time.
                        </span>
                      </li>
                      <li>
                        <strong>+{result.arrival}h</strong>
                        <span>
                          Assumed storm arrival—not an official forecast.
                        </span>
                      </li>
                    </ol>
                    <div
                      className={`case-boundary ${result.margin <= 0 ? 'case-window-exhausted' : ''}`}
                    >
                      <strong>
                        {result.margin > 0
                          ? `${result.margin}h exercise planning margin`
                          : 'Exercise window exhausted'}
                      </strong>
                      <p>
                        {result.accessWindow}h access window − (
                        {result.mobilise}h coordination + {result.travel}h
                        transfer/travel + {result.buffer}h buffer) ={' '}
                        {result.margin}h.
                      </p>
                      <p>
                        {result.margin > 0
                          ? 'This margin is not a safe-departure deadline. County must validate conditions and approve the plan before any movement.'
                          : 'Escalate County review. Do not assume access remains safe or recommend travel or a rescue from this calculation.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p role="alert" className="case-error">
                    Resolve timing errors before calculating or exporting. No
                    partial result is shown.
                  </p>
                )}
                <div className="case-step-actions">
                  <button
                    type="button"
                    onClick={() => updateTiming(defaultTiming)}
                  >
                    <RotateCcw size={15} /> Reset assumptions
                  </button>
                  <button
                    type="button"
                    className="case-primary"
                    disabled={!result}
                    onClick={() => setStep('County request')}
                  >
                    Prepare the support request <ArrowRight size={16} />
                  </button>
                </div>
              </>
            )}
            {step === 'County request' && (
              <>
                <h2>Request the right assistance—not automatic dispatch.</h2>
                <p>
                  <strong>Honolulu County leads; State ESF6 supports.</strong>{' '}
                  The bounded requirement is one fictional assisted transfer for
                  Kupuna A and one caregiver:{' '}
                  <strong>2 passenger places</strong>, accessible boarding and
                  mobility-device space. Capacity, team suitability and
                  destination acceptance are unverified.
                </p>
                <div className="case-checklist">
                  {caseChecks.map((check) => (
                    <label key={check.id}>
                      <input
                        type="checkbox"
                        checked={checks[check.id]}
                        onChange={(event) =>
                          setChecks({
                            ...checks,
                            [check.id]: event.target.checked,
                          })
                        }
                      />
                      <span>
                        <strong>
                          {check.name} · {check.requirement}
                        </strong>
                        {check.question}
                        <small>
                          Question{' '}
                          {checks[check.id]
                            ? 'prepared; answer unresolved'
                            : 'not yet prepared'}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="case-boundary">
                  <strong>
                    Firefighter / specialist assistance: assessment requested.
                  </strong>
                  <p>
                    County incident command determines whether this help is
                    appropriate and available. Validate crew, qualifications,
                    equipment, vehicle, safe access, operating window, agreement
                    and receiving-site acceptance. Checking a box prepares an
                    agenda question only; it does not confirm a resource or
                    approval.
                  </p>
                </div>
                <details className="case-disclosure">
                  <summary>
                    Sourced roles to approach—not available teams
                  </summary>
                  {partnerState.status === 'loading' ? (
                    <p role="status">Loading the sourced partner directory…</p>
                  ) : partnerState.response ? (
                    <ul>
                      {partnerState.response.matches.map((match) => (
                        <li key={match.capability}>
                          <strong>
                            {match.capability.replaceAll('-', ' ')}
                          </strong>
                          {match.partners.length ? (
                            match.partners.map((partner) => (
                              <p key={partner.id}>
                                <a
                                  href={partner.evidence.source_url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {partner.name}
                                </a>{' '}
                                — {partner.evidence.claim}
                                <small>
                                  Source review through{' '}
                                  {partner.evidence.fresh_until.slice(0, 10)}.
                                  Capacity, activation and agreements
                                  unverified.
                                </small>
                              </p>
                            ))
                          ) : (
                            <p>
                              {match.gap || 'No current sourced association.'}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p role="alert">
                      Partner directory unavailable. No organization is assumed
                      available.{' '}
                      <button type="button" onClick={partnerState.retry}>
                        Retry directory
                      </button>
                    </p>
                  )}
                  <p>
                    The sourced directory does not establish a firefighter crew,
                    clinical support or accessible vehicle for this case. Broad
                    AFN coordination and shelter-plan provenance are not
                    facility capacity or acceptance.
                  </p>
                </details>
                <button
                  type="button"
                  className="case-primary"
                  onClick={() => setStep('Resident message')}
                >
                  Review resident communication <ArrowRight size={16} />
                </button>
              </>
            )}
            {step === 'Resident message' && (
              <>
                <h2>
                  Give Kupuna A a reviewed plan, not an unverified promise.
                </h2>
                <p>
                  This fixed fictional draft names no unverified destination,
                  route or pickup. It must not be sent as an alert.
                </p>
                <pre className="case-resident-draft">{residentDraft}</pre>
                <h3>Before any real publication</h3>
                <ul className="case-publication-checks">
                  <li>
                    County reviews current instructions, safe access,
                    destination and release authority.
                  </li>
                  <li>
                    Trusted community messengers confirm language and format
                    preferences. Obtain human-reviewed translations; none are
                    supplied here.
                  </li>
                  <li>
                    Prepare plain-language print, large print, audio and visual
                    versions, plus phone-free/offline contact. Verify caregiver,
                    service-animal and pet arrangements.
                  </li>
                </ul>
                <div className="case-boundary">
                  <strong>Deterministic, not AI-generated.</strong>
                  <p>
                    No case inputs are sent to a provider. The existing opt-in
                    grounded-plan assistant has a separate server-owned evidence
                    contract that does not include this case. The timing
                    calculation and message template do not impersonate AI.
                  </p>
                </div>
                <button
                  type="button"
                  className="case-primary"
                  disabled={!result || !evidence}
                  onClick={download}
                >
                  <Download size={16} /> Download request for review
                </button>
              </>
            )}
          </div>
          <footer className="case-status">
            <span>
              {prepared}/5 questions prepared · answers unresolved · nothing
              sent
            </span>
            <span>
              Valid assumptions and agenda saved only in this browser. No
              personal data.
            </span>
            {storageMessage && <p role="alert">{storageMessage}</p>}
            {downloadMessage && <p role="status">{downloadMessage}</p>}
          </footer>
        </section>
      </div>
    </main>
  )
}
