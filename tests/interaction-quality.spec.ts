import { expect, test } from './fixtures'

test('planning sheets and shared tabs preserve keyboard context', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'))
  await page.goto('/')
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()

  const opener = page.getByRole('button', {
    name: 'Open response workspace',
    exact: true,
  })
  await opener.focus()
  await opener.click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(page.locator('.atlas-stage')).toHaveAttribute(
    'aria-hidden',
    'true',
  )
  await expect(page.locator('.atlas-header')).toHaveAttribute(
    'aria-hidden',
    'true',
  )
  const countyTabs = dialog.getByTestId('county-shelter-plans')
  await expect(countyTabs).toBeVisible()
  const closeButton = dialog.getByRole('button', { name: 'Close panel' })
  await closeButton.focus()
  await expect(closeButton).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  expect(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true)
  await page.keyboard.press('Tab')
  await expect(closeButton).toBeFocused()

  const honoluluTab = countyTabs.getByRole('tab', { name: 'Honolulu' })
  await honoluluTab.focus()
  await honoluluTab.press('ArrowRight')
  const nextCountyTab = countyTabs.getByRole('tab').nth(1)
  await expect(nextCountyTab).toBeFocused()
  await expect(nextCountyTab).toHaveAttribute('aria-selected', 'true')
  const controlledPanelId = await nextCountyTab.getAttribute('aria-controls')
  expect(controlledPanelId).toBeTruthy()
  await expect(countyTabs.locator(`#${controlledPanelId}`)).toHaveAttribute(
    'aria-labelledby',
    await nextCountyTab.getAttribute('id'),
  )

  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(opener).toBeFocused()
  await expect(page.locator('.atlas-stage')).not.toHaveAttribute(
    'aria-hidden',
    'true',
  )
})

test('resident lookup validates private input and reports location denial', async ({
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
          Object.assign(window, {
            triggerResidentLocationError: () =>
              error({
                code: 1,
                message: 'denied',
                PERMISSION_DENIED: 1,
                POSITION_UNAVAILABLE: 2,
                TIMEOUT: 3,
              }),
          })
        },
      },
    })
  })
  await page.goto('/')
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible()
  await page
    .getByRole('button', { name: 'Open public guidance preview' })
    .click()

  const dialog = page.getByRole('dialog')
  const locationInput = dialog.getByLabel('Home address or landmark')
  await expect(locationInput).toHaveAttribute('name', 'resident-location')
  await expect(locationInput).toHaveAttribute('autocomplete', 'street-address')
  await expect(dialog).toContainText(
    'stay in this browser session and are not saved',
  )

  await locationInput.fill('   ')
  await dialog.getByRole('button', { name: 'Find routes' }).click()
  await expect(dialog.getByRole('alert')).toContainText(
    'Enter an address, intersection, landmark, or ZIP code',
  )
  await expect(locationInput).toHaveAttribute('aria-invalid', 'true')

  const locationButton = dialog.getByRole('button', {
    name: 'Use my current location',
  })
  await locationButton.click()
  await expect(
    dialog.getByRole('button', { name: 'Finding current location…' }),
  ).toBeDisabled()
  await page.evaluate(() => {
    ;(
      window as Window & { triggerResidentLocationError: () => void }
    ).triggerResidentLocationError()
  })
  await expect(dialog.getByRole('alert')).toContainText(
    'Location permission was denied',
  )
  await expect(dialog).not.toContainText(/-?\d{2,3}\.\d+/)
})
