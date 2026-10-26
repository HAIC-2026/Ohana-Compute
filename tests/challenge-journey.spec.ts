import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { expect, test } from '@playwright/test'
import type { Locator, Page, TestInfo } from '@playwright/test'

import { mockOfficialHawaiiKaiStatus } from './support/mock-backend'

const uiResponseBudgetUs = 100_000
const warmApiBudgetMs = 100
const warmApiP95BudgetMs = 500
const initialHydrationBudgetMs = 2_000
const coldApiTargetMs = 1_000
const enforcePerformanceBudgets = process.env.PLAYWRIGHT_PERFORMANCE_RUN === '1'

type InteractionMetric = {
  name: string
  duration_us: number
  budget_us: number
}

type ApiMetric = {
  path: string
  cold_ms: number
  cold_target_ms: number
  warm_ms: number[]
  warm_budget_ms: number
  warm_p50_ms: number
  warm_p95_budget_ms: number
  warm_p95_ms: number
}

async function clickUntilText(trigger: Locator, expectedText: string) {
  return trigger.evaluate(
    (element, expected) =>
      new Promise<number>((resolve, reject) => {
        const startedAt = performance.now()
        const timeout = window.setTimeout(() => {
          observer.disconnect()
          reject(new Error(`Timed out waiting for "${expected}"`))
        }, 2_000)
        const observer = new MutationObserver(() => {
          if (!document.body.textContent.includes(expected)) return
          window.clearTimeout(timeout)
          observer.disconnect()
          resolve(Math.round((performance.now() - startedAt) * 1_000))
        })
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
        })
        ;(element as HTMLElement).click()
      }),
    expectedText,
  )
}

async function selectUntilText(
  trigger: Locator,
  value: string,
  expectedText: string,
) {
  return trigger.evaluate(
    (element, input) =>
      new Promise<number>((resolve, reject) => {
        const select = element as HTMLSelectElement
        const startedAt = performance.now()
        const timeout = window.setTimeout(() => {
          observer.disconnect()
          reject(new Error(`Timed out waiting for "${input.expectedText}"`))
        }, 2_000)
        const observer = new MutationObserver(() => {
          if (!document.body.textContent.includes(input.expectedText)) return
          window.clearTimeout(timeout)
          observer.disconnect()
          resolve(Math.round((performance.now() - startedAt) * 1_000))
        })
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
        })
        select.value = input.value
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }),
    { value, expectedText },
  )
}

function expectFastInteraction(
  metrics: InteractionMetric[],
  name: string,
  durationUs: number,
) {
  const metric = {
    name,
    duration_us: durationUs,
    budget_us: uiResponseBudgetUs,
  }
  metrics.push(metric)
  if (enforcePerformanceBudgets) {
    expect(
      durationUs,
      `${name} should update the interface within ${uiResponseBudgetUs} µs`,
    ).toBeLessThanOrEqual(uiResponseBudgetUs)
  }
}

function percentile(values: number[], percentileValue: number) {
  const sorted = [...values].sort((first, second) => first - second)
  const index = Math.max(
    0,
    Math.min(
      sorted.length - 1,
      Math.ceil((percentileValue / 100) * sorted.length) - 1,
    ),
  )
  return sorted[index] ?? 0
}

async function attachMetrics(
  testInfo: TestInfo,
  name: string,
  metrics: object,
) {
  const contents = JSON.stringify(metrics, null, 2)
  const outputPath = testInfo.outputPath(`${name}.json`)
  const performanceDirectory = path.resolve('test-results/performance')
  await mkdir(performanceDirectory, { recursive: true })
  await Promise.all([
    writeFile(outputPath, contents),
    writeFile(path.join(performanceDirectory, `${name}.json`), contents),
  ])
  await testInfo.attach(name, {
    path: outputPath,
    contentType: 'application/json',
  })
}

async function openApp(page: Page) {
  await page.goto('/')
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
}

test.describe.serial('2026 challenge resident journey', () => {
  test.beforeEach(async ({ page }) => {
    await mockOfficialHawaiiKaiStatus(page)
  })

  test('[journey 01] the first view answers the immediate disaster-planning questions without opening a menu', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop'))
    await openApp(page)

    const navigation: {
      dom_content_loaded_ms: number
      load_ms: number
      hydrated_ms: number
      map_ready_ms?: number
    } = await page.evaluate(() => {
      const entry = performance.getEntriesByType(
        'navigation',
      )[0] as PerformanceNavigationTiming
      return {
        dom_content_loaded_ms: Math.round(entry.domContentLoadedEventEnd),
        load_ms: Math.round(entry.loadEventEnd),
        hydrated_ms: Math.round(performance.now()),
      }
    })
    if (enforcePerformanceBudgets) {
      expect(
        navigation.hydrated_ms,
        `The production interface should hydrate within ${initialHydrationBudgetMs} ms`,
      ).toBeLessThanOrEqual(initialHydrationBudgetMs)
    }
    await expect(
      page.getByRole('heading', { name: 'Plan for your part of Hawaiʻi' }),
    ).toBeVisible()
    await expect(page.getByLabel('Choose island')).toHaveValue('Oʻahu')
    await expect(
      page.getByText('Hurricane Lala forecast exposure · practice layer'),
    ).toBeVisible()
    await expect(
      page.getByText('Damaging conditions possible in 48–72 hours'),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Who may need help' }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', {
        name: 'What local teams should confirm',
      }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'What to do first' }),
    ).toBeVisible()
    await expect(page.getByText('Next local resource check')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Plan route from my home' }),
    ).toBeVisible()
    await expect(page.locator('.map-frame')).toHaveAttribute(
      'data-map-loaded',
      'true',
    )
    navigation.map_ready_ms = await page.evaluate(() =>
      Math.round(performance.now()),
    )
    await attachMetrics(testInfo, 'initial-view-timing-ms', navigation)
  })

  test('[journey 02] a resident changes neighborhood and active event with immediate feedback', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop'))
    const metrics: InteractionMetric[] = []
    await openApp(page)
    await expect(page.locator('.map-frame')).toHaveAttribute(
      'data-map-loaded',
      'true',
    )

    expectFastInteraction(
      metrics,
      'select East Honolulu response zone',
      await selectUntilText(
        page.getByLabel('Which part of Oʻahu?'),
        'oahu-east-honolulu',
        'East Honolulu · Warning · severity 4/5',
      ),
    )
    expectFastInteraction(
      metrics,
      'switch to tropical-storm flood scenario',
      await clickUntilText(
        page.getByRole('button', { name: /Tropical Storm Nolo/ }),
        'Tropical Storm Nolo forecast exposure · practice layer',
      ),
    )
    expectFastInteraction(
      metrics,
      'switch to tsunami scenario',
      await clickUntilText(
        page.getByRole('button', { name: /Pacific Tsunami Warning/ }),
        'First waves possible in 2–3 hours',
      ),
    )
    expectFastInteraction(
      metrics,
      'switch to wildfire scenario',
      await clickUntilText(
        page.getByRole('button', { name: /Leeward Wildfire Koa/ }),
        'Wind-driven spread possible in the next 6–12 hours',
      ),
    )

    await attachMetrics(testInfo, 'event-navigation-timing-us', metrics)
  })

  test('[journey 03] one direct route surface handles search, no-car, language, and resource needs', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop'))
    const metrics: InteractionMetric[] = []
    await openApp(page)

    expectFastInteraction(
      metrics,
      'open resident route surface',
      await clickUntilText(
        page.getByRole('button', { name: 'Plan route from my home' }),
        'Start from home',
      ),
    )
    await page.getByLabel('Home address or landmark').fill('96816 Kaimukī')
    expectFastInteraction(
      metrics,
      'search resident address',
      await clickUntilText(
        page.getByRole('button', { name: 'Find routes' }),
        'Showing the nearest practice routes for Kaimukī–Kāhala.',
      ),
    )
    expectFastInteraction(
      metrics,
      'enable no-car routing',
      await clickUntilText(
        page.getByRole('checkbox', { name: /I do not have a car/ }),
        'Kilauea accessible transport pickup',
      ),
    )
    expectFastInteraction(
      metrics,
      'select Tagalog help',
      await selectUntilText(
        page.getByLabel('Help language'),
        'Tagalog',
        'Tagalog support listed',
      ),
    )
    expectFastInteraction(
      metrics,
      'switch to food and water resource',
      await clickUntilText(
        page.getByRole('tab', { name: 'Food & water' }),
        'Waiʻalae food and water hub',
      ),
    )

    await attachMetrics(testInfo, 'resident-route-timing-us', metrics)
  })

  test('[journey 04] each challenge hazard shows only its relevant official risk answer', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop'))
    await openApp(page)
    await page.getByRole('button', { name: 'Plan route from my home' }).click()
    await expect(
      page.getByText('Flood risk at this location', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText('Tsunami evacuation status', { exact: true }),
    ).not.toBeVisible()

    await page
      .locator('.planning-sheet')
      .getByRole('button', { name: 'Close panel' })
      .click()
    await page.getByRole('button', { name: /Pacific Tsunami Warning/ }).click()
    await page.getByRole('button', { name: 'Plan route from my home' }).click()
    await expect(
      page.getByText('Tsunami evacuation status', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText('Official extreme tsunami evacuation zone', {
        exact: true,
      }),
    ).toBeVisible()

    await page
      .locator('.planning-sheet')
      .getByRole('button', { name: 'Close panel' })
      .click()
    await page.getByRole('button', { name: /Leeward Wildfire Koa/ }).click()
    await page.getByRole('button', { name: 'Plan route from my home' }).click()
    await expect(
      page.getByText('Wildfire risk at this location', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText('Medium mapped wildfire risk', { exact: false }),
    ).toBeVisible()
  })

  test('[journey 05] mobile keeps the same resident actions reachable from one primary panel', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('mobile'))
    await openApp(page)

    await expect(
      page.getByRole('button', { name: 'Map', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Relief plan', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'My route', exact: true }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Map', exact: true }).click()
    await page.getByRole('radio', { name: 'Tsunami' }).click()
    await page
      .getByRole('complementary')
      .getByRole('button', { name: 'Close panel' })
      .click()
    await page.getByRole('button', { name: 'My route', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'My safe route' }),
    ).toBeVisible()
    await expect(
      page.getByRole('checkbox', { name: /I do not have a car/ }),
    ).toBeVisible()
    await expect(page.getByLabel('Help language')).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Food & water' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Medical power' })).toBeVisible()
  })
})

test('[performance] normalized backend endpoints stay in the millisecond range once cached', async ({
  request,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))

  const coordinate = '?lat=21.3&lon=-157.8'
  const paths = [
    '/healthz',
    '/api/v1/sources',
    '/api/v1/events',
    `/api/v1/events/hurricanes`,
    `/api/v1/events/tsunami`,
    `/api/v1/risk/flood${coordinate}`,
    `/api/v1/risk/tsunami${coordinate}`,
    `/api/v1/risk/wildfire${coordinate}`,
    `/api/v1/shelters/open${coordinate}`,
    `/api/v1/transportation/planned-closures${coordinate}`,
    `/api/v1/community/profile${coordinate}`,
  ]
  const metrics: ApiMetric[] = []

  for (const path of paths) {
    const coldStartedAt = performance.now()
    const coldResponse = await request.get(`http://127.0.0.1:8080${path}`, {
      timeout: 30_000,
    })
    const coldMs = performance.now() - coldStartedAt
    expect(coldResponse.status(), `${path} cold request`).toBe(200)

    const warmMs: number[] = []
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const startedAt = performance.now()
      const response = await request.get(`http://127.0.0.1:8080${path}`, {
        timeout: 5_000,
      })
      warmMs.push(Number((performance.now() - startedAt).toFixed(3)))
      expect(response.status(), `${path} warm request ${attempt + 1}`).toBe(200)
    }

    const warmP50Ms = percentile(warmMs, 50)
    const warmP95Ms = percentile(warmMs, 95)
    if (enforcePerformanceBudgets) {
      expect(
        warmP50Ms,
        `${path} cached median should finish within ${warmApiBudgetMs} ms`,
      ).toBeLessThanOrEqual(warmApiBudgetMs)
      expect(
        warmP95Ms,
        `${path} cached p95 should finish within ${warmApiP95BudgetMs} ms`,
      ).toBeLessThanOrEqual(warmApiP95BudgetMs)
    }
    metrics.push({
      path,
      cold_ms: Number(coldMs.toFixed(3)),
      cold_target_ms: coldApiTargetMs,
      warm_ms: warmMs,
      warm_budget_ms: warmApiBudgetMs,
      warm_p50_ms: warmP50Ms,
      warm_p95_budget_ms: warmApiP95BudgetMs,
      warm_p95_ms: warmP95Ms,
    })
  }

  await attachMetrics(testInfo, 'backend-api-timing-ms', metrics)
})
