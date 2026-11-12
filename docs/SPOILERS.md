# Spoiler rules

The site is for people reading the Cosmere in order. Its one promise: **nothing about a work you have not read reaches the screen**, unless you unlock that work by hand. When in doubt, the code hides.

Each rule below is a guarantee of the code, followed by the tests that prove it. If you change the code, these tests are the ones that must stay green.

## 1. One path from data to the screen

`visible(catalog, marks, unlocks)` in `src/spoilers/visible.ts` is a pure function and the only way connection data reaches a component; `synopsisFor` and `visibleNotes`, beside it, do the same for synopses and notes. Nothing outside `src/spoilers/`, `src/data/` and `src/app/useApp.ts` may touch `.connections`, `.synopses` or `.notes`.

- `tests/unit/architecture.test.ts`: «nothing outside the engine, the data layer and useApp touches .connections, .synopses or .notes»
- `tests/unit/visible.test.ts`: «is pure: same answer twice, inputs untouched»
- `tests/unit/visible-content.test.ts`: «is pure: the same answer twice, and the inputs untouched»

## 2. A connection shows only when everything it requires is read

Every connection carries a `requires` list. It always holds both ends, and may hold more, because a note can give away a third work. A connection is drawn and explained only when every id in `requires` is marked read or unlocked. «Reading» and «skipped» do not count as read.

- `tests/unit/visible.test.ts`: «shows nothing with nothing read», «shows a connection when both ends are read», «one end read hides it», «a third requirement hides it until read», «reading and skipped do not count as read», «an unlocked book counts as read, other requirements still apply»

## 3. Fail closed

A connection with a missing or malformed field (`requires`, sources, author, verification, either language) is never shown. A wrong or missing field hides; it never shows. An id carried twice hides every entry carrying it. Nothing throws.

- `tests/unit/visible.test.ts`: «each missing field hides it», «a duplicated id hides every entry that carries it», «a sparse requires fails closed with nothing read», «a book gone from the catalogue hides what requires it, read or not»
- `tests/unit/soundness.test.ts`: «never throws, never passes, and only ever returns listed codes, whatever the entry», «one field replaced by anything: no throw, and the engine and the validator agree»

## 4. A hidden connection leaves no trace

No line, no count per work, no gap in the layout, no entry in the DOM, no dimming. The only number ever shown is the global count of visible connections. While the connections file is still loading, or if it fails, the page is the one an empty file would give.

- `e2e/leak.spec.ts`: «no hidden connection reaches the page», «no number anywhere derives from hidden connections», «the filters panel shows no number derived from connections»
- `tests/unit/plate.test.ts`: «a plate never shows a count of hidden connections»
- `e2e/late-connections.spec.ts`: «on their way, the page is exactly the one an empty file gives», «the books are up while the connections are on their way, with no trace of them»

## 5. Public facts only, and a work never moves

A work shows the same public facts whether it is read or not: title, Spanish edition, format, pages and words, first publication, series and number, phase, position, world and star system, and an official link to read it for free. Works not yet published, apocryphal works and role-playing books add facts that are list values or links, never free text (writing stage, expected date, why it is apocryphal, kind of book, canon). No publisher blurb: synopses are our own, and follow rule 11. Layout uses only these facts, so marking a work read, or a file arriving late, never moves it.

- `tests/unit/plate.test.ts`: «the plate gives every book the same anatomy, with public facts only», «an unread book's plate contains no LEAK marker», «an announced work shows every planned row, with «Por anunciar» where empty»
- `tests/unit/validate.test.ts`: «a writing stage outside the list», «an apocryphal reason outside the list», «a canon value outside the list»
- `tests/unit/circle.test.ts`: «a book never moves when read», «a book never moves on the map when read»
- `e2e/late-connections.spec.ts`: «a failed file moves no book»

## 6. Appearance markers follow the same rule, and start off

A marker with one end (a character or object turning up in a work) is a connection with `to: null`. It follows rule 2 and its type is off by default.

- `e2e/leak.spec.ts`: «an appearance marker follows its requirements, and the type filter», «an appearance marker stays hidden when its type is filtered out»
- `tests/unit/filters.test.ts`: «defaults: statuses is exactly ['published'], connectionTypes exactly ['major','significant'], theories false»

## 7. Theories start off

Connections marked `tier: "theory"` are off by default. Turning them on changes nothing about rules 2-4.

- `tests/unit/filters.test.ts`: «theories false removes theory tier»
- `e2e/leak.spec.ts`: «a read theory: text only on request and only with theories on»

## 8. Unlocking is per work, apart, confirmed and undoable

You can unlock one work by hand, which counts it as read for rule 2. The control sits apart from every other control, asks first, and can be undone. There is no per-connection unlock: a hidden connection leaves nothing to select.

- `tests/unit/plate.test.ts`: «unlock asks first and sits apart»
- `e2e/flows.spec.ts`: «unlock, confirm, undo»
- `e2e/finish.spec.ts`: «declining an unlock goes back to the button that asked»
- `tests/unit/visible.test.ts`: «an unlock turned off counts for nothing»

## 9. Addresses and stored settings never show more

No URL parameter and no stored setting can show more than these rules allow. Corrupt or foreign stored values are dropped.

- `e2e/leak.spec.ts`: «URL parameters reveal nothing»
- `tests/unit/recent-prefs.test.ts`: «corrupt or foreign values are dropped one by one»

## 10. Nothing happens by accident

Tapping a work only selects it. Marking is a separate button on its plate, with an immediate undo. Lines draw when a work is marked, but a connection's text opens only on request.

- `e2e/leak.spec.ts`: «click or tap on a book», «connection text is absent from the DOM until requested, even with everything read»
- `tests/unit/plate.test.ts`: «marking a plain book stamps it and offers the undo in the same place», «connection text appears only after asking»

## 11. A synopsis waits for the earlier works of its own series

Every work may have a synopsis in our own words. It waits only on works of its own series, never on another series, so a locked synopsis never tells you that two series are linked; a series opener or a work with no series is open. A synopsis that is malformed, or whose work has two, is treated as missing, so its requirements leave no trace. On the plate it is folded and its text enters the page only when asked for; a locked one says the same line on every work.

- `tests/unit/content-soundness.test.ts`: «a required work of another series», «a work with no series that is not open», «open on a later work of its series»
- `tests/unit/visible-content.test.ts`: «a gated synopsis is gated until its earlier work is read, then visible», «an unsound synopsis is missing, never gated», «two synopses for one book: missing»
- `tests/unit/plate.test.ts`: «a visible synopsis is folded and its text is absent until asked», «a gated synopsis says the same line on every work and names no other work»
- `e2e/leak.spec.ts`: «no gated synopsis text or hidden note reaches the page»

## 12. Notes follow the rules of connections

A note (a Word of Brandon, an easter egg, a confirmed theory, a relation) hangs on one or more works, and its `requires` holds all of them and any other work it gives away. It shows only when every one is read or unlocked; a malformed note, or an id carried twice, hides. A hidden note leaves no trace: no count, no empty section. Its text opens only on request. While the files are loading, or if one fails, nothing of it shows.

- `tests/unit/content-soundness.test.ts`: «requires holds every work it hangs on», «a Word of Brandon needs a primary source»
- `tests/unit/visible-content.test.ts`: «a note shows only when every requirement is read», «an id carried twice hides every note that carries it»
- `tests/unit/useApp.test.ts`: «while pending, every synopsis is missing and no note shows», «a failed file hides its own records, and the rest works»
- `tests/unit/plate.test.ts`: «no notes section without a visible note», «a note's text appears only after asking»
- `e2e/leak.spec.ts`: «a note shows once its works are read, and its text only on request», «URL parameters reveal no synopsis or note»

## What this does not protect against

The data files are public: anyone who opens `data/connections/`, `data/synopses/` or `data/notes/` can read every entry. The rules protect against accidents, not curiosity. If you work on the data and are still reading, do not open those folders; `.ignore` keeps ripgrep out of them.

Tests use invented titles in `tests/fixtures/`, never real data, so a test log cannot spoil anything.
