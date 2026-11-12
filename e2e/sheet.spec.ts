import { expect, test } from '@playwright/test'
import { marksOf, pick, withFixture } from './support'

// On the phone the plate is a sheet at the foot of the screen. It takes room from the list rather than covering
// it, so the chosen book stays in sight above it.
test.skip(({ hasTouch }) => hasTouch !== true, 'the phone layout only')

for (const view of ['map', 'circle', 'shelf'] as const) {
  test(`the plate is a sheet at the foot of the screen, and the chosen book stays in sight above it, ${view}`, async ({ page }) => {
    await withFixture(page, { marks: marksOf(['ash-road']) }, { view, lang: 'en' })
    await page.goto('/')
    await pick(page, 'Northern Gale')
    const sheet = page.locator('.slot .plate')
    await expect(sheet).toBeVisible()
    await page.waitForTimeout(400)
    const at = await page.evaluate(() => {
      const plate = document.querySelector('.slot .plate')!.getBoundingClientRect()
      const chosen = document.querySelector('.area .sel')!.getBoundingClientRect()
      const area = document.querySelector('.area')!.getBoundingClientRect()
      return { bottom: Math.round(plate.bottom), height: plate.height, top: plate.top, chosenTop: chosen.top, chosenBottom: chosen.bottom, areaTop: area.top, viewport: window.innerHeight }
    })
    expect(Math.abs(at.bottom - at.viewport)).toBeLessThanOrEqual(2)
    expect(at.height).toBeLessThanOrEqual(at.viewport * 0.72 + 1)
    expect(at.chosenBottom).toBeLessThanOrEqual(at.top + 1)
    expect(at.chosenTop).toBeGreaterThanOrEqual(at.areaTop - 1)
  })
}

test('closing the sheet gives the focus back to the chosen book', async ({ page }) => {
  await withFixture(page, {}, { view: 'shelf', lang: 'en' })
  await page.goto('/')
  await pick(page, 'Northern Gale')
  await page.locator('.slot .plate .plate-close').click()
  await expect(page.locator('.slot .plate')).toHaveCount(0)
  // Deselected, it is no longer `.sel`: the focus stays on the book it was.
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')).toMatch(/^Northern Gale,/)
})

test('the sheet shows it can be pulled: a handle at its top edge', async ({ page }) => {
  await withFixture(page, {}, { view: 'shelf', lang: 'en' })
  await page.goto('/')
  await pick(page, 'Northern Gale')
  const handle = await page.evaluate(() => getComputedStyle(document.querySelector('.slot .plate')!, '::before').content)
  expect(handle).not.toBe('none')
})
