import type { Book, Format } from '../data/types'

/** Width of a standing spine in px: wider for a longer book, between 30 and 92. */
export function spineWidthPx(pages?: number): number {
  return Math.max(30, Math.min(92, 22 + (pages ?? 0) / 16))
}

/** Width of a flat spine on the phone pile, as a percentage of the row. */
export function pileWidthPercent(pages?: number): number {
  return pages === undefined ? 52 : Math.max(52, Math.min(100, 46 + pages / 22))
}

const TALL: readonly Format[] = ['novel', 'anthology', 'rpg']
const MEDIUM: readonly Format[] = ['novella', 'comic']

/** How tall a standing spine is, as a share of the shelf height: by format. */
export function spineHeightRatio(format: Format): number {
  return TALL.includes(format) ? 1 : MEDIUM.includes(format) ? 0.9 : 0.82
}

/** How many columns of vertical text a title needs on its spine. */
export function titleColumns(title: string, format: Format): number {
  const perColumn = TALL.includes(format) ? 26 : MEDIUM.includes(format) ? 23 : 20
  return Math.max(1, Math.ceil(title.length / perColumn))
}

/** The narrowest a spine gets on the shelf, whatever its page count. */
const MIN_SPINE_PX = 38

/** How many columns a spine may show: what its title asks for, or what its width holds if that is more. */
export function spineColumns(title: string, format: Format, pages?: number): number {
  return Math.max(titleColumns(title, format), Math.floor(Math.max(spineWidthPx(pages), MIN_SPINE_PX) / 17))
}

export interface ShelfGroup {
  /** `phase-N`, `rpg`, `other` or `future`. */
  key: string
  phase: number | null
  books: Book[]
}

/** The shelves: one per phase of published books, then role-playing, unplaced, and still to come. */
export function groupBooks(books: Book[]): ShelfGroup[] {
  const phased = new Map<number, Book[]>()
  const rpg: Book[] = []
  const other: Book[] = []
  const future: Book[] = []
  for (const b of books) {
    if (b.format === 'rpg') rpg.push(b)
    else if (b.status !== 'published') future.push(b)
    else if (b.phase === null) other.push(b)
    else phased.set(b.phase, [...(phased.get(b.phase) ?? []), b])
  }
  const groups: ShelfGroup[] = [...phased.entries()]
    .sort(([a], [b]) => a - b)
    .map(([phase, list]) => ({ key: `phase-${phase}`, phase, books: list }))
  if (rpg.length) groups.push({ key: 'rpg', phase: null, books: rpg })
  if (other.length) groups.push({ key: 'other', phase: null, books: other })
  if (future.length) groups.push({ key: 'future', phase: null, books: future })
  return groups
}
