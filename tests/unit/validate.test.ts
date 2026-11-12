import { describe, expect, test } from 'vitest'
import { pruneInvalid, validateCatalog } from '../../src/data/validate'
import type { Catalog, Connection, Note, ProblemCode, Synopsis } from '../../src/data/types'
import { fixtureNotes, fixtureSynopses } from '../fixtures/content'
import { titleOf } from '../../src/i18n'
import { fixtureCatalog } from '../fixtures/catalog'
import { MALFORMED_FIELDS, MISSING_FIELDS, ONLY_ONE_PROBLEM, STILL_SOUND } from '../fixtures/malformed-connections'

const conn = (c: Catalog, id = 'c-0001'): Connection => c.connections.find((x) => x.id === id)!
const book = (c: Catalog, id: string) => c.books.find((x) => x.id === id)!
const has = (c: Catalog, code: ProblemCode, id: string) =>
  expect(validateCatalog(c)).toContainEqual({ code, id })

describe('fixture', () => {
  test('clean fixture has no problems', () => expect(validateCatalog(fixtureCatalog())).toEqual([]))
  test('covers the shapes later tasks rely on', () => {
    const c = fixtureCatalog()
    expect(c.books.length).toBeGreaterThanOrEqual(8)
    expect(new Set(c.books.map((b) => b.world)).size).toBeGreaterThanOrEqual(3)
    expect(c.books.some((b) => b.format === 'anthology')).toBe(true)
    expect(c.books.some((b) => b.containedIn?.length)).toBe(true)
    expect(c.books.some((b) => b.format === 'rpg')).toBe(true)
    expect(c.books.some((b) => b.status === 'announced')).toBe(true)
    expect(c.books.some((b) => b.titles.es === null)).toBe(true)
    expect(c.books.some((b) => b.titles.en.length === 60)).toBe(true)
    expect(c.connections.map((x) => x.id)).toEqual(['c-0001', 'c-0002', 'c-0003', 'c-0004', 'c-0005'])
    for (const x of c.connections) {
      expect(x.description.en).toContain(`LEAK-${x.id}`)
      expect(x.description.es).toContain(`LEAK-${x.id}`)
    }
  })
})

describe('one test per problem code', () => {
  test('BAD_ID on a book', () => {
    const c = fixtureCatalog()
    book(c, 'ash-road').id = 'Ash Road'
    has(c, 'BAD_ID', 'book#0')
  })
  test('BAD_ID on a connection', () => {
    const c = fixtureCatalog()
    conn(c).id = 'c-1'
    has(c, 'BAD_ID', 'conn#0')
  })
  test('DUPLICATE_ID', () => {
    const c = fixtureCatalog()
    conn(c, 'c-0002').id = 'c-0001'
    has(c, 'DUPLICATE_ID', 'c-0001')
  })
  test('DUPLICATE_ID on a book', () => {
    const c = fixtureCatalog()
    book(c, 'glass-harbour').id = 'ash-road'
    has(c, 'DUPLICATE_ID', 'ash-road')
  })
  test('REF_UNKNOWN', () => {
    const c = fixtureCatalog()
    conn(c).to = 'nowhere'
    has(c, 'REF_UNKNOWN', 'c-0001')
  })
  test('REF_UNKNOWN on containedIn', () => {
    const c = fixtureCatalog()
    book(c, 'lantern-keeper').containedIn = ['nowhere']
    has(c, 'REF_UNKNOWN', 'lantern-keeper')
  })
  test('REQUIRES_MISSING_END', () => {
    const c = fixtureCatalog()
    c.connections[0]!.requires = [c.connections[0]!.from]
    has(c, 'REQUIRES_MISSING_END', 'c-0001')
  })
  test('NO_SOURCE', () => {
    const c = fixtureCatalog()
    conn(c).sources = []
    has(c, 'NO_SOURCE', 'c-0001')
  })
  test('CONFIRMED_WEAK_SOURCE', () => {
    const c = fixtureCatalog()
    conn(c).sources = [{ url: 'https://forum.example.test/t', kind: 'forum' }]
    has(c, 'CONFIRMED_WEAK_SOURCE', 'c-0001')
  })
  test('UPSTREAM_SOURCE_ON_NEW', () => {
    const c = fixtureCatalog()
    conn(c).sources = [{ url: 'https://up.example.test/', kind: 'upstream' }]
    has(c, 'UPSTREAM_SOURCE_ON_NEW', 'c-0001')
  })
  test('UNVERIFIED: no verifier, and no verification date', () => {
    const c = fixtureCatalog()
    conn(c).verifiedBy = ''
    has(c, 'UNVERIFIED', 'c-0001')
    const d = fixtureCatalog()
    conn(d).verifiedOn = ''
    has(d, 'UNVERIFIED', 'c-0001')
  })
  test('SELF_VERIFIED', () => {
    const c = fixtureCatalog()
    conn(c).verifiedBy = conn(c).author
    has(c, 'SELF_VERIFIED', 'c-0001')
  })
  test('MISSING_LANGUAGE', () => {
    const c = fixtureCatalog()
    conn(c).description.es = ' '
    has(c, 'MISSING_LANGUAGE', 'c-0001')
  })
  test('NO_ENGLISH_TITLE', () => {
    const c = fixtureCatalog()
    book(c, 'ash-road').titles.en = ''
    has(c, 'NO_ENGLISH_TITLE', 'ash-road')
  })
  test('ANNOUNCED_WITH_DATE: announced, and planned', () => {
    for (const status of ['announced', 'planned'] as const) {
      const c = fixtureCatalog()
      book(c, 'low-tide-atlas').status = status
      book(c, 'low-tide-atlas').year = 2030
      has(c, 'ANNOUNCED_WITH_DATE', 'low-tide-atlas')
    }
  })
  test('MISSING_ORDER: either key', () => {
    for (const key of ['publication', 'recommended'] as const) {
      const c = fixtureCatalog()
      delete book(c, 'ash-road').order[key]
      has(c, 'MISSING_ORDER', 'ash-road')
    }
  })
  test('ES_TITLE_MISSING', () => {
    const c = fixtureCatalog()
    book(c, 'ash-road').titles.es = null
    has(c, 'ES_TITLE_MISSING', 'ash-road')
  })
  test('ES_TITLE_MISSING is satisfied by esEdition.in', () => {
    const c = fixtureCatalog()
    const b = book(c, 'lantern-keeper')
    b.esEdition = { status: 'published', source: 'https://publisher.example.test/x', in: 'salt-and-lantern' }
    expect(validateCatalog(c)).toEqual([])
  })
  test('ES_SOURCE_MISSING', () => {
    const c = fixtureCatalog()
    book(c, 'ash-road').esEdition = { status: 'published' }
    has(c, 'ES_SOURCE_MISSING', 'ash-road')
  })
  test('UNKNOWN_WORLD', () => {
    const c = fixtureCatalog()
    ;(book(c, 'ash-road') as { world: string }).world = 'mars'
    has(c, 'UNKNOWN_WORLD', 'ash-road')
  })
  test('BOOK_REMOVED, and fine when a new book lists the id in aliases', () => {
    const previous = fixtureCatalog()
    const c = fixtureCatalog()
    c.books = c.books.filter((b) => b.id !== 'ash-road')
    c.connections = []
    expect(validateCatalog(c, previous)).toContainEqual({ code: 'BOOK_REMOVED', id: 'ash-road' })
    const taker = book(c, 'glass-harbour')
    taker.world = book(previous, 'ash-road').world
    taker.format = book(previous, 'ash-road').format
    taker.aliases = ['ash-road']
    expect(validateCatalog(c, previous)).toEqual([])
  })
  test('ALIAS_MISMATCH: an alias taking over an id keeps the old book format and world', () => {
    const previous = fixtureCatalog()
    for (const change of [{ format: 'rpg' }, { world: 'roshar' }] as const) {
      const c = fixtureCatalog()
      c.books = c.books.filter((b) => b.id !== 'ash-road')
      c.connections = []
      const taker = book(c, 'glass-harbour')
      Object.assign(taker, { world: book(previous, 'ash-road').world, format: book(previous, 'ash-road').format }, change)
      taker.aliases = ['ash-road']
      expect(validateCatalog(c, previous)).toEqual([{ code: 'ALIAS_MISMATCH', id: 'glass-harbour' }])
    }
  })
})

describe('the catalogue as a whole', () => {
  test('EMPTY_CATALOGUE', () => {
    const c = fixtureCatalog()
    c.books = []
    c.connections = []
    has(c, 'EMPTY_CATALOGUE', 'catalogue')
  })
  test.each(['', '2026-02-31', '4 nov 2026', undefined, 20261104])('BAD_META: updatedOn %j', (value) => {
    const c = fixtureCatalog()
    ;(c.meta as { updatedOn: unknown }).updatedOn = value
    has(c, 'BAD_META', 'meta')
  })
  test('BAD_META when meta is not an object', () => {
    const c = fixtureCatalog()
    ;(c as { meta: unknown }).meta = null
    has(c, 'BAD_META', 'meta')
  })
})

describe('book fields the app reads', () => {
  const broken = (change: (b: Record<string, unknown>) => void, id = 'ash-road') => {
    const c = fixtureCatalog()
    change(book(c, id) as unknown as Record<string, unknown>)
    return c
  }
  test.each<[string, (b: Record<string, unknown>) => void]>([
    ['titles.es of another type', (b) => ((b.titles as { es: unknown }).es = 7)],
    ['titles.es blank', (b) => ((b.titles as { es: unknown }).es = '  ')],
    ['titles missing', (b) => delete b.titles],
    ['order missing', (b) => delete b.order],
    ['order not an object', (b) => (b.order = [1, 2])],
    ['an order value that is not a number', (b) => ((b.order as Record<string, unknown>).recommended = '3')],
    ['an order value that is not finite', (b) => ((b.order as Record<string, unknown>).publication = Infinity)],
    ['phase missing', (b) => delete b.phase],
    ['phase a string', (b) => (b.phase = '1')],
    ['series missing', (b) => delete b.series],
    ['series a number', (b) => (b.series = 4)],
    ['pages a string', (b) => (b.pages = '300')],
    ['year a string', (b) => (b.year = '2000')],
    ['addedOn not a calendar date', (b) => (b.addedOn = '2026-02-31')],
    ['containedIn not an array', (b) => (b.containedIn = 'salt-and-lantern')],
    ['containedIn with a non-string', (b) => (b.containedIn = [4])],
    ['esEdition missing', (b) => delete b.esEdition],
    ['esEdition.in a number', (b) => ((b.esEdition as Record<string, unknown>).in = 3)],
    ['esEdition.source a number', (b) => ((b.esEdition as Record<string, unknown>).source = 3)],
  ])('BAD_FIELD: %s', (_name, change) => {
    has(broken(change), 'BAD_FIELD', 'ash-road')
    expect(() => validateCatalog(broken(change))).not.toThrow()
  })
  test('an unpublished book with no order at all is a bad field, not a crash', () => {
    has(broken((b) => delete b.order, 'low-tide-atlas'), 'BAD_FIELD', 'low-tide-atlas')
  })
  test('null titles.es and an empty order on an announced book stay sound', () => {
    expect(validateCatalog(fixtureCatalog())).toEqual([])
  })
})

describe('aliases', () => {
  const withAliases = (change: (c: Catalog) => void) => {
    const c = fixtureCatalog()
    change(c)
    return c
  }
  test.each([['sa2.5'], ['sa3.5'], ['sa5.5'], ['old-id']])('the stored form passes: %s', (alias) => {
    expect(validateCatalog(withAliases((c) => (book(c, 'ash-road').aliases = [alias])))).toEqual([])
  })
  test('BAD_ALIAS: not an array', () => {
    has(withAliases((c) => ((book(c, 'ash-road') as { aliases: unknown }).aliases = 'old')), 'BAD_ALIAS', 'ash-road')
  })
  test.each([[4], ['Old Id'], ['']])('BAD_ALIAS: not in stored-id form: %j', (alias) => {
    has(withAliases((c) => ((book(c, 'ash-road') as { aliases: unknown[] }).aliases = [alias])), 'BAD_ALIAS', 'ash-road')
  })
  test('BAD_ALIAS: a current id', () => {
    has(withAliases((c) => (book(c, 'ash-road').aliases = ['glass-harbour'])), 'BAD_ALIAS', 'ash-road')
  })
  test('BAD_ALIAS: listed twice across books, and within one book', () => {
    const across = withAliases((c) => {
      book(c, 'ash-road').aliases = ['old']
      book(c, 'glass-harbour').aliases = ['old']
    })
    expect(validateCatalog(across)).toContainEqual({ code: 'BAD_ALIAS', id: 'glass-harbour' })
    has(withAliases((c) => (book(c, 'ash-road').aliases = ['old', 'old'])), 'BAD_ALIAS', 'ash-road')
  })
})

describe('titleOf', () => {
  test('a blank Spanish title falls back to English', () => {
    const b = { ...fixtureCatalog().books[0]!, titles: { en: 'Ash Road', es: '' } }
    expect(titleOf(b, 'es')).toBe('Ash Road')
  })
})

describe('source rule for confirmed', () => {
  const sources = (c: Catalog, s: Connection['sources'], author = 'agent-a') => {
    conn(c).sources = s
    conn(c).author = author
  }
  const weak = (c: Catalog) => validateCatalog(c).filter((p) => p.code === 'CONFIRMED_WEAK_SOURCE')

  test('upstream kind with author upstream passes', () => {
    const c = fixtureCatalog()
    sources(c, [{ url: 'https://up.example.test/', kind: 'upstream' }], 'upstream')
    expect(validateCatalog(c)).toEqual([])
  })
  test('one word-of-brandon passes', () => {
    const c = fixtureCatalog()
    sources(c, [{ url: 'https://a.example.test/', kind: 'word-of-brandon' }])
    expect(weak(c)).toEqual([])
  })
  test('one official passes', () => {
    const c = fixtureCatalog()
    sources(c, [{ url: 'https://a.example.test/', kind: 'official' }])
    expect(weak(c)).toEqual([])
  })
  test('two wiki on different sites pass', () => {
    const c = fixtureCatalog()
    sources(c, [
      { url: 'https://one.example.test/a', kind: 'wiki' },
      { url: 'https://other.sample.test/a', kind: 'wiki' },
    ])
    expect(weak(c)).toEqual([])
  })
  test('two subdomains of one wiki are one source, with or without www', () => {
    for (const [a, b] of [
      ['https://en.wiki.example/a', 'https://es.wiki.example/a'],
      ['https://www.wiki.example/a', 'https://en.wiki.example/a'],
      ['https://wiki.example/a', 'https://deep.en.wiki.example/a'],
    ] as const) {
      const c = fixtureCatalog()
      sources(c, [
        { url: a, kind: 'wiki' },
        { url: b, kind: 'wiki' },
      ])
      expect(weak(c)).toEqual([{ code: 'CONFIRMED_WEAK_SOURCE', id: 'c-0001' }])
    }
  })
  test('two wiki on one hostname fail', () => {
    const c = fixtureCatalog()
    sources(c, [
      { url: 'https://one.example.test/a', kind: 'wiki' },
      { url: 'https://one.example.test/b', kind: 'wiki' },
    ])
    expect(weak(c)).toEqual([{ code: 'CONFIRMED_WEAK_SOURCE', id: 'c-0001' }])
  })
  test('one forum fails', () => {
    const c = fixtureCatalog()
    sources(c, [{ url: 'https://f.example.test/a', kind: 'forum' }])
    expect(weak(c)).toEqual([{ code: 'CONFIRMED_WEAK_SOURCE', id: 'c-0001' }])
  })
  test('a theory with one source passes', () => {
    const c = fixtureCatalog()
    conn(c).tier = 'theory'
    sources(c, [{ url: 'https://f.example.test/a', kind: 'forum' }])
    expect(validateCatalog(c)).toEqual([])
  })
  test('upstream kind with another author fails', () => {
    const c = fixtureCatalog()
    sources(c, [{ url: 'https://up.example.test/', kind: 'upstream' }], 'agent-a')
    has(c, 'UPSTREAM_SOURCE_ON_NEW', 'c-0001')
  })
})

describe('BAD_ENUM', () => {
  const bad = (c: Catalog, id: string) => has(c, 'BAD_ENUM', id)
  test('tier, also when it only differs by case, never skips the source rule', () => {
    const c = fixtureCatalog()
    ;(conn(c) as { tier: string }).tier = 'Confirmed'
    conn(c).sources = [{ url: 'https://f.example.test/a', kind: 'wiki' }]
    bad(c, 'c-0001')
    has(c, 'CONFIRMED_WEAK_SOURCE', 'c-0001')
  })
  test('type', () => {
    const c = fixtureCatalog()
    ;(conn(c) as { type: string }).type = 'huge'
    bad(c, 'c-0001')
  })
  test('source kind', () => {
    const c = fixtureCatalog()
    ;(conn(c).sources[0] as { kind: string }).kind = 'blog'
    bad(c, 'c-0001')
  })
  test('format', () => {
    const c = fixtureCatalog()
    ;(book(c, 'ash-road') as { format: string }).format = 'poem'
    bad(c, 'ash-road')
  })
  test('status', () => {
    const c = fixtureCatalog()
    ;(book(c, 'ash-road') as { status: string }).status = 'rumoured'
    bad(c, 'ash-road')
  })
  test('esEdition.status', () => {
    const c = fixtureCatalog()
    ;(book(c, 'ash-road').esEdition as { status: string }).status = 'maybe'
    bad(c, 'ash-road')
  })
  test('world', () => {
    const c = fixtureCatalog()
    ;(book(c, 'ash-road') as { world: string }).world = 'mars'
    bad(c, 'ash-road')
  })
})

describe('connection rules', () => {
  const withChange = (change: object): Catalog => {
    const c = fixtureCatalog()
    c.connections[0] = { ...c.connections[0]!, ...change } as Connection
    return c
  }

  test.each([...MISSING_FIELDS, ...MALFORMED_FIELDS])('reported under its own code, never thrown: %s', (_name, change, code) => {
    expect(validateCatalog(withChange(change)).map((p) => p.code)).toContain(code)
  })

  test.each(ONLY_ONE_PROBLEM)('is the only problem for %s', (_name, change, code) => {
    expect(validateCatalog(withChange(change))).toEqual([{ code, id: 'c-0001' }])
  })

  test.each(STILL_SOUND)('passes %s', (_name, change) => {
    expect(validateCatalog(withChange(change))).toEqual([])
  })

  test.each(['agent-a', 'upstream'])('a null source names the connection and leaves the others alone: %s', (author) => {
    const problems = validateCatalog(withChange({ author, sources: [null] }))
    expect(problems).toContainEqual({ code: 'BAD_SOURCE_URL', id: 'c-0001' })
    expect(new Set(problems.map((p) => p.id))).toEqual(new Set(['c-0001']))
  })

  test('pruneInvalid drops it, and it carries no text', () => {
    const c = withChange({ author: '' })
    const problems = validateCatalog(c)
    expect(JSON.stringify(problems)).not.toContain('LEAK')
    const { kept, dropped } = pruneInvalid(c.connections, problems)
    expect(dropped).toEqual(['c-0001'])
    expect(kept.map((x) => x.id)).toEqual(['c-0002', 'c-0003', 'c-0004', 'c-0005'])
  })

  test('a text id is reported by position in every problem it raises', () => {
    const problems = validateCatalog(withChange({ id: 'LEAK-PASTED', sources: [] }))
    expect(JSON.stringify(problems)).not.toContain('LEAK')
    expect(new Set(problems.map((p) => p.id))).toEqual(new Set(['conn#0']))
  })
})

describe('entries that are not objects', () => {
  const NOT_OBJECTS: [unknown][] = [[null], [42], ['LEAK-PASTED'], [[]], [true]]

  test.each(NOT_OBJECTS)('connections: [%j] is reported by position and can be pruned', (entry) => {
    const c = fixtureCatalog()
    c.connections.unshift(entry as Connection)
    const problems = validateCatalog(c)
    expect(problems).toEqual([{ code: 'NOT_AN_OBJECT', id: 'conn#0' }])
    expect(JSON.stringify(problems)).not.toContain('LEAK')
    const { kept, dropped } = pruneInvalid(c.connections, problems)
    expect(dropped).toEqual(['conn#0'])
    expect(kept.map((x) => x.id)).toEqual(['c-0001', 'c-0002', 'c-0003', 'c-0004', 'c-0005'])
  })

  test.each(NOT_OBJECTS)('books: [%j] is reported by position', (entry) => {
    const c = fixtureCatalog()
    c.books.unshift(entry as Catalog['books'][number])
    const problems = validateCatalog(c)
    expect(problems).toEqual([{ code: 'NOT_AN_OBJECT', id: 'book#0' }])
    expect(JSON.stringify(problems)).not.toContain('LEAK')
  })

  test('a book without a usable id is reported by position', () => {
    const c = fixtureCatalog()
    c.books.unshift({ ...c.books[0]!, id: 42 as unknown as string })
    expect(validateCatalog(c)).toContainEqual({ code: 'BAD_ID', id: 'book#0' })
  })

  test('a null in either side of the --against check does not throw', () => {
    const previous = fixtureCatalog()
    previous.books.unshift(null as unknown as Catalog['books'][number])
    const c = fixtureCatalog()
    c.books.unshift(null as unknown as Catalog['books'][number])
    expect(validateCatalog(c, previous)).toEqual([{ code: 'NOT_AN_OBJECT', id: 'book#0' }])
  })
})

describe('malformed connection ids never reach the output', () => {
  test('BAD_ID reports the position, not the text', () => {
    const c = fixtureCatalog()
    conn(c, 'c-0003').id = 'LEAK-PASTED description text'
    const problems = validateCatalog(c)
    expect(problems).toContainEqual({ code: 'BAD_ID', id: 'conn#2' })
    expect(JSON.stringify(problems)).not.toContain('LEAK')
  })
  test('other problems on a malformed id use the position too', () => {
    const c = fixtureCatalog()
    conn(c, 'c-0003').sources = []
    conn(c, 'c-0003').id = 'LEAK-PASTED'
    conn(c, 'c-0004').id = 'LEAK-PASTED'
    const out = JSON.stringify(validateCatalog(c))
    expect(out).not.toContain('LEAK')
    expect(out).toContain('DUPLICATE_ID')
  })
  test('pruneInvalid drops a connection named by position', () => {
    const c = fixtureCatalog()
    conn(c, 'c-0003').id = 'LEAK-PASTED'
    const { kept, dropped } = pruneInvalid(c.connections, validateCatalog(c))
    expect(dropped).toEqual(['conn#2'])
    expect(kept.map((x) => x.id)).toEqual(['c-0001', 'c-0002', 'c-0004', 'c-0005'])
  })
})

describe('output and pruning', () => {
  test('problems never carry text', () => {
    const c = fixtureCatalog()
    c.connections.forEach((x) => {
      x.sources = []
    })
    const out = JSON.stringify(validateCatalog(c))
    expect(out).not.toContain('LEAK')
    expect(out).toContain('NO_SOURCE')
  })
  test('pruneInvalid drops only the connections named, returning their ids', () => {
    const c = fixtureCatalog()
    conn(c, 'c-0002').sources = []
    conn(c, 'c-0004').verifiedBy = ''
    const { kept, dropped } = pruneInvalid(c.connections, validateCatalog(c))
    expect(dropped.sort()).toEqual(['c-0002', 'c-0004'])
    expect(kept.map((x) => x.id)).toEqual(['c-0001', 'c-0003', 'c-0005'])
  })
})

describe('synopses and notes in the catalogue', () => {
  const withContent = (): Catalog => ({ ...fixtureCatalog(), synopses: fixtureSynopses(), notes: fixtureNotes() })

  test('a catalogue with clean fixture synopses and notes has no problems', () => {
    expect(validateCatalog(withContent())).toEqual([])
  })
  test('an unsound synopsis is reported as syn:<book> with its code', () => {
    const c = withContent()
    c.synopses[1]!.requires = ['ash-road']
    expect(validateCatalog(c)).toEqual([{ code: 'SYNOPSIS_OUTSIDE_SERIES', id: 'syn:orchard-dusk' }])
  })
  test('a malformed synopsis is named by position', () => {
    const c = withContent()
    c.synopses.push(null as unknown as Synopsis, { ...fixtureSynopses()[0]!, book: 'Not An Id' })
    const problems = validateCatalog(c)
    expect(problems).toContainEqual({ code: 'NOT_AN_OBJECT', id: 'syn#3' })
    expect(problems).toContainEqual({ code: 'REF_UNKNOWN', id: 'syn#4' })
  })
  test('two synopses for one book: DUPLICATE_ID', () => {
    const c = withContent()
    c.synopses.push(fixtureSynopses()[0]!)
    expect(validateCatalog(c)).toEqual([{ code: 'DUPLICATE_ID', id: 'syn:copper-orchard' }])
  })
  test('an unsound note is reported by its id', () => {
    const c = withContent()
    c.notes[1]!.sources = []
    expect(validateCatalog(c)).toEqual([{ code: 'NO_SOURCE', id: 'n-0002' }])
  })
  test('a malformed note is named by position', () => {
    const c = withContent()
    c.notes.push('x' as unknown as Note)
    expect(validateCatalog(c)).toEqual([{ code: 'NOT_AN_OBJECT', id: 'note#2' }])
  })
  test('two notes with one id: DUPLICATE_ID', () => {
    const c = withContent()
    c.notes.push({ ...fixtureNotes()[1]! })
    expect(validateCatalog(c)).toEqual([{ code: 'DUPLICATE_ID', id: 'n-0002' }])
  })
  test('a catalogue without the new fields, or with them malformed, still validates its books', () => {
    const old: Partial<Catalog> = withContent()
    delete old.synopses
    delete old.notes
    expect(validateCatalog(old as Catalog)).toEqual([])
    expect(validateCatalog({ ...withContent(), synopses: 'x', notes: null } as unknown as Catalog)).toEqual([])
  })
  test('problems never carry the text of a synopsis or a note', () => {
    const c = withContent()
    c.synopses.forEach((s) => (s.sources = []))
    c.notes.forEach((n) => (n.sources = []))
    expect(JSON.stringify(validateCatalog(c))).not.toContain('LEAK')
  })
})

describe('plate facts for works not published, apocryphal and role-playing', () => {
  const SRC = 'https://source.example.test/p'
  function withBook(id: string, extra: Record<string, unknown>): Catalog {
    const c = fixtureCatalog()
    Object.assign(c.books.find((b) => b.id === id)!, extra)
    return c
  }
  const codes = (c: Catalog, id: string) => validateCatalog(c).filter((p) => p.id === id).map((p) => p.code)

  test('good values pass, on an announced work and on a role-playing book', () => {
    const announced = withBook('low-tide-atlas', {
      writing: { stage: 'drafting', percent: 40, source: SRC, asOf: '2026-11-01' },
      expected: { when: '2027-H2', official: false, source: SRC },
      announcedIn: SRC,
    })
    expect(codes(announced, 'low-tide-atlas')).toEqual([])
    const rpg = withBook('paper-wolves', {
      publisher: 'Lantern Press',
      line: 'Chartmaker RPG',
      rpgKind: 'core',
      crowdfunding: SRC,
      canon: { value: 'partly', source: SRC },
    })
    expect(codes(rpg, 'paper-wolves')).toEqual([])
    const apocryphal = withBook('glass-harbour', { status: 'apocryphal', apocryphal: { reason: 'parody', source: SRC } })
    expect(codes(apocryphal, 'glass-harbour')).toEqual([])
    for (const when of ['2027', '2027-03', '2027-03-15', '2027-H1', '2027-Q4']) {
      expect(codes(withBook('low-tide-atlas', { expected: { when, official: true, source: SRC } }), 'low-tide-atlas')).toEqual([])
    }
  })

  test.each([
    ['writing that is not an object', { writing: 'soon' }, 'BAD_FIELD'],
    ['a writing stage outside the list', { writing: { stage: 'outline', source: SRC, asOf: '2026-11-01' } }, 'BAD_ENUM'],
    ['a percentage above 100', { writing: { stage: 'drafting', percent: 140, source: SRC, asOf: '2026-11-01' } }, 'BAD_FIELD'],
    ['a percentage below 0', { writing: { stage: 'drafting', percent: -1, source: SRC, asOf: '2026-11-01' } }, 'BAD_FIELD'],
    ['writing without its source', { writing: { stage: 'idea', asOf: '2026-11-01' } }, 'BAD_FIELD'],
    ['writing with an impossible date', { writing: { stage: 'idea', source: SRC, asOf: '2026-02-30' } }, 'BAD_FIELD'],
    ['an expected window that does not exist', { expected: { when: '2027-Q5', official: false, source: SRC } }, 'BAD_FIELD'],
    ['an expected date that is not said official or not', { expected: { when: '2027', official: 'yes', source: SRC } }, 'BAD_FIELD'],
    ['an expected date without its source', { expected: { when: '2027', official: true } }, 'BAD_FIELD'],
    ['an announcement that is not an https link', { announcedIn: 'http://source.example.test/p' }, 'BAD_FIELD'],
  ])('%s', (_name, extra, code) => {
    expect(codes(withBook('low-tide-atlas', extra), 'low-tide-atlas')).toEqual([code])
  })

  test.each([
    ['an apocryphal reason outside the list', { apocryphal: { reason: 'fan-made', source: SRC } }, 'BAD_ENUM'],
    ['an apocryphal reason without its source', { apocryphal: { reason: 'parody' } }, 'BAD_FIELD'],
    ['a kind of role-playing book outside the list', { rpgKind: 'novel' }, 'BAD_ENUM'],
    ['a blank publisher', { publisher: ' ' }, 'BAD_FIELD'],
    ['a line that is not text', { line: 3 }, 'BAD_FIELD'],
    ['a campaign that is not an https link', { crowdfunding: 'ftp://campaign.example.test' }, 'BAD_FIELD'],
    ['a canon value outside the list', { canon: { value: 'maybe', source: SRC } }, 'BAD_ENUM'],
    ['a canon value without its source', { canon: { value: 'yes' } }, 'BAD_FIELD'],
  ])('%s', (_name, extra, code) => {
    expect(codes(withBook('paper-wolves', extra), 'paper-wolves')).toEqual([code])
  })

  test('an announced work still may not carry a year; a forecast goes in expected, with its source', () => {
    expect(codes(withBook('low-tide-atlas', { year: 2027 }), 'low-tide-atlas')).toEqual(['ANNOUNCED_WITH_DATE'])
    expect(codes(withBook('low-tide-atlas', { expected: { when: '2027', official: true, source: SRC } }), 'low-tide-atlas')).toEqual([])
  })
})
