import { describe, expect, test } from 'vitest'
import type { Book } from '../../src/data/types'
import type { Marks, MarkStatus } from '../../src/spoilers/visible'
import { current, gaps, next, ordered, volumeToBuy } from '../../src/reading/next'

function b(id: string, rec: number, extra: Partial<Book> = {}): Book {
  return {
    id,
    titles: { en: id, es: null },
    esEdition: { status: 'none' },
    world: 'sel',
    series: null,
    format: 'novel',
    status: 'published',
    order: { recommended: rec, publication: 10 - rec },
    phase: 1,
    ...extra,
  }
}

function marks(entries: Record<string, MarkStatus>): Marks {
  return Object.fromEntries(Object.entries(entries).map(([id, status]) => [id, { status, at: 1 }]))
}

const opts = { order: 'recommended', includeRpg: false } as const
const books = [b('a', 1), b('b', 2), b('c', 3), b('d', 4), b('e', 5)]
const ids = (list: Book[]) => list.map((x) => x.id)

describe('reading order', () => {
  test('books with no place come last, in the order they came, and two of them never confuse the sort', () => {
    const u = (id: string) => b(id, 0, { order: {} })
    expect(ids(ordered([u('p'), b('x', 2), u('q'), b('y', 1)], 'recommended'))).toEqual(['y', 'x', 'p', 'q'])
    expect(ids(ordered([u('q'), u('p'), b('x', 2)], 'recommended'))).toEqual(['x', 'q', 'p'])
  })

  test('ordered sorts by the chosen order without mutating', () => {
    const input = [b('x', 3), b('y', 1), b('z', 2)]
    expect(ids(ordered(input, 'recommended'))).toEqual(['y', 'z', 'x'])
    expect(ids(ordered(input, 'publication'))).toEqual(['x', 'z', 'y'])
    expect(ids(input)).toEqual(['x', 'y', 'z'])
  })

  test('next is the first unread after the one in progress', () => {
    const m = marks({ a: 'read', b: 'reading' })
    expect(current(books, m, opts)?.id).toBe('b')
    expect(next(books, m, opts)?.id).toBe('c')
  })

  test('gaps lists unread before current', () => {
    const m = marks({ c: 'reading', a: 'read' })
    expect(ids(gaps(books, m, opts))).toEqual(['b'])
  })

  test('skipped works leave the gaps list', () => {
    const m = marks({ a: 'skipped', b: 'read', c: 'reading' })
    expect(gaps(books, m, opts)).toEqual([])
    expect(ids(gaps(books, marks({ a: 'skipped', c: 'reading' }), opts))).toEqual(['b'])
    expect(next(books, marks({ a: 'skipped', b: 'reading' }), opts)?.id).toBe('c')
  })

  test('rpg and essay do not count unless includeRpg', () => {
    const list = [b('a', 1), b('r', 2, { format: 'rpg' }), b('s', 3, { format: 'essay' }), b('c', 4)]
    const m = marks({ a: 'reading' })
    expect(next(list, m, opts)?.id).toBe('c')
    expect(next(list, m, { ...opts, includeRpg: true })?.id).toBe('r')
    expect(ids(gaps(list, marks({ c: 'reading' }), opts))).toEqual(['a'])
    expect(ids(gaps(list, marks({ c: 'reading' }), { ...opts, includeRpg: true }))).toEqual(['a', 'r', 's'])
  })

  test('a role-playing book in progress is still current', () => {
    const list = [b('a', 1), b('r', 2, { format: 'rpg' })]
    expect(current(list, marks({ r: 'reading' }), opts)?.id).toBe('r')
  })

  test('announced works never become next', () => {
    const list = [b('a', 1), b('n', 2, { status: 'announced' }), b('p', 3, { status: 'planned' }), b('c', 4)]
    expect(next(list, marks({ a: 'read' }), opts)?.id).toBe('c')
    expect(current(list, marks({ n: 'reading' }), opts)).toBeNull()
    expect(ids(gaps(list, marks({ c: 'reading' }), opts))).toEqual(['a'])
  })

  test('nothing in progress: next is the first unread, no gaps', () => {
    const m = marks({ a: 'read', b: 'read' })
    expect(current(books, m, opts)).toBeNull()
    expect(next(books, m, opts)?.id).toBe('c')
    expect(gaps(books, m, opts)).toEqual([])
  })

  test('everything read: next is null', () => {
    const m = marks({ a: 'read', b: 'read', c: 'read', d: 'read', e: 'read' })
    expect(next(books, m, opts)).toBeNull()
  })

  test('nothing unread after current: next is null, not an earlier gap', () => {
    const m = marks({ e: 'reading' })
    expect(next(books, m, opts)).toBeNull()
    expect(ids(gaps(books, m, opts))).toEqual(['a', 'b', 'c', 'd'])
  })

  test('two in progress: current is the first in order', () => {
    const m = marks({ d: 'reading', b: 'reading' })
    expect(current(books, m, opts)?.id).toBe('b')
  })

  test('a mark set to none counts as unread', () => {
    expect(next(books, marks({ a: 'none' }), opts)?.id).toBe('a')
  })

  test('marks with unknown ids are ignored and do not throw', () => {
    const m = marks({ ghost: 'reading', a: 'read' })
    expect(current(books, m, opts)).toBeNull()
    expect(next(books, m, opts)?.id).toBe('b')
  })

  test('volumeToBuy returns the carrying volume, null when standalone', () => {
    const list = [b('anth', 1, { format: 'anthology' }), b('tale', 2, { containedIn: ['missing', 'anth'] }), b('solo', 3)]
    expect(volumeToBuy(list[1]!, list)?.id).toBe('anth')
    expect(volumeToBuy(list[2]!, list)).toBeNull()
    expect(volumeToBuy(b('lost', 4, { containedIn: ['missing'] }), list)).toBeNull()
  })

  test('volumeToBuy prefers a published carrier, and says nothing when none is published', () => {
    const announced = b('soon', 1, { format: 'anthology', status: 'announced' })
    const out = b('out', 2, { format: 'anthology' })
    const tale = b('tale', 3, { containedIn: ['soon', 'out'] })
    expect(volumeToBuy(tale, [announced, out, tale])?.id).toBe('out')
    expect(volumeToBuy(b('only', 4, { containedIn: ['soon'] }), [announced])).toBeNull()
  })
})
