# Data

Everything the site shows comes from plain JSON in `data/`. `npm run dev` and `npm run build` turn it into `public/data/` (generated, ignored by git) after validating it. You can edit every file by hand; `npm run validate:data` tells you what is wrong, by code and id.

> **Spoilers.** `data/connections/` and `public/data/connections.json` say which works connect and how. If you are still reading, do not open them. `data/books.json`, `data/meta.json`, `data/structure.json` and `data/public-facts.json` hold public facts only and are safe to read.

## Files

| File | What it holds | Edited by hand? |
| --- | --- | --- |
| `data/books.json` | Every work, with its public facts (see «Book»). | Yes, or through `apply-structure` |
| `data/meta.json` | `{ "updatedOn": "YYYY-MM-DD" }`, the date the footer shows. | Yes |
| `data/connections/*.json` | Batches of connections (see «Connection»). Any number of files; each is an array. | Yes |
| `data/structure.json` | Worlds, star systems, series, the map's tree and seats, layers and legend, with their sources. | Yes |
| `data/public-facts.json` | Each work's researched public facts, keyed by book id, with sources. | Yes |
| `public/data/*.json` | Built from the above by `scripts/build-data.ts`. | No |

`npx tsx scripts/apply-structure.ts` folds `structure.json` and `public-facts.json` into `books.json`: world, series, part, number, first publication, word count, Spanish publisher and the seat on the map. It never changes a status, a reading order or a page count the catalogue already has, and prints counts only.

## Book

Lists of allowed values live in `src/data/types.ts` (`WORLD_KEYS`, `FORMATS`, `BOOK_STATUSES`, `ES_EDITION_STATUSES`, `ORDER_KEYS`); every type derives from those lists.

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

## Validating

```bash
npm run validate:data                         # the whole catalogue
npm run validate:data -- --against origin/main  # also fail if a work that existed there is gone
npm run validate:data -- --prune              # move broken connections out instead of failing
npm run validate:data -- --prune --quarantine <dir>   # where they go; default .quarantine/ (ignored)
```

Output is one line per problem, `CODE id`, never content. A connection that is not even an object is named by position (`conn#3`). `--prune` drops only connections, writes them to `<dir>/YYYY-MM-DD.json` first, and writes nothing at all if the run would still fail. The CI runs the validator with `--against` on every push.

### Problem codes

| Code | Meaning |
| --- | --- |
| `BAD_ID` | An id is not well formed (`c-0000` for connections, a slug for books). |
| `DUPLICATE_ID` | Two entries share an id. |
| `NOT_AN_OBJECT` | An entry is not a JSON object. |
| `REF_UNKNOWN` | A connection names a book id the catalogue does not have. |
| `REQUIRES_MISSING_END` | `requires` lacks `from` or `to`. |
| `SELF_LOOP` | `from` equals `to`. |
| `APPEARANCE_MISMATCH` | `to: null` without `type: appearance`, or the reverse. |
| `NO_SOURCE` | No source. |
| `BAD_SOURCE_URL` | A source url is not http(s). |
| `CONFIRMED_WEAK_SOURCE` | `confirmed` without a source strong enough (see the rule above). |
| `UPSTREAM_SOURCE_ON_NEW` | `kind: upstream` on an entry whose author is not `upstream`. |
| `NO_AUTHOR` | Blank author. |
| `UNVERIFIED` | No verifier or no verification date. |
| `BAD_DATE` | A date that is not a real calendar date. |
| `SELF_VERIFIED` | The verifier is the author. |
| `MISSING_LANGUAGE` | A description lacks English or Spanish. |
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

The full list is `PROBLEM_CODES` in `src/data/types.ts`; the checks live in `src/data/soundness.ts` (one connection) and `src/data/validate.ts` (the catalogue). The site uses the same checks at runtime, so anything the validator rejects is also hidden on screen.

## Migrating from upstream

`npx tsx scripts/migrate-upstream.ts [--dry-run] [--force] [--id-map <file>]` reads 17thshard/reading-order's `public/data.json` from the `upstream` remote and writes `data/connections/batch-000.json`. `--id-map` takes a JSON object of extra renames (old id to new id). It prints counts only.
