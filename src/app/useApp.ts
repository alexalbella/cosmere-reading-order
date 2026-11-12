import { computed, onScopeDispose, ref, shallowRef, watch, type ComputedRef, type Ref } from 'vue'
import { loadBooks, loadConnections, loadMeta } from '../data/load'
import type { Book, BookId, Catalog, Connection, OrderKey, WorldKey } from '../data/types'
import { defaultFilters, filterBooks, filterConnections, type Filters } from '../filters/filters'
import type { Lang } from '../i18n'
import { applyMark, restoreMarks, setUnlock, worksCarriedBy } from '../reading/marks'
import { counts, current, gaps, next, type NextOptions } from '../reading/next'
import { statusOf } from '../reading/status'
import { visible, type Marks, type MarkStatus } from '../spoilers/visible'
import { build, clampFuture, mergeState, ownEntries, sameState, type ReadState } from '../state/merge'
import { loadPrefs, savePrefs, type View } from '../state/prefs'
import { rekeyState } from '../state/rekey'
import { loadState, saveState, STATE_KEY } from '../state/store'
import { exportState, MAX_STATE_BYTES, parseImport } from '../state/transfer'
import { createSyncLoop } from '../sync/client'
import { afterFirstPaint } from './afterFirstPaint'
import { WIDE_QUERY } from './viewport'
import type { SyncStatus } from '../sync/status'

const UNDO_MS = 8000
const STAMP_MS = 1400

/** Where the connections file stands. While it is not `available` there are none, so nothing can be shown. */
export type ConnectionsState = 'pending' | 'available' | 'failed'

export type ImportOutcome =
  | { ok: true; marked: number; unlocked: number; unknown: number }
  | { ok: false; cancelled?: true }

/** An import read but not yet applied. */
export interface ImportPlan {
  /** The books this file would unlock that are not unlocked now. */
  newUnlocks: Book[]
  /** Unlocks it would turn on for books this catalogue does not have. */
  unknownUnlocks: number
  apply(withUnlocks: boolean): ImportOutcome
}

export interface LastChange {
  /** The book the change is about: the one whose plate offers the undo. */
  primaryId: BookId
  status: MarkStatus
  /** The marks as they were, for every book the change touched. */
  previous: Marks
}

export interface UseAppOptions {
  /** A catalogue to start from. Without one the app fetches it. */
  initial?: { catalog: Catalog; connectionsAvailable: boolean }
  fetchFn?: typeof fetch
  storage?: Storage
  now?: () => number
  /** Keep the read state in step with the other tabs and devices. The page asks for it; an app built for a test stays quiet. */
  sync?: boolean
}

function defaultView(): View {
  const wide = typeof matchMedia === 'function' && matchMedia(WIDE_QUERY).matches
  return wide ? 'map' : 'shelf'
}

export function useApp(options: UseAppOptions = {}): UseAppResult {
  const now = options.now ?? (() => Date.now())
  const prefs = loadPrefs(options.storage)

  const catalog: Ref<Catalog | null> = shallowRef(options.initial?.catalog ?? null)
  const connectionsState = ref<ConnectionsState>(
    options.initial ? (options.initial.connectionsAvailable ? 'available' : 'failed') : 'pending',
  )
  const status = ref<'loading' | 'ready' | 'failed'>(options.initial ? 'ready' : 'loading')

  // The state is replaced as a whole, never written in place: `Object.hasOwn` on a reactive
  // proxy tracks nothing, and a computed around `visible` would go stale.
  const loaded = loadState(options.storage)
  const state = shallowRef<ReadState>(loaded.state)
  /** The saved list could not be read: a copy was kept under cosmere.state.corrupt. */
  const stateCorrupt = ref(loaded.corrupt)
  const lang = ref<Lang>(prefs.lang ?? 'es')
  const view = ref<View>(prefs.view ?? defaultView())
  const order = ref<OrderKey>(prefs.order ?? 'recommended')
  const filters = ref<Filters>(prefs.filters ?? defaultFilters())
  const selectedId = ref<BookId | null>(null)
  const stampedId = ref<BookId | null>(null)
  const freshConnectionIds = ref<ReadonlySet<string>>(new Set())
  const lastChange = shallowRef<LastChange | null>(null)
  const syncStatus = ref<SyncStatus>('idle')

  function store(next: ReadState): void {
    state.value = next
    saveState(next, options.storage)
  }

  /**
   * Takes in what another tab saved, and says whether that added anything, with what was on disk. It may be all
   * that is left of a change, or of a re-lock: that tab can close before its own sync. Adding nothing, the state
   * keeps its identity and the disk is left alone.
   */
  function takeInSaved(): { added: boolean; saved: ReadState } {
    const saved = loadState(options.storage).state
    const next = rekeyState(mergeState(state.value, saved), catalog.value?.books ?? [])
    if (sameState(next, state.value)) return { added: false, saved }
    store(next)
    return { added: true, saved }
  }

  const sync = options.sync
    ? createSyncLoop({
        read: () => {
          takeInSaved()
          return state.value
        },
        adopt: (next) => {
          const settled = rekeyState(next, catalog.value?.books ?? [])
          if (!sameState(settled, state.value)) store(settled)
        },
        report: (next) => (syncStatus.value = next),
        fetchFn: options.fetchFn,
      })
    : undefined

  function setState(next: ReadState): void {
    store(next)
    sync?.changed()
  }

  const markOf = (id: BookId): MarkStatus => statusOf(state.value.marks, id)
  const isUnlocked = (id: BookId): boolean => state.value.unlocks[id]?.on === true

  function setCatalog(next: Catalog): void {
    catalog.value = next
    const moved = rekeyState(state.value, next.books)
    if (moved !== state.value) setState(moved)
    status.value = 'ready'
  }

  /** Books that came but cannot be used fail like books that never came. */
  function applyBooks(books: Book[]): boolean {
    try {
      setCatalog({ books, connections: [], synopses: [], notes: [], meta: { updatedOn: '' } })
      return true
    } catch {
      catalog.value = null
      return false
    }
  }

  if (options.initial) {
    setCatalog(options.initial.catalog)
  } else {
    // Ready on the books alone, and the rest is not asked for until they have been painted. What comes later only
    // adds to the catalogue, which `visible` reads afresh, and a book's place never depends on it. Arriving is not
    // stamping, so no line draws itself.
    void loadBooks(options.fetchFn).then((books) => {
      if (!books || !applyBooks(books)) {
        status.value = 'failed'
        return
      }
      afterFirstPaint(() => {
        void loadConnections(options.fetchFn).then((connections) => {
          catalog.value = { ...catalog.value!, connections: connections ?? [] }
          connectionsState.value = connections ? 'available' : 'failed'
        })
        void loadMeta(options.fetchFn).then((meta) => {
          catalog.value = { ...catalog.value!, meta }
        })
      })
    })
  }

  if (sync) {
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== STATE_KEY) return
      const { added, saved } = takeInSaved()
      // Still holding what the disk lacks: a date another tab has brought down, which a merge alone would never
      // lower here, or a change it saved over. A sync of this tab's own settles either.
      if (added || !sameState(state.value, saved)) sync.follow()
    }
    // A page restored from the back-forward cache heard no storage events while it was away.
    const onPageShow = (): void => void takeInSaved()
    window.addEventListener('storage', onStorage)
    window.addEventListener('pageshow', onPageShow)
    sync.start()
    onScopeDispose(() => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('pageshow', onPageShow)
      sync.stop()
    }, true)
  }

  watch([lang, view, order, filters], () => {
    savePrefs({ lang: lang.value, view: view.value, order: order.value, filters: filters.value }, options.storage)
  }, { deep: true })

  const books = computed(() => catalog.value?.books ?? [])
  const shownBooks = computed(() => filterBooks(books.value, filters.value, order.value))
  const readingOptions = computed<NextOptions>(() => ({ order: order.value, includeRpg: filters.value.formats.includes('rpg') }))
  const countedBooks = computed(() => shownBooks.value.filter((b) => counts(b, readingOptions.value)))

  // The world lifted out of the rest. It lasts the session and is never saved, and it only lifts
  // while it has a book on show: a filter may have taken them all away.
  const liftChoice = ref<WorldKey | null>(null)
  const lifted = computed(() => (shownBooks.value.some((b) => b.world === liftChoice.value) ? liftChoice.value : null))
  function toggleLift(world: WorldKey): void {
    liftChoice.value = lifted.value === world ? null : world
  }

  const visibleConnections = computed<Connection[]>(() =>
    catalog.value ? filterConnections(visible(catalog.value, state.value.marks, state.value.unlocks), filters.value) : [],
  )
  const connectionsOf = (id: BookId): Connection[] =>
    visibleConnections.value.filter((c) => c.from === id || c.to === id)

  const currentBook = computed(() => current(shownBooks.value, state.value.marks, readingOptions.value))
  const nextBook = computed(() => next(shownBooks.value, state.value.marks, readingOptions.value))
  const gapBooks = computed(() => gaps(shownBooks.value, state.value.marks, readingOptions.value))

  function selectBook(id: BookId): void {
    selectedId.value = id
  }

  let undoTimer: ReturnType<typeof setTimeout> | undefined
  let stampTimer: ReturnType<typeof setTimeout> | undefined

  function clearStamp(): void {
    stampedId.value = null
    freshConnectionIds.value = new Set()
  }

  function markBooks(ids: BookId[], newStatus: MarkStatus): void {
    if (ids.length === 0) return
    const before = new Set(visibleConnections.value.map((c) => c.id))
    const { state: marked, previous } = applyMark(state.value, ids, newStatus, now())
    setState(marked)
    lastChange.value = { primaryId: ids[0]!, status: newStatus, previous }
    clearTimeout(undoTimer)
    undoTimer = setTimeout(() => (lastChange.value = null), UNDO_MS)
    clearTimeout(stampTimer)
    if (newStatus === 'read') {
      stampedId.value = ids[0]!
      freshConnectionIds.value = new Set(visibleConnections.value.map((c) => c.id).filter((id) => !before.has(id)))
      stampTimer = setTimeout(clearStamp, STAMP_MS)
    } else {
      clearStamp()
    }
  }

  function undoLast(): void {
    const change = lastChange.value
    if (!change) return
    setState(restoreMarks(state.value, change.previous, now()))
    lastChange.value = null
    clearStamp()
    clearTimeout(undoTimer)
  }

  /** Locking again is `unlockBook(id, false)`: the same panel that unlocked it can undo it. */
  function unlockBook(id: BookId, on: boolean): void {
    setState(setUnlock(state.value, id, on, now()))
  }

  /** Works inside this volume that have no mark yet: what marking it would also mark. */
  function unreadWorksIn(book: Book): Book[] {
    return worksCarriedBy(book, books.value).filter((b) => markOf(b.id) === 'none')
  }

  function exportData(): string {
    return exportState(state.value)
  }

  /** What importing `incoming` into `held` gives, and counts of what changed. Pure: nothing is written. */
  function outcomeOf(held: ReadState, incoming: ReadState) {
    const known = new Set(books.value.map((b) => b.id))
    const merged = rekeyState(mergeState(held, incoming), books.value)
    const ids = new Set([...Object.keys(incoming.marks), ...Object.keys(incoming.unlocks)])
    return {
      merged,
      marked: [...known].filter((id) => statusOf(merged.marks, id) !== statusOf(held.marks, id) && statusOf(merged.marks, id) !== 'none').length,
      unlocked: unlocksTurnedOn(held, merged).filter((id) => known.has(id)).length,
      unknown: [...ids].filter((id) => !known.has(id)).length,
    }
  }

  /** The unlocks that are on in `merged` and are not on in `held`. */
  function unlocksTurnedOn(held: ReadState, merged: ReadState): string[] {
    return Object.keys(merged.unlocks).filter((id) => merged.unlocks[id]?.on === true && held.unlocks[id]?.on !== true)
  }

  /** The file as it is with those unlocks left out of it, so that its marks go in and those unlocks stay as they are. */
  function withoutNewUnlocks(incoming: ReadState, newIds: string[]): ReadState {
    return { marks: incoming.marks, unlocks: build(ownEntries(incoming.unlocks).filter(([id]) => !newIds.includes(id))) }
  }

  /**
   * Reads a file and says what it would do, without doing it. Unlocks reveal connections, so a file that would
   * turn one on waits for an answer: `apply(true)` takes everything, `apply(false)` the marks only, and not
   * calling it takes nothing.
   */
  function planImport(text: string): ImportPlan | null {
    if (!catalog.value) return null
    const parsed = parseImport(text)
    if (!parsed.ok) return null
    const incoming = rekeyState(clampFuture(parsed.state, now()), books.value)
    const all = outcomeOf(state.value, incoming)
    // Two good files can add up to more than a request may carry, and then nothing here could ever sync.
    if (JSON.stringify(all.merged).length > MAX_STATE_BYTES) return null
    const known = new Set(books.value.map((b) => b.id))
    const newIds = unlocksTurnedOn(state.value, all.merged)
    return {
      newUnlocks: books.value.filter((b) => newIds.includes(b.id)),
      unknownUnlocks: newIds.filter((id) => !known.has(id)).length,
      apply(withUnlocks) {
        // Against the state held now, which another tab may have changed since the question was asked.
        const held = state.value
        const taken = withUnlocks ? incoming : withoutNewUnlocks(incoming, unlocksTurnedOn(held, outcomeOf(held, incoming).merged))
        const done = outcomeOf(held, taken)
        setState(done.merged)
        return { ok: true, marked: done.marked, unlocked: done.unlocked, unknown: done.unknown }
      },
    }
  }

  return {
    catalog,
    connectionsState,
    status,
    state,
    stateCorrupt,
    lang,
    view,
    order,
    filters,
    selectedId,
    shownBooks,
    countedBooks,
    readingOptions,
    visibleConnections,
    connectionsOf,
    currentBook,
    nextBook,
    gapBooks,
    markOf,
    isUnlocked,
    lifted,
    toggleLift,
    selectBook,
    markBooks,
    undoLast,
    unlockBook,
    unreadWorksIn,
    stampedId,
    freshConnectionIds,
    lastChange,
    syncStatus,
    exportData,
    planImport,
  }
}

export interface UseAppResult {
  catalog: Ref<Catalog | null>
  connectionsState: Ref<ConnectionsState>
  status: Ref<'loading' | 'ready' | 'failed'>
  state: Ref<ReadState>
  stateCorrupt: Ref<boolean>
  lang: Ref<Lang>
  view: Ref<View>
  order: Ref<OrderKey>
  filters: Ref<Filters>
  selectedId: Ref<BookId | null>
  shownBooks: ComputedRef<Book[]>
  countedBooks: ComputedRef<Book[]>
  /** Which works count toward what is left to read: the order and whether role-playing books are in. */
  readingOptions: ComputedRef<NextOptions>
  visibleConnections: ComputedRef<Connection[]>
  connectionsOf: (id: BookId) => Connection[]
  currentBook: ComputedRef<Book | null>
  nextBook: ComputedRef<Book | null>
  gapBooks: ComputedRef<Book[]>
  markOf(id: BookId): MarkStatus
  isUnlocked(id: BookId): boolean
  lifted: ComputedRef<WorldKey | null>
  toggleLift(world: WorldKey): void
  selectBook(id: BookId): void
  markBooks(ids: BookId[], status: MarkStatus): void
  undoLast(): void
  unlockBook(id: BookId, on: boolean): void
  unreadWorksIn(book: Book): Book[]
  stampedId: Ref<BookId | null>
  freshConnectionIds: Ref<ReadonlySet<string>>
  lastChange: Ref<LastChange | null>
  syncStatus: Ref<SyncStatus>
  exportData(): string
  planImport(text: string): ImportPlan | null
}
