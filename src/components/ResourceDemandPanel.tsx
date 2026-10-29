import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Database,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'

import { findResourceDemandLine } from '../lib/resource-demand'
import type {
  ResourceDemandStandard,
  ResourceDemandState,
} from '../lib/resource-demand'

type Props = {
  state: ResourceDemandState
  serviceDays: number
  outageHours: number
  shelterStandard: ResourceDemandStandard
  onServiceDaysChange: (days: number) => void
  onOutageHoursChange: (hours: number) => void
  onShelterStandardChange: (standard: ResourceDemandStandard) => void
}

const unitLabels: Record<string, string> = {
  people: 'people',
  square_feet: 'sq ft',
  cots: 'cots',
  meals: 'meals',
  liters: 'L',
  beneficiary_hours: 'beneficiary-hours',
}

function rangeText(
  range: { low: number; planning: number; high: number } | undefined,
  unit: string,
) {
  if (!range) return 'Unavailable'
  const suffix = unitLabels[unit] ?? unit.replaceAll('_', ' ')
  return `${range.low.toLocaleString()}–${range.high.toLocaleString()} ${suffix}`
}

export function ResourceDemandPanel({
  state,
  serviceDays,
  outageHours,
  shelterStandard,
  onServiceDaysChange,
  onOutageHoursChange,
  onShelterStandardChange,
}: Props) {
  const response = state.response
  const servicePopulation = findResourceDemandLine(
    response,
    'service_population',
  )
  const shelterSpaces = findResourceDemandLine(response, 'shelter_spaces')
  const meals = findResourceDemandLine(response, 'meals')
  const water = findResourceDemandLine(response, 'potable_water_liters')
  const capacityGap = findResourceDemandLine(response, 'shelter_capacity_gap')
  const addedLines = [
    'stranded_visitors',
    'pit_homeless_support',
    'pet_sheltering',
    'power_continuity_beneficiary_hours',
  ]
  const cohortLines =
    response?.lines.filter((line) => addedLines.includes(line.id)) ?? []
  const modeledLines =
    response?.lines.filter(
      (line) => line.status === 'modeled' && !addedLines.includes(line.id),
    ) ?? []
  const unavailableLines =
    response?.lines.filter((line) => line.status === 'unavailable') ?? []
  const appliedSupply =
    response?.supply_assessments.filter(
      (assessment) => assessment.status === 'applied',
    ) ?? []
  const excludedSupply =
    response?.supply_assessments.filter(
      (assessment) => assessment.status === 'excluded',
    ) ?? []

  return (
    <section
      className={`resource-demand-panel is-${state.status}`}
      data-testid="resource-demand"
      aria-label="Quantitative resource demand"
    >
      <div className="resource-demand-heading">
        <div>
          <span>
            <Calculator size={15} /> Deterministic scenario model
          </span>
          <h2>Quantitative resource demand</h2>
          <p>
            Low, planning, and high ranges expose assumptions and uncertainty.
            They are stress tests, not forecasts or allocations.
          </p>
        </div>
        {response ? (
          <div className="resource-demand-version">
            <strong>{response.model_version}</strong>
            <span>{response.assumption_version}</span>
          </div>
        ) : null}
      </div>

      <div className="resource-demand-controls">
        <label>
          <span>Service duration</span>
          <select
            value={serviceDays}
            data-telemetry-action="resource_demand_duration"
            data-telemetry-category="planning"
            onChange={(event) =>
              onServiceDaysChange(Number(event.currentTarget.value))
            }
          >
            <option value={1}>1 day</option>
            <option value={3}>3 days</option>
            <option value={7}>7 days</option>
          </select>
        </label>
        <label>
          <span>Shelter standard</span>
          <select
            value={shelterStandard}
            data-telemetry-action="resource_demand_standard"
            data-telemetry-category="planning"
            onChange={(event) =>
              onShelterStandardChange(
                event.currentTarget.value as ResourceDemandStandard,
              )
            }
          >
            <option value="evacuation">Evacuation · 20 sq ft/person</option>
            <option value="short_term">Short-term · 40–60 sq ft/person</option>
          </select>
        </label>
        <label>
          <span>Power outage planning window</span>
          <select
            value={outageHours}
            onChange={(event) =>
              onOutageHoursChange(Number(event.currentTarget.value))
            }
          >
            <option value={12}>12 hours</option>
            <option value={24}>24 hours</option>
            <option value={72}>72 hours</option>
            <option value={168}>7 days</option>
          </select>
        </label>
      </div>

      {state.status === 'loading' ? (
        <div className="resource-demand-state" role="status">
          <LoaderCircle className="spin" size={18} />
          <div>
            <strong>Calculating bounded planning ranges</strong>
            <span>
              Checking aggregate population and matched practice supply…
            </span>
          </div>
        </div>
      ) : null}

      {state.status === 'error' ? (
        <div className="resource-demand-state is-error" role="alert">
          <AlertTriangle size={18} />
          <div>
            <strong>Resource-demand model unavailable</strong>
            <span>
              No numeric fallback was generated. Retry the Go planning model.
            </span>
          </div>
          <button
            type="button"
            data-telemetry-action="resource_demand_retry"
            data-telemetry-category="planning"
            onClick={state.retry}
          >
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : null}

      {response ? (
        <>
          <div className="resource-demand-summary">
            <article>
              <span>Planning service population</span>
              <strong>
                {servicePopulation?.demand?.planning.toLocaleString() ??
                  'Unavailable'}
              </strong>
              <small>{rangeText(servicePopulation?.demand, 'people')}</small>
            </article>
            <article>
              <span>Planning shelter gap</span>
              <strong>
                {shelterSpaces?.gap?.planning.toLocaleString() ?? 'Unavailable'}
              </strong>
              <small>
                {shelterSpaces?.supply?.applied_quantity.toLocaleString() ?? 0}{' '}
                matched practice spaces applied
              </small>
            </article>
            <article>
              <span>{serviceDays}-day meals</span>
              <strong>
                {meals?.demand?.planning.toLocaleString() ?? 'Unavailable'}
              </strong>
              <small>{rangeText(meals?.demand, 'meals')}</small>
            </article>
            <article>
              <span>{serviceDays}-day potable water</span>
              <strong>
                {water?.demand?.planning.toLocaleString() ?? 'Unavailable'}
              </strong>
              <small>{rangeText(water?.demand, 'liters')}</small>
            </article>
          </div>

          <div className="resource-demand-supply">
            <CheckCircle2 size={16} />
            <span>
              <strong>
                {appliedSupply.length} unit-matched practice record
                {appliedSupply.length === 1 ? '' : 's'}{' '}
                {response.status === 'unavailable' ? 'retained' : 'applied'}
              </strong>
              {response.status === 'unavailable'
                ? 'No supply is subtracted until aggregate population is available. '
                : null}
              {excludedSupply.length} excluded because confirmation, geography,
              or units did not match.
            </span>
          </div>

          <section
            className="resource-demand-cmist"
            aria-label="CMIST need estimates"
          >
            <h3>CMIST need matrix · {response.scenario.hazard}</h3>
            <p>
              Hazard-adjusted planning ranges use aggregate indicators and
              explicit assumptions. Categories overlap and are not additive.
            </p>
            <div>
              {response.cmist.map((need) => (
                <article key={need.domain}>
                  <strong>{need.label}</strong>
                  <span>
                    {need.demand
                      ? rangeText(need.demand, need.unit)
                      : `Unavailable · ${need.unavailable_reason?.replaceAll('_', ' ') ?? 'source missing'}`}
                  </span>
                  <small>{need.basis}</small>
                </article>
              ))}
            </div>
          </section>

          <section
            className="resource-demand-cohorts"
            aria-label="Additional demand lines"
          >
            <h3>Additional demand lines</h3>
            <div className="resource-demand-lines">
              {cohortLines.map((line) => (
                <article key={line.id}>
                  <div>
                    <span>{line.label}</span>
                    <strong>
                      {line.demand
                        ? line.demand.planning.toLocaleString()
                        : 'Unavailable'}
                    </strong>
                  </div>
                  <small>
                    {line.demand
                      ? rangeText(line.demand, line.unit)
                      : line.unavailable_reason?.replaceAll('_', ' ')}
                  </small>
                  <em>{line.basis}</em>
                </article>
              ))}
            </div>
          </section>

          <section
            className="resource-demand-capacity"
            aria-label="County shelter capacity"
          >
            <div>
              <strong>County-published shelter capacity</strong>
              <span>
                {response.county_capacity.status === 'published' &&
                response.county_capacity.capacity !== undefined
                  ? `${response.county_capacity.capacity.toLocaleString()} ${unitLabels[response.county_capacity.unit] ?? response.county_capacity.unit}`
                  : 'Not published'}
              </span>
            </div>
            <p>
              {capacityGap?.unavailable_reason === 'capacity_not_published'
                ? 'A numeric capacity gap is withheld until a public, current County capacity source exists; practice supply is not County capacity.'
                : 'Published capacity is compared with modeled demand.'}
            </p>
          </section>

          <div className="resource-demand-lines">
            {modeledLines.map((line) => (
              <article key={line.id}>
                <div>
                  <span>{line.label}</span>
                  <strong>
                    {line.demand?.planning.toLocaleString()}{' '}
                    {unitLabels[line.unit] ?? line.unit.replaceAll('_', ' ')}
                  </strong>
                </div>
                <small>{rangeText(line.demand, line.unit)}</small>
                {line.gap ? (
                  <em>
                    Planning gap {line.gap.planning.toLocaleString()} after{' '}
                    {line.supply?.applied_quantity.toLocaleString() ?? 0}{' '}
                    matched supply
                  </em>
                ) : null}
              </article>
            ))}
          </div>

          <section className="resource-demand-service-animals">
            <strong>Service-animal provisions</strong>
            <ul>
              {response.service_animal_provisions.map((provision) => (
                <li key={provision}>{provision}</li>
              ))}
            </ul>
          </section>

          <div className="resource-demand-unavailable">
            <div>
              <ShieldCheck size={17} />
              <span>
                <strong>Unavailable is not zero</strong>
                Unsupported coefficients remain explicit local validation gaps.
              </span>
            </div>
            <ul>
              {unavailableLines.slice(0, 6).map((line) => (
                <li key={line.id}>
                  <strong>{line.label}</strong>
                  <span>{line.unavailable_reason?.replaceAll('_', ' ')}</span>
                </li>
              ))}
            </ul>
          </div>

          <details className="resource-demand-evidence">
            <summary>
              <Database size={15} />
              Model evidence and assumptions
            </summary>
            <div>
              <p>
                Calculation <strong>{response.calculation_id}</strong> uses the
                aggregate population range and versioned assumptions. Identical
                canonical requests produce identical results.
              </p>
              <ul>
                {response.sources.map((source) => (
                  <li key={source.id}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.title}
                    </a>
                    <small>{source.data_date}</small>
                    <span>{source.use}</span>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </>
      ) : null}
    </section>
  )
}
