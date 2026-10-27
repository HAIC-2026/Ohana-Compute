import { expect, test } from '@playwright/test'

const backendURL = 'http://127.0.0.1:18080'

test('collaborative plans preserve versions and reject stale writes', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000)
  const token = 'collaboration-e2e-token'
  const privateTitle = 'Operational draft alpha private marker'
  const privateNote =
    'Confirm accessible transportation staging before the next briefing.'
  await page.addInitScript((accessToken) => {
    window.sessionStorage.setItem(
      'hawaii-resilience-collaboration-token',
      accessToken,
    )
  }, token)
  await page.goto('/')
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  await page
    .getByRole('button', { name: 'Open response workspace', exact: true })
    .click()
  const planningSheet = page.locator('.planning-sheet:visible')
  await expect(
    planningSheet.getByTestId('identity-session-state'),
  ).toContainText('Collaboration ready')
  await planningSheet
    .getByRole('button', { name: 'Create response checklist' })
    .click()

  const collaboration = planningSheet.getByTestId('collaborative-plan-panel')
  await expect(collaboration).toBeVisible()
  await collaboration.getByLabel('Plan title').fill(privateTitle)
  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/collaboration/plans') &&
      response.request().method() === 'POST',
  )
  await collaboration.getByRole('button', { name: 'Save shared plan' }).click()
  const createResponse = await createResponsePromise
  expect(createResponse.ok()).toBe(true)
  const createdPlan = await createResponse.json()
  const planId = createdPlan.id as string
  await expect(collaboration).toContainText('Shared plan created')
  await expect(collaboration).toContainText('Shared plan · version 1')

  const unauthorizedApproval = await request.post(
    `${backendURL}/api/v1/collaboration/plans`,
    {
      headers: {
        Authorization: 'Bearer collaboration-editor-e2e-token',
        'Content-Type': 'application/json',
      },
      data: {
        jurisdiction: createdPlan.jurisdiction,
        area_ref: createdPlan.area_ref,
        event_ref: createdPlan.event_ref,
        hazard: createdPlan.hazard,
        title: 'Editor-only approval attempt',
        summary: 'Editors cannot mark a shared plan approved.',
        status: 'approved',
        snapshot: createdPlan.versions[0].snapshot,
      },
    },
  )
  expect(unauthorizedApproval.status()).toBe(403)

  await planningSheet.getByRole('button', { name: 'Update list' }).click()
  await expect(collaboration).toContainText('Reopened the active shared plan')
  await expect(collaboration).toContainText('Shared plan · version 1')

  await collaboration
    .getByLabel('Planning summary')
    .fill('Second aggregate planning version for coordinated review.')
  await collaboration.getByLabel('Review status').selectOption('in_review')
  await collaboration.getByRole('button', { name: 'Save new version' }).click()
  await expect(collaboration).toContainText('Shared plan · version 2')
  await expect(collaboration).toContainText(
    'Saved a new immutable plan version',
  )

  await collaboration.getByLabel('Bounded operational note').fill(privateNote)
  await collaboration.getByRole('button', { name: 'Add planning note' }).click()
  await expect(collaboration).toContainText(privateNote)

  await collaboration
    .locator('summary')
    .filter({ hasText: 'Role assignments' })
    .click()
  await collaboration
    .getByLabel('Response role')
    .selectOption('transportation_coordination')
  await collaboration.getByLabel('Capability').selectOption('validate_routes')
  await collaboration.getByRole('button', { name: 'Assign role' }).click()
  await expect(collaboration).toContainText('Transportation coordination')

  await collaboration
    .locator('summary')
    .filter({ hasText: 'Approval record' })
    .click()
  await collaboration.getByLabel('Decision').selectOption('approved')
  await collaboration
    .getByLabel('Optional rationale')
    .fill('Aggregate checks are ready for configured review.')
  await collaboration.getByRole('button', { name: 'Record decision' }).click()
  await expect(collaboration).toContainText(
    'Approval decision recorded for this version',
  )

  await collaboration
    .locator('summary')
    .filter({ hasText: 'Compare versions' })
    .click()
  await collaboration
    .getByRole('button', { name: 'Compare selected versions' })
    .click()
  await expect(collaboration.getByTestId('version-comparison')).toContainText(
    'Changed:',
  )

  await collaboration
    .locator('summary')
    .filter({ hasText: 'Audit history' })
    .click()
  await expect(collaboration.locator('.audit-timeline li')).toHaveCount(5)

  const latestResponse = await request.get(
    `${backendURL}/api/v1/collaboration/plans/${planId}`,
    { headers: { Authorization: 'Bearer ' + token } },
  )
  expect(latestResponse.ok()).toBe(true)
  const latest = await latestResponse.json()
  const advanceResponse = await request.post(
    `${backendURL}/api/v1/collaboration/plans/${planId}/comments`,
    {
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      data: {
        expected_revision: latest.revision,
        body: 'Independent route validation completed.',
      },
    },
  )
  expect(advanceResponse.ok()).toBe(true)

  await collaboration.getByRole('button', { name: 'Save new version' }).click()
  await expect(collaboration).toContainText('A newer change is already stored')
  await collaboration
    .getByRole('button', { name: 'Refresh and review' })
    .click()
  await expect(collaboration).toContainText('Loaded the latest shared plan')

  const staleResponse = await request.put(
    `${backendURL}/api/v1/collaboration/plans/${planId}`,
    {
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      data: {
        expected_revision: createdPlan.revision,
        title: 'Stale overwrite',
        summary: 'This stale body must not replace the current plan.',
        status: 'draft',
        snapshot: createdPlan.versions[0].snapshot,
      },
    },
  )
  expect(staleResponse.status()).toBe(409)
  expect(staleResponse.headers()['cache-control']).toBe('no-store')

  const metricsResponse = await request.get(`${backendURL}/metrics`)
  const metrics = await metricsResponse.text()
  expect(metrics).toContain(
    'hawaii_resilience_collaboration_operations_total{operation="update",outcome="conflict"}',
  )
  expect(metrics).not.toContain(privateTitle)
  expect(metrics).not.toContain(privateNote)
  expect(metrics).not.toContain(planId)
  expect(metrics).not.toContain(token)
  expect(metrics).not.toContain('deterministic-e2e-principal')
})
