import { useId, useState } from 'react'
import type { CommunityProfile } from '../lib/community-profile'
import { hazards } from '../lib/mock-data'
import { planningCountyForIsland } from '../lib/geographic-focus'
import type { ScenarioDrivers } from '../lib/what-if'
import {
  modelWhatIf,
  scenarioBounds,
  scenarioSensitivity,
  whatIfVersion,
} from '../lib/what-if'
import type { ResourceDemandRange } from '../lib/resource-demand'

const labels = {
  warningHours: 'Warning lead time (hours)',
  outageDays: 'Outage duration (days)',
  shelterUptake: 'Shelter uptake (%)',
  supportDays: 'Days of support',
}
function range(value: ResourceDemandRange) {
  return `${value.low.toLocaleString()}–${value.high.toLocaleString()} (planning ${value.planning.toLocaleString()})`
}
const countyFips: Record<string, string> = {
  Hawaii: '001',
  Honolulu: '003',
  Kauai: '007',
  Maui: '009',
}

export function WhatIfScenario({
  profile,
  scenario,
  onChange,
  place,
  island,
}: {
  profile: CommunityProfile | null | undefined
  scenario: ScenarioDrivers
  onChange: (scenario: ScenarioDrivers) => void
  place: string
  island: string
}) {
  const id = useId()
  const [stock, setStock] = useState('')
  const mealStock = stock === '' ? null : Number(stock)
  const county = planningCountyForIsland(island)
  const acsGeography = profile?.acs?.geography
  const geography = acsGeography?.name.replace(/[ʻ’']/g, '').toLowerCase() ?? ''
  // Fallback tract resolution names only the tract; use exact Hawaiʻi FIPS.
  const countyMatches =
    county !== null &&
    (geography.includes(`${county.toLowerCase()} county`) ||
      (acsGeography?.state_code === '15' &&
        acsGeography.county_code === countyFips[county]))
  const population =
    countyMatches && /\bcensus tract\b/.test(geography)
      ? profile?.acs?.population
      : undefined
  const validStock =
    mealStock === null ||
    (Number.isSafeInteger(mealStock) && mealStock >= 0 && mealStock <= 1e9)
  const model = validStock
    ? modelWhatIf(population, profile?.acs?.source, scenario, mealStock)
    : null
  const sensitivity = validStock
    ? scenarioSensitivity(population, profile?.acs?.source, scenario, mealStock)
    : []
  return (
    <section aria-label="What-if scenario simulator">
      <h3>What if conditions change?</h3>
      <p>
        {place}. Planning model, not a forecast. Changes do not update a saved
        plan or activate resources. Simulator hazard is independent of the map
        practice context.
      </p>
      <label className="what-if-control" htmlFor={`${id}-hazard`}>
        Hazard
        <select
          id={`${id}-hazard`}
          value={scenario.hazard}
          onChange={(event) => {
            const hazard = hazards.find(
              (item) => item.id === event.target.value,
            )
            if (hazard) onChange({ ...scenario, hazard: hazard.id })
          }}
        >
          {hazards.map((hazard) => (
            <option key={hazard.id} value={hazard.id}>
              {hazard.shortLabel}
            </option>
          ))}
        </select>
      </label>
      {Object.entries(labels).map(([key, label]) => {
        const driver = key as keyof typeof labels
        const [min, max] = scenarioBounds[driver]
        return (
          <label className="what-if-control" key={key} htmlFor={`${id}-${key}`}>
            <span>
              {label}: <strong>{scenario[driver]}</strong>
            </span>
            <input
              id={`${id}-${key}`}
              type="range"
              min={min}
              max={max}
              step="1"
              value={scenario[driver]}
              onChange={(event) =>
                onChange({ ...scenario, [driver]: Number(event.target.value) })
              }
            />
          </label>
        )
      })}
      <label className="what-if-control" htmlFor={`${id}-stock`}>
        Practice meal stock (total, optional)
        <input
          id={`${id}-stock`}
          type="number"
          min="0"
          max="1000000000"
          step="1"
          value={stock}
          onChange={(event) => setStock(event.target.value)}
        />
      </label>
      {!validStock && (
        <p role="alert">
          Use a whole-number meal stock from 0 to 1,000,000,000, or leave it
          blank for unknown.
        </p>
      )}
      <div aria-live="polite">
        {!model ? (
          <p>
            Modeled needs unavailable: a fresh ACS population with a margin of
            error, County-compatible tract geography and valid inputs are
            required. Unknown is not zero.
          </p>
        ) : (
          <>
            <h4>Modeled needs ranges</h4>
            <dl className="statewide-chat-questions">
              {(
                [
                  ['Shelter users (people)', model.people],
                  ['Meals (total)', model.meals],
                  ['Water (gallons)', model.water],
                  ['Powered shelter support (person-days)', model.poweredDays],
                  [
                    'Outage beyond planned support (person-days)',
                    model.outageBeyondSupport,
                  ],
                ] satisfies Array<[string, ResourceDemandRange]>
              ).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{range(value)}</dd>
                </div>
              ))}
              <div>
                <dt>Meal gap (total)</dt>
                <dd>
                  {model.mealGap
                    ? range(model.mealGap)
                    : 'Unknown — no practice stock entered'}
                </dd>
              </div>
            </dl>
            <p>
              Outage beyond support is a time-window gap, not verified resource
              capacity. Other supply gaps remain unknown. Entered meals are a
              planner assumption, not verified or available inventory.
            </p>
            <h4>Sensitivity: {model.mealGap ? 'meal gap' : 'meal demand'}</h4>
            <p>
              Largest tested effect:{' '}
              {sensitivity[0]?.delta
                ? sensitivity[0].label
                : 'none at the current bounds or stock'}
              . One-at-a-time comparisons, not probabilities.
            </p>
            <dl className="statewide-chat-questions">
              {sensitivity.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>+{item.delta.toLocaleString()} meals</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>
      <details>
        <summary>Assumptions, sources and rule</summary>
        <p>
          {whatIfVersion}. ACS source:{' '}
          {profile?.acs?.source.authority ?? 'unavailable'} ·{' '}
          {profile?.acs?.source.vintage ?? 'vintage unknown'} ·{' '}
          {profile?.acs?.geography.name ?? 'geography unknown'}. This is the
          source tract, not the whole community or an exposed-population
          estimate.
        </p>
        <p>
          Range = population ± published ACS margin of error, multiplied by
          uptake; rounded up. Uptake is a planner assumption, not an AFN
          prevalence rate. Meals = shelter users × 3 × support days
          (illustrative planning coefficient). Water = shelter users × 1 gallon
          × support days. Powered support = shelter users × outage days; outage
          beyond support = shelter users × max(0, outage days − support days).
          These are not medical-device demand, generator sizing or kWh. Meal gap
          = max(0, meals − entered stock). No CMIST subgroups are summed.
        </p>
        <p>
          Hazard and warning time have no invented numeric multiplier.{' '}
          {scenario.warningHours < 6
            ? 'Little warning: County should verify pre-positioned accessible movement and trusted offline alerts.'
            : 'County should verify warning dissemination and accessible movement windows.'}{' '}
          {scenario.outageDays > 0
            ? 'Verify backup power, elevator access and medication continuity for the modeled outage.'
            : 'Zero assumed outage is not assurance of power.'}
        </p>
        <p>
          <a
            href="https://www.census.gov/programs-surveys/acs/guidance/estimates.html"
            target="_blank"
            rel="noreferrer"
          >
            ACS estimate guidance
          </a>{' '}
          ·{' '}
          <a
            href="https://www.ready.gov/water"
            target="_blank"
            rel="noreferrer"
          >
            Ready.gov water planning
          </a>
          . Ranges omit uptake uncertainty, visitor demand and location-specific
          losses; County validation required.
        </p>
      </details>
    </section>
  )
}
