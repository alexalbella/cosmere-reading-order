import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Book, Connection } from '../src/data/types'
import { isObject, knownBookIds } from '../src/data/soundness'
import { connectionLabel, noteLabel, pruneBy, synopsisLabel, validateCatalog } from '../src/data/validate'
import { loadData, readJson, ROOT, type FileOf } from './lib/load-data'
import { reportProblems, runMain } from './lib/run'

class BadRef extends Error {}
class BadArg extends Error {}

/** The value after a flag. Missing, or another flag in its place, fails closed. */
function flagValue(args: string[], flag: string): string | undefined {
  if (!args.includes(flag)) return undefined
  const value = args[args.indexOf(flag) + 1]
  if (value === undefined || value.startsWith('--')) throw new BadArg('BAD_ARG')
  return value
}

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
}

/**
 * Books of the catalogue at a git ref. A valid ref without data/books.json means no previous
 * catalogue. A missing ref or unreadable JSON throws: the check must never be skipped silently.
 */
function previousBooks(ref: string): { books: Book[] } | undefined {
  try {
    git(['rev-parse', '--verify', `${ref}^{commit}`])
  } catch {
    throw new BadRef('BAD_REF')
  }
  let out: string
  try {
    out = git(['show', `${ref}:data/books.json`])
  } catch {
    return undefined
  }
  let books: unknown
  try {
    books = JSON.parse(out)
  } catch {
    throw new BadRef('BAD_REF_JSON')
  }
  if (!Array.isArray(books)) throw new BadRef('BAD_REF_JSON')
  return { books: books as Book[] }
}

/** Whether an entry of any kind names an id now held as an alias: its ends, its work or works, its requirements. */
function citesAlias(entry: unknown, aliases: ReadonlySet<unknown>): boolean {
  if (!isObject(entry)) return false
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
  return [entry.from, entry.to, entry.book, ...list(entry.books), ...list(entry.requires)].some((ref) => ref !== undefined && aliases.has(ref))
}

/** The entries a prune takes out, appended to what the quarantine file already holds. Reading it may throw. */
function quarantined<T>(file: string, all: readonly T[], kept: readonly T[]): { file: string; entries: T[] } | null {
  const keptSet = new Set(kept)
  const out = all.filter((e) => !keptSet.has(e))
  if (out.length === 0) return null
  const before = existsSync(file) ? readJson<T[]>(file) : []
  return { file, entries: [...before, ...out] }
}

/** Writes back each file that lost an entry. */
function rewrite<T>(files: readonly FileOf<T>[], kept: readonly T[]): void {
  const keptSet = new Set(kept)
  for (const f of files) {
    const keep = f.entries.filter((e) => keptSet.has(e))
    if (keep.length !== f.entries.length) writeFileSync(f.file, JSON.stringify(keep, null, 2) + '\n')
  }
}

function main(): number {
  const args = process.argv.slice(2)
  const prune = args.includes('--prune')
  // Where pruned connections are kept, relative to the repository. The default is a folder git ignores.
  const quarantine = flagValue(args, '--quarantine') ?? '.quarantine'
  let against: string | undefined
  if (args.includes('--against')) {
    against = args[args.indexOf('--against') + 1]
    if (against === undefined || against.startsWith('--')) throw new BadRef('BAD_REF')
  }
  const previous = against ? previousBooks(against) : undefined

  const { catalog, batches, synopsisBatches, noteBatches } = loadData()
  let problems = validateCatalog(catalog, previous)

  if (prune && problems.length > 0) {
    const bookIds = knownBookIds(catalog.books)
    // A connection that cites an id now held as an alias is a rename the batches have not followed: pruning it
    // would quietly drop that book's connections. It stays a problem, and the run fails.
    const aliases = new Set(catalog.books.filter(isObject).flatMap((b) => (Array.isArray(b.aliases) ? b.aliases : [])))
    const cited = (id: string): boolean =>
      catalog.connections.some((c, i) => connectionLabel(c, i) === id && citesAlias(c, aliases)) ||
      catalog.synopses.some((s, i) => synopsisLabel(s, i, bookIds) === id && citesAlias(s, aliases)) ||
      catalog.notes.some((n, i) => noteLabel(n, i) === id && citesAlias(n, aliases))
    const renamed = new Set(problems.filter((p) => p.code === 'REF_UNKNOWN' && cited(p.id)).map((p) => p.id))
    const prunable = problems.filter((p) => !bookIds.has(p.id) && !renamed.has(p.id))
    const conns = pruneBy(catalog.connections, prunable, connectionLabel)
    const syns = pruneBy(catalog.synopses, prunable, (s, i) => synopsisLabel(s, i, bookIds))
    const notes = pruneBy(catalog.notes, prunable, noteLabel)
    const dropped = [...conns.dropped, ...syns.dropped, ...notes.dropped]
    // Decided before anything is written: a run that will fail leaves the tree as it found it.
    problems = validateCatalog({ ...catalog, connections: conns.kept, synopses: syns.kept, notes: notes.kept }, previous)
    if (problems.length === 0 && dropped.length > 0) {
      const dir = join(ROOT, quarantine)
      const date = new Date().toISOString().slice(0, 10)
      // Every quarantine file is read before any is written, and all are written before a batch changes:
      // if one fails, nothing has left its batch yet.
      const held = [
        quarantined(join(dir, `${date}.json`), catalog.connections, conns.kept),
        quarantined(join(dir, `synopses-${date}.json`), catalog.synopses, syns.kept),
        quarantined(join(dir, `notes-${date}.json`), catalog.notes, notes.kept),
      ]
      mkdirSync(dir, { recursive: true })
      for (const h of held) if (h) writeFileSync(h.file, JSON.stringify(h.entries, null, 2) + '\n')
      rewrite<Connection>(
        batches.map((b) => ({ file: b.file, entries: b.connections })),
        conns.kept,
      )
      rewrite(synopsisBatches, syns.kept)
      rewrite(noteBatches, notes.kept)
    }
    if (problems.length === 0) {
      console.log(`pruned ${dropped.length}`)
      for (const id of dropped) console.log(id)
    }
  }

  if (problems.length > 0) {
    reportProblems(problems)
    return 1
  }
  console.log(`ok ${catalog.books.length} books`)
  return 0
}

runMain(main)
