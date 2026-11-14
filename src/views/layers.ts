// The colour layers of the ring. By default a title wears its world's colour. The other three layers repaint
// every title by one public fact: how far its publication is, its format, or what the reader has marked.
// Nothing here reads a connection, a synopsis or a note.
import { BOOK_STATUSES, FORMATS, type Book, type BookStatus, type Format, type MarkStatus } from '../data/types'
import type { StringKey } from '../i18n'

export const LAYERS = ['world', 'status', 'format', 'read'] as const
export type Layer = (typeof LAYERS)[number]
export const isLayer = (value: unknown): value is Layer => LAYERS.includes(value as Layer)

/** What the read layer tells apart. A work with no mark is unread. */
export const READ_VALUES = ['read', 'reading', 'unread', 'skipped'] as const
export type ReadValue = (typeof READ_VALUES)[number]
export const readValue = (mark: MarkStatus): ReadValue => (mark === 'none' ? 'unread' : mark)

// Every ink passes 4.5:1 on the night sky under any title (tests/unit/layers.test.ts).
export const STATUS_INKS: Record<BookStatus, string> = {
  published: '#e9cd85',
  announced: '#7fc8e8',
  planned: '#b9a7e6',
  apocryphal: '#e89a8a',
}
export const FORMAT_INKS: Record<Format, string> = {
  novel: '#ead7a6',
  novella: '#9fd3b6',
  short: '#8fc1e8',
  comic: '#e8a0c8',
  illustrated: '#f0b77a',
  anthology: '#c9b3ff',
  rpg: '#ff8f6b',
  essay: '#cfcfcf',
}
export const READ_INKS: Record<ReadValue, string> = {
  read: '#f4dc97',
  reading: '#ffd36b',
  unread: '#aea898',
  skipped: '#9db4c4',
}

const STATUS_LABELS: Record<BookStatus, StringKey> = {
  published: 'statusPublished',
  announced: 'statusAnnounced',
  planned: 'statusPlanned',
  apocryphal: 'statusApocryphal',
}
const FORMAT_LABELS: Record<Format, StringKey> = {
  novel: 'formatNovel',
  novella: 'formatNovella',
  short: 'formatShort',
  comic: 'formatComic',
  illustrated: 'formatIllustrated',
  anthology: 'formatAnthology',
  rpg: 'formatRpg',
  essay: 'formatEssay',
}
const READ_LABELS: Record<ReadValue, StringKey> = {
  read: 'stateRead',
  reading: 'stateReading',
  unread: 'stateUnread',
  skipped: 'stateSkipped',
}

/** The value a layer reads off a work: its status, its format or its mark. Null with the world layer. */
export function layerValue(book: Book, layer: Layer, mark: MarkStatus): string | null {
  switch (layer) {
    case 'status':
      return book.status
    case 'format':
      return book.format
    case 'read':
      return readValue(mark)
    default:
      return null
  }
}

/** The ink a layer gives a title, or null to leave it its world's own. A value outside its list has none. */
export function layerInk(book: Book, layer: Layer, mark: MarkStatus): string | null {
  const value = layerValue(book, layer, mark)
  if (value === null) return null
  const inks: Record<string, string> = layer === 'status' ? STATUS_INKS : layer === 'format' ? FORMAT_INKS : READ_INKS
  return Object.hasOwn(inks, value) ? inks[value]! : null
}

export interface LegendEntry {
  value: string
  ink: string
  label: StringKey
}

/** The values a layer tells apart, in a fixed order, each with its ink and its name. Names only: no counts. */
export function layerLegend(layer: Layer): LegendEntry[] {
  switch (layer) {
    case 'status':
      return BOOK_STATUSES.map((value) => ({ value, ink: STATUS_INKS[value], label: STATUS_LABELS[value] }))
    case 'format':
      return FORMATS.map((value) => ({ value, ink: FORMAT_INKS[value], label: FORMAT_LABELS[value] }))
    case 'read':
      return READ_VALUES.map((value) => ({ value, ink: READ_INKS[value], label: READ_LABELS[value] }))
    default:
      return []
  }
}
