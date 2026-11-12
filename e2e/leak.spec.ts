import { expect, test, type Page } from '@playwright/test'
import { filterConnections } from '../src/filters/filters'
import { t, type Lang } from '../src/i18n'
import { isMet, visible } from '../src/spoilers/visible'
import type { Marks, Unlocks } from '../src/spoilers/visible'
import type { View } from '../src/state/prefs'
import { fixtureCatalog } from '../tests/fixtures/catalog'
import { CATALOG_IDS, everyFilter, marksOf, openSettled, pick, storedState, unlocksOf, withFixture } from './support'

const catalog = fixtureCatalog()
const EVERYTHING_BUT_ONE = CATALOG_IDS.filter((id) => id !== 'northern-gale')

interface Case {
  name: string
  marks: Marks
  unlocks: Unlocks
  /** What the engine must let through in this state, written out by hand. */
  visibleIds: string[]
}

const CASES: Case[] = [
  { name: 'nothing read', marks: {}, unlocks: {}, visibleIds: [] },
  { name: 'one end of c-0001', marks: marksOf(['ash-road']), unlocks: {}, visibleIds: ['c-0004'] },
  { name: 'both ends of c-0002, not its third book', marks: marksOf(['glass-harbour', 'northern-gale']), unlocks: {}, visibleIds: [] },
  { name: 'everything but one book', marks: marksOf(EVERYTHING_BUT_ONE), unlocks: {}, visibleIds: ['c-0001', 'c-0004', 'c-0005'] },
  { name: 'one book unlocked', marks: marksOf(['ash-road']), unlocks: unlocksOf(['copper-orchard']), visibleIds: ['c-0001', 'c-0004'] },
]

const VIEWS: View[] = ['map', 'circle', 'shelf']
const LANGS: Lang[] = ['es', 'en']
const BOOKS: { id: string; titles: Record<Lang, string> }[] = [
  { id: 'ash-road', titles: { en: 'Ash Road', es: 'Camino de ceniza' } },
  { id: 'glass-harbour', titles: { en: 'Glass Harbour', es: 'Puerto de cristal' } },
  { id: 'northern-gale', titles: { en: 'Northern Gale', es: 'Vendaval del norte' } },
  { id: 'copper-orchard', titles: { en: 'Copper Orchard', es: 'Huerto de cobre' } },
  { id: 'orchard-dusk', titles: { en: 'Orchard Dusk', es: 'Ocaso del huerto' } },
]

async function assertNoLeak(page: Page, hiddenIds: string[]): Promise<void> {
  const html = await page.content() // markup and every attribute
  const aria = await page.locator('body').ariaSnapshot()
  const text = await page.locator('body').innerText()
  for (const id of hiddenIds) {
    for (const needle of [`LEAK-${id}`, id]) {
      expect(html.includes(needle), `${id} in the DOM`).toBe(false)
      expect(aria.includes(needle), `${id} in the accessibility tree`).toBe(false)
      expect(text.includes(needle), `${id} in the visible text`).toBe(false)
    }
  }
}

/** Opens the plate's fold on the phone, so the list is rendered. */
async function expandPlate(page: Page): Promise<void> {
  const more = page.locator('.plate-more')
  if ((await more.isVisible()) && (await more.getAttribute('aria-expanded')) === 'false') await more.click()
}

for (const c of CASES) {
  for (const view of VIEWS) {
    for (const lang of LANGS) {
      test(`no hidden connection reaches the page: ${c.name}, ${view}, ${lang}`, async ({ page }) => {
        await withFixture(page, { marks: c.marks, unlocks: c.unlocks }, { view, lang })
        await openSettled(page)

        const shown = filterConnections(visible(catalog, c.marks, c.unlocks), everyFilter())
        expect(shown.map((x) => x.id).sort()).toEqual(c.visibleIds)
        const hidden = catalog.connections.filter((x) => !isMet(x, c.marks, c.unlocks)).map((x) => x.id)
        expect(hidden.length).toBeGreaterThan(0)
        await assertNoLeak(page, hidden)

        let listed = 0
        for (const book of BOOKS) {
          await pick(page, book.titles[lang])
          await expandPlate(page)
          const mine = shown.filter((x) => x.from === book.id || x.to === book.id).length
          listed += mine
          await expect(page.locator('.plate-title')).toHaveText(book.titles[lang])
          await expect(page.locator('.con-b'), `${book.id}: connections listed`).toHaveCount(mine)
          await assertNoLeak(page, hidden)
          // Listed, not opened: not even a visible connection's text is in the page yet.
          expect(await page.content()).not.toContain('LEAK-')
        }
        expect(listed > 0, 'a book lists a connection exactly when one is visible').toBe(c.visibleIds.length > 0)

        const lines = shown.filter((x) => x.from !== null && x.to !== null).length
        await expect(page.locator('path.linea')).toHaveCount(view === 'shelf' ? 0 : lines)
      })
    }
  }
}

test('everything read: every two-ended connection is a line in the circle', async ({ page }) => {
  await withFixture(page, { marks: marksOf(CATALOG_IDS) }, { view: 'circle', lang: 'en' })
  await openSettled(page)
  const shown = filterConnections(visible(catalog, marksOf(CATALOG_IDS), {}), everyFilter())
  expect(shown).toHaveLength(catalog.connections.length)
  await expect(page.locator('path.linea')).toHaveCount(shown.filter((x) => x.to !== null).length)
  expect(await page.content()).not.toContain('LEAK-')
})

for (const view of VIEWS) {
  for (const theories of [true, false]) {
    test(`a read theory: text only on request and only with theories on, ${view}, theories ${theories ? 'on' : 'off'}`, async ({ page }) => {
      const marks = marksOf(['orchard-dusk', 'northern-gale'])
      await withFixture(page, { marks }, { view, lang: 'en', filters: { ...everyFilter(), theories } })
      await openSettled(page)
      await pick(page, 'Orchard Dusk')
      await expandPlate(page)
      expect(await page.content()).not.toContain('LEAK-')

      if (!theories) {
        await expect(page.locator('.con-b')).toHaveCount(0)
        await expect(page.locator('path.linea')).toHaveCount(0)
        await assertNoLeak(page, ['c-0003'])
        return
      }
      await expect(page.locator('.con-b')).toHaveCount(1)
      await expect(page.locator('path.linea')).toHaveCount(view === 'shelf' ? 0 : 1)
      expect(await page.content()).not.toContain('LEAK-')
      await page.locator('.con-b').click()
      expect(await page.content()).toContain('LEAK-c-0003')
      await assertNoLeak(page, catalog.connections.filter((x) => x.id !== 'c-0003').map((x) => x.id))
    })
  }
}

for (const view of VIEWS) {
  test(`URL parameters reveal nothing, ${view}`, async ({ page }) => {
    await withFixture(page, { marks: marksOf(['ash-road']) }, { view, lang: 'en', filters: { ...everyFilter(), theories: false } })
    const snapshot = async (url: string) => {
      await openSettled(page, url)
      await pick(page, 'Ash Road')
      await expandPlate(page)
      await expect(page.locator('.plate-title')).toHaveText('Ash Road')
      await page.waitForFunction(() => document.getAnimations().length === 0)
      return page.locator('#app').innerHTML()
    }
    const plain = await snapshot('/')
    for (const url of ['/?spoilers=1&connections=all&theories=1&unlock=all', '/?signin=1&spoilers=1&connections=all&theories=1&unlock=all']) {
      const withParams = await snapshot(url)
      expect(withParams, url).toBe(plain)
      expect(withParams, url).not.toContain('LEAK-')
    }
    await assertNoLeak(
      page,
      catalog.connections.filter((x) => x.id !== 'c-0004').map((x) => x.id),
    )
    await expect(page.locator('.con-b')).toHaveCount(1)
  })
}

test('connection text is absent from the DOM until requested, even with everything read', async ({ page }) => {
  await withFixture(page, { marks: marksOf(CATALOG_IDS) }, { view: 'shelf', lang: 'en' })
  await openSettled(page)
  await pick(page, 'Ash Road')
  await expandPlate(page)
  const buttons = page.locator('.con-b')
  await expect(buttons.first()).toBeVisible()
  expect(await page.content()).not.toContain('LEAK-')

  await buttons.first().click()
  const opened = (await page.locator('.con-note').getAttribute('id'))!.replace('note-', '')
  const html = await page.content()
  expect(html).toContain(`LEAK-${opened}`)
  for (const c of catalog.connections.filter((x) => x.id !== opened)) {
    expect(html.includes(`LEAK-${c.id}`), `${c.id} in the DOM`).toBe(false)
  }
})

test.describe('a real pointer selects and never marks', () => {
  for (const view of VIEWS) {
    test(`click or tap on a book, ${view}`, async ({ page }, testInfo) => {
      await withFixture(page, {}, { view, lang: 'en' })
      await openSettled(page)
      const target = page.locator('[aria-label^="Glass Harbour,"]')
      if (testInfo.project.name === 'phone') await target.tap()
      else await target.click()
      await expect(target).toHaveAttribute('aria-pressed', 'true')
      await expect(page.locator('.plate-title')).toHaveText('Glass Harbour')
      expect(Object.keys((await storedState(page)).marks)).toHaveLength(0)
    })
  }
})

test.describe('panels and pointers carry nothing hidden', () => {
  for (const c of CASES) {
    for (const view of VIEWS) {
      test(`filters and settings open, hover and focus: ${c.name}, ${view}`, async ({ page }) => {
        await withFixture(page, { marks: c.marks, unlocks: c.unlocks }, { view, lang: 'en' })
        await openSettled(page)
        const hidden = catalog.connections.filter((x) => !isMet(x, c.marks, c.unlocks)).map((x) => x.id)
        expect(hidden.length).toBeGreaterThan(0)

        for (const name of [/^Filters$/, /^Settings$/, /^(Spoiler free|\d+ by hand)$/]) {
          await page.getByRole('button', { name }).click()
          await expect(page.locator('.panel')).toBeVisible()
          await assertNoLeak(page, hidden)
          await page.getByRole('button', { name: 'Close', exact: true }).click()
        }

        // Hover and focus on every book, then look again.
        const books = page.locator('g.t, button.vol, button.flat')
        for (let i = 0; i < (await books.count()); i++) {
          await books.nth(i).hover({ force: true })
          await books.nth(i).focus()
        }
        // A line takes no pointer, so hovering one proves nothing. What can fail: that it stays out of reach and says nothing.
        const lines = await page.locator('path.linea').evaluateAll((all) =>
          all.map((el) => ({
            pointer: getComputedStyle(el).pointerEvents,
            hidden: el.getAttribute('aria-hidden'),
            text: el.textContent,
            label: el.getAttribute('aria-label'),
          })),
        )
        for (const line of lines) expect(line).toEqual({ pointer: 'none', hidden: 'true', text: '', label: null })
        await assertNoLeak(page, hidden)
        expect(await page.content()).not.toContain('LEAK-')
      })
    }
  }

  for (const view of VIEWS) {
    test(`the footer at zero is the same in every state, and a count shows only what is visible, ${view}`, async ({ browser, baseURL, viewport, hasTouch }) => {
      const footerIn = async (c: Case): Promise<{ text: string; counts: number; date: string; credit: string }> => {
        // Pages of one context share storage, and the seed only fills an empty one: each state needs its own.
        const own = await browser.newContext({ baseURL, viewport, hasTouch, serviceWorkers: 'block' })
        const fresh = await own.newPage()
        await withFixture(fresh, { marks: c.marks, unlocks: c.unlocks }, { view, lang: 'en' })
        await openSettled(fresh)
        const footer = fresh.locator('footer')
        await expect(footer).toContainText(/\d{4}/)
        const seen = {
          text: await footer.innerText(),
          counts: await footer.locator('.foot-count').count(),
          date: await footer.locator('.foot-date').innerText(),
          credit: await footer.locator('.credit').innerText(),
        }
        await own.close()
        return seen
      }
      const atZero = CASES.filter((c) => c.visibleIds.length === 0)
      expect(atZero.length).toBeGreaterThan(1)
      const footers = await Promise.all(atZero.map(footerIn))
      for (const seen of footers) {
        expect(seen.counts).toBe(0)
        expect(seen.text).toBe(footers[0]!.text)
        expect(seen.text).not.toMatch(/connection/i)
      }
      // At zero the footer holds the date, the fixed «unofficial» notice and the credit, and nothing else: anything more
      // could be a count of what is hidden.
      const { text, date, credit } = footers[0]!
      expect(date.match(/\d+/g)).toEqual(['4', '2026'])
      expect(credit).toBe(t('credit', 'en'))
      expect(text.replace(date, '').replace(credit, '').replace(t('unofficial', 'en'), '').trim()).toBe('')

      for (const c of CASES.filter((x) => x.visibleIds.length > 0)) {
        const seen = await footerIn(c)
        const n = c.visibleIds.length
        expect(seen.counts).toBe(1)
        expect(seen.text).toContain(n === 1 ? '1 connection in view' : `${n} connections in view`)
      }
    })

    test(`the filters panel shows no number derived from connections, ${view}`, async ({ browser, baseURL, viewport, hasTouch }) => {
      const panelText = async (marks: Marks): Promise<string> => {
        // One context per state: pages of a shared one keep the first state's storage, and it would compare a state with itself.
        const own = await browser.newContext({ baseURL, viewport, hasTouch, serviceWorkers: 'block' })
        const fresh = await own.newPage()
        await withFixture(fresh, { marks }, { view, lang: 'en' })
        await openSettled(fresh)
        await fresh.getByRole('button', { name: 'Filters', exact: true }).click()
        const text = await fresh.locator('.panel').innerText()
        await own.close()
        return text
      }
      const none = await panelText({})
      const all = await panelText(marksOf(CATALOG_IDS))
      const some = await panelText(marksOf(EVERYTHING_BUT_ONE))
      expect(all).toBe(none)
      expect(some).toBe(none)
    })

    test(`no number anywhere derives from hidden connections: filters, settings, spoilers, header, ${view}`, async ({ browser, baseURL, viewport, hasTouch }) => {
      const moreHidden = Array.from({ length: 7 }, (_, i) => ({
        ...catalog.connections[0]!,
        id: `c-01${String(i).padStart(2, '0')}`,
        requires: ['ash-road', 'copper-orchard', 'northern-gale'],
      }))
      const numbers = (text: string): string[] => text.match(/\d+/g) ?? []

      const read = async (marks: Marks, extra: boolean): Promise<Record<string, string[]>> => {
        const own = await browser.newContext({ baseURL, viewport, hasTouch, serviceWorkers: 'block' })
        const fresh = await own.newPage()
        await withFixture(fresh, { marks }, { view, lang: 'en' })
        if (extra) {
          await fresh.route('**/data/connections.json', (route) => route.fulfill({ json: [...catalog.connections, ...moreHidden] }))
        }
        await openSettled(fresh)
        const spine = fresh.locator('.spine')
        const seen: Record<string, string[]> = { header: numbers(`${await spine.innerText()} ${await spine.ariaSnapshot()}`) }
        for (const [key, name] of [['filters', /^Filters$/], ['settings', /^Settings$/], ['spoilers', /^Spoiler free$/]] as const) {
          await fresh.getByRole('button', { name }).click()
          seen[key] = numbers(await fresh.locator('.panel').innerText())
          await fresh.getByRole('button', { name: 'Close', exact: true }).click()
        }
        await own.close()
        return seen
      }

      for (const marks of [{}, marksOf(['ash-road']), marksOf(EVERYTHING_BUT_ONE)] as Marks[]) {
        const plain = await read(marks, false)
        expect(await read(marks, true)).toEqual(plain)
        expect(plain.settings).toEqual([])
        // The only number the spoilers panel may hold is the global count of what is visible.
        const count = filterConnections(visible(catalog, marks, {}), everyFilter()).length
        expect(plain.spoilers).toEqual(count > 0 ? [String(count)] : [])
      }
    })
  }

  test('the Spanish description appears only after asking', async ({ page }) => {
    await withFixture(page, { marks: marksOf(CATALOG_IDS) }, { view: 'shelf', lang: 'es' })
    await openSettled(page)
    await pick(page, 'Camino de ceniza')
    await expandPlate(page)
    await expect(page.locator('.con-b').first()).toBeVisible()
    expect(await page.content()).not.toContain('LEAK-')
    await page.locator('.con-b').first().click()
    const opened = (await page.locator('.con-note').getAttribute('id'))!.replace('note-', '')
    const html = await page.content()
    expect(html).toContain(`LEAK-${opened} es`)
    expect(html).not.toContain(`LEAK-${opened} en`)
  })

  for (const view of VIEWS) {
    test(`an appearance marker follows its requirements, and the type filter, ${view}`, async ({ page }) => {
      await withFixture(page, {}, { view, lang: 'en' })
      await openSettled(page)
      await pick(page, 'Ash Road')
      await expandPlate(page)
      await expect(page.locator('.con-b')).toHaveCount(0)
      await assertNoLeak(page, ['c-0004'])

      await page.getByRole('button', { name: 'Mark as read', exact: true }).click()
      await expect(page.locator('.con-b')).toHaveCount(1)
      expect(await page.content()).not.toContain('LEAK-')
      await page.locator('.con-b').click()
      expect(await page.content()).toContain('LEAK-c-0004')
    })
  }

  for (const view of VIEWS) {
    test(`an appearance marker stays hidden when its type is filtered out, ${view}`, async ({ page }) => {
      const filters = { ...everyFilter(), connectionTypes: everyFilter().connectionTypes.filter((x) => x !== 'appearance') }
      await withFixture(page, { marks: marksOf(['ash-road']) }, { view, lang: 'en', filters })
      await openSettled(page)
      await pick(page, 'Ash Road')
      await expandPlate(page)
      await expect(page.locator('.con-b')).toHaveCount(0)
      await expect(page.locator('path.linea')).toHaveCount(0)
      await assertNoLeak(page, ['c-0004'])
    })
  }
})

// Synopses and notes behind the gate. Nothing read: the second work of the Orchard series has a gated synopsis,
// and both notes wait on works not read. The opener's synopsis is open.
const CONTENT_HIDDEN = ['syn-orchard-dusk', 'n-0001', 'n-0002']
const title = (id: string, lang: Lang) => BOOKS.find((b) => b.id === id)!.titles[lang]

for (const view of VIEWS) {
  for (const lang of LANGS) {
    test(`no gated synopsis text or hidden note reaches the page, ${view}, ${lang}`, async ({ page }) => {
      await withFixture(page, {}, { view, lang })
      await openSettled(page)
      await expect(page.locator('.app[data-content="available"]')).toBeVisible()
      await assertNoLeak(page, CONTENT_HIDDEN)
      for (const book of BOOKS) {
        await pick(page, book.titles[lang])
        await expandPlate(page)
        await assertNoLeak(page, CONTENT_HIDDEN)
        expect(await page.content()).not.toContain('LEAK-')
        await expect(page.locator('.plate-notes')).toHaveCount(0)
      }
      await pick(page, title('orchard-dusk', lang))
      await expect(page.locator('.syn')).toHaveText(t('synopsisGated', lang))
      await pick(page, title('copper-orchard', lang))
      await expandPlate(page)
      await page.locator('.syn button').click()
      await expect(page.locator('.syn-text')).toHaveText(`LEAK-syn-copper-orchard ${lang}`)
      await assertNoLeak(page, CONTENT_HIDDEN)
    })
  }
}

for (const view of VIEWS) {
  test(`URL parameters reveal no synopsis or note, ${view}`, async ({ page }) => {
    await withFixture(page, {}, { view, lang: 'en' })
    for (const url of ['/?spoilers=1&synopses=all&notes=all&unlock=all', '/?signin=1&unlock=all&theories=1']) {
      await openSettled(page, url)
      await expect(page.locator('.app[data-content="available"]')).toBeVisible()
      await pick(page, 'Orchard Dusk')
      await expandPlate(page)
      await expect(page.locator('.syn')).toHaveText(t('synopsisGated', 'en'))
      await assertNoLeak(page, CONTENT_HIDDEN)
      expect(await page.content(), url).not.toContain('LEAK-')
    }
  })
}

test('a note shows once its works are read, and its text only on request', async ({ page }) => {
  await withFixture(page, { marks: marksOf(['ash-road', 'glass-harbour']) }, { view: 'shelf', lang: 'es' })
  await openSettled(page)
  await pick(page, 'Puerto de cristal')
  await expandPlate(page)
  await expect(page.locator('.plate-notes .note-b')).toHaveCount(1)
  expect(await page.content()).not.toContain('LEAK-n-0002')
  await page.locator('.plate-notes .note-b').click()
  await expect(page.locator('.plate-notes .note-text')).toContainText('LEAK-n-0002 es')
})
