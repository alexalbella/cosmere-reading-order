import { APOCRYPHAL_REASONS, BOOK_STATUSES, CANON_VALUES, ES_EDITION_STATUSES, FORMATS, RPG_KINDS, WORLD_KEYS, WRITING_STAGES } from './types'
import { STORED_ID } from '../state/merge'
import type { Book, Catalog, Connection, Note, Problem, ProblemCode, Synopsis } from './types'
import {
  bookMap,
  connectionProblems,
  isBlank,
  isBookId,
  isCalendarDate,
  isConnectionId,
  isNoteId,
  isObject,
  isOneOf,
  knownBookIds,
  noteProblems,
  repeatedIds,
  synopsisProblems,
} from './soundness'

/** An id can be arbitrary text, or absent, so a malformed one is named by its position. */
export function connectionLabel(c: Connection, index: number): string {
  return isObject(c) && isConnectionId(c.id) ? c.id : `conn#${index}`
}

/**
 * A synopsis is named by its work, `syn:<book>`, only when the catalogue has that work; otherwise by its position,
 * so text from a data file can never reach the output dressed as an id.
 */
export function synopsisLabel(s: Synopsis, index: number, known: ReadonlySet<string>): string {
  return isObject(s) && isBookId(s.book) && known.has(s.book) ? `syn:${s.book}` : `syn#${index}`
}

export function noteLabel(n: Note, index: number): string {
  return isObject(n) && isNoteId(n.id) ? n.id : `note#${index}`
}

function bookLabel(b: Book, index: number): string {
  return isObject(b) && isBookId(b.id) ? b.id : `book#${index}`
}

type Add = (code: ProblemCode, id: string) => void

const isNumber = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value)
const isText = (value: unknown): boolean => typeof value === 'string' && value.trim() !== ''
const absentOr = (value: unknown, ok: (v: unknown) => boolean): boolean => value === undefined || ok(value)
const isHttps = (v: unknown): boolean => typeof v === 'string' && /^https:\/\/\S+$/.test(v)
/** A name (a publisher, a line of books): one short line, so prose can never reach the plate in its place. */
const isName = (v: unknown): boolean => typeof v === 'string' && v === v.trim() && /^[^\n\r\t]{1,60}$/.test(v)
/** An object that holds its own fields and no other: an extra one would be copied into the catalogue as it is. */
const only = (v: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(v).every((k) => keys.includes(k))
const EXPECTED_WHEN = /^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-\d{2})?|-H[12]|-Q[1-4])?$/

/** The shape of each plate fact. Whether its value is in its list is the enum rule's job. */
function plateFactProblems(b: Book): boolean {
  const writing: unknown = b.writing
  const expected: unknown = b.expected
  const apocryphal: unknown = b.apocryphal
  const canon: unknown = b.canon
  return (
    !absentOr(writing, (w) =>
      isObject(w) &&
      only(w, ['stage', 'percent', 'source', 'asOf']) &&
      typeof w.stage === 'string' &&
      absentOr(w.percent, (p) => isNumber(p) && (p as number) >= 0 && (p as number) <= 100) &&
      isHttps(w.source) &&
      isCalendarDate(w.asOf),
    ) ||
    !absentOr(expected, (e) =>
      isObject(e) &&
      only(e, ['when', 'official', 'source']) &&
      typeof e.when === 'string' &&
      EXPECTED_WHEN.test(e.when) &&
      (e.when.length !== 10 || isCalendarDate(e.when)) &&
      typeof e.official === 'boolean' &&
      isHttps(e.source),
    ) ||
    !absentOr(b.announcedIn, isHttps) ||
    !absentOr(apocryphal, (a) => isObject(a) && only(a, ['reason', 'source']) && typeof a.reason === 'string' && isHttps(a.source)) ||
    !absentOr(b.publisher, isName) ||
    !absentOr(b.line, isName) ||
    !absentOr(b.rpgKind, (k) => typeof k === 'string') ||
    !absentOr(b.crowdfunding, isHttps) ||
    !absentOr(canon, (c) => isObject(c) && only(c, ['value', 'source']) && typeof c.value === 'string' && isHttps(c.source))
  )
}

/** A plate fact whose value is outside its list. */
function plateFactEnums(b: Book): boolean {
  const field = (v: unknown, key: string): unknown => (isObject(v) ? v[key] : undefined)
  return (
    (b.writing !== undefined && isObject(b.writing) && !isOneOf(WRITING_STAGES, field(b.writing, 'stage'))) ||
    (b.apocryphal !== undefined && isObject(b.apocryphal) && !isOneOf(APOCRYPHAL_REASONS, field(b.apocryphal, 'reason'))) ||
    (typeof b.rpgKind === 'string' && !isOneOf(RPG_KINDS, b.rpgKind)) ||
    (b.canon !== undefined && isObject(b.canon) && !isOneOf(CANON_VALUES, field(b.canon, 'value')))
  )
}

/** Every field the app reads has the type it reads it as: a wrong one would throw, or show a blank, once on screen. */
function fieldProblems(b: Book): boolean {
  const titles: unknown = b.titles
  const order: unknown = b.order
  return (
    !isObject(titles) ||
    !(titles.es === null || absentOr(titles.es, isText)) ||
    !isObject(order) ||
    Object.values(order).some((v) => !isNumber(v)) ||
    !(b.phase === null || isNumber(b.phase)) ||
    !(b.series === null || isText(b.series)) ||
    !absentOr(b.pages, isNumber) ||
    !absentOr(b.year, isNumber) ||
    !absentOr(b.addedOn, isCalendarDate) ||
    !absentOr(b.containedIn, (v) => Array.isArray(v) && v.every((x) => typeof x === 'string')) ||
    !isObject(b.esEdition) ||
    !absentOr(b.esEdition.source, isText) ||
    !absentOr(b.esEdition.in, isText) ||
    !absentOr(b.esEdition.publisher, isText) ||
    !absentOr(b.esEdition.year, isNumber) ||
    !absentOr(b.esEdition.pages, isNumber) ||
    !(b.subseries === null || absentOr(b.subseries, isText)) ||
    !absentOr(b.seriesIndex, isNumber) ||
    !absentOr(b.place, isNumber) ||
    !absentOr(b.aside, (v) => typeof v === 'boolean') ||
    !absentOr(b.words, isNumber) ||
    !absentOr(b.publication, (v) => typeof v === 'string' && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(v)) ||
    !absentOr(b.readFree, (v) => typeof v === 'string' && /^https:\/\//.test(v)) ||
    plateFactProblems(b)
  )
}

/** Aliases move what a reader marked from an old id to this book, so they are held to the form of a stored id. */
function aliasProblems(books: Book[], add: Add): void {
  const current = new Set(knownBookIds(books))
  const seen = new Set<string>()
  books.forEach((b, index) => {
    if (!isObject(b) || b.aliases === undefined) return
    const id = bookLabel(b, index)
    const list: unknown = b.aliases
    if (!Array.isArray(list)) {
      add('BAD_ALIAS', id)
      return
    }
    for (const alias of list) {
      if (typeof alias !== 'string' || !STORED_ID.test(alias) || current.has(alias) || seen.has(alias)) add('BAD_ALIAS', id)
      if (typeof alias === 'string') seen.add(alias)
    }
  })
}

function bookProblems(books: Book[], add: Add): void {
  const known = knownBookIds(books)
  const repeated = repeatedIds(books)
  books.forEach((b, index) => {
    const id = bookLabel(b, index)
    if (!isObject(b)) {
      add('NOT_AN_OBJECT', id)
      return
    }
    if (id !== b.id) add('BAD_ID', id)
    if (repeated.has(b.id)) add('DUPLICATE_ID', id)

    if (isBlank(b.titles?.en)) add('NO_ENGLISH_TITLE', id)
    if (fieldProblems(b)) add('BAD_FIELD', id)
    if (!isOneOf(WORLD_KEYS, b.world)) {
      add('UNKNOWN_WORLD', id)
      add('BAD_ENUM', id)
    }
    if (
      !isOneOf(FORMATS, b.format) ||
      !isOneOf(BOOK_STATUSES, b.status) ||
      !isOneOf(ES_EDITION_STATUSES, b.esEdition?.status) ||
      plateFactEnums(b)
    ) {
      add('BAD_ENUM', id)
    }
    if ((b.status === 'announced' || b.status === 'planned') && b.year !== undefined) {
      add('ANNOUNCED_WITH_DATE', id)
    }
    if (b.status === 'published' && (b.order?.recommended === undefined || b.order?.publication === undefined)) {
      add('MISSING_ORDER', id)
    }
    if (b.esEdition?.status === 'published') {
      if (isBlank(b.esEdition.source)) add('ES_SOURCE_MISSING', id)
      if (isBlank(b.titles?.es) && isBlank(b.esEdition.in)) add('ES_TITLE_MISSING', id)
    }
    if (Array.isArray(b.containedIn) && b.containedIn.some((ref) => !known.has(ref))) add('REF_UNKNOWN', id)
  })
  aliasProblems(books, add)
}

/** Each connection's own problems, plus the one rule that needs to see them all. */
function catalogueConnectionProblems(connections: Connection[], known: ReadonlySet<string>, add: Add): void {
  const repeated = repeatedIds(connections)
  connections.forEach((c, index) => {
    const id = connectionLabel(c, index)
    for (const code of connectionProblems(c, known)) add(code, id)
    if (isObject(c) && repeated.has(c.id)) add('DUPLICATE_ID', id)
  })
}

/** Each synopsis's own problems, and one work carried by two synopses. */
function catalogueSynopsisProblems(synopses: unknown, books: unknown, add: Add): void {
  const list: Synopsis[] = Array.isArray(synopses) ? synopses : []
  const map = bookMap(books)
  const perBook = new Map<unknown, number>()
  for (const s of list) if (isObject(s)) perBook.set(s.book, (perBook.get(s.book) ?? 0) + 1)
  const known = new Set(map.keys())
  list.forEach((s, index) => {
    const id = synopsisLabel(s, index, known)
    for (const code of synopsisProblems(s, map)) add(code, id)
    if (isObject(s) && (perBook.get(s.book) ?? 0) > 1) add('DUPLICATE_ID', id)
  })
}

/** Each note's own problems, and one id carried by two notes. */
function catalogueNoteProblems(notes: unknown, known: ReadonlySet<string>, add: Add): void {
  const list: Note[] = Array.isArray(notes) ? notes : []
  const repeated = repeatedIds(list)
  list.forEach((n, index) => {
    const id = noteLabel(n, index)
    for (const code of noteProblems(n, known)) add(code, id)
    if (isObject(n) && repeated.has(n.id)) add('DUPLICATE_ID', id)
  })
}

/** Returns codes and ids only, never text from the data. */
export function validateCatalog(catalog: Catalog, previous?: Pick<Catalog, 'books'>): Problem[] {
  const problems: Problem[] = []
  const add: Add = (code, id) => {
    if (!problems.some((p) => p.code === code && p.id === id)) problems.push({ code, id })
  }

  if (!Array.isArray(catalog.books) || catalog.books.length === 0) add('EMPTY_CATALOGUE', 'catalogue')
  if (!isObject(catalog.meta) || !isCalendarDate(catalog.meta.updatedOn)) add('BAD_META', 'meta')
  bookProblems(catalog.books, add)
  catalogueConnectionProblems(catalog.connections, knownBookIds(catalog.books), add)
  catalogueSynopsisProblems(catalog.synopses, catalog.books, add)
  catalogueNoteProblems(catalog.notes, knownBookIds(catalog.books), add)

  if (previous) {
    const aliases = (b: Book): unknown[] => (Array.isArray(b.aliases) ? b.aliases : [])
    const heir = new Map(catalog.books.filter(isObject).flatMap((b) => aliases(b).map((a): [unknown, Book] => [a, b])))
    const current = new Set(catalog.books.filter(isObject).map((b) => b.id))
    for (const old of previous.books.filter(isObject)) {
      if (!isBookId(old.id) || current.has(old.id)) continue
      const taker = heir.get(old.id)
      if (!taker) add('BOOK_REMOVED', old.id)
      // Not proof that it is the same book, but a cheap catch for a wrong target: its marks would move onto it.
      else if (taker.format !== old.format || taker.world !== old.world) add('ALIAS_MISMATCH', bookLabel(taker, catalog.books.indexOf(taker)))
    }
  }
  return problems
}

/** The entries no problem names, and the labels of those it does. Works for connections, synopses and notes. */
export function pruneBy<T>(
  entries: readonly T[],
  problems: Problem[],
  label: (entry: T, index: number) => string,
): { kept: T[]; dropped: string[] } {
  const bad = new Set(problems.map((p) => p.id))
  const isBad = (e: T, i: number) => bad.has(label(e, i))
  const kept = entries.filter((e, i) => !isBad(e, i))
  const dropped = [...new Set(entries.flatMap((e, i) => (isBad(e, i) ? [label(e, i)] : [])))]
  return { kept, dropped }
}

export function pruneInvalid(connections: Connection[], problems: Problem[]): { kept: Connection[]; dropped: string[] } {
  return pruneBy(connections, problems, connectionLabel)
}
