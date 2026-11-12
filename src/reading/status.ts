import { isObject } from '../data/soundness'
import type { BookId, MarkStatus } from '../data/types'
import type { Marks } from '../spoilers/visible'

/** A field of stored state, only if the object holds it itself: a prototype is not state. */
function own(table: unknown, key: string): unknown {
  return isObject(table) && Object.hasOwn(table, key) ? table[key] : undefined
}

/** A book's mark, `none` when it has none. */
export function statusOf(marks: Marks, id: BookId): MarkStatus {
  return Object.hasOwn(marks, id) ? marks[id]!.status : 'none'
}

/** Read, or unlocked by hand: what a requirement asks for. Reads untrusted state, so it checks every step. */
export function countsAsRead(id: unknown, marks: unknown, unlocks: unknown): boolean {
  if (typeof id !== 'string') return false
  return own(own(marks, id), 'status') === 'read' || own(own(unlocks, id), 'on') === true
}
