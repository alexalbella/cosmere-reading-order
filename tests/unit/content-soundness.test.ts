import { describe, expect, test } from 'vitest'
import { isNoteId, noteProblems, synopsisProblems } from '../../src/data/soundness'
import type { Note, ProblemCode, Synopsis } from '../../src/data/types'
import { fixtureBookMap, fixtureNotes, fixtureSynopses } from '../fixtures/content'

const books = fixtureBookMap()
const known = new Set(books.keys())
const syn = (book: string): Synopsis => fixtureSynopses().find((s) => s.book === book)!
const note = (id: string): Note => fixtureNotes().find((n) => n.id === id)!
function without<T extends object>(entry: T, key: keyof T): Partial<T> {
  const copy: Partial<T> = { ...entry }
  delete copy[key]
  return copy
}

describe('synopsis soundness', () => {
  test('every clean fixture synopsis has no problems', () => {
    for (const s of fixtureSynopses()) expect(synopsisProblems(s, books)).toEqual([])
  })

  const cases: [string, () => unknown, ProblemCode][] = [
    ['its book must exist', () => ({ ...syn('glass-harbour'), book: 'nowhere' }), 'REF_UNKNOWN'],
    ['every required work must exist', () => ({ ...syn('orchard-dusk'), requires: ['nowhere'] }), 'REF_UNKNOWN'],
    ['both languages', () => ({ ...syn('glass-harbour'), text: { en: 'x', es: ' ' } }), 'MISSING_LANGUAGE'],
    ['at least one source', () => ({ ...syn('glass-harbour'), sources: [] }), 'NO_SOURCE'],
    ['sources are http links', () => ({ ...syn('glass-harbour'), sources: [{ url: 'ftp://x.test/a', kind: 'official' }] }), 'BAD_SOURCE_URL'],
    ['source kinds come from the list', () => ({ ...syn('glass-harbour'), sources: [{ url: 'https://x.test/a', kind: 'rumour' }] }), 'BAD_ENUM'],
    ['an author', () => ({ ...syn('glass-harbour'), author: '' }), 'NO_AUTHOR'],
    ['a verifier', () => ({ ...syn('glass-harbour'), verifiedBy: '' }), 'UNVERIFIED'],
    ['a real date', () => ({ ...syn('glass-harbour'), verifiedOn: '2026-02-30' }), 'BAD_DATE'],
    ['someone else verifies', () => ({ ...syn('glass-harbour'), verifiedBy: 'Agent-A' }), 'SELF_VERIFIED'],
    ['open and requires at once', () => ({ ...syn('copper-orchard'), requires: ['orchard-dusk'] }), 'SYNOPSIS_OPEN_AND_REQUIRES'],
    ['neither open nor gated', () => ({ ...syn('orchard-dusk'), requires: [] }), 'SYNOPSIS_NOT_GATED'],
    ['a required work of another series', () => ({ ...syn('orchard-dusk'), requires: ['ash-road'] }), 'SYNOPSIS_OUTSIDE_SERIES'],
    [
      'a work with no series that is not open',
      () => ({ ...without(syn('glass-harbour'), 'open'), requires: ['ash-road'] }),
      'SYNOPSIS_NO_SERIES_NOT_OPEN',
    ],
    [
      'open on a later work of its series',
      () => ({ ...without(syn('orchard-dusk'), 'requires'), open: true }),
      'SYNOPSIS_OPEN_LATER',
    ],
  ]
  test.each(cases)('%s', (_name, make, code) => {
    expect(synopsisProblems(make(), books)).toEqual([code])
  })

  test('never throws, whatever the entry', () => {
    for (const entry of [null, 42, 'x', [], {}]) expect(() => synopsisProblems(entry, books)).not.toThrow()
    expect(synopsisProblems(null, books)).toEqual(['NOT_AN_OBJECT'])
    expect(synopsisProblems({}, books).length).toBeGreaterThan(0)
  })
})

describe('note soundness', () => {
  test('every clean fixture note has no problems', () => {
    for (const n of fixtureNotes()) expect(noteProblems(n, known)).toEqual([])
  })

  test('a note id is n- and four digits', () => {
    expect(isNoteId('n-0042')).toBe(true)
    for (const bad of ['n-42', 'c-0042', 'n-00420', 42, null]) expect(isNoteId(bad)).toBe(false)
  })

  const cases: [string, () => unknown, ProblemCode][] = [
    ['a well-formed id', () => ({ ...note('n-0002'), id: 'n-2' }), 'BAD_ID'],
    ['a kind from the list', () => ({ ...note('n-0002'), kind: 'rumour' }), 'BAD_ENUM'],
    ['at least one work', () => ({ ...note('n-0002'), books: [] }), 'NOTE_NO_BOOKS'],
    ['its works must exist', () => ({ ...note('n-0002'), books: ['nowhere'], requires: ['nowhere'] }), 'REF_UNKNOWN'],
    ['requires holds every work it hangs on', () => ({ ...note('n-0002'), requires: ['ash-road'] }), 'NOTE_REQUIRES_MISSING_BOOK'],
    ['both languages', () => ({ ...note('n-0002'), text: { en: '', es: 'x' } }), 'MISSING_LANGUAGE'],
    [
      'a Word of Brandon carries its quote',
      () => without(note('n-0001'), 'quote'),
      'NOTE_QUOTE_MISSING',
    ],
    ['a Word of Brandon needs a primary source', () => ({ ...note('n-0001'), sources: [{ url: 'https://wiki-one.example.test/p', kind: 'wiki', cites: 'ch. 2' }] }), 'NOTE_WEAK_SOURCE'],
    ['a confirmed theory needs a primary source', () => ({ ...note('n-0002'), kind: 'confirmed-theory' }), 'NOTE_WEAK_SOURCE'],
    ['at least one source', () => ({ ...note('n-0002'), sources: [] }), 'NO_SOURCE'],
    ['sources are http links', () => ({ ...note('n-0002'), sources: [{ url: 'javascript:alert(1)', kind: 'wiki' }] }), 'BAD_SOURCE_URL'],
    ['an author', () => ({ ...note('n-0002'), author: ' ' }), 'NO_AUTHOR'],
    ['a verifier', () => ({ ...note('n-0002'), verifiedOn: '' }), 'UNVERIFIED'],
    ['a real date', () => ({ ...note('n-0002'), verifiedOn: '12/11/2026' }), 'BAD_DATE'],
    ['someone else verifies', () => ({ ...note('n-0002'), verifiedBy: 'agent-a' }), 'SELF_VERIFIED'],
  ]
  test.each(cases)('%s', (_name, make, code) => {
    expect(noteProblems(make(), known)).toEqual([code])
  })

  test('never throws, whatever the entry', () => {
    for (const entry of [null, 42, 'x', [], {}]) expect(() => noteProblems(entry, known)).not.toThrow()
    expect(noteProblems('x', known)).toEqual(['NOT_AN_OBJECT'])
    expect(noteProblems({}, known).length).toBeGreaterThan(0)
  })
})
