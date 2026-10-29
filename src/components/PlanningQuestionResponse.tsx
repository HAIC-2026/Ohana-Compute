import { useMemo } from 'react'
import type { PlanningQuestion } from '../lib/statewide-conversation'
import { statewidePlanningAreas } from '../lib/statewide-conversation'
import {
  buildGeographicFocus,
  useGeographicEvidenceExpiry,
  useGeographicHazards,
  useGeographicProfiles,
} from '../lib/geographic-focus'
import { currentSource } from '../lib/what-if'

const indicatorLabels = {
  age: 'Kūpuna (age 65+)',
  disability: 'People with disabilities',
  language: 'Limited English speakers',
  transportation: 'Households without vehicles',
  gaps: 'Evidence gaps',
}
const indicatorFields = {
  age: 'age_65_or_older',
  disability: 'with_disability',
  language: 'limited_english',
  transportation: 'no_vehicle_households',
} as const

export function PlanningQuestionResponse({
  question,
  onSelect,
}: {
  question: PlanningQuestion
  onSelect: (id: string) => void
}) {
  const candidates = useMemo(
    () =>
      statewidePlanningAreas.filter((area) =>
        question.county && question.island === 'Maui'
          ? ['Maui', 'Molokaʻi', 'Lānaʻi', 'Kahoʻolawe'].includes(area.island)
          : question.county && question.island === 'Kauaʻi'
            ? ['Kauaʻi', 'Niʻihau'].includes(area.island)
            : area.island === question.island,
      ),
    [question.island, question.county],
  )
  const profiles = useGeographicProfiles(candidates, true)
  const screens = useGeographicHazards(candidates, question.hazard, true)
  useGeographicEvidenceExpiry(profiles, screens, true)
  const entries = buildGeographicFocus(
    candidates,
    profiles,
    question.hazard,
    screens,
  )
  const rows = entries
    .map(({ area, focus }) => {
      const svi = profiles[area.id]?.profile?.svi
      const raw =
        question.indicator === 'gaps'
          ? null
          : svi?.[indicatorFields[question.indicator]]
      const value =
        currentSource(svi?.source) &&
        focus.signals.sviPercentile !== null &&
        typeof raw === 'number' &&
        Number.isFinite(raw) &&
        raw >= 0
          ? raw
          : null
      return { area, focus, svi, value }
    })
    .sort((a, b) => {
      const eligibleA =
        a.value !== null && a.focus.signals.hazard === 'elevated'
      const eligibleB =
        b.value !== null && b.focus.signals.hazard === 'elevated'
      return (
        Number(eligibleB) - Number(eligibleA) ||
        (eligibleA && eligibleB
          ? b.value! - a.value!
          : a.area.name.localeCompare(b.area.name))
      )
    })
  const loading = candidates.some(
    (area) => !profiles[area.id] || !screens[area.id],
  )
  const eligible = rows.filter(
    (row) => row.value !== null && row.focus.signals.hazard === 'elevated',
  )
  return (
    <section aria-label="County planning answer">
      <h3>
        {question.island}: {indicatorLabels[question.indicator]}
      </h3>
      <p>
        Rule-based evidence retrieval · afn-planning-questions.v1 · rule:{' '}
        {question.indicator === 'gaps'
          ? 'county-evidence-gaps'
          : 'indicator-and-elevated-center'}
        . Not live AI.
      </p>
      {loading && (
        <p role="status">Checking configured communities and public sources…</p>
      )}
      {question.indicator !== 'gaps' && (
        <p>
          {eligible.length
            ? 'Listed first: fresh, compatible tract indicators with elevated area-center hazard screening, ordered by indicator count.'
            : 'No supported ranking yet. Missing or incompatible evidence is not low need.'}{' '}
          This cannot answer how many people are exposed: a tract count and one
          area-center check are not a population/hazard overlay. Coverage is
          limited to {candidates.length} configured planning{' '}
          {candidates.length === 1 ? 'area' : 'areas'}, not every community in
          the County.
        </p>
      )}
      {question.indicator === 'gaps' && (
        <p>
          County verification is still needed for accessible shelter capacity,
          staffing, clinical power requirements, visitors, homelessness, pets,
          offline reach and current routes. Not all these indicators have
          comparable public local estimates. No available-team or capacity total
          is inferred.
        </p>
      )}
      {!rows.length && (
        <p>
          No configured community evidence for this scope. Coverage is unknown,
          not zero need.
        </p>
      )}
      <dl className="statewide-chat-questions">
        {rows.map(({ area, focus, svi, value }) => (
          <div key={area.id}>
            <dt>
              <button type="button" onClick={() => onSelect(area.id)}>
                {area.name}
              </button>
            </dt>
            <dd>
              {question.indicator !== 'gaps' && (
                <p>
                  {indicatorLabels[question.indicator]}:{' '}
                  {value === null ? 'unknown' : value.toLocaleString()} ·{' '}
                  {focus.signals.hazard === 'elevated'
                    ? 'elevated center screening'
                    : focus.signals.hazard === 'unknown'
                      ? 'hazard unknown'
                      : 'other mapped center screening'}
                  .
                </p>
              )}
              <p>{focus.reason}</p>
              <details>
                <summary>Evidence for {area.name}</summary>
                <p>
                  {focus.evidence}. {svi?.location ?? 'Tract unavailable'}. CDC
                  vintage:{' '}
                  {svi?.source.vintage ??
                    (svi?.source.id === 'cdc-svi-2022' ? '2022' : 'unknown')}
                  . Counts may repeat where centers share a tract; do not sum
                  them or infer resident locations.
                </p>
                <p>
                  <a
                    href="https://www.atsdr.cdc.gov/place-health/php/svi/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    CDC/ATSDR SVI documentation
                  </a>{' '}
                  ·{' '}
                  <a
                    href="https://geoportal.hawaii.gov/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Hawaiʻi Statewide GIS hazard layers
                  </a>
                  . Source checks and freshness are shown above; no current
                  evacuation order is inferred.
                </p>
                {screens[area.id]?.sources
                  ?.filter((source) => source.url.startsWith('https://'))
                  .map((source) => (
                    <p key={source.url}>
                      <a href={source.url} target="_blank" rel="noreferrer">
                        {source.authority}: screened hazard source
                      </a>
                    </p>
                  ))}
              </details>
            </dd>
          </div>
        ))}
      </dl>
      <p>
        County leads verification and decisions; State ESF-6 supports. Use the
        community button to inspect the map and its evidence.
      </p>
    </section>
  )
}
