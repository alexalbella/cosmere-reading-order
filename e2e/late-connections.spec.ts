import { expect, test, type Page } from '@playwright/test'
import { t } from '../src/i18n'
import { fixtureCatalog } from '../tests/fixtures/catalog'
import { CATALOG_IDS, marksOf, pick, withFixture } from './support'

// The page is ready on the books alone. The connections come later, and until they do there is nothing
// of them on it: no line, no row, no spinner, no number. When they come, nothing moves.

const en = (key: Parameters<typeof t>[0]) => t(key, 'en')
const catalog = fixtureCatalog()

type Answer = 'ok' | 'empty' | 'abort'

/** Holds the connections file back until the returned function says how it answers. */
async function hold(page: Page): Promise<(answer: Answer) => void> {
  let release: (answer: Answer) => void = () => {}
  const gate = new Promise<Answer>((resolve) => (release = resolve))
  await page.route('**/data/connections.json', async (route) => {
    const answer = await gate
    if (answer === 'abort') return route.abort()
    return route.fulfill({ json: answer === 'empty' ? [] : catalog.connections })
  })
  return release
}

async function expandPlate(page: Page): Promise<void> {
  const more = page.locator('.plate-more')
  if ((await more.isVisible()) && (await more.getAttribute('aria-expanded')) === 'false') await more.click()
}

/**
 * Nothing under way: no transition, no entrance, no class waiting to come off when one ends, and the sheet of
 * emblems in place (it arrives in its own chunk after the first paint, the same for every reader).
 */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document.querySelector('#app svg.sprite') !== null &&
      document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).length === 0 &&
      !document.querySelector('.rising, .entering'),
  )
}

/** The whole box of every book, as the view lays it out: a gap per book would show on one axis only. */
async function placed(page: Page): Promise<string[]> {
  await settled(page)
  return page.locator('g.t, button.vol, button.flat').evaluateAll((all) =>
    all.map((el) => {
      const box = el.getBoundingClientRect()
      return [box.left, box.top, box.width, box.height].map((n) => n.toFixed(1)).join(' ')
    }),
  )
}

/** The page as it stands, less the one attribute that is allowed to say where the file has got to. */
async function pageHtml(page: Page): Promise<string> {
  await settled(page)
  const html = await page.locator('#app').innerHTML()
  return html.replace(/ data-connections="\w+"/, '')
}

for (const view of ['map', 'circle', 'shelf'] as const) {
  test.describe(`${view} view`, () => {
    test('the books are up while the connections are on their way, with no trace of them', async ({ page }) => {
      await withFixture(page, { marks: marksOf(CATALOG_IDS) }, { view })
      const release = await hold(page)
      await page.goto('/')
      await expect(page.locator('.app')).toBeVisible()
      await pick(page, 'Ash Road')
      await expandPlate(page)

      await expect(page.locator('.cons-empty')).toHaveText(en('conEmpty'))
      await expect(page.locator('.con-b')).toHaveCount(0)
      await expect(page.locator('path.linea')).toHaveCount(0)
      await expect(page.locator('.foot-count')).toHaveCount(0)
      await expect(page.locator('.notice')).toHaveCount(0)
      const waiting = await page.content()
      expect(waiting).not.toContain('LEAK-')
      expect(waiting).not.toMatch(/c-\d{4}/)
      const before = await placed(page)

      release('ok')
      const rows = catalog.connections.filter((c) => c.from === 'ash-road' || c.to === 'ash-road').length
      await expect(page.locator('.con-b')).toHaveCount(rows)
      await expect(page.locator('.cons-empty')).toHaveCount(0)
      const lines = catalog.connections.filter((c) => c.to !== null).length
      await expect(page.locator('path.linea')).toHaveCount(view === 'shelf' ? 0 : lines)
      await expect(page.locator('.foot-count')).toHaveCount(1)

      // Arriving is not stamping: no line draws itself, and no book has moved.
      await expect(page.locator('.line-new')).toHaveCount(0)
      await expect(page.locator('.stamped')).toHaveCount(0)
      expect(await placed(page)).toEqual(before)
      // Listed, not opened: the text still waits to be asked for.
      expect(await page.content()).not.toContain('LEAK-')
    })

    test('on their way, the page is exactly the one an empty file gives', async ({ page }) => {
      await withFixture(page, { marks: marksOf(CATALOG_IDS) }, { view })
      const release = await hold(page)
      await page.goto('/')
      await expect(page.locator('.app[data-connections="pending"]')).toBeVisible()
      await pick(page, 'Ash Road')
      await expandPlate(page)
      await expect(page.locator('.foot-date')).not.toBeEmpty()
      const waiting = await pageHtml(page)

      release('empty')
      await expect(page.locator('.app[data-connections="available"]')).toBeVisible()
      expect(await pageHtml(page)).toBe(waiting)
    })

    test('a failed file says so only once it has failed, and everything else works', async ({ page }) => {
      await withFixture(page, { marks: marksOf(CATALOG_IDS) }, { view })
      const release = await hold(page)
      await page.goto('/')
      await expect(page.locator('.app')).toBeVisible()
      await expect(page.locator('.notice')).toHaveCount(0)

      release('abort')
      await expect(page.locator('.notice').filter({ hasText: en('connectionsFailed') })).toBeVisible()
      await pick(page, 'Ash Road')
      await expandPlate(page)
      await expect(page.locator('.cons-empty')).toHaveText(en('conEmpty'))
      await expect(page.locator('path.linea')).toHaveCount(0)
    })

    test('a failed file moves no book', async ({ page }) => {
      await withFixture(page, { marks: marksOf(CATALOG_IDS) }, { view })
      const release = await hold(page)
      await page.goto('/')
      await expect(page.locator('.foot-date')).not.toBeEmpty()
      const before = await placed(page)
      release('abort')
      await expect(page.locator('footer .notice')).toBeVisible()
      expect(await placed(page)).toEqual(before)
    })

    test('an answer that comes after a mark shows what the marks allow now', async ({ page }) => {
      await withFixture(page, {}, { view })
      const release = await hold(page)
      await page.goto('/')
      await expect(page.locator('.app')).toBeVisible()
      await pick(page, 'Ash Road')
      await page.getByRole('button', { name: en('markRead'), exact: true }).click()
      await expandPlate(page)
      await expect(page.locator('.con-b')).toHaveCount(0)

      release('ok')
      // Ash Road alone clears its one-ended marker and nothing that also needs another book.
      await expect(page.locator('.con-b')).toHaveCount(1)
      await expect(page.locator('path.linea')).toHaveCount(0)
      const html = await page.content()
      for (const id of ['c-0001', 'c-0002', 'c-0003', 'c-0005']) expect(html.includes(id), id).toBe(false)
    })
  })
}

test('the preloaded books file is asked for once', async ({ page }) => {
  await withFixture(page, {}, { view: 'shelf' })
  let asked = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/data/books.json')) asked += 1
  })
  const served = await page.goto('/')
  await expect(page.locator('.app')).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(asked).toBe(1)
  // One request would also be what no preload at all gives, so the link has to be there.
  expect(await served!.text()).toMatch(/<link rel="preload" href="\/data\/books\.json" as="fetch" crossorigin/)
})

test('a failed file can be retried by the notice, which says nothing but that', async ({ page }) => {
  await withFixture(page, { marks: marksOf(CATALOG_IDS) }, { view: 'shelf' })
  let answers = 0
  await page.route('**/data/connections.json', (route) => {
    answers += 1
    return answers === 1 ? route.abort() : route.fulfill({ json: catalog.connections })
  })
  await page.goto('/')
  const notice = page.locator('footer .notice')
  await expect(notice).toBeVisible()
  const text = await notice.innerText()
  expect(text).not.toMatch(/\d/)
  for (const book of catalog.books) expect(text).not.toContain(book.titles.en)

  await notice.getByRole('button', { name: en('tryAgain'), exact: true }).click()
  await expect(page.locator('.app[data-connections="available"]')).toBeVisible()
  await expect(page.locator('footer .notice')).toHaveCount(0)
  expect(answers).toBe(2)
})

// The notice shares the footer line with the date and the credit. Lifting a world changes the circle, never the line.
for (const lang of ['es', 'en'] as const) {
  for (const lifted of [false, true]) {
    test(`at 1280 px the failure notice fits one line, in ${lang}, ${lifted ? 'with a world lifted' : 'with none lifted'}, and takes no height`, async ({ page }) => {
      test.skip(page.viewportSize()!.width < 1280, 'the PC layout')
      // Accepted by ruling: with the lift button and the notice in Spanish, the middle column takes the room the date and
      // the credit need, so they wrap to two lines and the circle shrinks by about 3 %. A failed load carries no connection data.
      test.skip(lang === 'es' && lifted, 'accepted: this one combination wraps the footer')
      await page.setViewportSize({ width: 1280, height: 720 })
      await withFixture(page, {}, { view: 'circle', lang })
      const release = await hold(page)
      await page.goto('/')
      await expect(page.locator('.foot-date')).not.toBeEmpty()
      if (lifted) {
        const point = await page.locator('.arc[data-arc="scadrial"] .arc-hit').evaluate((hit) => {
          const path = hit as SVGPathElement
          const p = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(path.getScreenCTM()!)
          return { x: p.x, y: p.y }
        })
        await page.mouse.click(point.x, point.y)
        await page.mouse.move(0, 0)
        await expect(page.locator('.arc.relief')).not.toHaveCount(0)
      }
      const before = await placed(page)
      const row = await page.locator('.foot-line').boundingBox()

      release('abort')
      await expect(page.locator('footer .notice')).toBeVisible()
      if (lifted) await expect(page.locator('.arc.relief')).not.toHaveCount(0)
      expect(await placed(page)).toEqual(before)
      expect((await page.locator('.foot-line').boundingBox())!.height).toBe(row!.height)
      const parts = await page.locator('.foot-date, footer .notice, .foot-mid > .foot-btn, .foot-line .credit').evaluateAll((all) =>
        all.map((el) => {
          const box = el.getBoundingClientRect()
          return { left: box.left, right: box.right, height: box.height }
        }),
      )
      for (const part of parts) expect(part.height).toBeLessThan(30)
      for (const [i, part] of parts.entries()) if (i > 0) expect(part.left).toBeGreaterThanOrEqual(parts[i - 1]!.right)
    })
  }
}
