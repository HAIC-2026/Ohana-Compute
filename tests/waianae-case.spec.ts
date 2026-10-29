import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

import {
  caseChecks,
  createAssistancePacket,
  defaultTiming,
  emptyChecks,
  evaluateTiming,
  restoreCase,
} from '../src/lib/waianae-case'
import {
  floodEvidenceText,
  floodFillColor,
  floodOutlineColor,
  parseFloodEvidence,
} from '../src/lib/waianae-geography'

test('before-arrival arithmetic is bounded, deterministic and not a dispatch schedule', () => {
  expect(evaluateTiming(defaultTiming).result).toMatchObject({
    accessWindow: 18,
    preparation: 5,
    margin: 13,
  })
  expect(
    evaluateTiming({ ...defaultTiming, arrival: '8' }).result,
  ).toMatchObject({ accessWindow: 2, preparation: 5, margin: -3 })
  expect(
    evaluateTiming({ ...defaultTiming, arrival: '11' }).result?.margin,
  ).toBe(0)
  expect(
    evaluateTiming({ ...defaultTiming, accessLoss: '0' }).result?.accessWindow,
  ).toBe(24)
})

test('invalid input never becomes a success-shaped partial result', () => {
  for (const invalid of ['', '-1', '0.5', 'Infinity', '1e3', '169']) {
    expect(
      evaluateTiming({ ...defaultTiming, arrival: invalid }).result,
    ).toBeNull()
  }
  expect(
    evaluateTiming({ ...defaultTiming, arrival: '5' }).errors.accessLoss,
  ).toContain('earlier than now')
  expect(evaluateTiming({ ...defaultTiming, travel: '0' }).result).toBeNull()
  expect(evaluateTiming({ ...defaultTiming, buffer: '25' }).result).toBeNull()
  expect(() =>
    createAssistancePacket({
      timing: { ...defaultTiming, arrival: '-1' },
      checks: emptyChecks,
      evidence: '',
      partners: '',
    }),
  ).toThrow()
})

test('restoration accepts only controlled timing and question-prepared flags, not arbitrary fields', () => {
  expect(restoreCase({ timing: defaultTiming, checks: emptyChecks })).toEqual({
    timing: defaultTiming,
    checks: emptyChecks,
    contributions: [],
  })
  expect(
    restoreCase({
      timing: { ...defaultTiming, address: 'must not be persisted' },
      checks: emptyChecks,
    }),
  ).toEqual({ timing: defaultTiming, checks: emptyChecks, contributions: [] })
  expect(restoreCase({ timing: defaultTiming, checks: {} })).toBeNull()
  expect(
    restoreCase({
      timing: { ...defaultTiming, travel: 1 },
      checks: emptyChecks,
    }),
  ).toBeNull()
  expect(
    restoreCase({
      timing: { ...defaultTiming, arrival: '1' },
      checks: emptyChecks,
    }),
  ).toBeNull()
  expect(restoreCase(null)).toBeNull()
})

test('request packet preserves all five CMIST assumptions, unknowns, County ownership and no AI/dispatch claim', () => {
  const packet = createAssistancePacket({
    timing: defaultTiming,
    checks: { ...emptyChecks, transportation: true },
    evidence: 'Official-source snapshot',
    partners: 'Directory unavailable',
  })
  for (const check of caseChecks) expect(packet).toContain(check.name)
  expect(packet).toContain('18 - 5 = 13h')
  expect(packet).toContain('2 passenger places')
  expect(packet).toContain('NOT SENT')
  expect(packet).toContain(
    'Team availability, assignment and activation are unconfirmed',
  )
  expect(packet).not.toMatch(/No team (?:is )?available/)
  expect(packet).toContain('not a home, resident address or registry')
  expect(packet).toContain('hypothetical')
  expect(packet).toContain('prepared; answer unresolved')
  expect(packet).toContain('No case inputs were sent to a provider')
  expect(packet).toContain('Directory unavailable')
  const exhausted = createAssistancePacket({
    timing: { ...defaultTiming, arrival: '8' },
    checks: emptyChecks,
    evidence: '',
    partners: '',
  })
  expect(exhausted).toContain('Exercise window exhausted')
})

test('saved official polygon evidence retains provenance and never becomes a person-level or access forecast', async () => {
  const raw: unknown = JSON.parse(
    await readFile(
      new URL('../public/waianae-flood-context.geojson', import.meta.url),
      'utf8',
    ),
  )
  const source = parseFloodEvidence(raw)
  expect(source.geometry.features.length).toBeGreaterThan(0)
  expect(source.zones).toContain('AE')
  expect(
    source.sources.every(
      (item) =>
        item.url.startsWith('https://') &&
        item.authority.length > 0 &&
        item.retrieved_at.length > 0,
    ),
  ).toBe(true)
  const evidence = floodEvidenceText(source)
  expect(evidence).toContain('not an event inundation forecast')
  expect(evidence).toContain('not')
  expect(floodEvidenceText(null)).toContain('unavailable')
  expect(() =>
    parseFloodEvidence({
      type: 'FeatureCollection',
      features: [],
      metadata: {},
    }),
  ).toThrow()
  expect(() =>
    parseFloodEvidence({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: 'bad' },
        },
      ],
      metadata: { sources: [] },
    }),
  ).toThrow()
})

test('flood fill and outline both distinguish special flood hazard from X coverage', () => {
  for (const [expression, special, other] of [
    [floodFillColor, '#b04b40', '#527b83'],
    [floodOutlineColor, '#8c382e', '#527b83'],
  ] as const) {
    expect(expression).toEqual([
      'match',
      ['get', 'case_zone'],
      ['A', 'AE', 'AH', 'AO', 'V', 'VE'],
      special,
      other,
    ])
    expect(expression[2]).not.toContain('X')
  }
})

test.describe('Waiʻanae fictional assistance workflow', () => {
  test('map story → pre-arrival window → County request → resident communication → persistent packet', async ({
    page,
  }, testInfo) => {
    await page.goto('/waianae')
    await page
      .getByRole('button', { name: 'Detailed workspace', exact: true })
      .click()
    await expect(page.locator('main')).toHaveAttribute('data-hydrated', 'true')
    await expect(page.getByTestId('case-flood-summary')).toBeVisible()
    await expect(
      page.getByText('A / AE / VE · special flood hazard', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText('X · other mapped coverage, not an all-clear', {
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      page
        .locator('.case-step')
        .getByText(
          'Team availability, assignment and activation are unconfirmed.',
          { exact: false },
        ),
    ).toBeVisible()
    const keyColors = await page
      .locator('.case-flood-key, .case-other-flood-key')
      .evaluateAll((keys) =>
        keys.map((key) => getComputedStyle(key).borderColor),
      )
    expect(keyColors).toEqual(['rgb(140, 56, 46)', 'rgb(82, 123, 131)'])
    await expect(page.getByTestId('case-map')).toHaveAttribute(
      'data-map-ready',
      'true',
    )
    await expect(
      page.getByLabel('Kupuna A, fictional illustrative location'),
    ).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('waianae-story.png') })
    await page
      .getByRole('checkbox', { name: 'Hypothetical access concerns' })
      .uncheck()
    await expect(
      page.getByLabel('H1: hypothetical access concern'),
    ).toHaveCount(0)
    await page
      .getByRole('checkbox', { name: 'Hypothetical access concerns' })
      .check()
    await expect(
      page.getByLabel('H1: hypothetical access concern'),
    ).toBeVisible()
    await page.getByRole('tab', { name: 'Before arrival' }).click()
    await expect(
      page.getByText('13h exercise planning margin', { exact: true }),
    ).toBeVisible()
    await page.getByLabel('Assumed storm arrival (hours from now)').fill('18')
    await expect(
      page.getByText('7h exercise planning margin', { exact: true }),
    ).toBeVisible()
    await page.getByRole('tabpanel').scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath('waianae-window.png') })
    await page.getByRole('tab', { name: 'County request' }).click()
    await page.getByRole('checkbox', { name: /^Transportation/ }).check()
    await expect(
      page.getByText('1/5 questions prepared', { exact: false }),
    ).toBeVisible()
    await page.getByRole('tab', { name: 'Resident message' }).click()
    await expect(page.locator('.case-resident-draft')).toContainText(
      'Firefighter, vehicle and specialist-team availability, assignment and activation are unconfirmed',
    )
    const downloading = page.waitForEvent('download')
    await page
      .getByRole('button', { name: 'Download request for review', exact: true })
      .first()
      .click()
    const packet = await readFile(await (await downloading).path(), 'utf8')
    expect(packet).toContain('12 - 5 = 7h')
    expect(packet).toContain('NOT SENT')
    expect(packet).toContain(
      'Saved official flood geometry: 290 source polygons',
    )
    await page.reload()
    await page
      .getByRole('button', { name: 'Detailed workspace', exact: true })
      .click()
    await page.getByRole('tab', { name: 'Before arrival' }).click()
    await expect(
      page.getByLabel('Assumed storm arrival (hours from now)'),
    ).toHaveValue('18')
    await page.getByRole('tab', { name: 'County request' }).click()
    await expect(
      page.getByRole('checkbox', { name: /^Transportation/ }),
    ).toBeChecked()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
  })

  test('invalid and exhausted windows block unsafe implications and edits clear old question preparation', async ({
    page,
  }) => {
    await page.goto('/waianae')
    await page
      .getByRole('button', { name: 'Detailed workspace', exact: true })
      .click()
    await page.getByRole('tab', { name: 'County request' }).click()
    await page.getByRole('checkbox', { name: /^Medical/ }).check()
    await page.getByRole('tab', { name: 'Before arrival' }).click()
    await page.getByLabel('Assumed storm arrival (hours from now)').fill('5')
    await expect(page.getByRole('alert')).toContainText('Resolve timing errors')
    await expect(
      page.getByRole('button', { name: 'Download request for review' }),
    ).toBeDisabled()
    await expect(
      page.getByText('0/5 questions prepared', { exact: false }),
    ).toBeVisible()
    await page.getByLabel('Assumed storm arrival (hours from now)').fill('8')
    await expect(
      page.getByText('Exercise window exhausted', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText('Do not assume access remains safe', { exact: false }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Reset assumptions' }).click()
    await expect(
      page.getByText('13h exercise planning margin', { exact: true }),
    ).toBeVisible()
    await page.getByRole('tab', { name: 'Before arrival' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(
      page.getByRole('tab', { name: 'Planning evidence' }),
    ).toBeFocused()
  })

  test('source and directory outages stay unknown while deterministic exercise remains usable', async ({
    page,
  }) => {
    await page.route('**/waianae-flood-context.geojson', (route) =>
      route.fulfill({ status: 503, body: 'unavailable' }),
    )
    await page.route('**/api/v1/planning/partner-matches?*', (route) =>
      route.fulfill({ status: 503, body: 'unavailable' }),
    )
    await page.route('**/World_Street_Map/**', (route) => route.abort())
    await page.goto('/waianae')
    await page
      .getByRole('button', { name: 'Detailed workspace', exact: true })
      .click()
    await expect(
      page.getByText('No replacement flood polygons are shown', {
        exact: false,
      }),
    ).toBeVisible()
    await expect(page.getByTestId('case-map')).toHaveAttribute(
      'data-flood-features',
      '0',
    )
    await page.getByRole('tab', { name: 'Before arrival' }).click()
    await expect(
      page.getByText('13h exercise planning margin', { exact: true }),
    ).toBeVisible()
    await page.getByRole('tab', { name: 'County request' }).click()
    await page
      .getByText('Sourced roles to approach—not available teams', {
        exact: true,
      })
      .click()
    await expect(
      page.getByText('Partner directory unavailable', { exact: false }),
    ).toBeVisible()
    const downloading = page.waitForEvent('download')
    await page
      .getByRole('button', { name: 'Download request for review' })
      .click()
    const text = await readFile(await (await downloading).path(), 'utf8')
    expect(text).toContain('Official flood geometry unavailable')
    expect(text).toContain('No organization is assumed available')
    expect(text).not.toContain('Saved official flood geometry:')
  })

  test('corrupt local state is disclosed; statewide entry opens only the new exemplar', async ({
    page,
  }) => {
    await page.addInitScript(() =>
      localStorage.setItem('waianae-assisted-planning.v1', '{bad'),
    )
    await page.goto('/')
    await page.locator('.planning-examples summary').click()
    await page
      .getByRole('link', { name: 'Fictional Waiʻanae case', exact: true })
      .click()
    await expect(page).toHaveURL(/\/waianae$/)
    await page
      .getByRole('button', { name: 'Detailed workspace', exact: true })
      .click()
    await expect(page.getByRole('alert')).toContainText(
      'storage is unavailable or unreadable',
    )
    await page.getByRole('tab', { name: 'Before arrival' }).click()
    await expect(
      page.getByLabel('Assumed storm arrival (hours from now)'),
    ).toHaveValue('24')
  })
})
