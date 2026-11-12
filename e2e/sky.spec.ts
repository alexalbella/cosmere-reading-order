import { expect, test } from '@playwright/test'
import { openSettled, withFixture } from './support'

const skyAnimations = () => document.getAnimations().filter((a) => ((a.effect as KeyframeEffect | null)?.target as Element | null)?.closest('.sky')).length

test('the sky moves when motion is welcome', async ({ page }) => {
  await withFixture(page, {}, { view: 'map', lang: 'en' })
  await openSettled(page)
  expect(await page.evaluate(skyAnimations)).toBeGreaterThan(0)
})

test('reduced motion: the sky does not move', async ({ browser, baseURL, viewport, hasTouch }) => {
  const context = await browser.newContext({ baseURL, viewport, hasTouch, reducedMotion: 'reduce' })
  const page = await context.newPage()
  await withFixture(page, {}, { view: 'map', lang: 'en' })
  await openSettled(page)
  await page.mouse.move(200, 200)
  expect(await page.evaluate(skyAnimations)).toBe(0)
  await context.close()
})
