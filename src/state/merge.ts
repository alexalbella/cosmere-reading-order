import { MARK_STATUSES } from '../data/types'
import type { BookId } from '../data/types'
import { isObject } from '../data/soundness'
import type { Mark, Marks, MarkStatus, Unlocks } from '../spoilers/visible'

export interface ReadState {
  marks: Marks
  unlocks: Unlocks
}

type Unlock = Unlocks[BookId]

const FIVE_MINUTES = 5 * 60 * 1000
/**
 * What a stored id can look like: a book's, or an old one of a book's, which `rekeyState` will move. The
 * catalogue's aliases carry a dot, which its current ids may not, so this is not the catalogue's pattern.
 */
export const STORED_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/
const RANK: Record<MarkStatus, number> = { read: 3, reading: 2, skipped: 1, none: 0 }
const STATUSES: ReadonlySet<unknown> = new Set(MARK_STATUSES)

/** Stored ids come from JSON: `__proto__` is a key like any other there, and never a safe one. */
export function safeKey(key: string): boolean {
  return key !== '__proto__'
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function ownEntries<T>(table: Record<string, T>): [string, T][] {
  return Object.keys(table)
    .filter(safeKey)
    .map((key) => [key, table[key] as T])
}

export function build<T>(entries: Iterable<[string, T]>): Record<string, T> {
  const out: Record<string, T> = Object.create(null) as Record<string, T>
  for (const [key, value] of entries) if (safeKey(key)) out[key] = value
  return out
}

export function emptyState(): ReadState {
  return { marks: build([]), unlocks: build([]) }
}

/** Keeps the entries of unknown data that are well formed, under an id that can be a book's or an alias, and drops the rest. */
export function sanitizeTables(marks: Record<string, unknown>, unlocks: Record<string, unknown>): ReadState {
  const cleanMarks = ownEntries(marks).flatMap(([id, m]): [string, Mark][] =>
    STORED_ID.test(id) && isObject(m) && STATUSES.has(m.status) && isTime(m.at) ? [[id, { status: m.status as MarkStatus, at: m.at }]] : [],
  )
  const cleanUnlocks = ownEntries(unlocks).flatMap(([id, u]): [string, Unlock][] =>
    STORED_ID.test(id) && isObject(u) && typeof u.on === 'boolean' && isTime(u.at) ? [[id, { on: u.on, at: u.at }]] : [],
  )
  return { marks: build(cleanMarks), unlocks: build(cleanUnlocks) }
}

/** A state from outside this device: null when its tables are not both there, and bad entries dropped. */
export function sanitizeState(value: unknown): ReadState | null {
  return isObject(value) && isObject(value.marks) && isObject(value.unlocks)
    ? sanitizeTables(value.marks, value.unlocks)
    : null
}

/** On a tie the lower rank wins, so a mark that reveals more never beats one that reveals less: fail closed. */
function newerMark(a: Mark, b: Mark): Mark {
  if (a.at !== b.at) return a.at > b.at ? a : b
  return RANK[a.status] <= RANK[b.status] ? a : b
}

/** On a tie the unlock is off: fail closed. */
function newerUnlock(a: Unlock, b: Unlock): Unlock {
  if (a.at !== b.at) return a.at > b.at ? a : b
  return a.on ? b : a
}

function mergeTables<T extends object>(a: Record<string, T>, b: Record<string, T>, pick: (x: T, y: T) => T): Record<string, T> {
  // Each entry is cloned once, as it goes in: nothing in the result is shared with an input.
  const out = build(ownEntries(a).map(([key, value]): [string, T] => [key, { ...value }]))
  for (const [key, value] of ownEntries(b)) {
    const mine = out[key]
    const picked = mine === undefined ? value : pick(mine, value)
    out[key] = picked === mine ? picked : { ...picked }
  }
  return out
}

function sortedEntries<T>(table: Record<string, T>): [string, T][] {
  return Object.entries(table).sort(([x], [y]) => (x < y ? -1 : 1))
}

/** The same entries under the same ids, in whatever order they were added. */
export function sameState(a: ReadState, b: ReadState): boolean {
  const text = (s: ReadState) => JSON.stringify([sortedEntries(s.marks), sortedEntries(s.unlocks)])
  return text(a) === text(b)
}

/** Per book, the later change wins: the result does not depend on the order of the arguments. */
export function mergeState(a: ReadState, b: ReadState): ReadState {
  return {
    marks: mergeTables(a.marks, b.marks, newerMark),
    unlocks: mergeTables(a.unlocks, b.unlocks, newerUnlock),
  }
}

/** A clock that ran ahead would win every later merge: nothing may be dated beyond now + 5 minutes. */
export function clampFuture(s: ReadState, now: number): ReadState {
  const fix = (at: number) => (at > now + FIVE_MINUTES ? now : at)
  return {
    marks: build(ownEntries(s.marks).map(([id, m]): [string, Mark] => [id, { ...m, at: fix(m.at) }])),
    unlocks: build(ownEntries(s.unlocks).map(([id, u]): [string, Unlock] => [id, { ...u, at: fix(u.at) }])),
  }
}

/**
 * `clampFuture` for what a device holds, given the copy a server has just answered with. A date too far
 * ahead comes down to that server's clock. What the copy already holds takes the copy's date, which leaves
 * nothing to send. A change the copy has not seen lands above the copy's date, or it would lose the merge:
 * the clock here may be rounded down to the second.
 */
export function clampAgainst(s: ReadState, now: number, copy: ReadState): ReadState {
  const fix = <T extends { at: number }>(entry: T, known: T | undefined, same: (a: T, b: T) => boolean): T => {
    if (entry.at <= now + FIVE_MINUTES) return entry
    if (!known) return { ...entry, at: now }
    return { ...entry, at: same(entry, known) ? known.at : Math.max(now, known.at + 1) }
  }
  const held = <T>(table: Record<string, T>, id: string): T | undefined => (Object.hasOwn(table, id) ? table[id] : undefined)
  return {
    marks: build(ownEntries(s.marks).map(([id, m]): [string, Mark] => [id, fix(m, held(copy.marks, id), (a, b) => a.status === b.status)])),
    unlocks: build(ownEntries(s.unlocks).map(([id, u]): [string, Unlock] => [id, fix(u, held(copy.unlocks, id), (a, b) => a.on === b.on)])),
  }
}
