import { hawaiiDhsReferences } from './official-references'

export type FieldBriefingInput = {
  generatedAt?: Date
  place: string
  island: string
  hazard: string
  severity: number
  event?: {
    name: string
    status: string
    arrival: string
    summary: string
  }
  planningContext?: {
    jurisdiction: string
    afnFixture: string
    shelterPlanJurisdictionId: string
    provenance: string
  }
  map: {
    exposedPopulation: string
    primarySignal: string
    sourceStatus: string
    geography: string
    disability: string
    limitedEnglish: string
    noVehicle: string
    medicalPower: string
    nationalRisk: string
    socialVulnerability: string
    communityResilience: string
    sources: string[]
    unavailableSources: string[]
  }
  model: {
    needs: string[]
    hotspots: Array<{
      domain: string
      score: number
      level: string
      evidence: string[]
      recommendedAction: string
    }>
    cmist: Array<{ category: string; value: number }>
    resources: Array<{
      name: string
      kind: string
      capacity: number
      confirmed: boolean
      capabilities: string[]
    }>
    routes: Array<{
      name: string
      status: string
    }>
  }
  match: {
    decision?: {
      label: string
      action: string
      reason: string
      trigger: string
      owner: string
      communicationPath: string
    }
    actions: Array<{
      title: string
      owner: string
      timing: string
    }>
  }
  communication: {
    publicGuidance: string[]
    afnActions: string[]
    preferences: string[]
    localValidationChecks: string[]
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

function slug(value: string) {
  return (
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'planning-area'
  )
}

function list(items: string[], emptyMessage: string) {
  if (items.length === 0)
    return `<p class="empty">${escapeHTML(emptyMessage)}</p>`
  return `<ul>${items.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>`
}

function checkList(items: string[]) {
  return `<ul class="checks">${items
    .map(
      (item) =>
        `<li><span aria-hidden="true">&#9744;</span>${escapeHTML(item)}</li>`,
    )
    .join('')}</ul>`
}

function referenceList() {
  return `<ul class="references">${hawaiiDhsReferences
    .map(
      (reference) => `
        <li>
          <a href="${escapeHTML(reference.url)}">${escapeHTML(reference.title)}</a>
          <span>${escapeHTML(reference.description)}</span>
        </li>`,
    )
    .join('')}</ul>`
}

export function fieldBriefingFilename(input: FieldBriefingInput) {
  return `${slug(input.place)}-${slug(input.hazard)}-field-briefing.html`
}

export function createFieldBriefingHTML(input: FieldBriefingInput) {
  const generatedAt = (input.generatedAt ?? new Date()).toISOString()
  const sourceStatusClass =
    input.map.sourceStatus === 'Complete'
      ? 'complete'
      : input.map.sourceStatus === 'Partial'
        ? 'partial'
        : 'unavailable'
  const planningContext = input.planningContext
    ? `
      <section>
        <div class="section-title">
          <div>
            <p class="eyebrow">Statewide planning depth</p>
            <h2>${escapeHTML(input.planningContext.jurisdiction)}</h2>
          </div>
          <span class="status partial">${escapeHTML(input.planningContext.provenance)}</span>
        </div>
        <div class="baseline">
          <div><span>AFN fixture</span><strong>${escapeHTML(input.planningContext.afnFixture)}</strong></div>
          <div><span>County shelter-plan link</span><strong>${escapeHTML(input.planningContext.shelterPlanJurisdictionId)}</strong></div>
        </div>
        <p>Representative practice workflow only. No facility opening status or operational capacity is asserted.</p>
      </section>`
    : ''
  const resources = input.model.resources
    .map(
      (resource) => `
        <tr>
          <td><span class="checkbox" aria-hidden="true">${resource.confirmed ? '&#9745;' : '&#9744;'}</span>${escapeHTML(resource.name)}</td>
          <td>${escapeHTML(resource.kind)}</td>
          <td>${resource.capacity.toLocaleString()}</td>
          <td>${resource.confirmed ? 'Confirmed' : 'Needs confirmation'}</td>
          <td>${escapeHTML(resource.capabilities.join(' · '))}</td>
        </tr>`,
    )
    .join('')
  const routes = input.model.routes
    .map(
      (route) => `
        <tr>
          <td><span class="checkbox" aria-hidden="true">${route.status === 'clear' ? '&#9745;' : '&#9744;'}</span>${escapeHTML(route.name)}</td>
          <td>${escapeHTML(route.status === 'clear' ? 'Clear' : 'Needs confirmation')}</td>
        </tr>`,
    )
    .join('')
  const actions = input.match.actions
    .map(
      (action) => `
        <tr>
          <td><span class="checkbox" aria-hidden="true">&#9744;</span>${escapeHTML(action.title)}</td>
          <td>${escapeHTML(action.owner)}</td>
          <td>${escapeHTML(action.timing)}</td>
        </tr>`,
    )
    .join('')
  const cmist = input.model.cmist
    .map(
      (need) => `
        <tr>
          <td>${escapeHTML(need.category)}</td>
          <td>${need.value}/100</td>
        </tr>`,
    )
    .join('')
  const hotspots = input.model.hotspots
    .map(
      (hotspot) => `
        <tr>
          <td>${escapeHTML(hotspot.domain)}</td>
          <td>${hotspot.score}/100 · ${escapeHTML(hotspot.level)}</td>
          <td>${escapeHTML(hotspot.evidence.join(' · '))}</td>
          <td>${escapeHTML(hotspot.recommendedAction)}</td>
        </tr>`,
    )
    .join('')
  const unavailableSources =
    input.map.unavailableSources.length > 0
      ? `<p class="source-warning"><strong>Unavailable:</strong> ${escapeHTML(input.map.unavailableSources.join(' · '))}</p>`
      : ''
  const eventSummary = input.event
    ? `<div class="event-summary"><strong>${escapeHTML(input.event.status)} · ${escapeHTML(input.event.arrival)}</strong><span>${escapeHTML(input.event.summary)}</span></div>`
    : ''
  const decision = input.match.decision
    ? `
      <div class="decision">
        <div><span>Current decision</span><strong>${escapeHTML(input.match.decision.label)}</strong></div>
        <p>${escapeHTML(input.match.decision.action)}</p>
        <dl>
          <div><dt>Why</dt><dd>${escapeHTML(input.match.decision.reason)}</dd></div>
          <div><dt>Decision point</dt><dd>${escapeHTML(input.match.decision.trigger)}</dd></div>
          <div><dt>Owner</dt><dd>${escapeHTML(input.match.decision.owner)}</dd></div>
          <div><dt>Communication path</dt><dd>${escapeHTML(input.match.decision.communicationPath)}</dd></div>
        </dl>
      </div>`
    : ''

  return `<!doctype html>
<!--
THESIS: Carry one evidence-based Map–Model–Match plan into briefings and degraded-connectivity operations; refuse the generic dashboard export.
OWN-WORLD: Restrained incident-paper palette, ruled tables, checkboxes, and clear source/status marks inherited from the planner.
STORY: Officials review who may need help, confirm gaps, assign actions, and leave with a printable coordination artifact.
FIRST VIEWPORT: Incident title, practice warning, event timing, and the complete/partial official-source state before any operational recommendation.
FORM: Self-contained field briefing packet; an established-world Operate extension designed for browser download and print.
-->
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHTML(input.place)} mass care field briefing</title>
    <style>
      :root { color-scheme: light; --ink:#263436; --muted:#526366; --line:#ccd9da; --paper:#ffffff; --soft:#edf3f3; --accent:#18828c; --success:#16a34a; --warning:#f59e0b; --danger:#dc2626; }
      * { box-sizing:border-box; }
      body { margin:0; background:#f1f5f5; color:var(--ink); font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
      main { width:min(920px,calc(100% - 32px)); margin:24px auto; background:var(--paper); box-shadow:0 12px 35px #ccd9da; }
      header { padding:28px 32px 22px; border-top:8px solid var(--accent); border-bottom:1px solid var(--line); }
      h1 { max-width:22ch; margin:0; font-size:30px; line-height:1.08; letter-spacing:-.03em; }
      h2 { margin:0 0 14px; font-size:18px; letter-spacing:-.015em; }
      h3 { margin:0 0 8px; font-size:14px; }
      p { max-width:72ch; }
      .meta { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; margin-top:20px; }
      .meta div, .metric { min-width:0; }
      .meta span, .metric span, dt, .decision span { display:block; color:var(--muted); font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; }
      .meta strong, .metric strong { display:block; margin-top:3px; }
      .notice { margin:0; padding:13px 32px; border-bottom:1px solid var(--accent); background:var(--soft); color:var(--accent); font-weight:700; }
      section { padding:24px 32px; border-bottom:1px solid var(--line); }
      .section-title { display:flex; align-items:baseline; justify-content:space-between; gap:16px; }
      .status { padding:4px 8px; border-radius:999px; font-size:11px; font-weight:800; }
      .status.complete { background:var(--soft); color:var(--success); }
      .status.partial { background:var(--soft); color:var(--warning); }
      .status.unavailable { background:var(--soft); color:var(--danger); }
      .metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:16px 0; }
      .metric { padding:12px; border:1px solid var(--line); background:var(--soft); }
      .metric strong { font-size:18px; }
      .baseline { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin:14px 0; }
      .baseline div { padding:10px 0; border-top:1px solid var(--line); }
      .baseline span { display:block; color:var(--muted); font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; }
      .baseline strong { display:block; margin-top:3px; }
      .sources { color:var(--muted); font-size:12px; }
      .source-warning { color:var(--warning); }
      .event-summary { display:grid; grid-template-columns:180px 1fr; gap:16px; padding:14px 32px; border-bottom:1px solid var(--line); }
      .event-summary span { color:var(--muted); }
      .split { display:grid; grid-template-columns:1fr 1fr; gap:28px; }
      table { width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; }
      th { color:var(--muted); text-align:left; font-size:10px; letter-spacing:.04em; text-transform:uppercase; }
      th, td { padding:9px 8px; border-bottom:1px solid var(--line); vertical-align:top; }
      th:first-child, td:first-child { padding-left:0; }
      th:last-child, td:last-child { padding-right:0; }
      .checkbox { display:inline-block; width:20px; font-size:16px; line-height:1; }
      .decision { margin-bottom:18px; padding:16px; border:1px solid var(--line); background:var(--soft); }
      .decision > div { display:flex; justify-content:space-between; gap:12px; }
      .decision > p { margin:10px 0 14px; font-size:16px; font-weight:750; }
      dl { margin:0; }
      dl div { display:grid; grid-template-columns:130px 1fr; gap:12px; padding:7px 0; border-top:1px solid var(--line); }
      dt, dd { margin:0; }
      ul { margin:8px 0 0; padding-left:20px; }
      li + li { margin-top:6px; }
      .checks { padding:0; list-style:none; }
      .checks li { display:flex; gap:8px; }
      .checks span { flex:0 0 auto; font-size:16px; }
      .reference-note { margin:18px 0; padding:14px; border:1px solid var(--line); background:var(--soft); }
      .reference-note p { margin:5px 0 0; color:var(--muted); }
      .references { padding:0; list-style:none; }
      .references li { padding:9px 0; border-top:1px solid var(--line); }
      .references a { color:var(--accent); font-weight:750; }
      .references span { display:block; margin-top:2px; color:var(--muted); font-size:12px; }
      .empty { color:var(--muted); font-style:italic; }
      footer { padding:18px 32px 26px; color:var(--muted); font-size:11px; }
      @media (max-width:720px) { main{width:100%;margin:0;box-shadow:none}.meta,.metrics,.baseline,.split{grid-template-columns:1fr 1fr}.event-summary{grid-template-columns:1fr;padding-left:20px;padding-right:20px}table{display:block;overflow-x:auto}section,header,.notice,footer{padding-left:20px;padding-right:20px} }
      @media print { body{background:#fff} main{width:100%;margin:0;box-shadow:none} h2,h3,tr,.decision{break-inside:avoid} thead{display:table-header-group} @page{margin:.5in} }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>Hawaiʻi Mass Care Field Briefing</h1>
        <div class="meta">
          <div><span>Planning area</span><strong>${escapeHTML(input.place)} · ${escapeHTML(input.island)}</strong></div>
          <div><span>Hazard</span><strong>${escapeHTML(input.hazard)} · severity ${input.severity}/5</strong></div>
          <div><span>Event</span><strong>${escapeHTML(input.event?.name ?? 'Practice scenario')}</strong></div>
          <div><span>Generated</span><strong>${escapeHTML(generatedAt)}</strong></div>
        </div>
      </header>
      <p class="notice">Practice planning artifact. Confirm forecasts, shelter status, routes, assignments, and local conditions before operational use.</p>
      ${eventSummary}
      ${planningContext}

      <section>
        <div class="section-title">
          <h2>1 · Map affected communities</h2>
          <span class="status ${sourceStatusClass}">${escapeHTML(input.map.sourceStatus)} official source coverage</span>
        </div>
        <p><strong>${escapeHTML(input.map.exposedPopulation)}</strong> people may be affected. ${escapeHTML(input.map.primarySignal)}</p>
        <div class="metrics">
          <div class="metric"><span>People with disabilities</span><strong>${escapeHTML(input.map.disability)}</strong></div>
          <div class="metric"><span>Limited-English population</span><strong>${escapeHTML(input.map.limitedEnglish)}</strong></div>
          <div class="metric"><span>Households without vehicles</span><strong>${escapeHTML(input.map.noVehicle)}</strong></div>
          <div class="metric"><span>Power-dependent equipment</span><strong>${escapeHTML(input.map.medicalPower)}</strong></div>
        </div>
        <p><strong>Aggregate geography:</strong> ${escapeHTML(input.map.geography)}. No person-level records or household addresses are included.</p>
        <div class="baseline">
          <div><span>National risk</span><strong>${escapeHTML(input.map.nationalRisk)}</strong></div>
          <div><span>Social vulnerability</span><strong>${escapeHTML(input.map.socialVulnerability)}</strong></div>
          <div><span>Community resilience</span><strong>${escapeHTML(input.map.communityResilience)}</strong></div>
        </div>
        <p class="sources"><strong>Sources:</strong> ${escapeHTML(input.map.sources.join(' · ') || 'No official source available')}</p>
        ${unavailableSources}
      </section>

      <section>
        <h2>2 · Model needs and gaps</h2>
        <h3>Data-derived AFN planning hotspots</h3>
        <p class="note">Hotspot selection is deterministic. AI drafts wording only; planners must confirm conditions and assignments.</p>
        <table>
          <thead><tr><th>AFN domain</th><th>Score</th><th>Aggregate evidence</th><th>Planning action</th></tr></thead>
          <tbody>${hotspots}</tbody>
        </table>
        <div class="split">
          <div>
            <h3>Priority needs</h3>
            ${list(input.model.needs, 'No priority need was generated.')}
          </div>
          <div>
            <h3>CMIST planning signals</h3>
            <table><thead><tr><th>Area</th><th>Relative signal</th></tr></thead><tbody>${cmist}</tbody></table>
          </div>
        </div>
        <h3>Resources to confirm</h3>
        <table>
          <thead><tr><th>Resource</th><th>Type</th><th>Capacity</th><th>Status</th><th>Capabilities</th></tr></thead>
          <tbody>${resources}</tbody>
        </table>
        <h3>Routes to confirm</h3>
        <table><thead><tr><th>Route</th><th>Status</th></tr></thead><tbody>${routes}</tbody></table>
      </section>

      <section>
        <h2>3 · Match response partners</h2>
        ${decision}
        <table><thead><tr><th>Action</th><th>Owner</th><th>Timing</th></tr></thead><tbody>${actions}</tbody></table>
      </section>

      <section>
        <h2>Public communication and inclusion checks</h2>
        <div class="split">
          <div>
            <h3>Public guidance</h3>
            ${list(input.communication.publicGuidance, 'Confirm public guidance with the responsible local authority.')}
            <h3>Selected accessibility settings</h3>
            ${list(input.communication.preferences, 'No additional public-guidance preference selected.')}
          </div>
          <div>
            <h3>AFN and language actions</h3>
            ${list(input.communication.afnActions, 'Confirm AFN and language-access actions locally.')}
          </div>
        </div>
        <div class="reference-note">
          <strong>Hawaiʻi DHS guidance reflected in these checks</strong>
          <p>Official DHS emergency-planning guidance identifies accessible warnings, mobility assistance, no-vehicle transportation, language support, medication refrigeration, backup medical equipment, and service-animal supplies as considerations. DHS Maui recovery resources also direct wildfire survivors seeking Disaster Case Management enrollment to 211.</p>
        </div>
        <h3>Required local validation checks</h3>
        ${checkList(input.communication.localValidationChecks)}
        <h3>Official planning references</h3>
        ${referenceList()}
      </section>

      <footer>
        Self-contained offline artifact generated from aggregate public data and practice planning records. It intentionally excludes resident-entered locations, coordinates, names, identifiers, and person-level medical information.
      </footer>
    </main>
  </body>
</html>`
}

export function downloadFieldBriefing(input: FieldBriefingInput) {
  const html = createFieldBriefingHTML(input)
  const url = URL.createObjectURL(
    new Blob([html], { type: 'text/html;charset=utf-8' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = fieldBriefingFilename(input)
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
