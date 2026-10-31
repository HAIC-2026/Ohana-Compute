import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { capabilityIds, practiceStamp } from '../src/lib/practice-lifecycle'
import { shelterContext } from './fixtures/lifecycle-source'

const capability = (page: Page, id: string) =>
  page.locator(`[data-capability="${id}"]`)

const openAllCapabilityDetails = async (page: Page) => {
  await expect(page.locator('[data-lifecycle-restored]')).toHaveAttribute(
    'data-lifecycle-restored',
    'true',
  )
  await page
    .locator('.lifecycle-capability-details')
    .evaluateAll((details) =>
      details.forEach((detail) => ((detail as HTMLDetailsElement).open = true)),
    )
}

const closeAllCapabilityDetails = async (page: Page) => {
  await page
    .locator('.lifecycle-capability-details')
    .evaluateAll((details) =>
      details.forEach(
        (detail) => ((detail as HTMLDetailsElement).open = false),
      ),
    )
}

const sealH1WithCollapsedActions = async (
  page: Page,
  { gaps = 2, areas = 2 }: { gaps?: number; areas?: number } = {},
) => {
  await capability(page, 'B01').locator('.lifecycle-primary-action').click()
  for (let index = 0; index < gaps; index++)
    await capability(page, 'B02').locator('.lifecycle-primary-action').click()
  await capability(page, 'B03').locator('.lifecycle-primary-action').click()
  await capability(page, 'B04').locator('.lifecycle-primary-action').click()
  await capability(page, 'B05').locator('.lifecycle-primary-action').click()
  await capability(page, 'B06').locator('.lifecycle-primary-action').click()
  await capability(page, 'B07').locator('.lifecycle-primary-action').click()
  for (let index = 0; index < areas; index++)
    await capability(page, 'B08').locator('.lifecycle-primary-action').click()
  for (let index = 0; index < areas; index++)
    await capability(page, 'B09').locator('.lifecycle-primary-action').click()
  await capability(page, 'B10').locator('.lifecycle-primary-action').click()
}

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
        planning_location: {
          point: ['-158.193546', '21.450442'],
          algorithm_version: 'rfc7946-planar-rational-v1',
        },
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
    JSON.parse(localStorage.getItem('practice-lifecycle.v5') ?? '{}'),
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
        planning_location: {
          point: ['-158.193546', '21.450442'],
          algorithm_version: 'rfc7946-planar-rational-v1',
        },
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
        JSON.parse(localStorage.getItem('practice-lifecycle.v5') ?? '{}')
          .pinnedEvidence[0].snapshotId,
    ),
  ).toBe('snapshot-browser-a')
})

test('scan-first default keeps critical state visible and exact records keyboard accessible', async ({
  page,
}, testInfo) => {
  const details = page.locator('.lifecycle-capability-details')
  await expect(details).toHaveCount(30)
  await expect(page.locator('.lifecycle-capability-details[open]')).toHaveCount(
    0,
  )
  await expect(page.getByText('PRACTICE', { exact: true })).toBeVisible()
  await expect(page.getByText('LOCAL', { exact: true })).toBeVisible()
  await expect(page.getByText('UNSENT', { exact: true })).toBeVisible()
  await expect(page.getByText('NO AUTHORITY', { exact: true })).toBeVisible()
  await expect(page.getByText('public evidence needs attention')).toBeVisible()
  await expect(
    capability(page, 'B01').getByRole('button', {
      name: 'Lock practice event',
    }),
  ).toBeVisible()
  await expect(
    capability(page, 'B01').getByLabel('Fictional hazard event'),
  ).toBeHidden()

  const savedBefore = await page.evaluate(() =>
    localStorage.getItem('practice-lifecycle.v5'),
  )
  const summary = capability(page, 'B01').locator(
    '.lifecycle-capability-details > summary',
  )
  await summary.focus()
  await summary.press('Enter')
  await expect(
    capability(page, 'B01').getByLabel('Fictional hazard event'),
  ).toBeVisible()
  await summary.press('Space')
  await expect(
    capability(page, 'B01').getByLabel('Fictional hazard event'),
  ).toBeHidden()
  expect(
    await page.evaluate(() => localStorage.getItem('practice-lifecycle.v5')),
  ).toBe(savedBefore)

  const scan = await page.evaluate(() => {
    const root = document.querySelector('.operations-page')!
    const text = Array.from(document.querySelectorAll('.operations-content *'))
      .filter((element) => {
        const closed = element.closest('details:not([open])')
        return (
          (!closed ||
            closed.querySelector(':scope > summary')?.contains(element)) &&
          element.children.length === 0 &&
          getComputedStyle(element).display !== 'none'
        )
      })
      .map((element) => element.textContent.trim())
      .filter(Boolean)
      .join(' ')
    return {
      words: text.split(/\s+/).filter(Boolean).length,
      controls: Array.from(
        document.querySelectorAll(
          '.operations-content button, .operations-content a[href], .operations-content input, .operations-content select, .operations-content textarea, .operations-content summary',
        ),
      ).filter((element) => {
        const closed = element.closest('details:not([open])')
        return (
          !closed || closed.querySelector(':scope > summary')?.contains(element)
        )
      }).length,
      firstCapabilityTop:
        capabilityTop() - root.getBoundingClientRect().top + root.scrollTop,
      viewportHeight: root.clientHeight,
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
    }

    function capabilityTop() {
      return document
        .querySelector('[data-capability="B01"]')!
        .getBoundingClientRect().top
    }
  })
  expect(scan.words).toBeLessThanOrEqual(700)
  expect(scan.controls).toBeLessThanOrEqual(65)
  expect(scan.firstCapabilityTop / scan.viewportHeight).toBeLessThanOrEqual(
    testInfo.project.name.includes('mobile') ? 3 : 2,
  )
  expect(scan.scrollWidth).toBeLessThanOrEqual(scan.clientWidth)
})

test('all 30 lifecycle capabilities work on desktop and mobile', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await openAllCapabilityDetails(page)
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
  await capability(page, 'B02').locator('.lifecycle-primary-action').click()
  await capability(page, 'B02').locator('.lifecycle-primary-action').click()
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
  await capability(page, 'B08').locator('.lifecycle-primary-action').click()
  await capability(page, 'B08').locator('.lifecycle-primary-action').click()
  await capability(page, 'B09').locator('.lifecycle-primary-action').click()
  await capability(page, 'B09').locator('.lifecycle-primary-action').click()
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
  await closeAllCapabilityDetails(page)
  await expect(capability(page, 'B02')).toContainText('Review')
  await expect(
    capability(page, 'B02').locator('.lifecycle-primary-action'),
  ).toHaveCount(0)
  await expect(capability(page, 'A01')).toContainText('Waiting')
  await expect(
    capability(page, 'A01').locator('.lifecycle-primary-action'),
  ).toHaveCount(0)
  await expect(
    capability(page, 'B01').locator('.lifecycle-capability-details > summary'),
  ).toHaveAccessibleName(/B01 Details/)
  await openAllCapabilityDetails(page)
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
    .locator('.lifecycle-capability-details')
    .evaluate((details) => ((details as HTMLDetailsElement).open = true))
  await capability(page, 'D04')
    .getByRole('button', { name: /Record decline/ })
    .last()
    .click()
  await expect(
    capability(page, 'D05').locator(
      '.lifecycle-capability-detail-body button:disabled',
    ),
  ).toBeDisabled()
  await expect(capability(page, 'D05')).toContainText('not blocked or overdue')
  await capability(page, 'D05').locator('.lifecycle-primary-action').click()
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
  await closeAllCapabilityDetails(page)
  await expect(page.getByLabel('Lifecycle attention summary')).toContainText(
    /decline|blocked|unavailable|unknown|stale/,
  )
  const moreAttention = page
    .getByLabel('Lifecycle attention summary')
    .locator('.lifecycle-attention-more')
  await expect(moreAttention).toBeVisible()
  await moreAttention.locator('summary').click()
  await expect(moreAttention).toContainText('D08: 1 stale evidence')
  await expect(
    page.getByLabel('Lifecycle status').getByText('Mass-care lead'),
  ).toBeVisible()
  await openAllCapabilityDetails(page)
  const dispositionGroups = capability(page, 'D10').locator(
    '.lifecycle-choice-group',
  )
  await capability(page, 'D10').locator('.lifecycle-primary-action').click()
  await dispositionGroups
    .nth(1)
    .getByRole('button', { name: /set aside/ })
    .click()
  await closeAllCapabilityDetails(page)
  await expect(capability(page, 'D10')).toContainText('Ready')
  await expect(
    capability(page, 'D10').locator('.lifecycle-primary-action'),
  ).toHaveText('Seal immutable H2')
  await capability(page, 'D10').locator('.lifecycle-primary-action').click()
  await expect(page.getByRole('heading', { name: 'After phase' })).toBeVisible()
  await openAllCapabilityDetails(page)

  await capability(page, 'A01').locator('.lifecycle-primary-action').click()
  const creator = capability(page, 'A01').getByText(
    /^Create follow-through for /,
  )
  await expect(creator).toBeVisible()
  await expect(
    capability(page, 'A01').getByLabel(/Follow-through owner/),
  ).toBeHidden()
  await creator.focus()
  await creator.press('Enter')
  await capability(page, 'A01')
    .getByLabel(/Follow-through owner/)
    .selectOption('Recovery lead')
  await capability(page, 'A01')
    .getByLabel(/Follow-through due horizon/)
    .selectOption('next day')
  await capability(page, 'A01')
    .getByLabel(/Follow-through done check/)
    .selectOption('practice-recheck-recorded')
  await capability(page, 'A01')
    .getByRole('button', {
      name: 'Create structured follow-through',
      exact: true,
    })
    .click()
  await closeAllCapabilityDetails(page)
  await expect(
    capability(page, 'A01').locator('.lifecycle-primary-action'),
  ).toHaveText('Start follow-through')
  await capability(page, 'A01').locator('.lifecycle-primary-action').click()
  await expect(
    capability(page, 'A01').locator('.lifecycle-primary-action'),
  ).toHaveText('Record observed')
  await capability(page, 'A01').locator('.lifecycle-primary-action').click()
  await expect(
    capability(page, 'A01').locator('.lifecycle-primary-action'),
  ).toHaveText('Finish')
  await capability(page, 'A01').locator('.lifecycle-primary-action').click()
  await openAllCapabilityDetails(page)
  await expect(capability(page, 'A01')).toContainText('Recovery lead')
  await expect(capability(page, 'A01')).toContainText(/ · done/)
  await expect(capability(page, 'A01')).toContainText('No carry-forward')
  await expect(capability(page, 'A01').getByText(/origin cycle 1/)).toBeHidden()
  const exactRecord = capability(page, 'A01').getByText(
    / · done · exact practice record and actions/,
  )
  await exactRecord.focus()
  await exactRecord.press('Enter')
  await expect(capability(page, 'A01')).toContainText('origin cycle 1')
  await expect(capability(page, 'A01')).toContainText(
    'practice-recheck-recorded',
  )
  await exactRecord.press('Space')
  await expect(
    capability(page, 'A01').getByText(/^Create follow-through for /),
  ).toHaveCount(0)
  await expect(capability(page, 'A01')).toContainText(
    'Recovery review revision: r2',
  )
  const unmetGroups = capability(page, 'A02').locator('.lifecycle-choice-group')
  for (let index = 0; index < 5; index++) {
    if (index === 0) {
      await capability(page, 'A02').locator('.lifecycle-primary-action').click()
    } else {
      await unmetGroups
        .nth(index)
        .getByRole('button', { name: /1–9 aggregate/ })
        .click()
    }
  }
  await capability(page, 'A03')
    .getByRole('button', { name: 'Attempt hold review' })
    .click()
  await closeAllCapabilityDetails(page)
  await expect(
    capability(page, 'A07').locator('.lifecycle-primary-action'),
  ).toHaveText('Carry unmet gates')
  await capability(page, 'A07').locator('.lifecycle-primary-action').click()
  await expect(
    capability(page, 'A07').locator('.lifecycle-primary-action'),
  ).toHaveCount(0)
  await expect(capability(page, 'A07').getByLabel('A07 marker')).toHaveText(
    'Recorded',
  )
  expect(
    JSON.parse(
      (await page.evaluate(() =>
        localStorage.getItem('practice-lifecycle.v5'),
      ))!,
    ).gateDecision,
  ).toBe('gates-unmet-carry-forward')
  await openAllCapabilityDetails(page)
  for (let index = 0; index < 2; index++)
    await capability(page, 'A04').locator('.lifecycle-primary-action').click()
  for (let index = 0; index < 4; index++)
    await capability(page, 'A05').locator('.lifecycle-primary-action').click()
  for (let index = 0; index < 3; index++)
    await capability(page, 'A06').locator('.lifecycle-primary-action').click()
  await expect(
    capability(page, 'A10').locator('.lifecycle-primary-action'),
  ).toHaveCount(0)
  await expect(
    capability(page, 'A10')
      .locator('.lifecycle-capability-snapshot > p')
      .first(),
  ).toHaveText('Gate decision stale; record the current result')
  await expect(capability(page, 'A10')).toContainText(
    'gate decision stale: gates-met',
  )
  await expect(
    capability(page, 'A10').getByRole('button', {
      name: 'Seal carry-forward and start next cycle',
    }),
  ).toBeDisabled()
  await expect(
    capability(page, 'A07').getByRole('button', {
      name: 'Record gates met',
    }),
  ).toBeEnabled()
  await capability(page, 'A07')
    .locator('.lifecycle-capability-details > summary')
    .click()
  await expect(
    capability(page, 'A07').locator('.lifecycle-primary-action'),
  ).toHaveText('Record gates met')
  await capability(page, 'A07').locator('.lifecycle-primary-action').click()

  const recordDownload = page.waitForEvent('download')
  await capability(page, 'A08')
    .getByRole('button', { name: 'Download strict record' })
    .click()
  const record = await recordDownload
  expect(record.suggestedFilename()).toMatch(
    /^practice-lifecycle-[a-f0-9]{16}\.json$/,
  )
  const recordText = await readFile(await record.path(), 'utf8')
  const recordJson = JSON.parse(recordText)
  expect(recordJson.schema).toBe('practice-lifecycle.v5')
  expect(recordJson.followThroughItems[0]).toMatchObject({
    owner: 'Recovery lead',
    dueHorizon: 'next day',
    doneCheck: 'practice-recheck-recorded',
    status: 'done',
    observations: [{ result: 'observed' }],
  })
  expect(recordText).toContain('"followThroughItems"')
  expect(recordText).toContain(practiceStamp)
  await capability(page, 'A08')
    .getByRole('button', {
      name: 'Copy current record into comparison field',
    })
    .click()
  await closeAllCapabilityDetails(page)
  await expect(
    capability(page, 'A08').locator('.lifecycle-primary-action'),
  ).toHaveText('Pin read-only comparison')
  await capability(page, 'A08').locator('.lifecycle-primary-action').click()
  await openAllCapabilityDetails(page)
  await expect(capability(page, 'A08')).toContainText('content not merged')

  await capability(page, 'A09').getByLabel('recovery register').check()
  const packetButton = capability(page, 'A09').getByRole('button', {
    name: new RegExp(`Download ${practiceStamp}`),
  })
  await expect(packetButton).toBeDisabled()
  await capability(page, 'A09')
    .getByRole('button', { name: 'Save packet section selection' })
    .click()
  await closeAllCapabilityDetails(page)
  await expect(
    capability(page, 'A09').locator('.lifecycle-primary-action'),
  ).toContainText('Download')
  await openAllCapabilityDetails(page)
  await expect(packetButton).toBeEnabled()
  await page.locator('.lifecycle-overview-record > summary').click()
  const identity = await page
    .locator('.lifecycle-overview-record p')
    .innerText()
  const digest = identity.match(/[a-f0-9]{16}$/)?.[0]
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

  await expect(page.getByText('30/30', { exact: true })).toBeVisible()
  await expect(page.getByText('Cycle 1 is read-only.')).toBeVisible()
  for (const id of capabilityIds) {
    await expect(capability(page, id)).toHaveClass(/is-complete/)
    await expect(capability(page, id).getByLabel(`${id} marker`)).toHaveText(
      id.startsWith('B') ? /Ready|Recorded/ : 'Waiting',
    )
  }
  expect(apiWrites).toEqual([])
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('practice-lifecycle.v5')),
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
  await openAllCapabilityDetails(page)
  await expect(page.getByText('30/30', { exact: true })).toBeVisible()
  await expect(page.getByText('Cycle 1 is read-only.')).toBeVisible()
})

test('collapsed repeated actions advance distinct support items', async ({
  page,
}) => {
  await sealH1WithCollapsedActions(page)
  for (const id of ['B01', 'B06', 'B07', 'B08', 'B09']) {
    await expect(capability(page, id).getByLabel(`${id} marker`)).toHaveText(
      'Review',
    )
    await expect(
      capability(page, id).locator('.lifecycle-primary-action'),
    ).toHaveCount(0)
  }
  await capability(page, 'D01').locator('.lifecycle-primary-action').click()
  await expect(
    capability(page, 'D07').locator('.lifecycle-primary-action'),
  ).toHaveAccessibleName('Create next guidance version')
  await capability(page, 'D07').locator('.lifecycle-primary-action').click()
  await expect(
    capability(page, 'D07').locator('.lifecycle-primary-action'),
  ).toHaveCount(0)
  await capability(page, 'D02').locator('.lifecycle-primary-action').click()
  await expect(
    capability(page, 'D07').locator('.lifecycle-primary-action'),
  ).toHaveAccessibleName('Create next guidance version')
  await capability(page, 'D07').locator('.lifecycle-primary-action').click()
  await expect(
    capability(page, 'D07').locator('.lifecycle-primary-action'),
  ).toHaveCount(0)
  await capability(page, 'D03').locator('.lifecycle-primary-action').click()
  await expect(
    capability(page, 'D07').locator('.lifecycle-primary-action'),
  ).toHaveAccessibleName('Create next guidance version')
  await capability(page, 'D07').locator('.lifecycle-primary-action').click()
  await capability(page, 'D03').locator('.lifecycle-primary-action').click()
  await expect(
    capability(page, 'D07').locator('.lifecycle-primary-action'),
  ).toHaveAccessibleName('Create next guidance version')
  await capability(page, 'D07').locator('.lifecycle-primary-action').click()
  await expect(
    capability(page, 'D07').locator('.lifecycle-primary-action'),
  ).toHaveCount(0)
  await capability(page, 'D03')
    .locator('.lifecycle-capability-details')
    .evaluate((details) => ((details as HTMLDetailsElement).open = true))
  await capability(page, 'D03')
    .getByRole('button', {
      name: 'Record Community outreach as unknown',
    })
    .click()
  await expect(
    capability(page, 'D07').locator('.lifecycle-primary-action'),
  ).toHaveCount(0)
  await capability(page, 'D03')
    .locator('.lifecycle-capability-details')
    .evaluate((details) => ((details as HTMLDetailsElement).open = true))
  await capability(page, 'D03')
    .getByRole('button', {
      name: 'Record Community outreach as unavailable',
    })
    .click()
  await expect(
    capability(page, 'D07').locator('.lifecycle-primary-action'),
  ).toHaveAccessibleName('Create next guidance version')
  await capability(page, 'D07').locator('.lifecycle-primary-action').click()

  for (const index of [0, 1]) {
    await capability(page, 'D04')
      .locator('.lifecycle-capability-details')
      .evaluate((details) => ((details as HTMLDetailsElement).open = true))
    await capability(page, 'D04')
      .getByRole('button', { name: /Record decline/ })
      .nth(index)
      .click()
  }
  await closeAllCapabilityDetails(page)
  await expect(
    capability(page, 'D05').locator('.lifecycle-primary-action'),
  ).toHaveAccessibleName('Escalate S-1-1 with bounded deadline')
  await capability(page, 'D05').locator('.lifecycle-primary-action').click()
  await expect(
    capability(page, 'D05').locator('.lifecycle-primary-action'),
  ).toHaveAccessibleName('Escalate S-1-2 with bounded deadline')
  await capability(page, 'D05').locator('.lifecycle-primary-action').click()

  const supportItems = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('practice-lifecycle.v5')!).supportItems,
  )
  expect(
    supportItems.filter((item: { escalation: unknown }) => item.escalation),
  ).toHaveLength(2)

  await capability(page, 'D10').locator('.lifecycle-primary-action').click()
  await capability(page, 'D10').locator('.lifecycle-primary-action').click()
  await capability(page, 'D10').locator('.lifecycle-primary-action').click()
  await expect(
    capability(page, 'A04').locator('.lifecycle-primary-action'),
  ).toHaveAccessibleName('Plan Mass-care support recheck')
  await capability(page, 'A04').locator('.lifecycle-primary-action').click()
  await expect(
    capability(page, 'A04').locator('.lifecycle-primary-action'),
  ).toHaveAccessibleName('Plan Community outreach recheck')
  await capability(page, 'A04').locator('.lifecycle-primary-action').click()
  await expect(
    capability(page, 'A04').locator('.lifecycle-primary-action'),
  ).toHaveCount(0)
  const recheckPlans = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('practice-lifecycle.v5')!).recheckPlans,
  )
  expect(recheckPlans.map((plan: { area: string }) => plan.area)).toEqual([
    'Mass-care support',
    'Community outreach',
  ])
})

test('collapsed A01 advances five rows and keeps unable follow-through visible', async ({
  page,
}) => {
  await sealH1WithCollapsedActions(page, { gaps: 5, areas: 1 })
  await capability(page, 'D01').locator('.lifecycle-primary-action').click()
  for (let index = 0; index < 5; index++)
    await capability(page, 'D10').locator('.lifecycle-primary-action').click()
  await capability(page, 'D10').locator('.lifecycle-primary-action').click()

  for (let index = 1; index <= 5; index++) {
    await expect(
      capability(page, 'A01').locator('.lifecycle-primary-action'),
    ).toHaveAccessibleName(`Set follow-up ready for S-1-${index}`)
    await capability(page, 'A01').locator('.lifecycle-primary-action').click()
  }
  await expect(
    capability(page, 'A01').locator('.lifecycle-primary-action'),
  ).toHaveAccessibleName('Create structured follow-through for S-1-1')
  await capability(page, 'A01').locator('.lifecycle-primary-action').click()
  await expect(
    capability(page, 'A01').locator('.lifecycle-primary-action'),
  ).toHaveAccessibleName('Start follow-through for 1:S-1-1')
  await capability(page, 'A01').locator('.lifecycle-primary-action').click()
  await expect(
    capability(page, 'A01').locator('.lifecycle-primary-action'),
  ).toHaveAccessibleName('Record observed for 1:S-1-1')
  await capability(page, 'A01').locator('.lifecycle-primary-action').click()
  await expect(
    capability(page, 'A01').locator('.lifecycle-primary-action'),
  ).toHaveAccessibleName('Finish follow-through for 1:S-1-1')
  await capability(page, 'A01').locator('.lifecycle-primary-action').click()

  await expect(
    capability(page, 'A01').locator('.lifecycle-primary-action'),
  ).toHaveAccessibleName('Create structured follow-through for S-1-2')
  await capability(page, 'A01').locator('.lifecycle-primary-action').click()
  await capability(page, 'A01').locator('.lifecycle-primary-action').click()
  await openAllCapabilityDetails(page)
  await capability(page, 'A01')
    .locator('details')
    .evaluateAll((details) =>
      details.forEach((detail) => ((detail as HTMLDetailsElement).open = true)),
    )
  await capability(page, 'A01')
    .getByRole('button', { name: 'Record not-observed for 1:S-1-2' })
    .click()
  await closeAllCapabilityDetails(page)
  await expect(
    capability(page, 'A01').locator('.lifecycle-primary-action'),
  ).toHaveAccessibleName('Mark unable: 1:S-1-2')
  await capability(page, 'A01').locator('.lifecycle-primary-action').click()

  await expect(capability(page, 'A01')).toContainText(
    '0 open · 1 unable follow-through',
  )
  await expect(capability(page, 'A01')).toContainText('medical: unable')
  await expect(page.getByLabel('Lifecycle attention summary')).toContainText(
    '1 unable follow-through',
  )
  await expect(
    capability(page, 'A01').locator('.lifecycle-primary-action'),
  ).toHaveAccessibleName('Create structured follow-through for S-1-3')
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
  await capability(page, 'D03')
    .locator('.lifecycle-capability-details > summary')
    .click()
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

test('reset removes failed v3 migration state durably', async ({ page }) => {
  await page.goto('/lifecycle')
  await expect(page.locator('[data-lifecycle-restored]')).toHaveAttribute(
    'data-lifecycle-restored',
    'true',
  )
  await page.evaluate(() => {
    localStorage.clear()
    localStorage.setItem('practice-lifecycle.v3', '{"schema":"broken"}')
  })
  await page.reload()
  await expect(
    page.getByText(/Reset to start a new local practice cycle/),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Reset lifecycle' }).click()
  expect(
    await page.evaluate(() => localStorage.getItem('practice-lifecycle.v3')),
  ).toBeNull()
  await page.reload()
  await expect(
    page.getByText(/Reset to start a new local practice cycle/),
  ).toHaveCount(0)
})
