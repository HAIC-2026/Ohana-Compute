import { AlertTriangle, CheckCircle2 } from 'lucide-react'

import type { AfnPlanningAnalysis } from '../lib/planning-analysis'

export function AfnPlanningHotspots({
  analysis,
}: {
  analysis: AfnPlanningAnalysis
}) {
  return (
    <section
      className="afn-hotspots"
      aria-labelledby="afn-hotspots-title"
      data-testid="afn-planning-hotspots"
    >
      <div className="afn-hotspots-heading">
        <div>
          <strong id="afn-hotspots-title">AFN planning hotspots</strong>
          <span>Data-derived weaknesses · AI drafts wording only</span>
        </div>
        <em className={`is-${analysis.primaryHotspot.level}`}>
          {analysis.primaryHotspot.score}/100
        </em>
      </div>
      <div className="afn-hotspot-primary">
        <AlertTriangle size={17} />
        <div>
          <strong>{analysis.primaryHotspot.domain}</strong>
          <p>{analysis.primaryHotspot.summary}</p>
          <span>{analysis.primaryHotspot.evidence.join(' · ')}</span>
        </div>
      </div>
      <ul>
        {analysis.hotspots.slice(0, 3).map((hotspot) => (
          <li key={hotspot.domain}>
            <CheckCircle2 size={14} />
            <span>
              <strong>
                {hotspot.domain} · {hotspot.score}/100
              </strong>
              <small>{hotspot.recommendedAction}</small>
            </span>
          </li>
        ))}
      </ul>
      {analysis.unavailableSources.length > 0 ? (
        <p>
          Source gap: {analysis.unavailableSources.join(' · ')}. Treat scores as
          provisional until official coverage is restored.
        </p>
      ) : null}
    </section>
  )
}
