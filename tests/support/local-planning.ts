import type { Page } from '@playwright/test'

// Existing detailed-tool regressions enter their original local exercise
// explicitly; the separate statewide suite covers the new default entry.
export async function openLocalPlanning(page: Page, url = '/') {
  await page.goto(url)
  await page.locator('main[data-hydrated="true"]').waitFor()
  const mobile = (page.viewportSize()?.width ?? 1440) <= 900
  if (mobile)
    await page
      .getByRole('button', {
        name: 'Change planning area or active event',
        exact: false,
      })
      .click()
  await page.getByLabel('Choose island', { exact: true }).selectOption('Oʻahu')
  await page
    .getByLabel('Which part of Oʻahu?', { exact: true })
    .selectOption('oahu-town')
  if (!mobile)
    await page
      .getByRole('button', { name: 'Show detailed overview', exact: true })
      .click()
}
