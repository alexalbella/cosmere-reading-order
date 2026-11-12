import { expect, test, type Page } from '@playwright/test'
import { t } from '../src/i18n'
import { FOLLOW_DELAY_MS } from '../src/sync/client'
import { bookButton, CATALOG_IDS, marksOf, pick, storedPrefs, storedState, withFixture } from './support'

const en = (key: Parameters<typeof t>[0], ...args: (string | number)[]) => t(key, 'en', ...args)

/** A medallion on the PC, a link in the strip on the phone: either way, the control named so. */
const control = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

async function openSettings(page: Page): Promise<void> {
  await control(page, en('settings')).click()
  await expect(page.getByRole('heading', { name: en('settings'), exact: true })).toBeVisible()
}

async function ready(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('.app')).toBeVisible()
}

test.describe('the ring', () => {
  test('a long title is whole in the DOM and only CSS shortens it, inside the bands', async ({ page }) => {
    test.skip(page.viewportSize()!.width < 1280, 'titles become ticks below 1280 px')
    await withFixture(page, {}, { view: 'circle' })
    await ready(page)
    const measured = await page.locator('[aria-label^="The Very Long"]').evaluate((book) => {
      const lines = [...book.querySelectorAll('.t-text')] as HTMLElement[]
      const svg = book.closest('svg') as SVGSVGElement
      const ring = svg.getBoundingClientRect()
      const unit = ring.width / 1000
      const centre = { x: ring.left + ring.width / 2, y: ring.top + ring.height / 2 }
      const reach = Math.max(
        ...lines.map((line) => {
          const box = line.getBoundingClientRect()
          const corners = [[box.left, box.top], [box.right, box.top], [box.left, box.bottom], [box.right, box.bottom]]
          return Math.max(...corners.map(([x, y]) => Math.hypot(x! - centre.x, y! - centre.y)))
        }),
      )
      return {
        text: lines.map((line) => line.textContent).join(''),
        clipped: lines.some((line) => line.scrollWidth > line.clientWidth),
        overflow: lines.map((line) => getComputedStyle(line).textOverflow),
        reach: reach / unit,
      }
    })
    expect(measured.text).toBe('The Very Long and Winding Chronicle of the Amber Chartmakers')
    expect(measured.clipped).toBe(true)
    expect(measured.overflow.every((o) => o === 'ellipsis')).toBe(true)
    expect(measured.reach).toBeLessThanOrEqual(489)
  })

  test('a long title on a standing spine is whole in the DOM and only CSS shortens it', async ({ page }) => {
    test.skip(page.viewportSize()!.width < 1280, 'the phone has the pile, where titles wrap in full')
    await withFixture(page, {}, { view: 'shelf' })
    await ready(page)
    const measured = await page.locator('button.vol[aria-label^="The Very Long"]').evaluate((spine) => {
      const title = spine.querySelector('span') as HTMLElement
      const box = spine.getBoundingClientRect()
      const drawn = title.getBoundingClientRect()
      return {
        text: title.textContent,
        clamp: getComputedStyle(title).webkitLineClamp,
        inside: drawn.left >= box.left - 0.5 && drawn.right <= box.right + 0.5,
      }
    })
    expect(measured).toEqual({ text: 'The Very Long and Winding Chronicle of the Amber Chartmakers', clamp: '3', inside: true })
  })

  test('on the PC a band lifts its world; below 1280 px it is not a target of its own', async ({ page }) => {
    await withFixture(page, {}, { view: 'circle' })
    await ready(page)
    const point = await page.locator('.arc[data-arc="scadrial"] .arc-hit').evaluate((hit) => {
      const path = hit as SVGPathElement
      const p = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(path.getScreenCTM()!)
      return { x: p.x, y: p.y }
    })
    await page.mouse.click(point.x, point.y)
    const pc = page.viewportSize()!.width >= 1280
    await expect(page.locator('.arc.relief')).toHaveCount(pc ? 2 : 0)
    if (pc) expect(await page.locator('.arc').first().evaluate((el) => getComputedStyle(el).cursor)).toBe('pointer')
    else await expect(page.locator('.t[aria-pressed=true]')).toHaveCount(1)
    expect(Object.keys((await storedState(page)).marks)).toHaveLength(0)
  })
})

for (const view of ['circle', 'shelf'] as const) {
  test.describe(`${view} view`, () => {
    test('select, mark, undo', async ({ page }) => {
      await withFixture(page, {}, { view })
      await ready(page)
      await pick(page, 'Ash Road')
      await page.getByRole('button', { name: en('markRead'), exact: true }).click()
      await expect(page.getByRole('status').filter({ hasText: en('markedRead') })).toBeVisible()
      expect((await storedState(page)).marks['ash-road']?.status).toBe('read')

      await page.getByRole('button', { name: en('undo'), exact: true }).click()
      await expect(page.getByRole('button', { name: en('markRead'), exact: true })).toBeVisible()
      expect((await storedState(page)).marks['ash-road']?.status ?? 'none').toBe('none')
    })

    test('stamping starts an animation, and it ends', async ({ page }) => {
      await withFixture(page, {}, { view })
      await ready(page)
      await pick(page, 'Ash Road')
      await page.getByRole('button', { name: en('markRead'), exact: true }).click()
      await expect(page.locator('.plate-title.stamped')).toBeVisible()
      expect(await page.evaluate(() => document.getAnimations().length)).toBeGreaterThan(0)
      await expect(page.locator('.plate-title.stamped')).toHaveCount(0, { timeout: 4000 })
    })

    test('a skipped work leaves the gaps sentence', async ({ page }) => {
      await withFixture(page, { marks: marksOf(['copper-orchard'], 'reading') }, { view })
      await ready(page)
      const gaps = page.locator('.gaps')
      await expect(gaps.getByRole('button', { name: 'Ash Road', exact: true })).toBeVisible()
      await gaps.getByRole('button', { name: 'Ash Road', exact: true }).click()
      await expect(page.locator('.plate-title')).toHaveText('Ash Road')
      // The phone plate takes no touch for 400 ms after it opens.
      await page.waitForTimeout(450)
      await page.getByRole('button', { name: en('markSkipped'), exact: true }).click()
      // On the PC the sentence folds to its first line while a card is open beside the ring: close it to read on.
      if (view === 'circle' && (page.viewportSize()?.width ?? 0) >= 1280) await page.keyboard.press('Escape')
      await expect(gaps.getByRole('button', { name: 'Ash Road', exact: true })).toHaveCount(0)
      await expect(gaps.getByRole('button', { name: 'Glass Harbour', exact: true })).toBeVisible()
      expect((await storedState(page)).marks['ash-road']?.status).toBe('skipped')
    })

    test('each gap button takes its own clicks, and has room for a finger on the phone', async ({ page }) => {
      await withFixture(page, { marks: marksOf(['copper-orchard'], 'reading') }, { view })
      await ready(page)
      const buttons = page.locator('.gaps .gap-btn')
      expect(await buttons.count()).toBeGreaterThan(1)
      const boxes = await buttons.evaluateAll((all) =>
        all.map((el) => {
          const box = el.getBoundingClientRect()
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
          return { own: hit === el, height: box.height, left: box.left, right: box.right, top: box.top, bottom: box.bottom }
        }),
      )
      expect(boxes.every((b) => b.own)).toBe(true)
      for (const [i, a] of boxes.entries()) {
        for (const b of boxes.slice(i + 1)) {
          const apart = a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top
          expect(apart).toBe(true)
        }
      }
      if (page.viewportSize()!.width < 1280) expect(Math.min(...boxes.map((b) => b.height))).toBeGreaterThanOrEqual(44)
    })

    test('the plate lifts a world, and the footer lets it go', async ({ page }) => {
      await withFixture(page, {}, { view })
      await ready(page)
      await pick(page, 'Copper Orchard')
      await page.locator('.plate .plate-world').click()
      await expect(page.locator('.plate .plate-world')).toHaveAttribute('aria-pressed', 'true')
      await expect(page.locator('[aria-label^="Ash Road,"].relief')).toHaveCount(1)
      await expect(page.locator('[aria-label^="Copper Orchard,"].relief')).toHaveCount(0)
      expect(Object.keys((await storedState(page)).marks)).toHaveLength(0)

      await page.locator('.foot-btn').click()
      await expect(page.locator('.relief')).toHaveCount(0)
      await expect(page.locator('.plate .plate-world')).toHaveAttribute('aria-pressed', 'false')
      // Session only: nothing about it is saved.
      expect(JSON.stringify(await storedPrefs(page))).not.toContain('lift')
    })

    test('the filters panel lifts a world', async ({ page }) => {
      await withFixture(page, {}, { view })
      await ready(page)
      await control(page, en('filters')).click()
      await page.locator('.panel [data-group="world"]').getByRole('button', { name: 'Nalthis', exact: true }).click()
      await expect(page.locator('[aria-label^="Ash Road,"].relief')).toHaveCount(1)
    })

    test('mark an anthology, cancel, confirm', async ({ page }) => {
      await withFixture(page, {}, { view })
      await ready(page)
      await pick(page, 'Salt and Lantern')
      await page.getByRole('button', { name: en('markRead'), exact: true }).click()
      await expect(page.getByRole('alertdialog')).toBeVisible()

      await page.getByRole('button', { name: en('cancel'), exact: true }).click()
      await expect(page.getByRole('alertdialog')).toHaveCount(0)
      expect(Object.keys((await storedState(page)).marks)).toHaveLength(0)

      await page.getByRole('button', { name: en('markRead'), exact: true }).click()
      await page.getByRole('button', { name: en('anthologyAll'), exact: true }).click()
      const marks = (await storedState(page)).marks
      expect(marks['salt-and-lantern']?.status).toBe('read')
      expect(marks['lantern-keeper']?.status).toBe('read')
    })

    test('unlock, confirm, undo', async ({ page }) => {
      await withFixture(page, {}, { view })
      await ready(page)
      await pick(page, 'Copper Orchard')
      await control(page, en('spoilers')).click()
      await page.getByRole('button', { name: en('unlockButton', 'Copper Orchard'), exact: true }).click()
      await page.getByRole('button', { name: en('unlockYes'), exact: true }).click()
      expect((await storedState(page)).unlocks['copper-orchard']?.on).toBe(true)

      await page.getByRole('button', { name: en('lockAgain'), exact: true }).click()
      expect((await storedState(page)).unlocks['copper-orchard']?.on).toBe(false)
    })

    test('change language and reload, it is remembered', async ({ page }) => {
      await withFixture(page, {}, { view, lang: 'en' })
      await ready(page)
      await openSettings(page)
      await page.getByRole('button', { name: t('language_es', 'es'), exact: true }).click()
      await expect(page.locator('html')).toHaveAttribute('lang', 'es')
      await page.reload()
      await expect(page.locator('.app')).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', 'es')
      expect((await storedPrefs(page)).lang).toBe('es')
    })

    test('filter, order, reload', async ({ page }) => {
      await withFixture(page, {}, { view })
      await ready(page)
      await control(page, en('filters')).click()
      await page.getByRole('button', { name: en('orderPublication') }).click()
      await page.getByRole('button', { name: new RegExp(`^${en('statusAnnounced')}`) }).click()
      await page.reload()
      await expect(page.locator('.app')).toBeVisible()
      const prefs = await storedPrefs(page)
      expect(prefs.order).toBe('publication')
      expect(prefs.filters.statuses).not.toContain('announced')
      await control(page, en('filters')).click()
      await expect(page.getByRole('button', { name: en('orderPublication') })).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByRole('button', { name: new RegExp(`^${en('statusAnnounced')}`) })).toHaveAttribute('aria-pressed', 'false')
    })

    test('export then import in a clean context', async ({ page, browser, baseURL }) => {
      await withFixture(page, { marks: marksOf(['ash-road', 'glass-harbour']) }, { view })
      await ready(page)
      await openSettings(page)
      const download = page.waitForEvent('download')
      await page.getByRole('button', { name: en('export'), exact: true }).click()
      const stream = await (await download).createReadStream()
      const chunks: Buffer[] = []
      for await (const chunk of stream) chunks.push(chunk as Buffer)
      const exported = Buffer.concat(chunks)

      const context = await browser.newContext({ baseURL, serviceWorkers: 'block' })
      const clean = await context.newPage()
      await withFixture(clean, {}, { view })
      await ready(clean)
      await openSettings(clean)
      await clean.locator('input[type=file]').setInputFiles({ name: 'lo-leido.json', mimeType: 'application/json', buffer: exported })
      await expect(clean.getByRole('status').filter({ hasText: en('importDone', 2) })).toBeVisible()
      const marks = (await storedState(clean)).marks
      expect(marks['ash-road']?.status).toBe('read')
      expect(marks['glass-harbour']?.status).toBe('read')
      await context.close()
    })

    test('importing garbage shows a message and changes nothing', async ({ page }) => {
      await withFixture(page, { marks: marksOf(['ash-road']) }, { view })
      await ready(page)
      await openSettings(page)
      const before = await storedState(page)
      await page.locator('input[type=file]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('this is not a copy') })
      await expect(page.getByText(en('importBad'))).toBeVisible()
      expect(await storedState(page)).toEqual(before)
    })

    test('connections file aborted: list works, no lines, quiet sentence', async ({ page }) => {
      await withFixture(page, { marks: marksOf(CATALOG_IDS) }, { view, connections: 'abort' })
      await ready(page)
      await expect(page.locator('.app[data-connections="failed"]')).toBeVisible()
      await pick(page, 'Ash Road')
      if (await page.locator('.plate-more').isVisible()) await page.locator('.plate-more').click()
      await expect(page.locator('.cons-empty')).toHaveText(en('conEmpty'))
      await expect(page.locator('path.linea')).toHaveCount(0)
      await expect(page.getByRole('alert')).toHaveCount(0)
      await expect(page.locator('[aria-label^="Glass Harbour,"]')).toBeVisible()
    })

    test('reduced motion: stamping starts no animation', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await withFixture(page, {}, { view })
      await ready(page)
      await pick(page, 'Ash Road')
      await page.getByRole('button', { name: en('markRead'), exact: true }).click()
      await expect(page.getByRole('status').filter({ hasText: en('markedRead') })).toBeVisible()
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
    })
  })
}

test('a mark made in a tab that closes at once reaches the other tab, and goes out from there', async ({ context }) => {
  const closing = await context.newPage()
  const staying = await context.newPage()
  await withFixture(closing, {}, { view: 'shelf' })
  await withFixture(staying, {}, { view: 'shelf' })
  const sent: string[] = []
  await staying.route('**/api/state', (route) => {
    sent.push(route.request().postData() ?? '')
    return route.fulfill({ json: { marks: {}, unlocks: {} } })
  })
  await ready(closing)
  await ready(staying)

  await pick(closing, 'Ash Road')
  await closing.getByRole('button', { name: en('markRead'), exact: true }).click()
  await closing.close()

  // The tab that stays follows after a longer delay, so that the other's own sync would have gone first.
  await expect.poll(() => sent.some((body) => body.includes('"ash-road"')), { timeout: FOLLOW_DELAY_MS * 2 }).toBe(true)
  expect((await storedState(staying)).marks['ash-road']?.status).toBe('read')
})

test('an address whose path reads as another host, with the sign-in marker, still mounts', async ({ page, baseURL }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.name))
  await withFixture(page, {}, { view: 'shelf' })
  await page.goto(`${baseURL}//evil.example/?signin=1`)
  await expect(page.locator('.app')).toBeVisible()
  expect(new URL(page.url()).host).toBe(new URL(baseURL!).host)
  expect(new URL(page.url()).search).toBe('')
  expect(errors).toEqual([])
})

test.describe('a double tap on the phone', () => {
  test.skip(({ viewport }) => viewport!.width >= 1280, 'the phone layout')

  async function doubleTap(page: Page, button: string): Promise<void> {
    await withFixture(page, {}, { view: 'shelf' })
    await page.goto('/')
    await expect(page.locator('.app')).toBeVisible()
    await bookButton(page, 'Ash Road').tap()
    const target = page.locator('.plate-actions').getByRole('button', { name: button, exact: true })
    const box = (await target.boundingBox())!
    // The second tap of the pair, where the plate's button now is.
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
    expect(Object.keys((await storedState(page)).marks)).toHaveLength(0)
    // A deliberate tap once the plate has settled still marks.
    await page.waitForTimeout(500)
    await target.tap()
  }

  test('does not mark the book read, and a deliberate tap later does', async ({ page }) => {
    await doubleTap(page, en('markRead'))
    expect((await storedState(page)).marks['ash-road']?.status).toBe('read')
  })

  test('does not mark it as reading either', async ({ page }) => {
    await doubleTap(page, en('markReading'))
    expect((await storedState(page)).marks['ash-road']?.status).toBe('reading')
  })
})
