import { interpretStatewidePrompt } from '../src/lib/statewide-conversation'
import { afnCountyForArea, afnDisplayGeometry } from '../src/lib/afn-map'
import type { AfnLayerResponse } from '../src/lib/afn-map'
import { communityProfile, expect, test } from './fixtures'

function layerFixture(county: string): AfnLayerResponse {
  return {
    type: 'FeatureCollection',
    status: 'partial',
    sources: [],
    warnings: ['Browser test fixture, not live public evidence.'],
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-160, 18],
              [-154, 18],
              [-154, 23],
              [-160, 23],
              [-160, 18],
            ],
          ],
        },
        properties: {
          tract_fips: `15${county}000100`,
          county_code: county,
          name: `Test fixture tract ${county}`,
          indicators: {
            kupuna_living_alone: {
              estimate: 45,
              percent: 9,
              margin_of_error: 12,
            },
            housing_50_plus_units: {
              estimate: 0,
              percent: 0,
              margin_of_error: 5,
            },
            incomplete_plumbing: { estimate: null, margin_of_error: null },
            no_internet_subscription: {
              estimate: 100,
              percent: 20,
              margin_of_error: 30,
            },
          },
        },
      },
    ],
  }
}

test('map rendering distinguishes published zero from unknown estimates', () => {
  const layer = layerFixture('009')
  expect(
    afnDisplayGeometry(layer, 'housing_50_plus_units').features[0].properties,
  ).toMatchObject({ estimate: 0, percent: 0 })
  expect(
    afnDisplayGeometry(layer, 'incomplete_plumbing').features[0].properties,
  ).toMatchObject({ estimate: null, percent: null })
  expect(afnDisplayGeometry(null, 'incomplete_plumbing').features).toEqual([])
})

test('every configured inhabited island has honest community screening', () => {
  for (const [name, id] of [
    ['Kaunakakai', 'molokai-kaunakakai'],
    ['Lanai City', 'lanai-city'],
    ['Kalaupapa · Kalawao County', 'molokai-kalaupapa'],
  ]) {
    expect(interpretStatewidePrompt(name)).toEqual({ type: 'area', id })
  }
  expect(afnCountyForArea('molokai-kalaupapa', 'Molokaʻi')).toBe('005')
  expect(afnCountyForArea('molokai-kaunakakai', 'Molokaʻi')).toBe('009')
  expect(afnCountyForArea('lanai-city', 'Lānaʻi')).toBe('009')
})

test('Molokaʻi and Lānaʻi select source-backed screening without synthetic exposure', async ({
  page,
}) => {
  await page.route('**/api/v1/community/afn-layer?*', (route) =>
    route.fulfill({ json: layerFixture('009') }),
  )
  await page.route('**/api/v1/community/profile?*', async (route) => {
    await route.fulfill({
      json: {
        ...communityProfile,
        acs: {
          ...communityProfile.acs,
          ...layerFixture('009').features[0].properties.indicators,
          geography: { name: 'Public aggregate test fixture · Maui County' },
        },
        svi: {
          ...communityProfile.svi,
          location: 'Public aggregate test fixture; Maui County; Hawaii',
        },
      },
    })
  })
  await page.goto('/')
  await expect(page.locator('main')).toHaveAttribute('data-hydrated', 'true')
  if ((page.viewportSize()?.width ?? 1440) <= 900)
    await page
      .getByRole('button', { name: 'Conversation', exact: true })
      .click()
  const conversation = page
    .getByRole('region', {
      name: 'Statewide planning conversation',
      exact: true,
    })
    .filter({ visible: true })
  await expect(
    conversation.getByText(/Niʻihau has no configured/),
  ).toBeVisible()
  await conversation
    .getByRole('button', { name: 'Molokaʻi', exact: true })
    .click()
  await conversation
    .getByRole('button', { name: 'Kaunakakai', exact: true })
    .click()
  await expect(conversation).toHaveAttribute('data-scope', 'molokai-kaunakakai')
  await expect(
    conversation.getByText('Official aggregate AFN context'),
  ).toBeVisible()
  await expect(
    conversation.getByText('Kūpuna (65+) living alone', { exact: true }),
  ).toBeVisible()
  await expect(
    conversation.getByText('100 (20.0%)', { exact: true }),
  ).toBeVisible()
  await conversation.getByText('County AFN map · CMIST layers').click()
  await conversation.getByLabel('Show aggregate AFN layer').check()
  await conversation.getByLabel('CMIST map domain').selectOption('Safety')
  await conversation
    .getByRole('button', { name: 'Open detailed workspace', exact: true })
    .click()
  const workspace = page.locator('.insights-content').filter({ visible: true })
  await expect(
    workspace.getByRole('heading', {
      name: 'Mass care planning for Kaunakakai',
    }),
  ).toBeVisible()
  await expect(workspace.getByText(/no synthetic exposure/)).toBeVisible()
  await expect(
    workspace.getByText('people may be affected', { exact: true }),
  ).toHaveCount(0)
  await expect(
    workspace.getByRole('heading', {
      name: 'Quantitative resource demand',
      exact: true,
    }),
  ).toBeVisible()
})

test('county map uses all five county geographies and every CMIST domain without reusing stale county data', async ({
  page,
}) => {
  test.setTimeout(90000)
  const requested: string[] = []
  const hazardRequests = new Set<string>()
  await page.route('**/api/v1/risk/*?*', (route) => {
    const url = new URL(route.request().url())
    hazardRequests.add(url.pathname.split('/').at(-1)!)
    const geometry = layerFixture('009')
    return route.fulfill({
      json: {
        status: 'inside',
        zone_type: 'Tsunami Evacuation Zone',
        description: 'Hazard browser test fixture, not an actual hazard.',
        geometry,
        classification: 'high',
        zone_code: 'AE',
        zone_subtype: null,
        title: 'Hazard browser test fixture',
        coastal_planning_exposure: false,
        nearby_risk_geometry: geometry,
        rating: 'High',
        community_name: 'Browser test fixture',
        sources: [],
      },
    })
  })
  await page.route('**/api/v1/community/afn-layer?*', (route) => {
    const county = new URL(route.request().url()).searchParams.get('county')!
    requested.push(county)
    return route.fulfill({ json: layerFixture(county) })
  })
  await page.goto('/')
  await expect(page.locator('main')).toHaveAttribute('data-hydrated', 'true')
  if ((page.viewportSize()?.width ?? 1440) <= 900)
    await page
      .getByRole('button', { name: 'Conversation', exact: true })
      .click()
  const chat = page
    .getByRole('region', {
      name: 'Statewide planning conversation',
      exact: true,
    })
    .filter({ visible: true })
  const input = chat.getByLabel('Planning question or place', { exact: true })
  for (const [place, county] of [
    ['Kaunakakai', '009'],
    ['Kalaupapa · Kalawao County', '005'],
    ['Town', '003'],
    ['Hilo & Lower Puna', '001'],
    ['East Kauaʻi', '007'],
    ['Lānaʻi City', '009'],
  ]) {
    await input.fill(place)
    await input.press('Enter')
    const controls = chat.locator('.afn-map-controls')
    await controls.locator('summary').click()
    await controls.getByLabel('Show aggregate AFN layer').check()
    await expect(page.locator('.map-frame')).toHaveAttribute(
      'data-map-afn-county',
      county,
    )
    const legend = page.locator('.afn-map-legend')
    await expect(legend).toContainText('1 public tracts')
    await expect(legend).toContainText(`Test fixture tract ${county}`)
    for (const domain of [
      'Communication',
      'Medical',
      'Independence',
      'Safety',
      'Transportation',
    ]) {
      await controls.getByLabel('CMIST map domain').selectOption(domain)
      await expect(legend.locator(':scope > summary')).toContainText(domain)
    }
    await controls.getByLabel('CMIST map domain').selectOption('Medical')
    await controls
      .getByLabel('Aggregate map indicator')
      .selectOption('incomplete_plumbing')
    await expect(legend).toContainText('Infrastructure proxy only')
    await expect(legend).toContainText('Unavailable')
  }
  expect(new Set(requested)).toEqual(
    new Set(['001', '003', '005', '007', '009']),
  )
  if ((page.viewportSize()?.width ?? 1440) <= 900)
    await page
      .getByRole('button', { name: 'Close panel', exact: true })
      .filter({ visible: true })
      .first()
      .click({ force: true })
  for (const [label, hazard] of [
    ['Pacific Tsunami Warning', 'tsunami'],
    ['Tropical Storm Nolo', 'flood'],
    ['Leeward Wildfire Koa', 'wildfire'],
    ['Hurricane Lala', 'hurricane'],
  ]) {
    if ((page.viewportSize()?.width ?? 1440) <= 900)
      await page
        .getByText('Change planning area or active event', { exact: true })
        .click()
    await page.getByRole('button', { name: new RegExp(`^${label}`) }).click()
    await expect(page.locator('.afn-map-legend > summary')).toContainText(
      hazard,
    )
  }
  expect(hazardRequests).toEqual(new Set(['flood', 'tsunami', 'wildfire']))
  await page.locator('.afn-map-legend > summary').click()
  await page
    .getByText('Inspect tract estimates and uncertainty', { exact: true })
    .click()
  await expect(
    page
      .locator('.afn-map-legend')
      .getByRole('cell', { name: 'Unavailable', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.map-frame')).toHaveAttribute(
    'data-map-afn-visible',
    'true',
  )
  await page.screenshot({
    path: `${test.info().outputDir}/county-afn.png`,
    fullPage: true,
  })
})
