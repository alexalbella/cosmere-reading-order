import type { Book, OrderKey } from '../data/types'
import type { Marks } from '../spoilers/visible'
import { statusOf } from './status'

export interface NextOptions {
  order: OrderKey
  includeRpg: boolean
}

export function ordered(books: Book[], order: OrderKey): Book[] {
  const position = (b: Book) => b.order[order] ?? Number.POSITIVE_INFINITY
  // Compared, not subtracted: two unplaced books are Infinity apart, and Infinity - Infinity is NaN.
  return [...books].sort((a, b) => {
    const pa = position(a)
    const pb = position(b)
    return pa === pb ? 0 : pa < pb ? -1 : 1
  })
}

export function counts(book: Book, opts: NextOptions): boolean {
  if (book.status !== 'published') return false
  return opts.includeRpg || (book.format !== 'rpg' && book.format !== 'essay')
}

export function current(books: Book[], marks: Marks, opts: NextOptions): Book | null {
  return (
    ordered(books, opts.order).find((b) => b.status === 'published' && statusOf(marks, b.id) === 'reading') ?? null
  )
}

export function next(books: Book[], marks: Marks, opts: NextOptions): Book | null {
  const list = ordered(books, opts.order)
  const now = current(books, marks, opts)
  const from = now ? list.indexOf(now) + 1 : 0
  return list.slice(from).find((b) => counts(b, opts) && statusOf(marks, b.id) === 'none') ?? null
}

/** Unread works before the one in progress. With nothing in progress there is no gap. */
export function gaps(books: Book[], marks: Marks, opts: NextOptions): Book[] {
  const list = ordered(books, opts.order)
  const now = current(books, marks, opts)
  if (!now) return []
  return list
    .slice(0, list.indexOf(now))
    .filter((b) => counts(b, opts) && statusOf(marks, b.id) === 'none')
}

/**
 * The first published volume that carries this work, if any. One that is only announced is not something to buy,
 * so with no published carrier nothing is said about buying. A Spanish volume's title is display data, not here.
 */
export function volumeToBuy(book: Book, books: Book[]): Book | null {
  for (const id of book.containedIn ?? []) {
    const volume = books.find((b) => b.id === id)
    if (volume?.status === 'published') return volume
  }
  return null
}
