import { isObject } from '../data/soundness'
import { sanitizeState, type ReadState } from './merge'

/** The most a read state may be, in a file, on the wire or stored: what is stored must always fit back in a request. */
export const MAX_STATE_BYTES = 256 * 1024

export function exportState(s: ReadState): string {
  return JSON.stringify({ version: 1, marks: s.marks, unlocks: s.unlocks })
}

/** The `{ marks, unlocks }` that sync sends and stores, by the same rules as an import. */
export function parseState(text: string): ReadState | null {
  try {
    return sanitizeState(JSON.parse(text))
  } catch {
    return null
  }
}

export function parseImport(text: string): { ok: true; state: ReadState } | { ok: false; reason: 'format' } {
  if (text.length > MAX_STATE_BYTES) return { ok: false, reason: 'format' }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'format' }
  }
  const state = isObject(parsed) && parsed.version === 1 ? sanitizeState(parsed) : null
  if (!state) return { ok: false, reason: 'format' }
  return { ok: true, state }
}
