import { expect, test, type Page } from '@playwright/test'
import type { Lang } from '../src/i18n'
import { marksOf, openSettled, withFixture } from './support'

// The ring makes room: on the PC neither a work's card nor a drawer may cover a title, at any size, in either
// language. The phone has its own layout.
test.skip(({ hasTouch }) => hasTouch === true, 'the PC layout only')

/** How many titles the open card or drawer, and the sentence's first line, cover. */
async function covered(page: Page): Promise<{ card: number; head: number }> {
  return page.evaluate(() => {
    const hit = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
    const titles = [...document.querySelectorAll('.ring-svg .t .t-text')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0)
    const open = document.querySelector('.slot > .plate, .slot > .panel')
    const head = document.querySelector('.sentence .line-reading')
    return {
      card: open ? titles.filter((t) => hit(t, open.getBoundingClientRect())).length : 0,
      head: head ? titles.filter((t) => hit(t, head.getBoundingClientRect())).length : 0,
    }
  })
}

/** The index of a title near the middle height of the ring, on its right or left half. */
async function titleOn(page: Page, side: 'right' | 'left'): Promise<number> {
  return page.evaluate((side) => {
    const ring = document.querySelector('.ring-svg')!.getBoundingClientRect()
    const cy = ring.top + ring.height / 2
    const ts = [...document.querySelectorAll('.ring-svg .t')].map((t, i) => ({ i, r: t.getBoundingClientRect() }))
    const near = ts.filter(({ r }) => Math.abs(r.top + r.height / 2 - cy) < ring.height * 0.3)
    near.sort((a, b) => (side === 'right' ? b.r.left - a.r.left : a.r.left - b.r.left))
    return near[0]!.i
  }, side)
}

const settle = (page: Page) => page.waitForTimeout(900)

for (const [width, height] of [
  [1280, 720],
  [1280, 800],
  [1440, 900],
]) {
  for (const lang of ['es', 'en'] as Lang[]) {
    test(`no title is covered by the card or a drawer, ${width}×${height}, ${lang}`, async ({ page }) => {
      await page.setViewportSize({ width: width!, height: height! })
      await withFixture(page, { marks: marksOf(['ash-road']) }, { view: 'circle', lang })
      await openSettled(page)
      expect(await covered(page), 'at rest').toEqual({ card: 0, head: 0 })
      for (const side of ['right', 'left'] as const) {
        await page.locator('.ring-svg .t').nth(await titleOn(page, side)).click()
        await settle(page)
        await expect(page.locator('.slot > .plate')).toBeVisible()
        expect(await covered(page), `card, title on the ${side}`).toEqual({ card: 0, head: 0 })
      }
      for (const medallion of ['.m-filters', '.m-settings']) {
        await page.locator(medallion).click()
        await settle(page)
        expect(await covered(page), medallion).toEqual({ card: 0, head: 0 })
        const box = await page.locator('.slot > .panel').boundingBox()
        const cover = await page.locator('.cover').boundingBox()
        expect(box!.y + box!.height, `${medallion} stays inside the cover`).toBeLessThanOrEqual(cover!.y + cover!.height)
        await page.locator(medallion).click()
      }
    })
  }
}

test('closing the card brings the ring back to the centre', async ({ page }) => {
  await withFixture(page, {}, { view: 'map', lang: 'es' })
  await openSettled(page)
  await page.locator('.ring-svg .t').nth(await titleOn(page, 'right')).click()
  await settle(page)
  await expect(page.locator('.ring-window')).toHaveClass(/making-room/)
  await page.keyboard.press('Escape')
  await settle(page)
  await expect(page.locator('.slot > .plate')).toHaveCount(0)
  await expect(page.locator('.ring-window')).not.toHaveClass(/making-room/)
})
