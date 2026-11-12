# Provenance of the imagery

Every drawing in `svg/` was drawn from scratch as original, hand-written SVG code by an AI model (Fable 5.2) for this unofficial, non-commercial fan site. No official artwork was used as a source or a reference: no book covers, no official maps, no in-world glyphs or symbol systems, and not the official Cosmere symbol. Each world emblem uses only a generic motif suggested by public titles and world names, inside a shared double-ring medallion.

The files hold no text, no raster images, no fonts and no links to anything outside them (a test checks this). Every piece is tinted through `currentColor`; the cover template uses the CSS variables `--field` and `--foil`, and the progress template `--progress-on`.

| Files | What they are |
| --- | --- |
| `emblem-<world>.svg` | One emblem per world key in `src/data/types.ts`, viewBox `0 0 64 64`. |
| `format-<format>.svg` | One icon per format, viewBox `0 0 24 24`, strokes only. |
| `status-<status>.svg` | One icon per publication status, viewBox `0 0 24 24`. |
| `cover-template.svg` | The «uniform edition» cover, viewBox `0 0 200 300`, built into `CoverThumb.vue`. |
| `public/seal.svg`, `public/seal-small.svg` | The site's seal, an astrolabe, and its simplified cut for 16-34 px (favicon, the phone's header). Fills only, used as a CSS mask; `scripts/make-icons.ts` renders the app icons from them. |
| `progress-template.svg` | The writing progress mark for works not yet published, viewBox `0 0 120 16`, built into `ProgressMark.vue`. |

`npx tsx scripts/make-sprite.ts` turns the emblems and icons into `SpriteSheet.vue`, which the page loads after its first paint and uses through `<use href="#emblem-<world>">`.
