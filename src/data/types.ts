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

export const WRITING_STAGES = ['idea', 'drafting', 'revising', 'done'] as const
export type WritingStage = (typeof WRITING_STAGES)[number]

export const APOCRYPHAL_REASONS = ['not-canon', 'parody', 'superseded', 'unfinished'] as const
export type ApocryphalReason = (typeof APOCRYPHAL_REASONS)[number]

export const RPG_KINDS = ['core', 'world-guide', 'adventure', 'supplement', 'screen', 'starter'] as const
export type RpgKind = (typeof RPG_KINDS)[number]

export const CANON_VALUES = ['yes', 'partly', 'no', 'unknown'] as const
export type CanonValue = (typeof CANON_VALUES)[number]

export const NOTE_KINDS = ['wob', 'egg', 'confirmed-theory', 'relation'] as const
export type NoteKind = (typeof NOTE_KINDS)[number]

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
  'SYNOPSIS_OUTSIDE_SERIES',
  'SYNOPSIS_NOT_GATED',
  'SYNOPSIS_OPEN_AND_REQUIRES',
  'SYNOPSIS_OPEN_LATER',
  'SYNOPSIS_NO_SERIES_NOT_OPEN',
  'SYNOPSIS_REQUIRES_NOT_EARLIER',
  'NOTE_NO_BOOKS',
  'NOTE_REQUIRES_MISSING_BOOK',
  'NOTE_QUOTE_MISSING',
  'NOTE_WEAK_SOURCE',
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
  // Public facts for works not yet published, apocryphal works and role-playing books. Enums, never free text,
  // so a fact cannot carry plot; each one names its source.
  /** How far the writing has gone, from the author's own progress reports. */
  writing?: { stage: WritingStage; percent?: number; source: string; asOf: string }
  /** An official date, or the window the author gave: `2027`, `2027-03`, `2027-03-15`, `2027-H2` or `2027-Q4`. */
  expected?: { when: string; official: boolean; source: string }
  /** Where the work was announced: an https link. */
  announcedIn?: string
  apocryphal?: { reason: ApocryphalReason; source: string }
  publisher?: string
  line?: string
  rpgKind?: RpgKind
  /** The crowdfunding campaign: an https link. */
  crowdfunding?: string
  canon?: { value: CanonValue; source: string }
}

export interface Connection {
  id: string
  from: BookId
  to: BookId | null
  type: ConnectionType
  tier: ConnectionTier
  description: { en: string; es: string }
  requires: BookId[]
  sources: Source[]
  author: string
  verifiedBy: string
  verifiedOn: string
}

export interface Source {
  url: string
  kind: SourceKind
  /** The chapter or passage a wiki page cites. */
  cites?: string
}

/** Our own words about a work. It shows once its `requires` are read, or at once when `open`. */
export interface Synopsis {
  book: BookId
  text: { en: string; es: string }
  /** Earlier works of the same series only. */
  requires?: BookId[]
  /** Nothing to wait for: a series opener or a work with no series. */
  open?: true
  sources: Source[]
  author: string
  verifiedBy: string
  verifiedOn: string
}

/** A Word of Brandon, an easter egg, a confirmed theory or a relation, hanging on one or more works. */
export interface Note {
  id: string
  kind: NoteKind
  books: BookId[]
  text: { en: string; es: string }
  /** For a Word of Brandon: the literal English quote and our Spanish translation. */
  quote?: { en: string; es: string }
  /** Every work in `books`, and any other it would give away. */
  requires: BookId[]
  sources: Source[]
  author: string
  verifiedBy: string
  verifiedOn: string
}

export interface Catalog {
  books: Book[]
  connections: Connection[]
  synopses: Synopsis[]
  notes: Note[]
  meta: { updatedOn: string }
}

export interface Problem {
  code: ProblemCode
  id: string
}
