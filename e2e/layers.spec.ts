import { expect, test, type Page } from '@playwright/test'
import { openSettled, withFixture } from './support'

// The colour layers of the ring: four pressed buttons, a legend that names the values, and the choice kept on
// the device. On the PC the picker and its legend have a row of their own between the ring and the footer; on the
// phone they take their own room under the tabs.

const picker = (page: Page) => page.getByRole('group', { name: 'Colour layer' })

test('choosing a layer paints the titles, shows its legend without a number, and is kept across a reload', async ({ page }) => {
  await withFixture(page, {}, { view: 'map', lang: 'en' })
  await openSettled(page)
  await expect(picker(page).getByRole('button')).toHaveCount(4)
  await expect(picker(page).getByRole('button', { name: 'World' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.legend')).toHaveCount(0)

  await picker(page).getByRole('button', { name: 'Format' }).click()
  await expect(page.locator('.app')).toHaveAttribute('data-layer', 'format')
  await expect(page.locator('.legend li').first()).toBeVisible()
  expect(await page.locator('.legend').innerText()).not.toMatch(/\d/)
  const painted = await page.locator('.ring-svg .t').evaluateAll((els) => els.filter((el) => (el as HTMLElement).style.getPropertyValue('--layer-ink') !== '').length)
  expect(painted).toBe(await page.locator('.ring-svg .t').count())

  await openSettled(page)
  await expect(page.locator('.app')).toHaveAttribute('data-layer', 'format')
  await expect(picker(page).getByRole('button', { name: 'Format' })).toHaveAttribute('aria-pressed', 'true')
})

test('no two buttons on the page share a name with a layer', async ({ page }) => {
  await withFixture(page, {}, { view: 'map', lang: 'en' })
  await openSettled(page)
  for (const name of ['World', 'Status', 'Format', 'Reading']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(1)
})

type Rect = { left: number; top: number; right: number; bottom: number }
const apart = (a: Rect, b: Rect) => a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom

async function boxes(page: Page) {
  return page.evaluate(() => {
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    }
    const all = (selector: string) => [...document.querySelectorAll(selector)].map(rect).filter((r) => r.right > r.left && r.bottom > r.top)
    return {
      cover: rect(document.querySelector('.cover')!),
      picker: rect(document.querySelector('.layers')!),
      legend: rect(document.querySelector('.legend')!),
      // What must stay in sight: every title, every world's name, and what the footer and the corners hold.
      others: all('.ring-svg .t .t-text, .ring-svg .world-name, .foot-date, .foot-mid > *, .foot-end > *, .medallion, .sentence-col'),
      buttons: all('.layers button'),
    }
  })
}

for (const size of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1280, height: 720 },
]) {
  test(`the picker and its legend cover nothing and stay inside the cover, ${size.width}×${size.height}`, async ({ page, hasTouch }) => {
    test.skip(hasTouch === true, 'the PC layout only')
    await page.setViewportSize(size)
    // Every filter is on in the fixture, role-playing books too: the longest legend the layers can have.
    await withFixture(page, {}, { view: 'map', lang: 'en' })
    await openSettled(page)
    await picker(page).getByRole('button', { name: 'Format' }).click()
    await expect(page.locator('.legend li').first()).toBeVisible()
    const b = await boxes(page)
    for (const box of [b.picker, b.legend]) {
      expect(box.left).toBeGreaterThanOrEqual(b.cover.left)
      expect(box.right).toBeLessThanOrEqual(b.cover.right)
      expect(box.bottom).toBeLessThanOrEqual(b.cover.bottom)
      for (const other of b.others) expect(apart(other, box), 'something lies under the picker or its legend').toBe(true)
    }
    expect(apart(b.picker, b.legend)).toBe(true)
    for (const button of b.buttons) expect(button.bottom - button.top).toBeGreaterThanOrEqual(44)
  })
}

test('with a world lifted, the footer still lets it go: nothing of the picker is over it', async ({ page, hasTouch }) => {
  test.skip(hasTouch === true, 'the PC layout only')
  await withFixture(page, {}, { view: 'map', lang: 'en' })
  await openSettled(page)
  await picker(page).getByRole('button', { name: 'Status' }).click()
  await page.locator('.ring-svg .t').first().click()
  await page.locator('.plate .plate-world').click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.foot-btn')).toBeVisible()
  await page.locator('.foot-btn').click()
  await expect(page.locator('.foot-btn')).toHaveCount(0)
})

test('with a card open the picker keeps its row, under the card and clear of it', async ({ page, hasTouch }) => {
  test.skip(hasTouch === true, 'the PC layout only')
  await withFixture(page, {}, { view: 'map', lang: 'en' })
  await openSettled(page)
  await picker(page).getByRole('button', { name: 'Format' }).click()
  for (const index of [0, 5, 9]) {
    await page.locator('.ring-svg .t').nth(index).click()
    await expect(page.locator('.slot > .plate')).toBeVisible()
    await page.waitForFunction(() => document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).length === 0)
    const b = await page.evaluate(() => {
      const rect = (selector: string) => {
        const r = document.querySelector(selector)!.getBoundingClientRect()
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
      }
      return { plate: rect('.slot > .plate'), picker: rect('.layers'), legend: rect('.legend') }
    })
    expect(apart(b.plate, b.picker), 'the card lies over the picker').toBe(true)
    expect(apart(b.plate, b.legend), 'the card lies over the legend').toBe(true)
    await page.keyboard.press('Escape')
  }
})

test('on the phone the picker sits under the tabs and before the ring, in the flow', async ({ page, hasTouch }) => {
  test.skip(hasTouch !== true, 'the phone layout only')
  await withFixture(page, {}, { view: 'map', lang: 'en' })
  await openSettled(page)
  await picker(page).getByRole('button', { name: 'Reading' }).click()
  await expect(page.locator('.legend li').first()).toBeVisible()
  const b = await page.evaluate(() => {
    const rect = (selector: string) => {
      const r = document.querySelector(selector)!.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    }
    return {
      tabs: rect('.tabs-phone'),
      picker: rect('.layers'),
      legend: rect('.legend'),
      ring: rect('.ring'),
      width: document.documentElement.clientWidth,
      positions: [...document.querySelectorAll('.layers, .legend')].map((el) => getComputedStyle(el).position),
      buttons: [...document.querySelectorAll('.layers button')].map((el) => el.getBoundingClientRect().height),
    }
  })
  expect(b.positions).toEqual(['static', 'static'])
  expect(b.picker.top).toBeGreaterThanOrEqual(b.tabs.bottom)
  expect(b.legend.top).toBeGreaterThanOrEqual(b.picker.bottom)
  expect(b.ring.top).toBeGreaterThanOrEqual(b.legend.bottom)
  expect(b.picker.left).toBeGreaterThanOrEqual(0)
  expect(b.picker.right).toBeLessThanOrEqual(b.width)
  for (const height of b.buttons) expect(height).toBeGreaterThanOrEqual(44)
})
