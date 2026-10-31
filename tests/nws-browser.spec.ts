import { expect, test } from '@playwright/test'
import { parseLifecycleEvidence } from '../src/lib/lifecycle-evidence'
import {
  nwsProduct,
  weatherLegacySnapshot,
  weatherSnapshot,
  weatherTime,
} from './fixtures/nws-product'

test('real Go NWS provenance and immutable records survive source states on desktop and mobile', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000)
  let mode = 'current'
  const writes: string[] = []
  page.on('request', (request) => {
    if (
      request.url().includes('/api/') &&
      !['GET', 'OPTIONS'].includes(request.method()) &&
      !request.url().includes('/telemetry/')
    )
      writes.push(request.url())
  })
  await page.clock.install({ time: new Date(weatherTime) })
  await page.route('**/api/v1/lifecycle/evidence?**', (route) =>
    route.continue({
      headers: { ...route.request().headers(), 'X-NWS-Fixture': mode },
    }),
  )
  const initialResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/lifecycle/evidence?') &&
      response.status() === 200,
  )
  await page.goto('/lifecycle')
  const initial = parseLifecycleEvidence(await (await initialResponse).json())
  const product = initial.event_triggers.data!.triggers.find(
    (row) => row.source === 'nws',
  )!.nws_product!
  expect(product.id).toBe('fixture-nws-advisory')
  expect(product.sent).not.toBe(product.onset)
  expect(product.query_scope.coverage).toBe('statewide')
  expect(product.applicability).toBe('inside')
  expect(product.applicability_reason).toBe('strict_interior')
  expect(product.references?.map((row) => row.identifier)).toEqual([
    'previous-b',
    'previous-a',
  ])
  const panel = page.getByRole('region', { name: 'Live lifecycle evidence' })
  const weather = page.getByRole('region', { name: 'NWS product provenance' })
  await expect(weather.locator('[data-nws-retrieval]').first()).toHaveAttribute(
    'data-nws-retrieval',
    'fresh',
  )
  await expect(weather.locator('[data-nws-validity]')).toHaveText('current')
  await expect(weather).toContainText('B04 remains manual')
  await expect(page.locator('[data-lifecycle-restored]')).toHaveAttribute(
    'data-lifecycle-restored',
    'true',
  )
  await weather
    .locator('details.lifecycle-source-detail > summary')
    .press('Enter')
  const saved = () =>
    page.evaluate(() => localStorage.getItem('practice-lifecycle.v5'))
  await weather
    .getByRole('button', { name: 'Review exact product revision' })
    .click()
  await expect(weather.locator('[data-reviewed-weather]')).toContainText(
    product.headline!,
  )
  await weather
    .getByRole('button', { name: 'Accept displayed weather revision' })
    .click()
  await expect(weather.locator('[data-accepted-weather]')).toHaveCount(1)
  const accepted = JSON.parse((await saved())!).weatherEvidence
  expect(accepted[0].product.id).toBe(product.id)
  expect(accepted[0].evaluation.applicability).toBe('inside')
  const before = await saved()
  await weather
    .getByText('Exact product facts and provenance', { exact: true })
    .first()
    .click()
  for (const field of [
    'sent',
    'effective',
    'onset',
    'expires',
    'ends',
  ] as const)
    await expect(weather).toContainText(product[field]!)
  await expect(weather).toContainText('Honolulu County')
  await expect(
    weather.getByRole('link', { name: 'Open NWS product', exact: true }),
  ).toHaveAttribute('href', product.url!)
  for (const [scenario, eligibility, validity, applicability] of [
    ['changed', 'eligible', 'current', 'inside'],
    ['update', 'eligible', 'current', 'outside'],
    ['cancel', 'cancellation', 'current', 'inside'],
    ['ack', 'protocol', 'current', 'inside'],
    ['error', 'protocol', 'current', 'inside'],
    ['test', 'non actual', 'current', 'inside'],
    ['exercise', 'non actual', 'current', 'inside'],
    ['draft', 'non actual', 'current', 'inside'],
    ['system', 'non actual', 'current', 'inside'],
    ['expired', 'eligible', 'expired', 'inside'],
    ['missing', 'eligible', 'unknown', 'inside'],
    ['null-times', 'eligible', 'current', 'inside'],
    ['no-polygon', 'eligible', 'current', 'unknown'],
    ['invalid-geometry', 'eligible', 'current', 'unknown'],
    ['topology-invalid', 'eligible', 'current', 'unknown'],
    ['zone-inside', 'eligible', 'current', 'inside'],
    ['zone-outside', 'eligible', 'current', 'outside'],
    ['zone-boundary', 'eligible', 'current', 'unknown'],
    ['zone-partial', 'eligible', 'current', 'unknown'],
    ['zone-invalid', 'eligible', 'current', 'unknown'],
    ['zone-stale', 'eligible', 'current', 'unknown'],
    ['zone-pending', 'eligible', 'current', 'unknown'],
    ['zone-update', 'eligible', 'current', 'outside'],
    ['zone-cancel', 'cancellation', 'current', 'inside'],
    ['stale', 'eligible', 'current', 'inside'],
    ['partial', 'eligible', 'current', 'inside'],
    ['empty', '', '', ''],
    ['unavailable', '', '', ''],
  ]) {
    mode = scenario
    const response = page.waitForResponse((item) =>
      item.url().includes('/api/v1/lifecycle/evidence?'),
    )
    await panel.getByRole('button', { name: 'Refresh', exact: true }).click()
    await response
    await expect(panel).not.toContainText('Refreshing public evidence')
    if (eligibility) {
      await expect(weather.locator('[data-nws-eligibility]')).toHaveText(
        eligibility,
      )
      await expect(weather.locator('[data-nws-validity]')).toHaveText(validity)
      await expect(weather.locator('[data-nws-applicability]')).toHaveText(
        applicability,
      )
    }
    if (scenario === 'changed')
      await expect(weather).toContainText('Fixture same-ID revised report')
    if (scenario === 'update')
      await expect(weather).toContainText('This is not an all-clear')
    if (scenario === 'cancel')
      await expect(weather).toContainText(
        'This does not establish impact, authority, an order, or an instruction.',
      )
    if (scenario === 'invalid-geometry' || scenario === 'topology-invalid')
      await expect(weather).toContainText('Unknown (invalid topology)')
    if (scenario === 'no-polygon')
      await expect(weather).toContainText(
        'Coverage is limited to products that include polygons.',
      )
    if (scenario === 'zone-inside') {
      await expect(weather).toContainText(
        'Inside at least one official NWS zone boundary.',
      )
      await expect(weather).toContainText(
        'do not establish address-level impact',
      )
    }
    if (scenario === 'zone-outside' || scenario === 'zone-update')
      await expect(weather).toContainText(
        'Outside every referenced official NWS zone boundary after complete valid coverage. This is not an all-clear',
      )
    if (scenario === 'zone-boundary')
      await expect(weather).toContainText('Unknown (boundary)')
    if (['zone-partial', 'zone-invalid', 'zone-stale'].includes(scenario))
      await expect(weather).toContainText(
        'Partial coverage cannot establish outside.',
      )
    if (scenario === 'zone-pending')
      await expect(weather).toContainText(
        'Unknown while official NWS zone boundaries are being checked.',
      )
    if (scenario === 'zone-cancel') {
      await expect(weather.locator('[data-nws-eligibility]')).toHaveText(
        'cancellation',
      )
      await expect(weather).toContainText(
        'no zone result is an order, impact determination, or all-clear',
      )
    }
    if (scenario === 'null-times') {
      await expect(
        weather
          .locator('dt')
          .filter({ hasText: /^Onset$/ })
          .locator('+ dd'),
      ).toHaveText('Not reported')
      await expect(
        weather
          .locator('dt')
          .filter({ hasText: /^Ends / })
          .locator('+ dd'),
      ).toHaveText('Not reported')
    }
    if (scenario === 'stale')
      await expect(
        weather.locator('[data-nws-retrieval]').first(),
      ).toContainText('stale')
    if (scenario === 'partial')
      await expect(weather).toContainText(
        'source error · facts may be incomplete',
      )
    if (scenario === 'empty')
      await expect(weather).toContainText(
        'No products returned by this query. This does not mean no hazard or order.',
      )
    if (scenario === 'unavailable')
      await expect(weather).toContainText('NWS product availability is unknown')
    expect(await saved()).toBe(before)
  }
  mode = 'current'
  await panel.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(weather.locator('[data-nws-validity]')).toHaveText('current')
  const cap = (id: string) => page.locator(`[data-capability="${id}"]`)
  const capabilityDetails = page.locator(
    '.lifecycle-capability-details:not([open]) > summary',
  )
  while (await capabilityDetails.count())
    await capabilityDetails.first().click()
  await cap('B01').getByRole('button', { name: 'Lock practice event' }).click()
  await cap('B02').getByRole('button').first().click()
  await cap('B03')
    .getByRole('button', { name: 'Freeze objective selection' })
    .click()
  await cap('B04')
    .getByRole('button', { name: 'Compute bounded margin' })
    .click()
  await cap('B05').getByRole('button', { name: 'Carry comparison' }).click()
  await cap('B07')
    .getByRole('button', { name: /Record unknown for/ })
    .first()
    .click()
  await cap('B08').getByRole('button').first().click()
  await cap('B09').getByRole('button').first().click()
  await cap('B10').getByRole('button', { name: 'Seal immutable H1' }).click()
  await cap('D01')
    .getByRole('button', { name: 'Start response practice' })
    .click()
  await cap('D02').getByRole('button', { name: 'Advance 60m' }).click()
  await expect(weather.locator('[data-nws-validity]')).toHaveText('current')
  await expect(weather).toContainText(product.sent!)
  await cap('D03')
    .getByRole('button', { name: /as unknown/ })
    .first()
    .click()
  await cap('D04')
    .getByRole('button', { name: /Record hold/ })
    .first()
    .click()
  await cap('D10')
    .getByRole('button', { name: /Mark S-1-1 carried/ })
    .click()
  await cap('D10').getByRole('button', { name: 'Seal immutable H2' }).click()
  const rechecks = weather.getByRole('region', {
    name: 'Accepted weather rechecks',
  })
  for (const [scenario, result] of [
    ['current', 'unchanged'],
    ['zone-update', 'changed'],
    ['cancel', 'cancelled'],
    ['empty', 'not-returned'],
    ['unavailable', 'source-unavailable'],
  ]) {
    mode = scenario
    const count = (JSON.parse((await saved())!).weatherRechecks ?? []).length
    await rechecks
      .getByRole('button', { name: 'Recheck weather WA-1-1' })
      .click()
    await expect(rechecks.locator('[data-weather-recheck]')).toHaveCount(
      count + 1,
    )
    await expect(
      rechecks.locator('[data-weather-recheck]').last(),
    ).toHaveAttribute('data-weather-recheck', result)
    const current = JSON.parse((await saved())!)
    expect(current.weatherEvidence).toEqual(accepted)
    expect(current.capabilityMarkers).not.toContain('A04')
  }
  await weather.locator('details.lifecycle-source-detail > summary').click()
  await cap('A04').locator('.lifecycle-capability-details > summary').click()
  await expect(cap('A04')).toContainText(
    '0/0/5 service/source/weather rechecks',
  )
  await expect(cap('A04')).toContainText('source-unavailable')
  await expect(
    page.getByText('4 rechecks need attention', { exact: true }),
  ).toBeVisible()
  await weather.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('nws-provenance.png') })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.reload()
  await weather
    .locator('details.lifecycle-source-detail > summary')
    .press('Enter')
  await expect(weather.locator('[data-accepted-weather]')).toHaveCount(1)
  await expect(
    weather
      .getByRole('region', { name: 'Accepted weather rechecks' })
      .locator('[data-weather-recheck]'),
  ).toHaveCount(5)
  expect(JSON.parse((await saved())!).weatherEvidence).toEqual(accepted)
  expect(writes).toEqual([])
})

test('collapsed NWS summary exposes mixed product states', async ({ page }) => {
  const current = nwsProduct()
  const cancelled = {
    ...nwsProduct(),
    id: 'urn:oid:fixture-nws-cancel',
    url: 'https://api.weather.gov/alerts/urn:oid:fixture-nws-cancel',
    headline: 'Fixture cancellation',
    message_type: 'Cancel' as const,
    relationship: 'cancel' as const,
    eligibility: 'cancellation' as const,
    expires: '2026-10-30T17:59:00Z',
    validity: 'expired' as const,
    geometry: {
      status: 'valid' as const,
      type: 'Polygon' as const,
      shape: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      },
    },
    applicability: 'outside' as const,
    applicability_reason: 'strict_exterior' as const,
    applicability_basis: 'inline_geometry' as const,
  }
  const snapshot = weatherSnapshot(current)
  snapshot.event_triggers.data!.triggers.push({
    source: 'nws',
    lifecycle: 'cancelled',
    planning_state: 'monitor',
    title: cancelled.headline,
    nws_product: cancelled,
  })
  await page.clock.install({ time: new Date(weatherTime) })
  await page.route('**/api/v1/lifecycle/evidence?**', (route) =>
    route.fulfill({ json: snapshot }),
  )
  await page.goto('/lifecycle')

  const weather = page.getByRole('region', { name: 'NWS product provenance' })
  await expect(weather).toContainText('validity: current · expired')
  await expect(weather).toContainText('eligibility: eligible · cancellation')
  await expect(weather).toContainText('applicability: unknown · outside')
  await expect(
    weather.locator('details.lifecycle-source-detail'),
  ).not.toHaveAttribute('open', '')
})

test('zone applicability ages to unknown without browser geometry recomputation', async ({
  page,
}) => {
  await page.clock.install({ time: new Date(weatherTime) })
  await page.route('**/api/v1/lifecycle/evidence?**', (route) =>
    route.continue({
      headers: {
        ...route.request().headers(),
        'X-NWS-Fixture': 'zone-outside',
      },
    }),
  )
  await page.goto('/lifecycle')
  const weather = page.getByRole('region', { name: 'NWS product provenance' })
  await expect(weather.locator('[data-nws-applicability]')).toHaveText(
    'outside',
  )
  await page.clock.fastForward(24 * 60 * 60 * 1000)
  await expect(weather.locator('[data-nws-applicability]')).toHaveText(
    'unknown',
  )
  await expect(weather).toContainText(
    'Partial coverage cannot establish outside.',
  )
  await expect(weather).toContainText('HIZ001: stale/outside')
})

test('wall clock and 304 expiry cannot be hidden by fresh retrieval or malformed replacement', async ({
  page,
  context,
}) => {
  let mode = 'ok'
  let calls = 0
  await page.clock.install({ time: new Date(weatherTime) })
  await page.route('**/api/v1/lifecycle/evidence?**', (route) => {
    calls++
    if (mode === '304')
      return route.fulfill({ status: 304, headers: { ETag: 'W/"weather-a"' } })
    if (mode === 'abort') return route.abort('failed')
    const snapshot = weatherSnapshot()
    if (mode === 'malformed')
      Object.assign(snapshot.event_triggers.data!.triggers[0].nws_product!, {
        message_type: ['Alert'],
        headline: 'Unvalidated replacement',
      })
    return route.fulfill({ json: snapshot, headers: { ETag: 'W/"weather-a"' } })
  })
  await page.goto('/lifecycle')
  const panel = page.getByRole('region', { name: 'Live lifecycle evidence' })
  const weather = page.getByRole('region', { name: 'NWS product provenance' })
  await expect(weather.locator('[data-nws-validity]')).toHaveText('current')
  const before = await page.evaluate(() =>
    localStorage.getItem('practice-lifecycle.v5'),
  )
  mode = '304'
  const beforeCalls = calls
  // No request is made when the wall clock crosses expiry below the polling interval.
  await page.clock.setSystemTime(new Date(Date.parse(weatherTime) + 120_000))
  await page.clock.runFor(1000)
  await expect(weather.locator('[data-nws-validity]')).toHaveText('expired')
  await expect(weather.locator('[data-nws-retrieval]').first()).toContainText(
    'fresh',
  )
  expect(calls).toBe(beforeCalls)
  await panel.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(weather.locator('[data-nws-validity]')).toHaveText('expired')
  mode = 'malformed'
  await panel.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(panel).toContainText('Malformed lifecycle evidence')
  await expect(weather).not.toContainText('Unvalidated replacement')
  await expect(weather).toContainText('Fixture Flood Warning')
  await expect(weather.locator('[data-nws-retrieval]').first()).toContainText(
    'unavailable',
  )
  mode = 'abort'
  await panel.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(panel).toContainText('LAST KNOWN')
  await context.setOffline(true)
  await expect(weather.locator('[data-nws-validity]')).toHaveText('expired')
  expect(
    await page.evaluate(() => localStorage.getItem('practice-lifecycle.v5')),
  ).toBe(before)
})

test('legacy warning panel ages products without refetch and retains validated facts after failure', async ({
  page,
}, testInfo) => {
  let mode = 'ok'
  await page.clock.install({ time: new Date(weatherTime) })
  await page.route('**/api/v1/planning/event-triggers', (route) => {
    if (mode === 'malformed')
      return route.fulfill({
        json: {
          ...weatherLegacySnapshot(),
          triggers: [{ nws_product: { validity: ['current'] } }],
        },
      })
    const snapshot = weatherLegacySnapshot()
    if (mode === 'cancel') {
      snapshot.triggers[0].nws_product!.message_type = 'Cancel'
      snapshot.triggers[0].nws_product!.relationship = 'cancel'
      snapshot.triggers[0].nws_product!.eligibility = 'cancellation'
    }
    return route.fulfill({ json: snapshot })
  })
  await page.goto('/')
  if (testInfo.project.name === 'mobile-chromium')
    await page
      .getByRole('button', { name: /Change planning area or active event/ })
      .click()
  await page
    .getByText('Official triggers & practice scenarios', { exact: true })
    .click()
  const panel = page.getByTestId('event-trigger-panel').first()
  await expect(panel).toContainText('Official warning product')
  await page.clock.setSystemTime(new Date(Date.parse(weatherTime) + 120_000))
  await page.clock.runFor(1000)
  await expect(panel).toContainText('Retained product')
  await expect(panel).toContainText('Retained NWS product validity: expired.')
  await expect(panel).not.toContainText('Official warning product')
  mode = 'malformed'
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(panel).toContainText('Malformed event evidence')
  await expect(panel).toContainText('Fixture Flood Warning')
  mode = 'cancel'
  await panel.getByRole('button', { name: 'Retry trigger sources' }).click()
  await expect(panel).toContainText('Message eligibility: cancellation')
  await expect(panel).not.toContainText('Official warning product')
})

for (const retrieval of ['offline', 'unavailable', 'stale'] as const) {
  test(`legacy panel keeps unexpired validity and unknown applicability with ${retrieval} retrieval`, async ({
    page,
    context,
  }, testInfo) => {
    const snapshot = weatherLegacySnapshot({
      ...nwsProduct(),
      expires: '2026-10-30T19:00:00Z',
    })
    let failed = false
    let requests = 0
    const writes: string[] = []
    page.on('request', (request) => {
      if (
        request.url().includes('/api/') &&
        !['GET', 'OPTIONS'].includes(request.method()) &&
        !request.url().includes('/telemetry/')
      )
        writes.push(request.url())
    })
    await page.clock.install({ time: new Date(weatherTime) })
    await page.route('**/api/v1/planning/event-triggers', (route) => {
      requests++
      return failed
        ? route.fulfill({ status: 503, body: 'Source unavailable' })
        : route.fulfill({ json: snapshot })
    })
    await page.goto('/')
    if (testInfo.project.name === 'mobile-chromium')
      await page
        .getByRole('button', { name: /Change planning area or active event/ })
        .click()
    await page
      .getByText('Official triggers & practice scenarios', { exact: true })
      .click()
    const panel = page.getByTestId('event-trigger-panel').first()
    const consequence = panel.locator('.event-trigger-detail > p').first()
    await expect(panel).toContainText('Official warning product')
    await expect(panel.locator('[data-nws-validity]')).toHaveText('current')
    const saved = await page.evaluate(() =>
      localStorage.getItem('practice-lifecycle.v5'),
    )
    if (retrieval === 'offline') {
      await context.setOffline(true)
    } else if (retrieval === 'unavailable') {
      failed = true
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    } else {
      const before = requests
      await page.clock.setSystemTime(
        new Date(Date.parse(weatherTime) + 300_000),
      )
      await page.clock.runFor(1000)
      expect(requests).toBe(before)
    }
    const expectedRetrieval = retrieval === 'stale' ? 'stale' : 'unavailable'
    if (retrieval !== 'stale') await expect(panel).toContainText('LAST KNOWN')
    await expect(consequence).toContainText(
      'Retained NWS product validity: current.',
    )
    await expect(consequence).toContainText(`Retrieval: ${expectedRetrieval}.`)
    await expect(consequence).toContainText(
      'Planning-location applicability: unknown.',
    )
    await expect(panel.locator('[data-nws-validity]')).toHaveText('current')
    await expect(panel.locator('[data-nws-retrieval]')).toContainText(
      new RegExp(`retrieval: ${expectedRetrieval}`, 'i'),
    )
    await expect(panel.locator('.event-trigger-selector')).toContainText(
      'Retained product',
    )
    await expect(panel.locator('.event-trigger-title')).toContainText(
      'Retained product',
    )
    await expect(panel).not.toContainText('Not current')
    await expect(panel).not.toContainText(
      'Not a current warning for this location',
    )
    await expect(panel).not.toContainText('Official warning product')
    await panel
      .getByText('Exact product facts and provenance', { exact: true })
      .click()
    await expect(panel.locator('.nws-product-facts')).toContainText(weatherTime)
    await expect(panel.locator('.nws-product-facts')).toContainText(
      '2026-10-30T18:05:00Z',
    )
    const beforeExpiry = requests
    await page.clock.setSystemTime(new Date('2026-10-30T19:00:00Z'))
    await page.clock.runFor(1000)
    await expect(consequence).toContainText(
      'Retained NWS product validity: expired.',
    )
    await expect(consequence).toContainText(`Retrieval: ${expectedRetrieval}.`)
    await expect(consequence).toContainText(
      'Planning-location applicability: unknown.',
    )
    await expect(consequence).toContainText('this is not an all-clear')
    await expect(panel.locator('[data-nws-validity]')).toHaveText('expired')
    await expect(panel).not.toContainText(
      'Not a current warning for this location',
    )
    expect(requests).toBe(beforeExpiry)
    expect(
      await page.evaluate(() => localStorage.getItem('practice-lifecycle.v5')),
    ).toBe(saved)
    expect(writes).toEqual([])
  })
}
