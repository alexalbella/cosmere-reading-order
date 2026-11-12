import { expect, type Page } from '@playwright/test'
import { BOOK_STATUSES, CONNECTION_TYPES, FORMATS } from '../src/data/types'
import type { BookId, Connection, Note } from '../src/data/types'
import type { Filters } from '../src/filters/filters'
import type { Lang } from '../src/i18n'
import type { Marks, MarkStatus, Unlocks } from '../src/spoilers/visible'
import type { View } from '../src/state/prefs'
import { fixtureCatalog } from '../tests/fixtures/catalog'
import { fixtureNotes, fixtureSynopses } from '../tests/fixtures/content'

export interface SeedState {
  marks?: Marks
  unlocks?: Unlocks
}

export interface FixtureOptions {
  view?: View
  lang?: Lang
  /** Every filter on and theories shown, unless a test says otherwise. */
  filters?: Filters
  /** `abort` makes the connections file fail to load. */
  connections?: 'ok' | 'abort'
  /** `abort` makes the synopses and notes files fail to load. */
  content?: 'ok' | 'abort'
}

export const AT = 1_700_000_000_000

export function everyFilter(): Filters {
  return {
    statuses: [...BOOK_STATUSES],
    formats: [...FORMATS],
    series: [],
    phases: [],
    connectionTypes: [...CONNECTION_TYPES],
    theories: true,
  }
}

export function marksOf(ids: BookId[], status: MarkStatus = 'read'): Marks {
  return Object.fromEntries(ids.map((id) => [id, { status, at: AT }]))
}

export function unlocksOf(ids: BookId[]): Unlocks {
  return Object.fromEntries(ids.map((id) => [id, { on: true, at: AT }]))
}

/** Every free-text field of a connection and of its sources carries the marker, not only the description. */
function marked(c: Connection): Connection {
  const tag = `LEAK-${c.id}`
  return {
    ...c,
    sources: c.sources.map((s) => ({ ...s, url: `${s.url}?m=${tag}`, cites: `${tag} cites` })),
    author: `${c.author}-${tag}`,
    verifiedBy: `${c.verifiedBy}-${tag}`,
  }
}

/** The same for a note: its sources and provenance carry the marker too. */
function markedNote(n: Note): Note {
  const tag = `LEAK-${n.id}`
  return { ...n, sources: n.sources.map((s) => ({ ...s, url: `${s.url}?m=${tag}` })), author: `${n.author}-${tag}`, verifiedBy: `${n.verifiedBy}-${tag}` }
}

/**
 * Serves the fixture catalogue in place of the real data, stubs the sync endpoint with an empty
 * state, and seeds preferences and the read state. A key already in storage is left alone, so a
 * reload keeps what the page wrote.
 */
export async function withFixture(page: Page, readState: SeedState = {}, options: FixtureOptions = {}): Promise<void> {
  const catalog = fixtureCatalog()
  await page.route('**/data/*.json', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()
    if (name === 'books.json') return route.fulfill({ json: catalog.books })
    if (name === 'meta.json') return route.fulfill({ json: catalog.meta })
    if (name === 'connections.json') {
      return options.connections === 'abort' ? route.abort() : route.fulfill({ json: catalog.connections.map(marked) })
    }
    if (name === 'synopses.json') return options.content === 'abort' ? route.abort() : route.fulfill({ json: fixtureSynopses() })
    if (name === 'notes.json') return options.content === 'abort' ? route.abort() : route.fulfill({ json: fixtureNotes().map(markedNote) })
    return route.fulfill({ status: 404, body: '' })
  })
  await page.route('**/api/state', (route) => route.fulfill({ json: { marks: {}, unlocks: {} } }))

  const prefs = {
    lang: options.lang ?? 'en',
    view: options.view ?? 'circle',
    order: 'recommended',
    filters: options.filters ?? everyFilter(),
  }
  const state = { marks: readState.marks ?? {}, unlocks: readState.unlocks ?? {} }
  await page.addInitScript(
    ([p, s]) => {
      if (localStorage.getItem('cosmere.prefs.v1') === null) localStorage.setItem('cosmere.prefs.v1', p)
      if (localStorage.getItem('cosmere.state.v1') === null) localStorage.setItem('cosmere.state.v1', s)
    },
    [JSON.stringify(prefs), JSON.stringify(state)] as const,
  )
}

/**
 * Opens the page and waits until the connections, synopses and notes files have been answered and applied. The
 * page is ready before that, so a check that something hidden is absent would pass for the wrong reason if it
 * ran any earlier.
 */
export async function openSettled(page: Page, url = '/'): Promise<void> {
  await page.goto(url)
  await expect(page.locator('.app[data-connections="available"]:not([data-content="pending"])')).toBeVisible()
}

/** The book's button, in either view, by the start of its accessible name (title, then a comma). */
export function bookButton(page: Page, title: string) {
  return page.locator(`[aria-label^="${title},"]`)
}

export async function pick(page: Page, title: string): Promise<void> {
  const target = bookButton(page, title)
  await target.focus()
  await page.keyboard.press('Enter')
  // On the phone the plate takes no touch for 400 ms after it opens (a double tap must not mark): a person
  // reads before pressing, and so does a test.
  if ((page.viewportSize()?.width ?? 1280) < 1280) await page.waitForTimeout(450)
}

export const CATALOG_IDS = fixtureCatalog().books.map((b) => b.id)

export async function storedState(page: Page): Promise<{ marks: Marks; unlocks: Unlocks }> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('cosmere.state.v1') ?? '{}'))
}

export async function storedPrefs(page: Page): Promise<{ lang: Lang; view: View; order: string; filters: Filters }> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('cosmere.prefs.v1') ?? '{}'))
}
