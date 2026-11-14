import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Book, Connection } from '../src/data/types'
import { isObject } from '../src/data/soundness'
import { ROOT } from './lib/load-data'

// Turns upstream's data.json into our connection batch. It never prints text or book ids,
// only counts, so running it reveals nothing about what connects to what.

export interface UpstreamData {
  books?: unknown
  appearances?: unknown
  connections?: unknown
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  hellip: '…',
}

/** One pass over named, decimal and hex references. Unknown or out-of-range ones stay as written. */
function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] !== '#') return ENTITIES[ref.toLowerCase()] ?? whole
    const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)
    return code >= 1 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : whole
  })
}

function plain(html: unknown): string {
  if (typeof html !== 'string') return ''
  return decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function hrefs(html: unknown): { url: string; kind: 'upstream' }[] {
  if (typeof html !== 'string') return []
  const urls = new Set<string>()
  for (const m of html.matchAll(/href\s*=\s*(["'])(.*?)\1/gis)) {
    const url = decode(m[2] ?? '').trim()
    if (/^https?:\/\//i.test(url)) urls.add(url)
  }
  return [...urls].map((url) => ({ url, kind: 'upstream' as const }))
}

function leaves(nodes: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (!Array.isArray(nodes)) return out
  for (const node of nodes) {
    if (!isObject(node)) continue
    if (Array.isArray(node.children)) leaves(node.children, out)
    else if (typeof node.id === 'string') out.push(node)
  }
  return out
}

function appearanceList(upstream: UpstreamData): Map<string, string> {
  const list = new Map<string, string>()
  if (!Array.isArray(upstream.appearances)) return list
  for (const entry of upstream.appearances) {
    if (isObject(entry) && typeof entry.id === 'string') {
      list.set(entry.id, typeof entry.description === 'string' ? entry.description : '')
    }
  }
  return list
}

/** Upstream ids to ours: the aliases of the catalogue, then an optional explicit map, which wins. */
export function buildIdMap(
  books: readonly Pick<Book, 'id' | 'aliases'>[],
  extra: Record<string, string> = {},
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const book of books) for (const alias of book.aliases ?? []) map[alias] = book.id
  return { ...map, ...extra }
}

export function migrate(upstream: UpstreamData, startId: number, idMap: Record<string, string> = {}): Connection[] {
  const own = (id: string) => (Object.hasOwn(idMap, id) ? (idMap[id] as string) : id)
  const typeList = appearanceList(upstream)
  const out: Connection[] = []
  const next = () => `c-${String(startId + out.length).padStart(4, '0')}`
  const base = { tier: 'confirmed' as const, author: 'upstream', verifiedBy: '', verifiedOn: '' }

  for (const book of leaves(upstream.books)) {
    const from = own(book.id as string)

    const connections = [book.connections, book['connections:']].flatMap((v) => (Array.isArray(v) ? v : []))
    for (const c of connections) {
      if (!isObject(c) || typeof c.target !== 'string') continue
      const to = own(c.target)
      out.push({
        ...base,
        id: next(),
        from,
        to,
        type: c.type as Connection['type'],
        description: { en: plain(c.description), es: '' },
        requires: [from, to],
        sources: hrefs(c.description),
      })
    }

    if (!Array.isArray(book.appearances)) continue
    for (const a of book.appearances) {
      const id = typeof a === 'string' ? a : isObject(a) && typeof a.id === 'string' ? a.id : ''
      const mine = isObject(a) && typeof a.description === 'string' ? a.description : ''
      const html = mine !== '' ? mine : (typeList.get(id) ?? '')
      out.push({
        ...base,
        id: next(),
        from,
        to: null,
        type: 'appearance',
        description: { en: plain(html), es: '' },
        requires: [from],
        sources: hrefs(html),
      })
    }
  }
  return out
}

export interface Counts {
  connections: number
  appearances: number
  withoutSource: number
}

export function count(batch: readonly Connection[]): Counts {
  const appearances = batch.filter((c) => c.type === 'appearance').length
  return {
    connections: batch.length - appearances,
    appearances,
    withoutSource: batch.filter((c) => c.sources.length === 0).length,
  }
}

export interface Options {
  dryRun: boolean
  force?: boolean
  readUpstream: () => string
  booksFile: string
  /** Extra renames, old id to new id. Optional. */
  idMapFile?: string
  outFile: string
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'))
}

/** Reads, migrates, writes unless dry-run. Returns counts only. */
export function run(options: Options): Counts {
  const upstream = JSON.parse(options.readUpstream()) as UpstreamData
  const books = readJson(options.booksFile) as Book[]
  const extra =
    options.idMapFile !== undefined && existsSync(options.idMapFile)
      ? (readJson(options.idMapFile) as Record<string, string>)
      : {}
  const batch = migrate(upstream, 1, buildIdMap(books, extra))
  if (!options.dryRun) {
    // This file is edited by hand next: a rerun must never replace that work silently.
    if (existsSync(options.outFile) && !options.force) throw new Error('EXISTS')
    mkdirSync(dirname(options.outFile), { recursive: true })
    writeFileSync(options.outFile, JSON.stringify(batch, null, 2) + '\n')
  }
  return count(batch)
}

/** `--dry-run`, `--force` and `--id-map <file>`. A missing file, or a flag in its place, throws BAD_ARG. */
export function parseArgs(argv: string[]): { dryRun: boolean; force: boolean; idMapFile?: string } {
  const parsed: { dryRun: boolean; force: boolean; idMapFile?: string } = {
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
  }
  if (argv.includes('--id-map')) {
    const file = argv[argv.indexOf('--id-map') + 1]
    if (file === undefined || file.startsWith('--')) throw new Error('BAD_ARG')
    parsed.idMapFile = file
  }
  return parsed
}

function main(): number {
  try {
    const args = parseArgs(process.argv.slice(2))
    const counts = run({
      dryRun: args.dryRun,
      force: args.force,
      readUpstream: () =>
        execFileSync('git', ['show', 'upstream/master:public/data.json'], {
          cwd: ROOT,
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'ignore'],
        }),
      booksFile: join(ROOT, 'data', 'books.json'),
      idMapFile: args.idMapFile,
      outFile: join(ROOT, 'data', 'connections', 'batch-000.json'),
    })
    console.log(`${counts.connections} connections`)
    console.log(`${counts.appearances} appearances`)
    console.log(`${counts.withoutSource} without source`)
    return 0
  } catch {
    console.error('MIGRATION_FAILED')
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main())
