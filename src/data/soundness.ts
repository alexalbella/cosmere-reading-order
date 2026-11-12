import { CONNECTION_TIERS, CONNECTION_TYPES, NOTE_KINDS, SOURCE_KINDS } from './types'
import type { Book, BookId, ProblemCode } from './types'

// The one definition of a sound connection. `isShowable` is "no problems here", and the validator
// reports the same codes, so passing the validator and being able to appear cannot drift apart.
// Everything here reads untrusted JSON: nothing throws, and problems carry codes, never text.

const BOOK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const CONNECTION_ID = /^c-\d{4}$/
const NOTE_ID = /^n-\d{4}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const INVISIBLE = /[\p{C}\p{Default_Ignorable_Code_Point}]/gu
// `new URL` repairs `https:a`, `https:/a`, `https:///a` and `https:\\a` into a host of its own guess.
const HTTP_START = /^\s*https?:\/\/[^\s/\\]/i

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A string as a person reads it, so invisible characters, width, spacing and case cannot tell two apart. */
function readable(value: unknown): string {
  if (typeof value !== 'string') return ''
  // Normalised again because removing a joiner can leave a base letter and its accent side by side.
  return value.normalize('NFKC').replace(INVISIBLE, '').normalize('NFKC').trim().toLowerCase()
}

/** Not a string, or nothing visible in it. */
export function isBlank(value: unknown): boolean {
  return readable(value) === ''
}

export function isBookId(value: unknown): value is BookId {
  return typeof value === 'string' && BOOK_ID.test(value)
}

export function isConnectionId(value: unknown): value is string {
  return typeof value === 'string' && CONNECTION_ID.test(value)
}

export function isNoteId(value: unknown): value is string {
  return typeof value === 'string' && NOTE_ID.test(value)
}

/** The ids a connection may refer to. Only well-formed books count. */
export function knownBookIds(books: unknown): Set<BookId> {
  const known = new Set<BookId>()
  if (!Array.isArray(books)) return known
  for (const book of books) {
    if (isObject(book) && isBookId(book.id)) known.add(book.id)
  }
  return known
}

/** The well-formed books by id: what a synopsis's series rule reads. */
export function bookMap(books: unknown): Map<BookId, Book> {
  const map = new Map<BookId, Book>()
  if (!Array.isArray(books)) return map
  for (const book of books) if (isObject(book) && isBookId(book.id)) map.set(book.id, book as unknown as Book)
  return map
}

/** The ids carried by more than one entry, of books or of connections. */
export function repeatedIds(entries: readonly unknown[]): Set<string> {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const entry of entries) {
    if (!isObject(entry) || typeof entry.id !== 'string') continue
    if (seen.has(entry.id)) repeated.add(entry.id)
    seen.add(entry.id)
  }
  return repeated
}

export function isOneOf(list: readonly unknown[], value: unknown): boolean {
  return list.includes(value)
}

/** Date.UTC rolls an impossible date over and maps years below 100 to 19xx, so neither round-trips. */
export function isCalendarDate(value: unknown): boolean {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value
}

function httpUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || !HTTP_START.test(value)) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

const field = (entry: unknown, name: string): unknown => (isObject(entry) ? entry[name] : undefined)

/**
 * The wiki a hostname belongs to: its last two labels, so `en.wiki.example` and `es.wiki.example` are one source.
 * Two unrelated sites under a shared suffix such as `.co.uk` also read as one, which hides rather than shows.
 */
function site(hostname: string): string {
  return hostname.split('.').filter(Boolean).slice(-2).join('.')
}

/** The source rule for `confirmed`: migrated from upstream, a primary source, a wiki that cites the book, or two independent wikis. */
function strongEnough(author: unknown, sources: readonly unknown[]): boolean {
  const kinds = sources.map((s) => field(s, 'kind'))
  if (kinds.includes('word-of-brandon') || kinds.includes('official')) return true
  if (author === 'upstream' && kinds.includes('upstream')) return true
  // A wiki page that names the chapter or passage it cites is documented fact, strong alone.
  if (sources.some((s) => field(s, 'kind') === 'wiki' && !isBlank(field(s, 'cites')))) return true
  const hosts = new Set<string>()
  for (const source of sources) {
    if (field(source, 'kind') !== 'wiki') continue
    const url = httpUrl(field(source, 'url'))
    if (url) hosts.add(site(url.hostname))
  }
  return hosts.size >= 2
}

/** Everything wrong with one connection on its own. Rules across connections stay with the catalogue. */
export function connectionProblems(c: unknown, known: ReadonlySet<BookId>): ProblemCode[] {
  if (!isObject(c)) return ['NOT_AN_OBJECT']

  const problems = new Set<ProblemCode>()
  const when = (failed: boolean, code: ProblemCode) => {
    if (failed) problems.add(code)
  }

  // Array.from turns holes into undefined: `includes` would match a hole and `every` would skip it.
  const requires: unknown[] = Array.isArray(c.requires) ? Array.from(c.requires) : []
  const sources: unknown[] = Array.isArray(c.sources) ? Array.from(c.sources) : []
  const ends = c.to === null ? [c.from] : [c.from, c.to]

  when(!isConnectionId(c.id), 'BAD_ID')

  when([...ends, ...requires].some((ref) => !known.has(ref as BookId)), 'REF_UNKNOWN')
  when(ends.some((end) => !requires.includes(end)), 'REQUIRES_MISSING_END')
  when(c.to === c.from, 'SELF_LOOP')
  when((c.to === null) !== (c.type === 'appearance'), 'APPEARANCE_MISMATCH')

  when(!isOneOf(CONNECTION_TIERS, c.tier) || !isOneOf(CONNECTION_TYPES, c.type), 'BAD_ENUM')

  when(sources.length > 0 && c.tier !== 'theory' && !strongEnough(c.author, sources), 'CONFIRMED_WEAK_SOURCE')
  when(sources.some((s) => field(s, 'kind') === 'upstream') && c.author !== 'upstream', 'UPSTREAM_SOURCE_ON_NEW')
  provenance(c, sources, when)
  when(!bothLanguages(c.description), 'MISSING_LANGUAGE')

  return [...problems]
}

type When = (failed: boolean, code: ProblemCode) => void

/** Sources, author and verification: the same rules for connections, synopses and notes. */
function provenance(entry: Record<string, unknown>, sources: readonly unknown[], when: When): void {
  const verifier = readable(entry.verifiedBy)
  when(sources.some((s) => !isOneOf(SOURCE_KINDS, field(s, 'kind'))), 'BAD_ENUM')
  when(sources.length === 0, 'NO_SOURCE')
  when(sources.some((s) => httpUrl(field(s, 'url')) === null), 'BAD_SOURCE_URL')
  when(isBlank(entry.author), 'NO_AUTHOR')
  when(verifier === '' || isBlank(entry.verifiedOn), 'UNVERIFIED')
  when(!isBlank(entry.verifiedOn) && !isCalendarDate(entry.verifiedOn), 'BAD_DATE')
  when(verifier !== '' && verifier === readable(entry.author), 'SELF_VERIFIED')
}

function collector(): { problems: Set<ProblemCode>; when: When } {
  const problems = new Set<ProblemCode>()
  const when: When = (failed, code) => {
    if (failed) problems.add(code)
  }
  return { problems, when }
}

// Array.from turns holes into undefined: `includes` would match a hole and `every` would skip it.
const list = (value: unknown): unknown[] => (Array.isArray(value) ? Array.from(value) : [])
const bothLanguages = (value: unknown): boolean => !isBlank(field(value, 'en')) && !isBlank(field(value, 'es'))

/**
 * Whether `a` came out before `b`, by the catalogue's publication order. Null when either has no place in it:
 * the series rules then fail closed. A number inside a series restarts in each part, so it cannot say this.
 */
function cameBefore(a: Book, b: Book): boolean | null {
  const pa = isObject(a.order) ? a.order.publication : undefined
  const pb = isObject(b.order) ? b.order.publication : undefined
  if (typeof pa !== 'number' || typeof pb !== 'number' || pa === pb) return null
  return pa < pb
}

/**
 * Everything wrong with one synopsis. It waits only on earlier works of its own series, so a lock never tells a
 * reader that two series are linked; it is open only on the first work of the whole series, or on a work with no
 * series, which has nothing to wait for and must be open.
 */
export function synopsisProblems(s: unknown, books: ReadonlyMap<BookId, Book>): ProblemCode[] {
  if (!isObject(s)) return ['NOT_AN_OBJECT']
  const { problems, when } = collector()
  const requires = list(s.requires)
  const open = s.open === true
  const book = typeof s.book === 'string' ? books.get(s.book) : undefined
  const other = (ref: unknown): Book | undefined => (typeof ref === 'string' ? books.get(ref) : undefined)

  when(!book || requires.some((ref) => !other(ref)), 'REF_UNKNOWN')
  when(s.requires !== undefined && !Array.isArray(s.requires), 'BAD_FIELD')
  when(open && requires.length > 0, 'SYNOPSIS_OPEN_AND_REQUIRES')
  when(!open && requires.length === 0, 'SYNOPSIS_NOT_GATED')
  if (book) {
    const series = typeof book.series === 'string' ? book.series : null
    when(series === null && !open, 'SYNOPSIS_NO_SERIES_NOT_OPEN')
    if (series !== null) {
      const sameSeries = (b: Book | undefined): b is Book => b !== undefined && b.series === series
      when(requires.some((ref) => other(ref) !== undefined && !sameSeries(other(ref))), 'SYNOPSIS_OUTSIDE_SERIES')
      when(requires.some((ref) => sameSeries(other(ref)) && cameBefore(other(ref)!, book) !== true), 'SYNOPSIS_REQUIRES_NOT_EARLIER')
      const siblings = [...books.values()].filter((b) => b.id !== book.id && sameSeries(b))
      when(open && siblings.some((b) => cameBefore(book, b) !== true), 'SYNOPSIS_OPEN_LATER')
    }
  }
  const sources = list(s.sources)
  when(sources.some((x) => field(x, 'kind') === 'upstream'), 'UPSTREAM_SOURCE_ON_NEW')
  provenance(s, sources, when)
  when(!bothLanguages(s.text), 'MISSING_LANGUAGE')
  return [...problems]
}

/** Everything wrong with one note. It hangs on works without linking two of them: links are connections. */
export function noteProblems(n: unknown, known: ReadonlySet<BookId>): ProblemCode[] {
  if (!isObject(n)) return ['NOT_AN_OBJECT']
  const { problems, when } = collector()
  const books = list(n.books)
  const requires = list(n.requires)
  const sources = list(n.sources)
  const primary = sources.some((x) => field(x, 'kind') === 'word-of-brandon' || field(x, 'kind') === 'official')

  when(!isNoteId(n.id), 'BAD_ID')
  when(!isOneOf(NOTE_KINDS, n.kind), 'BAD_ENUM')
  when(books.length === 0, 'NOTE_NO_BOOKS')
  when([...books, ...requires].some((ref) => !known.has(ref as BookId)), 'REF_UNKNOWN')
  when(books.some((b) => !requires.includes(b)), 'NOTE_REQUIRES_MISSING_BOOK')
  when(n.kind === 'wob' && !bothLanguages(n.quote), 'NOTE_QUOTE_MISSING')
  when((n.kind === 'wob' || n.kind === 'confirmed-theory') && !primary, 'NOTE_WEAK_SOURCE')
  // Notes hold confirmed content only, so the rest meet the rule for a confirmed connection.
  when((n.kind === 'egg' || n.kind === 'relation') && sources.length > 0 && !strongEnough(n.author, sources), 'NOTE_WEAK_SOURCE')
  when(sources.some((x) => field(x, 'kind') === 'upstream'), 'UPSTREAM_SOURCE_ON_NEW')
  provenance(n, sources, when)
  when(!bothLanguages(n.text), 'MISSING_LANGUAGE')
  return [...problems]
}
