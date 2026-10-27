import { readFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

const backendURL = 'http://127.0.0.1:18080'

test('planner completes the Map Model Match journey through the Go API', async ({
  page,
  request,
}) => {
  const privateAddress = 'integration-private-address'
  await page.goto('/')
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()

  const afnContext = page.getByTestId('afn-context')
  await expect(
    afnContext.getByText('Official public sources available'),
  ).toBeVisible()
  await expect(afnContext).toContainText('4 of 4')
  await expect(page.getByTestId('afn-disability')).toContainText('320 (13.6%)')
  await expect(page.getByTestId('afn-language')).toContainText('210 (8.9%)')
  await expect(page.getByTestId('afn-transportation')).toContainText(
    '95 (10.1%)',
  )
  await expect(page.getByTestId('afn-medical-power')).toContainText('27')
  await expect(page.getByTestId('afn-risk-baseline')).toContainText(
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

  await page.goto('/')
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
    schema_version: 'resource-demand-request.v1',
    geography: {
      id: 'oahu-town',
      kind: 'planning_area',
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
    schema_version: 'resource-demand-response.v1',
    model_version: 'mass-care-demand-v0.1',
    assumption_version: 'hawaii-mass-care-scenario-v0.1',
    status: 'partial',
  })

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

  await page.goto('/')
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  await page.getByRole('button', { name: 'Open response workspace' }).click()
  const planningSheet = page.locator('.planning-sheet:visible')
  const demandPanel = planningSheet.getByTestId('resource-demand')
  await expect(demandPanel).toContainText('mass-care-demand-v0.1')
  await expect(demandPanel).toContainText('Planning service population')
  await expect(demandPanel).toContainText('Unavailable is not zero')
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
  expect(packet).toContain('mass-care-demand-v0.1')
  expect(packet).toContain('hawaii-mass-care-scenario-v0.1')
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
  await page.goto('/')
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
