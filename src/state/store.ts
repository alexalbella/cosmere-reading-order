import { isObject } from '../data/soundness'
import { emptyState, sanitizeTables, type ReadState } from './merge'

export const STATE_KEY = 'cosmere.state.v1'
const CORRUPT_KEY = 'cosmere.state.corrupt'

/** Where state lives when storage is blocked: this tab only, but nothing throws. */
let memory: string | null = null

/** Where state lives by default; undefined when the browser blocks storage. */
export function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

function read(storage: Storage | undefined): string | null {
  try {
    if (storage) return storage.getItem(STATE_KEY)
  } catch {
    // falls through to memory
  }
  return memory
}

export function loadState(storage: Storage | undefined = defaultStorage()): { state: ReadState; corrupt: boolean } {
  const raw = read(storage)
  if (raw === null) return { state: emptyState(), corrupt: false }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = undefined
  }
  // A table that is missing or not an object is as unreadable as a state that is not one.
  if (!isObject(parsed) || !isObject(parsed.marks) || !isObject(parsed.unlocks)) {
    try {
      storage?.setItem(CORRUPT_KEY, raw)
    } catch {
      // the raw copy is a courtesy
    }
    return { state: emptyState(), corrupt: true }
  }
  return { state: sanitizeTables(parsed.marks, parsed.unlocks), corrupt: false }
}

export function saveState(s: ReadState, storage: Storage | undefined = defaultStorage()): void {
  const text = JSON.stringify({ marks: s.marks, unlocks: s.unlocks })
  memory = text
  try {
    storage?.setItem(STATE_KEY, text)
  } catch {
    // memory already holds it
  }
}
