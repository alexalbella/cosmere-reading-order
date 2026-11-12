import type { Book, BookId } from '../data/types'
import type { Marks, MarkStatus } from '../spoilers/visible'
import { build, ownEntries, safeKey, type ReadState } from '../state/merge'

function copyMarks(marks: Marks): Marks {
  return build(ownEntries(marks))
}

/** A change must beat what it replaces, whatever this device's clock says: on a slow one it would lose the merge and undo itself. */
function dateOfChange<T extends { at: number }>(table: Record<BookId, T>, id: BookId, now: number): number {
  return Object.hasOwn(table, id) ? Math.max(now, table[id]!.at + 1) : now
}

function withMarks(s: ReadState, marks: Marks): ReadState {
  return { marks, unlocks: s.unlocks }
}

/** `previous` holds every id asked for: a book never marked comes back as `none`. */
export function applyMark(
  s: ReadState,
  ids: BookId[],
  status: MarkStatus,
  now: number,
): { state: ReadState; previous: Marks } {
  const marks = copyMarks(s.marks)
  const previous: Marks = {}
  for (const id of ids) {
    if (!safeKey(id)) continue
    previous[id] = Object.hasOwn(s.marks, id) ? { ...s.marks[id]! } : { status: 'none', at: 0 }
    marks[id] = { status, at: dateOfChange(s.marks, id, now) }
  }
  return { state: withMarks(s, marks), previous }
}

/** Undo is a new change, so that it wins the merge on other devices too. */
export function restoreMarks(s: ReadState, previous: Marks, now: number): ReadState {
  const marks = copyMarks(s.marks)
  for (const [id, mark] of Object.entries(previous)) {
    if (safeKey(id)) marks[id] = { status: mark.status, at: dateOfChange(s.marks, id, now) }
  }
  return withMarks(s, marks)
}

export function setUnlock(s: ReadState, id: BookId, on: boolean, now: number): ReadState {
  const unlocks = build(ownEntries(s.unlocks))
  if (safeKey(id)) unlocks[id] = { on, at: dateOfChange(s.unlocks, id, now) }
  return { marks: s.marks, unlocks }
}

export function worksCarriedBy(book: Book, books: Book[]): Book[] {
  return books.filter((other) => other.containedIn?.includes(book.id))
}

