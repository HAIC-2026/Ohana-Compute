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
