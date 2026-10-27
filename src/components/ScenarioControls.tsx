import {
  Car,
  Check,
  Flame,
  HeartPulse,
  Languages,
  RadioTower,
  Shield,
  Stethoscope,
  Umbrella,
  Waves,
  Wind,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { areas, hazards, layers } from '../lib/mock-data'
import type { HazardId, LayerId } from '../lib/mock-data'
import { usePlanningStore } from '../store/planning-store'

const hazardIcons: Record<HazardId, typeof Waves> = {
  tsunami: Waves,
  wildfire: Flame,
  flood: Umbrella,
  hurricane: Wind,
}

const layerIcons: Record<LayerId, typeof Shield> = {
  mobility: Shield,
  'medical-power': HeartPulse,
  language: Languages,
  transportation: Car,
  shelters: RadioTower,
}

export function ScenarioControls({ compact = false }: { compact?: boolean }) {
  const {
    hazard,
    setHazard,
    severity,
    setSeverity,
    selectedAreaId,
    setSelectedAreaId,
    activeLayers,
    toggleLayer,
  } = usePlanningStore(
    useShallow((state) => ({
      hazard: state.hazard,
      setHazard: state.setHazard,
      severity: state.severity,
      setSeverity: state.setSeverity,
      selectedAreaId: state.selectedAreaId,
      setSelectedAreaId: state.setSelectedAreaId,
      activeLayers: state.activeLayers,
      toggleLayer: state.toggleLayer,
    })),
  )
  const selectedArea =
    areas.find((area) => area.id === selectedAreaId) ?? areas[0]
  const islandAreas = areas.filter(
    (area) =>
      area.island === selectedArea.island && area.showOnStatewideMap !== false,
  )

  return (
    <div className={`scenario-content ${compact ? 'is-compact' : ''}`}>
      <section className="control-section">
        <div className="section-heading">
          <h2>Emergency settings</h2>
          <span>Optional</span>
        </div>
        <div className="hazard-selector" role="radiogroup" aria-label="Hazard">
          {hazards.map((item) => {
            const Icon = hazardIcons[item.id]
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={hazard === item.id}
                className={hazard === item.id ? 'is-active' : ''}
                data-telemetry-action="hazard_select"
                onClick={() => setHazard(item.id)}
              >
                <Icon size={18} />
                <span>{item.shortLabel}</span>
              </button>
            )
          })}
        </div>

        <div className="severity-control">
          <div>
            <label htmlFor="severity">How serious could it be?</label>
            <strong>{severity} / 5</strong>
          </div>
          <input
            id="severity"
            type="range"
            min="1"
            max="5"
            step="1"
            value={severity}
            data-telemetry-action="severity_change"
            onChange={(event) => setSeverity(Number(event.target.value))}
          />
          <div className="range-labels" aria-hidden="true">
            <span>Lower</span>
            <span>Higher</span>
          </div>
        </div>

        <div className="area-select">
          <label htmlFor={`planning-area-${compact ? 'mobile' : 'desktop'}`}>
            Which part of {selectedArea.island}?
          </label>
          <select
            id={`planning-area-${compact ? 'mobile' : 'desktop'}`}
            value={selectedAreaId}
            data-telemetry-action="area_select"
            onChange={(event) => setSelectedAreaId(event.target.value)}
          >
            {islandAreas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="control-section layer-section">
        <div className="section-heading">
          <h2>What should the map show?</h2>
          <span>{activeLayers.length} selected</span>
        </div>
        <div className="layer-list">
          {layers.map((layer) => {
            const Icon = layerIcons[layer.id]
            const active = activeLayers.includes(layer.id)
            return (
              <button
                key={layer.id}
                type="button"
                className={active ? 'is-active' : ''}
                aria-pressed={active}
                data-telemetry-action="layer_toggle"
                onClick={() => toggleLayer(layer.id)}
              >
                <span className="layer-icon">
                  <Icon size={17} />
                </span>
                <span className="layer-copy">
                  <strong>{layer.label}</strong>
                  <small>{layer.description}</small>
                </span>
                <span className="layer-check" aria-hidden="true">
                  {active && <Check size={14} />}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <div className="privacy-note">
        <Stethoscope size={17} />
        <p>
          This map estimates needs for an area. It does not identify people or
          homes.
        </p>
      </div>
    </div>
  )
}
