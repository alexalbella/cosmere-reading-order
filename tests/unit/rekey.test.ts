import { describe, expect, test } from 'vitest'
import { rekeyState } from '../../src/state/rekey'
import type { ReadState } from '../../src/state/merge'
import { fixtureCatalog } from '../fixtures/catalog'

const books = () => {
  const list = fixtureCatalog().books
  list.find((b) => b.id === 'ash-road')!.aliases = ['old-ash', 'older-ash']
  return list
}

describe('rekeyState', () => {
  test('a mark stored under an alias moves to the current id', () => {
    const s: ReadState = { marks: { 'old-ash': { status: 'read', at: 5 } }, unlocks: {} }
    const out = rekeyState(s, books())
    expect(out.marks['ash-road']).toEqual({ status: 'read', at: 5 })
    expect(out.marks['old-ash']).toBeUndefined()
  })
  test('an unlock under an alias moves too', () => {
    const s: ReadState = { marks: {}, unlocks: { 'older-ash': { on: true, at: 9 } } }
    const out = rekeyState(s, books())
    expect(out.unlocks['ash-road']).toEqual({ on: true, at: 9 })
    expect(out.unlocks['older-ash']).toBeUndefined()
  })
  test('when both exist the later change wins, whichever side holds it', () => {
    const older: ReadState = {
      marks: { 'old-ash': { status: 'read', at: 5 }, 'ash-road': { status: 'reading', at: 9 } },
      unlocks: {},
    }
    expect(rekeyState(older, books()).marks['ash-road']).toEqual({ status: 'reading', at: 9 })
    const newer: ReadState = {
      marks: { 'old-ash': { status: 'read', at: 12 }, 'ash-road': { status: 'reading', at: 9 } },
      unlocks: {},
    }
    expect(rekeyState(newer, books()).marks['ash-road']).toEqual({ status: 'read', at: 12 })
  })
  test('ids the catalogue does not know are kept', () => {
    const s: ReadState = { marks: { stranger: { status: 'read', at: 1 } }, unlocks: { other: { on: true, at: 1 } } }
    const out = rekeyState(s, books())
    expect(out.marks['stranger']).toEqual({ status: 'read', at: 1 })
    expect(out.unlocks['other']).toEqual({ on: true, at: 1 })
  })
  test('an alias that is also a current id is left alone', () => {
    const list = books()
    list.find((b) => b.id === 'glass-harbour')!.aliases = ['copper-orchard']
    const s: ReadState = { marks: { 'copper-orchard': { status: 'read', at: 1 } }, unlocks: {} }
    const out = rekeyState(s, list)
    expect(out.marks['copper-orchard']).toEqual({ status: 'read', at: 1 })
    expect(out.marks['glass-harbour']).toBeUndefined()
  })
  test('does not change its input', () => {
    const s: ReadState = { marks: { 'old-ash': { status: 'read', at: 5 } }, unlocks: {} }
    const copy = JSON.parse(JSON.stringify(s)) as ReadState
    rekeyState(s, books())
    expect(s).toEqual(copy)
  })
  test('two aliases of one book that both hold marks keep the later change, in any order', () => {
    const later: ReadState = {
      marks: { 'old-ash': { status: 'reading', at: 3 }, 'older-ash': { status: 'read', at: 8 } },
      unlocks: { 'old-ash': { on: true, at: 9 }, 'older-ash': { on: false, at: 2 } },
    }
    const out = rekeyState(later, books())
    expect(out.marks['ash-road']).toEqual({ status: 'read', at: 8 })
    expect(out.unlocks['ash-road']).toEqual({ on: true, at: 9 })
    const swapped: ReadState = {
      marks: { 'older-ash': { status: 'reading', at: 3 }, 'old-ash': { status: 'read', at: 8 } },
      unlocks: {},
    }
    expect(rekeyState(swapped, books()).marks['ash-road']).toEqual({ status: 'read', at: 8 })
  })
  test('when no stored key is an alias the very same state object comes back', () => {
    const s: ReadState = { marks: { 'ash-road': { status: 'read', at: 5 }, other: { status: 'read', at: 1 } }, unlocks: {} }
    expect(rekeyState(s, books())).toBe(s)
  })
  test('with no alias in play the state is unchanged', () => {
    const s: ReadState = { marks: { 'ash-road': { status: 'read', at: 5 } }, unlocks: {} }
    expect(rekeyState(s, books())).toEqual(s)
  })
})
