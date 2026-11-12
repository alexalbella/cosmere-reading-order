import { describe, expect, test } from 'vitest'
import type { Book } from '../../src/data/types'
import { applyMark, restoreMarks, setUnlock, worksCarriedBy } from '../../src/reading/marks'
import { mergeState, type ReadState } from '../../src/state/merge'

function b(id: string, extra: Partial<Book> = {}): Book {
  return {
    id,
    titles: { en: id, es: null },
    esEdition: { status: 'none' },
    world: 'sel',
    series: null,
    format: 'novel',
    status: 'published',
    order: {},
    phase: null,
    ...extra,
  }
}

const empty = (): ReadState => ({ marks: {}, unlocks: {} })

describe('marks', () => {
  test('applyMark records status and time', () => {
    const { state } = applyMark(empty(), ['a', 'b'], 'read', 100)
    expect(state.marks).toEqual({ a: { status: 'read', at: 100 }, b: { status: 'read', at: 100 } })
  })

  test('applyMark does not mutate its input', () => {
    const s: ReadState = { marks: { a: { status: 'reading', at: 1 } }, unlocks: {} }
    const copy = structuredClone(s)
    applyMark(s, ['a'], 'read', 5)
    expect(s).toEqual(copy)
  })

  test('restoreMarks returns the previous status', () => {
    const s: ReadState = { marks: { a: { status: 'reading', at: 1 } }, unlocks: {} }
    const { state, previous } = applyMark(s, ['a', 'b'], 'read', 100)
    const back = restoreMarks(state, previous, 200)
    expect(back.marks.a).toEqual({ status: 'reading', at: 200 })
    expect(back.marks.b).toEqual({ status: 'none', at: 200 })
  })

  test('clearing a mark keeps it with status none and its time', () => {
    const s: ReadState = { marks: { a: { status: 'read', at: 1 } }, unlocks: {} }
    expect(applyMark(s, ['a'], 'none', 9).state.marks.a).toEqual({ status: 'none', at: 9 })
  })

  test("an anthology's worksCarriedBy names its contained works", () => {
    const list = [
      b('anth', { format: 'anthology' }),
      b('t1', { containedIn: ['anth'] }),
      b('t2', { containedIn: ['x', 'anth'] }),
      b('solo'),
    ]
    expect(worksCarriedBy(list[0]!, list).map((x) => x.id)).toEqual(['t1', 't2'])
    expect(worksCarriedBy(list[3]!, list)).toEqual([])
  })

  test('unknown ids in marks survive applyMark', () => {
    const s: ReadState = { marks: { ghost: { status: 'read', at: 1 } }, unlocks: {} }
    expect(applyMark(s, ['a'], 'read', 2).state.marks.ghost).toEqual({ status: 'read', at: 1 })
  })

  test('a __proto__ id never becomes a prototype', () => {
    const { state } = applyMark(empty(), ['__proto__'], 'read', 1)
    expect(Object.keys(state.marks)).toEqual([])
    expect(Object.getPrototypeOf(state.marks)?.status).toBeUndefined()
  })

  test('setUnlock records on/off with time without mutating', () => {
    const s = empty()
    const on = setUnlock(s, 'a', true, 7)
    expect(on.unlocks.a).toEqual({ on: true, at: 7 })
    expect(setUnlock(on, 'a', false, 8).unlocks.a).toEqual({ on: false, at: 8 })
    expect(s.unlocks).toEqual({})
  })
})

describe('a change beats what it replaces, whatever the clock says', () => {
  const later: ReadState = { marks: { a: { status: 'read', at: 1000 } }, unlocks: { a: { on: true, at: 1000 } } }

  test('a mark on a slow clock is dated just above the one it replaces', () => {
    expect(applyMark(later, ['a'], 'none', 5).state.marks.a).toEqual({ status: 'none', at: 1001 })
  })

  test('an undo on a slow clock too', () => {
    const { state, previous } = applyMark(later, ['a'], 'none', 5)
    expect(restoreMarks(state, previous, 6).marks.a).toEqual({ status: 'read', at: 1002 })
  })

  test('a re-lock on a slow clock too, and the merge keeps it locked', () => {
    const relocked = setUnlock(later, 'a', false, 5)
    expect(relocked.unlocks.a).toEqual({ on: false, at: 1001 })
    expect(mergeState(later, relocked).unlocks.a?.on).toBe(false)
    expect(mergeState(relocked, later).unlocks.a?.on).toBe(false)
  })

  test('a mark on a slow clock wins the merge, in either order', () => {
    const changed = applyMark(later, ['a'], 'none', 5).state
    expect(mergeState(later, changed).marks.a?.status).toBe('none')
    expect(mergeState(changed, later).marks.a?.status).toBe('none')
  })

  test('with a good clock the date is simply now', () => {
    expect(applyMark(later, ['a'], 'none', 2000).state.marks.a?.at).toBe(2000)
    expect(setUnlock(later, 'a', false, 2000).unlocks.a?.at).toBe(2000)
  })

  test('a change in the same millisecond still comes after the one before', () => {
    const first = applyMark({ marks: {}, unlocks: {} }, ['a'], 'read', 50).state
    expect(applyMark(first, ['a'], 'reading', 50).state.marks.a?.at).toBe(51)
  })
})
