import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Book, Connection } from '../src/data/types'
import { isObject, knownBookIds } from '../src/data/soundness'
import { connectionLabel, pruneInvalid, validateCatalog } from '../src/data/validate'
import { loadData, readJson, ROOT } from './lib/load-data'
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

function citesAlias(c: Connection, aliases: ReadonlySet<unknown>): boolean {
  return isObject(c) && [c.from, c.to, ...(Array.isArray(c.requires) ? c.requires : [])].some((ref) => aliases.has(ref))
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

  const { catalog, batches } = loadData()
  let problems = validateCatalog(catalog, previous)

  if (prune && problems.length > 0) {
    const bookIds = knownBookIds(catalog.books)
    // A connection that cites an id now held as an alias is a rename the batches have not followed: pruning it
    // would quietly drop that book's connections. It stays a problem, and the run fails.
    const aliases = new Set(catalog.books.filter(isObject).flatMap((b) => (Array.isArray(b.aliases) ? b.aliases : [])))
    const renamed = new Set(
      problems
        .filter((p) => p.code === 'REF_UNKNOWN')
        .filter((p) => catalog.connections.some((c, i) => connectionLabel(c, i) === p.id && citesAlias(c, aliases)))
        .map((p) => p.id),
    )
    const { kept, dropped } = pruneInvalid(
      catalog.connections,
      problems.filter((p) => !bookIds.has(p.id) && !renamed.has(p.id)),
    )
    // Decided before anything is written: a run that will fail leaves the tree as it found it.
    problems = validateCatalog({ ...catalog, connections: kept }, previous)
    if (problems.length === 0 && dropped.length > 0) {
      const keptSet = new Set(kept)
      const quarantined = catalog.connections.filter((c) => !keptSet.has(c))
      // Quarantine first: if it fails, nothing has left its batch yet.
      const dir = join(ROOT, quarantine)
      mkdirSync(dir, { recursive: true })
      const file = join(dir, `${new Date().toISOString().slice(0, 10)}.json`)
      const before = existsSync(file) ? readJson<Connection[]>(file) : []
      writeFileSync(file, JSON.stringify([...before, ...quarantined], null, 2) + '\n')
      for (const batch of batches) {
        const keep = batch.connections.filter((c) => keptSet.has(c))
        if (keep.length !== batch.connections.length) {
          writeFileSync(batch.file, JSON.stringify(keep, null, 2) + '\n')
        }
      }
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
