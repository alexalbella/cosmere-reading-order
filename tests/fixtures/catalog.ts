import type { Book, Catalog, Connection } from '../../src/data/types'

const LONG_TITLE = 'The Very Long and Winding Chronicle of the Amber Chartmakers'

function book(id: string, en: string, es: string | null, extra: Partial<Book> = {}): Book {
  return {
    id,
    titles: { en, es },
    esEdition: es
      ? { status: 'published', source: 'https://publisher.example.test/catalogue' }
      : { status: 'none' },
    world: 'sel',
    series: null,
    format: 'novel',
    status: 'published',
    pages: 300,
    year: 2000,
    order: { recommended: 1, publication: 1 },
    phase: 1,
    ...extra,
  }
}

function connection(id: string, extra: Partial<Connection>): Connection {
  return {
    id,
    from: 'ash-road',
    to: 'copper-orchard',
    type: 'major',
    tier: 'confirmed',
    description: { en: `LEAK-${id} en`, es: `LEAK-${id} es` },
    requires: ['ash-road', 'copper-orchard'],
    sources: [{ url: 'https://primary.example.test/a', kind: 'word-of-brandon' }],
    author: 'agent-a',
    verifiedBy: 'agent-b',
    verifiedOn: '2026-11-04',
    ...extra,
  }
}

/** A clean catalogue with invented titles. Every call returns fresh objects. */
export function fixtureCatalog(): Catalog {
  return {
    books: [
      book('ash-road', 'Ash Road', 'Camino de ceniza', { series: 'Ash', order: { recommended: 1, publication: 1 } }),
      book('glass-harbour', 'Glass Harbour', 'Puerto de cristal', {
        format: 'novella',
        pages: 120,
        order: { recommended: 2, publication: 3 },
      }),
      book('salt-and-lantern', 'Salt and Lantern', 'Sal y farol', {
        format: 'anthology',
        order: { recommended: 3, publication: 4 },
      }),
      book('lantern-keeper', 'The Lantern Keeper', null, {
        format: 'short',
        pages: 30,
        containedIn: ['salt-and-lantern'],
        order: { recommended: 4, publication: 4 },
      }),
      book('copper-orchard', 'Copper Orchard', 'Huerto de cobre', {
        world: 'scadrial',
        series: 'Orchard',
        order: { recommended: 5, publication: 2 },
      }),
      book('orchard-dusk', 'Orchard Dusk', 'Ocaso del huerto', {
        world: 'scadrial',
        series: 'Orchard',
        format: 'novella',
        order: { recommended: 6, publication: 5 },
      }),
      book('paper-wolves', 'Paper Wolves', null, {
        world: 'scadrial',
        format: 'rpg',
        order: { recommended: 7, publication: 6 },
      }),
      book('northern-gale', 'Northern Gale', 'Vendaval del norte', {
        world: 'nalthis',
        order: { recommended: 8, publication: 7 },
      }),
      book('long-title-book', LONG_TITLE, null, {
        world: 'nalthis',
        order: { recommended: 9, publication: 8 },
      }),
      book('low-tide-atlas', 'Low Tide Atlas', null, {
        world: 'nalthis',
        status: 'announced',
        pages: undefined,
        year: undefined,
        order: {},
        phase: null,
      }),
    ],
    connections: [
      connection('c-0001', {}),
      connection('c-0002', {
        from: 'glass-harbour',
        to: 'northern-gale',
        type: 'significant',
        requires: ['glass-harbour', 'northern-gale', 'copper-orchard'],
      }),
      connection('c-0003', {
        from: 'orchard-dusk',
        to: 'northern-gale',
        type: 'minor',
        tier: 'theory',
        requires: ['orchard-dusk', 'northern-gale'],
        sources: [{ url: 'https://wiki-one.example.test/p', kind: 'wiki' }],
      }),
      connection('c-0004', {
        from: 'ash-road',
        to: null,
        type: 'appearance',
        requires: ['ash-road'],
        sources: [{ url: 'https://official.example.test/p', kind: 'official' }],
      }),
      connection('c-0005', {
        from: 'glass-harbour',
        to: 'copper-orchard',
        type: 'minor',
        requires: ['glass-harbour', 'copper-orchard'],
        sources: [
          { url: 'https://wiki-one.example.test/p', kind: 'wiki' },
          { url: 'https://wiki-two.sample.test/p', kind: 'wiki' },
        ],
      }),
    ],
    meta: { updatedOn: '2026-11-04' },
  }
}
