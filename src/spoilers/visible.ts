import { connectionProblems, isObject, knownBookIds, repeatedIds } from '../data/soundness'
import { countsAsRead } from '../reading/status'
import type { BookId, Catalog, Connection, MarkStatus } from '../data/types'

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
