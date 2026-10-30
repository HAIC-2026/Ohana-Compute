import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { capabilityIds, practiceStamp } from '../src/lib/practice-lifecycle'
import { shelterContext } from './fixtures/lifecycle-source'

const capability = (page: Page, id: string) =>
  page.locator(`[data-capability="${id}"]`)

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/lifecycle/evidence?**', async (route) => {
    if (
      route.request().headers()['if-none-match'] === 'W/"snapshot-browser-a"'
    ) {
      await route.fulfill({
        status: 304,
        headers: { ETag: 'W/"snapshot-browser-a"' },
      })
      return
    }
    await route.fulfill({
      status: 200,
      headers: { ETag: 'W/"snapshot-browser-a"' },
      contentType: 'application/json',
      body: JSON.stringify({
        schema_version: 'lifecycle-evidence.v1',
        snapshot_id: 'snapshot-browser-a',
        generated_at: '2026-10-29T20:00:00Z',
        status: 'partial',
        valid_until: '2026-10-29T21:00:00Z',
        planning_disclaimer: 'Planning context only.',
        shelter_context: shelterContext(),
        event_triggers: {
          state: 'fresh',
          status: 'partial',
          unavailable_count: 1,
          data: {
            schema_version: 'event-trigger-snapshot.v1',
            generated_at: '2026-10-29T19:59:00Z',
            status: 'partial',
            source_errors: [{ source: 'ptwc', error: 'source unavailable' }],
            triggers: [
              {
                source: 'nws',
                lifecycle: 'active',
                planning_state: 'monitor',
                title: 'Mock advisory',
              },
            ],
          },
        },
        operational_status: {
          state: 'stale',
          status: 'partial',
          unavailable_count: 1,
          data: {
            schema_version: 'live-operational-status.v1',
            generated_at: '2026-10-29T19:58:00Z',
            status: 'partial',
            domains: [
              {
                domain: 'shelter',
                status: 'stale',
                freshness: {},
              },
              {
                domain: 'road_transport',
                status: 'unavailable',
                freshness: {},
              },
            ],
          },
        },
      }),
    })
  })
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

test('live evidence panel shows feed states and pins immutable phase summary', async ({
  page,
}) => {
  const panel = page.getByRole('region', { name: 'Live lifecycle evidence' })
  await expect(panel).toContainText('snapshot-browser-a')
  await expect(panel).toContainText('1 · stale')
  await expect(panel).toContainText('Feed partial · 1 source unavailable')
  await expect(panel).toContainText('2 · stale')
  await expect(panel).toContainText('1 unavailable')
  await expect(panel).toContainText(
    'not dispatch, an order, passability, restoration',
  )
  const generated = await panel.getByText(/^Generated /).innerText()
  await panel.getByRole('button', { name: 'Refresh' }).click()
  await expect(panel.getByText(/^Generated /)).toHaveText(generated)
  await expect(panel).toContainText('snapshot-browser-a')

  await panel.getByRole('button', { name: 'Pin snapshot into before' }).click()
  await expect(
    panel.getByRole('button', { name: 'Pinned in before' }),
  ).toBeDisabled()
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('practice-lifecycle.v3') ?? '{}'),
  )
  expect(saved.pinnedEvidence).toEqual([
    expect.objectContaining({
      phase: 'before',
      snapshotId: 'snapshot-browser-a',
      triggerCount: 1,
      domainCount: 2,
      unavailableDomainCount: 1,
      eventUnavailableSourceCount: 1,
      eventTriggerState: 'stale',
      operationalStatusState: 'stale',
      eventTriggerStatus: 'partial',
      operationalStatusStatus: 'partial',
    }),
  ])
  expect(saved.capabilityMarkers).toEqual([])
  expect(saved.ledger.at(-1).capability).toBe('EVIDENCE_PIN')

  await page.unroute('**/api/v1/lifecycle/evidence?**')
  await page.route('**/api/v1/lifecycle/evidence?**', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'temporarily unavailable' }),
    })
  })
  await panel.getByRole('button', { name: 'Refresh' }).click()
  await expect(panel).toContainText('LAST KNOWN')
  await expect(panel).toContainText('snapshot-browser-a')

  await page.unroute('**/api/v1/lifecycle/evidence?**')
  await page.route('**/api/v1/lifecycle/evidence?**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300))
    await route.fulfill({
      status: 304,
      headers: { ETag: 'W/"snapshot-browser-a"' },
    })
  })
  await panel.getByRole('button', { name: 'Refresh' }).click()
  await expect(panel).toContainText('LAST KNOWN')
  await expect(panel).toContainText('Refreshing public evidence')
  await expect(panel).not.toContainText('LAST KNOWN')

  await page.unroute('**/api/v1/lifecycle/evidence?**')
  await page.route('**/api/v1/lifecycle/evidence?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        schema_version: 'lifecycle-evidence.v1',
        snapshot_id: 'snapshot-browser-b',
        generated_at: '2026-10-29T20:01:00Z',
        status: 'unavailable',
        planning_disclaimer: 'Planning context only.',
        shelter_context: {
          ...shelterContext([]),
          state: 'unavailable',
          coverage: 'unavailable',
        },
        event_triggers: {
          state: 'unavailable',
          status: 'unavailable',
          unavailable_count: 1,
          error: 'event-trigger feed unavailable',
        },
        operational_status: {
          state: 'unavailable',
          status: 'unavailable',
          unavailable_count: 1,
          error: 'operational-status feed unavailable',
        },
      }),
    })
  })
  await panel.getByRole('button', { name: 'Refresh' }).click()
  await expect(panel).toContainText('snapshot-browser-b')
  await expect(panel).toContainText('unavailable · unavailable')
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('practice-lifecycle.v3') ?? '{}')
          .pinnedEvidence[0].snapshotId,
    ),
  ).toBe('snapshot-browser-a')
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
  await expect(capability(page, 'D06')).toContainText('sealed: not chosen')
  await capability(page, 'B05')
    .getByRole('button', { name: 'Carry comparison' })
    .click()
  await expect(capability(page, 'D06')).toContainText('sealed: comparison')
  await capability(page, 'B06')
    .getByLabel('Practice channel class')
    .selectOption('printed handout')
  await capability(page, 'B06').getByRole('button').first().click()
  await expect(capability(page, 'B06')).toContainText(
    'Recorded channel class: printed handout',
  )
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
    .getByRole('button', { name: /Record unknown from/ })
    .first()
    .click()
  await expect(capability(page, 'D04')).toContainText('S-1-1 · unknown')
  await capability(page, 'D04')
    .getByRole('button', { name: /Record hold/ })
    .first()
    .click()
  await capability(page, 'D04')
    .getByRole('button', { name: /Record decline/ })
    .nth(1)
    .click()
  await expect(
    capability(page, 'D05').getByRole('button').nth(0),
  ).toBeDisabled()
  await expect(capability(page, 'D05')).toContainText('not blocked or overdue')
  await capability(page, 'D05').getByRole('button').nth(1).click()
  await capability(page, 'D06')
    .getByRole('button', { name: 'Add r2 after revealed inject' })
    .click()
  await expect(capability(page, 'D06')).toContainText('from sealed comparison')
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
  await expect(capability(page, 'A01')).toContainText(
    'Recovery review revision: r2',
  )
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
  expect(JSON.parse(recordText).schema).toBe('practice-lifecycle.v3')
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

  await capability(page, 'A09').getByLabel('recovery register').check()
  const packetButton = capability(page, 'A09').getByRole('button', {
    name: new RegExp(`Download ${practiceStamp}`),
  })
  await expect(packetButton).toBeDisabled()
  await capability(page, 'A09')
    .getByRole('button', { name: 'Save packet section selection' })
    .click()
  await expect(packetButton).toBeEnabled()
  const digest = await page
    .locator('.lifecycle-toolbar div')
    .filter({ hasText: 'Cycle digest' })
    .locator('strong')
    .innerText()
  expect(digest).toMatch(/^[a-f0-9]{16}$/)
  const packetDownload = page.waitForEvent('download')
  await packetButton.click()
  const packet = await packetDownload
  expect(packet.suggestedFilename()).toBe(
    `practice-closeout-${digest}-PRACTICE-UNSENT.txt`,
  )
  const packetText = await readFile(await packet.path(), 'utf8')
  expect(packetText).toContain(practiceStamp)
  expect(packetText).toContain('## Handoffs')
  expect(packetText).toContain('## Recovery register')

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
      page.evaluate(() => localStorage.getItem('practice-lifecycle.v3')),
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
  const text = await page
    .locator('.lifecycle-capability')
    .evaluateAll((nodes) =>
      nodes
        .map((node) => {
          const practice = node.cloneNode(true) as HTMLElement
          practice
            .querySelectorAll('.lifecycle-source-section')
            .forEach((section) => section.remove())
          return practice.textContent
        })
        .join('\n'),
    )
  expect(text).not.toMatch(
    /(Hawaiʻi County|Maui County|Honolulu|HI-EMA|DHS|Red Cross)/,
  )
  await expect(
    page.getByRole('region', { name: 'FEMA-reported shelter context' }),
  ).toContainText('Honolulu')
})
