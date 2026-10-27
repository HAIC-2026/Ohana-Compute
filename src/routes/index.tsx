import { createFileRoute } from '@tanstack/react-router'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useShallow } from 'zustand/react/shallow'
import {
  BatteryCharging,
  BusFront,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CloudRain,
  ExternalLink,
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
import { EventTriggerPanel } from '../components/EventTriggerPanel'
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
import { hawaiiDhsReferences } from '../lib/official-references'
import {
  findStatewidePlanningArea,
  getCatalogBriefing,
  getCatalogResourceInventory,
  getCatalogRouteChecks,
  usesCatalogWorkflow,
  usePlanningAreaCatalog,
} from '../lib/planning-areas'
import { preloadCountyShelterPlans } from '../lib/county-shelter-plans'
import { usePlanningStore } from '../store/planning-store'

export const Route = createFileRoute('/')({ component: Home })

const ResilienceMap = lazy(() =>
  import('../components/ResilienceMap').then((module) => ({
    default: module.ResilienceMap,
  })),
)

const loadInsightsPanel = () =>
  import('../components/InsightsPanel').then((module) => ({
    default: module.InsightsPanel,
  }))

const InsightsPanel = lazy(loadInsightsPanel)

function preloadResponseWorkspace() {
  void loadInsightsPanel()
  preloadCountyShelterPlans()
}

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
  const headerRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLElement>(null)
  const sheetRef = useRef<HTMLElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const reduceMotion = useReducedMotion()
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
  } = usePlanningStore(
    useShallow((state) => ({
      hazard: state.hazard,
      severity: state.severity,
      selectedEventId: state.selectedEventId,
      selectActiveEvent: state.selectActiveEvent,
      selectedAreaId: state.selectedAreaId,
      selectedNeighborhoodId: state.selectedNeighborhoodId,
      setSelectedAreaId: state.setSelectedAreaId,
      activeLayers: state.activeLayers,
      mobilePanel: state.mobilePanel,
      briefReady: state.briefReady,
      confirmedResourceIds: state.confirmedResourceIds,
      selectedResidentPlanId: state.selectedResidentPlanId,
      selectedResidentResourceId: state.selectedResidentResourceId,
      preferredLanguage: state.preferredLanguage,
      confirmResource: state.confirmResource,
      setMobilePanel: state.setMobilePanel,
    })),
  )
  const area = areas.find((item) => item.id === selectedAreaId) ?? areas[0]
  const selectedHazard =
    hazards.find((item) => item.id === hazard) ?? hazards[0]
  const activeEvent =
    activeEvents.find((item) => item.id === selectedEventId) ?? null
  const residentPlan = residentRoutePlans.find(
    (item) => item.id === selectedResidentPlanId,
  )
  const residentResource =
    residentPlan?.resources.find(
      (resource) => resource.id === selectedResidentResourceId,
    ) ?? residentPlan?.resources[0]
  const planningAreaCatalog = usePlanningAreaCatalog()
  const catalogArea = findStatewidePlanningArea(
    planningAreaCatalog.snapshot,
    area.id,
  )
  const catalogBriefing = usesCatalogWorkflow(area)
    ? getCatalogBriefing(area, catalogArea)
    : null
  const neighborhoodBriefings = catalogBriefing
    ? [catalogBriefing]
    : getNeighborhoodBriefings(area.id)
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
  const localSteps = activeEvent
    ? getEventReliefSteps(area, activeEvent)
    : getLocalReliefSteps(area, hazard)
  const resourceInventory =
    (usesCatalogWorkflow(area)
      ? getCatalogResourceInventory(area, catalogArea)
      : null) ??
    (usesCatalogWorkflow(area) && !catalogArea
      ? []
      : getLocalResourceInventory(area))
  const routeChecks =
    (usesCatalogWorkflow(area) ? getCatalogRouteChecks(catalogArea) : null) ??
    (usesCatalogWorkflow(area) && !catalogArea ? [] : getLocalRouteChecks(area))
  const challengeSnapshot = getChallengeSnapshot(
    area,
    scenario,
    resourceInventory,
    routeChecks,
  )
  const nextResourceCheck =
    resourceInventory.find(
      (site) =>
        site.status === 'needs-confirmation' &&
        !confirmedResourceIds.includes(site.id),
    ) ?? null
  const nextRouteCheck =
    routeChecks.find((route) => route.status === 'needs-confirmation') ??
    routeChecks.at(0)
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
  const displayPlace = catalogBriefing
    ? area.name
    : (selectedNeighborhood?.name ?? area.name)
  const mainNeed =
    neighborhoodDecision?.action ??
    activeEvent?.firstAction ??
    catalogArea?.response_focus[hazard] ??
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

  useEffect(() => {
    if (!mobilePanel) return

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const header = headerRef.current
    const stage = stageRef.current
    const previousBodyOverflow = document.body.style.overflow
    if (header) header.inert = true
    if (stage) stage.inert = true
    document.body.style.overflow = 'hidden'

    const focusSheet = requestAnimationFrame(() => {
      sheetRef.current
        ?.querySelector<HTMLElement>('[data-sheet-close]')
        ?.focus()
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMobilePanel(null)
        return
      }
      if (event.key !== 'Tab' || !sheetRef.current) return

      const focusable = [
        ...sheetRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], details > summary, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => !element.hasAttribute('hidden'))
      if (focusable.length === 0) {
        event.preventDefault()
        sheetRef.current.focus()
        return
      }
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      cancelAnimationFrame(focusSheet)
      document.removeEventListener('keydown', onKeyDown)
      if (header) header.inert = false
      if (stage) stage.inert = false
      document.body.style.overflow = previousBodyOverflow
      restoreFocusRef.current?.focus()
      restoreFocusRef.current = null
    }
  }, [mobilePanel, setMobilePanel])

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
      <header className="atlas-header" ref={headerRef}>
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

      <section className="atlas-stage" ref={stageRef}>
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

            <EventTriggerPanel compact />

            <div className="emergency-choice">
              <div className="active-event-heading">
                <strong>Named practice event for {selectedIsland}</strong>
                <span>Practice only</span>
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
              ) : resourceInventory.length > 0 ? (
                <div className="resource-check is-complete">
                  <CheckCircle2 size={17} />
                  <div>
                    <small>Resource checks complete</small>
                    <strong>All listed local resources are confirmed</strong>
                  </div>
                </div>
              ) : (
                <div className="resource-check is-unavailable">
                  <HousePlus size={17} />
                  <div>
                    <small>Practice resources unavailable</small>
                    <strong>Retry in the Response Plan</strong>
                  </div>
                </div>
              )}
              {nextRouteCheck ? (
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
              ) : (
                <div className="route-check is-unavailable">
                  <RouteIcon size={15} />
                  <span>
                    <strong>Practice routes unavailable</strong>
                    <small>No prior-island route was substituted</small>
                  </span>
                </div>
              )}
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
            onFocus={preloadResponseWorkspace}
            onPointerEnter={preloadResponseWorkspace}
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
            {residentResource && residentPlan?.areaId === area.id ? (
              <div className="resident-route-entry-summary">
                <small>Example public destination</small>
                <strong>{residentResource.name}</strong>
                <span>
                  {residentRouteSummary[hazard]} · {preferredLanguage}
                </span>
              </div>
            ) : (
              <div className="resident-route-entry-summary is-unavailable">
                <small>Resident route scope</small>
                <strong>Address-level preview not available</strong>
                <span>No Oʻahu route or resource was substituted.</span>
              </div>
            )}
            <button type="button" onClick={() => setMobilePanel('resident')}>
              Open public guidance preview
              <ChevronRight size={17} />
            </button>
          </section>

          <p className="practice-note">
            Planning estimates use practice data. Confirm conditions, resource
            status, and assignments with local teams before operational use.{' '}
            <a
              href={hawaiiDhsReferences[0].url}
              target="_blank"
              rel="noreferrer"
              data-telemetry-action="official_reference_open"
              data-telemetry-category="evidence"
            >
              Hawaiʻi DHS programs and services
              <ExternalLink size={10} aria-hidden="true" />
            </a>
          </p>
        </aside>

        <button
          type="button"
          className="mobile-result"
          onFocus={preloadResponseWorkspace}
          onPointerEnter={preloadResponseWorkspace}
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
            onFocus={preloadResponseWorkspace}
            onPointerEnter={preloadResponseWorkspace}
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
              tabIndex={-1}
              aria-hidden="true"
              aria-label="Close panel"
              onClick={() => setMobilePanel(null)}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
            />
            <motion.aside
              ref={sheetRef}
              className={`planning-sheet is-${mobilePanel}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="planning-sheet-title"
              tabIndex={-1}
              initial={reduceMotion ? false : { y: '100%' }}
              animate={{ y: 0 }}
              transition={{
                duration: reduceMotion ? 0 : 0.24,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <div className="planning-sheet-header">
                <div>
                  <h2 id="planning-sheet-title">
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
                  data-sheet-close
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
