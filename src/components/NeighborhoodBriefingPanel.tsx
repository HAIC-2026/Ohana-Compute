import {
  AlertTriangle,
  BusFront,
  Database,
  HousePlus,
  Languages,
  MapPinned,
  Radio,
  Route as RouteIcon,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { areas, getNeighborhoodBriefings } from '../lib/mock-data'
import type { HazardId, NeighborhoodBriefing } from '../lib/mock-data'
import {
  findStatewidePlanningArea,
  getCatalogBriefing,
  usesCatalogWorkflow,
  usePlanningAreaCatalog,
} from '../lib/planning-areas'
import { usePlanningStore } from '../store/planning-store'
import { useRovingTabs } from './RovingTabs'

const fallbackDecisions: Record<
  HazardId,
  NonNullable<NeighborhoodBriefing['decisions'][HazardId]>
> = {
  tsunami: {
    label: 'Move inland',
    action:
      'If your block is inside an official tsunami evacuation zone, walk inland or to higher ground and stay out until the all-clear.',
    reason:
      'The official evacuation boundary, not distance from the shoreline alone, determines whether you should move.',
    trigger:
      'Move when a tsunami warning includes the selected island or after natural warning signs such as strong shaking or sudden ocean retreat.',
  },
  wildfire: {
    label: 'Prepare to leave',
    action:
      'Leave early if an official alert includes your neighborhood, using a route away from fire and smoke.',
    reason:
      'Wind-driven fire, smoke, and road closures can remove safe travel options with little notice.',
    trigger:
      'Leave on an evacuation warning or sooner if smoke, embers, or closures threaten your only route.',
  },
  flood: {
    label: 'Follow local alert',
    action:
      'Stay off flooded roads and move from low ground when a flood warning includes your neighborhood.',
    reason:
      'Street and drainage flooding can isolate individual blocks outside mapped flood areas.',
    trigger:
      'Move when water begins rising or officials warn that access routes may close.',
  },
  hurricane: {
    label: 'Seek shelter',
    action:
      'Use a sound interior room or move to an accessible powered shelter before damaging winds begin.',
    reason:
      'Travel becomes more dangerous once wind, debris, flooding, or power loss affects local roads.',
    trigger:
      'Complete any shelter move before tropical-storm-force winds reach the neighborhood.',
  },
}

const hazardTrafficHazards: Partial<Record<HazardId, string[]>> = {
  tsunami: [
    'Coastal and mauka routes can gridlock quickly; walk when official guidance says it is safer than driving.',
    'Do not use a shoreline road to reach another destination inside the evacuation zone.',
    'Keep emergency lanes and accessible pickup points clear for people who cannot evacuate on foot.',
  ],
  wildfire: [
    'Smoke can hide hazards and make a route unsafe before flames are visible.',
    'Closures can shift quickly; never drive around barricades or toward the fire to use a familiar road.',
    'Leave accessible pickup space and emergency lanes clear before general traffic builds.',
  ],
}

const hazardAfnActions: Partial<Record<HazardId, string[]>> = {
  tsunami: [
    'Start accessible pickup before coastal roads gridlock and prioritize people who cannot evacuate on foot.',
    'Send translated, plain-language directions that name the evacuation zone and the nearest inland route.',
    'Use visual, audible, and door-to-door alerts for residents who may not receive a phone warning.',
  ],
  wildfire: [
    'Move residents with respiratory risk, mobility needs, or medical equipment before smoke or power loss worsens.',
    'Send translated route changes as closures move and include a non-driving pickup option.',
    'Stage accessible vehicles outside the smoke corridor with masks and charging support.',
  ],
}

function getHazardSummary(
  briefing: NeighborhoodBriefing,
  hazard: HazardId,
): string {
  if (hazard === 'tsunami') {
    return `Official evacuation-zone status determines whether ${briefing.name} residents should move; use inland routes and avoid shoreline traffic.`
  }

  if (hazard === 'wildfire') {
    return `${briefing.name} should prepare for smoke, power loss, and limited egress; leave early only when official alerts include the area.`
  }

  return briefing.summary
}

export function NeighborhoodBriefingPanel({
  areaId,
  hazard,
  compact = false,
}: {
  areaId: string
  hazard: HazardId
  compact?: boolean
}) {
  const { selectedNeighborhoodId, selectNeighborhood } = usePlanningStore(
    useShallow((state) => ({
      selectedNeighborhoodId: state.selectedNeighborhoodId,
      selectNeighborhood: state.selectNeighborhood,
    })),
  )
  const catalog = usePlanningAreaCatalog()
  const area = areas.find((item) => item.id === areaId)
  const catalogArea = findStatewidePlanningArea(catalog.snapshot, areaId)
  const catalogBriefing =
    area && usesCatalogWorkflow(area)
      ? getCatalogBriefing(area, catalogArea)
      : null
  const briefings = catalogBriefing
    ? [catalogBriefing]
    : getNeighborhoodBriefings(areaId)
  const selected =
    briefings.find((briefing) => briefing.id === selectedNeighborhoodId) ??
    briefings.at(0)
  const neighborhoodTabs = useRovingTabs({
    label: 'Neighborhood',
    values: briefings.map((briefing) => briefing.id),
    selectedValue: selected?.id ?? selectedNeighborhoodId ?? '',
    onSelect: selectNeighborhood,
  })

  if (!selected) return null

  const decision = selected.decisions[hazard] ?? fallbackDecisions[hazard]
  const trafficHazards = hazardTrafficHazards[hazard] ?? selected.trafficHazards
  const afnActions =
    hazardAfnActions[hazard] ?? selected.coordination.afnActions
  const hazardSummary = getHazardSummary(selected, hazard)

  return (
    <section
      className={`neighborhood-briefing ${compact ? 'is-compact' : ''}`}
      aria-label="Neighborhood briefing"
    >
      <div className="neighborhood-heading">
        <div>
          <h3>Neighborhood</h3>
        </div>
        <span>Practice locations</span>
      </div>

      <div className="neighborhood-tabs" {...neighborhoodTabs.tabListProps}>
        {briefings.map((briefing) => (
          <button
            key={briefing.id}
            type="button"
            {...neighborhoodTabs.getTabProps(briefing.id)}
            className={briefing.id === selected.id ? 'is-active' : ''}
            onClick={() => selectNeighborhood(briefing.id)}
          >
            {briefing.name}
          </button>
        ))}
      </div>

      <div
        className="neighborhood-panel"
        data-testid={`neighborhood-${selected.id}`}
        {...neighborhoodTabs.panelProps}
      >
        {!compact && (
          <div className="neighborhood-summary">
            <MapPinned size={17} />
            <p>{hazardSummary}</p>
          </div>
        )}

        <div className="shelter-decision">
          <HousePlus size={18} />
          <div>
            <small>Resident decision</small>
            <strong>{decision.label}</strong>
            <p>{decision.action}</p>
            <details open={!compact}>
              <summary>Decision criteria</summary>
              <span>{decision.reason}</span>
              <span>{decision.trigger}</span>
            </details>
          </div>
        </div>

        <div className="coordination-card">
          <div>
            <Radio size={15} />
            <span>
              <small>Decision owner</small>
              <strong>{selected.coordination.decisionOwner}</strong>
            </span>
          </div>
          <p>{selected.coordination.communicationPath}</p>
        </div>

        <div className="neighborhood-detail-grid">
          <div className="neighborhood-detail">
            <div className="neighborhood-detail-title">
              <HousePlus size={15} />
              <strong>Closest practice resources</strong>
            </div>
            <ul>
              {selected.closestResources.map((resource) => (
                <li key={resource.name}>
                  <strong>{resource.name}</strong>
                  <span>
                    {resource.kind} · {resource.distance}
                  </span>
                  <small>{resource.note}</small>
                </li>
              ))}
            </ul>
          </div>

          <div className="neighborhood-detail">
            <div className="neighborhood-detail-title">
              <RouteIcon size={15} />
              <strong>Evacuation and access paths</strong>
            </div>
            <ul>
              {selected.routes.map((route) => (
                <li key={route.name}>
                  <strong>{route.name}</strong>
                  <span>{route.purpose}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="neighborhood-detail is-traffic">
            <div className="neighborhood-detail-title">
              <AlertTriangle size={15} />
              <strong>Traffic hazards to expect</strong>
            </div>
            <ul>
              {trafficHazards.map((hazardText) => (
                <li key={hazardText}>
                  <BusFront size={13} />
                  <span>{hazardText}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="neighborhood-detail is-afn">
            <div className="neighborhood-detail-title">
              <Languages size={15} />
              <strong>AFN and language-access actions</strong>
            </div>
            <ul>
              {afnActions.map((action) => (
                <li key={action}>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="neighborhood-evidence">
          <Database size={15} />
          <span>
            <strong>{selected.evidence.status}</strong>
            <small>
              {selected.evidence.basis} · {selected.evidence.updated}
            </small>
            <em>{selected.evidence.validation}</em>
          </span>
        </div>
      </div>
    </section>
  )
}
