import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { WORLD_KEYS, type Book, type WorldKey } from '../src/data/types'
import { readJson, ROOT } from './lib/load-data'
import { copyPlateFacts, type PlateFacts } from './lib/plate-facts'
import { runMain } from './lib/run'

// Folds the public structure (`data/structure.json`) and the researched public facts
// (`data/public-facts.json`) into `data/books.json`: each work's world, series, part, number, first
// publication, word count, Spanish publisher, its seat on the map, and the plate facts of works not yet
// published, apocryphal works and role-playing books. It never touches a work's status,
// its reading order, or a page count the catalogue already has, and it prints counts only.

interface Names {
  en: string
  es: string
}
interface TreeNode {
  children: (TreeNode | string)[]
}
interface Structure {
  worlds: { id: string; legacyKey?: string | null }[]
  series: { id: string; name: Names }[]
  tree: TreeNode[]
  bookPadding?: Record<string, number>
}
interface Facts extends PlateFacts {
  world: string | null
  series: string | null
  subseries: string | null
  seriesIndex: number | null
  publication: string | null
  year: number | null
  pages: number | null
  words: number | null
  phase: number | null
  es?: { publisher?: string | null; year?: number | null } | null
  readFree: string | null
}

/** Ours for a world of the structure file: its old key where it had one, a short one for a placeholder. */
const WORLD_ALIAS: Record<string, WorldKey> = { 'first-of-the-sun': 'sol', 'aether-homeworld': 'aether' }
/** Free reading is linked only where the author or his publisher hosts the text itself. */
const FREE_HOSTS = ['www.brandonsanderson.com', 'reactormag.com']

function leaves(nodes: (TreeNode | string)[], out: string[] = []): string[] {
  for (const node of nodes) {
    if (typeof node === 'string') out.push(node)
    else leaves(node.children, out)
  }
  return out
}

function worldKey(id: string | null): WorldKey {
  if (id === null) return 'otros'
  const key = WORLD_ALIAS[id] ?? id
  return (WORLD_KEYS as readonly string[]).includes(key) ? (key as WorldKey) : 'otros'
}

function freeLink(url: string | null): string | undefined {
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && FREE_HOSTS.includes(parsed.hostname) ? parsed.href : undefined
  } catch {
    return undefined
  }
}

/** Sets a field, or removes it when there is nothing to say. */
function put<K extends keyof Book>(book: Book, key: K, value: Book[K] | undefined | null): void {
  if (value === undefined || value === null) delete book[key]
  else book[key] = value
}

function main(): number {
  const file = join(ROOT, 'data', 'books.json')
  const books = readJson<Book[]>(file)
  const structure = readJson<Structure>(join(ROOT, 'data', 'structure.json'))
  const facts = readJson<Record<string, Facts>>(join(ROOT, 'data', 'public-facts.json'))
  const seriesName = new Map(structure.series.map((s) => [s.id, s.name.en]))
  const seat = new Map(leaves(structure.tree).map((id, i) => [id, i + 1]))

  let touched = 0
  let unknown = 0
  for (const book of books) {
    const f = facts[book.id]
    if (!f) {
      unknown += 1
      continue
    }
    const before = JSON.stringify(book)
    book.world = worldKey(f.world)
    if (f.series && seriesName.has(f.series)) book.series = seriesName.get(f.series)!
    put(book, 'subseries', f.subseries ? seriesName.get(f.subseries) : undefined)
    put(book, 'seriesIndex', f.seriesIndex)
    put(book, 'place', seat.get(book.id))
    put(book, 'aside', structure.bookPadding?.[book.id] ? true : undefined)
    put(book, 'readFree', freeLink(f.readFree))
    copyPlateFacts(book, f)
    if (book.status === 'published') {
      put(book, 'publication', f.publication)
      put(book, 'words', f.words)
      if (book.pages === undefined && f.pages) book.pages = f.pages
      if (book.year === undefined && f.year) book.year = f.year
      if (book.phase === null && f.phase) book.phase = f.phase
    }
    if (book.esEdition.status === 'published') {
      if (f.es?.publisher) book.esEdition.publisher = f.es.publisher
      if (f.es?.year) book.esEdition.year = f.es.year
    }
    if (JSON.stringify(book) !== before) touched += 1
  }
  writeFileSync(file, JSON.stringify(books, null, 2) + '\n')
  // Read back, so a file that no longer parses fails here and not in the build.
  JSON.parse(readFileSync(file, 'utf8'))
  console.log(`structure applied: ${books.length} books, ${touched} changed, ${unknown} without facts`)
  return 0
}

runMain(main)
