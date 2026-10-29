import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  contributionState,
  evaluatePlanningEvidence,
  maxContributions,
  parseContribution,
  parseContributions,
  planningEvidencePacket,
} from '../src/lib/planning-evidence'
import type { PlanningContribution } from '../src/lib/planning-evidence'
import {
  caseStorageKey,
  createAssistancePacket,
  defaultTiming,
  emptyChecks,
  restoreCase,
  waianaeEvidenceScenario,
} from '../src/lib/waianae-case'

const now = Date.parse('2026-10-28T04:00:00.000Z')
const scenario = waianaeEvidenceScenario()
function claim(
  overrides: Partial<PlanningContribution> = {},
): PlanningContribution {
  return {
    id: 'E-test',
    scenarioId: scenario.id,
    targetId: 'vehicle-a',
    kind: 'transport',
    basis: 'reported',
    sourceRole: 'Transportation coordinator',
    observedAt: new Date(now - 60_000).toISOString(),
    validForHours: 6,
    values: { places: '2', boarding: 'yes', mobility: 'yes' },
    suppressed: false,
    ...overrides,
  }
}
function transfer(items: PlanningContribution[]) {
  return evaluatePlanningEvidence(scenario, items, now)[0]
}

test('evidence answers a controlled question without converting reported coverage into approval', () => {
  expect(transfer([]).state).toBe('missing')
  expect(transfer([claim()]).state).toBe('reported')
  expect(transfer([claim({ basis: 'assumption' })]).state).toBe('assumed')
  const packet = planningEvidencePacket(scenario, [claim()], now)
  expect(packet).toContain('Reported criteria covered')
  expect(packet).toContain('source category: Transportation coordinator')
  expect(packet).toContain('author-entered, not authenticated')
  expect(packet).toContain('not permission to move')
  expect(packet).toContain('Evidence: E-test')
})

test('unknowns remain unknown, explicit zero is a gap and counts are not added', () => {
  expect(
    transfer([
      claim({
        values: { places: 'unknown', boarding: 'yes', mobility: 'unknown' },
      }),
    ]).state,
  ).toBe('incomplete')
  expect(
    transfer([
      claim({ values: { places: '0', boarding: 'yes', mobility: 'yes' } }),
    ]).state,
  ).toBe('gap')
  const onePlace = claim({
    values: { places: '1', boarding: 'yes', mobility: 'yes' },
  })
  expect(transfer([onePlace, { ...onePlace, id: 'E-second' }]).state).toBe(
    'gap',
  )
})

test('reports conflict without silent newest-wins and assumptions cannot fill report unknowns', () => {
  const conflict = transfer([
    claim(),
    claim({
      id: 'E-newer',
      observedAt: new Date(now).toISOString(),
      values: { places: '1', boarding: 'no', mobility: 'yes' },
    }),
  ])
  expect(conflict.state).toBe('conflict')
  expect(conflict.evidenceIds).toEqual(['E-test', 'E-newer'])
  const partial = transfer([
    claim({
      values: { places: 'unknown', boarding: 'yes', mobility: 'unknown' },
    }),
    claim({ id: 'E-assumed', basis: 'assumption' }),
  ])
  expect(partial.state).toBe('incomplete')
  expect(partial.assumptionsNotUsed).toBe(1)
  expect(partial.evidenceIds).toEqual(['E-test'])
})

test('stale, future, suppressed and mismatched claims cannot satisfy criteria', () => {
  const excluded = [
    claim({
      id: 'E-stale',
      observedAt: new Date(now - 6 * 3_600_000).toISOString(),
    }),
    claim({ id: 'E-future', observedAt: new Date(now + 1).toISOString() }),
    claim({ id: 'E-suppressed', suppressed: true }),
    claim({ id: 'E-wrong-scenario', scenarioId: 'other-scenario' }),
    claim({ id: 'E-wrong-kind', kind: 'power' }),
  ]
  expect(
    excluded.map((item) => contributionState(item, scenario, now)),
  ).toEqual(['stale', 'future', 'suppressed', 'mismatched', 'mismatched'])
  expect(transfer(excluded)).toMatchObject({ state: 'missing', excluded: 5 })
  expect(
    contributionState(
      claim({ observedAt: new Date(now - 6 * 3_600_000 + 1).toISOString() }),
      scenario,
      now,
    ),
  ).toBe('current')
})

test('the model is scenario-driven and scoped to a subject, not a hard-coded person story', () => {
  const otherScenario = {
    id: 'another-exercise',
    modelRevision: 'v1',
    targets: [
      { id: 'vehicle-b', kind: 'transport' as const, label: 'Vehicle B' },
    ],
    requirements: [
      {
        id: 'group-transfer',
        targetId: 'vehicle-b',
        label: 'Group transfer',
        criteria: [
          { field: 'places', expected: 4, description: 'Four places' },
        ],
        action: 'Ask the transport coordinator.',
      },
    ],
  }
  const item = claim({ scenarioId: 'another-exercise', targetId: 'vehicle-b' })
  expect(parseContribution(item, otherScenario)).not.toBeNull()
  expect(evaluatePlanningEvidence(otherScenario, [item], now)[0].state).toBe(
    'gap',
  )
  expect(evaluatePlanningEvidence(otherScenario, [claim()], now)[0].state).toBe(
    'missing',
  )
})

test('power uses the editable transfer plus buffer and receiving support stays independent', () => {
  const power = claim({
    targetId: 'equipment-a',
    kind: 'power',
    values: { hours: '3', compatible: 'yes' },
  })
  expect(
    evaluatePlanningEvidence(waianaeEvidenceScenario(3), [power], now)[1].state,
  ).toBe('reported')
  expect(
    evaluatePlanningEvidence(waianaeEvidenceScenario(4), [power], now)[1].state,
  ).toBe('gap')
  expect(evaluatePlanningEvidence(scenario, [power], now)[2].state).toBe(
    'missing',
  )
  const site = claim({
    id: 'E-site',
    targetId: 'site-a',
    kind: 'receiving',
    values: {
      acceptance: 'yes',
      stepFree: 'yes',
      caregiver: 'unknown',
      power: 'yes',
    },
  })
  expect(evaluatePlanningEvidence(scenario, [site], now)[2].state).toBe(
    'incomplete',
  )
  const access = claim({
    targetId: 'H1',
    kind: 'access',
    values: { condition: 'no-concern' },
  })
  const packet = planningEvidencePacket(scenario, [access], now)
  expect(packet).toContain('never road clearance')
  expect(evaluatePlanningEvidence(scenario, [access], now)[4].state).toBe(
    'missing',
  )
})

test('validation rejects arbitrary data, missing provenance, invalid numbers and duplicate or excess records', () => {
  for (const change of [
    { sourceRole: '' },
    { sourceRole: 'A real person' },
    { observedAt: '' },
    { observedAt: '2026-02-31T04:00:00.000Z' },
    { validForHours: 99 },
    { basis: 'verified' },
    { targetId: 'actual-home-address' },
    {
      values: {
        places: '2',
        boarding: 'yes',
        mobility: 'yes',
        contact: 'not permitted',
      },
    },
    { values: { places: '-1', boarding: 'yes', mobility: 'yes' } },
    { values: { places: '1.5', boarding: 'yes', mobility: 'yes' } },
    { values: { places: '21', boarding: 'yes', mobility: 'yes' } },
    { values: { places: '2', boarding: 'yes' } },
  ])
    expect(parseContribution({ ...claim(), ...change }, scenario)).toBeNull()
  expect(
    parseContribution({ ...claim(), personName: 'not retained' }, scenario),
  ).toEqual(claim())
  expect(
    parseContribution(
      claim({ values: { places: '02', boarding: 'yes', mobility: 'yes' } }),
      scenario,
    )?.values.places,
  ).toBe('2')
  expect(parseContributions([claim(), claim()], scenario)).toBeNull()
  expect(
    parseContributions(
      Array.from({ length: maxContributions + 1 }, (_, index) =>
        claim({ id: `E-${index}` }),
      ),
      scenario,
    ),
  ).toBeNull()
})

test('restore migration retains old agenda but rejects corrupt contributions and invalidates expired preparation', () => {
  const checks = { ...emptyChecks, transportation: true }
  expect(restoreCase({ timing: defaultTiming, checks }, now)?.checks).toEqual(
    checks,
  )
  expect(
    restoreCase({ timing: defaultTiming, checks, contributions: [{}] }, now),
  ).toBeNull()
  const state = {
    timing: defaultTiming,
    checks,
    contributions: [claim()],
    assessedAt: new Date(now).toISOString(),
  }
  expect(restoreCase(state, now)?.checks).toEqual(checks)
  expect(restoreCase(state, now + 6 * 3_600_000)?.checks).toEqual(emptyChecks)
  const packet = createAssistancePacket({
    ...state,
    evidence: 'Snapshot',
    partners: 'Unknown',
    now,
  })
  expect(packet).toContain('Local planning evidence')
  expect(packet).toContain('E-test')
  expect(packet).toContain('Reported criteria covered')
  expect(packet).toContain('NOT SENT')
})

async function openEditor(page: Page) {
  const summary = page.getByText('Add a local planning claim', { exact: true })
  const details = page.locator('.evidence-editor')
  if (!((await details.getAttribute('open')) !== null)) await summary.click()
}
async function enterTransport(page: Page, places: string) {
  await openEditor(page)
  await page.getByLabel('Claim basis', { exact: true }).selectOption('reported')
  await page
    .getByLabel('Source category (author-entered)', { exact: true })
    .selectOption('Transportation coordinator')
  await page
    .getByLabel('Passenger places (not vehicles)', { exact: true })
    .fill(places)
  await page
    .getByLabel('Assisted step-free boarding', { exact: true })
    .selectOption('yes')
  await page
    .getByLabel('Mobility-device space', { exact: true })
    .selectOption('yes')
  await page
    .getByRole('button', { name: 'Save local claim', exact: true })
    .click()
}

test.describe('Local evidence workflow', () => {
  test('keyboard entry, power-window changes and receiving acceptance feed the same County review', async ({
    page,
  }) => {
    await page.goto('/waianae')
    await page
      .getByRole('button', { name: 'Detailed workspace', exact: true })
      .click()
    await page.getByRole('tab', { name: 'Before arrival', exact: true }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(
      page.getByRole('tab', { name: 'Planning evidence' }),
    ).toBeFocused()
    await page.getByText('Add a local planning claim', { exact: true }).focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Tab')
    await expect(
      page.getByLabel('Planning subject', { exact: true }),
    ).toBeFocused()
    await page
      .getByLabel('Planning subject', { exact: true })
      .selectOption('equipment-a')
    await page
      .getByLabel('Claim basis', { exact: true })
      .selectOption('reported')
    await page
      .getByLabel('Source category (author-entered)', { exact: true })
      .selectOption('Health / medical coordinator')
    await page
      .getByLabel('Backup runtime (whole hours)', { exact: true })
      .fill('-1')
    await page
      .getByRole('button', { name: 'Save local claim', exact: true })
      .click()
    await expect(
      page.getByLabel('Backup runtime (whole hours)', { exact: true }),
    ).toHaveAttribute('aria-invalid', 'true')
    await page
      .getByLabel('Backup runtime (whole hours)', { exact: true })
      .fill('3')
    await page
      .getByLabel('Equipment-specific compatibility assessed', { exact: true })
      .selectOption('yes')
    await page
      .locator('.evidence-editor')
      .evaluate((element) => element.scrollIntoView({ block: 'start' }))
    await page.screenshot({
      path: test.info().outputPath('planning-evidence-editor.png'),
    })
    await page
      .getByRole('button', { name: 'Save local claim', exact: true })
      .click()
    await expect(page.getByTestId('insight-power-continuity')).toHaveAttribute(
      'data-state',
      'reported',
    )
    await page.getByRole('tab', { name: 'County request', exact: true }).click()
    await page.getByRole('checkbox', { name: /^Medical/ }).check()
    await page.getByRole('tab', { name: 'Before arrival', exact: true }).click()
    await page
      .getByLabel('Assumed transfer and travel (hours)', { exact: true })
      .fill('2')
    await page
      .getByRole('tab', { name: 'Planning evidence', exact: true })
      .click()
    await expect(page.getByTestId('insight-power-continuity')).toHaveAttribute(
      'data-state',
      'gap',
    )
    await expect(
      page.getByText('0/5 questions prepared', { exact: false }),
    ).toBeVisible()
    await openEditor(page)
    await page
      .getByLabel('Planning subject', { exact: true })
      .selectOption('site-a')
    await page
      .getByLabel('Claim basis', { exact: true })
      .selectOption('reported')
    await page
      .getByLabel('Source category (author-entered)', { exact: true })
      .selectOption('Mass-care coordinator')
    for (const label of [
      'Acceptance reported',
      'Step-free access',
      'Caregiver accompaniment',
      'Equipment power support',
    ])
      await page
        .getByLabel(label, { exact: true })
        .selectOption(label === 'Acceptance reported' ? 'no' : 'yes')
    await page
      .getByRole('button', { name: 'Save local claim', exact: true })
      .click()
    await expect(page.getByTestId('insight-receiving-support')).toHaveAttribute(
      'data-state',
      'gap',
    )
    await page.getByRole('tab', { name: 'Before arrival', exact: true }).click()
    await page
      .getByLabel('Assumed storm arrival (hours from now)', { exact: true })
      .fill('')
    await page
      .getByRole('tab', { name: 'Planning evidence', exact: true })
      .click()
    await expect(page.getByRole('alert')).toContainText(
      'Evidence analysis is withheld',
    )
    await expect(
      page.getByRole('button', { name: 'Download request for review' }),
    ).toBeDisabled()
  })

  test('entry changes insights, contradictions persist, set-aside restores reported coverage and packet agrees', async ({
    page,
  }, testInfo) => {
    await page.goto('/waianae')
    await page
      .getByRole('button', { name: 'Detailed workspace', exact: true })
      .click()
    await page.getByRole('tab', { name: 'Planning evidence' }).click()
    const insight = page.getByTestId('insight-assisted-transfer')
    await expect(insight).toHaveAttribute('data-state', 'missing')
    await enterTransport(page, '1')
    await expect(insight).toHaveAttribute('data-state', 'gap')
    await page.getByRole('tab', { name: 'County request' }).click()
    await page.getByRole('checkbox', { name: /^Transportation/ }).check()
    await page.getByRole('tab', { name: 'Planning evidence' }).click()
    await enterTransport(page, '2')
    await expect(insight).toHaveAttribute('data-state', 'conflict')
    await expect(
      page.getByText('0/5 questions prepared', { exact: false }),
    ).toBeVisible()
    await page
      .getByText(`Local claim register · 2/${maxContributions}`, {
        exact: true,
      })
      .click()
    await page
      .getByTestId('evidence-claim')
      .first()
      .getByRole('button', { name: /^Set aside/ })
      .click()
    await expect(insight).toHaveAttribute('data-state', 'reported')
    const id = await page
      .getByTestId('evidence-claim')
      .nth(1)
      .locator('strong')
      .first()
      .textContent()
    await page.reload()
    await page
      .getByRole('button', { name: 'Detailed workspace', exact: true })
      .click()
    await page.getByRole('tab', { name: 'Planning evidence' }).click()
    await expect(insight).toHaveAttribute('data-state', 'reported')
    await expect(page.getByTestId('case-map')).toHaveAttribute(
      'data-map-ready',
      'true',
    )
    await page
      .getByRole('tablist')
      .evaluate((element) => element.scrollIntoView({ block: 'start' }))
    await page.screenshot({
      path: testInfo.outputPath('planning-evidence-review.png'),
    })
    const downloading = page.waitForEvent('download')
    await page
      .getByRole('button', { name: 'Download request for review' })
      .click()
    const packet = await readFile(await (await downloading).path(), 'utf8')
    expect(packet).toContain('Reported criteria covered')
    expect(packet).toContain('suppressed')
    expect(packet).toContain(id!.split(' · ')[0])
    expect(packet).toContain('County next question:')
    const stored = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      caseStorageKey,
    )
    expect(stored.contributions).toHaveLength(2)
    expect(stored.contributions[0].suppressed).toBe(true)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  })

  test('controlled validation, unknown data, editing and access reports update the real map without closure claims', async ({
    page,
  }, testInfo) => {
    await page.goto('/waianae')
    await page
      .getByRole('button', { name: 'Detailed workspace', exact: true })
      .click()
    await page.getByRole('tab', { name: 'Planning evidence' }).click()
    await openEditor(page)
    await page
      .getByRole('button', { name: 'Save local claim', exact: true })
      .click()
    await expect(page.getByRole('alert')).toContainText(
      'Resolve the report errors',
    )
    await expect(
      page.getByLabel('Source category (author-entered)', { exact: true }),
    ).toHaveAttribute('aria-invalid', 'true')
    await page
      .getByLabel('Source category (author-entered)', { exact: true })
      .selectOption('Field / community liaison')
    await page
      .getByLabel('Planning subject', { exact: true })
      .selectOption('H1')
    await page
      .getByLabel('Claim basis', { exact: true })
      .selectOption('reported')
    await page
      .getByLabel('Reported observation (not road clearance)', { exact: true })
      .selectOption('concern')
    await page
      .getByRole('button', { name: 'Save local claim', exact: true })
      .click()
    await expect(page.getByTestId('insight-access-H1')).toHaveAttribute(
      'data-state',
      'gap',
    )
    await expect(page.getByTestId('insight-access-H2')).toHaveAttribute(
      'data-state',
      'missing',
    )
    await expect(page.getByTestId('case-local-map-evidence')).toContainText(
      'H1: 1 reported, 0 assumed',
    )
    await expect(
      page.getByLabel('H1: hypothetical access concern'),
    ).toHaveAttribute('data-local-claims', '1')
    await expect(
      page.getByLabel('H1: hypothetical access concern'),
    ).toHaveClass(/case-disruption-focused/)
    const attribution = await page
      .locator('.case-interactive-map .maplibregl-ctrl-attrib')
      .boundingBox()
    expect(attribution).not.toBeNull()
    for (const id of ['H1', 'H2']) {
      const marker = await page
        .getByLabel(`${id}: hypothetical access concern`)
        .boundingBox()
      expect(marker).not.toBeNull()
      expect(
        attribution!.x + attribution!.width <= marker!.x ||
          attribution!.x >= marker!.x + marker!.width ||
          attribution!.y + attribution!.height <= marker!.y ||
          attribution!.y >= marker!.y + marker!.height,
        JSON.stringify({ id, attribution, marker }),
      ).toBe(true)
    }
    await page
      .getByTestId('case-local-map-evidence')
      .evaluate((element) => element.scrollIntoView({ block: 'start' }))
    await page.screenshot({
      path: testInfo.outputPath('planning-evidence-map.png'),
    })
    await page
      .getByRole('checkbox', { name: 'Hypothetical access concerns' })
      .uncheck()
    await expect(page.getByTestId('case-local-map-evidence')).toContainText(
      'markers are hidden',
    )
    await page
      .getByRole('checkbox', { name: 'Hypothetical access concerns' })
      .check()
    await page
      .getByText(`Local claim register · 1/${maxContributions}`, {
        exact: true,
      })
      .click()
    await page
      .getByTestId('evidence-claim')
      .getByRole('button', { name: /^Edit/ })
      .click()
    await page
      .getByLabel('Reported observation (not road clearance)', { exact: true })
      .selectOption('unknown')
    await page.getByRole('button', { name: 'Update local claim' }).click()
    await expect(page.getByTestId('insight-access-H1')).toHaveAttribute(
      'data-state',
      'incomplete',
    )
    await page
      .getByTestId('evidence-claim')
      .getByRole('button', { name: /^Edit/ })
      .click()
    await page
      .getByTestId('evidence-claim')
      .getByRole('button', { name: /^Remove/ })
      .click()
    await expect(page.getByTestId('insight-access-H1')).toHaveAttribute(
      'data-state',
      'missing',
    )
    await expect(page.getByTestId('case-local-map-evidence')).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Update local claim' }),
    ).toHaveCount(0)
  })

  test('expiry invalidates preparation live and after reload; stale reports remain visible but excluded', async ({
    page,
  }) => {
    await page.clock.install({ time: now })
    await page.addInitScript(
      ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
      {
        key: caseStorageKey,
        value: {
          timing: defaultTiming,
          checks: { ...emptyChecks, medical: true },
          contributions: [
            claim({
              observedAt: new Date(now - 3_600_000 + 5000).toISOString(),
              validForHours: 1,
            }),
          ],
          assessedAt: new Date(now).toISOString(),
        },
      },
    )
    await page.goto('/waianae')
    await page
      .getByRole('button', { name: 'Detailed workspace', exact: true })
      .click()
    await page.getByRole('tab', { name: 'Planning evidence' }).click()
    await expect(page.getByTestId('insight-assisted-transfer')).toHaveAttribute(
      'data-state',
      'reported',
    )
    await expect(
      page.getByText('1/5 questions prepared', { exact: false }),
    ).toBeVisible()
    await page.clock.fastForward(6000)
    await expect(page.getByTestId('insight-assisted-transfer')).toHaveAttribute(
      'data-state',
      'missing',
    )
    await expect(
      page.getByText('0/5 questions prepared', { exact: false }),
    ).toBeVisible()
    await expect(page.getByRole('status')).toContainText('freshness changed')
    await page.reload()
    await page
      .getByRole('button', { name: 'Detailed workspace', exact: true })
      .click()
    await page.getByRole('tab', { name: 'County request' }).click()
    await expect(
      page.getByRole('checkbox', { name: /^Medical/ }),
    ).not.toBeChecked()
  })

  test('invalid saved claims are disclosed and not overwritten; storage failures preserve in-memory analysis and export', async ({
    page,
  }) => {
    await page.addInitScript(
      (key) =>
        localStorage.setItem(
          key,
          JSON.stringify({
            timing: {
              arrival: '24',
              accessLoss: '6',
              mobilise: '2',
              travel: '1',
              buffer: '2',
            },
            checks: {
              communication: false,
              medical: false,
              independence: false,
              safety: false,
              transportation: false,
            },
            contributions: [
              { personName: 'invalid field, not a supported record' },
            ],
          }),
        ),
      caseStorageKey,
    )
    await page.goto('/waianae')
    await page
      .getByRole('button', { name: 'Detailed workspace', exact: true })
      .click()
    await expect(page.getByRole('alert')).toContainText('could not be restored')
    expect(
      await page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key)!).contributions[0].personName,
        caseStorageKey,
      ),
    ).toBeTruthy()
    await page
      .getByRole('button', {
        name: 'Save current exercise instead of unreadable state',
      })
      .click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('blocked', 'QuotaExceededError')
      }
    })
    await page.getByRole('tab', { name: 'Planning evidence' }).click()
    await enterTransport(page, '2')
    await expect(page.getByTestId('insight-assisted-transfer')).toHaveAttribute(
      'data-state',
      'reported',
    )
    await expect(page.getByRole('alert')).toContainText('could not be saved')
    const downloading = page.waitForEvent('download')
    await page
      .getByRole('button', { name: 'Download request for review' })
      .click()
    const packet = await readFile(await (await downloading).path(), 'utf8')
    expect(packet).toContain('Reported criteria covered')
    expect(packet).toContain('NOT SENT')
  })
})
