import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { useShallow } from 'zustand/react/shallow'
import {
  ArrowUpRight,
  BatteryCharging,
  BusFront,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Globe2,
  ListChecks,
  LockKeyhole,
  LoaderCircle,
  Route as RouteIcon,
  ServerCog,
  Sparkles,
  Target,
  Users,
  Workflow,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { generatePlanningBrief } from '../lib/mock-api'
import type { PlanningBrief } from '../lib/mock-api'
import {
  formatAggregateMetric,
  formatProtectedCount,
  useCommunityProfile,
} from '../lib/community-profile'
import { downloadFieldBriefing } from '../lib/field-briefing'
import { hawaiiDhsReferences } from '../lib/official-references'
import { analyzeAfnPlanning } from '../lib/planning-analysis'
import { AfnPlanningHotspots } from './AfnPlanningHotspots'
import { CommunityAfnSummary } from './CommunityAfnSummary'
import { NeighborhoodBriefingPanel } from './NeighborhoodBriefingPanel'
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
  sources,
} from '../lib/mock-data'
import { usePlanningStore } from '../store/planning-store'

export function InsightsPanel({ compact = false }: { compact?: boolean }) {
  const {
    selectedAreaId,
    selectedEventId,
    locationFocus,
    selectedPlanningZoneId,
    selectedNeighborhoodId,
    hazard,
    severity,
    activeLayers,
    confirmedResourceIds,
    selectedResourceId,
    residentNoCar,
    residentMobilityHelp,
    residentMedicalPower,
    preferredLanguage,
    confirmResource,
    selectResource,
    setBriefReady,
  } = usePlanningStore(
    useShallow((state) => ({
      selectedAreaId: state.selectedAreaId,
      selectedEventId: state.selectedEventId,
      locationFocus: state.locationFocus,
      selectedPlanningZoneId: state.selectedPlanningZoneId,
      selectedNeighborhoodId: state.selectedNeighborhoodId,
      hazard: state.hazard,
      severity: state.severity,
      activeLayers: state.activeLayers,
      confirmedResourceIds: state.confirmedResourceIds,
      selectedResourceId: state.selectedResourceId,
      residentNoCar: state.residentNoCar,
      residentMobilityHelp: state.residentMobilityHelp,
      residentMedicalPower: state.residentMedicalPower,
      preferredLanguage: state.preferredLanguage,
      confirmResource: state.confirmResource,
      selectResource: state.selectResource,
      setBriefReady: state.setBriefReady,
    })),
  )
  const [brief, setBrief] = useState<PlanningBrief | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const area = areas.find((item) => item.id === selectedAreaId) ?? areas[0]
  const activeEvent =
    activeEvents.find((item) => item.id === selectedEventId) ?? null
  const selectedPlanningZone = locationFocus?.planningZones.find(
    (zone) => zone.id === selectedPlanningZoneId,
  )
  const selectedZonePlan = selectedPlanningZone?.hazardPlans[hazard]
  const neighborhoodBriefings = getNeighborhoodBriefings(area.id)
  const selectedNeighborhood =
    neighborhoodBriefings.find(
      (briefing) => briefing.id === selectedNeighborhoodId,
    ) ?? neighborhoodBriefings.at(0)
  const neighborhoodDecision = selectedNeighborhood?.decisions[hazard]
  const displayPlace =
    selectedPlanningZone?.name ??
    selectedNeighborhood?.name ??
    locationFocus?.name ??
    area.name
  const planningCoordinates =
    selectedPlanningZone?.coordinates ??
    locationFocus?.coordinates ??
    area.coordinates
  const communityProfileState = useCommunityProfile(planningCoordinates)
  const selectedHazard =
    hazards.find((item) => item.id === hazard) ?? hazards[0]
  const scenario = getScenarioView(
    area,
    hazard,
    severity,
    activeLayers,
    activeEvent,
  )
  const challengeSnapshot = getChallengeSnapshot(area, scenario)
  const resourceInventory = getLocalResourceInventory(area)
  const routeChecks = getLocalRouteChecks(area)
  const afnPlanningAnalysis = analyzeAfnPlanning({
    area,
    hazard,
    scenario,
    profile: communityProfileState.profile,
    resources: resourceInventory,
    routes: routeChecks,
  })
  const nextResourceCheck =
    resourceInventory.find(
      (site) =>
        site.status === 'needs-confirmation' &&
        !confirmedResourceIds.includes(site.id),
    ) ?? null
  const selectedResource =
    resourceInventory.find((site) => site.id === selectedResourceId) ??
    nextResourceCheck ??
    resourceInventory[0]
  const confirmedResourceCount = resourceInventory.filter(
    (site) =>
      site.status === 'confirmed' || confirmedResourceIds.includes(site.id),
  ).length
  const nextRouteCheck =
    routeChecks.find((route) => route.status === 'needs-confirmation') ??
    routeChecks[0]
  const localSteps = selectedNeighborhood
    ? [
        {
          title:
            neighborhoodDecision?.action ??
            'Follow official local evacuation or shelter instructions.',
          owner: `${selectedNeighborhood.name} neighborhood lead`,
          timing: 'Before local access deteriorates',
        },
        {
          title: `Confirm ${selectedNeighborhood.closestResources[0].name}`,
          owner: 'Resource coordination team',
          timing: 'Before directing residents',
        },
        {
          title: `Check ${selectedNeighborhood.routes[0].name}`,
          owner: 'Transportation team',
          timing: 'Before evacuation or supply movement',
        },
      ]
    : (selectedZonePlan?.steps ??
      (activeEvent
        ? getEventReliefSteps(area, activeEvent)
        : getLocalReliefSteps(area, hazard)))

  useEffect(() => {
    setBrief(null)
    setBriefReady(false)
  }, [
    hazard,
    selectedAreaId,
    selectedEventId,
    selectedNeighborhoodId,
    selectedPlanningZoneId,
    setBriefReady,
  ])

  const generate = async () => {
    setIsGenerating(true)
    setBrief(null)
    setBriefReady(false)
    const response = await generatePlanningBrief({
      area,
      hazard,
      severity,
      exposedPopulation: scenario.exposedPopulation,
      primarySignal: scenario.primarySignal,
      locationName: displayPlace,
      localSteps,
      analysis: afnPlanningAnalysis,
    })
    setBrief(response)
    setBriefReady(true)
    setIsGenerating(false)
  }

  const downloadPacket = () => {
    if (!brief || communityProfileState.status === 'loading') return

    const profile = communityProfileState.profile
    const profileSources = [
      profile?.acs?.source,
      profile?.svi?.source,
      profile?.empower?.source,
      profile?.fema_national_risk?.source,
    ].filter((source): source is NonNullable<typeof source> => Boolean(source))
    const unavailableSources = [
      !profile?.acs && 'Census ACS',
      !profile?.svi && 'CDC/ATSDR SVI',
      !profile?.empower && 'HHS emPOWER',
      !profile?.fema_national_risk && 'FEMA National Risk Index',
    ].filter((source): source is string => Boolean(source))
    const guidancePreferences = [
      `Preferred public language: ${preferredLanguage}`,
      residentNoCar ? 'Transportation: plan for no private vehicle' : null,
      residentMobilityHelp
        ? 'Accessibility: include mobility assistance'
        : null,
      residentMedicalPower
        ? 'Medical: include power-dependent equipment support'
        : null,
    ].filter((preference): preference is string => Boolean(preference))

    downloadFieldBriefing({
      place: displayPlace,
      island: area.island,
      hazard: selectedHazard.label,
      severity,
      event: activeEvent
        ? {
            name: activeEvent.name,
            status: activeEvent.status,
            arrival: activeEvent.arrival,
            summary: activeEvent.summary,
          }
        : undefined,
      map: {
        exposedPopulation: scenario.exposedPopulation.toLocaleString(),
        primarySignal: scenario.primarySignal,
        sourceStatus:
          communityProfileState.status === 'ready'
            ? 'Complete'
            : communityProfileState.status === 'partial'
              ? 'Partial'
              : 'Unavailable',
        geography:
          profile?.acs?.geography.name ??
          profile?.svi?.location ??
          profile?.empower?.county ??
          'Official aggregate geography unavailable',
        disability: formatAggregateMetric(
          profile?.acs?.population_with_disability,
          profile?.svi?.with_disability,
        ),
        limitedEnglish: formatAggregateMetric(
          profile?.acs?.limited_english_population,
          profile?.svi?.limited_english,
        ),
        noVehicle: formatAggregateMetric(
          profile?.acs?.no_vehicle_households,
          profile?.svi?.no_vehicle_households,
        ),
        medicalPower: formatProtectedCount(
          profile?.empower?.power_dependent_dme,
        ),
        nationalRisk: profile?.fema_national_risk?.risk_rating ?? 'Unavailable',
        socialVulnerability:
          profile?.fema_national_risk?.social_vulnerability_rating ??
          'Unavailable',
        communityResilience:
          profile?.fema_national_risk?.community_resilience_rating ??
          'Unavailable',
        sources: profileSources.map(
          (source) =>
            `${source.authority}${source.vintage ? ` (${source.vintage})` : ''}`,
        ),
        unavailableSources,
      },
      model: {
        needs: challengeSnapshot.topNeeds,
        hotspots: afnPlanningAnalysis.hotspots.map((hotspot) => ({
          domain: hotspot.domain,
          score: hotspot.score,
          level: hotspot.level,
          evidence: hotspot.evidence,
          recommendedAction: hotspot.recommendedAction,
        })),
        cmist: scenario.cmist,
        resources: resourceInventory.map((resource) => ({
          name: resource.name,
          kind: resource.kind,
          capacity: resource.capacity,
          confirmed:
            resource.status === 'confirmed' ||
            confirmedResourceIds.includes(resource.id),
          capabilities: resource.capabilities,
        })),
        routes: routeChecks,
      },
      match: {
        decision:
          selectedNeighborhood && neighborhoodDecision
            ? {
                label: neighborhoodDecision.label,
                action: neighborhoodDecision.action,
                reason: neighborhoodDecision.reason,
                trigger: neighborhoodDecision.trigger,
                owner: selectedNeighborhood.coordination.decisionOwner,
                communicationPath:
                  selectedNeighborhood.coordination.communicationPath,
              }
            : undefined,
        actions: brief.priorities,
      },
      communication: {
        publicGuidance: activeEvent?.publicGuidance ?? [],
        afnActions: selectedNeighborhood?.coordination.afnActions ?? [],
        preferences: guidancePreferences,
        localValidationChecks: [
          'Confirm paper, radio, and phone-tree communication fallback for limited connectivity.',
          'Confirm accessible warning delivery for people who are deaf or hard of hearing and people who use assistive technology.',
          'Confirm transportation and shelter assistance for people with mobility needs and no private vehicle.',
          'Confirm trusted multilingual and trauma-informed community messengers and translated materials.',
          'Confirm medication refrigeration, oxygen and medical-equipment power, extra batteries, and service-animal supplies.',
          'Confirm pets and working animals sheltering, transportation, and supply capacity.',
          'Confirm elevator-outage support for high-rise residents with mobility needs.',
        ],
      },
    })
  }

  return (
    <div className={`insights-content ${compact ? 'is-compact' : ''}`}>
      <section className="area-overview">
        <div className="area-title">
          <h2>Mass care plan for {displayPlace}</h2>
        </div>
        <p>
          {selectedPlanningZone?.summary ??
            locationFocus?.summary ??
            area.summary}
        </p>

        <CommunityAfnSummary coordinates={planningCoordinates} detailed />
        <AfnPlanningHotspots analysis={afnPlanningAnalysis} />

        {activeEvent && (
          <div className="sheet-event-summary">
            <span>
              {activeEvent.name} · {activeEvent.status} · severity{' '}
              {activeEvent.severity}/5
            </span>
            <strong>{activeEvent.arrival}</strong>
            <p>{activeEvent.summary}</p>
            <ul>
              {activeEvent.publicGuidance.map((guidance) => (
                <li key={guidance}>{guidance}</li>
              ))}
            </ul>
          </div>
        )}

        <NeighborhoodBriefingPanel areaId={area.id} hazard={hazard} />

        <div className="sheet-challenge-flow">
          <div className="sheet-challenge-card is-people">
            <span>1 · Map affected communities</span>
            <div>
              <Users size={18} />
              <strong>{scenario.exposedPopulation.toLocaleString()}</strong>
              <small>people may be affected</small>
            </div>
            <p>{challengeSnapshot.topNeeds.join(' · ')}</p>
          </div>
          <div className="sheet-challenge-card is-resources">
            <span>2 · Model needs and gaps</span>
            <div className="sheet-resource-grid">
              <small>
                <BatteryCharging size={15} />
                <strong>{challengeSnapshot.backupPowerSites}</strong> powered
                shelters
              </small>
              <small>
                <BusFront size={15} />
                <strong>{challengeSnapshot.transportTeams}</strong> transport
                teams
              </small>
              <small>
                <RouteIcon size={15} />
                <strong>{challengeSnapshot.routesToVerify}</strong> routes
              </small>
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
                <small>Route needs confirmation before use</small>
              </span>
            </div>
          </div>
          <div className="sheet-challenge-card is-action">
            <span>3 · Match response partners</span>
            <strong>{localSteps[0].title}</strong>
            <small>
              {localSteps[0].owner} · {localSteps[0].timing}
            </small>
          </div>
        </div>
      </section>

      <section className="inventory-section">
        <div className="section-heading">
          <div>
            <h2>Local resource inventory</h2>
            <span>Select a facility to inspect it</span>
          </div>
          <strong>
            {confirmedResourceCount}/{resourceInventory.length} confirmed
          </strong>
        </div>
        <div className="inventory-list" aria-label="Local resources">
          {resourceInventory.map((site) => {
            const confirmed =
              site.status === 'confirmed' ||
              confirmedResourceIds.includes(site.id)
            return (
              <button
                key={site.id}
                type="button"
                className={site.id === selectedResource.id ? 'is-active' : ''}
                onClick={() => selectResource(site.id)}
              >
                <span>
                  <strong>{site.name}</strong>
                  <small>
                    {site.kind === 'transport' ? 'Transport' : 'Shelter'} ·
                    capacity {site.capacity}
                  </small>
                </span>
                <em className={confirmed ? 'is-confirmed' : ''}>
                  {confirmed ? 'Confirmed' : 'Check'}
                </em>
              </button>
            )
          })}
        </div>
        <div className="inventory-detail">
          <div>
            <small>Selected resource</small>
            <h3>{selectedResource.name}</h3>
            <p>
              Capacity {selectedResource.capacity} ·{' '}
              {selectedResource.capabilities.join(' · ')}
            </p>
          </div>
          {selectedResource.status === 'confirmed' ||
          confirmedResourceIds.includes(selectedResource.id) ? (
            <span className="inventory-confirmed">
              <CheckCircle2 size={15} /> Confirmed
            </span>
          ) : (
            <button
              type="button"
              onClick={() => confirmResource(selectedResource.id)}
            >
              Confirm this resource
            </button>
          )}
        </div>
      </section>

      <section className="challenge-readiness">
        <div className="section-heading">
          <div>
            <h2>Challenge readiness</h2>
            <span>What is usable now and what still needs validation</span>
          </div>
        </div>
        <div className="readiness-grid">
          <article>
            <Target size={17} />
            <div>
              <span>Actionable</span>
              <strong>Hazard-specific planning path modeled</strong>
              <p>
                Planning locations now check official tsunami zones, FEMA flood
                classifications and nearby risk boundaries, and the FEMA
                open-shelter feed. Event forecasts, practice destinations, road
                closures, and local shelter openings still require validation.
              </p>
            </div>
          </article>
          <article>
            <Workflow size={17} />
            <div>
              <span>Usable</span>
              <strong>Operational workflow modeled</strong>
              <p>
                The plan connects neighborhood lead, EOC mass care, shelter,
                transport, and public communication partners with a first
                decision and action window.
              </p>
            </div>
          </article>
          <article>
            <LockKeyhole size={17} />
            <div>
              <span>Private</span>
              <strong>Aggregate and de-identified</strong>
              <p>
                Official ACS, SVI, and HHS emPOWER context is limited to
                aggregate planning geographies, alongside synthetic scenario and
                resource records. The planner contains no names, household
                addresses, medical records, or person-level movement histories.
              </p>
            </div>
          </article>
          <article>
            <Globe2 size={17} />
            <div>
              <span>Equitable</span>
              <strong>Statewide entry point · uneven local depth</strong>
              <p>
                Every available island can be viewed one at a time. AFN,
                accessible transport, medical power, and language actions are
                explicit. Field packets require local checks for off-grid
                communication, high-rise elevator outages, pets, and working
                animals; detailed county validation still requires field work.
              </p>
            </div>
          </article>
          <article>
            <ServerCog size={17} />
            <div>
              <span>Sustainable</span>
              <strong>Open standards and maintainable services</strong>
              <p>
                The responsive frontend, normalized Go API, browser telemetry,
                Prometheus metrics, and self-contained low-connectivity field
                packets are implemented. Production source caching, deployment
                rollout, operational alerting, and agency validation remain
                required.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className="luna-section">
        <div className="luna-heading">
          <span className="luna-mark">
            <ListChecks size={20} />
          </span>
          <div>
            <h2>Response checklist</h2>
            <p>A human-reviewable starting point for coordinating teams</p>
          </div>
        </div>

        {!brief && !isGenerating && (
          <div className="brief-empty">
            <Sparkles size={20} />
            <p>
              Create a prioritized list of actions from the selected event,
              affected communities, resource checks, and route constraints. The
              completed list unlocks a printable offline field packet.
            </p>
            <button
              type="button"
              data-telemetry-action="planning_brief_generate"
              data-telemetry-category="planning"
              onClick={generate}
            >
              Create response checklist
              <ArrowUpRight size={16} />
            </button>
          </div>
        )}

        {isGenerating && (
          <div className="brief-loading" role="status">
            <LoaderCircle size={20} className="spin" />
            <div>
              <strong>Preparing response actions</strong>
              <span>Checking the map and source notes…</span>
            </div>
          </div>
        )}

        {brief && (
          <motion.div
            className="brief-result"
            initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="brief-summary">
              <CheckCircle2 size={18} />
              <div>
                <strong>{brief.headline}</strong>
                <p>{brief.explanation}</p>
              </div>
            </div>
            <div className="priority-list">
              {brief.priorities.map((priority) => (
                <div key={priority.title}>
                  <Clock3 size={16} />
                  <span>
                    <strong>{priority.title}</strong>
                    <small>
                      {priority.owner} · {priority.timing}
                    </small>
                  </span>
                </div>
              ))}
            </div>
            <div className="brief-footer">
              <div className="brief-citations">
                <span>
                  <FileText size={14} /> {brief.citations.length} sources used
                </span>
                <small>{brief.citations.join(' · ')}</small>
              </div>
              <div className="brief-actions">
                <button
                  className="field-packet-button"
                  type="button"
                  data-telemetry-action="field_packet_download"
                  data-telemetry-category="planning"
                  disabled={communityProfileState.status === 'loading'}
                  aria-busy={communityProfileState.status === 'loading'}
                  onClick={downloadPacket}
                >
                  <Download size={14} />
                  {communityProfileState.status === 'loading'
                    ? 'Preparing field packet'
                    : 'Download field packet'}
                </button>
                <button
                  type="button"
                  data-telemetry-action="planning_brief_update"
                  data-telemetry-category="planning"
                  onClick={generate}
                >
                  Update list
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </section>

      <details className="evidence-details">
        <summary>
          <span>
            <CircleHelp size={18} />
            Why am I seeing these recommendations?
          </span>
          <ChevronDown size={18} />
        </summary>
        <div className="evidence-details-body">
          <section className="chart-section">
            <div className="section-heading">
              <h2>Needs considered</h2>
              <span>Higher bars need more attention</span>
            </div>
            <div
              className="cmist-chart"
              aria-label="Relative relief needs chart"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={scenario.cmist}
                  layout="vertical"
                  margin={{ top: 2, right: 8, bottom: 0, left: 0 }}
                >
                  <CartesianGrid horizontal={false} stroke="var(--cp-border)" />
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis
                    type="category"
                    dataKey="category"
                    width={98}
                    tick={{ fill: 'var(--cp-text-muted)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--cp-accent-soft)' }}
                    contentStyle={{
                      background: 'var(--cp-panel-strong)',
                      border: '1px solid var(--cp-border)',
                      borderRadius: '10px',
                      color: 'var(--cp-text)',
                    }}
                  />
                  <Bar
                    dataKey="value"
                    fill="var(--cp-accent)"
                    radius={[0, 4, 4, 0]}
                    barSize={9}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="sr-only">
              <caption>Relative relief need values</caption>
              <thead>
                <tr>
                  <th scope="col">Need</th>
                  <th scope="col">Relative level</th>
                </tr>
              </thead>
              <tbody>
                {scenario.cmist.map((item) => (
                  <tr key={item.category}>
                    <th scope="row">{item.category}</th>
                    <td>{item.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="data-basis">
            <div className="section-heading">
              <h2>Practice data used</h2>
              <span>Dates vary by source</span>
            </div>
            <ul>
              {sources.map((source) => (
                <li key={source.name}>
                  <strong>{source.name}</strong>
                  <span>{source.updated}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="official-references">
            <div className="section-heading">
              <h2>Hawaiʻi DHS planning references</h2>
              <span>
                Official inclusion and recovery guidance, not scenario data
              </span>
            </div>
            <p>
              DHS guidance informs the planner&apos;s checks for accessible
              warnings, mobility and no-vehicle support, language access,
              medication refrigeration, medical equipment, service animals, and
              survivor recovery referrals.
            </p>
            <ul>
              {hawaiiDhsReferences.map((reference) => (
                <li key={reference.id}>
                  <a
                    href={reference.url}
                    target="_blank"
                    rel="noreferrer"
                    data-telemetry-action="official_reference_open"
                    data-telemetry-category="evidence"
                  >
                    <span>
                      <strong>{reference.title}</strong>
                      <small>{reference.description}</small>
                    </span>
                    <ExternalLink size={15} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </details>
    </div>
  )
}
