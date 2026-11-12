import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { connectionProblems, isBlank, knownBookIds, repeatedIds } from '../../src/data/soundness'
import { MARK_STATUSES, PROBLEM_CODES, WORLD_KEYS } from '../../src/data/types'
import type { Catalog, Connection } from '../../src/data/types'
import { validateCatalog } from '../../src/data/validate'
import { WORLDS } from '../../src/design/worlds'
import { isShowable, visible } from '../../src/spoilers/visible'
import type { Marks, Unlocks } from '../../src/spoilers/visible'
import { fixtureCatalog } from '../fixtures/catalog'
import { MALFORMED_FIELDS, MISSING_FIELDS, STILL_SOUND } from '../fixtures/malformed-connections'

const known = knownBookIds(fixtureCatalog().books)
const changed = (change: object): unknown => ({ ...fixtureCatalog().connections[0]!, ...change })

const NOT_OBJECTS: [unknown][] = [[null], [undefined], [42], ['c-0001'], [[]], [true]]

describe('connectionProblems', () => {
  test('finds nothing wrong with any clean fixture connection', () => {
    for (const c of fixtureCatalog().connections) expect(connectionProblems(c, known)).toEqual([])
  })

  test.each([...MISSING_FIELDS, ...MALFORMED_FIELDS])('%s', (_name, change, code) => {
    expect(connectionProblems(changed(change), known)).toContain(code)
  })

  test.each(STILL_SOUND)('stays sound: %s', (_name, change) => {
    expect(connectionProblems(changed(change), known)).toEqual([])
  })

  test.each(NOT_OBJECTS)('%j is not a connection', (entry) => {
    expect(connectionProblems(entry, known)).toEqual(['NOT_AN_OBJECT'])
  })

  test('a blank author and verifier are missing, not the same person', () => {
    expect(connectionProblems(changed({ author: '', verifiedBy: '' }), known)).toEqual(['NO_AUTHOR', 'UNVERIFIED'])
  })

  test('an upstream source by anyone else is neither allowed nor strong', () => {
    const sources = [{ url: 'https://up.example.test/', kind: 'upstream' }]
    expect(connectionProblems(changed({ sources }), known)).toEqual(['CONFIRMED_WEAK_SOURCE', 'UPSTREAM_SOURCE_ON_NEW'])
  })

  test('reports each code once', () => {
    const problems = connectionProblems(changed({ sources: [null, null], requires: [] }), known)
    expect(new Set(problems).size).toBe(problems.length)
  })

  test('never throws, never passes, and only ever returns listed codes, whatever the entry', () => {
    fc.assert(
      fc.property(fc.anything(), (entry) => {
        const problems = connectionProblems(entry, known)
        expect(problems.length).toBeGreaterThan(0)
        for (const code of problems) expect(PROBLEM_CODES).toContain(code)
      }),
      { numRuns: 500 },
    )
  })

  test('one field replaced by anything: no throw, and the engine and the validator agree', () => {
    const field = fc.constantFrom(...Object.keys(fixtureCatalog().connections[0]!))
    fc.assert(
      fc.property(field, fc.anything(), (name, value) => {
        const catalog = fixtureCatalog()
        const c = { ...catalog.connections[0]!, [name]: value } as Connection
        catalog.connections = [c]
        const codes = connectionProblems(c, known)
        expect(isShowable(c, known)).toBe(codes.length === 0)
        const reported = validateCatalog(catalog)
        expect(reported.map((p) => p.code).sort()).toEqual([...codes].sort())
        expect(JSON.stringify(reported)).not.toContain('LEAK')
      }),
      { numRuns: 500 },
    )
  })
})

describe('visible with anything at all', () => {
  test('never throws and shows nothing', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), fc.anything(), (catalog, marks, unlocks) => {
        expect(visible(catalog as Catalog, marks as Marks, unlocks as Unlocks)).toEqual([])
      }),
      { numRuns: 500 },
    )
  })
})

describe('isBlank', () => {
  test.each<[unknown]>([
    [''],
    ['   '],
    ['\t\n'],
    [' '],
    ['​'],
    ['﻿'],
    ['­'],
    ['ㅤ'],
    ['\u0000'],
    ['\u0001'],
    ['\u007f'],
    ['\u0085'],
    [''],
    ['\ud800'],
    [' ​ '],
    [null],
    [undefined],
    [42],
    [[]],
    [{}],
  ])('%j is blank', (value) => expect(isBlank(value)).toBe(true))

  test.each([['a'], [' a '], ['a b'], ['0'], ['ñ'], ['日本語'], ['-']])('%j is not', (value) => {
    expect(isBlank(value)).toBe(false)
  })
})

describe('knownBookIds', () => {
  test('takes only well-formed ids', () => {
    const books = [null, 42, [], {}, { id: 42 }, { id: ' ' }, { id: 'Ash Road' }, { id: '__proto__' }, { id: 'ash-road' }]
    expect([...knownBookIds(books)]).toEqual(['ash-road'])
  })

  test.each<[unknown]>([[null], [undefined], [42], ['ash-road'], [{ id: 'ash-road' }]])(
    '%j holds no books',
    (books) => expect(knownBookIds(books).size).toBe(0),
  )

  test('the engine and the validator agree on what is known', () => {
    const catalog = fixtureCatalog()
    const books: unknown[] = [{ id: 42 }, { id: 'Not A Slug' }, ...catalog.books]
    catalog.books = books as Catalog['books']
    const unknownEnd = { ...catalog.connections[0]!, from: 42, requires: [42, 'copper-orchard'] }
    const textEnd = { ...catalog.connections[1]!, from: 'Not A Slug', requires: ['Not A Slug', 'northern-gale', 'copper-orchard'] }
    catalog.connections = [unknownEnd as unknown as Connection, textEnd as Connection]

    const reported = validateCatalog(catalog)
    expect(reported).toContainEqual({ code: 'REF_UNKNOWN', id: 'c-0001' })
    expect(reported).toContainEqual({ code: 'REF_UNKNOWN', id: 'c-0002' })
    const everyone = Object.fromEntries(
      [42, 'Not A Slug', ...fixtureCatalog().books.map((b) => b.id)].map((id) => [id, { status: 'read', at: 1 }]),
    ) as Marks
    expect(visible(catalog, everyone, {})).toEqual([])
  })
})

describe('repeatedIds', () => {
  test('names only ids seen more than once', () => {
    expect([...repeatedIds([{ id: 'a' }, { id: 'b' }, { id: 'a' }, { id: 'a' }])]).toEqual(['a'])
  })

  test('ignores entries without a string id', () => {
    expect(repeatedIds([null, null, 42, 42, {}, {}, { id: 1 }, { id: 1 }]).size).toBe(0)
  })

  test('ignores an array that carries an id', () => {
    const list = Object.assign([], { id: 'a' })
    expect(repeatedIds([list, list]).size).toBe(0)
  })
})

describe('one list per enum', () => {
  test('the worlds of the design are the worlds of the data', () => {
    expect(Object.keys(WORLDS).sort()).toEqual([...WORLD_KEYS].sort())
  })

  test('every mark status has a list entry', () => {
    expect([...MARK_STATUSES].sort()).toEqual(['none', 'read', 'reading', 'skipped'])
  })

  test('problem codes are unique', () => {
    expect(new Set(PROBLEM_CODES).size).toBe(PROBLEM_CODES.length)
  })
})
