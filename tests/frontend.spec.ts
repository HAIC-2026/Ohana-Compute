import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function mockOfficialHawaiiKaiStatus(page: Page) {
  const source = {
    id: 'test-source',
    authority: 'Official test authority',
    url: 'https://example.test/source',
    retrieved_at: '2026-10-26T19:00:00Z',
    fresh_until: '2026-10-26T19:05:00Z',
    status: 'fresh',
  }
  await page.route('**/api/v1/risk/tsunami?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'inside',
        zone_type: 'Extreme Tsunami Evacuation Zone',
        description:
          'Evacuate out of these areas for an Extreme Tsunami Warning.',
        geometry: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { zone_type: 'Extreme Tsunami Evacuation Zone' },
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [-157.7, 21.28],
                    [-157.68, 21.28],
                    [-157.68, 21.31],
                    [-157.7, 21.31],
                    [-157.7, 21.28],
                  ],
                ],
              },
            },
          ],
        },
        sources: [source],
      }),
    })
  })
  await page.route('**/api/v1/shelters/open?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        shelters: [],
        sources: [source],
      }),
    })
  })
  await page.route('**/api/v1/risk/flood?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        classification: 'undetermined',
        zone_code: 'D',
        zone_subtype: null,
        title: 'Flood risk is undetermined (FEMA Zone D)',
        description:
          'FEMA has not completed a detailed flood analysis for this zone. Zone D does not mean low risk.',
        coastal_planning_exposure: true,
        nearby_risk_geometry: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {
                fld_zone: 'AE',
                zone_subty: null,
                sfha_tf: 'T',
              },
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [-157.71, 21.28],
                    [-157.7, 21.28],
                    [-157.7, 21.29],
                    [-157.71, 21.29],
                    [-157.71, 21.28],
                  ],
                ],
              },
            },
          ],
        },
        sources: [source],
      }),
    })
  })
  await page.route('**/api/v1/risk/wildfire?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        rating: 'Medium',
        community_name: 'East Honolulu (Hawaii Kai)',
        title: 'Medium mapped wildfire risk · East Honolulu (Hawaii Kai)',
        description:
          'This is a community planning risk rating, not a live fire perimeter.',
        geometry: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {
                commu_name: 'East Honolulu (Hawaii Kai)',
                risk_rating: 'Medium',
              },
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [-157.73, 21.27],
                    [-157.65, 21.27],
                    [-157.65, 21.33],
                    [-157.73, 21.33],
                    [-157.73, 21.27],
                  ],
                ],
              },
            },
          ],
        },
        sources: [source],
      }),
    })
  })
}

test('desktop selects an island response zone and creates local steps', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  await page.goto('/')
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()

  await expect(
    page.getByRole('heading', {
      name: 'Plan for your part of Hawaiʻi',
    }),
  ).toBeVisible()
  await expect(page.getByLabel('Choose island')).toHaveValue('Oʻahu')
  await expect(
    page.getByText('Hurricane Lala forecast exposure · practice layer'),
  ).toBeVisible()
  await expect(
    page.getByText('Damaging conditions possible in 48–72 hours'),
  ).toBeVisible()

  await page
    .getByLabel('Which part of Oʻahu?')
    .selectOption('oahu-east-honolulu')
  await expect(
    page.getByText(/East Honolulu · Warning · severity 4\/5/),
  ).toBeVisible()
  await expect(
    page.getByText('Waiʻalae–Kāhala · Kuliʻouʻou–Kalani Iki · Hawaiʻi Kai'),
  ).toBeVisible()
  await expect(
    page.getByTestId('response-zone-oahu-east-honolulu'),
  ).toHaveClass(/is-selected/)
  await expect(
    page.getByRole('heading', { name: 'Who may need help' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'What local teams should confirm' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'What to do first' }),
  ).toBeVisible()
  await expect(page.getByText('Next local resource check')).toBeVisible()
  const confirmedResourceName = await page
    .locator('.relief-panel .resource-check strong')
    .innerText()
  await page.getByRole('button', { name: 'Confirm' }).click()

  await page.getByRole('button', { name: 'Open planner details' }).click()
  await expect(
    page.getByRole('heading', {
      name: 'Relief steps for East Honolulu',
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Local resource inventory' }),
  ).toBeVisible()
  await expect(page.getByText(/\d+\/\d+ confirmed/)).toBeVisible()
  await expect(
    page
      .locator('.inventory-list button')
      .filter({ hasText: confirmedResourceName })
      .getByText('Confirmed'),
  ).toBeVisible()
  const pendingResources = page.locator(
    '.inventory-list button:has(em:not(.is-confirmed))',
  )
  while ((await pendingResources.count()) > 0) {
    await pendingResources.first().click()
    await page.getByRole('button', { name: 'Confirm this resource' }).click()
  }
  await expect(
    page
      .locator('.planning-sheet .resource-check.is-complete')
      .getByText('All listed local resources are confirmed'),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Create relief checklist' }).click()
  await expect(
    page.getByText(
      'Start in East Honolulu: confirm powered shelter and accessible transportation capacity before damaging winds arrive.',
    ),
  ).toBeVisible()
  await expect(
    page
      .locator('.priority-list')
      .getByText(
        'Confirm powered shelter and accessible transportation capacity before damaging winds arrive.',
      ),
  ).toBeVisible()
  await expect(page.getByText('4 sources used')).toBeVisible()
})

test('Town neighborhood panels change shelter and route guidance', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  await page.goto('/')
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()

  await expect(page.getByTestId('neighborhood-manoa-makiki')).toBeVisible()
  await expect(
    page
      .getByTestId('neighborhood-manoa-makiki')
      .getByText('Stay in place', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Mānoa–Makiki neighborhood lead', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('County review required for shelter opening', {
      exact: false,
    }),
  ).toBeVisible()

  await page.getByRole('tab', { name: 'Kakaʻako–Ala Moana' }).click()
  await expect(page.getByTestId('neighborhood-kakaako-ala-moana')).toBeVisible()
  await expect(
    page
      .getByTestId('neighborhood-kakaako-ala-moana')
      .getByText('Move inland', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText(/Ala Moana Boulevard may flood or become gridlocked/),
  ).toBeVisible()

  await page.getByRole('button', { name: /Tropical Storm Nolo/ }).click()
  await expect(
    page
      .getByTestId('neighborhood-kakaako-ala-moana')
      .getByText(/Move vehicles, medicines, and mobility equipment/),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Open planner details' }).click()
  await expect(
    page.getByRole('heading', {
      name: 'Relief steps for Kakaʻako–Ala Moana',
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Challenge readiness' }),
  ).toBeVisible()
  await expect(page.getByText('Aggregate and de-identified')).toBeVisible()
})

test('island selector keeps one island visible and discloses coverage gaps', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  await page.goto('/')
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()

  await page.getByLabel('Choose island').selectOption('Maui')
  await expect(page.getByLabel('Which part of Maui?')).toHaveValue(
    'maui-central',
  )
  await expect(
    page.getByText('Maui regional exposure · validation pending'),
  ).toBeVisible()
  await expect(page.getByTestId('response-zone-maui-central')).toBeVisible()
  await expect(page.getByTestId('response-zone-oahu-town')).not.toBeVisible()
})

test('mobile controls preserve the selected response zone', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'))
  await page.goto('/')
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()

  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Change map details' }),
  ).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Tsunami' })).toBeVisible()

  await page
    .getByRole('complementary')
    .getByRole('button', { name: 'Close panel' })
    .click()

  await page
    .getByRole('button', { name: /Change location or active event/ })
    .click()
  await page
    .locator('.map-story')
    .getByLabel('Which part of Oʻahu?')
    .selectOption('oahu-kaneohe')
  await page.getByRole('button', { name: 'Relief plan', exact: true }).click()
  await expect(
    page.getByRole('heading', {
      name: 'Relief steps for Kāneʻohe',
    }),
  ).toBeVisible()
  await expect(page.getByText('1 · People who may need help')).toBeVisible()
  await expect(page.getByText('2 · Resources to confirm')).toBeVisible()
  await expect(page.getByText('3 · First coordinated action')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Local resource inventory' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Create relief checklist' }).click()
  await expect(page.locator('.priority-list')).toBeVisible()
  await expect
    .poll(() =>
      page
        .locator('.priority-list small')
        .first()
        .evaluate((element) => getComputedStyle(element).fontSize),
    )
    .toBe('14px')
  await expect
    .poll(() =>
      page
        .locator('.sheet-challenge-card.is-action > strong')
        .evaluate((element) => getComputedStyle(element).fontSize),
    )
    .toBe('14px')
  await expect(page.getByText('Needs considered')).not.toBeVisible()
  await page.getByText('Why am I seeing these recommendations?').click()
  await expect(
    page.locator('.planning-sheet').getByText('Needs considered'),
  ).toBeVisible()
})

test('resident route adapts for address, no car, language, and resource need', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  await mockOfficialHawaiiKaiStatus(page)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (
          success: (position: {
            coords: { longitude: number; latitude: number }
          }) => void,
        ) =>
          success({
            coords: { longitude: -157.858, latitude: 21.295 },
          }),
      },
    })
  })
  await page.goto('/')
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()

  await expect(
    page.getByRole('heading', { name: 'Get from home to help' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Plan route from my home' }).click()
  await expect(
    page.getByRole('heading', { name: 'My safe route' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Use my current location' }).click()
  await expect(
    page.getByText(
      'Showing the nearest available practice routes for Kakaʻako–Ala Moana.',
    ),
  ).toBeVisible()

  await page
    .getByLabel('Home address or landmark')
    .fill('somewhere in Hawaii Kai')
  await page.getByRole('button', { name: 'Find routes' }).click()
  await expect(
    page.getByText('Showing the nearest practice routes for Hawaiʻi Kai.'),
  ).toBeVisible()
  await expect(
    page.getByText('Outside the standard zone; inside the extreme zone', {
      exact: true,
    }),
  ).not.toBeVisible()
  await expect(
    page.getByText('No officially open shelter currently reported', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByText('Flood risk is undetermined (FEMA Zone D)', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByText('Long-range coastal planning exposure', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(page.getByText('Practice route only')).toBeVisible()
  await expect(
    page.getByText('FEMA flood risk areas · 1% and 0.2% annual chance', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByText('Tsunami evacuation status', { exact: true }),
  ).not.toBeVisible()
  await expect(
    page.getByText('Flood risk at this location', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Official extreme tsunami evacuation zone', {
      exact: true,
    }),
  ).not.toBeVisible()
  await expect(
    page.getByRole('heading', {
      name: 'Kaiser High School practice shelter',
      exact: true,
    }),
  ).toBeVisible()
  await page.getByRole('checkbox', { name: /I do not have a car/ }).check()
  await expect(
    page.getByText(
      'TheBus Route 1L · Hālawa Aloha Stadium Station · Limited Stops',
    ),
  ).toBeVisible()
  await expect(
    page.getByText('Board: Stop 1189 · Lunalilo Home Road + Hawaiʻi Kai Drive'),
  ).toBeVisible()
  await page.getByRole('checkbox', { name: /I do not have a car/ }).uncheck()

  await page.getByLabel('Home address or landmark').fill('96816 Kaimukī')
  await page.getByRole('button', { name: 'Find routes' }).click()
  await expect(
    page.getByText('Showing the nearest practice routes for Kaimukī–Kāhala.'),
  ).toBeVisible()

  await page.getByRole('checkbox', { name: /I do not have a car/ }).check()
  await expect(
    page.getByRole('heading', {
      name: 'Kilauea accessible transport pickup',
    }),
  ).toBeVisible()
  await expect(
    page.getByText('Accessible pickup', { exact: true }),
  ).toBeVisible()

  await page.getByLabel('Help language').selectOption('Tagalog')
  await expect(page.getByText('Tagalog support listed')).toBeVisible()

  await page.getByRole('tab', { name: 'Food & water' }).click()
  await expect(
    page.getByRole('heading', { name: 'Waiʻalae food and water hub' }),
  ).toBeVisible()
  await expect(page.getByText('Walk', { exact: true })).toBeVisible()
  await expect(
    page.locator('.resident-route-marker.is-destination'),
  ).toContainText('Waiʻalae food and water hub')

  await page.getByRole('checkbox', { name: /I need medical power/ }).check()
  await expect(
    page.getByRole('heading', { name: 'Waiʻalae medical power hub' }),
  ).toBeVisible()
})

test('official source failures never become a reassuring status', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  await page.route('**/api/v1/risk/tsunami?**', async (route) => {
    await route.fulfill({ status: 503, body: 'Unavailable' })
  })
  await page.route('**/api/v1/risk/flood?**', async (route) => {
    await route.fulfill({ status: 503, body: 'Unavailable' })
  })
  await page.route('**/api/v1/shelters/open?**', async (route) => {
    await route.fulfill({ status: 503, body: 'Unavailable' })
  })

  await page.goto('/')
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  await page.getByRole('button', { name: 'Plan route from my home' }).click()

  await expect(
    page
      .getByLabel('Official event risk and shelter status')
      .getByText('Status unavailable', { exact: true }),
  ).toHaveCount(2)
  await expect(
    page.getByText('Outside mapped tsunami evacuation zones', {
      exact: true,
    }),
  ).not.toBeVisible()
  await expect(
    page.getByText('No officially open shelter currently reported', {
      exact: true,
    }),
  ).not.toBeVisible()
})

test('road-level route requests live basemap tiles', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  const initialBasemapRequest = page.waitForRequest((request) =>
    request.url().includes('World_Street_Map/MapServer/tile/'),
  )

  await page.goto('/')
  await initialBasemapRequest
  await page.getByRole('button', { name: 'Plan route from my home' }).click()
  await page
    .getByLabel('Home address or landmark')
    .fill('somewhere in Hawaii Kai')

  const roadTileRequest = page.waitForRequest((request) => {
    const match = request
      .url()
      .match(/World_Street_Map\/MapServer\/tile\/(\d+)\//)
    return Boolean(match && Number(match[1]) >= 16)
  })
  await page.getByRole('button', { name: 'Find routes' }).click()

  const roadTile = await roadTileRequest
  expect(roadTile.url()).not.toContain('World_Light_Gray_Base')
})

test('mobile resident route exposes no-car and language controls', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'))
  await mockOfficialHawaiiKaiStatus(page)
  await page.goto('/')
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()

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
    page.getByText('Official extreme tsunami evacuation zone', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByText('FEMA flood risk areas · 1% and 0.2% annual chance', {
      exact: true,
    }),
  ).not.toBeVisible()
  await expect(
    page.getByText('Tsunami evacuation status', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Flood risk at this location', { exact: true }),
  ).not.toBeVisible()
  await page.getByRole('checkbox', { name: /I do not have a car/ }).check()
  await page.getByLabel('Help language').selectOption('Tagalog')
  await expect(page.getByText('Tagalog support listed')).toBeVisible()
  await expect
    .poll(() =>
      page
        .locator('.route-instructions li')
        .first()
        .evaluate((element) => getComputedStyle(element).fontSize),
    )
    .toBe('14px')
})

test('all four challenge events switch the resident risk answer', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  await mockOfficialHawaiiKaiStatus(page)
  await page.goto('/')
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()

  await expect(
    page.getByRole('button', { name: /Hurricane Lala/ }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: /Tropical Storm Nolo/ }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: /Pacific Tsunami Warning/ }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: /Leeward Wildfire Koa/ }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Plan route from my home' }).click()
  await expect(
    page.getByText('Flood risk at this location', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Tsunami evacuation status', { exact: true }),
  ).not.toBeVisible()
  await expect(
    page.getByText('Wildfire risk at this location', { exact: true }),
  ).not.toBeVisible()
  await page
    .locator('.planning-sheet')
    .getByRole('button', { name: 'Close panel' })
    .click()

  const affectedBefore = await page.locator('.people-total strong').innerText()
  await page.getByRole('button', { name: /Tropical Storm Nolo/ }).click()
  await expect(
    page.getByText('Tropical Storm Nolo forecast exposure · practice layer'),
  ).toBeVisible()
  await expect(
    page.getByText('Heaviest rain bands possible in 24–48 hours'),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Plan around flood-prone roads and identify an alternate route now.',
    ),
  ).toBeVisible()
  await expect(
    page
      .locator('.relief-panel')
      .getByText(
        'Verify flood-prone roads and alternate access before the heaviest rain bands arrive.',
      )
      .first(),
  ).toBeVisible()
  await expect(page.locator('.people-total strong')).not.toHaveText(
    affectedBefore,
  )

  await page.getByRole('button', { name: 'Plan route from my home' }).click()
  await expect(
    page.getByText('Flood risk at this location', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Heavy rain and drainage flooding can occur outside mapped FEMA boundaries.',
      { exact: false },
    ),
  ).toBeVisible()
  await page
    .locator('.planning-sheet')
    .getByRole('button', { name: 'Close panel' })
    .click()

  await page.getByRole('button', { name: /Pacific Tsunami Warning/ }).click()
  await expect(
    page.getByText('First waves possible in 2–3 hours'),
  ).toBeVisible()
  await expect(
    page.getByText(
      'If you are in an official tsunami evacuation zone, move inland or to higher ground now.',
    ),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Road-level practice directions that avoid official evacuation zones',
      { exact: true },
    ),
  ).toBeVisible()
  await expect(
    page.getByText('Before the first possible wave', { exact: false }),
  ).toBeVisible()
  await expect(
    page.getByText(
      'If your block is inside an official tsunami evacuation zone, walk inland or to higher ground and stay out until the all-clear.',
      { exact: true },
    ),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Do not use a shoreline road to reach another destination inside the evacuation zone.',
      { exact: true },
    ),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Plan route from my home' }).click()
  await expect(
    page.getByText('Tsunami evacuation status', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Flood risk at this location', { exact: true }),
  ).not.toBeVisible()
  await expect(
    page.getByText('Wildfire risk at this location', { exact: true }),
  ).not.toBeVisible()
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
  await expect(
    page.getByText('Wind-driven spread possible in the next 6–12 hours'),
  ).toBeVisible()
  await expect(
    page.getByText('Leave early when officials warn your area', {
      exact: false,
    }),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Road-level practice directions that avoid smoke, fire, and closures',
      { exact: true },
    ),
  ).toBeVisible()
  await expect(
    page.getByText('Before smoke or closures block evacuation routes', {
      exact: false,
    }),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Leave early if an official alert includes your neighborhood, using a route away from fire and smoke.',
      { exact: true },
    ),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Smoke can hide hazards and make a route unsafe before flames are visible.',
      { exact: true },
    ),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Plan route from my home' }).click()
  await expect(
    page.getByText('Wildfire risk at this location', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Medium mapped wildfire risk', { exact: false }),
  ).toBeVisible()
  await expect(
    page.getByText('Flood risk at this location', { exact: true }),
  ).not.toBeVisible()
  await expect(
    page.getByText('Tsunami evacuation status', { exact: true }),
  ).not.toBeVisible()
  await expect(
    page.getByText('Official wildfire planning risk · Medium', {
      exact: true,
    }),
  ).toBeVisible()
})

test('Waiʻanae route status names stay consistent', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  await page.goto('/')
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()

  await page.getByLabel('Which part of Oʻahu?').selectOption('oahu-leeward')
  await expect(
    page.getByText('Farrington Highway', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Needs confirmation · practice alternate: Nānākuli coastal access; verify current conditions',
    ),
  ).toBeVisible()
})
