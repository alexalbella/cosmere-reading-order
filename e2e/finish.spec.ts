import { expect, test, type Page } from '@playwright/test'
import { t } from '../src/i18n'
import { marksOf, openSettled, pick, withFixture } from './support'
import { fixtureCatalog } from '../tests/fixtures/catalog'

// What the design gate found, kept found: state you can see, focus that never falls to the page,
// a sentence that does not claim more than the filters show.

const en = (key: Parameters<typeof t>[0], ...args: (string | number)[]) => t(key, 'en', ...args)
const isPhone = (page: Page) => page.viewportSize()!.width < 1280
const GOLD = 'rgb(226, 192, 112)'

async function ready(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('.app')).toBeVisible()
}

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

async function press(page: Page, name: string): Promise<void> {
  await button(page, name).focus()
  await page.keyboard.press('Enter')
}

test('a read book is stamped in gold on its spine and an unread one is not', async ({ page }) => {
  await withFixture(page, { marks: marksOf(['ash-road']) }, { view: 'shelf' })
  await ready(page)
  const colour = (label: string) =>
    page.locator(`[aria-label^="${label},"] span`).first().evaluate((el) => getComputedStyle(el).color)
  expect(await colour('Ash Road')).toBe(GOLD)
  expect(await colour('Copper Orchard')).not.toBe(GOLD)
})

test.describe('the focus never falls to the page', () => {
  test('marking hands it to the undo, and undoing hands it back', async ({ page }) => {
    await withFixture(page, {}, { view: 'shelf' })
    await ready(page)
    await pick(page, 'Ash Road')
    await press(page, en('markRead'))
    await expect(button(page, en('undo'))).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(button(page, en('markRead'))).toBeFocused()
  })

  test('a panel takes it, Esc closes the panel and gives it back to what opened it', async ({ page }) => {
    await withFixture(page, {}, { view: 'shelf' })
    await ready(page)
    await press(page, en('filters'))
    await expect(page.locator('.panel')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.locator('.panel')).toHaveCount(0)
    await expect(button(page, en('filters'))).toBeFocused()
  })

  test('the close button of a panel gives it back too', async ({ page }) => {
    await withFixture(page, {}, { view: 'shelf' })
    await ready(page)
    await press(page, en('settings'))
    await page.locator('.panel .plate-x').focus()
    await page.keyboard.press('Enter')
    await expect(button(page, en('settings'))).toBeFocused()
  })

  test('declining an unlock goes back to the button that asked', async ({ page }) => {
    await withFixture(page, {}, { view: 'shelf' })
    await ready(page)
    await pick(page, 'Ash Road')
    await page.locator(isPhone(page) ? '.spine-lock' : '.m-spoilers').click()
    const ask = page.locator('.panel .btn-danger')
    await ask.focus()
    await page.keyboard.press('Enter')
    await expect(button(page, en('unlockNo'))).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(ask).toBeFocused()
  })

  test('on the phone, Esc closes the plate and goes back to the book', async ({ page }) => {
    test.skip(!isPhone(page), 'on the PC the plate stays')
    await withFixture(page, {}, { view: 'shelf' })
    await ready(page)
    await pick(page, 'Ash Road')
    await expect(page.locator('.plate-title')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.slot .plate')).toHaveCount(0)
    await expect(page.locator('[aria-label^="Ash Road,"]')).toBeFocused()
  })
})

test.describe('the sentence claims no more than is on show', () => {
  const noStatus = {
    statuses: [],
    formats: ['novel', 'novella', 'short', 'comic', 'illustrated', 'anthology', 'essay'] as const,
    series: [],
    phases: [],
    connectionTypes: ['major', 'significant'] as const,
    theories: false,
  }

  test('filtering everything out says so, and there is a way back', async ({ page }) => {
    await withFixture(page, {}, { view: 'shelf', filters: { ...noStatus, formats: [...noStatus.formats], connectionTypes: [...noStatus.connectionTypes] } })
    await ready(page)
    await expect(page.locator('.sentence')).toContainText(en('nothingLeft'))
    await expect(page.locator('.sentence')).not.toContainText(en('allRead'))
    await page.getByRole('button', { name: en('clearFilters'), exact: true }).click()
    await expect(page.locator('.sentence')).toContainText(en('startWith'))
  })

  test('with every work read and no filter on, it says everything is read', async ({ page }) => {
    const ids = fixtureCatalog().books.map((b) => b.id)
    await withFixture(page, { marks: marksOf(ids) }, { view: 'shelf', filters: { ...noStatus, statuses: ['published'], formats: [...noStatus.formats], connectionTypes: [...noStatus.connectionTypes] } })
    await ready(page)
    await expect(page.locator('.sentence')).toContainText(en('allRead'))
    await expect(page.getByRole('button', { name: en('clearFilters'), exact: true })).toHaveCount(0)
  })
})

test.describe('the phone', () => {
  test('the count reads on one line', async ({ page }) => {
    test.skip(!isPhone(page), 'on the PC it stands in the strip')
    await withFixture(page, {}, { view: 'shelf' })
    await ready(page)
    const box = await page.locator('.tally').boundingBox()
    expect(box!.height).toBeLessThan(24)
  })

  test('a book chosen low in the list stays in sight once the plate docks', async ({ page }) => {
    test.skip(!isPhone(page), 'on the PC nothing docks')
    await withFixture(page, {}, { view: 'shelf' })
    await page.setViewportSize({ width: 390, height: 600 })
    await ready(page)
    const rows = page.locator('.flat')
    const last = await rows.evaluateAll((els, bottom) => {
      let found = 0
      els.forEach((el, i) => {
        if (el.getBoundingClientRect().bottom < bottom) found = i
      })
      return found
    }, 600)
    await rows.nth(last).click()
    await expect(page.locator('.plate-title')).toBeVisible()
    const seen = await page.evaluate(() => {
      const row = document.querySelector('.flat.sel')!.getBoundingClientRect()
      const list = document.querySelector('.area')!.getBoundingClientRect()
      return row.top >= list.top && row.bottom <= list.bottom
    })
    expect(seen).toBe(true)
  })
})

test.describe('the phone sentence and gaps', () => {
  test.skip(({ viewport }) => viewport!.width >= 1280, 'the phone layout')

  test('it runs as a sentence, and each title still has 44 px of its own', async ({ page }) => {
    await withFixture(page, { marks: marksOf(['ash-road'], 'reading') }, { view: 'shelf' })
    await ready(page)
    const titles = page.locator('.sentence .title-btn')
    await expect(titles).toHaveCount(2)
    expect(await page.locator('.kicker').first().evaluate((el) => getComputedStyle(el).display)).toBe('inline')
    const reach = await titles.evaluateAll((all) =>
      all.map((el) => {
        const box = el.getBoundingClientRect()
        const x = box.left + box.width / 2
        let top = Infinity
        let bottom = -Infinity
        for (let y = 0; y < innerHeight; y++) {
          if (document.elementFromPoint(x, y) === el) {
            top = Math.min(top, y)
            bottom = Math.max(bottom, y)
          }
        }
        return { top, bottom }
      }),
    )
    for (const { top, bottom } of reach) expect(bottom - top + 1).toBeGreaterThanOrEqual(44)
    expect(reach[0]!.bottom).toBeLessThan(reach[1]!.top)
  })

  test('gaps that fit one row stay a sentence', async ({ page }) => {
    await withFixture(page, { marks: marksOf(['glass-harbour'], 'reading') }, { view: 'shelf' })
    await ready(page)
    await expect(page.locator('.gaps .gap-btn')).toHaveCount(1)
    await expect(page.locator('.gaps-list')).toHaveCount(0)
    await expect(page.locator('.gaps')).toHaveText(`${en('skipped')} Ash Road.`)
  })

  test('gaps that do not fit become a list, one title a row, with no joining word left over', async ({ page }) => {
    await withFixture(page, { marks: marksOf(['copper-orchard'], 'reading') }, { view: 'shelf' })
    await ready(page)
    await expect(page.locator('.gaps-list')).toHaveCount(1)
    const rows = await page.locator('.gaps .gap-btn').evaluateAll((all) => all.map((el) => el.getBoundingClientRect()).map((b) => ({ top: b.top, height: b.height })))
    expect(rows.length).toBeGreaterThan(1)
    for (const [i, row] of rows.entries()) {
      expect(row.height).toBeGreaterThanOrEqual(44)
      if (i > 0) expect(row.top).toBeGreaterThanOrEqual(rows[i - 1]!.top + 44)
    }
    await expect(page.locator('.gaps-join:visible')).toHaveCount(0)
    await expect(page.locator('.gaps')).not.toContainText(',', { useInnerText: true })
  })

  test('turning the phone fits the gaps again, both ways', async ({ page }) => {
    await withFixture(page, { marks: marksOf(['copper-orchard'], 'reading') }, { view: 'shelf' })
    await ready(page)
    await expect(page.locator('.gaps-list')).toHaveCount(1)

    await page.setViewportSize({ width: 844, height: 390 })
    await expect(page.locator('.gaps-list')).toHaveCount(0)
    await expect(page.locator('.gaps-join').first()).toBeVisible()
    const row = await page.locator('.gaps').boundingBox()
    expect(row!.height).toBeLessThanOrEqual(44)

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.locator('.gaps-list')).toHaveCount(1)
  })

  test('the label shares the first title\'s row, and each title keeps its 44 px', async ({ page }) => {
    await withFixture(page, { marks: marksOf(['copper-orchard'], 'reading') }, { view: 'shelf' })
    await ready(page)
    await expect(page.locator('.gaps-list')).toHaveCount(1)
    await expect(page.locator('.gaps-alone')).toHaveCount(0)
    const label = (await page.locator('.gaps-label').boundingBox())!
    const first = (await page.locator('.gap-btn').first().boundingBox())!
    expect(first.height).toBeGreaterThanOrEqual(44)
    expect(label.y).toBeGreaterThanOrEqual(first.y)
    expect(label.y + label.height).toBeLessThanOrEqual(first.y + first.height)
    expect(first.x).toBeGreaterThanOrEqual(label.x + label.width)
  })

  test('a first title too long to share a row has the label above it, nearer its list', async ({ page }) => {
    await withFixture(page, { marks: marksOf(['ash-road'], 'reading') }, { view: 'shelf' })
    const books = fixtureCatalog().books.map((b) => (b.id === 'long-title-book' ? { ...b, order: { recommended: 0, publication: 0 } } : b))
    await page.route('**/data/books.json', (route) => route.fulfill({ json: books }))
    await ready(page)
    await expect(page.locator('.gaps-alone')).toHaveCount(1)
    const label = page.locator('.gaps-label')
    const below = (await page.locator('.gap-btn').first().boundingBox())!
    const box = (await label.boundingBox())!
    expect(below.y).toBeGreaterThanOrEqual(box.y + box.height - 1)
    expect(below.height).toBeGreaterThanOrEqual(44)
    expect(await label.evaluate((el) => parseFloat(getComputedStyle(el).marginTop))).toBeGreaterThanOrEqual(10)
  })

  test('the shelf has its walnut interior behind the pile', async ({ page }) => {
    await withFixture(page, {}, { view: 'shelf' })
    await ready(page)
    expect(await page.locator('.area').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(21, 17, 13)')
  })
})

test.describe('the blind tooling on the PC', () => {
  test.skip(({ viewport }) => viewport!.width < 1280, 'the PC layout')

  test('it is on the leather and not on the walnut', async ({ page }) => {
    await withFixture(page, {}, { view: 'circle' })
    await ready(page)
    await expect(page.locator('.fillet')).toHaveCount(1)
    await page.locator('.tabs .tab').nth(2).click()
    await expect(page.locator('.cover.interior')).toBeVisible()
    await expect(page.locator('.fillet')).toHaveCount(0)
  })

  test('an open panel starts below the corner tool', async ({ page }) => {
    await withFixture(page, {}, { view: 'circle' })
    await ready(page)
    await press(page, en('filters'))
    const tool = (await page.locator('.fillet-corner.top-right').boundingBox())!
    const star = await page.locator('.fillet-corner.top-right path').nth(2).evaluate((el) => el.getBoundingClientRect().bottom)
    expect(star).toBeLessThanOrEqual(tool.y + tool.height)
    // The panel's outer frame stands 5 px outside its box.
    const panel = (await page.locator('.panel').boundingBox())!
    expect(panel.y - 5).toBeGreaterThanOrEqual(star)
  })
})

test('a note opened in the plate comes into view', async ({ page }) => {
  await withFixture(page, { marks: marksOf(['ash-road', 'copper-orchard']) }, { view: 'shelf' })
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 640 })
  await openSettled(page)
  await pick(page, 'Ash Road')
  if (isPhone(page)) await page.locator('.plate-more').click()
  await page.locator('.con-b').first().click()
  const seen = await page.evaluate(() => {
    const note = document.querySelector('.con-note')!.getBoundingClientRect()
    const plate = document.querySelector('.slot .plate')!.getBoundingClientRect()
    return note.bottom <= plate.bottom + 1
  })
  expect(seen).toBe(true)
})
