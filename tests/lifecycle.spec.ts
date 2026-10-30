import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { capabilityIds, practiceStamp } from '../src/lib/practice-lifecycle'

const capability = (page: Page, id: string) =>
  page.locator(`[data-capability="${id}"]`)

test.beforeEach(async ({ page }) => {
  await page.goto('/lifecycle')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(
    page.getByRole('heading', {
      name: 'Practice the complete event lifecycle',
    }),
  ).toBeVisible()
  await expect(page.locator('[data-lifecycle-restored]')).toHaveAttribute(
    'data-lifecycle-restored',
    'true',
  )
})

test('all 30 lifecycle capabilities work on desktop and mobile', async ({
  page,
}) => {
  const apiWrites: string[] = []
  page.on('request', (request) => {
    if (
      request.method() !== 'GET' &&
      request.url().includes('/api/') &&
      !request.url().includes('/telemetry/')
    )
      apiWrites.push(`${request.method()} ${request.url()}`)
  })

  await capability(page, 'B01')
    .getByRole('button', { name: 'Lock practice event' })
    .click()
  const gapButtons = capability(page, 'B02').getByRole('button')
  await gapButtons.nth(0).click()
  await gapButtons.nth(1).click()
  await capability(page, 'B03')
    .getByRole('button', { name: 'Freeze objective selection' })
    .click()
  await capability(page, 'B04')
    .getByRole('button', { name: 'Compute bounded margin' })
    .click()
  await capability(page, 'B05')
    .getByRole('button', { name: 'Carry comparison' })
    .click()
  await capability(page, 'B06').getByRole('button').first().click()
  await capability(page, 'B07')
    .getByRole('button', { name: /Record criteria present for/ })
    .first()
    .click()
  const scopeButtons = capability(page, 'B08').getByRole('button')
  await scopeButtons.nth(0).click()
  await scopeButtons.nth(1).click()
  const injectButtons = capability(page, 'B09').getByRole('button')
  await injectButtons.nth(0).click()
  await injectButtons.nth(1).click()
  await expect(
    capability(page, 'B10').getByRole('button', {
      name: 'Seal immutable H1',
    }),
  ).toBeEnabled()
  await capability(page, 'B10')
    .getByRole('button', { name: 'Seal immutable H1' })
    .click()

  await capability(page, 'D01')
    .getByRole('button', { name: 'Start response practice' })
    .click()
  await capability(page, 'D02')
    .getByRole('button', { name: 'Advance 60m' })
    .click()
  await capability(page, 'D03')
    .getByRole('button', { name: /as unknown/ })
    .first()
    .click()
  await capability(page, 'D03')
    .getByRole('button', { name: /as unavailable/ })
    .nth(1)
    .click()
  await capability(page, 'D04')
    .getByRole('button', { name: /Record hold/ })
    .first()
    .click()
  await capability(page, 'D04')
    .getByRole('button', { name: /Record decline/ })
    .nth(1)
    .click()
  await capability(page, 'D05').getByRole('button').nth(1).click()
  await capability(page, 'D06')
    .getByRole('button', { name: 'Add r2 after revealed inject' })
    .click()
  await capability(page, 'D07')
    .getByRole('button', { name: 'Create next guidance version' })
    .click()
  await capability(page, 'D08')
    .getByRole('button', { name: 'Freeze shift counts' })
    .click()
  await capability(page, 'D09').getByRole('button').first().click()
  const dispositionGroups = capability(page, 'D10').locator(
    '.lifecycle-choice-group',
  )
  await dispositionGroups
    .nth(0)
    .getByRole('button', { name: /carried/ })
    .click()
  await dispositionGroups
    .nth(1)
    .getByRole('button', { name: /set aside/ })
    .click()
  await capability(page, 'D10')
    .getByRole('button', { name: 'Seal immutable H2' })
    .click()

  await capability(page, 'A01').getByRole('button').click()
  const unmetGroups = capability(page, 'A02').locator('.lifecycle-choice-group')
  for (let index = 0; index < 5; index++) {
    await unmetGroups
      .nth(index)
      .getByRole('button', {
        name: index === 0 ? /Unknown — not zero/ : /1–9 aggregate/,
      })
      .click()
  }
  await capability(page, 'A03')
    .getByRole('button', { name: 'Attempt hold review' })
    .click()
  const recheckButtons = capability(page, 'A04').getByRole('button')
  for (let index = 0; index < 2; index++)
    await recheckButtons.nth(index).click()
  const guidanceGroups = capability(page, 'A05').locator(
    '.lifecycle-choice-group',
  )
  for (let index = 0; index < 4; index++) {
    await guidanceGroups
      .nth(index)
      .getByRole('button', {
        name: index % 2 === 0 ? /carried into recovery draft r1/ : /as unknown/,
      })
      .click()
  }
  const objectiveGroups = capability(page, 'A06').locator(
    '.lifecycle-choice-group',
  )
  for (let index = 0; index < 3; index++) {
    await objectiveGroups
      .nth(index)
      .getByRole('button', {
        name: index === 0 ? /carry-forward/ : /note-only/,
      })
      .click()
  }
  await expect(
    capability(page, 'A07').getByRole('button', {
      name: 'Record gates met',
    }),
  ).toBeEnabled()
  await capability(page, 'A07')
    .getByRole('button', { name: 'Record gates met' })
    .click()

  const recordDownload = page.waitForEvent('download')
  await capability(page, 'A08')
    .getByRole('button', { name: 'Download strict record' })
    .click()
  const record = await recordDownload
  expect(record.suggestedFilename()).toMatch(
    /^practice-lifecycle-[a-f0-9]{16}\.json$/,
  )
  const recordText = await readFile(await record.path(), 'utf8')
  expect(JSON.parse(recordText).schema).toBe('practice-lifecycle.v1')
  expect(recordText).toContain(practiceStamp)
  await capability(page, 'A08')
    .getByRole('button', {
      name: 'Copy current record into comparison field',
    })
    .click()
  await capability(page, 'A08')
    .getByRole('button', { name: 'Pin read-only comparison' })
    .click()
  await expect(capability(page, 'A08')).toContainText('content not merged')

  await capability(page, 'A09')
    .getByRole('button', { name: 'Save packet section selection' })
    .click()
  const packetDownload = page.waitForEvent('download')
  await capability(page, 'A09')
    .getByRole('button', { name: new RegExp(`Download ${practiceStamp}`) })
    .click()
  const packet = await packetDownload
  expect(packet.suggestedFilename()).toMatch(
    /^practice-closeout-[a-f0-9]{16}-PRACTICE-UNSENT\.txt$/,
  )
  const packetText = await readFile(await packet.path(), 'utf8')
  expect(packetText).toContain(practiceStamp)
  expect(packetText).toContain('## Handoffs')

  await capability(page, 'A10')
    .getByRole('button', {
      name: 'Seal carry-forward and start next cycle',
    })
    .click()

  await expect(page.getByText('30/30')).toBeVisible()
  await expect(page.getByText('Cycle 1 is read-only.')).toBeVisible()
  for (const id of capabilityIds) {
    await expect(capability(page, id)).toHaveClass(/is-complete/)
    await expect(capability(page, id).getByLabel(`${id} marker`)).toHaveText(
      'Recorded',
    )
  }
  expect(apiWrites).toEqual([])
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('practice-lifecycle.v1')),
    )
    .not.toBeNull()
  const width = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }))
  expect(width.body).toBeLessThanOrEqual(width.viewport)
  await page.screenshot({
    path: `screenshots/lifecycle-complete-${test.info().project.name}.png`,
    fullPage: true,
  })
  await page.reload()
  await expect(page.getByText('30/30')).toBeVisible()
  await expect(page.getByText('Cycle 1 is read-only.')).toBeVisible()
})

test('legacy exercise path resolves to the single lifecycle workspace', async ({
  page,
}) => {
  await page.goto('/exercise')
  await expect(page).toHaveURL(/\/lifecycle$/)
  await expect(
    page.getByRole('heading', {
      name: 'Practice the complete event lifecycle',
    }),
  ).toBeVisible()
})

test('lifecycle has no forbidden controls, free-text operational fields, or real practice actors', async ({
  page,
}) => {
  await expect(
    page.getByRole('button', {
      name: /send|notify|submit|dispatch|activate/i,
    }),
  ).toHaveCount(0)
  await expect(page.locator('input[type="text"]')).toHaveCount(0)
  const text = await page.locator('main').innerText()
  expect(text).not.toMatch(
    /(Hawaiʻi County|Maui County|Honolulu|HI-EMA|DHS|Red Cross)/,
  )
})
