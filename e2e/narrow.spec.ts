import { expect, test } from '@playwright/test'
import { pick, withFixture } from './support'

const LONG_TITLE = 'The Very Long and Winding Chronicle of the Amber Chartmakers'

for (const view of ['map', 'circle', 'shelf'] as const) {
  for (const lang of ['es', 'en'] as const) {
    test(`320 px: nothing overflows and the title is whole, ${view}, ${lang}`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 })
      await withFixture(page, {}, { view, lang })
      await page.goto('/')
      await expect(page.locator('.app')).toBeVisible()
      await pick(page, LONG_TITLE)

      const title = page.locator('.plate-title')
      await expect(title).toHaveText(LONG_TITLE)
      const fits = await page.evaluate(() => {
        const el = document.querySelector('.plate-title') as HTMLElement
        const box = el.getBoundingClientRect()
        return {
          page: document.documentElement.scrollWidth <= window.innerWidth,
          inside: box.left >= 0 && box.right <= window.innerWidth,
          unclipped: el.scrollWidth <= el.clientWidth + 1,
        }
      })
      expect(fits).toEqual({ page: true, inside: true, unclipped: true })
    })
  }
}
