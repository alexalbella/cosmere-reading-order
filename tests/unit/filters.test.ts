import { describe, expect, test } from 'vitest'
import { BOOK_STATUSES, FORMATS } from '../../src/data/types'
import type { Connection } from '../../src/data/types'
import { defaultFilters, filterBooks, filterConnections } from '../../src/filters/filters'
import { fixtureCatalog } from '../fixtures/catalog'

const ids = (list: { id: string }[]) => list.map((x) => x.id)
const asConnection = (value: unknown) => value as Connection

describe('defaultFilters', () => {
  test("defaults: statuses is exactly ['published'], connectionTypes exactly ['major','significant'], theories false", () => {
    const f = defaultFilters()
    expect(f.statuses).toEqual(['published'])
    expect(f.connectionTypes).toEqual(['major', 'significant'])
    expect(f.theories).toBe(false)
  })
  test('every format but role-playing books, no series or phase restriction', () => {
    const f = defaultFilters()
    expect([...f.formats].sort()).toEqual(FORMATS.filter((x) => x !== 'rpg').sort())
    expect(f.formats).not.toContain('rpg')
    expect(f.series).toEqual([])
    expect(f.phases).toEqual([])
  })
  test('each call returns fresh arrays', () => {
    defaultFilters().statuses.push('planned')
    expect(defaultFilters().statuses).toEqual(['published'])
  })
})

describe('filterBooks', () => {
  const books = fixtureCatalog().books
  const allStatuses = { ...defaultFilters(), statuses: [...BOOK_STATUSES], formats: [...FORMATS] }

  test('defaults hide what is not published', () => {
    expect(ids(filterBooks(books, defaultFilters(), 'recommended'))).not.toContain('low-tide-atlas')
    expect(ids(filterBooks(books, defaultFilters(), 'recommended'))).not.toContain('paper-wolves')
    expect(filterBooks(books, allStatuses, 'recommended')).toHaveLength(books.length)
  })
  test('sorts by the order key, books without a position last', () => {
    const byPublication = ids(filterBooks(books, allStatuses, 'publication'))
    expect(byPublication.slice(0, 3)).toEqual(['ash-road', 'copper-orchard', 'glass-harbour'])
    expect(byPublication.at(-1)).toBe('low-tide-atlas')
    expect(ids(filterBooks(books, allStatuses, 'recommended')).at(-1)).toBe('low-tide-atlas')
  })
  test('does not mutate its input', () => {
    const copy = [...books]
    filterBooks(books, defaultFilters(), 'publication')
    expect(books).toEqual(copy)
  })
  test('an empty series or phases list means no restriction', () => {
    const f = { ...defaultFilters(), series: [], phases: [] }
    expect(filterBooks(books, f, 'recommended')).toHaveLength(books.length - 2)
  })
  test('a series list keeps only those series', () => {
    const f = { ...defaultFilters(), series: ['Orchard'] }
    expect(ids(filterBooks(books, f, 'recommended'))).toEqual(['copper-orchard', 'orchard-dusk'])
  })
  test('a phase list keeps only those phases', () => {
    expect(filterBooks(books, { ...allStatuses, phases: [2] }, 'recommended')).toEqual([])
    expect(filterBooks(books, { ...allStatuses, phases: [1] }, 'recommended')).toHaveLength(books.length - 1)
  })
  test('formats must contain the book format', () => {
    const f = { ...defaultFilters(), formats: ['novella' as const] }
    expect(ids(filterBooks(books, f, 'recommended'))).toEqual(['glass-harbour', 'orchard-dusk'])
    expect(filterBooks(books, { ...defaultFilters(), formats: [] }, 'recommended')).toEqual([])
  })
})

describe('filterConnections', () => {
  const list = fixtureCatalog().connections

  test('defaults keep only confirmed major and significant', () => {
    expect(ids(filterConnections(list, defaultFilters()))).toEqual(['c-0001', 'c-0002'])
  })
  test('theories false removes theory tier', () => {
    const f = { ...defaultFilters(), connectionTypes: ['minor' as const] }
    expect(ids(filterConnections(list, f))).toEqual(['c-0005'])
    expect(ids(filterConnections(list, { ...f, theories: true }))).toEqual(['c-0003', 'c-0005'])
  })
  test('filterConnections never adds to its input', () => {
    const f = {
      ...defaultFilters(),
      connectionTypes: ['major' as const, 'significant' as const, 'minor' as const],
      theories: true,
    }
    const out = filterConnections(list, f)
    expect(out.every((c) => list.includes(c))).toBe(true)
    expect(filterConnections([], f)).toEqual([])
  })
  test('does not mutate its input', () => {
    const copy = [...list]
    filterConnections(list, defaultFilters())
    expect(list).toEqual(copy)
  })
  test('an unknown tier and an unknown type stay hidden', () => {
    const f = { ...defaultFilters(), connectionTypes: ['major' as const, 'significant' as const], theories: true }
    const odd = [
      asConnection({ ...list[0], id: 'odd-tier', tier: 'rumour' }),
      asConnection({ ...list[0], id: 'odd-type', type: 'cameo' }),
      asConnection({ ...list[0], id: 'no-tier', tier: undefined }),
    ]
    expect(filterConnections(odd, f)).toEqual([])
  })
})
