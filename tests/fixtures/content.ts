import type { Book, BookId, Note, Synopsis } from '../../src/data/types'
import { fixtureCatalog } from './catalog'

// Synopses and notes over the invented books of `catalog.ts`. Every text carries LEAK-<id>, so a test can
// tell whether anything hidden reached the page. Every call returns fresh objects.

function synopsis(book: BookId, extra: Partial<Synopsis>): Synopsis {
  return {
    book,
    text: { en: `LEAK-syn-${book} en`, es: `LEAK-syn-${book} es` },
    sources: [{ url: 'https://publisher.example.test/about', kind: 'official' }],
    author: 'agent-a',
    verifiedBy: 'agent-b',
    verifiedOn: '2026-11-12',
    ...extra,
  }
}

function note(id: string, extra: Partial<Note>): Note {
  return {
    id,
    kind: 'egg',
    books: ['glass-harbour'],
    text: { en: `LEAK-${id} en`, es: `LEAK-${id} es` },
    requires: ['glass-harbour'],
    sources: [{ url: 'https://wiki-one.example.test/p', kind: 'wiki', cites: 'chapter 3' }],
    author: 'agent-a',
    verifiedBy: 'agent-b',
    verifiedOn: '2026-11-12',
    ...extra,
  }
}

/** The Orchard series opener, its gated second work, and a work with no series. */
export function fixtureSynopses(): Synopsis[] {
  return [
    synopsis('copper-orchard', { open: true }),
    synopsis('orchard-dusk', { requires: ['copper-orchard'] }),
    synopsis('glass-harbour', { open: true }),
  ]
}

/** A Word of Brandon with its quote, and an easter egg that waits on two works. */
export function fixtureNotes(): Note[] {
  return [
    note('n-0001', {
      kind: 'wob',
      books: ['ash-road'],
      requires: ['ash-road'],
      quote: { en: 'LEAK-n-0001 quote en', es: 'LEAK-n-0001 quote es' },
      sources: [{ url: 'https://primary.example.test/wob', kind: 'word-of-brandon' }],
    }),
    note('n-0002', { requires: ['glass-harbour', 'ash-road'] }),
  ]
}

/** The fixture books by id, with the Orchard series numbered: the opener is 1, its second work 2. */
export function fixtureBookMap(): Map<BookId, Book> {
  const books = fixtureCatalog().books.map((b) =>
    b.id === 'copper-orchard' ? { ...b, seriesIndex: 1 } : b.id === 'orchard-dusk' ? { ...b, seriesIndex: 2 } : b,
  )
  return new Map(books.map((b) => [b.id, b]))
}
