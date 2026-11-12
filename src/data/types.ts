export type BookId = string

// One list per enum, read at runtime by the rules, and every type derives from its list.

/** `otros` holds what has no single world, or none that has been announced. */
export const WORLD_KEYS = ['sel', 'scadrial', 'nalthis', 'taldain', 'threnody', 'sol', 'roshar', 'yolen', 'lumar', 'komashi', 'canticle', 'ashyn', 'aether', 'mythos', 'otros'] as const
export type WorldKey = (typeof WORLD_KEYS)[number]

export const FORMATS = ['novel', 'novella', 'short', 'comic', 'illustrated', 'anthology', 'rpg', 'essay'] as const
export type Format = (typeof FORMATS)[number]

export const BOOK_STATUSES = ['published', 'announced', 'planned', 'apocryphal'] as const
export type BookStatus = (typeof BOOK_STATUSES)[number]

export const ES_EDITION_STATUSES = ['published', 'announced', 'none', 'unknown'] as const
export type EsEditionStatus = (typeof ES_EDITION_STATUSES)[number]

export const ORDER_KEYS = ['recommended', 'publication'] as const
export type OrderKey = (typeof ORDER_KEYS)[number]

export const SOURCE_KINDS = ['upstream', 'word-of-brandon', 'official', 'wiki', 'video', 'forum'] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]

export const CONNECTION_TYPES = ['major', 'significant', 'minor', 'egg', 'appearance'] as const
export type ConnectionType = (typeof CONNECTION_TYPES)[number]

export const CONNECTION_TIERS = ['confirmed', 'theory'] as const
export type ConnectionTier = (typeof CONNECTION_TIERS)[number]

export const MARK_STATUSES = ['read', 'reading', 'skipped', 'none'] as const
export type MarkStatus = (typeof MARK_STATUSES)[number]

export const PROBLEM_CODES = [
  'BAD_ID',
  'DUPLICATE_ID',
  'NOT_AN_OBJECT',
  'REF_UNKNOWN',
  'REQUIRES_MISSING_END',
  'SELF_LOOP',
  'APPEARANCE_MISMATCH',
  'NO_SOURCE',
  'BAD_SOURCE_URL',
  'CONFIRMED_WEAK_SOURCE',
  'UPSTREAM_SOURCE_ON_NEW',
  'NO_AUTHOR',
  'UNVERIFIED',
  'BAD_DATE',
  'SELF_VERIFIED',
  'MISSING_LANGUAGE',
  'NO_ENGLISH_TITLE',
  'ANNOUNCED_WITH_DATE',
  'MISSING_ORDER',
  'ES_TITLE_MISSING',
  'ES_SOURCE_MISSING',
  'UNKNOWN_WORLD',
  'BOOK_REMOVED',
  'BAD_ENUM',
  'BAD_FIELD',
  'BAD_ALIAS',
  'ALIAS_MISMATCH',
  'EMPTY_CATALOGUE',
  'BAD_META',
] as const
export type ProblemCode = (typeof PROBLEM_CODES)[number]

export interface Book {
  id: BookId
  titles: { en: string; es: string | null }
  esEdition: { status: EsEditionStatus; source?: string; in?: string; publisher?: string; year?: number; pages?: number }
  world: WorldKey
  series: string | null
  format: Format
  status: BookStatus
  pages?: number
  year?: number
  order: Partial<Record<OrderKey, number>>
  phase: number | null
  /** The part of its series the book belongs to, when the series has parts. */
  subseries?: string | null
  /** Its number inside that series or part, in the order they came out. */
  seriesIndex?: number
  /** The day, month or year it first came out: `2010-08-31`, `2010-08` or `2010`. */
  publication?: string
  words?: number
  /** Where its author lets it be read for free. */
  readFree?: string
  /** The book's seat on the map of worlds, clockwise. */
  place?: number
  /** A story told beside the main run of its series. The map sets it a step back. */
  aside?: boolean
  containedIn?: BookId[]
  aliases?: BookId[]
  addedOn?: string
}

export interface Connection {
  id: string
  from: BookId
  to: BookId | null
  type: ConnectionType
  tier: ConnectionTier
  description: { en: string; es: string }
  requires: BookId[]
  sources: { url: string; kind: SourceKind; cites?: string }[]
  author: string
  verifiedBy: string
  verifiedOn: string
}

export interface Catalog {
  books: Book[]
  connections: Connection[]
  meta: { updatedOn: string }
}

export interface Problem {
  code: ProblemCode
  id: string
}
