import { readFile } from 'node:fs/promises'
import {
  expect,
  test,
  communityProfile,
  eventTriggerSnapshot,
} from './fixtures'
import { buildTimeline, usableTrigger } from '../src/lib/coordination-plan'
import type { EventTrigger } from '../src/lib/event-triggers'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/risk/*?*', (route) =>
    route.fulfill({
      json: {
        classification: 'high',
        status: 'inside',
        rating: 'High',
        sources: [
          {
            authority: 'Official test map source',
            status: 'fresh',
            retrieved_at: new Date().toISOString(),
            fresh_until: new Date(Date.now() + 600_000).toISOString(),
          },
        ],
      },
    }),
  )
  await page.route('**/api/v1/telemetry/browser', (route) =>
    route.fulfill({ json: {} }),
  )
})

test('all hazard plans have accountable decisions and little-notice planning', () => {
  for (const hazard of ['hurricane', 'tsunami', 'wildfire', 'flood'] as const) {
    const timeline = buildTimeline(hazard)
    expect(timeline).toHaveLength(3)
    for (const action of timeline) {
      expect(action.lead).toContain('County')
      expect(action.support).toContain('State ESF-6')
      expect(action.decision).toContain('County decides')
      expect(action.evidence.length).toBeGreaterThan(30)
      expect(action.when.length).toBeGreaterThan(30)
    }
  }
})

test('official context excludes expired, stale, wrong-hazard and local products', () => {
  const now = Date.now()
  const trigger: EventTrigger = {
    ...eventTriggerSnapshot.triggers[0],
    source: 'nws',
    lifecycle: 'active',
    jurisdiction_scope: 'statewide',
    hazard_event_kind: 'hurricane',
    provenance: {
      ...eventTriggerSnapshot.triggers[0].provenance,
      source_status: 'fresh',
      fresh_until: new Date(now + 600_000).toISOString(),
      expires_at: new Date(now + 600_000).toISOString(),
    },
  } as EventTrigger
  expect(usableTrigger(trigger, 'hurricane', now)).toBe(true)
  expect(usableTrigger(trigger, 'wildfire', now)).toBe(false)
  expect(
    usableTrigger(
      { ...trigger, jurisdiction_scope: 'county' },
      'hurricane',
      now,
    ),
  ).toBe(false)
  expect(
    usableTrigger({ ...trigger, lifecycle: 'stale' }, 'hurricane', now),
  ).toBe(false)
  expect(usableTrigger(trigger, 'hurricane', now + 700_000)).toBe(false)
})

test('County coordination timeline, roll-up, reach and local unsent annex', async ({
  page,
}, testInfo) => {
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.route('**/api/v1/community/profile?*', (route) =>
    route.fulfill({
      json: {
        ...communityProfile,
        acs: {
          ...communityProfile.acs,
          languages: [
            {
              label: 'Tagalog (including Filipino)',
              variable: 'B16001_099',
              speakers: { estimate: 84, margin_of_error: 25 },
            },
            {
              label: 'Japanese',
              variable: 'B16001_078',
              speakers: { estimate: null, margin_of_error: null },
            },
          ],
        },
      },
    }),
  )
  await page.goto('/')
  await expect(page.locator('main.app')).toHaveAttribute(
    'data-hydrated',
    'true',
  )
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.getByRole('link', { name: 'Coordinate plan', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'From forecast to coordinated plan' }),
  ).toBeVisible()
  const downloadButton = page
    .getByRole('button', { name: 'Download unsent AFN annex' })
    .first()
  await expect(downloadButton).toBeEnabled()
  await expect(page.getByRole('table')).toContainText('Kalawao County')
  await expect(page.getByRole('table')).toContainText(
    'Capacity / activation unknown',
  )
  await page.getByLabel('Hazard', { exact: true }).selectOption('tsunami')
  await expect(
    page.getByText('Local tsunami: minutes or no official warning.', {
      exact: false,
    }),
  ).toBeVisible()
  await page
    .getByText('Decision point & evidence', { exact: true })
    .first()
    .click()
  await expect(
    page.getByText('County decides whether to stage or activate resources.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByText('Tagalog (including Filipino)', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('No machine translation of life-safety messages.', {
      exact: false,
    }),
  ).toBeVisible()
  await page.getByLabel('County review').selectOption('maui')
  await expect(
    page.getByRole('heading', { name: /Reach residents/ }),
  ).toContainText('Maui')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadButton.click(),
  ])
  const file = await download.path()
  expect(file).toBeTruthy()
  if (!file) throw new Error('Expected local annex download')
  const annex = JSON.parse(await readFile(file, 'utf8'))
  expect(annex.schema_version).toBe('county-afn-annex-draft.v1')
  expect(annex.status).toContain('UNSENT')
  expect(annex.purpose_and_scope.hazard).toBe('tsunami')
  expect(annex.purpose_and_scope.county).toContain('Maui')
  expect(annex.situation_and_assumptions.mode).toContain('practice')
  expect(annex.concept_of_operations).toHaveLength(3)
  expect(
    annex.resident_communications.languages[1].speakers.estimate,
  ).toBeNull()
  expect(annex.administration_and_review.operational_capacity).toContain(
    'Unknown',
  )
  expect(annex.map_and_needs.coordinates).toHaveLength(2)
  expect(annex.map_and_needs.hazard_screen).toHaveProperty('status')
  expect(browserErrors).toEqual([])
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('coordination.png'),
    fullPage: true,
  })
})

test('official context is an explicit choice and resets on hazard change', async ({
  page,
}) => {
  const now = Date.now()
  await page.route('**/api/v1/planning/event-triggers', (route) =>
    route.fulfill({
      json: {
        ...eventTriggerSnapshot,
        triggers: [
          {
            ...eventTriggerSnapshot.triggers[0],
            source: 'ptwc',
            hazard_event_kind: 'tsunami',
            title: 'Official statewide tsunami test bulletin',
            jurisdiction_scope: 'statewide',
            lifecycle: 'active',
            provenance: {
              ...eventTriggerSnapshot.triggers[0].provenance,
              product_id: 'test-tsunami-product',
              source_status: 'fresh',
              fresh_until: new Date(now + 600_000).toISOString(),
              expires_at: new Date(now + 600_000).toISOString(),
            },
          },
        ],
      },
    }),
  )
  await page.goto('/coordination')
  await page.getByLabel('Hazard', { exact: true }).selectOption('tsunami')
  await expect(page.getByLabel('Trigger context')).toHaveValue('')
  await page.getByLabel('Trigger context').selectOption('test-tsunami-product')
  await expect(page.getByRole('status').first()).toContainText(
    'Official statewide trigger context',
  )
  await page.getByLabel('Hazard', { exact: true }).selectOption('wildfire')
  await expect(page.getByLabel('Trigger context')).toHaveValue('')
  await expect(page.getByRole('status').first()).toContainText(
    'Practice scenario',
  )
})

test('source failures remain unknown and exportable without invented capacity', async ({
  page,
}) => {
  await page.route('**/api/v1/community/profile?*', (route) =>
    route.fulfill({ status: 503, json: { error: 'unavailable' } }),
  )
  await page.route('**/api/v1/planning/partner-matches?*', (route) =>
    route.fulfill({ status: 503, json: { error: 'unavailable' } }),
  )
  await page.goto('/coordination')
  await expect(
    page.getByText(
      'Public AFN profile unavailable; retry or verify source access.',
      { exact: true },
    ),
  ).toBeVisible()
  await expect(
    page.getByText('Language-specific estimates unavailable.', {
      exact: false,
    }),
  ).toBeVisible()
  await expect(page.getByRole('table')).toContainText(
    'Documented roles unknown',
  )
  await expect(
    page.getByRole('button', { name: 'Download unsent AFN annex' }).first(),
  ).toBeEnabled()
})
