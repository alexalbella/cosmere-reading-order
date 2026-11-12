import type { Book } from '../../src/data/types'

/** The plate facts `data/public-facts.json` may give a work, beside its structure. */
export const PLATE_FACT_KEYS = ['writing', 'expected', 'announcedIn', 'apocryphal', 'publisher', 'line', 'rpgKind', 'crowdfunding', 'canon'] as const
export type PlateFactKey = (typeof PLATE_FACT_KEYS)[number]
export type PlateFacts = { [K in PlateFactKey]?: Book[K] | null }

/**
 * Copies the plate facts a work's entry gives. A fact given as null takes the field away; one not given leaves
 * it as it is. Nothing else is read from the entry, so a status or an order there can never reach the book.
 */
export function copyPlateFacts(book: Book, facts: PlateFacts): void {
  for (const key of PLATE_FACT_KEYS) {
    if (!Object.hasOwn(facts, key)) continue
    const value = facts[key]
    if (value === null || value === undefined) delete book[key]
    else (book as unknown as Record<string, unknown>)[key] = structuredClone(value)
  }
}
