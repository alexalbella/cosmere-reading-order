import type { Book } from '../data/types'
import { emptyState, mergeState, type ReadState } from './merge'

/**
 * Moves marks and unlocks stored under an alias to the book's current id, the later change winning.
 * Two aliases holding marks merge by the later change. Ids the catalogue does not know stay where they are. With nothing to move the same object comes back. An alias that is a current id is not one.
 */
export function rekeyState(state: ReadState, books: Book[]): ReadState {
  const current = new Set(books.map((b) => b.id))
  const target = new Map<string, string>()
  for (const book of books) {
    for (const alias of book.aliases ?? []) {
      if (typeof alias === 'string' && !current.has(alias)) target.set(alias, book.id)
    }
  }
  const stored = [...Object.keys(state.marks), ...Object.keys(state.unlocks)]
  if (!stored.some((id) => target.has(id))) return state

  const kept = emptyState()
  let moved = emptyState()
  for (const [id, mark] of Object.entries(state.marks)) {
    const to = target.get(id)
    if (to === undefined) kept.marks[id] = mark
    else moved = mergeState(moved, { marks: { [to]: mark }, unlocks: {} })
  }
  for (const [id, unlock] of Object.entries(state.unlocks)) {
    const to = target.get(id)
    if (to === undefined) kept.unlocks[id] = unlock
    else moved = mergeState(moved, { marks: {}, unlocks: { [to]: unlock } })
  }
  return mergeState(kept, moved)
}
