import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { clampAgainst, clampFuture, mergeState, sameState, sanitizeState, type ReadState } from '../../src/state/merge'
import type { MarkStatus } from '../../src/spoilers/visible'

const STATUSES: MarkStatus[] = ['read', 'reading', 'skipped', 'none']
const IDS = ['a', 'b', 'c']

const markArb = fc.record({ status: fc.constantFrom(...STATUSES), at: fc.integer({ min: 0, max: 5 }) })
const unlockArb = fc.record({ on: fc.boolean(), at: fc.integer({ min: 0, max: 5 }) })
const dict = <T>(arb: fc.Arbitrary<T>) =>
  fc.dictionary(fc.constantFrom(...IDS), arb).map((d) => d as Record<string, T>)
const stateArb: fc.Arbitrary<ReadState> = fc.record({ marks: dict(markArb), unlocks: dict(unlockArb) })

const m = (status: MarkStatus, at: number) => ({ status, at })

describe('mergeState', () => {
  test('no entry of the result is an entry of an input, whichever side won', () => {
    const a: ReadState = { marks: { x: m('read', 1), y: m('read', 9) }, unlocks: { x: { on: true, at: 1 }, y: { on: true, at: 9 } } }
    const b: ReadState = { marks: { x: m('none', 5), z: m('read', 2) }, unlocks: { x: { on: false, at: 5 }, z: { on: true, at: 2 } } }
    const out = mergeState(a, b)
    const inputs = new Set<object>([...Object.values(a.marks), ...Object.values(b.marks), ...Object.values(a.unlocks), ...Object.values(b.unlocks)])
    for (const entry of [...Object.values(out.marks), ...Object.values(out.unlocks)]) expect(inputs.has(entry)).toBe(false)
    expect(Object.keys(out.marks).sort()).toEqual(['x', 'y', 'z'])
  })

  test('later at wins per book', () => {
    const a: ReadState = { marks: { x: m('read', 1), y: m('none', 9) }, unlocks: {} }
    const b: ReadState = { marks: { x: m('skipped', 2), y: m('read', 3) }, unlocks: {} }
    expect(mergeState(a, b).marks).toEqual({ x: m('skipped', 2), y: m('none', 9) })
  })

  test('on a tie the lower rank wins: none, then skipped, reading, read (fail closed, like unlocks)', () => {
    for (let i = 0; i < STATUSES.length; i++) {
      for (let j = i + 1; j < STATUSES.length; j++) {
        const high = STATUSES[i]!
        const low = STATUSES[j]!
        const a: ReadState = { marks: { x: m(high, 4) }, unlocks: {} }
        const b: ReadState = { marks: { x: m(low, 4) }, unlocks: {} }
        expect(mergeState(a, b).marks.x?.status).toBe(low)
        expect(mergeState(b, a).marks.x?.status).toBe(low)
      }
    }
  })

  test('unlocks merge per key by at; a tie resolves to off', () => {
    const a: ReadState = {
      marks: {},
      unlocks: { x: { on: true, at: 5 }, y: { on: true, at: 1 }, z: { on: true, at: 3 } },
    }
    const b: ReadState = {
      marks: {},
      unlocks: { x: { on: false, at: 5 }, y: { on: false, at: 2 }, w: { on: true, at: 1 } },
    }
    expect(mergeState(a, b).unlocks).toEqual({
      x: { on: false, at: 5 },
      y: { on: false, at: 2 },
      z: { on: true, at: 3 },
      w: { on: true, at: 1 },
    })
    expect(mergeState(b, a)).toEqual(mergeState(a, b))
  })

  test('is commutative', () => {
    fc.assert(
      fc.property(stateArb, stateArb, (a, b) => {
        expect(mergeState(a, b)).toEqual(mergeState(b, a))
      }),
    )
  })

  test('is associative', () => {
    fc.assert(
      fc.property(stateArb, stateArb, stateArb, (a, b, c) => {
        expect(mergeState(mergeState(a, b), c)).toEqual(mergeState(a, mergeState(b, c)))
      }),
    )
  })

  test('is idempotent', () => {
    fc.assert(
      fc.property(stateArb, (a) => {
        expect(mergeState(a, a)).toEqual(a)
      }),
    )
  })

  test('does not mutate its inputs', () => {
    const a: ReadState = { marks: { x: m('read', 1) }, unlocks: { x: { on: true, at: 1 } } }
    const b: ReadState = { marks: { x: m('none', 2) }, unlocks: { x: { on: false, at: 2 } } }
    const ca = structuredClone(a)
    const cb = structuredClone(b)
    mergeState(a, b)
    expect(a).toEqual(ca)
    expect(b).toEqual(cb)
  })

  test('a __proto__ key from JSON never becomes a prototype', () => {
    const evil = JSON.parse(
      '{"marks":{"__proto__":{"status":"read","at":1}},"unlocks":{"__proto__":{"on":true,"at":1}}}',
    ) as ReadState
    const merged = mergeState(evil, { marks: {}, unlocks: {} })
    expect(Object.keys(merged.marks)).toEqual([])
    expect(Object.keys(merged.unlocks)).toEqual([])
    expect(Object.getPrototypeOf(merged.marks)?.status).toBeUndefined()
    const clamped = clampFuture(evil, 10)
    expect(Object.keys(clamped.marks)).toEqual([])
    expect(Object.getPrototypeOf(clamped.marks)?.status).toBeUndefined()
  })
})

describe('clampFuture', () => {
  const now = 1_000_000
  const FIVE = 5 * 60 * 1000

  test('sets anything beyond now + 5 minutes to now', () => {
    const s: ReadState = {
      marks: { ok: m('read', now + FIVE), far: m('read', now + FIVE + 1), past: m('read', 5) },
      unlocks: { far: { on: true, at: now + 10 * FIVE }, ok: { on: true, at: now } },
    }
    const out = clampFuture(s, now)
    expect(out.marks).toEqual({ ok: m('read', now + FIVE), far: m('read', now), past: m('read', 5) })
    expect(out.unlocks).toEqual({ far: { on: true, at: now }, ok: { on: true, at: now } })
  })

  test('does not mutate its input', () => {
    const s: ReadState = { marks: { far: m('read', now * 9) }, unlocks: {} }
    clampFuture(s, now)
    expect(s.marks.far?.at).toBe(now * 9)
  })
})

describe('sameState', () => {
  const a = { status: 'read' as const, at: 1 }
  const b = { status: 'none' as const, at: 2 }
  const u = { on: true, at: 3 }

  test('the order of the ids does not matter', () => {
    expect(sameState({ marks: { x: a, y: b }, unlocks: { z: u } }, { marks: { y: b, x: a }, unlocks: { z: u } })).toBe(true)
  })

  test('an entry that differs, is missing, or sits in the other table does', () => {
    const base = { marks: { x: a }, unlocks: {} }
    expect(sameState(base, { marks: { x: { ...a, at: 9 } }, unlocks: {} })).toBe(false)
    expect(sameState(base, { marks: { x: { ...a, status: 'none' } }, unlocks: {} })).toBe(false)
    expect(sameState(base, { marks: {}, unlocks: {} })).toBe(false)
    expect(sameState({ marks: {}, unlocks: { x: u } }, { marks: { x: a }, unlocks: {} })).toBe(false)
  })
})

describe('clampAgainst', () => {
  const NOW = 1_000_000
  const AHEAD = NOW + 365 * 24 * 3600 * 1000
  const state = (status: MarkStatus, at: number, on = true): ReadState => ({ marks: { x: { status, at } }, unlocks: { x: { on, at } } })

  test('a date too far ahead with no copy to answer to comes down to the clock', () => {
    expect(clampAgainst(state('read', AHEAD), NOW, { marks: {}, unlocks: {} })).toEqual(state('read', NOW))
  })

  test('what the copy already holds takes the copy\'s date, leaving nothing to send', () => {
    expect(clampAgainst(state('read', AHEAD), NOW, state('read', NOW + 400))).toEqual(state('read', NOW + 400))
  })

  test('a change the copy has not seen lands just above it, even when the clock rounds below it', () => {
    const copy = state('none', NOW + 400, false)
    const out = clampAgainst(state('read', AHEAD, true), NOW, copy)
    expect(out).toEqual(state('read', NOW + 401, true))
    expect(mergeState(out, copy).marks.x?.status).toBe('read')
    expect(mergeState(out, copy).unlocks.x?.on).toBe(true)
  })

  test('with an older copy it lands on the clock', () => {
    expect(clampAgainst(state('read', AHEAD), NOW, state('none', 5, false)).marks.x?.at).toBe(NOW)
  })

  test('a date within the five minutes allowed is left alone', () => {
    const near = state('read', NOW + 60_000)
    expect(clampAgainst(near, NOW, state('none', NOW, false))).toEqual(near)
  })
})

describe('ids', () => {
  const entry = { status: 'read', at: 1 }
  const unlock = { on: true, at: 1 }

  test.each(['UPPER', 'with space', 'a/b', 'a_b', '-a', 'a-', 'a--b', '', '__proto__', 'é', 'aaa.', '.a', 'a..b', 'a.-b', 'a-.b', '../up', '..'])('%j could not be a book or an alias, and is dropped', (id) => {
    const value = JSON.parse(`{"marks":{${JSON.stringify(id)}:${JSON.stringify(entry)}},"unlocks":{${JSON.stringify(id)}:${JSON.stringify(unlock)}}}`) as unknown
    expect(sanitizeState(value)).toEqual({ marks: {}, unlocks: {} })
  })

  test.each(['a', 'ash-road', 'b2', '7th-book', 'constructor', 'sa2.5'])('%j is kept', (id) => {
    const state = sanitizeState({ marks: { [id]: entry }, unlocks: { [id]: unlock } })!
    expect(Object.keys(state.marks)).toEqual([id])
    expect(Object.keys(state.unlocks)).toEqual([id])
  })
})
