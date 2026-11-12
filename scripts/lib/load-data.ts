import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Book, Catalog, Connection, Note, Synopsis } from '../../src/data/types'

export const ROOT = process.cwd()

export interface Batch {
  file: string
  connections: Connection[]
}

/** One file of synopses or notes, kept so a prune can write back only what changed. */
export interface FileOf<T> {
  file: string
  entries: T[]
}

export interface Loaded {
  catalog: Catalog
  batches: Batch[]
  synopsisBatches: FileOf<Synopsis>[]
  noteBatches: FileOf<Note>[]
}

/** Reads the data folder. Throws an Error whose message is the file name only, never file content. */
export function readJson<T>(file: string): T {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    throw new Error(`INVALID_JSON ${file.replace(ROOT, '.').replaceAll('\\', '/')}`)
  }
}

export function loadData(root = ROOT): Loaded {
  const books = readJson<Book[]>(join(root, 'data', 'books.json'))
  const meta = readJson<Catalog['meta']>(join(root, 'data', 'meta.json'))
  const dir = join(root, 'data', 'connections')
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : []
  const batches = files.map((f) => ({
    file: join(dir, f),
    connections: readJson<Connection[]>(join(dir, f)),
  }))
  const connections = batches.flatMap((b) => b.connections)
  const synopsisBatches = readFolder<Synopsis>(join(root, 'data', 'synopses'))
  const noteBatches = readFolder<Note>(join(root, 'data', 'notes'))
  const synopses = synopsisBatches.flatMap((b) => b.entries)
  const notes = noteBatches.flatMap((b) => b.entries)
  return { catalog: { books, connections, synopses, notes, meta }, batches, synopsisBatches, noteBatches }
}

/** Every JSON file of a folder, in name order. An absent folder is an empty list; a file that is not a list counts as one entry. */
function readFolder<T>(dir: string): FileOf<T>[] {
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : []
  return files.map((f) => {
    const raw = readJson<unknown>(join(dir, f))
    return { file: join(dir, f), entries: (Array.isArray(raw) ? raw : [raw]) as T[] }
  })
}
