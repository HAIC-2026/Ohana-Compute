import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { openLocalPlanning } from './support/local-planning'

const backend = process.env.TEST_BACKEND_URL ?? 'http://127.0.0.1:8080'

test('public views survive offline reload without presenting live data', async ({
  page,
  context,
}) => {
  await page.goto('/offline')
  await expect(
    page.getByText('Offline app shell ready on this device.'),
  ).toBeVisible({ timeout: 30_000 })
  await page
    .getByRole('button', { name: 'Save latest public planning views' })
    .click()
  await expect(
    page.getByText('Public planning views saved on this device.'),
  ).toBeVisible()
  await expect(
    page.getByText(/SAVED SNAPSHOT · Not live · Last retrieved at/),
  ).toBeVisible()
  const saved = await page.locator('.operations-records').first().innerText()
  expect(saved).toContain('Hilo')
  await context.setOffline(true)
  await page.reload()
  await expect(
    page.getByText(/SAVED SNAPSHOT · Not live · Last retrieved at/),
  ).toBeVisible()
  await expect(page.locator('.operations-records').first()).toHaveText(saved, {
    useInnerText: true,
  })
  await expect(
    page.getByRole('status').filter({ hasText: 'Offline —' }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Save latest public planning views' })
    .click()
  await expect(
    page.getByText(/Could not refresh the offline view/),
  ).toBeVisible()
  await expect(page.locator('.operations-records').first()).toHaveText(saved, {
    useInnerText: true,
  })
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Plan for the connection you have' }),
  ).toBeVisible()
  await page.goto('/exercise')
  await expect(
    page.getByText('EXERCISE ONLY · SYNTHETIC SCENARIO · NOT LIVE', {
      exact: true,
    }),
  ).toBeVisible()
  const cachedURLs = await page.evaluate(async () =>
    (
      await Promise.all(
        (await caches.keys()).map(async (key) =>
          (await (await caches.open(key)).keys()).map((entry) => entry.url),
        ),
      )
    ).flat(),
  )
  expect(
    cachedURLs.some(
      (url) =>
        url.includes('/api/') || url.includes('lat=') || url.includes('token'),
    ),
  ).toBe(false)
  await page.screenshot({
    path: `screenshots/continuity-offline-${test.info().project.name}.png`,
    fullPage: true,
  })
})

test('timed exercises isolate synthetic choices and preserve County authority', async ({
  page,
}) => {
  const apiCalls: string[] = []
  page.on('request', (request) => {
    if (
      request.url().includes('/api/v1/') &&
      !request.url().includes('/telemetry/')
    )
      apiCalls.push(request.url())
  })
  await page.clock.install()
  await page.goto('/exercise')
  await expect(
    page.getByRole('heading', { name: 'Practice before the next disaster' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Start exercise' }).click()
  await expect(
    page.getByRole('heading', { name: 'MAP: Locate needs and barriers' }),
  ).toBeVisible()
  await page.getByLabel(/C: identify trusted/).check()
  await page.clock.fastForward(61_000)
  await expect(
    page.getByRole('heading', { name: 'MODEL: Make assumptions visible' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Pause exercise' }).click()
  const clock = await page.getByLabel('Exercise clock').innerText()
  await page.clock.fastForward(61_000)
  await expect(page.getByLabel('Exercise clock')).toHaveText(clock)
  await page.getByLabel('Exercise service duration').selectOption('7')
  await expect(page.getByText('2520 gallons for discussion')).toBeVisible()
  await page.getByRole('button', { name: 'Release next inject now' }).click()
  await expect(
    page.getByRole('heading', {
      name: 'MATCH: Coordinate without overpromising',
    }),
  ).toBeVisible()
  await page.getByLabel(/We have identified County authority/).check()
  const downloadPromise = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Download EXERCISE discussion record' })
    .click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toContain('EXERCISE-hurricane-hawaii')
  const record = await readFile(await download.path(), 'utf8')
  expect(record).toContain('NOT AN ORDER OR DISPATCH')
  expect(record).toContain('Verified supply is unknown')
  await page
    .getByRole('combobox', { name: 'Exercise scenario', exact: true })
    .selectOption('1')
  await expect(
    page.getByRole('button', { name: 'Start exercise' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Start exercise' }).click()
  await expect(
    page.getByText(/Fictional smoke threatens a West Maui/),
  ).toBeVisible()
  await expect(page.getByLabel(/C: prepare plain-language/)).not.toBeChecked()
  await page.getByRole('button', { name: 'Release next inject now' }).click()
  await expect(page.getByLabel('Exercise service duration')).toHaveValue('3')
  expect(apiCalls).toEqual([])
  expect(await page.evaluate(() => localStorage.length)).toBe(0)
  await expect(page.locator('body')).toHaveJSProperty(
    'scrollWidth',
    await page.locator('body').evaluate((body) => body.clientWidth),
  )
  await page.screenshot({
    path: `screenshots/continuity-exercise-${test.info().project.name}.png`,
    fullPage: true,
  })
})

test('source health uses observed provenance and lists every catalog source', async ({
  page,
  request,
}) => {
  await request.get(`${backend}/api/v1/events`)
  const response = await request.get(`${backend}/api/v1/sources/health`)
  expect(response.headers()['cache-control']).toBe('no-store')
  const snapshot = await response.json()
  const catalog = await (await request.get(`${backend}/api/v1/sources`)).json()
  expect(snapshot.sources).toHaveLength(catalog.sources.length)
  expect(
    snapshot.sources.find(
      (source: { id: string }) => source.id === 'nws-hi-alerts',
    ).status,
  ).toBe('fresh')
  await page.goto('/source-health')
  const row = page
    .locator('.operations-records > li')
    .filter({ hasText: 'NWS active alerts for Hawaiʻi' })
  await row.locator('summary').click()
  await expect(row.getByText('Last successful retrieval')).toBeVisible()
  await expect(row.getByText('Known gaps', { exact: true })).toBeVisible()
  await expect(row.getByText(/Feed silence is not proof/)).toBeVisible()
  await expect(
    row.getByRole('link', { name: 'Open authoritative source' }),
  ).toHaveAttribute('href', 'https://api.weather.gov/alerts/active?area=HI')
  await expect(page.getByText(/Unknown does not mean zero need/)).toBeVisible()
  await page.screenshot({
    path: `screenshots/continuity-health-${test.info().project.name}.png`,
    fullPage: true,
  })
})

test('downloaded public packet copy is available offline and omits resident preferences', async ({
  page,
  context,
}) => {
  await openLocalPlanning(page)
  await page
    .getByRole('button', {
      name:
        (page.viewportSize()?.width ?? 1440) <= 900
          ? 'Response plan'
          : 'Open response workspace',
      exact: true,
    })
    .click()
  const sheet = page.locator('.planning-sheet:visible')
  await sheet.getByRole('button', { name: 'Create response checklist' }).click()
  await expect(sheet.locator('.priority-list')).toBeVisible()
  await expect(
    sheet.getByRole('button', { name: 'Download field packet' }),
  ).toBeEnabled({ timeout: 30_000 })
  const downloadPromise = page.waitForEvent('download')
  await sheet.getByRole('button', { name: 'Download field packet' }).click()
  await downloadPromise
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await (await caches.open('hmcp-packets-v1')).keys()).length,
      ),
    )
    .toBe(1)
  await page.goto('/offline')
  await expect(
    page.getByText('Offline app shell ready on this device.'),
  ).toBeVisible({ timeout: 30_000 })
  await context.setOffline(true)
  await page.reload()
  const savedDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download saved packet' }).click()
  const savedDownload = await savedDownloadPromise
  const html = await readFile(await savedDownload.path(), 'utf8')
  expect(html).toContain('SAVED PUBLIC PLANNING SNAPSHOT — NOT LIVE')
  expect(html).toContain('Last saved at')
  expect(html).not.toContain('Preferred public language:')
  expect(html).not.toContain(
    'Medical: include power-dependent equipment support',
  )
  expect(html).toContain('1 · Map affected communities')
  expect(html).toContain('2 · Model needs and gaps')
  expect(html).toContain('3 · Match response partners')
  await page.getByRole('button', { name: 'Clear saved planning data' }).click()
  await expect(
    page.getByText('No saved packets on this device yet.'),
  ).toBeVisible()
})
