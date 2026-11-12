import { FORMATS } from '../data/types'
import type { Book, BookStatus, Connection, ConnectionType, Format, OrderKey } from '../data/types'
import { ordered } from '../reading/next'

export interface Filters {
  statuses: BookStatus[]
  formats: Format[]
  series: string[]
  phases: number[]
  connectionTypes: ConnectionType[]
  theories: boolean
}

export function defaultFilters(): Filters {
  return {
    statuses: ['published'],
    formats: FORMATS.filter((f) => f !== 'rpg'),
    series: [],
    phases: [],
    connectionTypes: ['major', 'significant'],
    theories: false,
  }
}

/** Books that pass every filter, sorted by the order key with unplaced books last. */
export function filterBooks(books: Book[], f: Filters, order: OrderKey): Book[] {
  return ordered(
    books.filter(
      (b) =>
        f.statuses.includes(b.status) &&
        f.formats.includes(b.format) &&
        (f.series.length === 0 || (b.series !== null && f.series.includes(b.series))) &&
        (f.phases.length === 0 || (b.phase !== null && f.phases.includes(b.phase))),
    ),
    order,
  )
}

/** Fails closed: only a known type and a known tier pass. Never adds to its input. */
export function filterConnections(list: Connection[], f: Filters): Connection[] {
  return list.filter(
    (c) => f.connectionTypes.includes(c.type) && (c.tier === 'confirmed' || (c.tier === 'theory' && f.theories)),
  )
}
