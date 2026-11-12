import { CONNECTION_TIERS, CONNECTION_TYPES, SOURCE_KINDS } from './types'
import type { BookId, ProblemCode } from './types'

// The one definition of a sound connection. `isShowable` is "no problems here", and the validator
// reports the same codes, so passing the validator and being able to appear cannot drift apart.
// Everything here reads untrusted JSON: nothing throws, and problems carry codes, never text.

const BOOK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const CONNECTION_ID = /^c-\d{4}$/
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

/** The ids a connection may refer to. Only well-formed books count. */
export function knownBookIds(books: unknown): Set<BookId> {
  const known = new Set<BookId>()
  if (!Array.isArray(books)) return known
  for (const book of books) {
    if (isObject(book) && isBookId(book.id)) known.add(book.id)
  }
  return known
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
  const verifier = readable(c.verifiedBy)

  when(!isConnectionId(c.id), 'BAD_ID')

  when([...ends, ...requires].some((ref) => !known.has(ref as BookId)), 'REF_UNKNOWN')
  when(ends.some((end) => !requires.includes(end)), 'REQUIRES_MISSING_END')
  when(c.to === c.from, 'SELF_LOOP')
  when((c.to === null) !== (c.type === 'appearance'), 'APPEARANCE_MISMATCH')

  when(
    !isOneOf(CONNECTION_TIERS, c.tier) ||
      !isOneOf(CONNECTION_TYPES, c.type) ||
      sources.some((s) => !isOneOf(SOURCE_KINDS, field(s, 'kind'))),
    'BAD_ENUM',
  )

  when(sources.length === 0, 'NO_SOURCE')
  when(sources.some((s) => httpUrl(field(s, 'url')) === null), 'BAD_SOURCE_URL')
  when(sources.length > 0 && c.tier !== 'theory' && !strongEnough(c.author, sources), 'CONFIRMED_WEAK_SOURCE')
  when(sources.some((s) => field(s, 'kind') === 'upstream') && c.author !== 'upstream', 'UPSTREAM_SOURCE_ON_NEW')

  when(isBlank(c.author), 'NO_AUTHOR')
  when(verifier === '' || isBlank(c.verifiedOn), 'UNVERIFIED')
  when(!isBlank(c.verifiedOn) && !isCalendarDate(c.verifiedOn), 'BAD_DATE')
  when(verifier !== '' && verifier === readable(c.author), 'SELF_VERIFIED')

  when(isBlank(field(c.description, 'en')) || isBlank(field(c.description, 'es')), 'MISSING_LANGUAGE')

  return [...problems]
}
