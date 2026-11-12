# Design

A short guide to the design system as it stands. It will be rewritten after the next visual pass.

## The idea

The site is a bound volume whose cover is a map of the Cosmere. Each world is a dyed leather and a land on the rim of the ring, with its name and its colour. Your reading is the gold stamped on the map. The finished state is always the base state: motion only adds.

Three views share one catalogue:

- **Mapa:** the ring by world and series, titles radiating from the Cosmere seal, world bands and names along the rim. `src/views/CircleView.vue`, geometry in `src/views/circle.ts`, zoom in `src/views/panZoom.ts`.
- **Orden:** the same ring laid out in the reading order, gathered by phase.
- **Estantería:** the list, spines on boards (PC) or laid flat in a pile (phone). It is also the accessible alternative to the ring. `src/views/ShelfView.vue`.

Other pieces: the sentence («Estás leyendo… Sigue por…», `NextSentence.vue`), the plate of the selected work (`BookPlate.vue`), the panels (filters, settings, spoilers, the key «Cómo se lee»), the spine strip with the seal and progress (`SpineStrip.vue`).

## Colour

- **One leather per world**, fifteen in all, each with seven colours derived from one hue: field, deep, blind (unread stamp), secondary text, tone (band and dot), ink (a read title) and ink-unread. They live in `src/design/worlds.ts` and `src/design/tokens.css`; `tests/unit/tokens.test.ts` keeps them in step. `otros` («several or unknown») is slate.
- **Gold** is the read mark and the binder's ornament (frames, labels, controls, the seal). On the ring it never colours a title: a read title is its world's ink, brighter and heavier.
- **Never colour alone.** Every state has a second sign: hollow or filled dot, weight, the ribbon for the book in progress, italic for skipped, underline for selected, a dashed line for a theory.
- **Contrast:** text at 4.5:1 or better, measured against the darkest and lightest pixel of the grain behind it. A title ink must pass on every leather, because a title sits on the current book's leather, not its own.

## Type

Three faces, self-hosted under the SIL Open Font License (`public/fonts/`): **Marcellus** names things (site name, titles), **Alegreya** reads (running text, ring titles), **Alegreya SC** labels (tabs, facts, world names on the rim). No fourth face, no font CDN. A land is named in small capitals, a series or phase in italic.

## Motion

- **The stamp:** marking a work read presses the title in and flashes the foil (640 ms); newly unlocked lines draw out from it.
- **The travel:** switching Mapa and Orden, or changing a filter, eases every book to its new place (900 ms).
- **The glint:** one pass of light along the lines of the selected work.
- **The hover dim:** resting on a work dims what it is not joined to, only through lines already drawn.

Every animation sits under `prefers-reduced-motion: no-preference`; with reduce, everything is instant. No animation may touch, hint at or leave a trace of hidden content (see `SPOILERS.md`).

## Layout and touch

- Layout derives only from public facts, so a work never moves when it is read.
- Every control is at least 44 px.
- The phone is a first-class surface: the ring turns titles into ticks and shows the touched one, and the plate opens over it.

## Imagery

No official Dragonsteel image, cover, map or illustration is in the repository. The seal and every texture are made here; the leather grain comes from `scripts/make-grain.ts` with fixed seeds.
