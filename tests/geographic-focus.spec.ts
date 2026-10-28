import {
  analyzeGeographicFocus as evaluateFocus,
  assessPointHazard,
  buildGeographicFocus as buildFocus,
  orderGeographicFocus,
} from '../src/lib/geographic-focus'
import type { CommunityProfileState } from '../src/lib/community-profile'
import { areas } from '../src/lib/mock-data'
import type { HazardId } from '../src/lib/mock-data'
import { communityProfile, expect, test } from './fixtures'

const riskEvidence = {
  classification: 'high',
  rating: 'High',
  status: 'inside',
  geometry: { type: 'FeatureCollection', features: [] },
  nearby_risk_geometry: { type: 'FeatureCollection', features: [] },
  description: 'Mapped hazard at the fixture point.',
  title: 'Mapped hazard fixture',
  zone_type: 'tsunami',
  zone_code: 'AE',
  zone_subtype: null,
  coastal_planning_exposure: false,
  community_name: 'Practice community',
  sources: [
    {
      id: 'official-test-risk',
      authority: 'Official mapped hazard fixture',
      url: 'https://example.test/risk',
      retrieved_at: '2026-10-28T00:00:00Z',
      fresh_until: '2027-10-28T00:00:00Z',
      status: 'fresh' as const,
    },
  ],
}

function analyzeGeographicFocus(
  state: CommunityProfileState | undefined,
  hazard: HazardId,
  now = Date.now(),
) {
  return evaluateFocus(
    state,
    hazard,
    now,
    assessPointHazard(riskEvidence, hazard, now),
  )
}

function buildGeographicFocus(
  scope: typeof areas,
  profiles: Partial<Record<string, CommunityProfileState>>,
  hazard: HazardId,
) {
  return buildFocus(
    scope,
    profiles,
    hazard,
    Object.fromEntries(
      scope.map((area) => [area.id, assessPointHazard(riskEvidence, hazard)]),
    ),
  )
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/risk/*?*', (route) =>
    route.fulfill({ json: riskEvidence }),
  )
})

function profileState(percentile = 0.9): CommunityProfileState {
  return {
    status: 'ready',
    profile: {
      ...communityProfile,
      svi: {
        ...communityProfile.svi,
        overall_percentile: percentile,
        source: {
          ...communityProfile.svi.source,
          status: 'fresh',
          vintage: '2022',
        },
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
  }
}

test('focus tiers are deterministic, provisional and fail closed', () => {
  const ready = profileState()
  expect(analyzeGeographicFocus(ready, 'flood').tier).toBe('review-first')
  expect(analyzeGeographicFocus(profileState(0.75), 'tsunami').tier).toBe(
    'review-first',
  )
  expect(analyzeGeographicFocus(profileState(0.749), 'flood').tier).toBe(
    'review-locally',
  )
  for (const percentile of [-1, 1.1, NaN]) {
    expect(
      analyzeGeographicFocus(profileState(percentile), 'wildfire').tier,
    ).toBe('verify')
  }
  for (const status of ['partial', 'unavailable', 'loading'] as const) {
    expect(analyzeGeographicFocus({ ...ready, status }, 'hurricane').tier).toBe(
      'verify',
    )
  }
  for (const mutation of [
    { source: { ...ready.profile!.svi!.source, status: 'stale' as const } },
    {
      source: {
        ...ready.profile!.svi!.source,
        id: 'unknown-svi',
        vintage: undefined,
      },
    },
    { location: 'Honolulu County' },
    { overall_percentile: null },
  ]) {
    const state = profileState()
    state.profile!.svi = { ...state.profile!.svi!, ...mutation }
    expect(analyzeGeographicFocus(state, 'flood').tier).toBe('verify')
  }
  const staleOther = profileState()
  staleOther.profile!.acs!.source.status = 'stale'
  expect(analyzeGeographicFocus(staleOther, 'flood').tier).toBe('verify')
  for (const expiry of ['2000-01-01T00:00:00Z', 'invalid-date']) {
    const expired = profileState()
    expired.profile!.svi!.source.fresh_until = expiry
    expect(
      analyzeGeographicFocus(expired, 'flood', Date.UTC(2026, 9, 28)).tier,
    ).toBe('verify')
  }
  const failed = profileState()
  failed.profile!.source_errors = [{ source: 'acs-5-year', error: 'failed' }]
  expect(analyzeGeographicFocus(failed, 'flood').tier).toBe('verify')
  expect(analyzeGeographicFocus(undefined, 'flood').label).toBe(
    'Loading evidence',
  )
  expect(
    analyzeGeographicFocus({ status: 'unavailable', profile: null }, 'flood')
      .reason,
  ).toContain('unknown, not low')
  expect(analyzeGeographicFocus(ready, 'tsunami').action).toContain(
    'official evacuation zones',
  )
  expect(analyzeGeographicFocus(ready, 'wildfire').action).toContain(
    'smoke-safe',
  )

  const oahu = areas
    .filter(
      (area) => area.island === 'Oʻahu' && area.showOnStatewideMap !== false,
    )
    .slice(0, 2)
  const old = profileState()
  old.profile!.svi!.source.vintage = '2020'
  const incompatible = buildGeographicFocus(
    oahu,
    { [oahu[0].id]: ready, [oahu[1].id]: old },
    'flood',
  )
  expect(incompatible.every((entry) => entry.focus.tier === 'verify')).toBe(
    true,
  )
  const maui = areas.filter((area) => area.island === 'Maui').slice(0, 1)
  expect(
    buildGeographicFocus(maui, { [maui[0].id]: ready }, 'flood')[0].focus.tier,
  ).toBe('verify')
  const entries = buildGeographicFocus(oahu, { [oahu[0].id]: ready }, 'flood')
  expect(orderGeographicFocus(entries)).toEqual(
    orderGeographicFocus([...entries].reverse()),
  )
})

test('selected hazard and source freshness control provisional review cues', () => {
  const ready = profileState()
  const now = Date.UTC(2026, 9, 28)
  expect(evaluateFocus(ready, 'flood', now).tier).toBe('verify')
  const outside = assessPointHazard(
    { ...riskEvidence, status: 'outside' },
    'tsunami',
    now,
  )
  expect(evaluateFocus(ready, 'tsunami', now, outside).tier).toBe(
    'review-locally',
  )
  const inside = assessPointHazard(riskEvidence, 'tsunami', now)
  expect(evaluateFocus(ready, 'tsunami', now, inside).tier).toBe('review-first')
  expect(evaluateFocus(profileState(0.5), 'tsunami', now, inside).tier).toBe(
    'review-locally',
  )
  expect(assessPointHazard(riskEvidence, 'hurricane', now).reason).toContain(
    'wind and surge are not assessed',
  )
  for (const result of [
    { ...riskEvidence, classification: 'unmapped' },
    { ...riskEvidence, classification: 'undetermined' },
    { ...riskEvidence, sources: [] },
    {
      ...riskEvidence,
      sources: riskEvidence.sources.map((source) => ({
        ...source,
        status: 'stale' as const,
      })),
    },
    {
      ...riskEvidence,
      sources: riskEvidence.sources.map((source) => ({
        ...source,
        fresh_until: 'invalid',
      })),
    },
  ]) {
    const screen = assessPointHazard(result, 'flood', now)
    expect(screen.status).toBe('unknown')
    expect(evaluateFocus(ready, 'flood', now, screen).tier).toBe('verify')
  }
  expect(
    evaluateFocus(ready, 'tsunami', inside.freshUntil + 1, inside).tier,
  ).toBe('verify')
})

test('location comparison links keyboard list, map and response workflow', async ({
  page,
}, testInfo) => {
  await page.route('**/api/v1/community/profile?*', (route) =>
    route.fulfill({ json: profileState().profile }),
  )
  await page.goto('/')
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  await page.getByRole('button', { name: 'Compare locations' }).click()
  const panel = page.getByRole('region', { name: 'Where to focus' })
  await expect(panel).toBeVisible()
  await expect(
    panel.getByRole('button', { name: /Town Review first/ }),
  ).toBeVisible()
  const kailua = panel.getByRole('button', { name: /^Kailua Review/ })
  await kailua.focus()
  await page.keyboard.press('Enter')
  await expect(kailua).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('response-zone-oahu-kailua')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(
    panel.getByRole('region', { name: 'Next action for Kailua' }),
  ).toContainText('County lead')
  await page.getByTestId('response-zone-oahu-town').click()
  await expect(
    panel.getByRole('button', { name: /^Town Review/ }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  const bounds = await panel.boundingBox()
  expect(bounds!.width).toBeLessThanOrEqual(
    testInfo.project.name.startsWith('mobile') ? 390 : 410,
  )
  await panel.getByText('Town: next check', { exact: true }).click()
  await panel
    .getByRole('button', { name: 'Model needs & match partners' })
    .click()
  await expect(page.getByRole('dialog')).toContainText('Town Community Shelter')
  await expect(page.getByTestId('partner-matches')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Compare locations' }),
  ).toBeFocused()
})

test('source failures remain unknown; comparison is bounded and privacy-safe', async ({
  page,
}) => {
  let inFlight = 0
  let maxInFlight = 0
  let count = 0
  const batches: unknown[] = []
  await page.route('**/api/v1/telemetry/browser', async (route) => {
    batches.push(route.request().postDataJSON())
    await route.fulfill({ status: 202, json: { accepted: 1 } })
  })
  await page.route('**/api/v1/community/profile?*', async (route) => {
    count++
    inFlight++
    maxInFlight = Math.max(maxInFlight, inFlight)
    await new Promise((resolve) => setTimeout(resolve, 70))
    inFlight--
    await route.fulfill({ status: 503, json: { error: 'unavailable' } })
  })
  await page.goto('/?address=private-focus-address')
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: 'Compare locations' }).click()
  const panel = page.getByRole('region', { name: 'Where to focus' })
  await expect(
    panel.getByText('Loading evidence', { exact: true }),
  ).toHaveCount(0)
  await expect(
    panel.getByRole('region', { name: 'Provisional review queue' }),
  ).toContainText('No locations')
  await expect(panel).toContainText('Priority is unknown, not low')
  const islandCount = areas.filter(
    (area) => area.island === 'Oʻahu' && area.showOnStatewideMap !== false,
  ).length
  expect(count).toBeLessThanOrEqual(islandCount + 1)
  expect(maxInFlight).toBeLessThanOrEqual(3)
  const before = count
  await panel.getByRole('button', { name: /^Kailua Verify/ }).click()
  await expect(panel).toContainText('Kailua: next check')
  expect(count).toBeLessThanOrEqual(before + 1)
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  await expect.poll(() => batches.length).toBeGreaterThan(0)
  const text = JSON.stringify(batches)
  expect(text).not.toContain('private-focus-address')
  expect(text).not.toContain('Kailua')
  expect(text).not.toContain('lat=')
  expect(text).not.toContain('157.')
})

test('hazard failures never promote a vulnerable location to a review priority', async ({
  page,
}) => {
  await page.route('**/api/v1/community/profile?*', (route) =>
    route.fulfill({ json: profileState().profile }),
  )
  await page.route('**/api/v1/risk/*?*', (route) =>
    route.fulfill({ status: 503, json: { error: 'source unavailable' } }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Compare locations' }).click()
  const panel = page.getByRole('region', { name: 'Where to focus' })
  await expect(
    panel.getByRole('button', { name: /^Town Verify hazard evidence/ }),
  ).toBeVisible()
  await expect(
    panel.getByRole('region', { name: 'Provisional review queue' }),
  ).toContainText('No locations')
  await expect(
    panel.getByRole('region', { name: 'Evidence gaps · priority unknown' }),
  ).toContainText('hazard priority is unknown')
})

test('open comparisons withdraw review cues when hazard evidence expires', async ({
  page,
}) => {
  const now = new Date('2026-10-28T01:00:00Z')
  await page.clock.install({ time: now })
  await page.route('**/api/v1/community/profile?*', (route) =>
    route.fulfill({ json: profileState().profile }),
  )
  await page.route('**/api/v1/risk/*?*', (route) => {
    const url = new URL(route.request().url())
    const town = areas.find((area) => area.id === 'oahu-town')!
    const firstExpiry =
      Number(url.searchParams.get('lat')) === town.coordinates[1] &&
      Number(url.searchParams.get('lon')) === town.coordinates[0]
    return route.fulfill({
      json: {
        ...riskEvidence,
        sources: riskEvidence.sources.map((source) => ({
          ...source,
          fresh_until: new Date(
            now.getTime() + (firstExpiry ? 10000 : 20000),
          ).toISOString(),
        })),
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Compare locations' }).click()
  const panel = page.getByRole('region', { name: 'Where to focus' })
  await expect(
    panel.getByRole('button', { name: /^Town Review first/ }),
  ).toBeVisible()
  await page.clock.fastForward(11000)
  await expect(
    panel.getByRole('button', { name: /^Town Verify hazard evidence/ }),
  ).toBeVisible()
  await expect(
    panel.getByRole('button', { name: /^Kailua Review first/ }),
  ).toBeVisible()
  await page.clock.fastForward(11000)
  await expect(
    panel.getByRole('region', { name: 'Provisional review queue' }),
  ).toContainText('No locations')
})

test('rapid scope changes retain a shared comparison request budget', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  await page.route('**/api/v1/community/profile?*', (route) =>
    route.fulfill({ json: profileState().profile }),
  )
  await page.goto('/')
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  let inFlight = 0
  let maximum = 0
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/v1/risk/*?*', async (route) => {
    const url = new URL(route.request().url())
    const isComparisonPoint = areas.some(
      (area) =>
        Number(url.searchParams.get('lat')) === area.coordinates[1] &&
        Number(url.searchParams.get('lon')) === area.coordinates[0],
    )
    if (!isComparisonPoint) {
      await route.fulfill({ json: riskEvidence })
      return
    }
    inFlight++
    maximum = Math.max(maximum, inFlight)
    await gate
    inFlight--
    await route.fulfill({ json: riskEvidence })
  })
  await page.getByRole('button', { name: 'Compare locations' }).click()
  await expect.poll(() => inFlight).toBe(3)
  await page.getByRole('button', { name: 'Close location comparison' }).click()
  await page.getByRole('button', { name: /Pacific Tsunami Warning/ }).click()
  await page.getByRole('button', { name: 'Compare locations' }).click()
  const panel = page.getByRole('region', { name: 'Where to focus' })
  await expect(panel).toContainText('tsunami planning')
  await page.waitForTimeout(100)
  expect(maximum).toBeLessThanOrEqual(3)
  release()
  await expect(
    panel.getByRole('button', { name: /^Town Review first/ }),
  ).toBeVisible()
  expect(maximum).toBeLessThanOrEqual(3)
})

test('hazard and island changes replace location scope without invented priorities', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  await page.getByRole('button', { name: 'Compare locations' }).click()
  let panel = page.getByRole('region', { name: 'Where to focus' })
  await expect(panel).toContainText('hurricane planning')
  await panel.getByRole('button', { name: 'Close location comparison' }).click()
  await expect(
    page.getByRole('button', { name: 'Compare locations' }),
  ).toBeFocused()
  if (testInfo.project.name.startsWith('mobile')) {
    await page.getByRole('button', { name: 'Map', exact: true }).click()
    await page.getByRole('radio', { name: 'Tsunami' }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Close panel' })
      .click()
  } else {
    await page.getByRole('button', { name: /Pacific Tsunami Warning/ }).click()
  }
  if (testInfo.project.name.startsWith('mobile')) {
    await page
      .getByRole('button', { name: /Change planning area or active event/ })
      .click()
  }
  await page.getByLabel('Choose island').selectOption('Maui')
  if (testInfo.project.name.startsWith('mobile')) {
    await page
      .getByRole('button', { name: 'Close location and emergency settings' })
      .click()
  }
  await page.getByRole('button', { name: 'Compare locations' }).click()
  panel = page.getByRole('region', { name: 'Where to focus' })
  await expect(panel).toContainText('Maui · tsunami planning')
  await expect(panel.getByRole('button', { name: /^Town / })).toHaveCount(0)
  await expect(panel).toContainText('official evacuation zones')
  await panel
    .getByRole('button', { name: 'Close location comparison' })
    .press('Escape')
  await expect(panel).not.toBeVisible()
})

test('real Go profile failures or metadata remain honest in geographic comparison', async ({
  page,
}) => {
  await page.unroute('**/api/v1/community/profile?*')
  await page.unroute('**/api/v1/risk/*?*')
  await page.goto('/')
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  await page.getByRole('button', { name: 'Compare locations' }).click()
  const panel = page.getByRole('region', { name: 'Where to focus' })
  await expect(
    panel.getByText('Loading evidence', { exact: true }),
  ).toHaveCount(0, { timeout: 25000 })
  await expect(panel).toContainText('not official priorities')
  await expect(panel).toContainText('County lead')
  await panel.getByText('Town: next check', { exact: true }).click()
  await panel.getByText('Evidence & method', { exact: true }).click()
  await expect(panel).toContainText('not a validated priority threshold')
  await expect(page.locator('.map-frame')).toHaveAttribute(
    'data-map-geography-visible',
    'true',
  )
})
