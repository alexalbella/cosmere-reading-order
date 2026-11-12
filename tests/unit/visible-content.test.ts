import { describe, expect, test } from 'vitest'
import type { Catalog } from '../../src/data/types'
import { synopsisFor, visibleNotes, type Marks, type Unlocks } from '../../src/spoilers/visible'
import { fixtureCatalog } from '../fixtures/catalog'
import { fixtureBookMap, fixtureNotes, fixtureSynopses } from '../fixtures/content'

function catalog(extra: Partial<Catalog> = {}): Catalog {
  return { ...fixtureCatalog(), books: [...fixtureBookMap().values()], synopses: fixtureSynopses(), notes: fixtureNotes(), ...extra }
}
const read = (...ids: string[]): Marks => Object.fromEntries(ids.map((id) => [id, { status: 'read' as const, at: 1 }]))
const unlocked = (...ids: string[]): Unlocks => Object.fromEntries(ids.map((id) => [id, { on: true, at: 1 }]))
const noteIds = (c: Catalog, marks: Marks, unlocks: Unlocks = {}) => visibleNotes(c, marks, unlocks).map((n) => n.id)

describe('synopsisFor', () => {
  test('an open synopsis is visible with nothing read', () => {
    expect(synopsisFor(catalog(), {}, {}, 'copper-orchard')).toEqual({
      state: 'visible',
      text: { en: 'LEAK-syn-copper-orchard en', es: 'LEAK-syn-copper-orchard es' },
    })
  })

  test('a gated synopsis is gated until its earlier work is read, then visible', () => {
    expect(synopsisFor(catalog(), {}, {}, 'orchard-dusk')).toEqual({ state: 'gated' })
    expect(synopsisFor(catalog(), { 'orchard-dusk': { status: 'reading', at: 1 } }, {}, 'orchard-dusk')).toEqual({ state: 'gated' })
    expect(synopsisFor(catalog(), read('copper-orchard'), {}, 'orchard-dusk').state).toBe('visible')
  })

  test('an unlocked earlier work counts as read', () => {
    expect(synopsisFor(catalog(), {}, unlocked('copper-orchard'), 'orchard-dusk').state).toBe('visible')
  })

  test('an unsound synopsis is missing, never gated', () => {
    const outside = catalog({ synopses: [{ ...fixtureSynopses()[1]!, requires: ['ash-road'] }] })
    expect(synopsisFor(outside, {}, {}, 'orchard-dusk')).toEqual({ state: 'missing' })
    expect(synopsisFor(outside, read('ash-road', 'copper-orchard'), {}, 'orchard-dusk')).toEqual({ state: 'missing' })
  })

  test('two synopses for one book: missing', () => {
    const twice = catalog({ synopses: [...fixtureSynopses(), fixtureSynopses()[0]!] })
    expect(synopsisFor(twice, {}, {}, 'copper-orchard')).toEqual({ state: 'missing' })
    expect(synopsisFor(twice, {}, {}, 'glass-harbour').state).toBe('visible')
  })

  test('a work with no synopsis is missing', () => {
    expect(synopsisFor(catalog(), {}, {}, 'paper-wolves')).toEqual({ state: 'missing' })
  })

  test('malformed catalog fields give missing and an empty list', () => {
    for (const synopses of [null, 'x', 42, {}] as unknown as Catalog['synopses'][]) {
      expect(synopsisFor(catalog({ synopses }), {}, {}, 'copper-orchard')).toEqual({ state: 'missing' })
    }
    for (const notes of [null, 'x', 42, {}] as unknown as Catalog['notes'][]) {
      expect(visibleNotes(catalog({ notes }), read('ash-road', 'glass-harbour'), {})).toEqual([])
    }
    expect(synopsisFor(null as unknown as Catalog, {}, {}, 'copper-orchard')).toEqual({ state: 'missing' })
    expect(visibleNotes(null as unknown as Catalog, {}, {})).toEqual([])
  })
})

describe('visibleNotes', () => {
  test('a note shows only when every requirement is read', () => {
    expect(noteIds(catalog(), {})).toEqual([])
    expect(noteIds(catalog(), read('glass-harbour'))).toEqual([])
    expect(noteIds(catalog(), read('glass-harbour', 'ash-road'))).toEqual(['n-0001', 'n-0002'])
    expect(noteIds(catalog(), read('glass-harbour'), unlocked('ash-road'))).toEqual(['n-0001', 'n-0002'])
  })

  test('a note missing one of its books in requires never shows', () => {
    const bad = catalog({ notes: [{ ...fixtureNotes()[1]!, requires: ['ash-road'] }] })
    expect(noteIds(bad, read('glass-harbour', 'ash-road'))).toEqual([])
  })

  test('an id carried twice hides every note that carries it', () => {
    const twice = catalog({ notes: [...fixtureNotes(), { ...fixtureNotes()[0]!, books: ['glass-harbour'], requires: ['glass-harbour'] }] })
    expect(noteIds(twice, read('glass-harbour', 'ash-road'))).toEqual(['n-0002'])
  })
})

test('is pure: the same answer twice, and the inputs untouched', () => {
  const c = catalog()
  const marks = read('copper-orchard', 'glass-harbour', 'ash-road')
  const before = JSON.stringify([c, marks])
  expect(synopsisFor(c, marks, {}, 'orchard-dusk')).toEqual(synopsisFor(c, marks, {}, 'orchard-dusk'))
  expect(visibleNotes(c, marks, {})).toEqual(visibleNotes(c, marks, {}))
  const shown = synopsisFor(c, marks, {}, 'orchard-dusk')
  if (shown.state === 'visible') shown.text.en = 'changed'
  expect(JSON.stringify([c, marks])).toBe(before)
})
