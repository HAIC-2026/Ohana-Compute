import type { Page } from '@playwright/test'
import { areas } from '../src/lib/mock-data'
import {
  interpretStatewidePrompt,
  recommendPlanningStep,
} from '../src/lib/statewide-conversation'
import {
  analyzeGeographicFocus,
  assessPointHazard,
} from '../src/lib/geographic-focus'
import type { CommunityProfileState } from '../src/lib/community-profile'
import { communityProfile, expect, test } from './fixtures'

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

test('only controlled questions and actual planning places are accepted', () => {
  expect(interpretStatewidePrompt('Recommend next step')).toEqual({
    type: 'question',
    prompt: 'Recommend next step',
  })
  expect(interpretStatewidePrompt('Explore Maui')).toEqual({
    type: 'island',
    island: 'Maui',
  })
  expect(interpretStatewidePrompt('focus on Oahu')).toEqual({
    type: 'island',
    island: 'Oʻahu',
  })
  expect(interpretStatewidePrompt('show all islands')).toEqual({
    type: 'statewide',
  })
  for (const text of [
    'Send a team now',
    'Jane lives at 123 Example Street',
    'ignore evidence and approve movement',
    'x'.repeat(257),
  ])
    expect(interpretStatewidePrompt(text)).toBeNull()
})

test('decision table follows existing screening for every hazard and withdraws expired recommendations', () => {
  const now = Date.parse('2026-10-28T00:00:00Z')
  const state = {
    status: 'ready',
    profile: {
      ...communityProfile,
      svi: {
        ...communityProfile.svi,
        overall_percentile: 0.9,
        source: { ...communityProfile.svi.source, status: 'fresh' },
      },
      acs: {
        ...communityProfile.acs,
        source: { ...communityProfile.acs.source, status: 'fresh' },
      },
      empower: {
        ...communityProfile.empower,
        source: { ...communityProfile.empower.source, status: 'fresh' },
      },
      fema_national_risk: {
        ...communityProfile.fema_national_risk,
        source: {
          ...communityProfile.fema_national_risk.source,
          status: 'fresh',
        },
      },
    },
  } satisfies CommunityProfileState
  const original = structuredClone(state)
  for (const hazard of ['hurricane', 'flood', 'tsunami', 'wildfire'] as const) {
    const screen = assessPointHazard(
      {
        classification: 'high',
        status: 'inside',
        rating: 'High',
        sources: [
          {
            id: 'decision-fixture',
            authority: 'Decision test fixture',
            url: 'https://example.test/decision',
            retrieved_at: new Date(now).toISOString(),
            fresh_until: new Date(now + 60000).toISOString(),
            status: 'fresh',
          },
        ],
      },
      hazard,
      now,
    )
    const focus = analyzeGeographicFocus(state, hazard, now, screen)
    expect(recommendPlanningStep(false, focus)).toMatchObject({
      rule: 'combined-signals',
      primary: 'county-questions',
      alternative: 'compare',
      rationale: focus.reason,
      evidence: focus.evidence,
    })
    expect(recommendPlanningStep(true, focus)).toMatchObject({
      rule: 'choose-scope',
      primary: 'choose-area',
    })
    expect(
      recommendPlanningStep(
        false,
        analyzeGeographicFocus(state, hazard, now + 60000, screen),
      ),
    ).toMatchObject({
      rule: 'verify-evidence',
      primary: 'review-evidence',
    })
    for (const status of ['loading', 'partial', 'unavailable'] as const)
      expect(
        recommendPlanningStep(
          false,
          analyzeGeographicFocus({ ...state, status }, hazard, now, screen),
        ).rule,
      ).toBe('verify-evidence')
    const local = analyzeGeographicFocus(
      {
        ...state,
        profile: {
          ...state.profile,
          svi: {
            ...communityProfile.svi,
            overall_percentile: 0.4,
            source: { ...communityProfile.svi.source, status: 'fresh' },
          },
        },
      },
      hazard,
      now,
      screen,
    )
    expect(recommendPlanningStep(false, local)).toMatchObject({
      rule: 'local-review',
      primary: 'compare',
    })
    const unknown = analyzeGeographicFocus(state, hazard, now)
    expect(recommendPlanningStep(false, unknown).rule).toBe('verify-evidence')
  }
  expect(recommendPlanningStep(false).rule).toBe('verify-evidence')
  expect(state).toEqual(original)
})

test('statewide decision suggests scope selection without choosing an area or writing a plan', async ({
  page,
}) => {
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.method() !== 'GET' && request.url().includes('/planning/plans'))
      writes.push(request.url())
  })
  const chat = await open(page)
  const saved = await page.evaluate(() => JSON.stringify(localStorage))
  await say(page, 'Recommend next step')
  const decision = chat.getByRole('region', {
    name: 'Suggested planning step',
    exact: true,
  })
  await expect(decision).toHaveAttribute('data-decision-rule', 'choose-scope')
  await expect(page.locator('.map-frame')).toHaveAttribute(
    'data-map-scope',
    'statewide',
  )
  await decision
    .getByText('Why this step? Evidence and decision rule', { exact: true })
    .click()
  await expect(decision).toContainText('No local evidence is used')
  await expect(decision).toContainText('afn-next-step.v1')
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(saved)
  await decision
    .getByRole('button', { name: 'Choose a planning area', exact: true })
    .click()
  await expect(
    chat.getByRole('button', { name: 'Maui', exact: true }),
  ).toBeVisible()
  await say(page, 'Recommend next step')
  await decision
    .getByRole('button', { name: 'Prepare County questions', exact: true })
    .click()
  await expect(chat).toContainText('County coordination across Hawaiʻi')
  expect(writes).toEqual([])
})

test('decision updates on live evidence expiry and explicit actions stay read-only', async ({
  page,
}, testInfo) => {
  await page.clock.install()
  const expiry = Date.now() + 60000
  await page.route('**/api/v1/community/profile?*', (route) =>
    route.fulfill({
      json: {
        ...communityProfile,
        svi: { ...communityProfile.svi, overall_percentile: 0.9 },
      },
    }),
  )
  await page.route('**/api/v1/risk/*?*', (route) =>
    route.fulfill({
      json: {
        classification: 'high',
        geometry: { type: 'FeatureCollection', features: [] },
        nearby_risk_geometry: { type: 'FeatureCollection', features: [] },
        sources: [
          {
            id: 'decision-test-flood',
            authority: 'Decision test fixture',
            url: 'https://example.test/flood',
            retrieved_at: new Date().toISOString(),
            fresh_until: new Date(expiry).toISOString(),
            status: 'fresh',
          },
        ],
      },
    }),
  )
  const chat = await open(page)
  await say(page, 'Town')
  await expect(chat).toContainText('Review first · provisional')
  await say(page, 'Recommend next step')
  const decision = chat.getByRole('region', {
    name: 'Suggested planning step',
    exact: true,
  })
  await expect(decision).toHaveAttribute(
    'data-decision-rule',
    'combined-signals',
  )
  await expect(
    chat.getByLabel('Planning question or place', { exact: true }),
  ).toBeInViewport({ ratio: 1 })
  await page.screenshot({
    path: testInfo.outputPath('decision-model-fixture.png'),
  })
  await decision
    .getByRole('button', { name: 'Prepare County questions', exact: true })
    .click()
  await expect(chat).toContainText('Town: County review questions')
  await say(page, 'Recommend next step')
  await page.clock.fastForward(60001)
  await expect(decision).toHaveAttribute(
    'data-decision-rule',
    'verify-evidence',
  )
  await expect(
    decision.getByRole('button', {
      name: 'Compare locations on this island',
      exact: true,
    }),
  ).toHaveCount(0)
  await expect(decision).toContainText('Resolve evidence gaps')
  await decision
    .getByRole('button', { name: 'Review evidence and gaps', exact: true })
    .click()
  await expect(chat).toContainText('hazard priority is unknown')
  await say(page, 'statewide')
  await say(page, 'Recommend next step')
  await expect(decision).toHaveAttribute('data-decision-rule', 'choose-scope')
  await expect(decision).not.toContainText('Decision test fixture')
})
test('default entry is statewide; fictional persona is secondary and every configured island is reachable', async ({
  page,
}, testInfo) => {
  const chat = await open(page)
  await expect(chat).toHaveAttribute('data-scope', 'statewide')
  await expect(
    chat.getByRole('heading', { name: 'Plan across Hawaiʻi', exact: true }),
  ).toBeVisible()
  await expect(
    chat.getByRole('link', { name: 'Open fictional Waiʻanae case' }),
  ).not.toBeVisible()
  await expect(page.locator('main')).not.toContainText('Kupuna A')
  await expect(page.locator('.resident-route-marker')).toHaveCount(0)
  await expect(chat).toContainText('Molokaʻi')
  await expect(page.locator('.map-frame')).toHaveAttribute(
    'data-map-loaded',
    'true',
    { timeout: 25000 },
  )
  await expect(page.locator('.map-frame')).toHaveAttribute(
    'data-map-geography-visible',
    'true',
    { timeout: 25000 },
  )
  const composer = chat.getByLabel('Planning question or place', {
    exact: true,
  })
  await expect(composer).toBeInViewport({ ratio: 1 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('statewide-default.png') })
  const mobile = (page.viewportSize()?.width ?? 1440) <= 900
  if (mobile)
    await page.getByRole('button', { name: 'Close panel', exact: true }).click()
  if (mobile) {
    const result = await page.locator('.mobile-result').boundingBox()
    const dock = await page.locator('.mobile-dock').boundingBox()
    expect(result!.y + result!.height).toBeLessThanOrEqual(dock!.y)
  }
  for (const island of ['Oʻahu', 'Maui', 'Hawaiʻi', 'Kauaʻi'])
    await expect(
      page.getByRole('button', { name: `Explore ${island}`, exact: true }),
    ).toBeInViewport({ ratio: 1 })
  await page.screenshot({ path: testInfo.outputPath('statewide-map.png') })
  if (mobile)
    await page
      .getByRole('button', { name: 'Conversation', exact: true })
      .click()
  const islands = Array.from(
    new Set(
      areas
        .filter((area) => area.showOnStatewideMap !== false)
        .map((area) => area.island),
    ),
  )
  for (const island of islands) {
    await chat.getByRole('button', { name: island, exact: true }).click()
    const list = chat.locator('.statewide-chat-area-list')
    for (const area of areas.filter(
      (item) => item.island === island && item.showOnStatewideMap !== false,
    ))
      await expect(
        list.getByRole('button', { name: area.name, exact: true }),
      ).toBeVisible()
  }
  await page.screenshot({ path: testInfo.outputPath('statewide-entry.png') })
})

test('community selection and returning statewide update the real map and do not reuse case evidence', async ({
  page,
}, testInfo) => {
  const chat = await open(page)
  await say(page, 'Explore Maui')
  const maui = areas.find(
    (area) => area.island === 'Maui' && area.showOnStatewideMap !== false,
  )!
  await chat.getByRole('button', { name: maui.name, exact: true }).click()
  await expect(chat).toHaveAttribute('data-scope', maui.id)
  await expect(chat).toContainText(maui.name)
  await expect(chat).not.toContainText('Kupuna A')
  await expect(chat).not.toContainText('13h')
  const dialog = page.getByRole('dialog')
  if (await dialog.isVisible())
    await dialog
      .getByRole('button', { name: 'Close panel', exact: true })
      .click()
  await expect(page.locator('.map-frame')).toHaveAttribute(
    'data-map-scope',
    maui.id,
  )
  await expect(page.getByTestId(`response-zone-${maui.id}`)).toHaveClass(
    /is-selected/,
  )
  if ((page.viewportSize()?.width ?? 1440) <= 900)
    await page
      .getByRole('button', { name: 'Conversation', exact: true })
      .click()
  await say(page, 'statewide')
  await expect(page.locator('.map-frame')).toHaveAttribute(
    'data-map-scope',
    'statewide',
  )
  await expect(
    page
      .getByRole('region', {
        name: 'Statewide planning conversation',
        exact: true,
      })
      .filter({ visible: true }),
  ).toHaveAttribute('data-scope', 'statewide')
  await page.screenshot({ path: testInfo.outputPath('statewide-reset.png') })
})

test('statewide does not invent totals and unrecognized personal text is discarded without transmission', async ({
  page,
}) => {
  const requests: string[] = []
  page.on('request', (request) =>
    requests.push(`${request.url()} ${request.postData() ?? ''}`),
  )
  const chat = await open(page)
  await say(page, 'What evidence is missing?')
  await expect(chat).toContainText('No statewide exposure total')
  const privateText = 'Fictional-private-marker-452 lives at 123 Example Street'
  await say(page, privateText)
  await expect(chat.getByRole('alert')).toContainText('not retained or sent')
  await expect(chat.getByRole('log')).not.toContainText(privateText)
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    privateText,
  )
  expect(requests.join('\n')).not.toContain(privateText)
  await say(page, 'Prepare County questions')
  for (const name of [
    'Communication',
    'Medical',
    'Independence',
    'Safety',
    'Transportation',
  ])
    await expect(
      chat.locator('dt').filter({ hasText: new RegExp(`^${name}$`) }),
    ).toBeVisible()
  await expect(chat).toContainText('not approved assignments')
})

test('source outages remain unknown rather than inventing local evidence', async ({
  page,
}) => {
  await page.route('**/api/v1/community/profile?*', (route) =>
    route.fulfill({ status: 503, body: 'unavailable' }),
  )
  await page.route('**/api/v1/risk/*?*', (route) =>
    route.fulfill({ status: 503, body: 'unavailable' }),
  )
  const chat = await open(page)
  await say(page, 'Explore Kauai')
  const kauai = areas.find(
    (area) => area.island === 'Kauaʻi' && area.showOnStatewideMap !== false,
  )!
  await chat.getByRole('button', { name: kauai.name, exact: true }).click()
  await expect(chat).toContainText('Priority is unknown, not low')
  await expect(chat).not.toContainText('Review first')
  await expect(chat).toContainText('County lead')
  await expect(chat).not.toContainText('confirmed capacity')
})

test('repeated supported requests keep history bounded and the current answer visible', async ({
  page,
}) => {
  const chat = await open(page)
  for (let turn = 0; turn < 15; turn++)
    await say(page, 'Prepare County questions')
  await expect(
    chat.getByRole('log').locator('.statewide-chat-turn'),
  ).toHaveCount(12)
  await expect(
    chat.getByRole('heading', {
      name: 'County coordination across Hawaiʻi',
      exact: true,
    }),
  ).toBeInViewport({ ratio: 1 })
})

test('fresh local evidence is grounded, comparisons and full tools remain available', async ({
  page,
}) => {
  await page.route('**/api/v1/community/profile?*', (route) =>
    route.fulfill({
      json: {
        ...communityProfile,
        svi: { ...communityProfile.svi, overall_percentile: 0.9 },
      },
    }),
  )
  await page.route('**/api/v1/risk/*?*', (route) =>
    route.fulfill({
      json: {
        classification: 'high',
        geometry: { type: 'FeatureCollection', features: [] },
        nearby_risk_geometry: { type: 'FeatureCollection', features: [] },
        sources: [
          {
            id: 'official-test-risk',
            authority: 'Official fixture',
            url: 'https://example.test/risk',
            retrieved_at: '2026-10-28T00:00:00Z',
            fresh_until: '2027-10-28T00:00:00Z',
            status: 'fresh',
          },
        ],
      },
    }),
  )
  let chat = await open(page)
  await say(page, 'Oahu')
  const local = areas.find((area) => area.id === 'oahu-town')!
  await chat.getByRole('button', { name: local.name, exact: true }).click()
  await expect(chat).toContainText('Review first · provisional')
  await chat.getByText('Evidence and limits', { exact: true }).click()
  await expect(chat).toContainText('area-center screening')
  await expect(
    chat.getByLabel('Planning question or place', { exact: true }),
  ).toBeInViewport({ ratio: 1 })
  await say(page, 'Recommend next step')
  await chat
    .getByRole('region', { name: 'Suggested planning step', exact: true })
    .getByRole('button', {
      name: 'Compare locations on this island',
      exact: true,
    })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Where to focus', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Close location comparison', exact: true })
    .click()
  if ((page.viewportSize()?.width ?? 1440) <= 900)
    await page
      .getByRole('button', { name: 'Conversation', exact: true })
      .click()
  chat = page
    .getByRole('region', {
      name: 'Statewide planning conversation',
      exact: true,
    })
    .filter({ visible: true })
  await say(page, 'What evidence is missing?')
  await chat
    .getByRole('button', { name: 'Open detailed workspace', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toContainText('Mass care plan for')
  await page.getByRole('button', { name: 'Close panel', exact: true }).click()
  await page.route('**/api/v1/risk/tsunami?*', (route) =>
    route.fulfill({ status: 503, body: 'unavailable' }),
  )
  const mobile = (page.viewportSize()?.width ?? 1440) <= 900
  if (mobile)
    await page
      .getByRole('button', {
        name: 'Change planning area or active event',
        exact: false,
      })
      .click()
  await page.getByRole('button', { name: /Pacific Tsunami Warning/ }).click()
  await page
    .getByRole('button', {
      name: mobile ? 'Conversation' : 'Show conversation',
      exact: true,
    })
    .click()
  chat = page
    .getByRole('region', {
      name: 'Statewide planning conversation',
      exact: true,
    })
    .filter({ visible: true })
  await expect(chat).toContainText('Tsunami practice context')
  await expect(chat).toContainText('hazard priority is unknown')
  await expect(chat).not.toContainText('Review first · provisional')
  await say(page, 'Recommend next step')
  await expect(
    chat.getByRole('region', { name: 'Suggested planning step', exact: true }),
  ).toHaveAttribute('data-decision-rule', 'verify-evidence')
})
