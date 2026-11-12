import type { Book, Catalog, Connection, Note, Synopsis } from './types'
import { isObject } from './soundness'

const base = (): string => {
  const b = import.meta.env.BASE_URL || '/'
  return b.endsWith('/') ? b : `${b}/`
}

/** A request that hangs would leave the page on its waiting state for good: after this it fails like any other. */
export const FETCH_TIMEOUT_MS = 15_000

async function fetchJson(fetchFn: typeof fetch, name: string): Promise<unknown> {
  try {
    const res = await fetchFn(`${base()}data/${name}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) return undefined
    return (await res.json()) as unknown
  } catch {
    return undefined
  }
}

const defaultFetch: typeof fetch = (...args) => fetch(...args)

async function list<T>(fetchFn: typeof fetch, name: string): Promise<T[] | null> {
  const value = await fetchJson(fetchFn, name)
  return Array.isArray(value) ? (value as T[]) : null
}

/** Null when they fail: the app says so calmly. */
export function loadBooks(fetchFn: typeof fetch = defaultFetch): Promise<Book[] | null> {
  return list<Book>(fetchFn, 'books.json')
}

/**
 * Null when they fail: none are shown, and nothing else is lost. Whatever arrives is kept as it is:
 * `visible` and `isShowable` drop what is malformed.
 */
export function loadConnections(fetchFn: typeof fetch = defaultFetch): Promise<Connection[] | null> {
  return list<Connection>(fetchFn, 'connections.json')
}

/** Null when they fail, like connections: the plate then says there is no synopsis yet. The gate drops the malformed. */
export function loadSynopses(fetchFn: typeof fetch = defaultFetch): Promise<Synopsis[] | null> {
  return list<Synopsis>(fetchFn, 'synopses.json')
}

/** Null when they fail: no note shows, and nothing else is lost. */
export function loadNotes(fetchFn: typeof fetch = defaultFetch): Promise<Note[] | null> {
  return list<Note>(fetchFn, 'notes.json')
}

export async function loadMeta(fetchFn: typeof fetch = defaultFetch): Promise<Catalog['meta']> {
  const value = await fetchJson(fetchFn, 'meta.json')
  return { updatedOn: isObject(value) && typeof value.updatedOn === 'string' ? value.updatedOn : '' }
}
