import { useCallback, useEffect, useState } from 'react'

import { backendGet, backendPost } from './backend-api'

export type ReplayAvailability =
  'available' | 'stale' | 'unavailable' | 'synthetic_exercise'

export type ReplaySource = {
  id: string
  title: string
  authority: string
  url: string
  retrieved_at: string
  reviewed_at: string
  fresh_until: string
  availability: ReplayAvailability
  evidence_class: 'observed_aggregate' | 'synthetic_exercise'
  supported_use: string
  limitations: string
  research_decision: string
}

export type ReplayFixture = {
  id: string
  fixture_version: string
  label: string
  fixture_kind: 'historical_incident' | 'synthetic_exercise'
  hazard: 'hurricane' | 'tsunami_earthquake' | 'flood' | 'wildfire' | 'volcanic'
  jurisdiction: string
  island: string
  area_template_id: string
  observation_window: string
  evidence_quality: string
  coverage: {
    hotspots: string
    resource_demand: string
    trigger_semantics: string
    source_availability: string
    operational_gaps: string
  }
  sources: ReplaySource[]
  limitations: string[]
}

export type ReplayCatalog = {
  schema_version: 'historical-replay-catalog.v1'
  catalog_version: string
  reviewed_at: string
  fixtures: ReplayFixture[]
  disclaimer: string
}

export type ReplayBoundedValue = {
  status: string
  value?: string
  values?: string[]
  low?: number
  high?: number
  unit?: string
}

export type ReplayCheck = {
  id: string
  group: 'Map' | 'Model' | 'Match' | 'Operate'
  label: string
  outcome: 'pass' | 'warn' | 'unavailable' | 'fail'
  actual: ReplayBoundedValue
  expected: ReplayBoundedValue
  evidence_source_ids: string[]
  mismatches: string[]
  sensitivity_notes: string[]
}

export type ReplayReport = {
  schema_version: 'historical-replay-report.v1'
  fixture_id: string
  fixture_label: string
  fixture_kind: ReplayFixture['fixture_kind']
  hazard: ReplayFixture['hazard']
  jurisdiction: string
  island: string
  run_id: string
  generated_at: string
  engine_version: string
  calibration_version: string
  fixture_version: string
  evaluation_standard: 'current'
  model_versions: Array<{ component: string; version: string }>
  checks: ReplayCheck[]
  sources: ReplaySource[]
  limitations: string[]
  disclaimer: string
}

type CatalogState = {
  status: 'loading' | 'ready' | 'empty' | 'error'
  catalog: ReplayCatalog | null
}

export function useHistoricalReplay() {
  const [catalogToken, setCatalogToken] = useState(0)
  const [catalogState, setCatalogState] = useState<CatalogState>({
    status: 'loading',
    catalog: null,
  })
  const [runState, setRunState] = useState<{
    status: 'idle' | 'running' | 'ready' | 'error'
    report: ReplayReport | null
  }>({ status: 'idle', report: null })

  useEffect(() => {
    let active = true
    setCatalogState({ status: 'loading', catalog: null })
    void backendGet<ReplayCatalog>('/api/v1/planning/replays')
      .then((catalog) => {
        if (!active) return
        setCatalogState({
          status: catalog.fixtures.length === 0 ? 'empty' : 'ready',
          catalog,
        })
      })
      .catch(() => {
        if (!active) return
        setCatalogState({ status: 'error', catalog: null })
      })
    return () => {
      active = false
    }
  }, [catalogToken])

  const retryCatalog = useCallback(() => {
    setCatalogToken((current) => current + 1)
  }, [])

  const run = useCallback(async (fixtureId: string) => {
    setRunState({ status: 'running', report: null })
    try {
      const report = await backendPost<
        {
          schema_version: 'historical-replay-request.v1'
          fixture_id: string
          standard: 'current'
        },
        ReplayReport
      >('/api/v1/planning/replays/run', {
        schema_version: 'historical-replay-request.v1',
        fixture_id: fixtureId,
        standard: 'current',
      })
      setRunState({ status: 'ready', report })
      return report
    } catch {
      setRunState({ status: 'error', report: null })
      return null
    }
  }, [])

  const resetReport = useCallback(() => {
    setRunState({ status: 'idle', report: null })
  }, [])

  return {
    catalogState,
    runState,
    retryCatalog,
    run,
    resetReport,
  }
}

function escapeHTML(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function boundedValue(value: ReplayBoundedValue) {
  if (value.values?.length) return value.values.join(' · ')
  if (value.low !== undefined && value.high !== undefined) {
    return `${value.low.toLocaleString()}–${value.high.toLocaleString()} ${value.unit ?? ''}`.trim()
  }
  return value.value ?? value.status
}

export function downloadHistoricalReplayReport(report: ReplayReport) {
  const checks = report.checks
    .map(
      (check) => `<tr>
        <td>${escapeHTML(check.group)}</td>
        <td>${escapeHTML(check.label)}</td>
        <td>${escapeHTML(check.outcome)}</td>
        <td>${escapeHTML(boundedValue(check.actual))}</td>
        <td>${escapeHTML(boundedValue(check.expected))}</td>
        <td>${escapeHTML(check.evidence_source_ids.join(', '))}</td>
      </tr>`,
    )
    .join('')
  const sources = report.sources
    .map(
      (source) =>
        `<li><a href="${escapeHTML(source.url)}">${escapeHTML(source.title)}</a> — ${escapeHTML(source.authority)} (${escapeHTML(source.availability)})</li>`,
    )
    .join('')
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHTML(report.fixture_label)} calibration report</title>
<style>body{font-family:system-ui,sans-serif;max-width:980px;margin:40px auto;padding:0 24px;color:#183235}h1{margin-bottom:4px}small,.muted{color:#5d7375}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{border:1px solid #c9d6d5;padding:8px;text-align:left;vertical-align:top}th{background:#edf4f2}code{font-size:.85em}li{margin:8px 0}.notice{padding:16px;border:2px solid #bf6d33;background:#fff7ed}</style></head>
<body><p class="muted">Historical/exercise calibration evidence · no private or user-entered plan data</p>
<h1>${escapeHTML(report.fixture_label)}</h1>
<p>${escapeHTML(report.jurisdiction)} · ${escapeHTML(report.island)} · ${escapeHTML(report.hazard)}</p>
<p class="notice"><strong>Not predictive.</strong> ${escapeHTML(report.disclaimer)}</p>
<p><code>${escapeHTML(report.run_id)}</code><br>Engine ${escapeHTML(report.engine_version)} · calibration ${escapeHTML(report.calibration_version)} · fixture ${escapeHTML(report.fixture_version)}</p>
<table><thead><tr><th>Group</th><th>Check</th><th>Outcome</th><th>Actual</th><th>Expected</th><th>Evidence IDs</th></tr></thead><tbody>${checks}</tbody></table>
<h2>Sources</h2><ul>${sources}</ul>
<h2>Limitations</h2><ul>${report.limitations.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>
</body></html>`
  const url = URL.createObjectURL(
    new Blob([html], { type: 'text/html;charset=utf-8' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `${report.fixture_id}-calibration-report.html`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export function formatReplayValue(value: ReplayBoundedValue) {
  return boundedValue(value)
}
