import { isCalendarDate } from '../data/soundness'
import type { Book } from '../data/types'

const DAY = 24 * 60 * 60 * 1000

/** Added to the catalogue within the last `days` days. Anything unclear is not new. */
export function isRecentlyAdded(book: Book, now: number, days = 60): boolean {
  const on = book.addedOn
  if (typeof on !== 'string' || !isCalendarDate(on)) return false
  const at = Date.parse(`${on}T00:00:00Z`)
  if (!Number.isFinite(at)) return false
  const age = now - at
  return age >= 0 && age <= days * DAY
}
