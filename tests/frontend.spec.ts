import { openLocalPlanning } from './support/local-planning'
import {
  communityProfile,
  countyShelterPlans,
  expect,
  partnerMatchFixture,
  planningAreaCatalog,
  resourceDemandFixture,
  test,
} from './fixtures'

import { mockOfficialHawaiiKaiStatus } from './support/mock-backend'

test('desktop selects an island response zone and creates local steps', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  await openLocalPlanning(page)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()

  await expect(
    page.getByRole('heading', {
      name: 'Mass care planner',
    }),
  ).toBeVisible()
  await expect(page.getByLabel('Choose island')).toHaveValue('Oʻahu')
  await expect(
    page.getByText('Hurricane Lala scenario footprint'),
  ).toBeVisible()
  await expect(
    page.getByText('Synthetic practice data · not an official forecast'),
  ).toBeVisible()
  await expect(
    page.getByText('Damaging conditions possible in 48–72 hours'),
  ).toBeVisible()
  const planningSummary = page.locator('.relief-panel')
  await expect(planningSummary.getByText('Map', { exact: true })).toBeVisible()
  await expect(
    planningSummary.getByText('Model', { exact: true }),
  ).toBeVisible()
  await expect(
    planningSummary.getByText('Match', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Open response workspace' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Preview resident guidance' }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: /Hawaiʻi DHS programs and services/ }),
  ).toHaveAttribute('href', 'https://humanservices.hawaii.gov/')

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
    page.getByRole('heading', { name: 'Needs and resource gaps' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Coordinated response' }),
  ).toBeVisible()
  await expect(page.getByText('Next local resource check')).toBeVisible()
  const confirmedResourceName = await page
    .locator('.relief-panel .resource-check strong')
    .innerText()
  await page.getByRole('button', { name: 'Confirm' }).click()

  await page.getByRole('button', { name: 'Open response workspace' }).click()
  await expect(
    page.getByRole('heading', {
      name: 'Mass care plan for East Honolulu',
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Local resource inventory' }),
  ).toBeVisible()
  const hotspotPanel = page.getByTestId('afn-planning-hotspots')
  await expect(hotspotPanel).toBeVisible()
  await expect(hotspotPanel).toContainText('AFN planning hotspots')
  await expect(hotspotPanel).toContainText(
    'Data-derived weaknesses · AI drafts wording only',
  )
  const shelterPlanPanel = page.getByTestId('county-shelter-plans')
  await expect(shelterPlanPanel).toContainText('County shelter plans')
  await expect(shelterPlanPanel).toContainText('1/4')
  await expect(shelterPlanPanel).toContainText(
    "Four emergency-management jurisdictions cover Hawaiʻi's five political counties",
  )
  await expect(shelterPlanPanel).toContainText('Published plan reference')
  await expect(shelterPlanPanel).toContainText('Official facility records')
  await expect(shelterPlanPanel).toContainText(
    'They are not ingested from a County plan',
  )
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

  await page.getByRole('button', { name: 'Create response checklist' }).click()
  await expect(page.getByText(/Start in East Honolulu: confirm /)).toBeVisible()
  await expect(
    page
      .locator('.priority-list')
      .getByText(
        'Confirm powered shelter and accessible transportation capacity before damaging winds arrive.',
      ),
  ).toBeVisible()
  await expect(page.getByText('5 sources used')).toBeVisible()
})

test('County shelter plans preserve provenance and unavailable coverage', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  await openLocalPlanning(page)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  await page.getByRole('button', { name: 'Open response workspace' }).click()

  const shelterPlanPanel = page.getByTestId('county-shelter-plans')
  await expect(shelterPlanPanel).toContainText('Emergency Shelter Handbook')
  await expect(shelterPlanPanel).toContainText(
    'does not report current openings',
  )

  await shelterPlanPanel.getByRole('tab', { name: 'Hawaiʻi' }).click()
  await expect(shelterPlanPanel).toContainText('Plan unavailable')
  await expect(shelterPlanPanel).toContainText('Hawaiʻi County Civil Defense')
  await expect(shelterPlanPanel).toContainText(
    'No supported public County shelter plan',
  )
  await expect(shelterPlanPanel).not.toContainText('Open now')

  await shelterPlanPanel.getByRole('tab', { name: 'Maui' }).click()
  await expect(shelterPlanPanel).toContainText(
    'Kalawao County emergency-management scope',
  )
  await expect(shelterPlanPanel).toContainText(
    'For emergency management under HRS Chapter 127A, Maui includes Kalawao',
  )
  await expect(
    shelterPlanPanel.getByRole('link', {
      name: /HRS §127A-2 emergency-management scope/,
    }),
  ).toHaveAttribute('href', 'https://example.test/hrs-127a-2')
  await expect(
    shelterPlanPanel.getByRole('link', {
      name: /HRS §326-34 Kalawao governance/,
    }),
  ).toHaveAttribute('href', 'https://example.test/hrs-326-34')
})

test('County shelter plans expose stale and fail-closed states', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  const staleSnapshot = structuredClone(countyShelterPlans)
  staleSnapshot.jurisdictions[0].plan_records[0].freshness = 'stale'
  await page.route('**/api/v1/shelter-plans', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(staleSnapshot),
    })
  })
  await openLocalPlanning(page)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  await page.getByRole('button', { name: 'Open response workspace' }).click()
  await expect(page.getByTestId('county-shelter-plans')).toContainText(
    'Review overdue',
  )

  await page.unroute('**/api/v1/shelter-plans')
  await page.route('**/api/v1/shelter-plans', async (route) => {
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'live source unavailable',
        source: 'county-shelter-plans',
      }),
    })
  })
  await openLocalPlanning(page)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  await page.getByRole('button', { name: 'Open response workspace' }).click()
  const unavailablePanel = page.getByTestId('county-shelter-plans')
  await expect(unavailablePanel).toContainText(
    'County shelter-plan references unavailable',
  )
  await expect(unavailablePanel).toContainText(
    'No plan or facility status is assumed',
  )
  await expect(
    unavailablePanel.getByRole('button', { name: 'Retry' }),
  ).toBeVisible()
})

test('planner consumes official aggregate AFN context', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  await openLocalPlanning(page)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()

  const afnContext = page.getByTestId('afn-context')
  await expect(
    afnContext.getByText('Official public sources available'),
  ).toBeVisible()
  await expect(afnContext).toContainText('4 of 4')
  await expect(page.getByTestId('afn-disability')).toContainText('220 (9.3%)')
  await expect(page.getByTestId('afn-language')).toContainText('150 (6.4%)')
  await expect(page.getByTestId('afn-transportation')).toContainText(
    '80 (8.5%)',
  )
  await expect(page.getByTestId('afn-medical-power')).toContainText(
    '1–11 (privacy-protected)',
  )
  await expect(page.getByTestId('afn-risk-baseline')).toContainText(
    'National risk baseline: Relatively Moderate',
  )
  await expect(afnContext).toContainText('No person-level records')
  await expect(afnContext).toContainText('U.S. Census Bureau · 2024 ACS 5-year')
})

test('planner identifies missing AFN sources without exposing raw errors', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  await page.route('**/api/v1/community/profile?*', async (route) => {
    const { acs: _acs, ...partialProfile } = communityProfile
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...partialProfile,
        source_errors: [
          {
            source: 'acs-5-year',
            error: 'private upstream diagnostic must stay hidden',
          },
        ],
      }),
    })
  })

  await openLocalPlanning(page)
  const afnContext = page.getByTestId('afn-context')
  await expect(afnContext).toContainText(
    'Partial official source coverage · 3 of 4',
  )
  await expect(afnContext).toContainText('Unavailable: Census ACS')
  await expect(afnContext).not.toContainText(
    'private upstream diagnostic must stay hidden',
  )
})

test('Waiʻanae AFN request uses an on-tract planning coordinate', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  await openLocalPlanning(page)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  await expect(page.getByTestId('afn-context')).toContainText('4 of 4')

  let requestedCoordinates = ''
  await page.route('**/api/v1/community/profile?*', async (route) => {
    const url = new URL(route.request().url())
    requestedCoordinates = `${url.searchParams.get('lat')},${url.searchParams.get('lon')}`
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(communityProfile),
    })
  })
  await page.getByLabel('Which part of Oʻahu?').selectOption('oahu-leeward')
  await expect.poll(() => requestedCoordinates).toBe('21.435848,-158.181169')
})

test('planner fails closed when official AFN sources are unavailable', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  await page.route('**/api/v1/community/profile?*', async (route) => {
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'community profile unavailable' }),
    })
  })

  await openLocalPlanning(page)
  const afnContext = page.getByTestId('afn-context')
  await expect(
    afnContext.getByText('Official sources unavailable'),
  ).toBeVisible()
  await expect(afnContext).toContainText(
    'must not be treated as official AFN estimates',
  )
})

test('Town neighborhood panels change shelter and route guidance', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  await openLocalPlanning(page)
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
  await page
    .getByTestId('neighborhood-kakaako-ala-moana')
    .getByText('Resources, routes and support', { exact: true })
    .click()
  await expect(
    page.getByText(/Ala Moana Boulevard may flood or become gridlocked/),
  ).toBeVisible()

  await page.getByRole('button', { name: /Tropical Storm Nolo/ }).click()
  await expect(
    page
      .getByTestId('neighborhood-kakaako-ala-moana')
      .getByText(/Move vehicles, medicines, and mobility equipment/),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Open response workspace' }).click()
  const planningSheet = page.locator('.planning-sheet:visible')
  await expect(
    planningSheet
      .getByRole('heading', {
        name: 'Mass care plan for Kakaʻako–Ala Moana',
      })
      .first(),
  ).toBeVisible()
  await planningSheet
    .getByText('Data coverage and limitations', { exact: true })
    .click()
  await expect(
    planningSheet.getByRole('heading', { name: 'Challenge readiness' }),
  ).toBeVisible()
  await expect(
    planningSheet.getByText('Aggregate and de-identified'),
  ).toBeVisible()
})

test('neighborhood support stays accessible without crowding the overview', async ({
  page,
}, testInfo) => {
  await openLocalPlanning(page)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  const desktop = testInfo.project.name.startsWith('desktop')
  if (!desktop) {
    const dock = page.getByRole('navigation', {
      name: 'Emergency planning tools',
    })
    for (const button of await dock.getByRole('button').all()) {
      const bounds = await button.boundingBox()
      expect(bounds?.height).toBeGreaterThanOrEqual(48)
      expect(bounds?.width).toBeGreaterThanOrEqual(44)
    }
    await dock.getByRole('button', { name: 'Response plan' }).click()
  }
  const briefing = page.locator('.neighborhood-briefing:visible').first()
  const support = briefing.locator('.neighborhood-support')
  const summary = support.locator('summary')
  await expect(support).toHaveJSProperty('open', !desktop)
  await expect(
    briefing.locator('.shelter-decision > div > strong'),
  ).toBeVisible()
  await expect(briefing.locator('.coordination-card strong')).toBeVisible()
  await expect(briefing.locator('.neighborhood-evidence')).toBeVisible()

  const initialHeight = (await briefing.boundingBox())!.height
  await summary.focus()
  await summary.press('Enter')
  await expect(support).toHaveJSProperty('open', desktop)
  if (desktop) {
    await expect(support.getByText('Traffic hazards to expect')).toBeVisible()
    await expect(
      support.getByText('AFN and language-access actions'),
    ).toBeVisible()
    const expandedHeight = (await briefing.boundingBox())!.height
    expect(expandedHeight - initialHeight).toBeGreaterThan(250)
  } else {
    await expect(support.locator('.neighborhood-detail-grid')).not.toBeVisible()
    await summary.press('Space')
    await expect(support.locator('.neighborhood-detail-grid')).toBeVisible()
  }
})

test('island selector keeps one island visible and discloses coverage gaps', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  await openLocalPlanning(page)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()

  await page.getByLabel('Choose island').selectOption('Maui')
  await expect(page.getByLabel('Which part of Maui?')).toHaveValue(
    'maui-central',
  )
  await expect(page.getByText('Maui regional scenario footprint')).toBeVisible()
  await expect(
    page.getByText('Synthetic practice data · validation pending'),
  ).toBeVisible()
  await expect(page.getByTestId('response-zone-maui-central')).toBeVisible()
  await expect(page.getByTestId('response-zone-oahu-town')).not.toBeVisible()
})

test('statewide County planning depth stays distinct in the frontend', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  let catalogRequests = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/v1/planning-areas') {
      catalogRequests += 1
    }
  })

  await openLocalPlanning(page)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  await page.getByLabel('Choose island').selectOption('Maui')
  await page.getByRole('button', { name: 'Open response workspace' }).click()

  const planningSheet = page.locator('.planning-sheet:visible')
  const planningDepth = planningSheet.getByRole('region', {
    name: 'Statewide planning depth',
  })
  await expect(
    planningDepth.getByText('Maui corridor continuity workflow', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    planningSheet.getByText('Central Maui practice reception site').first(),
  ).toBeVisible()
  await expect(
    planningSheet.getByText('Honoapiʻilani Highway west access').first(),
  ).toBeVisible()
  await expect(planningSheet).not.toContainText('H-1 urban corridor')
  await expect(planningSheet).not.toContainText('TheBus')
  await expect(planningSheet).not.toContainText('Urban Honolulu')

  await page.getByLabel('Choose island').selectOption('Hawaiʻi')
  await expect(
    planningDepth.getByText('East Hawaiʻi medical continuity workflow', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    planningSheet.getByText('Puna practice medical-power support hub').first(),
  ).toBeVisible()
  await expect(
    planningSheet.getByText('Hawaiʻi Belt Road Hilo–Puna access').first(),
  ).toBeVisible()
  await expect(planningSheet).not.toContainText(
    'Central Maui practice reception site',
  )

  await page.getByLabel('Choose island').selectOption('Kauaʻi')
  await expect(
    planningDepth.getByText('East Kauaʻi flood-isolation workflow', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    planningSheet.getByText('East Kauaʻi practice shelter').first(),
  ).toBeVisible()
  await expect(
    planningSheet.getByText('Kūhiō Highway Wailua crossing').first(),
  ).toBeVisible()
  await expect(planningSheet).not.toContainText(
    'Hawaiʻi Belt Road Hilo–Puna access',
  )
  expect(catalogRequests).toBe(1)
  expect(planningAreaCatalog.summary.political_counties_total).toBe(5)
})

test('statewide planning catalog failure does not substitute Oahu content', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  let catalogAttempts = 0
  await page.route('**/api/v1/planning-areas', async (route) => {
    catalogAttempts += 1
    if (catalogAttempts > 1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(planningAreaCatalog),
      })
      return
    }
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'planning area source unavailable' }),
    })
  })

  await openLocalPlanning(page)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  await page.getByLabel('Choose island').selectOption('Maui')
  await page.getByRole('button', { name: 'Open response workspace' }).click()

  const planningSheet = page.locator('.planning-sheet:visible')
  await expect(
    planningSheet.getByText('Representative workflow unavailable'),
  ).toBeVisible()
  await expect(
    planningSheet.getByText(/No Oʻahu workflow was substituted/),
  ).toBeVisible()
  await expect(
    planningSheet.getByText('Practice resources unavailable'),
  ).toBeVisible()
  await expect(planningSheet).not.toContainText('H-1 urban corridor')
  await expect(planningSheet).not.toContainText('Maui Community Shelter')
  await planningSheet
    .getByRole('region', { name: 'Statewide planning depth' })
    .getByRole('button', { name: 'Retry', exact: true })
    .click()
  await expect(
    planningSheet
      .getByRole('region', { name: 'Statewide planning depth' })
      .getByText('Maui corridor continuity workflow', { exact: true }),
  ).toBeVisible()
  await expect(
    planningSheet.getByText('Central Maui practice reception site').first(),
  ).toBeVisible()
  expect(catalogAttempts).toBe(2)
})

test('resource demand uses bounded aggregate inputs and explicit unavailable lines', async ({
  page,
}) => {
  const requests: Array<Record<string, unknown>> = []
  await page.route('**/api/v1/planning/resource-demand', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    requests.push(body)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        resourceDemandFixture(
          body as Parameters<typeof resourceDemandFixture>[0],
        ),
      ),
    })
  })

  await openLocalPlanning(page)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  if ((page.viewportSize()?.width ?? 1440) <= 900) {
    await page
      .getByRole('button', { name: 'Response plan', exact: true })
      .click()
  } else {
    await page.getByRole('button', { name: 'Open response workspace' }).click()
  }

  const planningSheet = page.locator('.planning-sheet:visible')
  const demandPanel = planningSheet.getByTestId('resource-demand')
  await expect(
    demandPanel.getByRole('heading', {
      name: 'Quantitative resource demand',
    }),
  ).toBeVisible()
  await expect(demandPanel).toContainText('mass-care-demand-v0.2')
  await expect(demandPanel).toContainText('Planning service population')
  await expect(demandPanel).toContainText('Unavailable is not zero')
  await expect(demandPanel).toContainText('Medical equipment power continuity')
  await expect(demandPanel).toContainText('CMIST need matrix')
  await expect(demandPanel).toContainText('Communication')
  await expect(demandPanel).toContainText('Transportation')
  await expect(demandPanel).toContainText('County-published shelter capacity')

  await demandPanel.getByLabel('Service duration').selectOption('7')
  await expect(demandPanel).toContainText('7-day meals')
  await expect
    .poll(() => requests.at(-1)?.scenario)
    .toMatchObject({ service_days: 7, shelter_standard: 'evacuation' })

  const serialized = JSON.stringify(requests)
  expect(serialized).not.toContain('Urban Honolulu practice powered shelter')
  expect(serialized).not.toContain('coordinates')
  expect(serialized).not.toContain('Census Tract')
  expect(serialized).not.toContain('address')
})

test('resource demand endpoint failure stays unavailable until retry succeeds', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  let attempts = 0
  let allowSuccess = false
  await page.route('**/api/v1/planning/resource-demand', async (route) => {
    attempts += 1
    if (!allowSuccess) {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'resource demand model unavailable' }),
      })
      return
    }
    const body = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(resourceDemandFixture(body)),
    })
  })

  await openLocalPlanning(page)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  await page.getByRole('button', { name: 'Open response workspace' }).click()

  const demandPanel = page
    .locator('.planning-sheet:visible')
    .getByTestId('resource-demand')
  await expect(demandPanel).toContainText('Resource-demand model unavailable')
  await expect(demandPanel).toContainText('No numeric fallback was generated')
  allowSuccess = true
  await demandPanel.getByRole('button', { name: 'Retry' }).click()
  await expect(demandPanel).toContainText('Planning service population')
  expect(attempts).toBeGreaterThanOrEqual(2)
})

test('partner matches stay sourced, scoped, and non-operational', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  const requests: string[] = []
  await page.route('**/api/v1/planning/partner-matches?*', async (route) => {
    const url = new URL(route.request().url())
    requests.push(url.search)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        partnerMatchFixture(
          url.searchParams.get('jurisdiction') ?? 'honolulu',
          url.searchParams.getAll('capability'),
        ),
      ),
    })
  })

  await openLocalPlanning(page)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  await page.getByRole('button', { name: 'Open response workspace' }).click()

  const panel = page
    .locator('.planning-sheet:visible')
    .getByTestId('partner-matches')
  await expect(
    panel.getByRole('heading', { name: 'Response partner matches' }),
  ).toBeVisible()
  await expect(panel).toContainText('Pets and service animals')
  await expect(panel).toContainText('No sourced association')
  await expect(panel).toContainText('Keep this as an explicit coordination gap')

  await panel.getByRole('tab', { name: 'Sheltering' }).click()
  await expect(panel).toContainText(
    'Honolulu Department of Emergency Management',
  )
  await expect(panel).toContainText('American Red Cross Pacific Islands Region')
  await expect(panel).toContainText('Operational status not validated')
  await expect(panel).toContainText('Activation and capacity are not reported')
  await expect(panel).toContainText(
    'Source review current through Apr 24, 2027',
  )

  await page.getByLabel('Choose island').selectOption('Maui')
  await expect.poll(() => requests.at(-1)).toContain('jurisdiction=maui')
  await panel.getByRole('tab', { name: 'Sheltering' }).click()
  await expect(panel).not.toContainText(
    'Honolulu Department of Emergency Management',
  )
  await expect(panel).toContainText('American Red Cross Pacific Islands Region')
  const serialized = requests.join('&')
  expect(serialized).not.toContain('Maui Emergency Management Agency')
  expect(serialized).not.toContain('address')
  expect(serialized).not.toContain('coordinate')
  expect(serialized).not.toContain('capacity')
})

test('partner matching failure assumes no organization until retry', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  let attempts = 0
  let allowSuccess = false
  await page.route('**/api/v1/planning/partner-matches?*', async (route) => {
    attempts += 1
    const url = new URL(route.request().url())
    if (!allowSuccess) {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'partner matching unavailable' }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        partnerMatchFixture(
          url.searchParams.get('jurisdiction') ?? 'honolulu',
          url.searchParams.getAll('capability'),
        ),
      ),
    })
  })

  await openLocalPlanning(page)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  await page.getByRole('button', { name: 'Open response workspace' }).click()
  const panel = page
    .locator('.planning-sheet:visible')
    .getByTestId('partner-matches')
  await expect(panel).toContainText('Partner matching unavailable')
  await expect(panel).toContainText('No organization is assumed available')
  allowSuccess = true
  await panel.getByRole('button', { name: 'Retry' }).click()
  await expect(
    panel.getByRole('heading', { name: 'Response partner matches' }),
  ).toBeVisible()
  expect(attempts).toBeGreaterThanOrEqual(2)
})

test('mobile controls preserve the selected response zone', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'))
  await openLocalPlanning(page)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()

  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Change map details' }),
  ).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Tsunami' })).toBeVisible()

  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close panel' })
    .click()

  await page
    .getByRole('button', { name: /Change planning area or active event/ })
    .click()
  await page
    .locator('.map-story')
    .getByLabel('Which part of Oʻahu?')
    .selectOption('oahu-kaneohe')
  await page.getByRole('button', { name: 'Response plan', exact: true }).click()
  const planningSheet = page.locator('.planning-sheet:visible')
  await expect(
    planningSheet
      .getByRole('heading', {
        name: 'Mass care plan for Kāneʻohe',
      })
      .first(),
  ).toBeVisible()
  await expect(
    planningSheet.getByText('1 · Map affected communities'),
  ).toBeVisible()
  await expect(
    planningSheet.getByText('2 · Model needs and gaps'),
  ).toBeVisible()
  await expect(
    planningSheet.getByText('3 · Match response partners'),
  ).toBeVisible()
  await expect(
    planningSheet.getByRole('heading', { name: 'Local resource inventory' }),
  ).toBeVisible()
  await planningSheet
    .getByRole('button', { name: 'Create response checklist' })
    .click()
  await expect(planningSheet.locator('.priority-list')).toBeVisible()
  await expect
    .poll(() =>
      planningSheet
        .locator('.priority-list small')
        .first()
        .evaluate((element) => getComputedStyle(element).fontSize),
    )
    .toBe('14px')
  await expect
    .poll(() =>
      planningSheet
        .locator('.sheet-challenge-card.is-action > strong')
        .evaluate((element) => getComputedStyle(element).fontSize),
    )
    .toBe('14px')
  await expect(planningSheet.getByText('Needs considered')).not.toBeVisible()
  await planningSheet
    .getByText('Why am I seeing these recommendations?')
    .click()
  await expect(planningSheet.getByText('Needs considered')).toBeVisible()
  await expect(
    planningSheet.getByRole('heading', {
      name: 'Hawaiʻi DHS planning references',
    }),
  ).toBeVisible()
  await expect(
    planningSheet.getByRole('link', {
      name: /Hawaiʻi Department of Human Services/,
    }),
  ).toHaveAttribute('href', 'https://humanservices.hawaii.gov/')
  const emergencyAccessReference = planningSheet.getByRole('link', {
    name: /DHS emergency planning for disability and access needs/,
  })
  await expect(emergencyAccessReference).toContainText(
    'medication refrigeration',
  )
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
  await openLocalPlanning(page)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()

  await expect(
    page.getByRole('heading', { name: 'Preview resident guidance' }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Open public guidance preview' })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Public guidance preview' }),
  ).toBeVisible()

  const locationButton = page.getByRole('button', {
    name: 'Use my current location',
  })
  await locationButton.click()
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

test('planner sheets, tabs, and resident lookup are keyboard-safe', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  await openLocalPlanning(page)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()

  const neighborhoodTab = page
    .getByRole('tab', { name: 'Mānoa–Makiki' })
    .first()
  await neighborhoodTab.focus()
  await neighborhoodTab.press('ArrowRight')
  const nextNeighborhood = page
    .getByRole('tab', { name: 'Kakaʻako–Ala Moana' })
    .first()
  await expect(nextNeighborhood).toBeFocused()
  await expect(nextNeighborhood).toHaveAttribute('aria-selected', 'true')

  const opener = page.getByRole('button', {
    name: 'Open public guidance preview',
  })
  await opener.focus()
  await opener.click()
  const dialog = page.getByRole('dialog', {
    name: 'Public guidance preview',
  })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(
    dialog.getByRole('button', { name: 'Close panel' }),
  ).toBeFocused()
  expect(
    await page
      .locator('.atlas-header')
      .evaluate((element) => element instanceof HTMLElement && element.inert),
  ).toBe(true)
  expect(
    await page.locator('body').evaluate((element) => element.style.overflow),
  ).toBe('hidden')
  await page.keyboard.press('Shift+Tab')
  expect(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true)

  const location = dialog.getByLabel('Home address or landmark')
  await location.fill('   ')
  await dialog.getByRole('button', { name: 'Find routes' }).click()
  await expect(
    dialog.getByRole('alert').filter({
      hasText:
        'Enter an address, intersection, landmark, or ZIP code before finding routes.',
    }),
  ).toBeVisible()
  await expect(location).toHaveAttribute('aria-invalid', 'true')

  const shelterTab = dialog.getByRole('tab', { name: 'Safe shelter' })
  await shelterTab.focus()
  await shelterTab.press('End')
  const pickupTab = dialog.getByRole('tab', { name: 'No-car pickup' })
  await expect(pickupTab).toBeFocused()
  await expect(pickupTab).toHaveAttribute('aria-selected', 'true')

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
  expect(
    await page
      .locator('.atlas-header')
      .evaluate((element) => element instanceof HTMLElement && element.inert),
  ).toBe(false)
})

test('resident geolocation exposes pending and bounded errors', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (
          _success: PositionCallback,
          error: PositionErrorCallback,
        ) => {
          window.setTimeout(
            () =>
              error({
                code: 3,
                message: 'timeout',
                PERMISSION_DENIED: 1,
                POSITION_UNAVAILABLE: 2,
                TIMEOUT: 3,
              }),
            1_000,
          )
        },
      },
    })
  })
  await openLocalPlanning(page)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  await page
    .getByRole('button', { name: 'Open public guidance preview' })
    .click()
  const dialog = page.getByRole('dialog', {
    name: 'Public guidance preview',
  })
  const locationButton = dialog.getByRole('button', {
    name: 'Use my current location',
  })
  await locationButton.click()
  await expect(
    dialog.getByRole('button', { name: 'Finding current location…' }),
  ).toBeDisabled()
  await expect(dialog.getByRole('alert')).toContainText(
    'Current location took too long to respond',
  )
  await expect(dialog.getByText(/longitude|latitude/i)).toHaveCount(0)
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

  await openLocalPlanning(page)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  await page
    .getByRole('button', { name: 'Open public guidance preview' })
    .click()

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

test('road-level route requests street-detail tiles', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  const initialBasemapRequest = page.waitForRequest((request) =>
    request.url().includes('World_Street_Map/MapServer/tile/'),
  )

  await openLocalPlanning(page)
  await initialBasemapRequest
  await page
    .getByRole('button', { name: 'Open public guidance preview' })
    .click()
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

test('real coastlines render and pan when street tiles fail', async ({
  page,
}) => {
  await page.route('**/World_Street_Map/MapServer/tile/**', (route) =>
    route.abort('failed'),
  )
  const coastlineResponse = page.waitForResponse('**/hawaii-coastline.geojson')
  await openLocalPlanning(page)
  const geometry = await (await coastlineResponse).json()
  expect(geometry.features[0].properties.STATE).toBe('15')
  expect(geometry.features[0].geometry.type).toBe('MultiPolygon')
  const map = page.locator('.map-frame')
  await expect(map).toHaveAttribute('data-map-geography-visible', 'true')
  await expect(
    page.getByText('Street map interrupted · Coastline view', { exact: true }),
  ).toBeVisible()

  const canvas = page.locator('.maplibregl-canvas')
  const before = await canvas.screenshot()
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  if (!box) throw new Error('Map canvas has no bounds')
  const x = box.x + box.width * 0.5
  const y = box.y + box.height * 0.55
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 65, y - 25, { steps: 12 })
  await page.mouse.up()
  await expect
    .poll(async () => (await canvas.screenshot()).equals(before))
    .toBe(false)
  await expect(map).toHaveAttribute('data-map-geography-visible', 'true')
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect(map).toHaveAttribute('data-map-geography-visible', 'true')
  await page.screenshot({
    path: test.info().outputPath('coastline-fallback.png'),
  })
})

test('partial street tile success does not hide a tile failure', async ({
  page,
}) => {
  let failedTiles = 0
  let successfulTiles = 0
  const tileImage = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await page.route('**/World_Street_Map/MapServer/tile/**', async (route) => {
    if (failedTiles === 0) {
      failedTiles++
      await route.abort('failed')
      return
    }
    successfulTiles++
    await route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(tileImage, 'base64'),
    })
  })
  await openLocalPlanning(page)
  await expect(page.locator('.map-frame')).toHaveAttribute(
    'data-map-geography-visible',
    'true',
  )
  expect(failedTiles).toBe(1)
  expect(successfulTiles).toBeGreaterThan(0)
  await expect(
    page.getByText('Street map interrupted · Coastline view', { exact: true }),
  ).toBeVisible()
})

test('mobile resident route exposes no-car and language controls', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'))
  await mockOfficialHawaiiKaiStatus(page)
  await openLocalPlanning(page)
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()

  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await page.getByRole('radio', { name: 'Tsunami' }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close panel' })
    .click()
  await page
    .getByRole('button', { name: 'Public guidance', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Public guidance preview' }),
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
  await openLocalPlanning(page)
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

  await page
    .getByRole('button', { name: 'Open public guidance preview' })
    .click()
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
    page.getByText('Tropical Storm Nolo scenario footprint'),
  ).toBeVisible()
  await expect(
    page.getByText('Heaviest rain bands possible in 24–48 hours'),
  ).toBeVisible()
  await page
    .locator('.public-guidance')
    .getByText('Public guidance', { exact: true })
    .click()
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

  await page
    .getByRole('button', { name: 'Open public guidance preview' })
    .click()
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
      { exact: false },
    ),
  ).toBeVisible()
  await expect(
    page
      .locator('.relief-panel')
      .getByText('Before the first possible wave', { exact: false })
      .first(),
  ).toBeVisible()
  await expect(
    page.getByText(
      'If your block is inside an official tsunami evacuation zone, walk inland or to higher ground and stay out until the all-clear.',
      { exact: true },
    ),
  ).toBeVisible()
  await page.getByText('Resources, routes and support', { exact: true }).click()
  await expect(
    page.getByText(
      'Do not use a shoreline road to reach another destination inside the evacuation zone.',
      { exact: true },
    ),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Open public guidance preview' })
    .click()
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
      { exact: false },
    ),
  ).toBeVisible()
  await expect(
    page
      .locator('.relief-panel')
      .getByText('Before smoke or closures block evacuation routes', {
        exact: false,
      })
      .first(),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Leave early if an official alert includes your neighborhood, using a route away from fire and smoke.',
      { exact: true },
    ),
  ).toBeVisible()
  await page.getByText('Resources, routes and support', { exact: true }).click()
  await expect(
    page.getByText(
      'Smoke can hide hazards and make a route unsafe before flames are visible.',
      { exact: true },
    ),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Open public guidance preview' })
    .click()
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
  await openLocalPlanning(page)
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
