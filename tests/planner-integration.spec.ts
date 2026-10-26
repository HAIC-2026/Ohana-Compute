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
  await planningSheet
    .getByRole('button', { name: 'Close panel' })
    .first()
    .click()

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
  expect(metrics).toContain(
    'hawaii_resilience_afn_profile_responses_total{completeness="complete"} 1',
  )
  expect(metrics).toContain(
    'hawaii_resilience_afn_source_requests_total{outcome="success",source="acs-5-year"} 1',
  )
  expect(metrics).toContain(
    'hawaii_resilience_http_requests_total{method="GET",route="/api/v1/community/profile",status="200"} 1',
  )
  expect(metrics).toContain(
    'hawaii_resilience_http_requests_total{method="POST",route="/api/v1/telemetry/browser",status="202"}',
  )
  expect(metrics).not.toContain(privateAddress)
})
