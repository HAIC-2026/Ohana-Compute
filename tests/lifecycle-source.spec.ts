import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type {
  LifecycleAction,
  LifecycleState,
} from '../src/lib/practice-lifecycle'
import {
  applyLifecycleAction,
  createInitialLifecycleState,
} from '../src/lib/practice-lifecycle'
import { parseLifecycleEvidence } from '../src/lib/lifecycle-evidence'
import {
  displayedSource,
  sourceSnapshot,
  sourceTestTime,
} from './fixtures/lifecycle-source'

const capability = (page: Page, id: string) =>
  page.locator(`[data-capability="${id}"]`)
const saved = (page: Page): Promise<LifecycleState> =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem('practice-lifecycle.v5') ?? '{}'),
  )
const openAllCapabilityDetails = async (page: Page) => {
  await expect(page.locator('[data-lifecycle-restored]')).toHaveAttribute(
    'data-lifecycle-restored',
    'true',
  )
  await page
    .locator('.lifecycle-capability-details')
    .evaluateAll((details) =>
      details.forEach((detail) => ((detail as HTMLDetailsElement).open = true)),
    )
}
const authority = (state: LifecycleState) => ({
  event: state.event,
  timing: state.timing,
  evidence: state.evidence,
  supportItems: state.supportItems,
  serviceRecords: state.serviceRecords,
  objectiveReview: state.objectiveReview,
  gateDecision: state.gateDecision,
  markers: state.capabilityMarkers,
})

test('real backend source chain captures A, reports A-prime, and rechecks without authority', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000)
  let scenario = 'baseline'
  const writes: string[] = []
  page.on('request', (request) => {
    if (
      request.url().includes('/api/') &&
      request.method() !== 'GET' &&
      request.method() !== 'OPTIONS' &&
      !request.url().includes('/telemetry/')
    )
      writes.push(request.url())
  })
  // Continue the real request; only the repository E2E server understands this fixture header.
  await page.route('**/api/v1/lifecycle/evidence?**', (route) =>
    route.continue({
      headers: {
        ...route.request().headers(),
        'X-Lifecycle-Fixture': scenario,
      },
    }),
  )
  const initialResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/lifecycle/evidence?') &&
      response.status() === 200,
  )
  await page.goto('/lifecycle')
  await openAllCapabilityDetails(page)
  const initial = parseLifecycleEvidence(await (await initialResponse).json())
  expect(initial.shelter_context.items[0].item_id).toBe('fixture-live-shelter')
  await expect(page.locator('[data-lifecycle-restored]')).toHaveAttribute(
    'data-lifecycle-restored',
    'true',
  )
  const panel = page.getByRole('region', { name: 'Live lifecycle evidence' })
  const shelters = page.getByRole('region', {
    name: 'FEMA-reported shelter context',
  })
  const accepts = page.getByRole('region', {
    name: 'Attach public source context',
  })
  const checks = page.getByRole('region', { name: 'Accepted source rechecks' })
  const refresh = async (next: string) => {
    scenario = next
    const response = page.waitForResponse((item) =>
      item.url().includes('/api/v1/lifecycle/evidence?'),
    )
    await panel.getByRole('button', { name: 'Refresh', exact: true }).click()
    await response
    await expect(panel.getByText('Refreshing public evidence…')).toHaveCount(0)
  }
  await expect(shelters).toContainText('Fixture reported open shelter')
  await expect(shelters).toContainText('Source observation time: unknown')
  await capability(page, 'B02').getByRole('button').first().click()
  await accepts
    .getByRole('button', {
      name: 'Review report Fixture reported open shelter',
    })
    .click()
  const authorityBeforeAcceptance = authority(await saved(page))
  await refresh('changed')
  await expect(shelters).toContainText('Fixture revised shelter report')
  await expect(shelters).toContainText('CLOSED')
  await expect(accepts.locator('[data-reviewed-source]')).toContainText(
    'Fixture reported open shelter',
  )
  await accepts
    .getByRole('button', { name: 'Accept displayed source claim' })
    .click()
  await expect(accepts.locator('[data-accepted-source]')).toHaveCount(1)
  const accepted = (await saved(page)).sourceEvidence
  expect(accepted[0].displayed.claim?.facts.reported_status).toBe('OPEN')
  expect(accepted[0].displayed.claim?.content_digest).toBe(
    initial.shelter_context.items[0].content_digest,
  )
  expect(authority(await saved(page))).toEqual(authorityBeforeAcceptance)
  await expect(capability(page, 'B07').getByLabel('B07 marker')).toHaveText(
    'Ready',
  )

  await capability(page, 'B01')
    .getByRole('button', { name: 'Lock practice event' })
    .click()
  await capability(page, 'B03')
    .getByRole('button', { name: 'Freeze objective selection' })
    .click()
  await capability(page, 'B04')
    .getByRole('button', { name: 'Compute bounded margin' })
    .click()
  await capability(page, 'B05')
    .getByRole('button', { name: 'Carry comparison' })
    .click()
  await capability(page, 'B07')
    .getByRole('button', { name: /Record unknown for/ })
    .first()
    .click()
  await capability(page, 'B08').getByRole('button').first().click()
  await capability(page, 'B09').getByRole('button').first().click()
  await capability(page, 'B10')
    .getByRole('button', { name: 'Seal immutable H1' })
    .click()
  const h1 = (await saved(page)).h1
  await capability(page, 'D01')
    .getByRole('button', { name: 'Start response practice' })
    .click()
  const retrievalBeforeClock = await shelters.getByRole('status').innerText()
  await capability(page, 'D02')
    .getByRole('button', { name: 'Advance 60m' })
    .click()
  await expect(shelters.getByRole('status')).toHaveText(retrievalBeforeClock)
  await capability(page, 'D03')
    .getByRole('button', { name: /as unknown/ })
    .first()
    .click()
  await capability(page, 'D04')
    .getByRole('button', { name: /Record hold/ })
    .first()
    .click()
  await capability(page, 'D10')
    .getByRole('button', { name: /Mark S-1-1 carried/ })
    .click()
  await capability(page, 'D10')
    .getByRole('button', { name: 'Seal immutable H2' })
    .click()
  const sealed = await saved(page)
  const h2 = sealed.h2
  for (const [mode, result] of [
    ['changed', 'changed'],
    ['baseline', 'unchanged'],
    ['unavailable', 'source-unavailable'],
    ['empty', 'not-returned'],
    ['partial', 'source-unavailable'],
    ['stale', 'source-unavailable'],
  ]) {
    scenario = mode
    const count = await page.evaluate(
      () =>
        (
          JSON.parse(localStorage.getItem('practice-lifecycle.v5') ?? '{}')
            .sourceRechecks ?? []
        ).length,
    )
    await checks
      .getByRole('button', { name: 'Recheck source SA-1-1', exact: true })
      .click()
    await expect(checks.locator('[data-source-recheck]')).toHaveCount(count + 1)
    await expect(
      checks.locator('[data-source-recheck]').last(),
    ).toHaveAttribute('data-source-recheck', result)
    const current = await saved(page)
    expect(current.sourceEvidence).toEqual(accepted)
    expect(current.h1).toEqual(h1)
    expect(current.h2).toEqual(h2)
    expect(authority(current)).toEqual(authority(sealed))
    if (mode === 'empty') {
      await expect(shelters).toContainText(
        'No records reported by this query. This does not mean no shelters.',
      )
      await expect(shelters.locator('[data-source-digest]')).toHaveCount(0)
    }
  }
  await refresh('changed')
  await expect(shelters).toContainText('Fixture revised shelter report')
  await shelters.getByRole('heading').scrollIntoViewIfNeeded()
  await page.screenshot({
    path: testInfo.outputPath('reported-context.png'),
  })
  await checks.getByRole('heading').scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('source-rechecks.png') })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.reload()
  await openAllCapabilityDetails(page)
  await expect(checks.locator('[data-source-recheck]')).toHaveCount(6)
  expect((await saved(page)).sourceEvidence).toEqual(accepted)
  await capability(page, 'A07')
    .getByRole('button', { name: 'Carry unmet gates' })
    .click()
  await capability(page, 'A10')
    .getByRole('button', { name: 'Seal carry-forward and start next cycle' })
    .click()
  const next = await saved(page)
  expect(next.previousCycle?.sourceEvidence).toEqual(accepted)
  expect(next.previousCycle?.sourceRechecks).toHaveLength(6)
  await refresh('baseline')
  expect((await saved(page)).previousCycle).toEqual(next.previousCycle)
  expect(writes).toEqual([])
})

test('wall-clock expiry, 304, malformed, cancelled, and offline refresh preserve validated facts', async ({
  page,
  context,
}) => {
  let mode = 'ok'
  await page.clock.install({ time: new Date(sourceTestTime) })
  await page.route('**/api/v1/lifecycle/evidence?**', async (route) => {
    if (mode === 'cancel') return route.abort('aborted')
    if (mode === '304')
      return route.fulfill({ status: 304, headers: { ETag: 'W/"source-a"' } })
    if (mode === 'malformed')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...sourceSnapshot(),
          shelter_context: { items: [{ name: 'malicious replacement' }] },
        }),
      })
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { ETag: 'W/"source-a"' },
      body: JSON.stringify(sourceSnapshot()),
    })
  })
  await page.goto('/lifecycle')
  await openAllCapabilityDetails(page)
  const panel = page.getByRole('region', { name: 'Live lifecycle evidence' })
  const shelters = page.getByRole('region', {
    name: 'FEMA-reported shelter context',
  })
  await expect(shelters).toContainText('Reported shelter A')
  await expect(shelters.getByRole('status')).toContainText('Retrieval: fresh')
  mode = '304'
  await page.clock.fastForward(300_001)
  await expect(shelters.getByRole('status')).toContainText('Retrieval: stale')
  await panel.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(shelters.getByRole('status')).toContainText('Retrieval: stale')
  mode = 'malformed'
  await panel.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(panel).toContainText('Malformed lifecycle evidence')
  await expect(shelters).toContainText('Last-known reported facts retained')
  await expect(shelters).toContainText('Reported shelter A')
  await expect(shelters).not.toContainText('malicious replacement')
  mode = 'cancel'
  await panel.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(panel).toContainText('LAST KNOWN')
  await expect(shelters.getByRole('status')).toContainText(
    'Retrieval: unavailable',
  )
  await context.setOffline(true)
  await panel.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(panel).toContainText('Offline; evidence was not checked')
  await expect(shelters).toContainText('Reported shelter A')
})

test('offline remount reconciles cached transport without an extra fetch', async ({
  page,
  context,
}) => {
  await page.clock.install({ time: new Date(sourceTestTime) })
  let requests = 0
  await page.route('**/api/v1/lifecycle/evidence?**', (route) => {
    requests++
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { ETag: 'W/"source-a"' },
      body: JSON.stringify(sourceSnapshot()),
    })
  })
  await page.goto('/lifecycle')
  await openAllCapabilityDetails(page)
  const panel = page.getByRole('region', { name: 'Live lifecycle evidence' })
  const shelters = page.getByRole('region', {
    name: 'FEMA-reported shelter context',
  })
  await expect(shelters).toContainText('Reported shelter A')
  await expect(shelters.getByRole('status')).toContainText('Retrieval: fresh')
  const before = await saved(page)
  await page
    .getByRole('link', { name: 'Source health', exact: true })
    .first()
    .click()
  await expect(page).toHaveURL(/\/source-health$/)
  await expect(panel).toHaveCount(0)
  const checksBeforeUnmount = requests
  await context.setOffline(true)
  expect(await page.evaluate(() => navigator.onLine)).toBe(false)
  await page
    .getByRole('link', { name: 'Practice lifecycle', exact: true })
    .first()
    .click()
  await expect(page).toHaveURL(/\/lifecycle$/)
  await openAllCapabilityDetails(page)
  await expect(shelters).toContainText('Reported shelter A')
  await expect(panel).toContainText('LAST KNOWN')
  await expect(panel).toContainText('Offline; evidence was not checked')
  await expect(shelters.getByRole('status')).toContainText(
    'Retrieval: unavailable',
  )
  await expect(shelters).not.toContainText('Retrieval: fresh')
  expect(requests).toBe(checksBeforeUnmount)
  expect(await saved(page)).toEqual(before)
})

test('non-string enum refreshes retain validated cache and persist only source-unavailable rechecks', async ({
  page,
}) => {
  await page.clock.install({ time: new Date(sourceTestTime) })
  const actions: LifecycleAction[] = [
    { type: 'lock-event', eventId: 'hurricane-amber' },
    {
      type: 'carry-gap',
      gapId: 'transportation',
      owner: 'Planning lead',
      dueBand: 'T+30',
    },
    { type: 'set-objectives', objectiveIds: ['timing'] },
    { type: 'set-timing', warningMinutes: 120, preparationMinutes: 60 },
    {
      type: 'choose-assumption',
      choice: 'comparison',
      uptakePercent: 20,
      supportDays: 5,
    },
    {
      type: 'record-evidence',
      gapId: 'transportation',
      state: 'unknown',
      partner: 'Practice Partner A',
    },
    { type: 'set-scope', area: 'Transportation support', state: 'simulated' },
    {
      type: 'schedule-inject',
      stage: 'MAP',
      minute: 15,
      area: 'Transportation support',
    },
    {
      type: 'accept-source',
      gapId: 'transportation',
      displayed: displayedSource(),
      acceptedAt: sourceTestTime,
    },
    { type: 'seal-h1' },
    { type: 'start-during' },
    {
      type: 'set-support-disposition',
      supportItemId: 'S-1-1',
      disposition: 'carried',
    },
    { type: 'seal-h2' },
  ]
  const initial = actions.reduce(
    applyLifecycleAction,
    createInitialLifecycleState(),
  )
  await page.addInitScript((state) => {
    localStorage.setItem('practice-lifecycle.v5', JSON.stringify(state))
  }, initial)
  let payload: unknown = sourceSnapshot()
  let malformed = false
  const conditionalTags: Array<string | undefined> = []
  await page.route('**/api/v1/lifecycle/evidence?**', (route) => {
    conditionalTags.push(route.request().headers()['if-none-match'])
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        ETag: malformed ? 'W/"malformed-enum"' : 'W/"source-a"',
        'Access-Control-Expose-Headers': 'ETag',
      },
      body: JSON.stringify(payload),
    })
  })
  await page.goto('/lifecycle')
  await openAllCapabilityDetails(page)
  const panel = page.getByRole('region', { name: 'Live lifecycle evidence' })
  const shelters = page.getByRole('region', {
    name: 'FEMA-reported shelter context',
  })
  const checks = page.getByRole('region', { name: 'Accepted source rechecks' })
  await expect(shelters).toContainText('Reported shelter A')
  await expect(shelters.getByRole('status')).toContainText('Retrieval: fresh')
  const before = await saved(page)
  malformed = true
  let count = 0
  for (const [field, member] of [
    ['coverage', 'partial'],
    ['state', 'stale'],
    ['status', 'partial'],
  ]) {
    for (const invalid of [[member], { value: member }, 0]) {
      const snapshot = sourceSnapshot()
      snapshot.snapshot_id = 'malformed-enum'
      snapshot.shelter_context.items = []
      Object.assign(field === 'status' ? snapshot : snapshot.shelter_context, {
        [field]: invalid,
      })
      payload = snapshot
      await checks
        .getByRole('button', { name: 'Recheck source SA-1-1', exact: true })
        .click()
      await expect(checks.locator('[data-source-recheck]')).toHaveCount(++count)
      await expect(
        checks.locator('[data-source-recheck]').last(),
      ).toHaveAttribute('data-source-recheck', 'source-unavailable')
      await expect(panel).toContainText('Malformed lifecycle evidence')
      await expect(panel).toContainText('LAST KNOWN')
      await expect(panel).toContainText('snapshot-source-a')
      await expect(panel).not.toContainText('malformed-enum')
      await expect(shelters.getByRole('status')).toContainText(
        'Retrieval: unavailable',
      )
      await expect(shelters).toContainText('Last-known reported facts retained')
      await expect(shelters).toContainText('Reported shelter A')
      const current = await saved(page)
      expect(current.sourceRechecks.at(-1)).toMatchObject({
        result: 'source-unavailable',
        reading: {
          snapshotId: 'snapshot-source-a',
          transport: 'unavailable',
          claim: before.sourceEvidence[0].displayed.claim,
        },
      })
      expect(current.sourceEvidence).toEqual(before.sourceEvidence)
      expect(current.h1).toEqual(before.h1)
      expect(current.h2).toEqual(before.h2)
      expect(authority(current)).toEqual(authority(before))
      expect(conditionalTags.at(-1)).toBe('W/"source-a"')
    }
  }
})
