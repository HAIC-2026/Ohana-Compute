import { createFileRoute } from '@tanstack/react-router'
import { lazy, Suspense, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  BatteryCharging,
  BusFront,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CloudRain,
  Flame,
  HousePlus,
  Layers3,
  MapPin,
  Moon,
  Navigation,
  Route as RouteIcon,
  Sparkles,
  Sun,
  Users,
  Waves,
  Wind,
  X,
} from 'lucide-react'

import { ScenarioControls } from '../components/ScenarioControls'
import { CommunityAfnSummary } from '../components/CommunityAfnSummary'
import { NeighborhoodBriefingPanel } from '../components/NeighborhoodBriefingPanel'
import { ResidentRoutePanel } from '../components/ResidentRoutePanel'
import {
  areas,
  activeEvents,
  getChallengeSnapshot,
  getEventReliefSteps,
  getLocalReliefSteps,
  getLocalResourceInventory,
  getLocalRouteChecks,
  getNeighborhoodBriefings,
  getScenarioView,
  hazards,
  residentRoutePlans,
} from '../lib/mock-data'
import type { HazardId } from '../lib/mock-data'
import { usePlanningStore } from '../store/planning-store'

export const Route = createFileRoute('/')({ component: Home })

const ResilienceMap = lazy(() =>
  import('../components/ResilienceMap').then((module) => ({
    default: module.ResilienceMap,
  })),
)

const InsightsPanel = lazy(() =>
  import('../components/InsightsPanel').then((module) => ({
    default: module.InsightsPanel,
  })),
)

const hazardIcons: Record<HazardId, typeof Waves> = {
  tsunami: Waves,
  wildfire: Flame,
  flood: CloudRain,
  hurricane: Wind,
}

const supportFocus: Record<string, string> = {
  Communication: 'clear alerts and language help',
  Medical: 'medical support and backup power',
  Independence: 'mobility and daily support',
  Safety: 'safe shelter and protection',
  Transportation: 'transportation and evacuation help',
}

const residentRouteSummary: Record<HazardId, string> = {
  hurricane:
    'Road-level practice directions with wind, flood, and traffic warnings',
  flood: 'Road-level practice directions with flood and traffic warnings',
  tsunami:
    'Road-level practice directions that avoid official evacuation zones',
  wildfire:
    'Road-level practice directions that avoid smoke, fire, and closures',
}

function Home() {
  const [hydrated, setHydrated] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [mobileSetupOpen, setMobileSetupOpen] = useState(false)
  const {
    hazard,
    severity,
    selectedEventId,
    selectActiveEvent,
    selectedAreaId,
    selectedNeighborhoodId,
    setSelectedAreaId,
    activeLayers,
    mobilePanel,
    briefReady,
    confirmedResourceIds,
    selectedResidentPlanId,
    selectedResidentResourceId,
    preferredLanguage,
    confirmResource,
    setMobilePanel,
  } = usePlanningStore()
  const area = areas.find((item) => item.id === selectedAreaId) ?? areas[0]
  const selectedHazard =
    hazards.find((item) => item.id === hazard) ?? hazards[0]
  const activeEvent =
    activeEvents.find((item) => item.id === selectedEventId) ?? null
  const residentPlan =
    residentRoutePlans.find((item) => item.id === selectedResidentPlanId) ??
    residentRoutePlans[0]
  const residentResource =
    residentPlan.resources.find(
      (resource) => resource.id === selectedResidentResourceId,
    ) ?? residentPlan.resources[0]
  const neighborhoodBriefings = getNeighborhoodBriefings(area.id)
  const selectedNeighborhood =
    neighborhoodBriefings.find(
      (briefing) => briefing.id === selectedNeighborhoodId,
    ) ?? neighborhoodBriefings.at(0)
  const neighborhoodDecision = selectedNeighborhood?.decisions[hazard]
  const scenario = getScenarioView(
    area,
    hazard,
    severity,
    activeLayers,
    activeEvent,
  )
  const challengeSnapshot = getChallengeSnapshot(area, scenario)
  const localSteps = activeEvent
    ? getEventReliefSteps(area, activeEvent)
    : getLocalReliefSteps(area, hazard)
  const resourceInventory = getLocalResourceInventory(area)
  const routeChecks = getLocalRouteChecks(area)
  const nextResourceCheck =
    resourceInventory.find(
      (site) =>
        site.status === 'needs-confirmation' &&
        !confirmedResourceIds.includes(site.id),
    ) ?? null
  const nextRouteCheck =
    routeChecks.find((route) => route.status === 'needs-confirmation') ??
    routeChecks[0]
  const confirmedRoute =
    routeChecks.find((route) => route.status === 'clear') ?? null
  const islands = Array.from(
    new Set(
      areas
        .filter((item) => item.showOnStatewideMap !== false)
        .map((item) => item.island),
    ),
  )
  const selectedIsland = area.island
  const islandAreas = areas.filter(
    (item) =>
      item.island === selectedIsland && item.showOnStatewideMap !== false,
  )
  const displayPlace = selectedNeighborhood?.name ?? area.name
  const mainNeed =
    neighborhoodDecision?.action ??
    activeEvent?.firstAction ??
    area.responseFocus?.[hazard] ??
    supportFocus[scenario.primarySignal]
  const readinessMessage =
    scenario.readiness >= 70
      ? 'Most key resources appear available, but local teams should confirm.'
      : scenario.readiness >= 55
        ? 'Some important resource gaps may need attention.'
        : 'Significant resource gaps may need urgent attention.'

  useEffect(() => {
    setHydrated(true)
    setTheme(
      document.documentElement.getAttribute('data-theme') === 'dark'
        ? 'dark'
        : 'light',
    )
  }, [])

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', nextTheme)
    setTheme(nextTheme)
  }

  return (
    <main
      className={`app ${mobilePanel === 'resident' ? 'has-resident-route' : ''}`}
      data-hydrated={hydrated}
    >
      <header className="atlas-header">
        <div className="brand">
          <span className="brand-symbol" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <div>
            <strong>Hawaiʻi Mass Care Planner</strong>
            <span>Map needs, model gaps, match response</span>
          </div>
        </div>

        <div className="header-actions">
          <span className="prototype-badge">Practice data</span>
          <button
            type="button"
            aria-label={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      <section className="atlas-stage">
        <div className="map-stage">
          <Suspense
            fallback={<div className="map-loading">Loading the map…</div>}
          >
            <ResilienceMap />
          </Suspense>
        </div>

        <section
          className={`map-story ${mobileSetupOpen ? 'is-open-mobile' : 'is-collapsed-mobile'}`}
        >
          <button
            type="button"
            className="mobile-setup-summary"
            onClick={() => setMobileSetupOpen(true)}
          >
            <MapPin size={18} />
            <span>
              <small>
                {displayPlace} ·{' '}
                {activeEvent?.name ?? selectedHazard.shortLabel}
              </small>
              <strong>Change planning area or active event</strong>
            </span>
            <ChevronRight size={18} />
          </button>

          <div className="map-story-content">
            <button
              type="button"
              className="mobile-setup-close"
              aria-label="Close location and emergency settings"
              onClick={() => setMobileSetupOpen(false)}
            >
              <X size={18} />
            </button>
            <h1>Plan mass care before the next disaster</h1>
            <p>
              Map affected communities, model hazard-specific needs and gaps,
              then match agencies and community partners to coordinated actions.
            </p>

            <div className="place-flow">
              <div className="island-choice">
                <MapPin size={19} aria-hidden="true" />
                <span>
                  <small>Current island</small>
                  <select
                    aria-label="Choose island"
                    value={selectedIsland}
                    onChange={(event) => {
                      const nextArea = areas.find(
                        (item) =>
                          item.island === event.target.value &&
                          item.showOnStatewideMap !== false,
                      )
                      if (nextArea) setSelectedAreaId(nextArea.id)
                    }}
                  >
                    {islands.map((island) => (
                      <option key={island} value={island}>
                        {island}
                      </option>
                    ))}
                  </select>
                </span>
                <span className="island-status">One island at a time</span>
              </div>

              <label className="response-zone-choice">
                <span>Which part of {selectedIsland}?</span>
                <select
                  aria-label={`Which part of ${selectedIsland}?`}
                  value={selectedAreaId}
                  onChange={(event) => {
                    setSelectedAreaId(event.target.value)
                    setMobileSetupOpen(false)
                  }}
                >
                  {islandAreas.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>

              {area.communities && (
                <div className="zone-communities">
                  <small>Includes</small>
                  <p>{area.communities.join(' · ')}</p>
                </div>
              )}
            </div>

            <div className="emergency-choice">
              <div className="active-event-heading">
                <strong>Active events affecting {selectedIsland}</strong>
                <span>Practice event feed</span>
              </div>
              <nav
                className="active-event-list"
                aria-label="Choose active event"
              >
                {activeEvents.map((item) => {
                  const Icon = hazardIcons[item.hazard]
                  const active = selectedEventId === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={active ? 'is-active' : ''}
                      aria-pressed={active}
                      onClick={() => {
                        selectActiveEvent(item.id)
                        setMobileSetupOpen(false)
                      }}
                    >
                      <Icon size={18} />
                      <span>
                        <strong>{item.name}</strong>
                        <small>
                          {item.status} · {item.trend} · severity{' '}
                          {item.severity}/5
                        </small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  )
                })}
              </nav>
            </div>
          </div>
        </section>

        <aside className="relief-panel">
          <div className="relief-heading">
            <span className="relief-icon">
              <CheckCircle2 size={21} />
            </span>
            <div>
              <h2>{activeEvent?.name ?? selectedHazard.label}</h2>
              <p>
                {displayPlace} · {activeEvent?.status ?? 'Practice scenario'} ·{' '}
                severity {severity}/5
              </p>
            </div>
          </div>

          {activeEvent && (
            <section className="event-briefing">
              <div>
                <Clock3 size={16} />
                <strong>{activeEvent.arrival}</strong>
              </div>
              <p>{activeEvent.summary}</p>
              <span>
                Forecast confidence: {activeEvent.confidence} ·{' '}
                {activeEvent.updated}
              </span>
            </section>
          )}

          <div className="relief-message">
            <span>Response priority before conditions arrive</span>
            <strong>{mainNeed}</strong>
            <p>{area.summary}</p>
          </div>

          <NeighborhoodBriefingPanel areaId={area.id} hazard={hazard} compact />

          <div
            className="challenge-flow"
            aria-label="Emergency response planning summary"
          >
            <section className="challenge-step is-people">
              <div className="challenge-step-heading">
                <span>1</span>
                <div>
                  <small>Map</small>
                  <h3>Who may need help</h3>
                </div>
              </div>
              <div className="people-total">
                <Users size={19} />
                <span>
                  <strong>{scenario.exposedPopulation.toLocaleString()}</strong>
                  people may be affected
                </span>
              </div>
              <div className="need-list">
                {challengeSnapshot.topNeeds.map((need) => (
                  <span key={need}>{need}</span>
                ))}
              </div>
              <CommunityAfnSummary coordinates={area.coordinates} />
              {activeEvent && (
                <div className="public-guidance">
                  <strong>What people need to know</strong>
                  <ul>
                    {activeEvent.publicGuidance.map((guidance) => (
                      <li key={guidance}>{guidance}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className="challenge-step is-resources">
              <div className="challenge-step-heading">
                <span>2</span>
                <div>
                  <small>Model</small>
                  <h3>Needs and resource gaps</h3>
                </div>
              </div>
              <div className="resource-grid">
                <div>
                  <HousePlus size={17} />
                  <strong>{challengeSnapshot.sheltersNearby}</strong>
                  <span>shelters nearby</span>
                </div>
                <div>
                  <BatteryCharging size={17} />
                  <strong>{challengeSnapshot.backupPowerSites}</strong>
                  <span>with backup power</span>
                </div>
                <div>
                  <BusFront size={17} />
                  <strong>{challengeSnapshot.transportTeams}</strong>
                  <span>transport teams</span>
                </div>
                <div>
                  <RouteIcon size={17} />
                  <strong>{challengeSnapshot.routesToVerify}</strong>
                  <span>routes to verify</span>
                </div>
              </div>
              {nextResourceCheck ? (
                <div className="resource-check">
                  <div>
                    <small>Next local resource check</small>
                    <strong>{nextResourceCheck.name}</strong>
                    <span>
                      Capacity {nextResourceCheck.capacity} ·{' '}
                      {nextResourceCheck.capabilities.slice(0, 2).join(' · ')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => confirmResource(nextResourceCheck.id)}
                  >
                    Confirm
                  </button>
                </div>
              ) : (
                <div className="resource-check is-complete">
                  <CheckCircle2 size={17} />
                  <div>
                    <small>Resource checks complete</small>
                    <strong>All listed local resources are confirmed</strong>
                  </div>
                </div>
              )}
              <div className="route-check">
                <RouteIcon size={15} />
                <span>
                  <strong>{nextRouteCheck.name}</strong>
                  <small>
                    Needs confirmation
                    {confirmedRoute
                      ? ` · practice alternate: ${confirmedRoute.name}; verify current conditions`
                      : ' · no alternate route confirmed'}
                  </small>
                </span>
              </div>
              <p className="resource-gap">
                Gap to address: {challengeSnapshot.topNeeds[0].toLowerCase()}.{' '}
                {readinessMessage}
              </p>
            </section>

            <section className="challenge-step is-action">
              <div className="challenge-step-heading">
                <span>3</span>
                <div>
                  <small>Match</small>
                  <h3>Coordinated response</h3>
                </div>
              </div>
              <div className="first-action">
                <CheckCircle2 size={18} />
                <div>
                  <strong>{localSteps[0].title}</strong>
                  <span>
                    {localSteps[0].owner} · {localSteps[0].timing}
                  </span>
                </div>
              </div>
            </section>
          </div>

          <button
            type="button"
            className="relief-primary"
            onClick={() => setMobilePanel('insights')}
          >
            <Sparkles size={18} />
            {briefReady
              ? 'Review response workspace'
              : 'Open response workspace'}
            <ChevronRight size={18} />
          </button>

          <section className="resident-route-entry">
            <div className="resident-route-entry-heading">
              <span>
                <Navigation size={17} />
              </span>
              <div>
                <h3>Preview resident guidance</h3>
                <p>
                  Translate the current plan into accessible, multilingual
                  practice directions.
                </p>
              </div>
            </div>
            <div className="resident-route-entry-summary">
              <small>Example public destination</small>
              <strong>{residentResource.name}</strong>
              <span>
                {residentRouteSummary[hazard]} · {preferredLanguage}
              </span>
            </div>
            <button type="button" onClick={() => setMobilePanel('resident')}>
              Open public guidance preview
              <ChevronRight size={17} />
            </button>
          </section>

          <p className="practice-note">
            Planning estimates use practice data. Confirm conditions, resource
            status, and assignments with local teams before operational use.
          </p>
        </aside>

        <button
          type="button"
          className="mobile-result"
          onClick={() => setMobilePanel('insights')}
        >
          <span>
            <small>Response priority · {displayPlace}</small>
            <strong>{localSteps[0].title}</strong>
            <em>
              {localSteps[0].owner} · {localSteps[0].timing}
            </em>
          </span>
          <ChevronRight size={20} />
        </button>

        <nav className="mobile-dock" aria-label="Emergency planning tools">
          <button
            type="button"
            onClick={() => setMobilePanel('insights')}
            className={mobilePanel === 'insights' ? 'is-active' : ''}
          >
            <Sparkles size={19} />
            Response plan
          </button>
          <button
            type="button"
            onClick={() => setMobilePanel('resident')}
            className={mobilePanel === 'resident' ? 'is-active' : ''}
          >
            <Navigation size={19} />
            Public guidance
          </button>
          <button
            type="button"
            onClick={() => setMobilePanel('scenario')}
            className={mobilePanel === 'scenario' ? 'is-active' : ''}
          >
            <Layers3 size={19} />
            Map
          </button>
        </nav>
      </section>

      <AnimatePresence>
        {mobilePanel && (
          <>
            <motion.button
              className={`sheet-backdrop is-${mobilePanel}`}
              type="button"
              aria-label="Close panel"
              onClick={() => setMobilePanel(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.aside
              className={`planning-sheet is-${mobilePanel}`}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="planning-sheet-header">
                <div>
                  <h2>
                    {mobilePanel === 'scenario'
                      ? 'Change map details'
                      : mobilePanel === 'resident'
                        ? 'Public guidance preview'
                        : `Mass care plan for ${displayPlace}`}
                  </h2>
                  <span>
                    {mobilePanel === 'scenario'
                      ? 'Optional settings'
                      : mobilePanel === 'resident'
                        ? 'How an approved plan becomes accessible resident action'
                        : 'Confirm needs, resources, routes, and first actions'}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Close panel"
                  onClick={() => setMobilePanel(null)}
                >
                  <X size={20} />
                </button>
              </div>
              <div className="planning-sheet-body">
                {mobilePanel === 'scenario' ? (
                  <ScenarioControls compact />
                ) : mobilePanel === 'resident' ? (
                  <ResidentRoutePanel compact />
                ) : (
                  <Suspense
                    fallback={
                      <div className="panel-loading">
                        Preparing relief information…
                      </div>
                    }
                  >
                    <InsightsPanel compact />
                  </Suspense>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </main>
  )
}
