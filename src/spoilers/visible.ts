import { bookMap, connectionProblems, isObject, knownBookIds, noteProblems, repeatedIds, synopsisProblems } from '../data/soundness'
import { countsAsRead } from '../reading/status'
import type { BookId, Catalog, Connection, MarkStatus, Note, Synopsis } from '../data/types'

export type { MarkStatus }
export interface Mark {
  status: MarkStatus
  at: number
}
export type Marks = Record<BookId, Mark>
export type Unlocks = Record<BookId, { on: boolean; at: number }>

// The types say what the data should be. At runtime it comes from JSON files and from
// storage, so nothing here trusts them: anything missing or malformed hides, and never throws.

/** Whether a connection is sound enough to ever be shown, whatever has been read. */
export function isShowable(c: Connection, known: ReadonlySet<BookId>): boolean {
  return connectionProblems(c, known).length === 0
}

/** Whether every requirement is read or unlocked. An empty list is never met, though `every` would say so. */
export function isMet(c: Connection, marks: Marks, unlocks: Unlocks): boolean {
  if (!isObject(c) || !Array.isArray(c.requires) || c.requires.length === 0) return false
  return Array.from(c.requires).every((id) => countsAsRead(id, marks, unlocks))
}

/**
 * The only path from data to the screen. An id carried twice hides every entry that carries it:
 * the global count is the only count ever shown, and Vue keys would collide.
 */
export function visible(catalog: Catalog, marks: Marks, unlocks: Unlocks): Connection[] {
  if (!isObject(catalog) || !Array.isArray(catalog.connections)) return []
  const known = knownBookIds(catalog.books)
  const repeated = repeatedIds(catalog.connections)
  return catalog.connections.filter((c) => isShowable(c, known) && !repeated.has(c.id) && isMet(c, marks, unlocks))
}

/** What the plate may say about a work's synopsis. A gated one says only that it waits; a missing one, nothing. */
export type SynopsisView = { state: 'visible'; text: { en: string; es: string } } | { state: 'gated' } | { state: 'missing' }

const MISSING: SynopsisView = { state: 'missing' }

/**
 * A work's synopsis through the same gate as connections. Unsound, absent, or carried by two entries: missing,
 * so a broken record leaves no trace of what it would wait on. Open, or every requirement read: visible.
 */
export function synopsisFor(catalog: Catalog, marks: Marks, unlocks: Unlocks, book: BookId): SynopsisView {
  if (!isObject(catalog) || !Array.isArray(catalog.synopses)) return MISSING
  const mine = catalog.synopses.filter((s) => isObject(s) && s.book === book)
  if (mine.length !== 1) return MISSING
  const s = mine[0] as Synopsis
  if (synopsisProblems(s, bookMap(catalog.books)).length > 0) return MISSING
  const met = s.open === true || (s.requires ?? []).every((id) => countsAsRead(id, marks, unlocks))
  return met ? { state: 'visible', text: { en: s.text.en, es: s.text.es } } : { state: 'gated' }
}

/** The notes whose every requirement is read or unlocked. An id carried twice hides every note that carries it. */
export function visibleNotes(catalog: Catalog, marks: Marks, unlocks: Unlocks): Note[] {
  if (!isObject(catalog) || !Array.isArray(catalog.notes)) return []
  const known = knownBookIds(catalog.books)
  const repeated = repeatedIds(catalog.notes)
  return catalog.notes.filter(
    (n) =>
      noteProblems(n, known).length === 0 &&
      !repeated.has(n.id) &&
      n.requires.length > 0 &&
      Array.from(n.requires).every((id) => countsAsRead(id, marks, unlocks)),
  )
}
