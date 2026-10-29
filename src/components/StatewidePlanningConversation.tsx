import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowUp, MessageSquare } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { hazards } from '../lib/mock-data'
import {
  interpretStatewidePrompt,
  statewidePlanningAreas as planningAreas,
  planningIslands as islands,
  statewidePrompts as prompts,
  decisionActions,
  recommendPlanningStep,
} from '../lib/statewide-conversation'
import {
  buildGeographicFocus,
  useGeographicEvidenceExpiry,
  useGeographicHazards,
  useGeographicProfiles,
} from '../lib/geographic-focus'
import { usePlanningStore } from '../store/planning-store'
import { CommunityAfnSummary } from './CommunityAfnSummary'
import { AfnMapControls } from './AfnMapControls'
import '../statewide-conversation.css'
import type { PlanningQuestion } from '../lib/statewide-conversation'
import { defaultScenario } from '../lib/what-if'
import { WhatIfScenario } from './WhatIfScenario'
import { PlanningQuestionResponse } from './PlanningQuestionResponse'

type View =
  'areas' | 'evidence' | 'county' | 'decision' | 'scenario' | 'question'
const countyQuestions = [
  [
    'Communication',
    'Which languages and accessible formats are needed? Verify trusted messengers and offline contact arrangements.',
  ],
  [
    'Medical',
    'Who will verify medication continuity, equipment-specific backup power and clinical support? Aggregate indicators do not identify patients.',
  ],
  [
    'Independence',
    'Who will assess assisted transfers, mobility devices, caregivers and daily-living support without separating people from their support?',
  ],
  [
    'Safety',
    'Which receiving locations have verified accessible space, safeguarding and acceptance? A listed shelter is not confirmed capacity.',
  ],
  [
    'Transportation',
    'Who will verify accessible vehicles, crews, pickup access and current routes? No directory match confirms availability or activation.',
  ],
]

export function StatewidePlanningConversation({
  active = true,
  onCompare,
  onDetails,
}: {
  active?: boolean
  onCompare: () => void
  onDetails: () => void
}) {
  const {
    statewideOverview,
    selectedAreaId,
    hazard,
    setSelectedAreaId,
    showStatewideOverview,
  } = usePlanningStore(
    useShallow((state) => ({
      statewideOverview: state.statewideOverview,
      selectedAreaId: state.selectedAreaId,
      hazard: state.hazard,
      setSelectedAreaId: state.setSelectedAreaId,
      showStatewideOverview: state.showStatewideOverview,
    })),
  )
  const area = planningAreas.find((item) => item.id === selectedAreaId)
  const instanceId = useId()
  const [view, setView] = useState<View>('areas')
  const [islandChoice, setIslandChoice] = useState<string | null>(null)
  const [turns, setTurns] = useState<Array<{ user: string; scope: string }>>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [scenario, setScenario] = useState(defaultScenario)
  const [question, setQuestion] = useState<PlanningQuestion | null>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const answer = useRef<HTMLElement>(null)
  const candidates = useMemo(() => (area ? [area] : []), [area])
  const profiles = useGeographicProfiles(
    candidates,
    active && !statewideOverview,
  )
  const screens = useGeographicHazards(
    candidates,
    hazard,
    active && !statewideOverview,
  )
  useGeographicEvidenceExpiry(profiles, screens, active && !statewideOverview)
  const entry = buildGeographicFocus(candidates, profiles, hazard, screens).at(
    0,
  )
  const decision = recommendPlanningStep(statewideOverview, entry?.focus)
  const scope = statewideOverview
    ? 'All Hawaiʻi islands'
    : `${area?.island} · ${area?.name}`
  const scopeKey = `${statewideOverview ? 'statewide' : selectedAreaId}:${hazard}`
  useEffect(() => {
    setScenario((previous) => ({ ...previous, hazard }))
  }, [hazard])
  useEffect(() => {
    setView(statewideOverview ? 'areas' : 'evidence')
    setIslandChoice(null)
    setError('')
    setInput('')
  }, [scopeKey])
  useEffect(() => {
    if (!active || !scroll.current || !answer.current) return
    scroll.current.scrollTop +=
      answer.current.getBoundingClientRect().top -
      scroll.current.getBoundingClientRect().top -
      16
  }, [active, turns, view, scopeKey])
  function record(label: string) {
    setTurns((previous) => [...previous.slice(-11), { user: label, scope }])
    setError('')
    setInput('')
  }
  function submit(value: string) {
    const intent = interpretStatewidePrompt(value)
    if (!intent) {
      setInput('')
      setError(
        'This local guide supports the questions and place names shown here—not general AI chat. Your text was not retained or sent. Do not enter personal data.',
      )
      return
    }
    if (intent.type === 'statewide') {
      showStatewideOverview()
      setIslandChoice(null)
      setView('areas')
      record('Show all islands')
    } else if (intent.type === 'island') {
      setIslandChoice(intent.island)
      setView('areas')
      record(`Explore ${intent.island}`)
    } else if (intent.type === 'area') {
      setSelectedAreaId(intent.id)
      setIslandChoice(null)
      setView('evidence')
      record(
        `Focus on ${planningAreas.find((item) => item.id === intent.id)!.name}`,
      )
    } else if (intent.type === 'outage') {
      setScenario((previous) => ({ ...previous, outageDays: intent.days }))
      setView('scenario')
      record(`Model an outage lasting ${intent.days} days`)
    } else if (intent.type === 'scenario-driver') {
      setScenario((previous) => ({
        ...previous,
        [intent.driver]: intent.value,
      }))
      setView('scenario')
      const driverNames = {
        warningHours: 'warning hours',
        shelterUptake: 'shelter uptake %',
        supportDays: 'support days',
      }
      record(`Model ${driverNames[intent.driver]}: ${intent.value}`)
    } else if (intent.type === 'scenario-hazard') {
      setScenario((previous) => ({ ...previous, hazard: intent.hazard }))
      setView('scenario')
      record(`Model ${intent.hazard}`)
    } else if (intent.type === 'planning-question') {
      setQuestion(intent.indicator === 'gaps' ? { ...intent, hazard } : intent)
      setView('question')
      record(
        `${intent.island}: ${intent.indicator === 'gaps' ? 'review missing evidence' : `${intent.indicator} indicators and ${intent.hazard} screening`}`,
      )
    } else {
      setView(
        intent.prompt === prompts[0]
          ? 'areas'
          : intent.prompt === prompts[1]
            ? 'evidence'
            : intent.prompt === prompts[2]
              ? 'county'
              : intent.prompt === prompts[3]
                ? 'decision'
                : 'scenario',
      )
      record(intent.prompt)
    }
  }
  function chooseDecisionAction(action: keyof typeof decisionActions) {
    record(decisionActions[action])
    if (action === 'compare') onCompare()
    else if (action === 'choose-area') {
      setIslandChoice(null)
      setView('areas')
    } else setView(action === 'review-evidence' ? 'evidence' : 'county')
  }
  return (
    <section
      className="statewide-conversation"
      aria-label="Statewide planning conversation"
      data-scope={statewideOverview ? 'statewide' : selectedAreaId}
    >
      <header>
        <div>
          <MessageSquare size={19} />
          <h2>Plan across Hawaiʻi</h2>
        </div>
        <p>County-led AFN planning · local guide, not live AI</p>
        <div className="statewide-chat-scope">
          <strong>{scope}</strong>
          <span>
            {hazards.find((item) => item.id === hazard)?.shortLabel} practice
            context
          </span>
        </div>
        {!statewideOverview && (
          <button type="button" onClick={() => submit('statewide')}>
            Back to all islands
          </button>
        )}
      </header>
      <div
        className="statewide-chat-scroll"
        ref={scroll}
        role="region"
        aria-label="Planning discussion"
        tabIndex={0}
      >
        {turns.length === 0 && (
          <div className="statewide-chat-welcome">
            <h3>Where do we need to prepare support?</h3>
            <p>
              Start across the islands, then focus on a community. Review public
              evidence, surface AFN gaps and prepare the next County-owned
              checks.
            </p>
          </div>
        )}
        <div
          role="log"
          aria-live="polite"
          aria-label="Statewide conversation messages"
        >
          {turns.map((turn, index) => (
            <p className="statewide-chat-turn" key={index}>
              <small>Requested from {turn.scope}</small>
              {turn.user}
            </p>
          ))}
        </div>
        <section
          ref={answer}
          aria-label="Current planning response"
          key={scopeKey}
        >
          {view === 'question' && question && (
            <PlanningQuestionResponse
              question={question}
              onSelect={setSelectedAreaId}
            />
          )}
          {view === 'scenario' &&
            (statewideOverview ? (
              <>
                <h3>Choose a community to model needs</h3>
                <p>
                  No statewide total is inferred. Select a community, then ask
                  “Try a what-if scenario”. Your scenario assumptions are
                  retained in this session only.
                </p>
                <button type="button" onClick={() => setView('areas')}>
                  Choose a planning area
                </button>
              </>
            ) : (
              <WhatIfScenario
                key={selectedAreaId}
                place={area?.name ?? 'Unknown community'}
                island={area?.island ?? ''}
                profile={profiles[selectedAreaId]?.profile}
                scenario={scenario}
                onChange={setScenario}
              />
            ))}
          {view === 'decision' && (
            <section
              aria-label="Suggested planning step"
              data-decision-rule={decision.rule}
            >
              <h3>Suggested next step</h3>
              <strong>{decision.title}</strong>
              <p>{decision.rationale}</p>
              <div className="statewide-chat-choices">
                <button
                  type="button"
                  onClick={() => chooseDecisionAction(decision.primary)}
                >
                  {decisionActions[decision.primary]}
                </button>
                {decision.alternative && (
                  <button
                    type="button"
                    onClick={() => {
                      if (decision.alternative)
                        chooseDecisionAction(decision.alternative)
                    }}
                  >
                    {decisionActions[decision.alternative]}
                  </button>
                )}
              </div>
              <details>
                <summary>Why this step? Evidence and decision rule</summary>
                <p>{decision.evidence}</p>
                <p>
                  Rule-based decision support · afn-next-step.v1 · rule:{' '}
                  {decision.rule}. Uses the current geographic screening result,
                  not a trained or live AI model. Recommendations update when
                  scope, hazard or evidence freshness changes.
                </p>
              </details>
              <p>
                County review is required. This suggests a planning task, not a
                safe route, available team, receiving capacity, dispatch or
                approval. No plan is changed by viewing a recommendation.
              </p>
            </section>
          )}
          {view === 'areas' && (
            <>
              <h3>
                {islandChoice
                  ? `Choose a community on ${islandChoice}`
                  : 'Start with an island or community'}
              </h3>
              <p>
                Coverage and source freshness vary. Statewide reach does not
                mean complete statewide operational data.
              </p>
              <p className="statewide-coverage-note">
                Select community screening on Oʻahu, Maui, Hawaiʻi, Kauaʻi,
                Molokaʻi and Lānaʻi, including Kalaupapa in Kalawao County.
                Niʻihau has no configured community screening; Kahoʻolawe has no
                permanent resident community. No other island’s evidence is
                substituted. Missing or suppressed estimates remain unknown.
              </p>
              <div className="statewide-chat-choices">
                {islands.map((island) => (
                  <button
                    key={island}
                    type="button"
                    aria-pressed={islandChoice === island}
                    onClick={() => submit(island)}
                  >
                    {island}
                  </button>
                ))}
              </div>
              {islandChoice && (
                <div
                  className="statewide-chat-area-list"
                  aria-label={`${islandChoice} planning areas`}
                >
                  {planningAreas
                    .filter((item) => item.island === islandChoice)
                    .map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedAreaId(item.id)
                          setIslandChoice(null)
                          setView('evidence')
                          record(`Focus on ${item.name}`)
                        }}
                      >
                        {item.name}
                      </button>
                    ))}
                </div>
              )}
            </>
          )}
          {view === 'evidence' && (
            <>
              <h3>What is known—and what needs verification?</h3>
              {statewideOverview ? (
                <p>
                  No statewide exposure total, safe-route ranking or
                  available-team count is inferred here. Choose a community for
                  source-backed screening; compare locations within an island
                  before setting local priorities.
                </p>
              ) : (
                entry && (
                  <>
                    <strong>
                      {area?.name}: {entry.focus.label}
                    </strong>
                    <p>{entry.focus.reason}</p>
                    <p>{entry.focus.action}</p>
                    <CommunityAfnSummary
                      coordinates={area!.coordinates}
                      detailed
                    />
                    <AfnMapControls />
                    <details>
                      <summary>Evidence and limits</summary>
                      <p>{entry.focus.evidence}</p>
                      <p>
                        Representative area-center screening, not whole-area
                        exposure or an individual assessment. Unknown is not low
                        risk. No live route clearance, team assignment or
                        receiving capacity is established.
                      </p>
                    </details>
                    <button type="button" onClick={onCompare}>
                      Compare locations on this island
                    </button>
                    <button type="button" onClick={onDetails}>
                      Open detailed workspace
                    </button>
                  </>
                )
              )}
            </>
          )}
          {view === 'county' && (
            <>
              <h3>
                {statewideOverview
                  ? 'County coordination across Hawaiʻi'
                  : `${area?.name}: County review questions`}
              </h3>
              <p>
                Each County owns local verification; State ESF6 supports
                coordination. These questions are not approved assignments or
                dispatch instructions.
              </p>
              <dl className="statewide-chat-questions">
                {countyQuestions.map(([name, text]) => (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd>{text}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </section>
        <div className="statewide-chat-choices statewide-chat-prompts">
          {prompts.map((prompt) => (
            <button key={prompt} type="button" onClick={() => submit(prompt)}>
              {prompt}
            </button>
          ))}
        </div>
        <details className="statewide-chat-example">
          <summary>More planning questions</summary>
          <p>
            Supported examples; substitute a configured island or County and
            tsunami, wildfire, flood or hurricane:
          </p>
          {[
            'Which Maui communities have the most kūpuna and high tsunami exposure?',
            'Which Honolulu County communities have the most households without vehicles and high flood exposure?',
            'Which Kauai communities have the most people with disabilities and high wildfire exposure?',
            'Which Maui communities have the most limited English speakers and high hurricane exposure?',
            'What changes if the outage lasts 5 days?',
            'Set shelter uptake to 20%',
            'Set support to 5 days',
            'Set warning lead time to 2 hours',
            'Model tsunami',
            'What’s missing for Hawaiʻi Island?',
          ].map((text) => (
            <button key={text} type="button" onClick={() => submit(text)}>
              {text}
            </button>
          ))}
        </details>
        <details className="statewide-chat-example">
          <summary>Illustrative walkthrough</summary>
          <p>
            The fictional Waiʻanae story is one example of a wider statewide
            planning workflow—not the product’s default scope.
          </p>
          <Link to="/waianae">Open fictional Waiʻanae case</Link>
        </details>
      </div>
      <form
        className="statewide-chat-composer"
        onSubmit={(event) => {
          event.preventDefault()
          submit(input)
        }}
      >
        {error && <p role="alert">{error}</p>}
        <label htmlFor={`statewide-question-${instanceId}`}>
          Planning question or place
        </label>
        <div>
          <textarea
            id={`statewide-question-${instanceId}`}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={2}
            maxLength={256}
            placeholder="Try “Explore Maui” or “What evidence is missing?”"
            aria-describedby={`statewide-chat-privacy-${instanceId}`}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault()
                if (input.trim()) submit(input)
              }
            }}
          />
          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="Send statewide planning message"
          >
            <ArrowUp size={19} />
          </button>
        </div>
        <small id={`statewide-chat-privacy-${instanceId}`}>
          Bounded local guide. No personal data. Messages are not saved or sent.
          No resource is activated.
        </small>
      </form>
    </section>
  )
}
