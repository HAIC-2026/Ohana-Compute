import { expect, test } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'

async function signIn(
  browser: Browser,
  subject: string,
  viewport: { width: number; height: number },
) {
  const context = await browser.newContext({
    viewport,
    baseURL: 'http://127.0.0.1:3196',
  })
  const page = await context.newPage()
  await page.goto('/operations')
  await page
    .getByRole('link', { name: 'Sign in with your organization' })
    .click()
  await page.locator('select[name="subject"]').selectOption(subject)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  return { context, page }
}

function localTime(minutes: number) {
  const time = new Date(Date.now() + minutes * 60_000)
  time.setSeconds(0, 0)
  return `${time.getFullYear()}-${String(time.getMonth() + 1).padStart(2, '0')}-${String(time.getDate()).padStart(2, '0')}T${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
}

async function refresh(page: Page) {
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
}

async function openRequest(page: Page, reference: string) {
  await refresh(page)
  await page.getByRole('button').filter({ hasText: reference }).click()
  await expect(
    page.getByRole('heading', { name: reference, exact: true }),
  ).toBeVisible()
}

async function saved(page: Page) {
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Saved to the shared workspace.' }),
  ).toBeVisible()
}

test('staff handoffs stay beside the planning map and return to the same planning state', async ({
  browser,
}, testInfo) => {
  const viewport =
    testInfo.project.name === 'mobile'
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 }
  const { context, page } = await signIn(browser, 'county-staff', viewport)
  try {
    await page.goto('/')
    await expect(page.locator('main.app')).toHaveAttribute(
      'data-hydrated',
      'true',
    )
    await page
      .getByRole('button', { name: 'Staff response', exact: true })
      .click()
    const workspace = page.getByRole('complementary', {
      name: 'Map-linked staff workspace',
    })
    await expect(workspace).toBeVisible()
    await expect(
      workspace.getByRole('button', { name: 'Sign out' }),
    ).toBeVisible()
    await expect(workspace.getByText(/Map scope: All islands/)).toBeVisible()
    await expect(page).toHaveURL('http://127.0.0.1:3196/')
    const map = await page.locator('.map-stage').boundingBox()
    const panel = await workspace.boundingBox()
    expect(map).not.toBeNull()
    expect(panel).not.toBeNull()
    if (map && panel) {
      expect(map.width).toBeGreaterThan(200)
      expect(map.height).toBeGreaterThan(120)
      if (viewport.width > 900)
        expect(map.x + map.width).toBeLessThanOrEqual(panel.x + 1)
      else expect(map.y + map.height).toBeLessThanOrEqual(panel.y + 1)
    }
    await workspace
      .getByRole('button', { name: 'Preparedness', exact: true })
      .click()
    await expect(
      workspace.getByRole('heading', {
        name: 'Close the gaps before the next emergency',
      }),
    ).toBeVisible()
    await expect(
      workspace.getByRole('button', { name: 'Back to planning', exact: true }),
    ).toBeInViewport()
    await expect(page.locator('body')).toHaveJSProperty(
      'scrollWidth',
      viewport.width,
    )
    await page.screenshot({
      path: `screenshots/map-staff-${testInfo.project.name}.png`,
    })
    await workspace
      .getByRole('button', { name: 'Back to planning', exact: true })
      .click()
    await expect(workspace).toHaveCount(0)
    await expect(page.locator('.map-stage')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Staff response', exact: true }),
    ).toBeFocused()
    if (viewport.width > 900) {
      await page
        .getByLabel('Choose island', { exact: true })
        .selectOption('Oʻahu')
      await page
        .getByRole('button', { name: 'Staff response', exact: true })
        .click()
      await expect(
        workspace.getByText(/Map scope: Honolulu County/),
      ).toBeVisible()
      await workspace
        .getByRole('button', { name: 'Back to planning', exact: true })
        .click()
      await expect(
        page.getByLabel('Choose island', { exact: true }),
      ).toHaveValue('Oʻahu')
    }
  } finally {
    await context.close()
  }
})

test('real signed staff sessions complete a declined, escalated and reassigned handoff and preparedness review', async ({
  browser,
}, testInfo) => {
  const viewport =
    testInfo.project.name === 'mobile'
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 }
  const contexts: Array<BrowserContext> = []
  const login = async (subject: string) => {
    const user = await signIn(browser, subject, viewport)
    contexts.push(user.context)
    return user.page
  }
  try {
    const county = await login('county-staff')
    const state = await login('state-staff')
    const alpha = await login('transport-staff')
    const bravo = await login('backup-transport-staff')
    const receiving = await login('receiving-staff')
    const other = await login('other-county-staff')
    const ref = `EXERCISE-${testInfo.project.name}-${Date.now()}`
    await county.getByRole('button', { name: 'New assistance request' }).click()
    await county.getByLabel('Incident / exercise reference').fill('DRILL-2026')
    await county.getByLabel('Intake reference', { exact: true }).fill(ref)
    await county
      .getByLabel('County-requested completion deadline')
      .fill(localTime(60))
    await county.getByRole('button', { name: 'Create shared request' }).click()
    await saved(county)
    await openRequest(county, ref)
    for (const page of [state, alpha, bravo, receiving, other]) {
      await refresh(page)
      await expect(page.getByText(ref, { exact: true })).toHaveCount(0)
    }
    await county
      .getByRole('button', { name: 'Verify intake & assistance' })
      .click()
    await saved(county)
    await county
      .getByLabel('Receiving organization')
      .selectOption('receiving-team')
    await county
      .getByRole('button', { name: 'Request receiving confirmation' })
      .click()
    await saved(county)
    await openRequest(receiving, ref)
    await receiving
      .getByRole('button', {
        name: 'Confirm destination can meet stated needs',
      })
      .click()
    await saved(receiving)
    await openRequest(county, ref)
    await county
      .getByLabel('Transport organization')
      .selectOption('transport-one')
    await county
      .getByRole('button', { name: 'Offer transport assignment' })
      .click()
    await saved(county)
    await openRequest(alpha, ref)
    await alpha
      .getByRole('button', { name: 'Decline / withdraw assignment' })
      .click()
    await saved(alpha)
    await openRequest(county, ref)
    await expect(
      county.getByText('Blocked: no vehicle. Coordinator follow-up required.'),
    ).toBeVisible()
    await county.screenshot({
      path: testInfo.outputPath('county-blocked.png'),
      fullPage: true,
    })
    await county.getByRole('button', { name: 'Request State support' }).click()
    await saved(county)
    await openRequest(state, ref)
    await expect(
      state.getByRole('button', { name: 'Cancel request' }),
    ).toHaveCount(0)
    await state
      .getByLabel('Transport organization')
      .selectOption('transport-two')
    await state
      .getByRole('button', { name: 'Offer transport assignment' })
      .click()
    await saved(state)
    await refresh(alpha)
    await expect(alpha.getByText(ref, { exact: true })).toHaveCount(0)
    await openRequest(bravo, ref)
    await bravo.getByLabel('Provider pickup ETA').fill(localTime(30))
    await bravo.getByRole('button', { name: 'Accept & commit ETA' }).click()
    await saved(bravo)
    await expect(
      bravo.getByRole('button', { name: 'Confirm pickup completed' }),
    ).toHaveCount(0)
    await openRequest(county, ref)
    await county.getByRole('checkbox').check()
    await county
      .getByRole('button', { name: 'Record movement prerequisites confirmed' })
      .click()
    await saved(county)
    await openRequest(bravo, ref)
    await bravo
      .getByRole('button', { name: 'Confirm pickup completed' })
      .click()
    await saved(bravo)
    await openRequest(receiving, ref)
    await receiving
      .getByRole('button', { name: 'Confirm arrival received' })
      .click()
    await saved(receiving)
    await openRequest(county, ref)
    await county
      .getByRole('button', { name: 'Close confirmed handoff' })
      .click()
    await saved(county)
    await county.getByText(/Handoff history ·/).click()
    await expect(county.getByText('To EXERCISE Transport Bravo')).toBeVisible()
    await county.screenshot({
      path: testInfo.outputPath('closed-handoff.png'),
      fullPage: true,
    })
    await county
      .getByRole('button', { name: 'Create preparedness task' })
      .click()
    const form = county
      .getByRole('heading', { name: 'Prevent this gap next time' })
      .locator('..')
    await form
      .getByLabel('Responsible organization')
      .selectOption('transport-one')
    await form.getByLabel('Review deadline').fill(localTime(24 * 60))
    await form.getByRole('button', { name: 'Assign readiness task' }).click()
    await saved(county)
    await alpha
      .getByRole('button', { name: 'Preparedness', exact: true })
      .click()
    await refresh(alpha)
    const task = alpha.locator('.ops-task').filter({ hasText: ref })
    await task.getByLabel('Evidence reference').fill(`AGREEMENT-${Date.now()}`)
    await task
      .getByRole('button', { name: 'Submit evidence for County review' })
      .click()
    await saved(alpha)
    await county
      .getByRole('button', { name: 'Preparedness', exact: true })
      .click()
    await refresh(county)
    await county
      .locator('.ops-task')
      .filter({ hasText: ref })
      .getByRole('button', { name: 'Confirm reviewed evidence & close' })
      .click()
    await saved(county)
    await county.screenshot({
      path: testInfo.outputPath('preparedness-reviewed.png'),
      fullPage: true,
    })
    const metrics = await county.request.get('http://127.0.0.1:8196/metrics')
    const text = await metrics.text()
    expect(text).toContain(
      'hawaii_resilience_coordination_handoff_duration_seconds_count',
    )
    expect(text).not.toContain(ref)
    expect(text).not.toContain('county-staff')
    const stored = await county.evaluate(() =>
      JSON.stringify({
        local: Object.fromEntries(
          Object.keys(localStorage).map((key) => [
            key,
            localStorage.getItem(key),
          ]),
        ),
        session: Object.fromEntries(
          Object.keys(sessionStorage).map((key) => [
            key,
            sessionStorage.getItem(key),
          ]),
        ),
      }),
    )
    expect(stored).not.toContain(ref)
    expect(stored).not.toContain('AGREEMENT-')
    expect(stored).not.toMatch(/eyJ[A-Za-z0-9_-]+\./)
    const cookies = await county.context().cookies()
    for (const cookie of cookies.filter((value) =>
      value.name.includes('staff'),
    )) {
      expect(cookie.httpOnly).toBe(true)
      expect(stored).not.toContain(cookie.value)
    }
    expect(
      await county.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await county.getByRole('button', { name: 'Sign out' }).click()
    await expect(
      county.getByRole('link', { name: 'Sign in with your organization' }),
    ).toBeVisible()
    await refresh(state)
    await expect(state.getByRole('button', { name: 'Sign out' })).toBeVisible()
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})

test('failed save and disconnected state never imply an accepted handoff', async ({
  browser,
}, testInfo) => {
  const { context, page } = await signIn(browser, 'county-staff', {
    width: 390,
    height: 844,
  })
  try {
    await page.route('**/api/v1/operations/requests', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Persistence unavailable. Nothing confirmed.',
        }),
      })
    })
    await page.getByRole('button', { name: 'New assistance request' }).click()
    await page.getByLabel('Incident / exercise reference').fill('FAILURE-DRILL')
    await page
      .getByLabel('Intake reference', { exact: true })
      .fill(`FAILURE-${testInfo.project.name}`)
    await page
      .getByLabel('County-requested completion deadline')
      .fill(localTime(60))
    await page.getByRole('button', { name: 'Create shared request' }).click()
    await expect(page.getByRole('alert')).toContainText('Nothing confirmed')
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Saved to the shared workspace.' }),
    ).toHaveCount(0)
    await page.route('**/api/v1/operations/board', (route) => route.abort())
    await refresh(page)
    await expect(
      page.getByText('Disconnected — actions disabled'),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Create shared request' }),
    ).toBeDisabled()
  } finally {
    await context.close()
  }
})
