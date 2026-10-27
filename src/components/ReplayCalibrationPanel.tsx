import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Download,
  ExternalLink,
  FileClock,
  FlaskConical,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react'

import {
  downloadHistoricalReplayReport,
  formatReplayValue,
  useHistoricalReplay,
} from '../lib/historical-replay'
import type {
  ReplayCheck,
  ReplayFixture,
  ReplayReport,
} from '../lib/historical-replay'

const groupOrder = ['Map', 'Model', 'Match', 'Operate'] as const

const outcomeIcons = {
  pass: CheckCircle2,
  warn: AlertTriangle,
  unavailable: CircleHelp,
  fail: XCircle,
} as const

const hazardLabels: Record<ReplayFixture['hazard'], string> = {
  hurricane: 'Hurricane',
  tsunami_earthquake: 'Tsunami / earthquake',
  flood: 'Flood',
  wildfire: 'Wildfire',
  volcanic: 'Volcanic',
}

export function ReplayCalibrationPanel() {
  const { catalogState, runState, retryCatalog, run, resetReport } =
    useHistoricalReplay()
  const [selectedID, setSelectedID] = useState('')
  const reportRef = useRef<HTMLDivElement>(null)

  const selectedFixture = catalogState.catalog?.fixtures.find(
    (fixture) => fixture.id === selectedID,
  )

  useEffect(() => {
    if (!selectedID && catalogState.catalog?.fixtures[0]) {
      setSelectedID(catalogState.catalog.fixtures[0].id)
    }
  }, [catalogState.catalog, selectedID])

  useEffect(() => {
    if (runState.status === 'ready') {
      reportRef.current?.focus()
    }
  }, [runState.status])

  if (catalogState.status === 'loading') {
    return (
      <section
        className="replay-panel is-loading"
        aria-label="Replay and calibration"
        role="status"
      >
        <LoaderCircle className="spin" size={20} />
        <div>
          <strong>Loading historical and exercise evidence</strong>
          <p>Opening the controlled fixture catalog.</p>
        </div>
      </section>
    )
  }

  if (catalogState.status === 'error') {
    return (
      <section
        className="replay-panel is-error"
        aria-label="Replay unavailable"
      >
        <AlertTriangle size={20} />
        <div>
          <strong>Replay catalog unavailable</strong>
          <p>No prior-island fixture or cached report was substituted.</p>
        </div>
        <button
          type="button"
          data-telemetry-action="replay_retry"
          data-telemetry-category="planning"
          onClick={retryCatalog}
        >
          <RefreshCw size={15} /> Retry
        </button>
      </section>
    )
  }

  if (
    catalogState.status === 'empty' ||
    !catalogState.catalog ||
    !selectedFixture
  ) {
    return (
      <section
        className="replay-panel is-empty"
        aria-label="Replay and calibration"
      >
        <FileClock size={20} />
        <div>
          <strong>No reviewed replay fixtures</strong>
          <p>Add and review a controlled source catalog before calibration.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="replay-panel" data-testid="replay-calibration-panel">
      <div className="replay-heading">
        <div>
          <h2>
            <FlaskConical size={17} /> Replay &amp; calibration
          </h2>
          <p>
            <strong>Historical and exercise evidence.</strong> Compare bounded
            expectations with the current deterministic planner. No coefficients
            are tuned and no report changes live plans.
          </p>
        </div>
        <em>{catalogState.catalog.catalog_version}</em>
      </div>

      <div className="replay-disclaimer">
        <ShieldAlert size={18} />
        <p>
          <strong>Training and calibration only — not predictive.</strong>{' '}
          {catalogState.catalog.disclaimer}
        </p>
      </div>

      <div className="replay-catalog" aria-label="Replay fixture catalog">
        {catalogState.catalog.fixtures.map((fixture) => (
          <button
            key={fixture.id}
            type="button"
            className={fixture.id === selectedID ? 'is-selected' : ''}
            aria-pressed={fixture.id === selectedID}
            data-telemetry-action="replay_fixture_select"
            data-telemetry-category="planning"
            onClick={() => {
              setSelectedID(fixture.id)
              resetReport()
            }}
          >
            <span>
              <strong>{hazardLabels[fixture.hazard]}</strong>
              <small>
                {fixture.island} · {fixture.jurisdiction}
              </small>
            </span>
            <em>
              {fixture.fixture_kind === 'synthetic_exercise'
                ? 'Exercise'
                : fixture.evidence_quality}
            </em>
          </button>
        ))}
      </div>

      <FixtureDetail fixture={selectedFixture} />

      <div className="replay-run-actions">
        <button
          type="button"
          className="replay-run-button"
          disabled={runState.status === 'running'}
          aria-busy={runState.status === 'running'}
          data-telemetry-action="replay_run"
          data-telemetry-category="planning"
          onClick={() => void run(selectedFixture.id)}
        >
          {runState.status === 'running' ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Play size={16} />
          )}
          {runState.status === 'running'
            ? 'Running deterministic checks'
            : 'Run calibration replay'}
        </button>
        <small>
          Controlled fixture ID + current standard only. No source URL, payload,
          or free text is sent.
        </small>
      </div>

      {runState.status === 'error' && (
        <div className="replay-run-error" role="alert">
          <AlertTriangle size={18} />
          <div>
            <strong>Replay run unavailable</strong>
            <p>
              The historical evidence was not rewritten. Retry this fixture.
            </p>
          </div>
          <button
            type="button"
            data-telemetry-action="replay_retry"
            data-telemetry-category="planning"
            onClick={() => void run(selectedFixture.id)}
          >
            Retry
          </button>
        </div>
      )}

      {runState.report && (
        <ReplayResult report={runState.report} reportRef={reportRef} />
      )}
    </section>
  )
}

function FixtureDetail({ fixture }: { fixture: ReplayFixture }) {
  const limited =
    Object.values(fixture.coverage).some(
      (value) => value === 'unavailable' || value === 'partial',
    ) || fixture.sources.some((source) => source.availability === 'stale')
  return (
    <article className="replay-fixture-detail">
      <div>
        <span>
          {fixture.fixture_kind === 'synthetic_exercise'
            ? 'Synthetic exercise input'
            : 'Observed aggregate evidence'}
        </span>
        <h3>{fixture.label}</h3>
        <p>
          {fixture.observation_window} · area template{' '}
          {fixture.area_template_id}
        </p>
      </div>
      {limited && (
        <div className="replay-source-limited">
          <AlertTriangle size={15} />
          <span>
            <strong>Source-limited</strong>
            Unsupported checks stay unavailable; stale evidence stays labeled.
          </span>
        </div>
      )}
      <dl className="replay-coverage">
        {Object.entries(fixture.coverage).map(([domain, status]) => (
          <div key={domain}>
            <dt>{domain.replaceAll('_', ' ')}</dt>
            <dd className={`is-${status}`}>{status.replaceAll('_', ' ')}</dd>
          </div>
        ))}
      </dl>
      <details className="replay-source-details">
        <summary>
          <span>
            {fixture.sources.length} curated source
            {fixture.sources.length === 1 ? '' : 's'}
          </span>
          <ChevronDown size={16} />
        </summary>
        <div>
          {fixture.sources.map((source) => (
            <article key={source.id}>
              <a href={source.url} target="_blank" rel="noreferrer">
                <span>
                  <strong>{source.title}</strong>
                  <small>
                    {source.authority} · reviewed {source.reviewed_at} ·{' '}
                    {source.availability.replaceAll('_', ' ')}
                  </small>
                </span>
                <ExternalLink size={14} />
              </a>
              <p>{source.supported_use}</p>
              <small>
                {source.research_decision}: {source.limitations}
              </small>
            </article>
          ))}
        </div>
      </details>
      <ul className="replay-limitations">
        {fixture.limitations.map((limitation) => (
          <li key={limitation}>{limitation}</li>
        ))}
      </ul>
    </article>
  )
}

function ReplayResult({
  report,
  reportRef,
}: {
  report: ReplayReport
  reportRef: React.RefObject<HTMLDivElement | null>
}) {
  const grouped = useMemo(
    () =>
      groupOrder.map((group) => ({
        group,
        checks: report.checks.filter((check) => check.group === group),
      })),
    [report.checks],
  )
  return (
    <div
      className="replay-result"
      ref={reportRef}
      tabIndex={-1}
      aria-label="Calibration replay report"
    >
      <div className="replay-result-heading">
        <div>
          <strong>Deterministic calibration report</strong>
          <span>{report.fixture_label}</span>
          <small>
            {report.jurisdiction} · {report.run_id} ·{' '}
            {report.calibration_version}
          </small>
        </div>
        <button
          type="button"
          data-telemetry-action="replay_export"
          data-telemetry-category="planning"
          onClick={() => downloadHistoricalReplayReport(report)}
        >
          <Download size={15} /> Export labeled report
        </button>
      </div>
      <div className="replay-model-versions">
        {report.model_versions.map((version) => (
          <span key={version.component}>
            {version.component.replaceAll('_', ' ')}{' '}
            <strong>{version.version}</strong>
          </span>
        ))}
      </div>
      <div className="replay-check-groups">
        {grouped.map(({ group, checks }) => (
          <section key={group}>
            <h3>{group}</h3>
            {checks.map((check) => (
              <ReplayCheckRow key={check.id} check={check} />
            ))}
          </section>
        ))}
      </div>
      <p className="replay-report-disclaimer">{report.disclaimer}</p>
    </div>
  )
}

function ReplayCheckRow({ check }: { check: ReplayCheck }) {
  const Icon = outcomeIcons[check.outcome]
  return (
    <article className={`replay-check is-${check.outcome}`}>
      <div className="replay-check-heading">
        <Icon size={16} />
        <span>
          <strong>{check.label}</strong>
          <small>{check.outcome}</small>
        </span>
      </div>
      <dl>
        <div>
          <dt>Actual</dt>
          <dd>{formatReplayValue(check.actual)}</dd>
        </div>
        <div>
          <dt>Expected boundary</dt>
          <dd>{formatReplayValue(check.expected)}</dd>
        </div>
      </dl>
      {check.mismatches.length > 0 && (
        <ul>
          {check.mismatches.map((mismatch) => (
            <li key={mismatch}>{mismatch}</li>
          ))}
        </ul>
      )}
      <small>
        Evidence: {check.evidence_source_ids.join(' · ')}
        {check.sensitivity_notes.length > 0
          ? ` · ${check.sensitivity_notes.join(' ')}`
          : ''}
      </small>
    </article>
  )
}
