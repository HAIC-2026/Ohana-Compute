import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'

import {
  findPlanningJurisdiction,
  findStatewidePlanningArea,
  usePlanningAreaCatalog,
} from '../lib/planning-areas'

export function StatewidePlanningDepthPanel({ areaId }: { areaId: string }) {
  const catalog = usePlanningAreaCatalog()
  const area = findStatewidePlanningArea(catalog.snapshot, areaId)
  const jurisdiction = findPlanningJurisdiction(catalog.snapshot, areaId)

  if (catalog.status === 'loading') {
    return (
      <section
        className="planning-depth-panel is-loading"
        aria-label="Statewide planning depth"
      >
        <span className="planning-depth-kicker">Statewide planning depth</span>
        <strong>Loading representative County workflow…</strong>
        <div className="planning-depth-skeleton" />
      </section>
    )
  }

  if (catalog.status === 'error' || catalog.status === 'unavailable') {
    return (
      <section
        className="planning-depth-panel is-error"
        aria-label="Statewide planning depth unavailable"
      >
        <div>
          <span className="planning-depth-kicker">
            <AlertTriangle size={15} /> Statewide planning depth
          </span>
          <strong>Representative workflow unavailable</strong>
          <p>
            No Oʻahu workflow was substituted. Retry the curated practice
            catalog before using local resources or routes.
          </p>
        </div>
        <button type="button" onClick={catalog.retry}>
          <RefreshCw size={15} /> Retry
        </button>
      </section>
    )
  }

  if (!catalog.snapshot || !area || !jurisdiction) {
    return (
      <section
        className="planning-depth-panel is-limited"
        aria-label="Statewide planning depth limited"
      >
        <span className="planning-depth-kicker">Statewide planning depth</span>
        <strong>No representative workflow for this area</strong>
        <p>
          Existing local practice data remains available, but this area is not
          part of the four County-level representative workflows.
        </p>
      </section>
    )
  }

  return (
    <section
      className="planning-depth-panel"
      aria-label="Statewide planning depth"
    >
      <div className="planning-depth-heading">
        <div>
          <span className="planning-depth-kicker">
            <CheckCircle2 size={15} /> Statewide planning depth · practice
          </span>
          <strong>{area.briefing.name}</strong>
          <p>
            {jurisdiction.name} · {area.communities.join(' · ')}
          </p>
        </div>
        <span className="planning-depth-status">
          {catalog.snapshot.provenance.freshness === 'fresh'
            ? 'Reviewed'
            : 'Review overdue'}
        </span>
      </div>
      <div className="planning-depth-summary">
        <span>
          <strong>
            {catalog.snapshot.summary.planning_jurisdictions_total}
          </strong>
          Chapter 127A jurisdictions
        </span>
        <span>
          <strong>{catalog.snapshot.summary.political_counties_total}</strong>
          political counties
        </span>
        <span>
          <strong>{catalog.snapshot.summary.representative_workflows}</strong>
          representative workflows
        </span>
      </div>
      <p>{jurisdiction.scope_note}</p>
      <small>
        AFN fixture: {area.afn_fixture_key} · County plan link:{' '}
        {area.shelter_plan_jurisdiction_id} · Resources and routes require local
        validation.
      </small>
      <small>
        No separate representative workflow yet:{' '}
        {catalog.snapshot.unsupported_areas.join(', ')}.
      </small>
    </section>
  )
}
