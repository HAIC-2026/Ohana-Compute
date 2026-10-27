import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const backendURL = 'http://127.0.0.1:18080'
const disabledFrontendURL = 'http://127.0.0.1:13001'
const token = 'collaboration-e2e-token'

test('grounded planning drafts require citations and human approval', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000)
  const privateTitle = 'PRIVATE TITLE MUST NOT REACH PROVIDER'
  await configureIdentity(page)
  await page.goto('/')
  const { collaboration, createdPlan } = await createSharedPlan(
    page,
    privateTitle,
  )

  const planResponse = await request.get(
    `${backendURL}/api/v1/collaboration/plans/${createdPlan.id}`,
    { headers: authorizationHeaders() },
  )
  expect(planResponse.ok()).toBe(true)
  const initialPlan = await planResponse.json()

  const assist = collaboration.getByTestId('grounded-planning-assist')
  await expect(assist).toContainText('Planning assist — review required')
  await expect(
    assist.getByRole('button', { name: 'Generate grounded draft' }),
  ).toBeEnabled()

  const requestPromise = page.waitForRequest(
    (browserRequest) =>
      browserRequest.url().includes('/planning-drafts') &&
      browserRequest.method() === 'POST',
  )
  await assist.getByRole('button', { name: 'Generate grounded draft' }).click()
  const browserRequest = await requestPromise
  expect(browserRequest.postDataJSON()).toEqual({
    expected_revision: initialPlan.revision,
    operation: 'identify_gaps',
    style: 'concise',
  })
  expect(browserRequest.postData()).not.toContain(privateTitle)
  expect(browserRequest.postData()).not.toContain('address')
  expect(browserRequest.postData()).not.toContain('comment')

  await expect(assist).toContainText('AI synthesis')
  await expect(assist).toContainText('[acs-5-year]')
  await assist.getByText('Evidence citations').click()
  await expect(assist.getByRole('link', { name: 'acs-5-year' })).toBeVisible()
  await expect(assist).toContainText(
    'Generation never changes the plan, records approval, or activates a partner.',
  )

  const unchangedResponse = await request.get(
    `${backendURL}/api/v1/collaboration/plans/${initialPlan.id}`,
    { headers: authorizationHeaders() },
  )
  const unchanged = await unchangedResponse.json()
  expect(unchanged.current_version).toBe(initialPlan.current_version)
  expect(unchanged.revision).toBe(initialPlan.revision)

  await assist.getByRole('button', { name: 'Reject draft' }).click()
  await expect(assist).toContainText(
    'Draft rejected. The collaborative plan was not changed.',
  )

  await assist.getByRole('button', { name: 'Generate grounded draft' }).click()
  await expect(assist).toContainText('AI synthesis')
  await assist.getByRole('button', { name: 'Apply selected content' }).click()
  await expect(assist).toContainText(
    'Selected draft content was applied as a human-authored plan version.',
  )
  await expect(collaboration).toContainText('Shared plan · version 2')

  const appliedResponse = await request.get(
    `${backendURL}/api/v1/collaboration/plans/${initialPlan.id}`,
    { headers: authorizationHeaders() },
  )
  const applied = await appliedResponse.json()
  expect(applied.current_version).toBe(initialPlan.current_version + 1)
  expect(applied.versions.at(-1).ai_assistance).toEqual({
    provider_policy_version: 'grounded-planning-policy.v1',
    input_context_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
  })
  expect(applied.audit.at(-1).action).toBe('ai_draft_applied')
  expect(applied.audit.at(-1).metadata.assistance).toBe('ai')
  expect(JSON.stringify(applied.audit.at(-1).metadata)).not.toContain(
    'deterministic-fake',
  )

  await assist.getByRole('button', { name: 'Generate grounded draft' }).click()
  await expect(assist).toContainText('AI synthesis')
  const advanceResponse = await request.post(
    `${backendURL}/api/v1/collaboration/plans/${initialPlan.id}/comments`,
    {
      headers: {
        ...authorizationHeaders(),
        'Content-Type': 'application/json',
      },
      data: {
        expected_revision: applied.revision,
        body: 'Independent aggregate validation completed.',
      },
    },
  )
  expect(advanceResponse.ok()).toBe(true)
  await assist.getByRole('button', { name: 'Apply selected content' }).click()
  await expect(assist).toContainText('The plan revision changed')

  const metricsResponse = await request.get(`${backendURL}/metrics`)
  const metrics = await metricsResponse.text()
  expect(metrics).toContain(
    'hawaii_resilience_grounded_planning_operations_total{operation="generate",outcome="success",provider_class="deterministic-fake"}',
  )
  expect(metrics).not.toContain(privateTitle)
  expect(metrics).not.toContain(initialPlan.id)
  expect(metrics).not.toContain(token)
  expect(metrics).not.toContain('deterministic-e2e-principal')
})

test('disabled planning provider remains explicit and non-blocking', async ({
  page,
}) => {
  await configureIdentity(page)
  await page.goto(disabledFrontendURL)
  const { collaboration } = await createSharedPlan(
    page,
    'Provider disabled shared plan',
  )
  const assist = collaboration.getByTestId('grounded-planning-assist')
  await expect(assist.getByTestId('planning-assist-disabled')).toContainText(
    'Planning assist is disabled or unconfigured',
  )
  await expect(
    collaboration.getByRole('button', { name: 'Save new version' }),
  ).toBeEnabled()
})

async function configureIdentity(page: Page) {
  await page.addInitScript((accessToken) => {
    window.sessionStorage.setItem(
      'hawaii-resilience-collaboration-token',
      accessToken,
    )
  }, token)
}

async function createSharedPlan(page: Page, title: string) {
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  await page
    .getByRole('button', { name: 'Open response workspace', exact: true })
    .click()
  const planningSheet = page.locator('.planning-sheet:visible')
  await planningSheet
    .getByRole('button', { name: 'Create response checklist' })
    .click()
  const collaboration = planningSheet.getByTestId('collaborative-plan-panel')
  await collaboration.getByLabel('Plan title').fill(title)
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/collaboration/plans') &&
      response.request().method() === 'POST',
  )
  await collaboration.getByRole('button', { name: 'Save shared plan' }).click()
  const response = await responsePromise
  const createdPlan = await response.json()
  await expect(collaboration).toContainText('Shared plan created')
  return { collaboration, createdPlan }
}

function authorizationHeaders() {
  return { Authorization: `Bearer ${token}` }
}
