import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  exportEvidenceBundle,
  maxEvidenceBundleBytes,
  previewEvidenceBundle,
} from '../src/lib/evidence-bundle'
import {
  contributionState,
  evaluatePlanningEvidence,
  planningEvidencePacket,
} from '../src/lib/planning-evidence'
import type { PlanningContribution } from '../src/lib/planning-evidence'
import {
  caseStorageKey,
  defaultTiming,
  emptyChecks,
  waianaeEvidenceScenario,
} from '../src/lib/waianae-case'

const scenario = waianaeEvidenceScenario()
const now = Date.parse('2026-10-28T04:00:00.000Z')
function claim(
  overrides: Partial<PlanningContribution> = {},
): PlanningContribution {
  return {
    id: 'E-00000001',
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
function envelope(contributions: unknown = [claim()]) {
  return {
    schema: 'local-planning-evidence.v1',
    scenarioId: scenario.id,
    modelRevision: scenario.modelRevision,
    contributions,
  }
}
function malformedBundles() {
  const valid = envelope()
  return [
    '',
    '{}',
    'null',
    '[]',
    JSON.stringify(valid) + '{}',
    JSON.stringify({ ...valid, schema: 'local-planning-evidence.v2' }),
    JSON.stringify({ ...valid, scenarioId: 'another-exercise' }),
    JSON.stringify({ ...valid, modelRevision: 'old-revision' }),
    JSON.stringify({ ...valid, sourceURL: 'https://example.com' }),
    JSON.stringify({ ...valid, attachments: [] }),
    JSON.stringify({ ...valid, contact: 'private@example.com' }),
    JSON.stringify({
      timing: defaultTiming,
      checks: emptyChecks,
      contributions: [claim()],
    }),
    JSON.stringify(envelope([])),
    JSON.stringify(envelope([claim(), claim()])),
    JSON.stringify(
      envelope(
        Array.from({ length: 33 }, (_, index) =>
          claim({ id: `E-${index.toString(16).padStart(8, '0')}` }),
        ),
      ),
    ),
    ...[
      { sourceRole: 'A named resident' },
      { id: 'E-private-person' },
      { sourceRole: 'https://example.com' },
      { sourceURL: 'https://example.com' },
      { personName: 'not permitted' },
      { targetId: 'actual-home-address' },
      { scenarioId: 'another-exercise' },
      { kind: 'other' },
      { basis: 'verified' },
      { observedAt: '2026-02-31T04:00:00.000Z' },
      { observedAt: '2026-10-28' },
      { validForHours: 99 },
      { suppressed: 'false' },
      { values: { places: '21', boarding: 'yes', mobility: 'yes' } },
      { values: { places: '1.5', boarding: 'yes', mobility: 'yes' } },
      { values: { places: '-1', boarding: 'yes', mobility: 'yes' } },
      {
        values: {
          places: '2',
          boarding: 'yes',
          mobility: 'yes',
          address: 'not permitted',
        },
      },
      {
        values: {
          places: '2',
          boarding: 'yes',
          mobility: 'https://example.com',
        },
      },
      { values: { places: '2', boarding: 'yes' } },
    ].map((change) => JSON.stringify(envelope([{ ...claim(), ...change }]))),
    JSON.stringify(valid).replace(
      '"schema":',
      '"schema":"hidden payload","schema":',
    ),
    JSON.stringify(valid).replace(
      '"places":"2"',
      '"places":"private payload","pl\\u0061ces":"2"',
    ),
    ' '.repeat(maxEvidenceBundleBytes) + JSON.stringify(valid),
  ]
}

test('portable bundle has only the versioned scenario-bound controlled manifest and claims', () => {
  const rows = [claim()]
  const text = exportEvidenceBundle(scenario, rows)
  expect(JSON.parse(text)).toEqual(envelope(rows))
  const preview = previewEvidenceBundle(text, scenario, [])
  expect(preview).toEqual({
    incoming: rows,
    additions: rows,
    duplicates: 0,
    merged: rows,
  })
  expect(evaluatePlanningEvidence(scenario, preview.merged, now)[0].state).toBe(
    'reported',
  )
  expect(() =>
    previewEvidenceBundle(text, waianaeEvidenceScenario(4), []),
  ).toThrow('Scenario or model revision differs')
  expect(() =>
    previewEvidenceBundle(
      text,
      { ...scenario, modelRevision: 'afn-v2-transfer-3h' },
      [],
    ),
  ).toThrow('Scenario or model revision differs')
  expect(() => exportEvidenceBundle(scenario, [])).toThrow('1–32')
  expect(() =>
    exportEvidenceBundle(scenario, [
      claim({ values: { places: 'bad', boarding: 'yes', mobility: 'yes' } }),
    ]),
  ).toThrow('Invalid claims')
})

test('strict bundle parsing rejects every malformed payload without modifying the working set', () => {
  const current = [claim({ id: 'E-000000ff' })]
  const snapshot = structuredClone(current)
  for (const text of malformedBundles()) {
    expect(() => previewEvidenceBundle(text, scenario, current)).toThrow(
      'No claims changed.',
    )
    expect(current).toEqual(snapshot)
  }
  const text = JSON.stringify(envelope())
  expect(
    previewEvidenceBundle(text.padEnd(maxEvidenceBundleBytes), scenario, [])
      .additions,
  ).toHaveLength(1)
  expect(() =>
    previewEvidenceBundle(
      text.padEnd(maxEvidenceBundleBytes + 1),
      scenario,
      [],
    ),
  ).toThrow('128 KiB')
  const multiByte = 'é'.repeat(maxEvidenceBundleBytes / 2)
  expect(() => previewEvidenceBundle(multiByte + text, scenario, [])).toThrow(
    '128 KiB',
  )
})

test('canonical repeat import is idempotent and any ID collision rejects the entire merge', () => {
  const current = [claim()]
  const reordered = {
    ...claim(),
    values: { mobility: 'yes', boarding: 'yes', places: '02' },
  }
  const repeated = previewEvidenceBundle(
    JSON.stringify(envelope([reordered])),
    scenario,
    current,
  )
  expect(repeated).toMatchObject({
    additions: [],
    duplicates: 1,
    merged: current,
  })
  const next = claim({ id: 'E-00000002' })
  const collision = { ...claim(), values: { ...claim().values, places: '1' } }
  expect(() =>
    previewEvidenceBundle(
      JSON.stringify(envelope([next, collision])),
      scenario,
      current,
    ),
  ).toThrow('Conflicting duplicate ID E-00000001')
  expect(current).toEqual([claim()])
  const conflicting = previewEvidenceBundle(
    exportEvidenceBundle(scenario, [{ ...collision, id: 'E-00000002' }]),
    scenario,
    current,
  )
  expect(
    evaluatePlanningEvidence(scenario, conflicting.merged, now)[0].state,
  ).toBe('conflict')
  expect(planningEvidencePacket(scenario, conflicting.merged, now)).toContain(
    'Evidence: E-00000001, E-00000002',
  )
})

test('bundle and combined limits allow exactly 32 and never partially merge', () => {
  const rows = Array.from({ length: 32 }, (_, index) =>
    claim({ id: `E-${index.toString(16).padStart(8, '0')}` }),
  )
  expect(
    previewEvidenceBundle(exportEvidenceBundle(scenario, rows), scenario, [])
      .merged,
  ).toHaveLength(32)
  expect(
    previewEvidenceBundle(exportEvidenceBundle(scenario, rows), scenario, rows)
      .duplicates,
  ).toBe(32)
  expect(() =>
    previewEvidenceBundle(
      exportEvidenceBundle(scenario, [claim({ id: 'E-ffffffff' })]),
      scenario,
      rows,
    ),
  ).toThrow('Combined claims exceed 32')
  expect(rows).toHaveLength(32)
})

test('exchange preserves provenance, unknown, zero, basis, suppression and observation-based freshness', () => {
  const rows = [
    claim({
      id: 'E-00000001',
      observedAt: new Date(now - 6 * 3_600_000).toISOString(),
    }),
    claim({ id: 'E-00000002', observedAt: new Date(now + 1).toISOString() }),
    claim({ id: 'E-00000003', suppressed: true }),
    claim({
      id: 'E-00000004',
      basis: 'assumption',
      values: { places: '0', boarding: 'unknown', mobility: 'yes' },
    }),
  ]
  const result = previewEvidenceBundle(
    exportEvidenceBundle(scenario, rows),
    scenario,
    [],
  )
  expect(result.merged).toEqual(rows)
  expect(
    result.merged.map((row) => contributionState(row, scenario, now)),
  ).toEqual(['stale', 'future', 'suppressed', 'current'])
  expect(
    evaluatePlanningEvidence(scenario, result.merged, now)[0],
  ).toMatchObject({ state: 'gap', excluded: 3, evidenceIds: ['E-00000004'] })
})

async function seed(page: Page, contributions: PlanningContribution[] = []) {
  await page.addInitScript(
    ({ key, state }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(state))
    },
    {
      key: caseStorageKey,
      state: {
        timing: defaultTiming,
        checks: { ...emptyChecks, transportation: true },
        contributions,
        assessedAt: new Date().toISOString(),
      },
    },
  )
}
async function workingSet(page: Page) {
  return page.evaluate((key) => {
    const stored = JSON.parse(localStorage.getItem(key)!)
    return { contributions: stored.contributions, checks: stored.checks }
  }, caseStorageKey)
}
async function openExchange(page: Page) {
  await page.goto('/waianae')
  await page
    .getByRole('tab', { name: 'Planning evidence', exact: true })
    .click()
  await page
    .getByText('Exchange local evidence bundles', { exact: true })
    .focus()
  await page.keyboard.press('Enter')
}
async function chooseBundle(page: Page, text: string | Buffer) {
  if ((await page.locator('.evidence-exchange').getAttribute('open')) === null)
    await page
      .getByText('Exchange local evidence bundles', { exact: true })
      .click()
  await page
    .getByLabel('Import evidence bundle for review', { exact: true })
    .setInputFiles({
      name: 'evidence.json',
      mimeType: 'application/json',
      buffer: typeof text === 'string' ? Buffer.from(text) : text,
    })
}

test.describe('Portable evidence workflow', () => {
  test('keyboard preview is read-only, explicit apply changes County questions and current exports match', async ({
    page,
  }, testInfo) => {
    await seed(page)
    await openExchange(page)
    const initial = await workingSet(page)
    const rows = [
      claim({ observedAt: new Date(Date.now() - 60_000).toISOString() }),
    ]
    const text = exportEvidenceBundle(scenario, rows)
    const file = page.getByLabel('Import evidence bundle for review', {
      exact: true,
    })
    await file.focus()
    const chooser = page.waitForEvent('filechooser')
    await page.keyboard.press('Enter')
    await (
      await chooser
    ).setFiles({
      name: 'evidence.json',
      mimeType: 'application/json',
      buffer: Buffer.from(text),
    })
    const preview = page.getByRole('region', {
      name: 'Evidence import preview',
    })
    await expect(preview).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Review before applying' }),
    ).toBeFocused()
    await expect(preview).toContainText('1 new claims')
    await expect(preview).toContainText(
      'Missing evidence → Reported criteria covered',
    )
    expect(await workingSet(page)).toEqual(initial)
    await expect(page.getByTestId('insight-assisted-transfer')).toHaveAttribute(
      'data-state',
      'missing',
    )
    await preview.evaluate((element) =>
      element.scrollIntoView({ block: 'start' }),
    )
    await page.screenshot({
      path: testInfo.outputPath('evidence-bundle-preview.png'),
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.keyboard.press('Tab')
    await expect(
      page.getByRole('button', { name: 'Confirm bundle import' }),
    ).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(preview).not.toBeVisible()
    await expect(file).toBeFocused()
    await expect(page.getByTestId('insight-assisted-transfer')).toHaveAttribute(
      'data-state',
      'reported',
    )
    await expect(
      page.getByText('0/5 questions prepared', { exact: false }),
    ).toBeVisible()
    expect(await workingSet(page)).toEqual({
      contributions: rows,
      checks: emptyChecks,
    })

    const jsonDownload = page.waitForEvent('download')
    await page
      .getByRole('button', { name: 'Export evidence bundle', exact: true })
      .click()
    const exported = await readFile(await (await jsonDownload).path(), 'utf8')
    expect(JSON.parse(exported)).toEqual(envelope(rows))
    await expect(page.getByTestId('case-map')).toHaveAttribute(
      'data-map-ready',
      'true',
    )
    const mdDownload = page.waitForEvent('download')
    await page
      .getByRole('button', { name: 'Download request for review', exact: true })
      .click()
    const packet = await readFile(await (await mdDownload).path(), 'utf8')
    expect(packet).toContain(
      planningEvidencePacket(
        scenario,
        rows,
        Date.parse(packet.match(/Evaluated at ([^.]+\.\d{3}Z)/)![1]),
      ),
    )
    expect(packet).toContain('author-entered, not authenticated')
    expect(packet).toContain('Evidence: E-00000001')
    expect(packet).toContain('NOT SENT')

    await page.getByRole('tab', { name: 'County request', exact: true }).click()
    await page.getByRole('checkbox', { name: /^Transportation/ }).check()
    await page
      .getByRole('tab', { name: 'Planning evidence', exact: true })
      .click()
    const prepared = await workingSet(page)
    await chooseBundle(page, exported)
    await expect(preview).toContainText('0 new claims')
    await expect(preview).toContainText('1 exact duplicates skipped')
    await page.getByRole('button', { name: 'Confirm bundle import' }).click()
    expect(await workingSet(page)).toEqual(prepared)

    await chooseBundle(
      page,
      exportEvidenceBundle(scenario, [
        claim({
          id: 'E-00000002',
          observedAt: rows[0].observedAt,
          values: { places: '1', boarding: 'yes', mobility: 'yes' },
        }),
      ]),
    )
    await expect(preview).toContainText(
      'Reported criteria covered → Conflicting claims',
    )
    expect(await workingSet(page)).toEqual(prepared)
    await page.getByRole('button', { name: 'Confirm bundle import' }).click()
    await expect(page.getByTestId('insight-assisted-transfer')).toHaveAttribute(
      'data-state',
      'conflict',
    )
    expect((await workingSet(page)).contributions).toHaveLength(2)
    await expect(
      page.getByRole('status').filter({ hasText: '1 new claims applied' }),
    ).toBeVisible()
    const persisted = await workingSet(page)
    await page.reload()
    await page
      .getByRole('tab', { name: 'Planning evidence', exact: true })
      .click()
    await expect(page.getByTestId('insight-assisted-transfer')).toHaveAttribute(
      'data-state',
      'conflict',
    )
    expect(await workingSet(page)).toEqual(persisted)
  })

  test('bad files, collisions and cancellations fail closed with no partial writes or preparation reset', async ({
    page,
  }) => {
    const existing = claim({
      observedAt: new Date(Date.now() - 60_000).toISOString(),
    })
    await seed(page, [existing])
    await openExchange(page)
    const initial = await workingSet(page)
    const bad = [
      ...malformedBundles(),
      JSON.stringify(
        envelope([
          claim({ id: 'E-00000002' }),
          { ...existing, suppressed: true },
        ]),
      ),
      Buffer.from([0xff, 0xfe, 0x7b]),
    ]
    for (const text of bad) {
      await chooseBundle(page, text)
      await expect(
        page.locator('.evidence-exchange').getByRole('alert'),
      ).toContainText('No claims changed.')
      await expect(
        page.getByRole('region', { name: 'Evidence import preview' }),
      ).not.toBeVisible()
      expect(await workingSet(page)).toEqual(initial)
      await expect(
        page.getByTestId('insight-assisted-transfer'),
      ).toHaveAttribute('data-state', 'reported')
    }
    await chooseBundle(
      page,
      exportEvidenceBundle(scenario, [claim({ id: 'E-00000002' })]),
    )
    await expect(
      page.getByRole('region', { name: 'Evidence import preview' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Cancel import' }).click()
    expect(await workingSet(page)).toEqual(initial)
    await expect(
      page.getByLabel('Import evidence bundle for review'),
    ).toBeFocused()
    await page.reload()
    await page
      .getByRole('tab', { name: 'Planning evidence', exact: true })
      .click()
    expect(await workingSet(page)).toEqual(initial)
  })

  test('confirmation rejects changed working evidence and changed scenario timing', async ({
    page,
  }) => {
    await seed(page)
    await openExchange(page)
    const text = exportEvidenceBundle(scenario, [claim()])
    await chooseBundle(page, text)
    await expect(
      page.getByRole('region', { name: 'Evidence import preview' }),
    ).toBeVisible()
    await page.getByText('Add a local planning claim', { exact: true }).click()
    await page
      .getByLabel('Source category (author-entered)', { exact: true })
      .selectOption('Exercise facilitator')
    await page
      .getByRole('button', { name: 'Save local claim', exact: true })
      .click()
    const changed = await workingSet(page)
    await page.getByRole('button', { name: 'Confirm bundle import' }).click()
    await expect(
      page.locator('.evidence-exchange').getByRole('alert'),
    ).toContainText('Working evidence or timing changed')
    expect(await workingSet(page)).toEqual(changed)
    await page.getByRole('tab', { name: 'Before arrival', exact: true }).click()
    await page
      .getByLabel('Assumed transfer and travel (hours)', { exact: true })
      .fill('2')
    await page
      .getByRole('tab', { name: 'Planning evidence', exact: true })
      .click()
    await page
      .getByText('Exchange local evidence bundles', { exact: true })
      .click()
    await chooseBundle(page, text)
    await expect(
      page.locator('.evidence-exchange').getByRole('alert'),
    ).toContainText('Scenario or model revision differs')
    expect((await workingSet(page)).contributions).toEqual(
      changed.contributions,
    )
  })

  test('reading errors are visible and a superseded file read cannot create a stale preview', async ({
    page,
  }) => {
    await seed(page)
    await openExchange(page)
    const initial = await workingSet(page)
    await page.evaluate(() => {
      File.prototype.arrayBuffer = () =>
        Promise.reject(new Error('synthetic read failure'))
    })
    await chooseBundle(page, exportEvidenceBundle(scenario, [claim()]))
    await expect(
      page.locator('.evidence-exchange').getByRole('alert'),
    ).toContainText('Could not read the file')
    expect(await workingSet(page)).toEqual(initial)
    await page.evaluate(() => {
      File.prototype.arrayBuffer = function () {
        return new Promise((resolve) => {
          window.setTimeout(
            async () => resolve(await new Response(this).arrayBuffer()),
            300,
          )
        })
      }
    })
    await chooseBundle(page, exportEvidenceBundle(scenario, [claim()]))
    await chooseBundle(page, 'invalid')
    await expect(
      page.locator('.evidence-exchange').getByRole('alert'),
    ).toContainText('single valid JSON')
    await expect(
      page.getByRole('region', { name: 'Evidence import preview' }),
    ).not.toBeVisible()
    expect(await workingSet(page)).toEqual(initial)
  })
})
