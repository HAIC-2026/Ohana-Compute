import { openLocalPlanning } from './support/local-planning'
import { readFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

const backendURL =
  process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:18080'

test('anonymous planning stays local while server writes require identity', async ({
  page,
  request,
}) => {
  const privateCredential =
    'integration-private-user@example.test.integration-private-token'
  const sessionResponse = await request.get(
    `${backendURL}/api/v1/identity/session`,
    { headers: { Authorization: `Bearer ${privateCredential}` } },
  )
  expect(sessionResponse.ok()).toBe(true)
  expect(sessionResponse.headers()['cache-control']).toBe('no-store')
  const session = await sessionResponse.json()
  expect(session).toEqual({
    schema_version: 'identity-session.v1',
    auth_mode: 'oidc',
    state: 'anonymous',
    configuration_status: 'configured',
    collaboration_write: 'denied',
    collaboration_read: 'denied',
    collaboration_approve: 'denied',
    roles: [],
    capabilities: [],
  })

  expect(JSON.stringify(session)).not.toContain(privateCredential)

  const authorizationResponse = await request.post(
    `${backendURL}/api/v1/identity/authorization-check`,
    { headers: { Authorization: `Bearer ${privateCredential}` } },
  )
  expect(authorizationResponse.status()).toBe(401)
  expect(authorizationResponse.headers()['cache-control']).toBe('no-store')

  await openLocalPlanning(page)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  await page
    .getByRole('button', { name: 'Open response workspace', exact: true })
    .click()
  const planningSheet = page.locator('.planning-sheet:visible')
  await expect(planningSheet).toBeVisible()
  const identityState = planningSheet.getByTestId('identity-session-state')
  await expect(identityState).toContainText(
    'Anonymous local workspace · sign-in required for server writes',
  )
  await expect(identityState).toContainText(
    'Your checklist and field packet stay on this device',
  )
  await planningSheet
    .getByRole('button', { name: 'Create response checklist' })
    .click()
  await expect(planningSheet.locator('.priority-list')).toBeVisible()

  const metricsResponse = await request.get(`${backendURL}/metrics`)
  const metrics = await metricsResponse.text()
  expect(metrics).toContain(
    'hawaii_resilience_identity_authorization_total{outcome="invalid"}',
  )
  expect(metrics).toContain(
    'hawaii_resilience_http_requests_total{method="POST",route="/api/v1/identity/authorization-check",status="401"}',
  )
  expect(metrics).not.toContain(privateCredential)
  expect(metrics).not.toContain('integration-private-user')
  expect(metrics).not.toContain('role=')
  expect(metrics).not.toContain('subject=')
  expect(metrics).not.toContain('issuer=')
  expect(metrics).not.toContain('audience=')
})

test('live status never substitutes unsupported operational domains', async ({
  page,
  request,
}) => {
  const response = await request.get(
    `${backendURL}/api/v1/planning/live-status?lat=21.29&lon=-157.68`,
  )
  expect(response.ok()).toBe(true)
  const snapshot = await response.json()
  expect(snapshot.schema_version).toBe('live-operational-status.v1')
  expect(snapshot.status).toBe('partial')
  expect(snapshot.domains).toHaveLength(6)

  const shelter = snapshot.domains.find(
    (domain: { domain: string }) => domain.domain === 'shelter',
  )
  expect(shelter).toMatchObject({
    status: 'reported_live',
    provenance: {
      source_id: 'fema-open-shelters',
      decision: 'ADOPT',
      data_class: 'reported_live',
    },
  })
  expect(shelter.shelters[0]).toMatchObject({
    name: 'Fixture reported open shelter',
    reported_status: 'OPEN',
    capacity: 85,
    wheelchair_accessible: 'YES',
    pet_accommodations_code: 'HOUSEHOLD_PETS',
  })

  for (const domainName of [
    'evacuation_order',
    'road_transport',
    'transit_paratransit',
    'utility_outage',
    'wildfire',
  ]) {
    const domain = snapshot.domains.find(
      (candidate: { domain: string }) => candidate.domain === domainName,
    )
    expect(domain.status).toBe('unavailable')
    expect(domain.unavailable_boundary.missing_artifact).toBeTruthy()
    expect(domain.unavailable_boundary.owning_authority).toBeTruthy()
    expect(domain.summary.toLowerCase()).not.toContain('all clear')
  }
  const road = snapshot.domains.find(
    (domain: { domain: string }) => domain.domain === 'road_transport',
  )
  expect(road.reference_kind).toBe('planned_reference')
  expect(JSON.stringify(road)).toContain(
    'planned roadwork, not emergency passability',
  )

  await openLocalPlanning(page)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  await page
    .getByRole('button', { name: 'Open response workspace', exact: true })
    .click()
  const planningSheet = page.locator('.planning-sheet:visible')
  await expect(planningSheet).toBeVisible()
  const panel = planningSheet.getByTestId('live-operational-status')
  await expect(panel).toContainText('Reported live operations')
  await expect(panel).toContainText('Fixture reported open shelter')
  await expect(panel).toContainText(
    'separate from County plans and practice facilities',
  )

  for (const tab of ['Orders', 'Roads', 'Transit', 'Utilities', 'Wildfire']) {
    await panel.getByRole('tab', { name: new RegExp(tab) }).click()
    await expect(panel).toContainText('Blocked external contract')
    await expect(panel).toContainText('Unavailable')
  }
  await panel.getByRole('tab', { name: /Roads/ }).click()
  await expect(panel).toContainText('Planned/reference only')
  await expect(panel).toContainText(
    'planned roadwork, not emergency passability',
  )

  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  await expect
    .poll(
      async () => {
        const metricsResponse = await request.get(`${backendURL}/metrics`)
        return metricsResponse.text()
      },
      { timeout: 10_000 },
    )
    .toContain(
      'hawaii_resilience_operational_status_domains_total{domain="shelter",status="reported_live"}',
    )

  const metricsResponse = await request.get(`${backendURL}/metrics`)
  const metrics = await metricsResponse.text()
  expect(metrics).toContain(
    'hawaii_resilience_operational_status_source_requests_total{outcome="success",source="fema_open_shelters"}',
  )
  expect(metrics).toContain(
    'hawaii_resilience_http_requests_total{method="GET",route="/api/v1/planning/live-status",status="200"}',
  )
  expect(metrics).toContain(
    'hawaii_resilience_browser_events_total{action="live_status_select",category="planning"',
  )
  expect(metrics).not.toContain('Fixture reported open shelter')
  expect(metrics).not.toContain('fixture-live-shelter')
  expect(metrics).not.toContain('21.29')
  expect(metrics).not.toContain('-157.68')
})

test('official advisory context never becomes an evacuation order and missing County-order data stays unavailable', async ({
  page,
  request,
}) => {
  const response = await request.get(
    `${backendURL}/api/v1/planning/event-triggers`,
  )
  expect(response.ok()).toBe(true)
  const snapshot = await response.json()
  expect(snapshot.schema_version).toBe('event-trigger-snapshot.v1')
  expect(snapshot.county_order_notice).toBe(
    'County evacuation-order data unavailable',
  )
  expect(snapshot.unavailable_meaning).toBe(
    'Unavailable does not mean no order.',
  )

  const advisory = snapshot.triggers.find(
    (trigger: { source: string; provenance: { product_type: string } }) =>
      trigger.source === 'nws' &&
      trigger.provenance.product_type === 'Flood Advisory',
  )
  expect(advisory).toMatchObject({
    planning_state: 'prepare',
    lifecycle: 'active',
    legal_order_status: 'not_an_evacuation_order',
    facts: { response_type: 'Evacuate' },
  })

  const comCat = snapshot.triggers.filter(
    (trigger: { source: string }) => trigger.source === 'usgs_comcat',
  )
  expect(
    comCat.map(
      (trigger: { facts: { tsunami_flag: boolean } }) =>
        trigger.facts.tsunami_flag,
    ),
  ).toEqual([true, false])
  expect(
    snapshot.triggers.find(
      (trigger: { source: string }) => trigger.source === 'usgs_hans',
    ),
  ).toMatchObject({
    lifecycle: 'unavailable',
    planning_state: 'unavailable',
    legal_order_status: 'unavailable',
  })

  await openLocalPlanning(page)
  const panel = page.getByTestId('event-trigger-panel').first()
  await expect(panel).toContainText('Not an evacuation order')
  await expect(panel).toContainText('Fixture Flood Advisory')
  await expect(panel).toContainText('County order data unavailable')
  await expect(panel).toContainText('an order may still be in effect.')
  await expect(panel).not.toContainText('County order: none')

  const metricsResponse = await request.get(`${backendURL}/metrics`)
  expect(await metricsResponse.text()).toContain(
    'hawaii_resilience_event_trigger_source_requests_total{outcome="success",source="nws"}',
  )
})

test('planner completes the Map Model Match journey through the Go API', async ({
  page,
  request,
}) => {
  const privateAddress = 'integration-private-address'
  await openLocalPlanning(page)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()

  const planningRegion = page.getByLabel('Emergency response planning')
  const afnContext = planningRegion.getByTestId('afn-context')
  await expect(
    afnContext.getByText('Official public sources available'),
  ).toBeVisible()
  await expect(afnContext).toContainText('4 of 4')
  await expect(planningRegion.getByTestId('afn-disability')).toContainText(
    '320 (13.6%)',
  )
  await expect(planningRegion.getByTestId('afn-language')).toContainText(
    '210 (8.9%)',
  )
  await expect(planningRegion.getByTestId('afn-transportation')).toContainText(
    '95 (10.1%)',
  )
  await expect(planningRegion.getByTestId('afn-medical-power')).toContainText(
    '27',
  )
  await expect(planningRegion.getByTestId('afn-risk-baseline')).toContainText(
    'National risk baseline: Relatively Moderate',
  )

  await expect(
    page.getByRole('heading', { name: 'Who may need help' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Needs and resource gaps' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Coordinated response' }),
  ).toBeVisible()
  await expect(page.getByText('Next local resource check')).toBeVisible()

  await page
    .getByRole('button', { name: 'Open public guidance preview' })
    .click()
  const guidanceSheet = page.locator('.planning-sheet:visible')
  await guidanceSheet
    .getByLabel('Home address or landmark')
    .fill(privateAddress)
  await guidanceSheet.getByRole('button', { name: 'Find routes' }).click()
  await guidanceSheet
    .getByRole('checkbox', { name: /I do not have a car/ })
    .check()
  await guidanceSheet.getByLabel('Help language').selectOption('Tagalog')
  await expect(guidanceSheet.getByText('Tagalog support listed')).toBeVisible()
  await guidanceSheet
    .getByRole('button', { name: 'Close panel' })
    .first()
    .click()

  await page.getByRole('button', { name: 'Open response workspace' }).click()
  const planningSheet = page.locator('.planning-sheet:visible')
  await expect(
    planningSheet.getByRole('heading', { name: /Mass care plan for/ }).first(),
  ).toBeVisible()
  await expect(
    planningSheet.getByText('1 · Map affected communities'),
  ).toBeVisible()
  await expect(
    planningSheet.getByText('2 · Model needs and gaps'),
  ).toBeVisible()
  await expect(
    planningSheet.getByTestId('afn-planning-hotspots'),
  ).toContainText('Data-derived weaknesses · AI drafts wording only')
  const shelterPlanPanel = planningSheet.getByTestId('county-shelter-plans')
  await expect(shelterPlanPanel).toContainText('County shelter plans')
  await expect(shelterPlanPanel).toContainText(
    "Four emergency-management jurisdictions cover Hawaiʻi's five political counties",
  )
  await expect(shelterPlanPanel).toContainText('Emergency Shelter Handbook')
  await expect(shelterPlanPanel).toContainText('Official facility records')
  await expect(shelterPlanPanel).toContainText(
    'They are not ingested from a County plan',
  )
  await shelterPlanPanel.getByRole('tab', { name: 'Maui' }).click()
  await expect(shelterPlanPanel).toContainText(
    'Kalawao County emergency-management scope',
  )
  await expect(
    shelterPlanPanel.getByRole('link', {
      name: /HRS §127A-2 emergency-management scope/,
    }),
  ).toHaveAttribute(
    'href',
    'https://data.capitol.hawaii.gov/hrscurrent/Vol03_Ch0121-0200D/HRS0127A/HRS_0127A-0002.htm',
  )
  await shelterPlanPanel.getByRole('tab', { name: 'Hawaiʻi' }).click()
  await expect(shelterPlanPanel).toContainText('Plan unavailable')
  await shelterPlanPanel.getByRole('tab', { name: 'Honolulu' }).click()
  await expect(planningSheet.getByText('Planning population')).toBeVisible()
  await expect(planningSheet.getByText('Overall SVI ranking')).toBeVisible()
  await expect(planningSheet.getByText('12th percentile')).toBeVisible()
  await expect(planningSheet.getByText('Expected annual loss')).toBeVisible()
  await expect(
    planningSheet.getByText('Relatively Moderate', { exact: true }).last(),
  ).toBeVisible()
  await expect(
    planningSheet.getByText('3 · Match response partners'),
  ).toBeVisible()
  await planningSheet
    .getByText('Data coverage and limitations', { exact: true })
    .click()
  for (const criterion of [
    'Actionable',
    'Usable',
    'Private',
    'Equitable',
    'Sustainable',
  ]) {
    await expect(
      planningSheet.getByText(criterion, { exact: true }),
    ).toBeVisible()
  }

  await planningSheet
    .getByRole('button', { name: 'Confirm', exact: true })
    .first()
    .click()
  await expect(planningSheet.getByText('7/9 confirmed')).toBeVisible()
  await planningSheet
    .getByRole('button', { name: 'Create response checklist' })
    .click()
  await expect(planningSheet.locator('.priority-list')).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await planningSheet
    .getByRole('button', { name: 'Download field packet' })
    .click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/field-briefing\.html$/)
  const downloadedPath = await download.path()
  const packet = await readFile(downloadedPath, 'utf8')
  expect(packet).toContain('Hawaiʻi Mass Care Field Briefing')
  expect(packet).toContain('Official operational trigger context')
  expect(packet).toContain('Planning context — not an evacuation order')
  expect(packet).toContain('County evacuation-order data unavailable')
  expect(packet).toContain('Unavailable does not mean no order.')
  expect(packet).toContain('Live operational status boundaries')
  expect(packet).toContain('reported live')
  expect(packet).toContain('utility outage')
  expect(packet).toContain('unavailable')
  expect(packet).toContain(
    'FEMA-reported shelters are not County plan records or practice facilities',
  )
  expect(packet).toContain('Planned roadwork is not emergency passability')
  expect(packet).toContain('1 · Map affected communities')
  expect(packet).toContain('2 · Model needs and gaps')
  expect(packet).toContain('Data-derived AFN planning hotspots')
  expect(packet).toContain(
    'Hotspot selection is deterministic. AI drafts wording only',
  )
  expect(packet).toContain('3 · Match response partners')
  expect(packet).toContain('320 (13.6%)')
  expect(packet).toContain('27')
  expect(packet).toContain('Tagalog')
  expect(packet).toContain('plan for no private vehicle')
  expect(packet).toContain('pets')
  expect(packet).toContain('working animals')
  expect(packet).toContain('limited connectivity')
  expect(packet).toContain('elevator-outage support')
  expect(packet).toContain('Hawaiʻi DHS guidance reflected in these checks')
  expect(packet).toContain('accessible warnings')
  expect(packet).toContain('medication refrigeration')
  expect(packet).toContain('Disaster Case Management enrollment to 211')
  expect(packet).toContain('https://humanservices.hawaii.gov/')
  expect(packet).toContain('No person-level records or household addresses')
  expect(packet).not.toContain(privateAddress)

  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  await expect
    .poll(
      async () => {
        const response = await request.get(`${backendURL}/metrics`)
        return response.text()
      },
      { timeout: 10_000 },
    )
    .toContain(
      'hawaii_resilience_browser_events_total{action="submit",category="form"',
    )

  const metricsResponse = await request.get(`${backendURL}/metrics`)
  expect(metricsResponse.ok()).toBe(true)
  const metrics = await metricsResponse.text()
  expect(metrics).toMatch(
    /hawaii_resilience_afn_profile_responses_total\{completeness="complete"\} [1-9]\d*/,
  )
  expect(metrics).toMatch(
    /hawaii_resilience_afn_source_requests_total\{outcome="success",source="acs-5-year"\} [1-9]\d*/,
  )
  expect(metrics).toMatch(
    /hawaii_resilience_http_requests_total\{method="GET",route="\/api\/v1\/community\/profile",status="200"\} [1-9]\d*/,
  )
  expect(metrics).toMatch(
    /hawaii_resilience_http_requests_total\{method="GET",route="\/api\/v1\/shelter-plans",status="200"\} [1-9]\d*/,
  )
  expect(metrics).toContain(
    'hawaii_resilience_http_requests_total{method="POST",route="/api/v1/telemetry/browser",status="202"}',
  )
  expect(metrics).toContain(
    'hawaii_resilience_browser_events_total{action="field_packet_download",category="planning"',
  )
  expect(metrics).toContain(
    'hawaii_resilience_browser_events_total{action="shelter_county_select",category="planning"',
  )
  expect(metrics).not.toContain(privateAddress)
})

test('statewide County planning depth stays distinct', async ({
  page,
  request,
}) => {
  const catalogResponse = await request.get(
    `${backendURL}/api/v1/planning-areas`,
  )
  expect(catalogResponse.ok()).toBe(true)
  const catalog = await catalogResponse.json()
  expect(catalog.summary).toMatchObject({
    planning_jurisdictions_total: 4,
    political_counties_total: 5,
    representative_workflows: 4,
  })
  expect(catalog.jurisdictions[1].political_counties).toEqual([
    'Maui',
    'Kalawao',
  ])

  await openLocalPlanning(page)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  await page.getByLabel('Choose island').selectOption('Maui')
  await expect(
    page.getByText('Address-level preview not available'),
  ).toBeVisible()
  await expect(
    page.getByText('No Oʻahu route or resource was substituted.'),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Open response workspace' }).click()
  const planningSheet = page.locator('.planning-sheet:visible')
  const planningDepth = planningSheet.getByRole('region', {
    name: 'Statewide planning depth',
  })
  await expect(
    planningDepth.getByText('Maui corridor continuity workflow', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    planningSheet.getByText('Central Maui practice reception site').first(),
  ).toBeVisible()
  await expect(
    planningSheet.getByText('Honoapiʻilani Highway west access').first(),
  ).toBeVisible()
  await expect(planningSheet).not.toContainText('H-1 urban corridor')
  await expect(planningSheet).not.toContainText('TheBus')
  await expect(planningSheet).not.toContainText('Urban Honolulu')

  await planningSheet
    .getByRole('button', { name: 'Create response checklist' })
    .click()
  await expect(
    planningSheet.getByRole('button', { name: 'Download field packet' }),
  ).toBeEnabled()
  const downloadPromise = page.waitForEvent('download')
  await planningSheet
    .getByRole('button', { name: 'Download field packet' })
    .click()
  const download = await downloadPromise
  const downloadedPath = await download.path()
  const packet = await readFile(downloadedPath, 'utf8')
  expect(packet).toContain('County of Maui')
  expect(packet).toContain('maui-central-wildfire-continuity')
  expect(packet).toContain('Central Maui practice reception site')
  expect(packet).toContain('Honoapiʻilani Highway west access')
  expect(packet).not.toContain('H-1 urban corridor')
  expect(packet).not.toContain('TheBus')

  await page.getByLabel('Choose island').selectOption('Hawaiʻi')
  await expect(
    planningDepth.getByText('East Hawaiʻi medical continuity workflow', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    planningSheet.getByText('Puna practice medical-power support hub').first(),
  ).toBeVisible()
  await expect(
    planningSheet.getByText('Hawaiʻi Belt Road Hilo–Puna access').first(),
  ).toBeVisible()
  await expect(planningSheet).not.toContainText(
    'Central Maui practice reception site',
  )

  await page.getByLabel('Choose island').selectOption('Kauaʻi')
  await expect(
    planningDepth.getByText('East Kauaʻi flood-isolation workflow', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    planningSheet.getByText('East Kauaʻi practice shelter').first(),
  ).toBeVisible()
  await expect(
    planningSheet.getByText('Kūhiō Highway Wailua crossing').first(),
  ).toBeVisible()
  await expect(planningSheet).not.toContainText(
    'Hawaiʻi Belt Road Hilo–Puna access',
  )

  const metricsResponse = await request.get(`${backendURL}/metrics`)
  expect(metricsResponse.ok()).toBe(true)
  const metrics = await metricsResponse.text()
  expect(metrics).toMatch(
    /hawaii_resilience_http_requests_total\{method="GET",route="\/api\/v1\/planning-areas",status="200"\} [1-9]\d*/,
  )
})

test('resource demand stays bounded and reproducible', async ({
  page,
  request,
}) => {
  const privateValue = 'integration-private-demand-value'
  const modelRequest = {
    schema_version: 'resource-demand-request.v2',
    geography: {
      id: 'oahu-town',
      kind: 'planning_area',
      county_id: 'honolulu',
      island_id: 'oahu',
    },
    community: {
      households: { status: 'available', estimate: 900, margin_of_error: 80 },
      limited_english_population: {
        status: 'available',
        estimate: 150,
        margin_of_error: 40,
      },
      population_with_disability: {
        status: 'available',
        estimate: 220,
        margin_of_error: 50,
      },
      population_below_poverty: {
        status: 'available',
        estimate: 120,
        margin_of_error: 35,
      },
      no_vehicle_households: {
        status: 'available',
        estimate: 80,
        margin_of_error: 15,
      },
    },
    population: {
      status: 'available',
      estimate: 2361,
      margin_of_error: 100,
      source: {
        id: 'acs-5-year',
        freshness: 'fresh',
      },
    },
    medical_power: {
      status: 'available',
      masked: true,
      source_id: 'hhs-empower',
    },
    scenario: {
      service_days: 3,
      shelter_standard: 'evacuation',
      hazard: 'hurricane',
      outage_hours: 24,
    },
    practice_supplies: [
      {
        category: 'shelter_spaces',
        unit: 'people',
        quantity: 300,
        geography_id: 'oahu-town',
        validation_status: 'practice_confirmed',
      },
      {
        category: 'shelter_spaces',
        unit: 'people',
        quantity: 150,
        geography_id: 'maui-central',
        validation_status: 'practice_confirmed',
      },
    ],
  }
  const firstResponse = await request.post(
    `${backendURL}/api/v1/planning/resource-demand`,
    { data: modelRequest },
  )
  expect(firstResponse.ok()).toBe(true)
  const first = await firstResponse.json()
  const secondResponse = await request.post(
    `${backendURL}/api/v1/planning/resource-demand`,
    { data: modelRequest },
  )
  expect(secondResponse.ok()).toBe(true)
  const second = await secondResponse.json()
  expect(second).toEqual(first)
  expect(first).toMatchObject({
    schema_version: 'resource-demand-response.v2',
    model_version: 'mass-care-demand-v0.2',
    assumption_version: 'hawaii-mass-care-scenario-v0.2',
    status: 'partial',
  })
  expect(first.cmist).toHaveLength(5)
  expect(first.cmist.map((need: { label: string }) => need.label)).toEqual([
    'Communication',
    'Medical',
    'Independence',
    'Safety & support',
    'Transportation',
  ])
  expect(first.county_capacity).toMatchObject({ status: 'not_published' })

  const shelter = first.lines.find(
    (line: { id: string }) => line.id === 'shelter_spaces',
  )
  expect(shelter.supply.applied_quantity).toBe(300)
  expect(shelter.gap.planning).toBe(
    shelter.demand.planning - shelter.supply.applied_quantity,
  )
  expect(first.supply_assessments).toContainEqual(
    expect.objectContaining({
      quantity: 150,
      status: 'excluded',
      reason: 'geography_mismatch',
    }),
  )
  expect(first.lines).toContainEqual(
    expect.objectContaining({
      id: 'medical_power_support',
      status: 'unavailable',
      unavailable_reason: 'privacy_masked',
    }),
  )

  const missingPopulationResponse = await request.post(
    `${backendURL}/api/v1/planning/resource-demand`,
    {
      data: {
        ...modelRequest,
        population: {
          status: 'unavailable',
          source: {
            id: 'unavailable',
            freshness: 'unavailable',
          },
        },
      },
    },
  )
  expect(missingPopulationResponse.ok()).toBe(true)
  const missingPopulation = await missingPopulationResponse.json()
  expect(missingPopulation.status).toBe('unavailable')
  expect(
    missingPopulation.lines.every(
      (line: { demand?: unknown }) => line.demand === undefined,
    ),
  ).toBe(true)

  await openLocalPlanning(page)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  await page.getByRole('button', { name: 'Open response workspace' }).click()
  const planningSheet = page.locator('.planning-sheet:visible')
  const demandPanel = planningSheet.getByTestId('resource-demand')
  await expect(demandPanel).toContainText('mass-care-demand-v0.2')
  await expect(demandPanel).toContainText('Planning service population')
  await expect(demandPanel).toContainText('Unavailable is not zero')
  await expect(demandPanel).toContainText('CMIST need matrix · hurricane')
  await expect(demandPanel).toContainText('County-published shelter capacity')
  await expect(demandPanel).toContainText('Not published')
  const serviceDuration = demandPanel.getByLabel('Service duration')
  await serviceDuration.selectOption('7')
  await serviceDuration.focus()
  await page.keyboard.press('Tab')
  await expect(demandPanel).toContainText('7-day meals')

  await planningSheet
    .getByRole('button', { name: 'Create response checklist' })
    .click()
  await expect(
    planningSheet.getByRole('button', { name: 'Download field packet' }),
  ).toBeEnabled()
  const downloadPromise = page.waitForEvent('download')
  await planningSheet
    .getByRole('button', { name: 'Download field packet' })
    .click()
  const download = await downloadPromise
  const downloadedPath = await download.path()
  const packet = await readFile(downloadedPath, 'utf8')
  expect(packet).toContain('Quantitative resource demand')
  expect(packet).toContain('mass-care-demand-v0.2')
  expect(packet).toContain('hawaii-mass-care-scenario-v0.2')
  expect(packet).toContain('Unavailable is not zero')
  expect(packet).not.toContain(privateValue)

  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  const metricsResponse = await request.get(`${backendURL}/metrics`)
  expect(metricsResponse.ok()).toBe(true)
  const metrics = await metricsResponse.text()
  expect(metrics).toMatch(
    /hawaii_resilience_http_requests_total\{method="POST",route="\/api\/v1\/planning\/resource-demand",status="200"\} [1-9]\d*/,
  )
  expect(metrics).toContain(
    'hawaii_resilience_browser_events_total{action="resource_demand_duration",category="planning"',
  )
  expect(metrics).not.toContain(privateValue)
})

test('partner matches remain sourced and non-operational', async ({
  page,
  request,
}) => {
  const directResponse = await request.get(
    `${backendURL}/api/v1/planning/partner-matches?jurisdiction=honolulu&capability=sheltering&capability=pet-service-animal-support`,
  )
  expect(directResponse.ok()).toBe(true)
  const direct = await directResponse.json()
  expect(direct).toMatchObject({
    schema_version: 'partner-match-response.v1',
    status: 'partial',
    jurisdiction_id: 'honolulu',
    summary: {
      requested_capabilities: 2,
      matched_capabilities: 1,
      unmatched_capabilities: 1,
    },
  })
  expect(direct.matches[0].partners[0]).toMatchObject({
    id: 'honolulu-dem',
    validation_state: 'official_county_role',
    operational_status: 'not_validated',
    capacity_status: 'not_reported',
    activation_status: 'not_reported',
  })
  expect(direct.matches[1]).toMatchObject({
    capability: 'pet-service-animal-support',
    status: 'unmatched',
    partners: [],
  })

  const browserRequests: string[] = []
  page.on('request', (browserRequest) => {
    if (browserRequest.url().includes('/api/v1/planning/partner-matches')) {
      browserRequests.push(browserRequest.url())
    }
  })
  await openLocalPlanning(page)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  await page.getByRole('button', { name: 'Open response workspace' }).click()
  const planningSheet = page.locator('.planning-sheet:visible')
  const panel = planningSheet.getByTestId('partner-matches')
  await expect(
    panel.getByRole('heading', { name: 'Response partner matches' }),
  ).toBeVisible()
  await expect(panel).toContainText('No sourced association')
  await panel.getByRole('tab', { name: 'Sheltering' }).click()
  await expect(panel).toContainText(
    'Honolulu Department of Emergency Management',
  )
  await expect(panel).toContainText('Operational status not validated')
  await expect(panel).toContainText('Activation and capacity are not reported')
  await expect(panel).toContainText('Source review current through')

  await page.getByLabel('Choose island').selectOption('Maui')
  await expect.poll(() => browserRequests.at(-1)).toContain('jurisdiction=maui')
  await panel.getByRole('tab', { name: 'Sheltering' }).click()
  await expect(panel).not.toContainText(
    'Honolulu Department of Emergency Management',
  )
  await expect(panel).toContainText('American Red Cross Pacific Islands Region')
  const serializedRequests = browserRequests.join('\n')
  expect(serializedRequests).not.toContain('address')
  expect(serializedRequests).not.toContain('coordinate')
  expect(serializedRequests).not.toContain(
    'Honolulu Department of Emergency Management',
  )

  await planningSheet
    .getByRole('button', { name: 'Create response checklist' })
    .click()
  const downloadPromise = page.waitForEvent('download')
  await planningSheet
    .getByRole('button', { name: 'Download field packet' })
    .click()
  const download = await downloadPromise
  const downloadedPath = await download.path()
  const packet = await readFile(downloadedPath, 'utf8')
  expect(packet).toContain('Sourced partner associations')
  expect(packet).toContain('Operational status')
  expect(packet).toContain('Capacity and activation not reported')
  expect(packet).toContain('Source fresh through')
  expect(packet).toContain('No sourced association')

  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  const metricsResponse = await request.get(`${backendURL}/metrics`)
  expect(metricsResponse.ok()).toBe(true)
  const metrics = await metricsResponse.text()
  expect(metrics).toMatch(
    /hawaii_resilience_http_requests_total\{method="GET",route="\/api\/v1\/planning\/partner-matches",status="200"\} [1-9]\d*/,
  )
  expect(metrics).toContain(
    'hawaii_resilience_browser_events_total{action="partner_capability_select",category="planning"',
  )
})
