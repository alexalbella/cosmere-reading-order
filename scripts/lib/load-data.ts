import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Book, Catalog, Connection } from '../../src/data/types'

export const ROOT = process.cwd()

export interface Batch {
  file: string
  connections: Connection[]
}

export interface Loaded {
  catalog: Catalog
  batches: Batch[]
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
  return { catalog: { books, connections, meta }, batches }
}
