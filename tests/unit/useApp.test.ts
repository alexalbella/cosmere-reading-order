import { afterEach, describe, expect, test, vi } from 'vitest'
import { nextTick, watch } from 'vue'
import { useApp } from '../../src/app/useApp'
import { filterConnections } from '../../src/filters/filters'
import { visible } from '../../src/spoilers/visible'
import { fixtureCatalog } from '../fixtures/catalog'

function fakeStorage(seed: Record<string, string> = {}): Storage {
  const data = new Map<string, string>(Object.entries(seed))
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  }
}

function make(opts: { storage?: Storage; mutate?: (c: ReturnType<typeof fixtureCatalog>) => void } = {}) {
  const catalog = fixtureCatalog()
  opts.mutate?.(catalog)
  return useApp({
    initial: { catalog, connectionsAvailable: true },
    storage: opts.storage ?? fakeStorage(),
    now: () => 1_000_000,
  })
}

const statusOf = (app: ReturnType<typeof make>, id: string) => app.state.value.marks[id]?.status ?? 'none'

afterEach(() => vi.useRealTimers())

describe('useApp', () => {
  test('selectBook changes no marks', () => {
    const app = make()
    app.markBooks(['ash-road'], 'read')
    const before = JSON.stringify(app.state.value)
    app.selectBook('glass-harbour')
    expect(app.selectedId.value).toBe('glass-harbour')
    expect(JSON.stringify(app.state.value)).toBe(before)
  })

  test('markBooks then undoLast restores marks exactly', () => {
    const app = make()
    app.markBooks(['ash-road'], 'read')
    app.markBooks(['ash-road', 'glass-harbour'], 'reading')
    expect(statusOf(app, 'glass-harbour')).toBe('reading')
    app.undoLast()
    expect(statusOf(app, 'ash-road')).toBe('read')
    expect(statusOf(app, 'glass-harbour')).toBe('none')
  })

  test('marking read sets stampedId, and it clears by itself', () => {
    vi.useFakeTimers()
    const app = make()
    app.markBooks(['ash-road'], 'read')
    expect(app.stampedId.value).toBe('ash-road')
    vi.advanceTimersByTime(3000)
    expect(app.stampedId.value).toBeNull()
  })

  test('marking something other than read stamps nothing', () => {
    const app = make()
    app.markBooks(['ash-road'], 'reading')
    expect(app.stampedId.value).toBeNull()
  })

  test('unlockBook can be undone with unlockBook(id, false)', () => {
    const app = make()
    app.unlockBook('ash-road', true)
    app.unlockBook('copper-orchard', true)
    expect(app.visibleConnections.value.map((c) => c.id)).toEqual(['c-0001'])
    app.unlockBook('ash-road', false)
    expect(app.visibleConnections.value).toEqual([])
  })

  test('the visible list recomputes after marking a book not yet in the state', async () => {
    const app = make()
    expect(app.visibleConnections.value).toEqual([])
    app.markBooks(['ash-road'], 'read')
    app.markBooks(['copper-orchard'], 'read')
    await nextTick()
    expect(app.visibleConnections.value.map((c) => c.id)).toEqual(['c-0001'])
    expect(app.connectionsOf('copper-orchard').map((c) => c.id)).toEqual(['c-0001'])
    expect(app.connectionsOf('northern-gale')).toEqual([])
  })

  test('new connections are reported as fresh after a stamp, and undo removes them', () => {
    const app = make()
    app.markBooks(['ash-road'], 'read')
    app.markBooks(['copper-orchard'], 'read')
    expect([...app.freshConnectionIds.value]).toEqual(['c-0001'])
    app.undoLast()
    expect(app.visibleConnections.value).toEqual([])
  })

  test('theories and connection types in the filters keep their effect on what is visible', () => {
    const app = make()
    for (const id of ['orchard-dusk', 'northern-gale']) app.markBooks([id], 'read')
    expect(app.visibleConnections.value).toEqual([])
    app.filters.value = { ...app.filters.value, connectionTypes: ['minor'], theories: true }
    expect(app.visibleConnections.value.map((c) => c.id)).toEqual(['c-0003'])
  })

  test('shownBooks hides role-playing and announced books by default, and shows rpg when included', () => {
    const app = make()
    const ids = () => app.shownBooks.value.map((b) => b.id)
    expect(ids()).not.toContain('paper-wolves')
    expect(ids()).not.toContain('low-tide-atlas')
    app.filters.value = { ...app.filters.value, formats: [...app.filters.value.formats, 'rpg'] }
    expect(ids()).toContain('paper-wolves')
  })

  test('current, next and gaps follow the marks', () => {
    const app = make()
    expect(app.nextBook.value?.id).toBe('ash-road')
    app.markBooks(['glass-harbour'], 'reading')
    expect(app.currentBook.value?.id).toBe('glass-harbour')
    expect(app.gapBooks.value.map((b) => b.id)).toEqual(['ash-road'])
    app.markBooks(['ash-road'], 'skipped')
    expect(app.gapBooks.value).toEqual([])
    expect(app.nextBook.value?.id).toBe('salt-and-lantern')
  })

  test('markOf and isUnlocked read the state, and are the one place that does', () => {
    const app = make()
    expect(app.markOf('ash-road')).toBe('none')
    expect(app.isUnlocked('ash-road')).toBe(false)
    app.markBooks(['ash-road'], 'reading')
    app.unlockBook('ash-road', true)
    expect(app.markOf('ash-road')).toBe('reading')
    expect(app.isUnlocked('ash-road')).toBe(true)
    app.unlockBook('ash-road', false)
    expect(app.isUnlocked('ash-road')).toBe(false)
  })

  test('a lifted world lasts the session: it is never saved', async () => {
    const storage = fakeStorage()
    const app = make({ storage })
    expect(app.lifted.value).toBeNull()
    app.toggleLift('scadrial')
    app.lang.value = 'en' // anything that saves the preferences
    await nextTick()
    expect(app.lifted.value).toBe('scadrial')
    expect(storage.getItem('cosmere.prefs.v1')).not.toContain('scadrial')
    expect(storage.getItem('cosmere.state.v1') ?? '').not.toContain('scadrial')
    expect(make({ storage }).lifted.value).toBeNull()
    app.toggleLift('scadrial')
    expect(app.lifted.value).toBeNull()
  })

  test('only a world with something on show can be lifted', () => {
    const app = make()
    app.toggleLift('roshar') // no book of it in the fixture
    expect(app.lifted.value).toBeNull()
  })

  test('the state is replaced, never written in place', () => {
    const app = make()
    const before = app.state.value
    app.markBooks(['ash-road'], 'read')
    expect(app.state.value).not.toBe(before)
    expect(before.marks['ash-road']).toBeUndefined()
  })

  test('a store that cannot be read is reported, and a clean one is not', () => {
    const bad = make({ storage: fakeStorage({ 'cosmere.state.v1': '{broken' }) })
    expect(bad.stateCorrupt.value).toBe(true)
    expect(make().stateCorrupt.value).toBe(false)
  })

  test('rekeying does not save when nothing moved', () => {
    const storage = fakeStorage()
    make({ storage })
    expect(storage.getItem('cosmere.state.v1')).toBeNull()
  })

  test('a mark stored under an alias is moved to the current id on load', () => {
    const storage = fakeStorage({
      'cosmere.state.v1': JSON.stringify({ marks: { 'old-ash': { status: 'read', at: 5 } }, unlocks: {} }),
    })
    const app = make({
      storage,
      mutate: (c) => {
        c.books[0]!.aliases = ['old-ash']
      },
    })
    expect(statusOf(app, 'ash-road')).toBe('read')
    expect(app.state.value.marks['old-ash']).toBeUndefined()
  })

  test('importing a file whose ids are aliases moves them too, and says what it did', () => {
    const app = make({
      mutate: (c) => {
        c.books[0]!.aliases = ['old-ash']
      },
    })
    const text = JSON.stringify({
      version: 1,
      marks: { 'old-ash': { status: 'read', at: 5 }, stranger: { status: 'read', at: 5 } },
      unlocks: {},
    })
    expect(app.planImport(text)?.apply(true)).toEqual({ ok: true, marked: 1, unlocked: 0, unknown: 1 })
    expect(statusOf(app, 'ash-road')).toBe('read')
    expect(app.planImport('{nope')).toBeNull()
  })

  describe('an import and its unlocks', () => {
    const file = (marks: Record<string, unknown>, unlocks: Record<string, unknown>) => JSON.stringify({ version: 1, marks, unlocks })
    const on = (at: number) => ({ on: true, at })
    const read = (at: number) => ({ status: 'read', at })

    test('a file with no new unlock imports as it did, and the plan names none', () => {
      const app = make()
      const plan = app.planImport(file({ 'ash-road': read(5) }, {}))!
      expect(plan.newUnlocks).toEqual([])
      expect(plan.unknownUnlocks).toBe(0)
      expect(plan.apply(true)).toEqual({ ok: true, marked: 1, unlocked: 0, unknown: 0 })
    })

    test('a file of only unlocks names them, writes nothing until answered, and reports them when applied', () => {
      const app = make()
      const before = app.state.value
      const plan = app.planImport(file({}, { 'ash-road': on(5), 'glass-harbour': on(5) }))!
      expect(plan.newUnlocks.map((b) => b.id)).toEqual(['ash-road', 'glass-harbour'])
      expect(app.state.value).toBe(before)
      expect(plan.apply(true)).toEqual({ ok: true, marked: 0, unlocked: 2, unknown: 0 })
      expect(app.isUnlocked('ash-road')).toBe(true)
      expect(app.isUnlocked('glass-harbour')).toBe(true)
    })

    test('unlocks that are on already are not new', () => {
      const app = make()
      app.unlockBook('ash-road', true)
      const plan = app.planImport(file({ 'glass-harbour': read(5) }, { 'ash-road': on(5) }))!
      expect(plan.newUnlocks).toEqual([])
      expect(plan.apply(true)).toMatchObject({ marked: 1, unlocked: 0 })
    })

    test('an id the catalogue lacks is not counted as marked, and its unlock is asked about too', () => {
      const app = make()
      const plan = app.planImport(file({ stranger: read(5) }, { stranger: on(5) }))!
      expect(plan.newUnlocks).toEqual([])
      expect(plan.unknownUnlocks).toBe(1)
      expect(plan.apply(true)).toEqual({ ok: true, marked: 0, unlocked: 0, unknown: 1 })
    })

    test('an entry that loses the merge is not counted', () => {
      const app = make()
      app.markBooks(['ash-road'], 'read')
      const newer = app.state.value.marks['ash-road']!.at + 1000
      const plan = app.planImport(file({ 'ash-road': { status: 'reading', at: newer - 2000 }, 'glass-harbour': read(5) }, {}))!
      expect(plan.apply(true)).toMatchObject({ marked: 1 })
      expect(statusOf(app, 'ash-road')).toBe('read')
    })

    test('a mark the file clears is a change but is not called marked', () => {
      const app = make()
      app.markBooks(['ash-road'], 'read')
      const at = app.state.value.marks['ash-road']!.at + 10
      const plan = app.planImport(file({ 'ash-road': { status: 'none', at }, 'glass-harbour': read(5) }, {}))!
      expect(plan.apply(true)).toMatchObject({ marked: 1 })
      expect(statusOf(app, 'ash-road')).toBe('none')
    })

    test('a mark the file repeats is not counted either', () => {
      const app = make()
      app.markBooks(['ash-road'], 'read')
      const at = app.state.value.marks['ash-road']!.at
      expect(app.planImport(file({ 'ash-road': read(at) }, {}))!.apply(true)).toMatchObject({ marked: 0 })
    })

    test('the first answer applies everything', () => {
      const app = make()
      app.planImport(file({ 'ash-road': read(5) }, { 'glass-harbour': on(5) }))!.apply(true)
      expect(statusOf(app, 'ash-road')).toBe('read')
      expect(app.isUnlocked('glass-harbour')).toBe(true)
    })

    test('the alternate applies the marks and drops the new unlocks', () => {
      const app = make()
      app.unlockBook('copper-orchard', true)
      const plan = app.planImport(file({ 'ash-road': read(5) }, { 'glass-harbour': on(5), 'copper-orchard': on(5), stranger: on(5) }))!
      expect(plan.apply(false)).toEqual({ ok: true, marked: 1, unlocked: 0, unknown: 0 })
      expect(statusOf(app, 'ash-road')).toBe('read')
      expect(app.isUnlocked('glass-harbour')).toBe(false)
      expect(app.isUnlocked('copper-orchard')).toBe(true)
      expect(app.state.value.unlocks['stranger']).toBeUndefined()
    })

    test('not answering applies nothing: the plan alone leaves state and disk as they were', () => {
      const storage = fakeStorage()
      const app = make({ storage })
      const before = app.state.value
      const disk = storage.getItem('cosmere.state.v1')
      app.planImport(file({ 'ash-road': read(5) }, { 'glass-harbour': on(5) }))
      expect(app.state.value).toBe(before)
      expect(storage.getItem('cosmere.state.v1')).toBe(disk)
    })
  })

  test('language, view, order and filters are remembered under cosmere.prefs.v1', async () => {
    const storage = fakeStorage()
    const app = make({ storage })
    app.lang.value = 'en'
    app.view.value = 'circle'
    app.order.value = 'publication'
    await nextTick()
    const saved = JSON.parse(storage.getItem('cosmere.prefs.v1')!) as Record<string, unknown>
    expect(saved).toMatchObject({ lang: 'en', view: 'circle', order: 'publication' })
    const again = make({ storage })
    expect(again.lang.value).toBe('en')
    expect(again.order.value).toBe('publication')
  })

  describe('an alias with a dot, as the real catalogue has', () => {
    const dotted = (catalog: ReturnType<typeof fixtureCatalog>) => {
      catalog.books.find((b) => b.id === 'ash-road')!.aliases = ['sa2.5']
    }
    const saved = JSON.stringify({ marks: { 'sa2.5': { status: 'read', at: 5 } }, unlocks: { 'sa2.5': { on: false, at: 6 } } })

    test('what was saved under it moves to the current id on load, and is saved there', () => {
      const storage = fakeStorage({ 'cosmere.state.v1': saved })
      const app = make({ storage, mutate: dotted })
      expect(statusOf(app, 'ash-road')).toBe('read')
      expect(app.state.value.marks['sa2.5']).toBeUndefined()
      expect(app.state.value.unlocks['ash-road']).toEqual({ on: false, at: 6 })
      const disk = JSON.parse(storage.getItem('cosmere.state.v1')!) as { marks: Record<string, unknown>; unlocks: Record<string, unknown> }
      expect(disk.marks).toEqual({ 'ash-road': { status: 'read', at: 5 } })
      expect(disk.unlocks).toEqual({ 'ash-road': { on: false, at: 6 } })
    })

    test('an import under it moves to the current id, and is counted', () => {
      const app = make({ mutate: dotted })
      const text = JSON.stringify({ version: 1, marks: { 'sa2.5': { status: 'read', at: 5 } }, unlocks: {} })
      expect(app.planImport(text)?.apply(true)).toEqual({ ok: true, marked: 1, unlocked: 0, unknown: 0 })
      expect(statusOf(app, 'ash-road')).toBe('read')
      expect(app.state.value.marks['sa2.5']).toBeUndefined()
    })
  })

  test('an import that would leave a state too large to sync is refused, and changes nothing', () => {
    const app = make()
    const big = (from: number) =>
      JSON.stringify({
        version: 1,
        marks: Object.fromEntries(Array.from({ length: 2500 }, (_, i) => [`stored-book-${from + i}`, { status: 'read', at: 5 }])),
        unlocks: {},
      })
    expect(app.planImport(big(0))?.apply(true).ok).toBe(true)
    const before = app.state.value
    expect(app.planImport(big(2500))?.apply(true).ok).toBe(true)
    const after = app.state.value
    expect(after).not.toBe(before)
    expect(app.planImport(big(5000))).toBeNull()
    expect(app.state.value).toBe(after)
  })

  test('without a catalogue to start from it loads one, and failure leaves status failed', async () => {
    const down = (async () => new Response('no', { status: 500 })) as typeof fetch
    const app = useApp({ fetchFn: down, storage: fakeStorage() })
    expect(app.status.value).toBe('loading')
    await vi.waitFor(() => expect(app.status.value).toBe('failed'))
    expect(app.catalog.value).toBeNull()
  })
})

describe('the catalogue arrives in parts', () => {
  const fixture = fixtureCatalog()
  const ids = fixture.books.map((b) => b.id)
  const flush = () => new Promise((resolve) => setTimeout(resolve))

  /** Books answer at once; connections and meta wait for their own call, once they have been asked for. */
  async function arriving(seed: Record<string, string> = {}) {
    let answerConnections: ((r: Response) => void) | undefined
    let answerMeta: ((r: Response) => void) | undefined
    const fetchFn = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('books.json')) return Response.json(fixture.books)
      if (url.endsWith('connections.json')) return new Promise<Response>((resolve) => (answerConnections = resolve))
      return new Promise<Response>((resolve) => (answerMeta = resolve))
    }) as typeof fetch
    const app = useApp({ fetchFn, storage: fakeStorage(seed), now: () => 1_000_000 })
    await vi.waitFor(() => expect(answerConnections && answerMeta).toBeTruthy())
    return {
      app,
      connections: (r: Response) => answerConnections!(r),
      meta: (r: Response) => answerMeta!(r),
    }
  }
  const readEverything = { 'cosmere.state.v1': JSON.stringify({ marks: Object.fromEntries(ids.map((id) => [id, { status: 'read', at: 1 }])), unlocks: {} }) }

  test('the books come first, and the rest is not asked for until they have had their paint', async () => {
    const asked: string[] = []
    const fetchFn = (async (input: RequestInfo | URL) => {
      asked.push(String(input).split('/').pop()!)
      return String(input).endsWith('books.json') ? Response.json(fixture.books) : new Response('no', { status: 500 })
    }) as typeof fetch
    const app = useApp({ fetchFn, storage: fakeStorage() })
    expect(asked).toEqual(['books.json'])
    let atReady: string[] = []
    watch(app.status, () => (atReady = [...asked]), { flush: 'sync' })
    await vi.waitFor(() => expect(app.status.value).toBe('ready'))
    expect(atReady).toEqual(['books.json'])
    await vi.waitFor(() => expect(asked.slice().sort()).toEqual(['books.json', 'connections.json', 'meta.json']))
  })

  test('ready on the books alone, with no connections while they are pending', async () => {
    const { app } = await arriving(readEverything)
    expect(app.status.value).toBe('ready')
    expect(app.connectionsState.value).toBe('pending')
    expect(app.catalog.value?.connections).toEqual([])
    expect(app.visibleConnections.value).toEqual([])
    expect(app.connectionsOf('ash-road')).toEqual([])
  })

  test('once they arrive they show under the normal rules, and the arrival stamps nothing', async () => {
    const { app, connections } = await arriving(readEverything)
    connections(Response.json(fixture.connections))
    await flush()
    expect(app.connectionsState.value).toBe('available')
    expect(app.visibleConnections.value.length).toBeGreaterThan(0)
    expect(app.freshConnectionIds.value.size).toBe(0)
    expect(app.stampedId.value).toBeNull()
  })

  test('a failure leaves none, and says it failed', async () => {
    const { app, connections } = await arriving(readEverything)
    connections(new Response('no', { status: 500 }))
    await flush()
    expect(app.connectionsState.value).toBe('failed')
    expect(app.status.value).toBe('ready')
    expect(app.visibleConnections.value).toEqual([])
  })

  test('a late answer gives what the marks allow now, and a stamp before it draws no line', async () => {
    const { app, connections } = await arriving()
    app.markBooks(['ash-road', 'copper-orchard'], 'read')
    expect(app.visibleConnections.value).toEqual([])
    connections(Response.json(fixture.connections))
    await flush()
    const expected = visible(fixture, app.state.value.marks, app.state.value.unlocks)
    const shown = app.visibleConnections.value.map((c) => c.id)
    expect(shown).toEqual(filterConnections(expected, app.filters.value).map((c) => c.id))
    expect(shown).toContain('c-0001')
    expect(shown).not.toContain('c-0002')
    expect(app.freshConnectionIds.value.size).toBe(0)
  })

  test('the date comes on its own', async () => {
    const { app, meta } = await arriving()
    expect(app.catalog.value?.meta.updatedOn).toBe('')
    meta(Response.json(fixture.meta))
    await flush()
    expect(app.catalog.value?.meta.updatedOn).toBe('2026-11-04')
    expect(app.connectionsState.value).toBe('pending')
  })

  test('books that cannot be applied are a failed load, not Loading for ever', async () => {
    const fetchFn = (async (input: RequestInfo | URL) =>
      String(input).endsWith('books.json') ? Response.json([null]) : new Response('no', { status: 500 })) as typeof fetch
    const app = useApp({ fetchFn, storage: fakeStorage() })
    await vi.waitFor(() => expect(app.status.value).toBe('failed'))
    expect(app.catalog.value).toBeNull()
  })

  test('a late answer after an unlock gives what the unlock allows, and draws no line', async () => {
    const { app, connections } = await arriving()
    app.markBooks(['ash-road'], 'read')
    app.unlockBook('copper-orchard', true)
    connections(Response.json(fixture.connections))
    await flush()
    const expected = filterConnections(visible(fixture, app.state.value.marks, app.state.value.unlocks), app.filters.value)
    const shown = app.visibleConnections.value.map((c) => c.id)
    expect(shown).toEqual(expected.map((c) => c.id))
    expect(shown).toContain('c-0001')
    expect(shown).not.toContain('c-0002')
    expect(app.freshConnectionIds.value.size).toBe(0)

    app.unlockBook('copper-orchard', false)
    expect(app.visibleConnections.value.map((c) => c.id)).not.toContain('c-0001')
  })

  test('a late answer after a language change keeps the language and the same set', async () => {
    const { app, connections } = await arriving(readEverything)
    app.lang.value = 'en'
    connections(Response.json(fixture.connections))
    await flush()
    expect(app.lang.value).toBe('en')
    const expected = filterConnections(visible(fixture, app.state.value.marks, app.state.value.unlocks), app.filters.value)
    expect(app.visibleConnections.value.map((c) => c.id)).toEqual(expected.map((c) => c.id))
    expect(expected.length).toBeGreaterThan(0)
  })

  test('a catalogue handed in says which state it starts in', () => {
    const handed = (connectionsAvailable: boolean) =>
      useApp({ initial: { catalog: fixtureCatalog(), connectionsAvailable }, storage: fakeStorage() }).connectionsState.value
    expect(handed(true)).toBe('available')
    expect(handed(false)).toBe('failed')
  })
})
