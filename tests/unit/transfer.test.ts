import { describe, expect, test } from 'vitest'
import { exportState, MAX_STATE_BYTES, parseImport, parseState } from '../../src/state/transfer'
import type { ReadState } from '../../src/state/merge'

const sample: ReadState = {
  marks: { a: { status: 'read', at: 10 }, b: { status: 'none', at: 12 } },
  unlocks: { a: { on: true, at: 11 } },
}

describe('transfer', () => {
  test('export has the documented shape', () => {
    expect(JSON.parse(exportState(sample))).toEqual({ version: 1, marks: sample.marks, unlocks: sample.unlocks })
  })

  test('export then import is identical', () => {
    expect(parseImport(exportState(sample))).toEqual({ ok: true, state: sample })
  })

  test('ids the catalogue may not know are kept, for useApp to count', () => {
    const s: ReadState = {
      marks: { a: { status: 'read', at: 1 }, ghost: { status: 'read', at: 1 } },
      unlocks: { spook: { on: true, at: 1 } },
    }
    expect(parseImport(exportState(s))).toEqual({ ok: true, state: s })
  })

  test.each([
    ['not json', 'hello'],
    ['array', '[]'],
    ['null', 'null'],
    ['wrong version', '{"version":2,"marks":{},"unlocks":{}}'],
    ['missing version', '{"marks":{},"unlocks":{}}'],
    ['marks not an object', '{"version":1,"marks":[],"unlocks":{}}'],
    ['unlocks missing', '{"version":1,"marks":{}}'],
  ])('garbage is rejected with reason format: %s', (_name, text) => {
    expect(parseImport(text)).toEqual({ ok: false, reason: 'format' })
  })

  test('invalid entries are dropped like in loadState', () => {
    const text = JSON.stringify({
      version: 1,
      marks: { a: { status: 'read', at: 1 }, b: { status: 'x', at: 1 }, c: { status: 'read', at: 'n' } },
      unlocks: {},
    })
    expect(parseImport(text)).toEqual({
      ok: true,
      state: { marks: { a: { status: 'read', at: 1 } }, unlocks: {} },
    })
  })

  test('a __proto__ key is dropped', () => {
    const text = '{"version":1,"marks":{"__proto__":{"status":"read","at":1}},"unlocks":{}}'
    const out = parseImport(text)
    expect(out.ok && Object.keys(out.state.marks)).toEqual([])
  })
})

describe('limits', () => {
  test('an import above the size limit is refused before it is parsed', () => {
    const big = `{"version":1,"marks":{},"unlocks":{}}${' '.repeat(MAX_STATE_BYTES)}`
    expect(parseImport(big)).toEqual({ ok: false, reason: 'format' })
  })

  test('an import at the limit is read', () => {
    const text = '{"version":1,"marks":{},"unlocks":{}}'
    expect(parseImport(text + ' '.repeat(MAX_STATE_BYTES - text.length)).ok).toBe(true)
  })

  test('an id that is not a book id is dropped from an import', () => {
    const text = '{"version":1,"marks":{"a":{"status":"read","at":1},"Not An Id":{"status":"read","at":1}},"unlocks":{}}'
    expect(parseImport(text)).toEqual({ ok: true, state: { marks: { a: { status: 'read', at: 1 } }, unlocks: {} } })
  })

  test('an alias with a dot survives an import, for rekeyState to move it', () => {
    const text = '{"version":1,"marks":{"sa2.5":{"status":"read","at":1}},"unlocks":{"sa2.5":{"on":true,"at":1}}}'
    expect(parseImport(text)).toEqual({
      ok: true,
      state: { marks: { 'sa2.5': { status: 'read', at: 1 } }, unlocks: { 'sa2.5': { on: true, at: 1 } } },
    })
  })

  test('and what sync reads', () => {
    expect(parseState('{"marks":{"sa2.5":{"status":"read","at":1}},"unlocks":{"sa2.5":{"on":true,"at":1}}}')).toEqual({
      marks: { 'sa2.5': { status: 'read', at: 1 } },
      unlocks: { 'sa2.5': { on: true, at: 1 } },
    })
  })

  test('the same goes for what sync reads', () => {
    expect(parseState('{"marks":{"a":{"status":"read","at":1},"../b":{"status":"read","at":1}},"unlocks":{}}')).toEqual({
      marks: { a: { status: 'read', at: 1 } },
      unlocks: {},
    })
  })
})
