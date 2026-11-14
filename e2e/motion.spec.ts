import { expect, test, type Page } from '@playwright/test'
import { t } from '../src/i18n'
import { openSettled, pick, withFixture } from './support'

// The motion of the visual pass, in a real browser: the entrance of the ring, the card that unfolds, the drawer that
// opens from its corner, the motes of a stamp. With less motion asked for, none of it starts.

const en = (key: Parameters<typeof t>[0]) => t(key, 'en')
/** The animations that have an end and are running or waiting to run, by name. The sky's loops are left out. */
const running = () =>
  document
    .getAnimations()
    .filter((a) => a.effect?.getTiming().iterations !== Infinity)
    .map((a) => (a as CSSAnimation).animationName ?? 'script')
const still = () => document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).length === 0
const pc = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1280

test.describe('motion welcome', () => {
  test('the first ring makes its entrance and then rests, with nothing left running', async ({ page }) => {
    await withFixture(page, {}, { view: 'map', lang: 'en' })
    await page.goto('/')
    await expect(page.locator('.ring-svg.ring-entrance')).toBeVisible()
    const names = await page.evaluate(running)
    expect(names.some((n) => n.startsWith('ring-draw'))).toBe(true)
    await page.waitForFunction(still)
    // At rest every band is whole and every title is in its seat, fully drawn.
    const rest = await page.evaluate(() => ({
      titles: [...document.querySelectorAll('.ring-svg .t .ink')].map((el) => getComputedStyle(el).opacity),
      bands: [...document.querySelectorAll('.ring-svg .arc-band')].map((el) => getComputedStyle(el).strokeDashoffset),
    }))
    expect(rest.titles.length).toBeGreaterThan(0)
    for (const opacity of rest.titles) expect(opacity).toBe('1')
    for (const offset of rest.bands) expect(parseFloat(offset)).toBe(0)
  })

  test('coming back from the shelf, the ring is simply there', async ({ page }) => {
    await withFixture(page, {}, { view: 'map', lang: 'en' })
    await openSettled(page)
    await page.waitForFunction(still)
    await page.getByRole('button', { name: en('tabShelf'), exact: true }).first().click()
    await page.getByRole('button', { name: en('tabMap'), exact: true }).first().click()
    await expect(page.locator('.ring-svg')).toBeVisible()
    await expect(page.locator('.ring-svg.ring-entrance')).toHaveCount(0)
  })

  test('a card unfolds from its side and a drawer opens from its corner, and both end at rest', async ({ page }) => {
    test.skip(!pc(page), 'the PC layout only')
    await withFixture(page, {}, { view: 'map', lang: 'en' })
    await openSettled(page)
    await page.waitForFunction(still)
    await pick(page, 'Ash Road')
    await expect(page.locator('.slot > .plate')).toBeVisible()
    expect((await page.evaluate(running)).some((n) => n.startsWith('unfold'))).toBe(true)
    await page.waitForFunction(still)
    const plate = await page.locator('.slot > .plate').evaluate((el) => {
      const s = getComputedStyle(el)
      return { opacity: s.opacity, transform: s.transform, clip: s.clipPath }
    })
    expect(plate).toEqual({ opacity: '1', transform: 'none', clip: 'none' })
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: en('filters'), exact: true }).click()
    await expect(page.locator('.slot > .panel')).toBeVisible()
    expect((await page.evaluate(running)).some((n) => n.startsWith('drawer'))).toBe(true)
    await page.waitForFunction(still)
    const panel = await page.locator('.slot > .panel').evaluate((el) => {
      const s = getComputedStyle(el)
      return { opacity: s.opacity, transform: s.transform, clip: s.clipPath }
    })
    expect(panel).toEqual({ opacity: '1', transform: 'none', clip: 'none' })
  })

  test('marking a book read sends motes off its title, and none is left when they have flown', async ({ page }) => {
    test.skip(!pc(page), 'titles are on the ring from 1280 px')
    await withFixture(page, {}, { view: 'map', lang: 'en' })
    await openSettled(page)
    await page.waitForFunction(still)
    await pick(page, 'Ash Road')
    await page.getByRole('button', { name: en('markRead'), exact: true }).first().click()
    await expect(page.locator('body > .mote').first()).toBeAttached()
    expect(await page.locator('body > .mote').count()).toBeLessThanOrEqual(22)
    expect(await page.locator('#app .mote').count()).toBe(0)
    await expect(page.locator('.mote')).toHaveCount(0, { timeout: 5000 })
    await page.waitForFunction(still)
  })
})

test.describe('a text just asked for', () => {
  test('a synopsis appears like ink and ends whole, with nothing left over it', async ({ page }) => {
    await withFixture(page, {}, { view: 'map', lang: 'en' })
    await openSettled(page)
    await page.waitForFunction(still)
    await pick(page, 'Glass Harbour')
    const more = page.locator('.plate-more')
    if ((await more.isVisible()) && (await more.getAttribute('aria-expanded')) === 'false') await more.click()
    await page.waitForFunction(still)
    await page.locator('.syn-b').click()
    await expect(page.locator('.syn-text')).toBeVisible()
    expect((await page.evaluate(running)).some((n) => n.startsWith('ink'))).toBe(true)
    await page.waitForFunction(still)
    const text = await page.locator('.syn-text').evaluate((el) => {
      const s = getComputedStyle(el)
      return { filter: s.filter, opacity: s.opacity, position: s.maskPosition || s.webkitMaskPosition }
    })
    expect(text.filter).toBe('none')
    expect(text.opacity).toBe('1')
    expect(text.position).toMatch(/^0(%|px) 0(%|px)$/)
  })
})

test.describe('less motion asked for', () => {
  test('marking, opening a card, opening a drawer and switching view start no animation', async ({ browser, baseURL, viewport, hasTouch }) => {
    const context = await browser.newContext({ baseURL, viewport, hasTouch, reducedMotion: 'reduce', serviceWorkers: 'block' })
    const page = await context.newPage()
    const none = async (when: string) => expect(await page.evaluate(() => document.getAnimations().length), when).toBe(0)
    await withFixture(page, {}, { view: 'map', lang: 'en' })
    await openSettled(page)
    await expect(page.locator('.ring-svg.ring-entrance')).toHaveCount(0)
    await none('on arrival')

    await pick(page, 'Ash Road')
    await expect(page.locator('.plate')).toBeVisible()
    await none('with a card open')
    await page.getByRole('button', { name: en('markRead'), exact: true }).first().click()
    await expect(page.getByRole('button', { name: en('undo'), exact: true }).first()).toBeVisible()
    await none('after marking read')
    await expect(page.locator('.mote')).toHaveCount(0)
    await expect(page.locator('.planet.pulse')).toHaveCount(0)

    await page.getByRole('button', { name: en('filters'), exact: true }).click()
    await expect(page.locator('.panel')).toBeVisible()
    await none('with a drawer open')
    await page.keyboard.press('Escape')

    for (const tab of ['tabCircle', 'tabShelf', 'tabMap'] as const) {
      await page.getByRole('button', { name: en(tab), exact: true }).first().click()
      await none(`after switching to ${tab}`)
    }
    await context.close()
  })
})
