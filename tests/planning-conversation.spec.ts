import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  answerClaim,
  claimQuestion,
  interpretPlanningPrompt,
  proposedTiming,
  startClaim,
  validatedChatClaim,
} from '../src/lib/planning-conversation'
import {
  caseStorageKey,
  defaultTiming,
  waianaeEvidenceScenario,
} from '../src/lib/waianae-case'
import { exportEvidenceBundle } from '../src/lib/evidence-bundle'

const scenario = waianaeEvidenceScenario()
const now = Date.parse('2026-10-28T19:00:00.000Z')

test('bounded message interpretation does not retain or infer arbitrary personal text', () => {
  expect(interpretPlanningPrompt('What does the plan still need?')).toEqual({
    prompt: 'What does the plan still need?',
  })
  expect(
    interpretPlanningPrompt('What if the storm arrives in 12 hours?'),
  ).toEqual({ arrival: '12' })
  for (const text of [
    'Send firefighters now',
    'Jane lives at 123 Example Street',
    '<script>alert(1)</script>',
    'x'.repeat(257),
  ])
    expect(interpretPlanningPrompt(text)).toBeNull()
  expect(proposedTiming(defaultTiming, 'arrival', '0')).toHaveProperty('error')
  expect(proposedTiming(defaultTiming, 'arrival', '5')).toHaveProperty('error')
  expect(proposedTiming(defaultTiming, 'arrival', '12')).toEqual({
    timing: { ...defaultTiming, arrival: '12' },
  })
})

test('one-answer-at-a-time claims require all controlled provenance before validation', () => {
  let draft = startClaim('vehicle-a', scenario)
  expect(validatedChatClaim(draft, scenario, 'E-test')).toBeNull()
  for (const bad of ['-1', '1.5', '21', '2 seats and a name']) {
    expect(answerClaim(draft, scenario, bad, now)).toHaveProperty('error')
  }
  for (const value of [
    '2',
    'yes',
    'unknown',
    'reported',
    'Transportation coordinator',
    'now',
    '6',
  ]) {
    const response = answerClaim(draft, scenario, value, now)
    if ('error' in response) throw new Error(response.error)
    draft = response.draft
  }
  expect(claimQuestion(draft, scenario)).toBeNull()
  expect(validatedChatClaim(draft, scenario, 'E-test')).toMatchObject({
    values: { places: '2', boarding: 'yes', mobility: 'unknown' },
    basis: 'reported',
    sourceRole: 'Transportation coordinator',
    observedAt: new Date(now).toISOString(),
    validForHours: 6,
    suppressed: false,
  })
  const observedDraft = { ...draft, question: 5 }
  expect(
    answerClaim(observedDraft, scenario, '2099-01-01T10:00', now),
  ).toHaveProperty('error')
  expect(
    answerClaim(observedDraft, scenario, '2026-02-30T10:00', now),
  ).toHaveProperty('error')
})

async function open(page: Page) {
  await page.goto('/waianae')
  await expect(page.locator('main')).toHaveAttribute('data-hydrated', 'true')
  await expect(
    page.getByRole('button', { name: 'Conversation', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
}
async function say(page: Page, text: string) {
  const input = page.getByLabel('Your planning question', { exact: true })
  await input.fill(text)
  await input.press('Enter')
}
async function saved(page: Page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    caseStorageKey,
  )
}
async function answer(page: Page, label: string) {
  await page
    .locator('.conversation-question')
    .getByRole('button', { name: label, exact: true })
    .click()
}
async function transportProposal(page: Page, places: string) {
  await say(page, 'Add transport evidence')
  await say(page, places)
  await answer(page, 'Yes · local claim')
  await answer(page, 'Yes · local claim')
  await answer(page, 'Reported claim')
  await answer(page, 'Transportation coordinator')
  await answer(page, 'Observed now')
  await answer(page, '6 hours')
  await expect(
    page.getByRole('region', { name: 'Review proposed claim' }),
  ).toBeVisible()
}

test('chat is the default, with no form wall; unsupported free text is not echoed, stored or sent', async ({
  page,
}, testInfo) => {
  const requests: string[] = []
  page.on('request', (request) =>
    requests.push(`${request.url()} ${request.postData() ?? ''}`),
  )
  await open(page)
  await expect(
    page.getByText('Local planning guide · not a live AI model', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(page.getByRole('spinbutton')).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Before arrival' })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('chat-entry.png') })
  await say(page, 'What does the plan still need?')
  await expect(
    page.getByTestId('chat-insight-assisted-transfer'),
  ).toHaveAttribute('data-state', 'missing')
  const privateText = 'Fictional-private-marker-829 at 123 Example Street'
  await say(page, privateText)
  await expect(page.getByRole('alert')).toContainText('not retained or sent')
  await expect(page.getByRole('log')).not.toContainText(privateText)
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    privateText,
  )
  expect(requests.join('\n')).not.toContain(privateText)
  await expect(
    page.getByLabel('Your planning question', { exact: true }),
  ).toHaveValue('')
})

test('typed timing changes are proposals, cancel is read-only and explicit apply clears preparation', async ({
  page,
}) => {
  await open(page)
  await say(page, 'Prepare County review')
  await page
    .getByRole('button', { name: 'Prepare Medical question', exact: true })
    .click()
  expect((await saved(page)).checks.medical).toBe(true)
  await say(page, 'What if the storm arrives in 12 hours?')
  await expect(
    page.getByRole('region', { name: 'Review proposed timing' }),
  ).toContainText('1h exercise planning margin')
  expect((await saved(page)).timing.arrival).toBe('24')
  await page
    .getByRole('button', { name: 'Cancel proposal', exact: true })
    .click()
  expect((await saved(page)).timing.arrival).toBe('24')
  await say(page, 'What if the storm arrives in 12 hours?')
  await page
    .getByRole('button', { name: 'Apply timing change', exact: true })
    .click()
  await expect.poll(async () => (await saved(page)).timing.arrival).toBe('12')
  expect((await saved(page)).checks.medical).toBe(false)
  await say(page, 'Storm arrives in 5 hours')
  await expect(page.getByRole('alert')).toContainText('Nothing changed')
  expect((await saved(page)).timing.arrival).toBe('12')
  await say(page, 'Change the planning window')
  await page
    .getByRole('button', {
      name: 'Assumed access loss (hours before arrival)',
      exact: true,
    })
    .click()
  await say(page, '10')
  await expect(
    page.getByRole('region', { name: 'Review proposed timing' }),
  ).toContainText('Exercise window exhausted')
})

test('guided evidence reveals gap and conflict; set-aside and packet use the same working set', async ({
  page,
}, testInfo) => {
  await open(page)
  await transportProposal(page, '1')
  expect((await saved(page)).contributions).toHaveLength(0)
  await expect(
    page.getByRole('region', { name: 'Review proposed claim' }),
  ).toContainText('Criteria gap')
  await page
    .getByRole('button', { name: 'Apply local claim', exact: true })
    .click()
  await expect(
    page.getByTestId('chat-insight-assisted-transfer'),
  ).toHaveAttribute('data-state', 'gap')
  await transportProposal(page, '2')
  await expect(
    page.getByRole('region', { name: 'Review proposed claim' }),
  ).toContainText('Conflicting claims')
  await page
    .getByRole('button', { name: 'Apply local claim', exact: true })
    .click()
  await expect(
    page.getByTestId('chat-insight-assisted-transfer'),
  ).toHaveAttribute('data-state', 'conflict')
  const first = (await saved(page)).contributions[0].id
  await say(page, 'Review local claims')
  await page
    .getByRole('button', { name: `Set aside ${first}`, exact: true })
    .click()
  expect((await saved(page)).contributions[0].suppressed).toBe(false)
  await page
    .getByRole('button', { name: 'Confirm claim change', exact: true })
    .click()
  await say(page, 'What does the plan still need?')
  await expect(
    page.getByTestId('chat-insight-assisted-transfer'),
  ).toHaveAttribute('data-state', 'reported')
  await expect(page.getByTestId('case-flood-summary')).toBeVisible()
  const downloading = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Download request for review', exact: true })
    .click()
  const text = await readFile(await (await downloading).path(), 'utf8')
  expect(text).toContain('Reported criteria covered')
  expect(text).toContain(first)
  expect(text).toContain('suppressed')
  expect(text).toContain('NOT SENT')
  await page
    .getByRole('button', { name: 'Clear conversation', exact: true })
    .click()
  expect((await saved(page)).contributions).toHaveLength(2)
  await page.reload()
  await say(page, 'What does the plan still need?')
  await expect(
    page.getByTestId('chat-insight-assisted-transfer'),
  ).toHaveAttribute('data-state', 'reported')
  await page.screenshot({ path: testInfo.outputPath('chat-evidence.png') })
})

test('power and access interviews preserve unknowns and feed live map highlights', async ({
  page,
}) => {
  await open(page)
  await say(page, 'Add power evidence')
  await say(page, '3')
  await answer(page, 'Unknown')
  await answer(page, 'Exercise assumption')
  await answer(page, 'Health / medical coordinator')
  await answer(page, 'Observed now')
  await answer(page, '1 hour')
  await page
    .getByRole('button', { name: 'Apply local claim', exact: true })
    .click()
  await expect(
    page.getByTestId('chat-insight-power-continuity'),
  ).toHaveAttribute('data-state', 'incomplete')
  await say(page, 'Add H1 evidence')
  await answer(page, 'Access concern reported')
  await answer(page, 'Reported claim')
  await answer(page, 'Field / community liaison')
  await answer(page, 'Observed now')
  await answer(page, '6 hours')
  await page
    .getByRole('button', { name: 'Apply local claim', exact: true })
    .click()
  await expect(page.getByTestId('chat-insight-access-H1')).toHaveAttribute(
    'data-state',
    'gap',
  )
  await expect(page.getByTestId('case-map')).toHaveAttribute(
    'data-map-ready',
    'true',
  )
  const anchor = page.getByLabel('H1: hypothetical access concern', {
    exact: true,
  })
  await expect(anchor).toHaveAttribute('data-local-claims', '1')
  await expect(anchor).toHaveClass(/case-disruption-focused/)
  expect((await saved(page)).contributions[0].values.compatible).toBe('unknown')
})

test('detailed edits invalidate pending chat proposals without overwriting newer work', async ({
  page,
}) => {
  await open(page)
  await transportProposal(page, '2')
  await page
    .getByRole('button', { name: 'Detailed workspace', exact: true })
    .click()
  await page.getByRole('tab', { name: 'Before arrival', exact: true }).click()
  await page
    .getByLabel('Assumed transfer and travel (hours)', { exact: true })
    .fill('2')
  await page.getByRole('button', { name: 'Conversation', exact: true }).click()
  await page
    .getByRole('button', { name: 'Apply local claim', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'Working evidence or timing changed',
  )
  expect((await saved(page)).contributions).toHaveLength(0)
  expect((await saved(page)).timing.travel).toBe('2')
  await page
    .getByRole('button', { name: 'Cancel proposal', exact: true })
    .click()
  await say(page, 'Storm arrives in 12 hours')
  await page
    .getByRole('button', { name: 'Detailed workspace', exact: true })
    .click()
  await page
    .getByLabel('Assumed storm arrival (hours from now)', { exact: true })
    .fill('20')
  await page.getByRole('button', { name: 'Conversation', exact: true }).click()
  await page
    .getByRole('button', { name: 'Apply timing change', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'Timing changed since this proposal',
  )
  expect((await saved(page)).timing.arrival).toBe('20')
})

test('chat file exchange keeps explicit preview and atomic import; resident handoff stays unsent', async ({
  page,
}) => {
  await open(page)
  const row = {
    id: 'E-ab12cd34',
    scenarioId: scenario.id,
    targetId: 'site-a',
    kind: 'receiving' as const,
    basis: 'reported' as const,
    sourceRole: 'Mass-care coordinator' as const,
    observedAt: new Date(Date.now() - 60_000).toISOString(),
    validForHours: 6 as const,
    suppressed: false,
    values: {
      acceptance: 'yes',
      stepFree: 'yes',
      caregiver: 'unknown',
      power: 'yes',
    },
  }
  await say(page, 'Exchange evidence')
  await page
    .getByLabel('Import evidence bundle for review', { exact: true })
    .setInputFiles({
      name: 'local-evidence.json',
      mimeType: 'application/json',
      buffer: Buffer.from(exportEvidenceBundle(scenario, [row])),
    })
  await expect(
    page.getByRole('heading', { name: 'Review before applying', exact: true }),
  ).toBeVisible()
  expect((await saved(page)).contributions).toHaveLength(0)
  await page
    .getByRole('button', { name: 'Confirm bundle import', exact: true })
    .click()
  await expect
    .poll(async () => (await saved(page)).contributions.length)
    .toBe(1)
  await say(page, 'What does the plan still need?')
  await expect(
    page.getByTestId('chat-insight-receiving-support'),
  ).toHaveAttribute('data-state', 'incomplete')
  await say(page, 'Draft a resident message')
  await expect(
    page.getByRole('region', { name: 'Unsent resident draft' }),
  ).toContainText('not sent')
  await expect(
    page.getByRole('region', { name: 'Unsent resident draft' }),
  ).toContainText('No inputs were sent to an AI provider')
})

test('keyboard composer and responsive chat stay within viewport, with detailed tools still reachable', async ({
  page,
}, testInfo) => {
  await open(page)
  const input = page.getByLabel('Your planning question', { exact: true })
  await input.focus()
  await input.fill('What does the plan still need?')
  await input.press('Enter')
  await expect(input).toHaveValue('')
  await expect(page.getByRole('log')).toContainText(
    'What does the plan still need?',
  )
  await expect(
    page.getByRole('heading', {
      name: 'What the plan still needs',
      exact: true,
    }),
  ).toBeInViewport()
  const geometry = await page.evaluate(() => {
    const root = document.querySelector('main')!
    const composer = document
      .querySelector('.conversation-composer')!
      .getBoundingClientRect()
    const chat = document
      .querySelector('.planning-conversation')!
      .getBoundingClientRect()
    return {
      width: window.innerWidth,
      scroll: root.scrollWidth,
      composerRight: composer.right,
      chatRight: chat.right,
    }
  })
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width)
  expect(geometry.composerRight).toBeLessThanOrEqual(geometry.width)
  expect(geometry.chatRight).toBeLessThanOrEqual(geometry.width)
  await input.fill('What does the plan still need?')
  await input.press('Shift+Enter')
  await expect(input).toHaveValue('What does the plan still need?\n')
  await input.fill('')
  await page
    .getByRole('button', { name: 'Detailed workspace', exact: true })
    .click()
  await expect(
    page.getByRole('tab', { name: 'Before arrival', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Conversation', exact: true }).click()
  await expect(page.getByRole('log')).toContainText(
    'What does the plan still need?',
  )
  await expect(
    page.getByRole('heading', {
      name: 'What the plan still needs',
      exact: true,
    }),
  ).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath('chat-responsive.png') })
})

test('receiving interview, invalid replies and removal remain controlled and confirmable', async ({
  page,
}) => {
  await open(page)
  await say(page, 'Add receiving evidence')
  await say(page, 'Fictional-private-marker-829 at 123 Example Street')
  await expect(page.getByRole('alert')).toContainText(
    'Choose one of the listed values',
  )
  await expect(
    page.getByLabel('Your planning question', { exact: true }),
  ).toHaveValue('')
  await expect(page.getByRole('log')).not.toContainText(
    'Fictional-private-marker',
  )
  for (const label of [
    'Yes · local claim',
    'Yes · local claim',
    'Unknown',
    'Yes · local claim',
    'Reported claim',
    'Mass-care coordinator',
    'Observed now',
    '6 hours',
  ])
    await answer(page, label)
  await expect(
    page.getByRole('region', { name: 'Review proposed claim' }),
  ).toContainText('Unknowns remain')
  await page
    .getByRole('button', { name: 'Apply local claim', exact: true })
    .click()
  await expect(
    page.getByTestId('chat-insight-receiving-support'),
  ).toHaveAttribute('data-state', 'incomplete')
  const id = (await saved(page)).contributions[0].id
  await say(page, 'Review local claims')
  await page.getByRole('button', { name: `Remove ${id}`, exact: true }).click()
  await page
    .getByRole('button', { name: 'Cancel proposal', exact: true })
    .click()
  expect((await saved(page)).contributions).toHaveLength(1)
  await say(page, 'Review local claims')
  await page.getByRole('button', { name: `Remove ${id}`, exact: true }).click()
  await page
    .getByRole('button', { name: 'Confirm claim change', exact: true })
    .click()
  expect((await saved(page)).contributions).toHaveLength(0)
})

test('conversation history is bounded and transient; failed storage does not prevent local analysis', async ({
  page,
}) => {
  await open(page)
  for (let index = 0; index < 26; index++) await say(page, 'help')
  await expect(page.locator('.conversation-turn')).toHaveCount(24)
  await expect(
    page.getByText('Earlier conversation turns were cleared', { exact: false }),
  ).toBeVisible()
  expect(JSON.stringify(await saved(page))).not.toContain(
    'What does the plan still need?',
  )
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('test storage unavailable')
    }
  })
  await transportProposal(page, '2')
  await page
    .getByRole('button', { name: 'Apply local claim', exact: true })
    .click()
  await expect(
    page.getByTestId('chat-insight-assisted-transfer'),
  ).toHaveAttribute('data-state', 'reported')
  await expect(page.getByRole('alert')).toContainText('could not be saved')
  expect((await saved(page)).contributions).toHaveLength(0)
  await page.reload()
  await expect(page.locator('.conversation-turn')).toHaveCount(0)
  await say(page, 'What does the plan still need?')
  await expect(
    page.getByTestId('chat-insight-assisted-transfer'),
  ).toHaveAttribute('data-state', 'missing')
})
