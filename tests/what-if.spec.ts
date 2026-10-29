import type { Page } from '@playwright/test'
import { communityProfile, expect, test } from './fixtures'
import {
  defaultScenario,
  modelWhatIf,
  scenarioSensitivity,
} from '../src/lib/what-if'
import { interpretStatewidePrompt } from '../src/lib/statewide-conversation'

test('model has exact bounded ranges, honest gaps and one-at-a-time sensitivity', () => {
  const population = { estimate: 1000, margin_of_error: 100 }
  const source = { ...communityProfile.acs.source, status: 'fresh' as const }
  const result = modelWhatIf(population, source, defaultScenario, 500)!
  expect(result.people).toEqual({ low: 90, planning: 100, high: 110 })
  expect(result.meals).toEqual({ low: 810, planning: 900, high: 990 })
  expect(result.mealGap).toEqual({ low: 310, planning: 400, high: 490 })
  expect(result.water.planning).toBe(300)
  expect(result.outageBeyondSupport.planning).toBe(0)
  const longer = modelWhatIf(population, source, {
    ...defaultScenario,
    outageDays: 5,
  })!
  expect(longer.poweredDays.planning).toBe(500)
  expect(longer.outageBeyondSupport.planning).toBe(200)
  expect(longer.mealGap).toBeNull()
  expect(scenarioSensitivity(population, source, defaultScenario, 500)).toEqual(
    [
      { label: 'Shelter uptake +5 percentage points', delta: 450 },
      { label: 'Support +1 day', delta: 300 },
      { label: 'Outage +1 day (no meal multiplier)', delta: 0 },
      { label: 'Warning +1 hour (no meal multiplier)', delta: 0 },
    ],
  )
  for (const bad of [
    undefined,
    { estimate: null, margin_of_error: 1 },
    { estimate: 1000, margin_of_error: null },
  ])
    expect(modelWhatIf(bad, source, defaultScenario)).toBeNull()
  expect(
    modelWhatIf(population, { ...source, status: 'stale' }, defaultScenario),
  ).toBeNull()
  expect(
    modelWhatIf(
      population,
      { ...source, fresh_until: '2020-01-01' },
      defaultScenario,
    ),
  ).toBeNull()
  expect(() =>
    modelWhatIf(population, source, { ...defaultScenario, supportDays: 31 }),
  ).toThrow()
  expect(() => modelWhatIf(population, source, defaultScenario, -1)).toThrow()
  expect(
    modelWhatIf(population, source, { ...defaultScenario, shelterUptake: 0 })!
      .people.planning,
  ).toBe(0)
  expect(
    modelWhatIf(population, source, defaultScenario, 100000)!.mealGap!.high,
  ).toBe(0)
})

test('bounded question grammar canonicalizes accepted commands, rejects personal and appended text', () => {
  expect(
    interpretStatewidePrompt(
      'Which Maui communities have the most kūpuna and high tsunami exposure?',
    ),
  ).toEqual({
    type: 'planning-question',
    island: 'Maui',
    indicator: 'age',
    hazard: 'tsunami',
  })
  expect(
    interpretStatewidePrompt('What’s missing for Hawaiʻi Island?'),
  ).toMatchObject({
    type: 'planning-question',
    island: 'Hawaiʻi',
    indicator: 'gaps',
  })
  expect(
    interpretStatewidePrompt('What changes if the outage lasts 5 days?'),
  ).toEqual({ type: 'outage', days: 5 })
  expect(
    interpretStatewidePrompt('What changes if the outage lasts 31 days?'),
  ).toBeNull()
  expect(interpretStatewidePrompt('Set shelter uptake to 20%')).toEqual({
    type: 'scenario-driver',
    driver: 'shelterUptake',
    value: 20,
  })
  expect(interpretStatewidePrompt('Set support to 5 days')).toEqual({
    type: 'scenario-driver',
    driver: 'supportDays',
    value: 5,
  })
  expect(interpretStatewidePrompt('Set warning lead time to 2 hours')).toEqual({
    type: 'scenario-driver',
    driver: 'warningHours',
    value: 2,
  })
  expect(interpretStatewidePrompt('Model tsunami')).toEqual({
    type: 'scenario-hazard',
    hazard: 'tsunami',
  })
  expect(interpretStatewidePrompt('Set shelter uptake to 101%')).toBeNull()
  expect(
    interpretStatewidePrompt(
      'What’s missing for Hawaiʻi Island? Jane at 123 Test St',
    ),
  ).toBeNull()
  expect(
    interpretStatewidePrompt(
      'Which Maui communities have the most kūpuna and high tsunami exposure? Jane',
    ),
  ).toBeNull()
})

async function open(page: Page) {
  await page.goto('/')
  await expect(page.locator('main')).toHaveAttribute('data-hydrated', 'true')
  if ((page.viewportSize()?.width ?? 1440) <= 900)
    await page
      .getByRole('button', { name: 'Conversation', exact: true })
      .click()
  return page
    .getByRole('region', {
      name: 'Statewide planning conversation',
      exact: true,
    })
    .filter({ visible: true })
}
async function say(page: Page, text: string) {
  const input = page
    .getByLabel('Planning question or place', { exact: true })
    .filter({ visible: true })
  await input.fill(text)
  await input.press('Enter')
}

test('what-if changes needs, time gap and meal gap without saving or transmitting free text', async ({
  page,
}, testInfo) => {
  const requests: string[] = []
  page.on('request', (request) =>
    requests.push(
      `${request.method()} ${request.url()} ${request.postData() ?? ''}`,
    ),
  )
  const chat = await open(page)
  await say(page, 'Try a what-if scenario')
  await expect(chat).toContainText('Choose a community to model needs')
  await say(page, 'Town')
  await say(page, 'What changes if the outage lasts 5 days?')
  const simulator = chat.getByRole('region', {
    name: 'What-if scenario simulator',
  })
  await expect(
    simulator.getByText('Modeled needs ranges', { exact: true }),
  ).toBeVisible()
  await expect(
    simulator.getByLabel('Outage duration (days): 5', { exact: true }),
  ).toHaveValue('5')
  await expect(
    simulator
      .locator('div')
      .filter({
        has: page.locator('dt', { hasText: /^Outage beyond planned support/ }),
      })
      .last(),
  ).toContainText('planning 474')
  await expect(simulator).toContainText('Unknown — no practice stock entered')
  await simulator
    .getByLabel('Practice meal stock (total, optional)')
    .fill('500')
  await expect(simulator).toContainText('Sensitivity: meal gap')
  await simulator.getByLabel('Days of support:', { exact: false }).fill('5')
  await expect(simulator).toContainText('planning 3,055')
  await simulator
    .getByRole('combobox', { name: 'Hazard', exact: true })
    .selectOption('wildfire')
  await simulator.getByLabel('Warning lead time', { exact: false }).fill('1')
  await simulator
    .getByText('Assumptions, sources and rule', { exact: true })
    .click()
  await expect(simulator).toContainText('afn-what-if.v1')
  await expect(simulator).toContainText('Little warning')
  await expect(
    chat.getByLabel('Planning question or place', { exact: true }),
  ).toBeInViewport({ ratio: 1 })
  await expect(
    chat.getByRole('heading', { name: 'Plan across Hawaiʻi', exact: true }),
  ).toBeInViewport({ ratio: 1 })
  await page.screenshot({ path: testInfo.outputPath('what-if.png') })
  await say(page, 'Set shelter uptake to 20%')
  await expect(
    simulator.getByLabel('Shelter uptake (%): 20', { exact: true }),
  ).toHaveValue('20')
  await say(page, 'Model tsunami')
  await expect(
    simulator.getByRole('combobox', { name: 'Hazard', exact: true }),
  ).toHaveValue('tsunami')
  const privateText = 'Private-test-marker-8184 Jane at 123 Sample Street'
  await say(page, privateText)
  await expect(chat.getByRole('alert')).toContainText('not retained or sent')
  await expect(chat.getByRole('log')).not.toContainText(privateText)
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    privateText,
  )
  expect(requests.join('\n')).not.toContain(privateText)
  expect(
    requests.filter(
      (request) =>
        request.startsWith('POST') && request.includes('/planning/plans'),
    ),
  ).toEqual([])
})

test('County question cites compatible evidence and discloses non-overlay and incomplete coverage', async ({
  page,
}, testInfo) => {
  await page.route('**/api/v1/risk/tsunami?*', (route) =>
    route.fulfill({
      json: {
        status: 'inside',
        sources: [
          {
            id: 'scenario-tsunami-test',
            authority: 'Official fixture',
            url: 'https://example.test/tsunami-screen',
            retrieved_at: '2026-10-28T00:00:00Z',
            fresh_until: '2027-10-28T00:00:00Z',
            status: 'fresh',
          },
        ],
      },
    }),
  )
  await page.route('**/api/v1/community/profile?*', (route) =>
    route.fulfill({
      json: {
        ...communityProfile,
        svi: {
          ...communityProfile.svi,
          location: 'Census Tract 1; Maui County; Hawaii',
          overall_percentile: 0.9,
        },
      },
    }),
  )
  const chat = await open(page)
  await say(
    page,
    'Which Maui communities have the most kūpuna and high tsunami exposure?',
  )
  const response = chat.getByRole('region', { name: 'County planning answer' })
  await expect(response).toContainText('afn-planning-questions.v1')
  await expect(response).toContainText('Kūpuna (age 65+): 410')
  await expect(response).toContainText(
    'Listed first: fresh, compatible tract indicators',
  )
  await expect(response).toContainText('not a population/hazard overlay')
  await response.locator('summary').first().click()
  await expect(
    response.getByRole('link', { name: 'CDC/ATSDR SVI documentation' }).first(),
  ).toHaveAttribute('href', 'https://www.atsdr.cdc.gov/place-health/php/svi/')
  await expect(
    response
      .getByRole('link', { name: 'Official fixture: screened hazard source' })
      .first(),
  ).toHaveAttribute('href', 'https://example.test/tsunami-screen')
  await page.screenshot({ path: testInfo.outputPath('county-question.png') })
  await say(page, 'What’s missing for Hawaiʻi Island?')
  await expect(response).toContainText('Hawaiʻi: Evidence gaps')
  await expect(response).toContainText('Priority is unknown, not low')
  await expect(response).toContainText('clinical power requirements')
  await response
    .getByRole('button', { name: 'Hilo & Lower Puna', exact: true })
    .click()
  await say(page, 'Try a what-if scenario')
  await expect(chat).toContainText('County-compatible tract geography')
  await expect(chat).not.toContainText('Modeled needs ranges')
})

test('source outages leave model needs and ranking unknown', async ({
  page,
}) => {
  await page.route('**/api/v1/community/profile?*', (route) =>
    route.fulfill({ status: 503, body: 'unavailable' }),
  )
  const chat = await open(page)
  await say(page, 'Town')
  await say(page, 'Try a what-if scenario')
  await expect(chat).toContainText('Modeled needs unavailable')
  await say(
    page,
    'Which Maui communities have the most kūpuna and high tsunami exposure?',
  )
  await expect(chat).toContainText('No supported ranking yet')
  await expect(chat).toContainText('Kūpuna (age 65+): unknown')
})
