import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import { resourceDemandFixture } from './fixtures'
import { openLocalPlanning } from './support/local-planning'

async function expectNoHorizontalOverflow(page: Page, panel: Locator) {
  const pageOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  )
  expect(pageOverflow).toBeLessThanOrEqual(1)
  const overflowing = await panel.evaluate((root) => {
    const rootBox = root.getBoundingClientRect()
    const sheet = root.closest('.planning-sheet') ?? document.documentElement
    const sheetBox = sheet.getBoundingClientRect()
    const outside = (box: DOMRect, left: number, right: number) =>
      box.left < left - 1 || box.right > right + 1
    const problems: string[] = []
    if (outside(rootBox, Math.max(0, sheetBox.left), sheetBox.right))
      problems.push('resource-demand outside sheet')
    if (outside(rootBox, 0, window.innerWidth))
      problems.push('resource-demand outside viewport')
    for (const element of [
      root,
      ...Array.from(
        root.querySelectorAll(
          '[data-testid^="cmist-"], .resource-demand-assumptions li',
        ),
      ),
    ]) {
      if (element.getClientRects().length === 0) continue
      const label =
        element.getAttribute('data-testid') ??
        element.textContent.trim().slice(0, 40)
      if (element.scrollWidth > element.clientWidth + 1)
        problems.push(`${label} scrolls horizontally`)
      if (
        element !== root &&
        outside(element.getBoundingClientRect(), rootBox.left, rootBox.right)
      )
        problems.push(`${label} outside panel`)
    }
    return problems
  })
  expect(overflowing).toEqual([])
}

// Element screenshots of regions taller than the scrolling sheet are stitched
// from a resized viewport and can crop sticky headers; capture the real viewport
// once the target is scrolled to the top and its position has settled.
async function captureInViewport(page: Page, target: Locator, path: string) {
  await target.evaluate((element) =>
    element.scrollIntoView({ block: 'start', inline: 'nearest' }),
  )
  let previous = ''
  await expect
    .poll(async () => {
      const box = JSON.stringify(await target.boundingBox())
      const stable = box === previous
      previous = box
      return stable
    })
    .toBe(true)
  const box = await target.boundingBox()
  const width = page.viewportSize()?.width ?? 1440
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0)
  expect((box?.x ?? 0) + (box?.width ?? width + 1)).toBeLessThanOrEqual(
    width + 1,
  )
  await page.screenshot({ path, animations: 'disabled' })
}

test('CMIST cards separate modeled need from unknown supply and expose returned assumptions', async ({
  page,
}, testInfo) => {
  await page.route('**/api/v1/planning/resource-demand', async (route) => {
    const body = route.request().postDataJSON() as Parameters<
      typeof resourceDemandFixture
    >[0]
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(resourceDemandFixture(body)),
    })
  })

  await openLocalPlanning(page)
  if ((page.viewportSize()?.width ?? 1440) <= 900) {
    await page
      .getByRole('button', { name: 'Response plan', exact: true })
      .click()
  } else {
    await page.getByRole('button', { name: 'Open response workspace' }).click()
  }
  const demandPanel = page
    .locator('.planning-sheet:visible')
    .getByTestId('resource-demand')

  const transportation = demandPanel.getByTestId('cmist-transportation')
  await expect(transportation).toContainText('Modeled need 14–56 households')
  await expect(transportation).toContainText('Needed capability')
  await expect(transportation).toContainText('wheelchair-accessible vehicles')
  await expect(transportation).toContainText('Compatible supply unit')
  await expect(transportation).toContainText(
    'Accessible transport seats per trip',
  )
  await expect(transportation).toContainText(
    'Unknown · no County-published or matched partner supply',
  )
  await expect(transportation).toContainText('no gap is calculated')
  await expect(transportation).toContainText('Validate with County or partner')
  await expect(transportation).toContainText(
    'How many accessible seats and wheelchair positions per trip',
  )
  await expect(demandPanel.locator('[data-testid^="cmist-"] dl')).toHaveCount(5)
  await expect(demandPanel).not.toContainText('CMIST gap')
  await expectNoHorizontalOverflow(page, demandPanel)
  const cmistCards = demandPanel.getByRole('region', {
    name: 'CMIST need estimates',
  })
  await captureInViewport(
    page,
    cmistCards.getByRole('heading', { name: /CMIST need matrix/ }),
    testInfo.outputPath('cmist-capability-cards.png'),
  )

  await demandPanel
    .getByText('Model evidence and assumptions', { exact: true })
    .click()
  const assumptions = demandPanel.getByRole('region', {
    name: 'Returned model assumptions',
  })
  await expect(assumptions).toBeVisible()
  await expect(assumptions).toContainText('Mass-care service population')
  await expect(assumptions).toContainText('share of aggregate population')
  await expect(assumptions).toContainText('Low 11% · planning 23% · high 35%')
  await expect(assumptions).toContainText('Versioned scenario assumption.')
  await expect(assumptions).toContainText(
    'not statistical confidence intervals',
  )
  await expectNoHorizontalOverflow(page, demandPanel)
  await captureInViewport(
    page,
    assumptions,
    testInfo.outputPath('cmist-returned-assumptions.png'),
  )
})

test('unavailable CMIST keeps no fabricated range or assumptions', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  await page.route('**/api/v1/planning/resource-demand', async (route) => {
    const body = route.request().postDataJSON() as Parameters<
      typeof resourceDemandFixture
    >[0]
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        resourceDemandFixture({
          ...body,
          population: { ...body.population, status: 'unavailable' },
        } as Parameters<typeof resourceDemandFixture>[0]),
      ),
    })
  })

  await openLocalPlanning(page)
  await page.getByRole('button', { name: 'Open response workspace' }).click()
  const demandPanel = page
    .locator('.planning-sheet:visible')
    .getByTestId('resource-demand')
  const medical = demandPanel.getByTestId('cmist-medical')
  await expect(medical).toContainText('Unavailable · population unavailable')
  await expect(medical).not.toContainText('Modeled need')
  await expect(medical).toContainText('Unknown · no County-published')
  await demandPanel
    .getByText('Model evidence and assumptions', { exact: true })
    .click()
  await expect(
    demandPanel.getByRole('region', { name: 'Returned model assumptions' }),
  ).toContainText('No assumptions were returned for this calculation.')
})
