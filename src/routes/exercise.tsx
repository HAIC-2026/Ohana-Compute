import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { OperationsLayout } from '../components/OperationsLayout'
import {
  exerciseStages,
  injectSeconds,
  tabletopScenarios,
} from '../lib/tabletop'

export const Route = createFileRoute('/exercise')({
  component: TabletopExercise,
})

function TabletopExercise() {
  const [scenarioIndex, setScenarioIndex] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const [started, setStarted] = useState(false)
  const [checked, setChecked] = useState<string[]>([])
  const [days, setDays] = useState(3)
  const [acknowledged, setAcknowledged] = useState(false)
  const scenario = tabletopScenarios[scenarioIndex]
  const stage = elapsed >= 120 ? 2 : elapsed >= 60 ? 1 : 0

  useEffect(() => {
    if (!running) return
    // Wall-clock deltas preserve inject timing when a browser throttles background tabs.
    const start = Date.now() - elapsed * 1000
    const timer = window.setInterval(() => {
      const seconds = Math.min(180, Math.floor((Date.now() - start) / 1000))
      setElapsed(seconds)
      if (seconds >= 180) setRunning(false)
    }, 1000)
    return () => window.clearInterval(timer)
    // Re-anchor only when resumed or manually advanced.
  }, [running, started, scenarioIndex])

  const reset = (index = scenarioIndex) => {
    setScenarioIndex(index)
    setElapsed(0)
    setRunning(false)
    setStarted(false)
    setChecked([])
    setDays(3)
    setAcknowledged(false)
  }
  const downloadRecord = () => {
    const record = [
      'EXERCISE ONLY — NOT LIVE — NOT AN ORDER OR DISPATCH',
      scenario.name,
      `County lead: ${scenario.county}; State ESF-6 supports County decisions.`,
      `Exercise clock: ${elapsed}s; stage: ${exerciseStages[stage]}`,
      ...checked,
      `Synthetic assumption: ${scenario.households} households × 3 people × ${days} days × 1 gallon = ${scenario.households * 3 * days} gallons.`,
      'This exercise assumption is not a validated operational demand standard. Verified supply is unknown; no operational gap calculated.',
      `County authority boundary acknowledged: ${acknowledged ? 'yes' : 'not yet'}`,
      'Debrief: what evidence, access, capacity or communication would need verification before County action?',
    ].join('\n\n')
    const url = URL.createObjectURL(new Blob([record], { type: 'text/plain' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `EXERCISE-${scenario.id}.txt`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <OperationsLayout title="Practice before the next disaster">
      <div className="exercise-banner" role="note">
        <strong>EXERCISE ONLY · SYNTHETIC SCENARIO · NOT LIVE</strong>
        <p>
          No real incident, resident, road closure, open shelter, partner
          availability, order or dispatch is represented. Exercise choices stay
          in this page’s memory and never modify the live planner.
        </p>
      </div>
      <p className="operations-lead">
        A three-minute tabletop for County planners, HI-EMA, DHS and community
        partners. Work through MAP → MODEL → MATCH, then compare what each role
        needs to verify.
      </p>
      <label className="operations-field">
        Exercise scenario
        <select
          value={scenarioIndex}
          onChange={(event) => reset(Number(event.target.value))}
        >
          {tabletopScenarios.map((item, index) => (
            <option key={item.id} value={index}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <p>
        <strong>{scenario.county} leads.</strong> HI-EMA / DHS State ESF-6
        supports. Partners confirm capabilities; only authorized authorities
        make protective-action decisions.
      </p>
      <div className="exercise-clock">
        <strong aria-label="Exercise clock">
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
        </strong>
        <span>
          {!started
            ? 'Ready to begin'
            : running
              ? 'Exercise running'
              : elapsed >= 180
                ? 'Exercise complete'
                : 'Exercise paused'}
        </span>
        <div className="operations-actions">
          <button
            type="button"
            disabled={elapsed >= 180}
            onClick={() => {
              setStarted(true)
              setRunning((value) => !value)
            }}
          >
            {!started
              ? 'Start exercise'
              : running
                ? 'Pause exercise'
                : 'Resume exercise'}
          </button>
          <button type="button" className="secondary" onClick={() => reset()}>
            Reset exercise
          </button>
        </div>
      </div>
      <ol className="exercise-timeline" aria-label="Timed inject schedule">
        {exerciseStages.map((name, index) => (
          <li key={name} aria-current={stage === index ? 'step' : undefined}>
            <strong>{name}</strong>
            <span>T+{injectSeconds[index]}s</span>
            <span>{started && stage >= index ? 'Released' : 'Waiting'}</span>
          </li>
        ))}
      </ol>
      {started && (
        <section
          className="exercise-workspace"
          aria-labelledby="exercise-stage"
        >
          <p className="operations-stamp">
            EXERCISE INJECT · T+{injectSeconds[stage]}s · Not live
          </p>
          <h2 id="exercise-stage">
            {exerciseStages[stage]}:{' '}
            {stage === 0
              ? 'Locate needs and barriers'
              : stage === 1
                ? 'Make assumptions visible'
                : 'Coordinate without overpromising'}
          </h2>
          <p aria-live="polite">
            {stage === 0
              ? scenario.map
              : stage === 1
                ? scenario.model
                : scenario.match}
          </p>
          <h3>MAP: five CMIST checks</h3>
          <fieldset className="exercise-checks">
            <legend>Mark the checks your planning group has discussed</legend>
            {scenario.checks.map((check) => (
              <label key={check}>
                <input
                  type="checkbox"
                  checked={checked.includes(check)}
                  onChange={(event) => {
                    setChecked((items) =>
                      event.target.checked
                        ? [...items, check]
                        : items.filter((item) => item !== check),
                    )
                  }}
                />
                {check}
              </label>
            ))}
          </fieldset>
          {stage >= 1 && (
            <div>
              <h3>MODEL: bounded training assumption</h3>
              <label className="operations-field">
                Exercise service duration
                <select
                  value={days}
                  onChange={(event) => setDays(Number(event.target.value))}
                >
                  {[1, 3, 7].map((day) => (
                    <option key={day} value={day}>
                      {day} {day === 1 ? 'day' : 'days'}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                {scenario.households} synthetic households × 3 assumed people ×{' '}
                {days} days × 1 assumed gallon per person/day ={' '}
                <strong>
                  {scenario.households * 3 * days} gallons for discussion
                </strong>
                .
              </p>
              <p>
                Illustrative arithmetic only, not a validated shelter standard.
                Verified supply and transport capacity are unknown, not zero. No
                operational shortage is calculated.
              </p>
            </div>
          )}
          {stage >= 2 && (
            <div>
              <h3>MATCH: rehearse the handoff</h3>
              <dl className="operations-facts">
                <div>
                  <dt>County lead</dt>
                  <dd>
                    Validate hazard, roads, shelter opening and accessible
                    transport. Decide and authorize protective actions.
                  </dd>
                </div>
                <div>
                  <dt>HI-EMA / DHS · State ESF-6</dt>
                  <dd>
                    Consolidate County requests; coordinate mass care, medical
                    continuity and inter-island support.
                  </dd>
                </div>
                <div>
                  <dt>Community partners</dt>
                  <dd>
                    Confirm actual capabilities and accessible message delivery
                    through trusted voices. Do not promise beds, vehicles or
                    staff.
                  </dd>
                </div>
                <div>
                  <dt>Decision point</dt>
                  <dd>
                    What remains unverified? Who calls the County duty contact
                    when connectivity fails? Agree on a non-digital fallback and
                    a next check time.
                  </dd>
                </div>
              </dl>
              <label className="exercise-acknowledgment">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
                We have identified County authority and understand this exercise
                does not activate resources.
              </label>
              <h3>Debrief</h3>
              <p>
                Which CMIST need was easiest to overlook? What evidence or
                capability was unavailable? What must be pre-positioned before a
                little-notice event? Name the owning role and next verification
                step aloud.
              </p>
              <button type="button" onClick={downloadRecord}>
                Download EXERCISE discussion record
              </button>
            </div>
          )}
          {stage < 2 && (
            <button
              type="button"
              onClick={() => {
                setRunning(false)
                setElapsed(injectSeconds[stage + 1])
              }}
            >
              Release next inject now
            </button>
          )}
        </section>
      )}
    </OperationsLayout>
  )
}
