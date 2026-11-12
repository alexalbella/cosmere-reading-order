# Data

Everything the site shows comes from plain JSON in `data/`. `npm run dev` and `npm run build` turn it into `public/data/` (generated, ignored by git) after validating it. You can edit every file by hand; `npm run validate:data` tells you what is wrong, by code and id.

> **Spoilers.** `data/connections/`, `data/synopses/`, `data/notes/` and their built files in `public/data/` say which works connect and how, what happens in them, and what the author said about them. If you are still reading, do not open them. `data/books.json`, `data/meta.json`, `data/structure.json` and `data/public-facts.json` hold public facts only and are safe to read.

## Files

| File | What it holds | Edited by hand? |
| --- | --- | --- |
| `data/books.json` | Every work, with its public facts (see «Book»). | Yes, or through `apply-structure` |
| `data/meta.json` | `{ "updatedOn": "YYYY-MM-DD" }`, the date the footer shows. | Yes |
| `data/connections/*.json` | Batches of connections (see «Connection»). Any number of files; each is an array. | Yes |
| `data/synopses/*.json` | Batches of synopses (see «Synopsis»). Any number of files; each is an array. | Yes |
| `data/notes/*.json` | Batches of notes (see «Note»). Any number of files; each is an array. | Yes |
| `data/structure.json` | Worlds, star systems, series, the map's tree and seats, layers and legend, with their sources. | Yes |
| `data/public-facts.json` | Each work's researched public facts, keyed by book id, with sources. | Yes |
| `public/data/*.json` | Built from the above by `scripts/build-data.ts`. | No |

`npx tsx scripts/apply-structure.ts` folds `structure.json` and `public-facts.json` into `books.json`: world, series, part, number, first publication, word count, Spanish publisher, the seat on the map, and the plate facts of works not yet published, apocryphal works and role-playing books (below). A plate fact given as `null` in `public-facts.json` removes the field. It never changes a status, a reading order or a page count the catalogue already has, and prints counts only.

## Book

Lists of allowed values live in `src/data/types.ts` (`WORLD_KEYS`, `FORMATS`, `BOOK_STATUSES`, `ES_EDITION_STATUSES`, `ORDER_KEYS`, `WRITING_STAGES`, `APOCRYPHAL_REASONS`, `RPG_KINDS`, `CANON_VALUES`); every type derives from those lists.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable slug. Never reuse or rename one without an alias (below). |
| `titles.en` | string | English title. Required. |
| `titles.es` | string \| null | Title of the edition published in Spain, `null` when there is none. |
| `esEdition.status` | `published` \| `announced` \| `none` \| `unknown` | State of the Spanish edition. |
| `esEdition.source` | url | Where the Spanish edition is shown. Required when `published`. |
| `esEdition.in` | book id | The Spanish volume that carries it, when that differs from the English. |
| `esEdition.publisher`, `.year`, `.pages` | string, number, number | Spanish edition details, optional. |
| `world` | world key | The work's world, or `otros` («several, or not announced»). Public fact only: when in doubt, `otros`. |
| `series` | string \| null | Series name. |
| `subseries` | string \| null | The part of the series, when it has parts. |
| `seriesIndex` | number | Its number inside that series or part, in order of release. |
| `format` | `novel` \| `novella` \| `short` \| `comic` \| `illustrated` \| `anthology` \| `rpg` \| `essay` | |
| `status` | `published` \| `announced` \| `planned` \| `apocryphal` | Announced and planned works carry no invented dates. |
| `order` | `{ recommended?: number, publication?: number }` | Positions in each reading order. Published works need both. |
| `phase` | number \| null | Stage of the recommended order. |
| `pages`, `words` | number | Optional counts. |
| `year`, `publication` | number, `YYYY` \| `YYYY-MM` \| `YYYY-MM-DD` | First publication. |
| `readFree` | url | Where the author lets it be read for free. |
| `place` | number | Seat on the map of worlds, clockwise. |
| `aside` | boolean | A story told beside the main run of its series: the map sets it a step back. |
| `containedIn` | book id[] | Volumes that carry it (an anthology and each of its stories have their own entries). |
| `aliases` | book id[] | Old ids of this work, so stored read marks follow a rename. |
| `addedOn` | `YYYY-MM-DD` | When it entered the catalogue; drives the «new» marker for 60 days. |

#### Plate facts for works not yet published, apocryphal works and role-playing books

All optional. Each is a list value or a link, never free text, so a fact cannot carry plot, and each names its source as an https link. On an announced or planned work the plate keeps the row and says «Por anunciar» / «To be announced» when the fact is missing; on other works a missing fact takes no row.

| Field | Type | Meaning |
| --- | --- | --- |
| `writing` | `{ stage, percent?, source, asOf }` | How far the writing has gone. `stage` is `idea`, `drafting`, `revising` or `done`; `percent` 0-100 from the author's progress reports; `asOf` a date. |
| `expected` | `{ when, official, source }` | An official date or the window the author gave: `2027`, `2027-03`, `2027-03-15`, `2027-H2` or `2027-Q4`. `official: false` reads as an estimate. Announced and planned works still never carry a `year`. |
| `announcedIn` | https url | Where the work was announced. |
| `apocryphal` | `{ reason, source }` | Why it is apocryphal: `not-canon`, `parody`, `superseded` or `unfinished`. |
| `publisher`, `line` | string | Publisher and product line (role-playing books; `publisher` also says where an apocryphal work appeared). |
| `rpgKind` | `core` \| `world-guide` \| `adventure` \| `supplement` \| `screen` \| `starter` | Kind of role-playing book. |
| `crowdfunding` | https url | The crowdfunding campaign. |
| `canon` | `{ value, source }` | Whether a role-playing book is canon: `yes`, `partly`, `no` or `unknown`. |

### Adding a work by hand

1. Add an entry to `data/books.json` with at least `id`, `titles`, `esEdition`, `world`, `series`, `format`, `status`, `order` and `phase`. An invented example:

   ```json
   {
     "id": "glass-harbour",
     "titles": { "en": "Glass Harbour", "es": null },
     "esEdition": { "status": "unknown" },
     "world": "otros",
     "series": null,
     "format": "novella",
     "status": "announced",
     "order": {},
     "phase": null,
     "addedOn": "2026-12-01"
   }
   ```

2. If you know its public facts and setting, add them to `data/public-facts.json` with a `source` list and run `npx tsx scripts/apply-structure.ts`.
3. Run `npm run validate:data`.

## Connection

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `c-0000` | Opaque, four digits, unique. Never reveals its ends. |
| `from` | book id | One end. |
| `to` | book id \| null | The other end; `null` for an appearance marker (then `type` is `appearance`). |
| `type` | `major` \| `significant` \| `minor` \| `egg` \| `appearance` | Weight of the link. `egg` is an easter egg. |
| `tier` | `confirmed` \| `theory` | Theories are off by default on the site. |
| `description.en`, `description.es` | string | What the link is, in both languages, in your own words. |
| `requires` | book id[] | Every work that must be read before this shows. Always contains both ends; add any other work the description gives away. |
| `sources` | `{ url, kind, cites? }[]` | At least one. `kind` is `upstream`, `word-of-brandon`, `official`, `wiki`, `video` or `forum`. `cites` names the chapter or passage a wiki page cites. |
| `author` | string | Who wrote the entry. `upstream` only for entries migrated from 17thshard/reading-order. |
| `verifiedBy` | string | Who checked it. Must differ from `author`. |
| `verifiedOn` | `YYYY-MM-DD` | When it was checked. |

**Source rule for `confirmed`:** an entry migrated from upstream keeps `kind: upstream`; a new one needs one primary source (`word-of-brandon` or `official`), or a `wiki` source with a non-blank `cites`, or two wiki sources on different sites. Anything weaker must be `tier: "theory"`, with a source that reasons from the text. Rumour threads do not count.

### Adding a connection by hand

Add it to any file in `data/connections/` (or a new `batch-NNN.json`), with the next free id. An invented example:

```json
{
  "id": "c-0901",
  "from": "ash-road",
  "to": "glass-harbour",
  "type": "minor",
  "tier": "confirmed",
  "description": { "en": "…", "es": "…" },
  "requires": ["ash-road", "glass-harbour"],
  "sources": [{ "url": "https://example.org/…", "kind": "word-of-brandon" }],
  "author": "your-name",
  "verifiedBy": "someone-else",
  "verifiedOn": "2026-12-01"
}
```

## Synopsis

One per work, in our own words: never a publisher's blurb, never text copied or closely paraphrased from a source. For a role-playing book, what the book contains.

| Field | Type | Meaning |
| --- | --- | --- |
| `book` | book id | The work. One synopsis per work: two for one work hide both. |
| `text.en`, `text.es` | string | The synopsis in both languages. |
| `requires` | book id[] | The works it would spoil. **Only earlier works of the same series** (earlier by `order.publication`), never another series and never the work itself, so a locked synopsis never tells a reader that two series are linked. |
| `open` | `true` | Instead of `requires`, for a synopsis that waits for nothing: the first work of the whole series by `order.publication` (not the first of a part), or a work with no series (which must be open). Where the order is not known, it cannot be open. |
| `sources`, `author`, `verifiedBy`, `verifiedOn` | | As for connections, except that `kind: upstream` is never allowed. |

Exactly one of `open: true` or a non-empty `requires`. An empty `requires` without `open` hides the synopsis, like an empty `requires` hides a connection. The plate says one of three things: the folded synopsis, opened on request; the same line on every work saying it opens once the earlier works of its series are read; or «Sin sinopsis todavía» / «No synopsis yet».

### Adding a synopsis by hand

Add it to any file in `data/synopses/` (or a new `batch-NNN.json`). An invented example, for the second work of a series:

```json
{
  "book": "orchard-dusk",
  "text": { "en": "…", "es": "…" },
  "requires": ["copper-orchard"],
  "sources": [{ "url": "https://example.org/…", "kind": "official" }],
  "author": "your-name",
  "verifiedBy": "someone-else",
  "verifiedOn": "2026-12-01"
}
```

## Note

What hangs on one or more works without linking two of them (a link between two works is a connection): a Word of Brandon, an easter egg, a confirmed theory or a relation. Confirmed content only.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `n-0000` | Opaque, four digits, unique. |
| `kind` | `wob` \| `egg` \| `confirmed-theory` \| `relation` | |
| `books` | book id[] | The works it hangs on, at least one. |
| `text.en`, `text.es` | string | The note, in our own words. |
| `quote.en`, `quote.es` | string | For a `wob`: the literal English quote and our Spanish translation. Required on a `wob`. |
| `requires` | book id[] | Every work in `books`, and any other work the note gives away. |
| `sources`, `author`, `verifiedBy`, `verifiedOn` | | As for connections, never `kind: upstream`. A `wob` or `confirmed-theory` needs a `word-of-brandon` or `official` source; an `egg` or `relation` meets the source rule for `confirmed` connections. |

A note shows only when every work in `requires` is read or unlocked, with its text folded until asked for. A hidden note leaves no trace: no count per work, no empty section.

### Adding a note by hand

Add it to any file in `data/notes/` (or a new `batch-NNN.json`), with the next free id. An invented example:

```json
{
  "id": "n-0042",
  "kind": "wob",
  "books": ["ash-road"],
  "text": { "en": "…", "es": "…" },
  "quote": { "en": "…", "es": "…" },
  "requires": ["ash-road"],
  "sources": [{ "url": "https://example.org/…", "kind": "word-of-brandon" }],
  "author": "your-name",
  "verifiedBy": "someone-else",
  "verifiedOn": "2026-12-01"
}
```

## Validating

```bash
npm run validate:data                         # the whole catalogue
npm run validate:data -- --against origin/main  # also fail if a work that existed there is gone
npm run validate:data -- --prune              # move broken connections, synopses and notes out instead of failing
npm run validate:data -- --prune --quarantine <dir>   # where they go; default .quarantine/ (ignored)
```

Output is one line per problem, `CODE id`, never content. A synopsis is named `syn:<book>`, a note by its id. An entry that is not even an object, or whose id is malformed, is named by position (`conn#3`, `syn#3`, `note#3`). `--prune` drops only connections, synopses and notes, never a book; it writes them first to `<dir>/YYYY-MM-DD.json`, `<dir>/synopses-YYYY-MM-DD.json` and `<dir>/notes-YYYY-MM-DD.json`, and writes nothing at all if the run would still fail. The CI runs the validator with `--against` on every push.

### Problem codes

| Code | Meaning |
| --- | --- |
| `BAD_ID` | An id is not well formed (`c-0000` for connections, `n-0000` for notes, a slug for books). |
| `DUPLICATE_ID` | Two entries share an id, or two synopses share a work. |
| `NOT_AN_OBJECT` | An entry is not a JSON object. |
| `REF_UNKNOWN` | A connection, synopsis or note names a book id the catalogue does not have. |
| `REQUIRES_MISSING_END` | `requires` lacks `from` or `to`. |
| `SELF_LOOP` | `from` equals `to`. |
| `APPEARANCE_MISMATCH` | `to: null` without `type: appearance`, or the reverse. |
| `NO_SOURCE` | No source. |
| `BAD_SOURCE_URL` | A source url is not http(s). |
| `CONFIRMED_WEAK_SOURCE` | `confirmed` without a source strong enough (see the rule above). |
| `UPSTREAM_SOURCE_ON_NEW` | `kind: upstream` on an entry whose author is not `upstream`, or on any synopsis or note. |
| `NO_AUTHOR` | Blank author. |
| `UNVERIFIED` | No verifier or no verification date. |
| `BAD_DATE` | A date that is not a real calendar date. |
| `SELF_VERIFIED` | The verifier is the author. |
| `MISSING_LANGUAGE` | A description, synopsis or note lacks English or Spanish. |
| `NO_ENGLISH_TITLE` | A book without `titles.en`. |
| `ANNOUNCED_WITH_DATE` | An announced or planned work carries a `year`. |
| `MISSING_ORDER` | A published work lacks a position in an order. |
| `ES_TITLE_MISSING` | A published Spanish edition with neither `titles.es` nor `esEdition.in`. |
| `ES_SOURCE_MISSING` | A published Spanish edition without a source. |
| `UNKNOWN_WORLD` | A world key not in `WORLD_KEYS`. |
| `BOOK_REMOVED` | With `--against`: a work that existed there is gone. |
| `BAD_ENUM` | A value outside its list. |
| `BAD_FIELD` | A field of the wrong type. |
| `BAD_ALIAS` | `aliases` is not a list, or holds a malformed id, a current id or an alias used twice. |
| `ALIAS_MISMATCH` | With `--against`: a removed work's heir (the work holding its id as an alias) has another format or world. |
| `EMPTY_CATALOGUE` | No books at all. |
| `BAD_META` | `data/meta.json` is malformed. |
| `SYNOPSIS_OUTSIDE_SERIES` | A synopsis requires a work of another series. |
| `SYNOPSIS_NOT_GATED` | A synopsis has neither `open: true` nor a non-empty `requires`. |
| `SYNOPSIS_OPEN_AND_REQUIRES` | A synopsis has both. |
| `SYNOPSIS_OPEN_LATER` | `open: true` on a work that is not the first of its whole series by `order.publication`, or whose place there is not known. |
| `SYNOPSIS_NO_SERIES_NOT_OPEN` | A work with no series whose synopsis is not open. |
| `SYNOPSIS_REQUIRES_NOT_EARLIER` | A synopsis requires its own work, a later work of its series, or one whose place is not known. |
| `NOTE_NO_BOOKS` | A note hangs on no work. |
| `NOTE_REQUIRES_MISSING_BOOK` | A note's `requires` lacks one of its `books`. |
| `NOTE_QUOTE_MISSING` | A `wob` without its quote in both languages. |
| `NOTE_WEAK_SOURCE` | A `wob` or `confirmed-theory` without a `word-of-brandon` or `official` source, or an `egg` or `relation` below the rule for `confirmed`. |

The full list is `PROBLEM_CODES` in `src/data/types.ts`; the checks live in `src/data/soundness.ts` (one connection, synopsis or note) and `src/data/validate.ts` (the catalogue). The site uses the same checks at runtime, so anything the validator rejects is also hidden on screen.

## Migrating from upstream

`npx tsx scripts/migrate-upstream.ts [--dry-run] [--force] [--id-map <file>]` reads 17thshard/reading-order's `public/data.json` from the `upstream` remote and writes `data/connections/batch-000.json`. `--id-map` takes a JSON object of extra renames (old id to new id). It prints counts only.
