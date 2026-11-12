import { beforeEach, describe, expect, test } from 'vitest'
import { loadState, saveState } from '../../src/state/store'
import type { ReadState } from '../../src/state/merge'

const sample: ReadState = {
  marks: { a: { status: 'read', at: 10 } },
  unlocks: { a: { on: true, at: 11 } },
}

function fakeStorage(): Storage {
  const data = new Map<string, string>()
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

const throwing: Storage = {
  length: 0,
  clear() {
    throw new Error('denied')
  },
  getItem() {
    throw new Error('denied')
  },
  key() {
    throw new Error('denied')
  },
  removeItem() {
    throw new Error('denied')
  },
  setItem() {
    throw new Error('denied')
  },
}

describe('store', () => {
  let storage: Storage
  beforeEach(() => {
    storage = fakeStorage()
  })

  test('empty storage gives an empty, not corrupt, state', () => {
    expect(loadState(storage)).toEqual({ state: { marks: {}, unlocks: {} }, corrupt: false })
  })

  test('round trip', () => {
    saveState(sample, storage)
    expect(storage.getItem('cosmere.state.v1')).not.toBeNull()
    expect(loadState(storage)).toEqual({ state: sample, corrupt: false })
  })

  test.each([
    ['marks missing', '{"unlocks":{}}'],
    ['unlocks missing', '{"marks":{}}'],
    ['marks an array', '{"marks":[],"unlocks":{}}'],
    ['unlocks a string', '{"marks":{},"unlocks":"x"}'],
    ['marks null', '{"marks":null,"unlocks":{}}'],
    ['both missing', '{}'],
  ])('a stored state with %s is corrupt: empty, flagged, and its text kept', (_name, raw) => {
    storage.setItem('cosmere.state.v1', raw)
    expect(loadState(storage)).toEqual({ state: { marks: {}, unlocks: {} }, corrupt: true })
    expect(storage.getItem('cosmere.state.corrupt')).toBe(raw)
  })

  test('good tables with bad entries inside are not corrupt: the bad ones go one by one', () => {
    storage.setItem('cosmere.state.v1', '{"marks":{"a":{"status":"read","at":1},"b":5},"unlocks":{}}')
    expect(loadState(storage)).toEqual({ state: { marks: { a: { status: 'read', at: 1 } }, unlocks: {} }, corrupt: false })
    expect(storage.getItem('cosmere.state.corrupt')).toBeNull()
  })

  test('corrupt JSON returns empty, corrupt: true, and keeps the raw text under cosmere.state.corrupt', () => {
    storage.setItem('cosmere.state.v1', '{nope')
    expect(loadState(storage)).toEqual({ state: { marks: {}, unlocks: {} }, corrupt: true })
    expect(storage.getItem('cosmere.state.corrupt')).toBe('{nope')
  })

  test('a non-object root is corrupt', () => {
    storage.setItem('cosmere.state.v1', '[1,2]')
    expect(loadState(storage).corrupt).toBe(true)
    storage.setItem('cosmere.state.v1', 'null')
    expect(loadState(storage).corrupt).toBe(true)
  })

  test('bad entries are dropped without marking the state corrupt', () => {
    storage.setItem(
      'cosmere.state.v1',
      JSON.stringify({
        marks: { a: { status: 'read', at: 1 }, b: { status: 'bogus', at: 1 }, c: { status: 'read', at: 'x' }, d: 7 },
        unlocks: { a: { on: true, at: 1 }, b: { on: 'yes', at: 1 }, c: { on: true } },
      }),
    )
    expect(loadState(storage)).toEqual({
      state: { marks: { a: { status: 'read', at: 1 } }, unlocks: { a: { on: true, at: 1 } } },
      corrupt: false,
    })
  })

  test('a throwing storage degrades to memory without throwing', () => {
    expect(() => saveState(sample, throwing)).not.toThrow()
    expect(loadState(throwing)).toEqual({ state: sample, corrupt: false })
  })
})
