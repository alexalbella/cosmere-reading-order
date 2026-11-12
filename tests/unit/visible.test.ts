import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import type { BookId, Catalog, Connection } from '../../src/data/types'
import { isMet, isShowable, visible } from '../../src/spoilers/visible'
import type { MarkStatus, Marks, Unlocks } from '../../src/spoilers/visible'
import { fixtureCatalog } from '../fixtures/catalog'
import { GHOST, MALFORMED_FIELDS, MISSING_FIELDS, STILL_SOUND } from '../fixtures/malformed-connections'

const marked = (status: MarkStatus, ...ids: BookId[]): Marks =>
  Object.fromEntries(ids.map((id) => [id, { status, at: 1 }]))
const read = (...ids: BookId[]): Marks => marked('read', ...ids)
const unlocked = (...ids: BookId[]): Unlocks => Object.fromEntries(ids.map((id) => [id, { on: true, at: 1 }]))
const shown = (catalog: Catalog, marks: Marks, unlocks: Unlocks = {}): string[] =>
  visible(catalog, marks, unlocks).map((c) => c.id)
const knownBooks = (catalog: Catalog): Set<BookId> => new Set(catalog.books.map((b) => b.id))

/** Every book read, the ghost included, so only the field under test can hide a connection. */
const everything = (catalog: Catalog): Marks => read(...catalog.books.map((b) => b.id), GHOST)

const asMarks = (value: unknown) => value as Marks
const asUnlocks = (value: unknown) => value as Unlocks

/** The fixture with c-0001 changed. The change may be malformed on purpose. */
function catalogWith(change: object): Catalog {
  const catalog = fixtureCatalog()
  catalog.connections[0] = { ...catalog.connections[0]!, ...change } as Connection
  return catalog
}

const NOT_CONNECTIONS: [unknown][] = [[null], [undefined], [42], ['c-0001'], [[]], [{}]]

describe('visible', () => {
  test('shows nothing with nothing read', () => {
    expect(visible(fixtureCatalog(), {}, {})).toEqual([])
  })

  test('shows a connection when both ends are read', () => {
    expect(shown(fixtureCatalog(), read('ash-road', 'copper-orchard'))).toEqual(['c-0001', 'c-0004'])
  })

  test('one end read hides it', () => {
    const catalog = fixtureCatalog()
    expect(shown(catalog, read('copper-orchard'))).toEqual([])
    expect(shown(catalog, read('ash-road'))).toEqual(['c-0004'])
  })

  test('a third requirement hides it until read', () => {
    const catalog = fixtureCatalog()
    expect(shown(catalog, read('glass-harbour', 'northern-gale'))).toEqual([])
    expect(shown(catalog, read('glass-harbour', 'northern-gale', 'copper-orchard'))).toEqual(['c-0002', 'c-0005'])
  })

  test.each<MarkStatus>(['reading', 'skipped', 'none'])('reading and skipped do not count as read: %s', (status) => {
    const catalog = fixtureCatalog()
    expect(shown(catalog, marked(status, ...catalog.books.map((b) => b.id)))).toEqual([])
  })

  test('an unlocked book counts as read, other requirements still apply', () => {
    const catalog = fixtureCatalog()
    expect(shown(catalog, {}, unlocked('northern-gale'))).toEqual([])
    const marks = read('glass-harbour')
    expect(shown(catalog, marks, unlocked('northern-gale'))).toEqual([])
    expect(shown(catalog, marks, unlocked('northern-gale', 'copper-orchard'))).toEqual(['c-0002', 'c-0005'])
  })

  test('an unlock turned off counts for nothing', () => {
    const catalog = fixtureCatalog()
    const off: Unlocks = { 'ash-road': { on: false, at: 1 }, 'copper-orchard': { on: false, at: 1 } }
    expect(shown(catalog, {}, off)).toEqual([])
    expect(shown(catalog, read('copper-orchard'), off)).toEqual([])
  })

  test.each(MISSING_FIELDS)('each missing field hides it: %s', (_name, change) => {
    const clean = fixtureCatalog()
    expect(shown(clean, everything(clean))).toContain('c-0001')
    const catalog = catalogWith(change)
    expect(shown(catalog, everything(catalog))).not.toContain('c-0001')
  })

  test('a duplicated id hides every entry that carries it', () => {
    const catalog = fixtureCatalog()
    catalog.connections.push({ ...catalog.connections[0]! })
    expect(shown(catalog, everything(catalog))).toEqual(['c-0002', 'c-0003', 'c-0004', 'c-0005'])
  })

  test('a broken entry still hides the sound one that shares its id', () => {
    const catalog = fixtureCatalog()
    catalog.connections.push({ ...catalog.connections[0]!, sources: [] })
    expect(shown(catalog, everything(catalog))).toEqual(['c-0002', 'c-0003', 'c-0004', 'c-0005'])
  })

  test('a book gone from the catalogue hides what requires it, read or not', () => {
    const catalog = fixtureCatalog()
    const marks = everything(catalog)
    catalog.books = catalog.books.filter((b) => b.id !== 'ash-road')
    expect(shown(catalog, marks)).toEqual(['c-0002', 'c-0003', 'c-0005'])
  })

  test('a sparse requires fails closed with nothing read', () => {
    const catalog = catalogWith({ from: undefined, to: undefined, requires: new Array(2) })
    expect(shown(catalog, {}, {})).not.toContain('c-0001')
    expect(isShowable(catalog.connections[0]!, knownBooks(catalog))).toBe(false)
    expect(isMet(catalog.connections[0]!, {}, {})).toBe(false)
  })

  test.each(NOT_CONNECTIONS)('an entry that is not a connection is dropped, others survive: %j', (entry) => {
    const catalog = fixtureCatalog()
    catalog.connections.unshift(entry as Connection)
    expect(shown(catalog, everything(catalog))).toEqual(['c-0001', 'c-0002', 'c-0003', 'c-0004', 'c-0005'])
  })

  test.each<[string, unknown]>([
    ['null', null],
    ['undefined', undefined],
    ['empty', {}],
    ['books null', { ...fixtureCatalog(), books: null }],
    ['books a string', { ...fixtureCatalog(), books: 'ash-road' }],
    ['connections null', { ...fixtureCatalog(), connections: null }],
    ['connections a string', { ...fixtureCatalog(), connections: 'c-0001' }],
  ])('a malformed catalogue shows nothing: %s', (_name, catalog) => {
    expect(visible(catalog as Catalog, everything(fixtureCatalog()), {})).toEqual([])
  })

  test('malformed book entries do not make their ids known or lose the good ones', () => {
    const catalog = fixtureCatalog()
    const books: unknown[] = [null, 42, {}, { id: 42 }, { id: ' ' }, ...catalog.books]
    catalog.books = books as Catalog['books']
    const marks = { ...everything(fixtureCatalog()), ' ': { status: 'read', at: 1 } } as Marks
    catalog.connections[0] = { ...catalog.connections[0]!, requires: ['ash-road', 'copper-orchard', ' '] }
    expect(shown(catalog, marks)).toEqual(['c-0002', 'c-0003', 'c-0004', 'c-0005'])
  })

  test('is pure: same answer twice, inputs untouched', () => {
    const catalog = fixtureCatalog()
    const marks = read('ash-road', 'copper-orchard')
    const unlocks = unlocked('glass-harbour')
    const before = structuredClone({ catalog, marks, unlocks })
    const first = shown(catalog, marks, unlocks)
    expect(shown(catalog, marks, unlocks)).toEqual(first)
    expect({ catalog, marks, unlocks }).toEqual(before)
  })
})

describe('isShowable', () => {
  test('a clean connection is showable', () => {
    const catalog = fixtureCatalog()
    for (const c of catalog.connections) expect(isShowable(c, knownBooks(catalog))).toBe(true)
  })

  test('with to: null only from is required', () => {
    const catalog = fixtureCatalog()
    const marker = catalog.connections.find((c) => c.id === 'c-0004')!
    expect(isShowable(marker, knownBooks(catalog))).toBe(true)
    expect(isShowable({ ...marker, requires: [] }, knownBooks(catalog))).toBe(false)
    expect(isShowable({ ...marker, requires: ['copper-orchard'] }, knownBooks(catalog))).toBe(false)
  })

  test('an unknown book in requires hides it even when marked read and unlocked', () => {
    const catalog = catalogWith({ requires: ['ash-road', 'copper-orchard', GHOST] })
    expect(shown(catalog, everything(catalog), unlocked(GHOST))).not.toContain('c-0001')
  })

  test.each(MISSING_FIELDS)('hides %s', (_name, change) => {
    const catalog = catalogWith(change)
    expect(isShowable(catalog.connections[0]!, knownBooks(catalog))).toBe(false)
  })

  test.each(MALFORMED_FIELDS)('hides %s without throwing', (_name, change) => {
    const catalog = catalogWith(change)
    expect(isShowable(catalog.connections[0]!, knownBooks(catalog))).toBe(false)
    expect(shown(catalog, everything(catalog), unlocked(GHOST))).not.toContain('c-0001')
  })

  test.each(NOT_CONNECTIONS)('hides %j, which is not a connection', (entry) => {
    expect(isShowable(entry as Connection, knownBooks(fixtureCatalog()))).toBe(false)
  })

  test.each(STILL_SOUND)('keeps %s', (_name, change) => {
    const catalog = catalogWith(change)
    expect(isShowable(catalog.connections[0]!, knownBooks(catalog))).toBe(true)
    expect(shown(catalog, everything(catalog))).toContain('c-0001')
  })
})

describe('isMet', () => {
  const target = (change: object = {}): Connection => catalogWith(change).connections[0]!
  const bothEnds = read('ash-road', 'copper-orchard')

  test('needs every requirement, read or unlocked', () => {
    expect(isMet(target(), bothEnds, {})).toBe(true)
    expect(isMet(target(), read('ash-road'), unlocked('copper-orchard'))).toBe(true)
    expect(isMet(target(), {}, unlocked('ash-road', 'copper-orchard'))).toBe(true)
    expect(isMet(target(), read('ash-road'), {})).toBe(false)
    expect(isMet(target(), {}, unlocked('copper-orchard'))).toBe(false)
  })

  test.each<[string, unknown]>([
    ['empty', []],
    ['missing', undefined],
    ['null', null],
    ['a string', 'ash-road'],
    ['nested', [['ash-road'], ['copper-orchard']]],
    ['holding a null', [null]],
    ['sparse', new Array(2)],
    ['with a hole beside both ends', Object.assign(new Array(3), { 0: 'ash-road', 1: 'copper-orchard' })],
  ])('requires %s is never met', (_name, requires) => {
    const marks = { ...bothEnds, a: { status: 'read', at: 1 } } as Marks
    expect(isMet(target({ requires }), marks, unlocked('ash-road', 'copper-orchard'))).toBe(false)
  })

  test.each(NOT_CONNECTIONS)('%j, which is not a connection, is never met', (entry) => {
    expect(isMet(entry as Connection, bothEnds, {})).toBe(false)
  })

  test.each<[unknown]>([[NaN], [-1], [Infinity], ['yesterday'], [null], [undefined]])(
    'a bad at does not affect read status: %s',
    (at) => {
      const catalog = fixtureCatalog()
      const marks = asMarks({ 'ash-road': { status: 'read', at }, 'copper-orchard': { status: 'read', at } })
      expect(shown(catalog, marks)).toEqual(['c-0001', 'c-0004'])
      const reading = asMarks({ 'ash-road': { status: 'reading', at }, 'copper-orchard': { status: 'none', at } })
      expect(shown(catalog, reading)).toEqual([])
    },
  )

  test.each<[unknown]>([['READ'], ['read '], ['finished'], [''], [42], [true], [null], [undefined], [['read']]])(
    'an unknown status counts as unread: %j',
    (status) => {
      const marks = asMarks({ 'ash-road': { status, at: 1 }, 'copper-orchard': { status, at: 1 } })
      expect(shown(fixtureCatalog(), marks)).toEqual([])
    },
  )

  test.each<[unknown]>([[null], ['read'], [42], [[]], [{}]])('a malformed mark counts as unread: %j', (mark) => {
    const marks = asMarks({ 'ash-road': mark, 'copper-orchard': mark })
    expect(shown(fixtureCatalog(), marks)).toEqual([])
  })

  test.each<[unknown]>([['true'], [1], ['on'], [null], [undefined], [{}]])(
    'an unlock counts only when on is exactly true: %j',
    (on) => {
      const unlocks = asUnlocks({ 'ash-road': { on, at: 1 }, 'copper-orchard': { on, at: 1 } })
      expect(shown(fixtureCatalog(), {}, unlocks)).toEqual([])
    },
  )

  test.each<[unknown]>([[null], [true], ['on'], [1], [[]]])('a malformed unlock counts for nothing: %j', (unlock) => {
    const unlocks = asUnlocks({ 'ash-road': unlock, 'copper-orchard': unlock })
    expect(shown(fixtureCatalog(), {}, unlocks)).toEqual([])
  })

  test('a bad at on an unlock does not affect it', () => {
    const unlocks = asUnlocks({ 'ash-road': { on: true, at: NaN }, 'copper-orchard': { on: true } })
    expect(shown(fixtureCatalog(), {}, unlocks)).toEqual(['c-0001', 'c-0004'])
  })

  test.each<[unknown]>([[null], [undefined], [42], ['read'], [[]]])(
    'corrupt stored state counts for nothing and does not throw: %j',
    (state) => {
      const catalog = fixtureCatalog()
      expect(visible(catalog, asMarks(state), asUnlocks(state))).toEqual([])
      expect(shown(catalog, bothEnds, asUnlocks(state))).toEqual(['c-0001', 'c-0004'])
      expect(shown(catalog, asMarks(state), unlocked('ash-road', 'copper-orchard'))).toEqual(['c-0001', 'c-0004'])
    },
  )

  test.each<[string, unknown]>([
    ['Object.create', Object.create({ status: 'read', at: 1 })],
    ['Object.assign over a parsed __proto__', Object.assign({}, JSON.parse('{"__proto__":{"status":"read"}}'))],
  ])('an inherited status counts as unread: %s', (_name, mark) => {
    const marks = asMarks({ 'ash-road': mark, 'copper-orchard': mark })
    expect(shown(fixtureCatalog(), marks)).toEqual([])
  })

  test.each<[string, unknown]>([
    ['Object.create', Object.create({ on: true, at: 1 })],
    ['Object.assign over a parsed __proto__', Object.assign({}, JSON.parse('{"__proto__":{"on":true}}'))],
  ])('an inherited on counts as locked: %s', (_name, unlock) => {
    const unlocks = asUnlocks({ 'ash-road': unlock, 'copper-orchard': unlock })
    expect(shown(fixtureCatalog(), {}, unlocks)).toEqual([])
  })

  test('__proto__ in stored state counts for nothing', () => {
    const catalog = fixtureCatalog()
    const entries = (entry: string) => `{"__proto__":{"ash-road":${entry},"copper-orchard":${entry}}}`

    // As JSON.parse leaves it, an own key named __proto__.
    const parsedMarks: unknown = JSON.parse(entries('{"status":"read","at":1}'))
    const parsedUnlocks: unknown = JSON.parse(entries('{"on":true,"at":1}'))
    expect(Object.hasOwn(parsedMarks as object, '__proto__')).toBe(true)
    expect(shown(catalog, asMarks(parsedMarks))).toEqual([])
    expect(shown(catalog, {}, asUnlocks(parsedUnlocks))).toEqual([])

    // As Object.assign leaves it, a real prototype.
    const assignedMarks: unknown = Object.assign({}, parsedMarks)
    const assignedUnlocks: unknown = Object.assign({}, parsedUnlocks)
    expect(Object.getPrototypeOf(assignedMarks)).not.toBe(Object.prototype)
    expect(shown(catalog, asMarks(assignedMarks))).toEqual([])
    expect(shown(catalog, {}, asUnlocks(assignedUnlocks))).toEqual([])

    // Read or not, __proto__ is not a book.
    const naming = catalogWith({ requires: ['ash-road', 'copper-orchard', '__proto__'] })
    const marks = asMarks(JSON.parse('{"__proto__":{"status":"read","at":1}}'))
    Object.assign(marks, everything(naming))
    expect(Object.hasOwn(marks, '__proto__')).toBe(true)
    expect(isMet(naming.connections[0]!, marks, {})).toBe(true)
    expect(shown(naming, marks)).not.toContain('c-0001')
  })

  test('arrays are not objects', () => {
    const catalog = fixtureCatalog()
    const list = <T extends object>(value: T) => Object.assign([], value) as unknown as T

    const readList = list({ status: 'read', at: 1 })
    expect(shown(catalog, asMarks({ 'ash-road': readList, 'copper-orchard': readList }))).toEqual([])
    const onList = list({ on: true, at: 1 })
    expect(shown(catalog, {}, asUnlocks({ 'ash-road': onList, 'copper-orchard': onList }))).toEqual([])

    expect(shown(catalog, list(read('ash-road', 'copper-orchard')))).toEqual([])
    expect(shown(catalog, {}, list(unlocked('ash-road', 'copper-orchard')))).toEqual([])

    const clean = list(catalog.connections[0]!)
    expect(isShowable(clean, knownBooks(catalog))).toBe(false)
    expect(isMet(clean, read('ash-road', 'copper-orchard'), {})).toBe(false)

    expect(visible(list(catalog), everything(catalog), {})).toEqual([])

    const listBook = fixtureCatalog()
    listBook.books = listBook.books.map((b) => (b.id === 'ash-road' ? list(b) : b))
    expect(shown(listBook, everything(catalog))).toEqual(['c-0002', 'c-0003', 'c-0005'])
  })

  test('inherited keys count for nothing', () => {
    const catalog = fixtureCatalog()
    const marks = asMarks(Object.create(bothEnds))
    const unlocks = asUnlocks(Object.create(unlocked('ash-road', 'copper-orchard')))
    expect(shown(catalog, marks, unlocks)).toEqual([])
    expect(isMet(target({ requires: ['constructor'] }), {}, {})).toBe(false)
  })
})

describe('properties', () => {
  /** The fixture plus every broken shape, so the property also has to keep hiding those. */
  function propertyCatalog(): Catalog {
    const catalog = fixtureCatalog()
    const broken = [...MISSING_FIELDS, ...MALFORMED_FIELDS].map(
      ([, change], i) => ({ ...catalog.connections[0]!, id: `c-${1000 + i}`, ...change }) as Connection,
    )
    return { ...catalog, connections: [...catalog.connections, ...broken] }
  }

  const key = fc.oneof(
    { weight: 6, arbitrary: fc.constantFrom(...fixtureCatalog().books.map((b) => b.id), GHOST) },
    { weight: 1, arbitrary: fc.string() },
  )
  const statusValue = fc.oneof(
    { weight: 5, arbitrary: fc.constant('read') },
    { weight: 1, arbitrary: fc.constantFrom('reading', 'skipped', 'none') },
  )
  const markValue = fc.oneof(
    { weight: 6, arbitrary: fc.record({ status: statusValue, at: fc.integer() }) },
    { weight: 1, arbitrary: fc.record({ status: fc.anything(), at: fc.anything() }) },
    { weight: 1, arbitrary: fc.anything() },
  )
  const unlockValue = fc.oneof(
    { weight: 6, arbitrary: fc.record({ on: fc.boolean(), at: fc.integer() }) },
    { weight: 1, arbitrary: fc.record({ on: fc.anything(), at: fc.anything() }) },
    { weight: 1, arbitrary: fc.anything() },
  )
  // Large enough that a connection with three requirements shows in about one run in five.
  const marksArb = fc.dictionary(key, markValue, { minKeys: 10, maxKeys: 18 }).map(asMarks)
  const unlocksArb = fc.dictionary(key, unlockValue, { maxKeys: 6 }).map(asUnlocks)

  /** Read ∪ unlocked, worked out here on its own terms rather than through the code under test. */
  function open(marks: Marks, unlocks: Unlocks): Set<string> {
    const markedRead = Object.entries(marks).filter(([, m]) => (m as { status?: unknown } | null)?.status === 'read')
    const switchedOn = Object.entries(unlocks).filter(([, u]) => (u as { on?: unknown } | null)?.on === true)
    return new Set([...markedRead, ...switchedOn].map(([id]) => id))
  }

  // A thousand runs: under the full suite, or the commit hook, it needs more than the default five seconds.
  test('returns exactly the showable connections whose requires are read or unlocked', { timeout: 30_000 }, () => {
    const catalog = propertyCatalog()
    const known = knownBooks(catalog)
    const showable = catalog.connections.filter((c) => isShowable(c, known))
    expect(showable.map((c) => c.id)).toEqual(['c-0001', 'c-0002', 'c-0003', 'c-0004', 'c-0005'])

    let runsShowingSomething = 0
    let runsHidingSomething = 0
    let runsShowingThreeRequirements = 0
    fc.assert(
      fc.property(marksArb, unlocksArb, (marks, unlocks) => {
        const result = visible(catalog, marks, unlocks)
        const ids = result.map((c) => c.id)
        const opened = open(marks, unlocks)
        const met = (c: Connection) => c.requires.every((id) => opened.has(id))

        for (const c of result) {
          expect(met(c), c.id).toBe(true)
          expect(isShowable(c, known), c.id).toBe(true)
        }
        for (const c of showable) {
          expect(isMet(c, marks, unlocks), c.id).toBe(met(c))
          if (met(c)) expect(ids).toContain(c.id)
        }

        if (result.length > 0) runsShowingSomething++
        if (result.length < showable.length) runsHidingSomething++
        if (ids.includes('c-0002')) runsShowingThreeRequirements++
      }),
      { numRuns: 1000 },
    )
    expect(runsShowingSomething).toBeGreaterThan(0)
    expect(runsHidingSomething).toBeGreaterThan(0)
    expect(runsShowingThreeRequirements).toBeGreaterThan(100)
  })
})
