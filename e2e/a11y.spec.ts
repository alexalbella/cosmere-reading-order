import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { t } from '../src/i18n'
import { bookButton, marksOf, openSettled, withFixture } from './support'

const en = (key: Parameters<typeof t>[0]) => t(key, 'en')

async function serious(page: Page): Promise<string[]> {
  // Colours are measured at rest: a transition under way would be read half-way.
  await page
    .waitForFunction(() => document.getAnimations().length === 0, undefined, { timeout: 5000 })
    .catch(() => {
      throw new Error('animations did not settle in 5 s, so colours cannot be measured at rest')
    })
  const { violations } = await new AxeBuilder({ page }).analyze()
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
}

for (const view of ['map', 'circle', 'shelf'] as const) {
  test(`axe finds nothing serious, ${view}`, async ({ page }) => {
    await withFixture(page, { marks: marksOf(['ash-road']) }, { view })
    await openSettled(page)
    expect(await serious(page), 'cover').toEqual([])

    await bookButton(page, 'Glass Harbour').focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.plate-title')).toHaveText('Glass Harbour')
    expect(await serious(page), 'plate').toEqual([])

    for (const name of [en('filters'), en('settings'), en('spoilers')]) {
      await page.getByRole('button', { name, exact: true }).click()
      await expect(page.locator('.panel')).toBeVisible()
      expect(await serious(page), `panel ${name}`).toEqual([])
      await page.getByRole('button', { name, exact: true }).click()
    }
  })
}

test('axe finds nothing serious with the sign-in notice up, and its links can be reached', async ({ page }) => {
  await withFixture(page, {}, { view: 'shelf' })
  await page.route('**/api/state', (route) => route.fulfill({ status: 401, body: '' }))
  await page.goto('/')
  const footerLink = page.locator('footer').getByRole('link', { name: en('syncSigninAction'), exact: true })
  await expect(footerLink).toBeVisible()
  expect(await serious(page), 'footer').toEqual([])

  await page.getByRole('button', { name: en('settings'), exact: true }).click()
  const panelLink = page.locator('.panel').getByRole('link', { name: en('syncSigninAction'), exact: true })
  await expect(panelLink).toBeVisible()
  expect((await panelLink.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await serious(page), 'settings').toEqual([])
})

test('keyboard only on the circle: one stop, arrows walk, Enter selects, the plate is next', async ({ page }) => {
  await withFixture(page, {}, { view: 'circle' })
  await page.goto('/')
  await expect(page.locator('.app')).toBeVisible()

  // One tab stop for the whole ring, however many books it holds.
  await expect(page.locator('svg.ring-svg [tabindex="0"]')).toHaveCount(1)
  const stop = page.locator('svg.ring-svg [tabindex="0"]')
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab')
    if (await stop.evaluate((el) => el === document.activeElement)) break
  }
  await expect(stop).toBeFocused()

  const name = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')
  const start = await name()
  await page.keyboard.press('ArrowRight')
  expect(await name()).not.toBe(start)
  await page.keyboard.press('ArrowLeft')
  expect(await name()).toBe(start)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(page.locator('.t[aria-pressed=true]')).toBeFocused()

  // From the ring, the plate's world and then its mark button: no walk around the bands.
  // On the phone the footer's link and the plate's close and fold buttons come first.
  const world = page.locator('.plate .plate-world')
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab')
    if (await world.evaluate((el) => el === document.activeElement)) break
  }
  await expect(page.locator('.plate .plate-world')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('.plate .plate-world')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: en('markRead'), exact: true })).toBeFocused()
})

test('keyboard only: reach a book, select it, mark it, undo', async ({ page }) => {
  await withFixture(page, {}, { view: 'shelf' })
  await page.goto('/')
  await expect(page.locator('.app')).toBeVisible()

  const book = bookButton(page, 'Ash Road')
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab')
    if (await book.evaluate((el) => el === document.activeElement)) break
  }
  await expect(book).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(book).toHaveAttribute('aria-pressed', 'true')

  const mark = page.getByRole('button', { name: en('markRead'), exact: true })
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab')
    if (await mark.evaluate((el) => el === document.activeElement)) break
  }
  await expect(mark).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status').filter({ hasText: en('markedRead') })).toBeVisible()

  const undo = page.getByRole('button', { name: en('undo'), exact: true })
  for (let i = 0; i < 10 && !(await undo.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
  await expect(undo).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(mark).toBeVisible()
})
