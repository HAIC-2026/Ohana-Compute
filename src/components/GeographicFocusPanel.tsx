import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

import {
  orderGeographicFocus,
  summarizeGeographicFocus,
} from '../lib/geographic-focus'
import type { GeographicFocus } from '../lib/geographic-focus'
import type { HazardId, PlanningArea } from '../lib/mock-data'

export function GeographicFocusPanel({
  island,
  hazard,
  entries,
  selectedAreaId,
  onSelect,
  onClose,
  onOpenPlan,
}: {
  island: string
  hazard: HazardId
  entries: Array<{ area: PlanningArea; focus: GeographicFocus }>
  selectedAreaId: string
  onSelect: (id: string) => void
  onClose: () => void
  onOpenPlan: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const selectedRef = useRef<HTMLElement>(null)
  const previousSelection = useRef(selectedAreaId)
  useEffect(() => {
    closeRef.current?.focus()
  }, [])
  useEffect(() => {
    if (previousSelection.current !== selectedAreaId) {
      selectedRef.current?.scrollIntoView({ block: 'start' })
      previousSelection.current = selectedAreaId
    }
  }, [selectedAreaId])
  const ordered = orderGeographicFocus(entries)
  const selected = entries.find((entry) => entry.area.id === selectedAreaId)
  const snapshot = summarizeGeographicFocus(entries)
  const categories = [
    { tier: 'review-first', label: 'Review first' },
    { tier: 'review-locally', label: 'Review locally' },
    { tier: 'verify', label: 'Unknown' },
  ] as const
  const groups = [
    {
      title: 'Provisional review queue',
      entries: ordered.filter((entry) => entry.focus.tier !== 'verify'),
    },
    {
      title: 'Evidence gaps · priority unknown',
      entries: ordered.filter((entry) => entry.focus.tier === 'verify'),
    },
  ]
  return (
    <section
      className="geographic-focus"
      aria-labelledby="geographic-focus-title"
      data-telemetry-category="planning"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <header>
        <div>
          <h2 id="geographic-focus-title">Where to focus</h2>
          <p>
            {island} · {hazard} planning
          </p>
        </div>
        <button
          ref={closeRef}
          type="button"
          aria-label="Close location comparison"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <div className="focus-scroll">
        <p className="focus-limit">
          Area-center hazard screening + public vulnerability. Provisional
          review cues, not official priorities or whole-area exposure.
        </p>
        <section
          className="focus-snapshot"
          aria-label="Island screening snapshot"
        >
          <h3>Island screening snapshot</h3>
          <div
            className="focus-distribution"
            role="img"
            aria-label={`${snapshot.total} area centers: ${snapshot.counts['review-first']} review first, ${snapshot.counts['review-locally']} review locally, ${snapshot.counts.verify} unknown`}
          >
            {categories
              .filter(({ tier }) => snapshot.counts[tier] > 0)
              .map(({ tier }) => (
                <span
                  key={tier}
                  className={`is-${tier}`}
                  style={{ flexGrow: snapshot.counts[tier] }}
                />
              ))}
          </div>
          <dl className="focus-counts">
            {categories.map(({ tier, label }) => (
              <div key={tier} className={`is-${tier}`}>
                <dt>{label}</dt>
                <dd>{snapshot.counts[tier]}</dd>
              </div>
            ))}
          </dl>
          <p>{snapshot.finding}</p>
          <small>
            Center counts, not people or independent tracts. Rule-based, not AI.
          </small>
        </section>
        {selected && (
          <section
            ref={selectedRef}
            className="focus-next"
            aria-label={`Next action for ${selected.area.name}`}
          >
            <h3>{selected.area.name}: next check</h3>
            <strong>{selected.focus.label}</strong>
            <p>{selected.focus.action}</p>
            <button type="button" className="focus-plan" onClick={onOpenPlan}>
              Model needs &amp; match partners
            </button>
            <dl className="focus-signals">
              <div>
                <dt>
                  {hazard === 'hurricane' ? 'Flood only' : `Mapped ${hazard}`} ·
                  center point
                </dt>
                <dd>
                  {selected.focus.signals.hazard === 'elevated'
                    ? 'Elevated mapped signal'
                    : selected.focus.signals.hazard === 'other-mapped'
                      ? 'Other mapped signal · not an all-clear'
                      : 'Unknown · verify coverage'}
                </dd>
                {hazard === 'hurricane' && (
                  <small>Wind and surge are not assessed.</small>
                )}
              </div>
              <div>
                <dt>Social vulnerability · tract</dt>
                <dd>
                  {selected.focus.signals.sviPercentile === null
                    ? 'Unknown · verify compatible evidence'
                    : `${(selected.focus.signals.sviPercentile * 100).toFixed(1)}th national percentile`}
                </dd>
                {selected.focus.signals.sviPercentile !== null && (
                  <>
                    <div className="focus-percentile" aria-hidden="true">
                      <span
                        style={{
                          left: `${selected.focus.signals.sviPercentile * 100}%`,
                        }}
                      />
                    </div>
                    <small>
                      0–100 national scale · marker at 75 is the review-first
                      reference
                    </small>
                  </>
                )}
              </div>
            </dl>
            <details>
              <summary>Evidence &amp; method</summary>
              <p>{selected.focus.reason}</p>
              <p>{selected.focus.signals.hazardReason}</p>
              <p>{selected.focus.evidence}</p>
              <p>
                Check all five needs: communication, medical, independence,
                safety and transportation. State ESF-6 supports the County lead.
              </p>
              {selected.area.responseFocus?.[hazard] && (
                <p>
                  <strong>Practice area context:</strong>{' '}
                  {selected.area.responseFocus[hazard]}
                </p>
              )}
              <p>
                SVI release comes from source metadata, or the backend’s fixed
                CDC 2022 source contract. Source freshness is reported by the
                backend, not inferred from the release year.
              </p>
              <p>
                One representative center profile per named area; it does not
                describe the whole area. Centers may share a tract; they are not
                independent population totals. SVI is a national relative
                social-vulnerability indicator, not a local hazard forecast. A
                high mapped hazard signal at the center together with SVI in the
                highest quarter (≥75th percentile) prompts “Review first.” This
                is a screening rule, not a validated priority threshold. Within
                each group, locations are alphabetical, not scored.
              </p>
              <p>
                Only complete, fresh profiles with a dated SVI tract indicator
                enter the queue. Other geographies, missing dates and source
                failures remain unknown. Different vintages or a mismatched
                county block the queue. No ACS, ZIP medical counts, national
                risk ratings or practice readiness scores are blended into a
                score.
              </p>
              <p>
                The selected hazard changes the official point screening and
                next check. Hurricane uses flood screening only: wind and surge
                are not assessed. An outside or lower mapped point does not
                clear the surrounding area. Missing or stale hazard evidence
                stays unknown. No tract/hazard intersection, exposed population,
                operational shortage or availability is inferred.
              </p>
            </details>
          </section>
        )}
        {groups.map((group) => (
          <section
            key={group.title}
            className="focus-group"
            aria-label={group.title}
          >
            <h3>
              {group.title} <span>({group.entries.length})</span>
            </h3>
            {group.entries.length === 0 && <p>No locations in this group.</p>}
            <ul>
              {group.entries.map(({ area, focus }) => (
                <li key={area.id}>
                  <button
                    type="button"
                    className={`focus-location is-${focus.tier}`}
                    aria-pressed={area.id === selectedAreaId}
                    onClick={() => onSelect(area.id)}
                  >
                    <strong>{area.name}</strong>
                    <span className="focus-tier">{focus.label}</span>
                    <span>{focus.reason}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  )
}
