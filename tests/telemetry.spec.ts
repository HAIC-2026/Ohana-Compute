import { expect, test } from './fixtures'

type TelemetryEvent = {
  kind: string
  action: string
  category: string
  route: string
  viewport: string
  outcome: string
  duration_ms?: number
}

test('browser telemetry is batched and excludes private values', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))

  const batches: Array<{ version: number; events: TelemetryEvent[] }> = []
  await page.route('**/api/v1/telemetry/browser', async (route) => {
    const body = route.request().postData()
    if (body) {
      batches.push(JSON.parse(body) as (typeof batches)[number])
    }
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"accepted":1}',
    })
  })

  const privateValue = 'private-address-123'
  await page.goto(`/?scoutTheme=dark&address=${privateValue}`)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()

  const themeButton = page.locator('.header-actions button')
  await themeButton.click()
  const planningAreaSelect = page.getByLabel('Which part of Oʻahu?')
  await planningAreaSelect.focus()
  await page.keyboard.press('ArrowDown')
  await page
    .getByRole('button', { name: 'Open public guidance preview' })
    .click()
  await page.getByLabel('Home address or landmark').fill(privateValue)
  await page.getByRole('button', { name: 'Find routes' }).click()
  await page
    .locator('.planning-sheet:visible')
    .getByRole('button', { name: 'Close panel' })
    .first()
    .click()
  await page.getByRole('button', { name: 'Open response workspace' }).click()
  await page
    .getByTestId('county-shelter-plans')
    .getByRole('tab', { name: 'Hawaiʻi' })
    .click()
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))

  await expect.poll(() => batches.length).toBeGreaterThan(0)
  const events = batches.flatMap((batch) => batch.events)
  expect(batches.every((batch) => batch.version === 1)).toBe(true)
  expect(
    events.some(
      (event) =>
        event.kind === 'page_load' &&
        ['hydration', 'map_ready'].includes(event.action),
    ),
  ).toBe(true)
  expect(
    events.some(
      (event) =>
        event.kind === 'interaction' &&
        event.category === 'planning' &&
        event.action === 'shelter_county_select',
    ),
  ).toBe(true)
  expect(
    events.some(
      (event) =>
        event.kind === 'interaction' &&
        event.category === 'select' &&
        event.action === 'keyboard',
    ),
  ).toBe(true)
  expect(
    events.some(
      (event) =>
        event.kind === 'interaction' &&
        event.category === 'input' &&
        event.action === 'change',
    ),
  ).toBe(true)
  expect(
    events.some(
      (event) =>
        event.kind === 'interaction' &&
        event.category === 'form' &&
        event.action === 'submit',
    ),
  ).toBe(true)
  expect(
    events.some(
      (event) =>
        event.kind === 'interaction' &&
        event.category === 'button' &&
        event.action === 'activate',
    ),
  ).toBe(true)

  for (const event of events) {
    expect(Object.keys(event).sort()).toEqual(
      expect.arrayContaining([
        'action',
        'category',
        'kind',
        'outcome',
        'route',
        'viewport',
      ]),
    )
    expect(event.route).toBe('home')
    if (event.duration_ms !== undefined) {
      expect(event.duration_ms).toBeGreaterThanOrEqual(0)
    }
  }

  const serialized = JSON.stringify(batches)
  expect(serialized).not.toContain(privateValue)
  expect(serialized).not.toContain(windowLocationPlaceholder)
  expect(serialized).not.toContain('Hawaiʻi Mass Care Planner')
})

const windowLocationPlaceholder = '?scoutTheme=dark'
