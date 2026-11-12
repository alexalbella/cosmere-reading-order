<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch, watchEffect } from 'vue'
import { afterFirstPaint } from './app/afterFirstPaint'
import { keepFocus } from './app/keepFocus'
import { reload } from './app/reload'
import { PHONE_QUERY } from './app/viewport'
import { useApp, type ImportOutcome, type ImportPlan, type UseAppResult } from './app/useApp'
import AppFooter from './components/AppFooter.vue'
import BookPlate from './components/BookPlate.vue'
import CoverFillet from './components/CoverFillet.vue'
import FiltersPanel from './components/FiltersPanel.vue'
import HowPanel from './components/HowPanel.vue'
import LeaderThread from './components/LeaderThread.vue'
import NextSentence from './components/NextSentence.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import SpineStrip, { type Segment } from './components/SpineStrip.vue'
import SpoilersPanel from './components/SpoilersPanel.vue'
import { WORLD_KEYS, type Book } from './data/types'
import { WORLDS } from './design/worlds'
import { defaultFilters } from './filters/filters'
import { t, titleOf } from './i18n'
import { counts, volumeToBuy } from './reading/next'
import { countsAsRead } from './reading/status'
import type { MarkStatus } from './spoilers/visible'
import CircleView from './views/CircleView.vue'
import ShelfView from './views/ShelfView.vue'
import { cardBox, CLEAR_BOTTOM, CLEAR_TOP, roomFor, sideOf, type Box, type Side } from './views/room'

// The sheet of emblems and icons is not needed for the first paint: it comes after it, in its own chunk.
const SpriteSheet = defineAsyncComponent(() => import('./imagery/SpriteSheet.vue'))
const spriteReady = ref(false)
onMounted(() => afterFirstPaint(() => (spriteReady.value = true)))

// Tests hand in their own `app`; the page builds one.
const props = defineProps<{ app?: UseAppResult }>()
const app = props.app ?? useApp({ sync: true })
const emit = defineEmits<{ booksSettled: [] }>()
watch(
  () => app.status.value,
  (status) => {
    if (status !== 'loading') emit('booksSettled')
  },
  { immediate: true },
)

type PanelName = 'filters' | 'settings' | 'spoilers' | 'how'
const panel = ref<PanelName | null>(null)
const folded = ref(true)
const importResult = ref<ImportOutcome | null>(null)
/** A file read that waits for an answer about its unlocks. Nothing of it is applied yet. */
const pendingImport = shallowRef<ImportPlan | null>(null)
const now = Date.now()

// Below 1280 px the phone layout applies.
const phone = ref(false)
let query: MediaQueryList | undefined
const onQuery = () => (phone.value = query?.matches ?? false)
onMounted(() => {
  if (typeof matchMedia !== 'function') return
  query = matchMedia(PHONE_QUERY)
  onQuery()
  query.addEventListener('change', onQuery)
})
onBeforeUnmount(() => query?.removeEventListener('change', onQuery))

// A control that gets replaced hands the focus on, so it never falls to the top of the page.
const cover = ref<HTMLElement | null>(null)
const HANDOVER = ['.plate-actions button', '.panel .btn-danger', '.panel .quiet', '.slot button']
function handover(): HTMLElement | null {
  for (const selector of HANDOVER) {
    const found = cover.value?.querySelector<HTMLElement>(selector)
    if (found) return found
  }
  return null
}
watch(cover, (el, _before, onCleanup) => {
  if (el) onCleanup(keepFocus(el, handover))
})

const lang = app.lang
const books = computed(() => app.catalog.value?.books ?? [])
const { markOf, isUnlocked } = app

const selected = computed<Book | null>(() => books.value.find((b) => b.id === app.selectedId.value) ?? null)
const worldsOnShow = computed(() => WORLD_KEYS.filter((w) => app.shownBooks.value.some((b) => b.world === w)))
const activeWorld = computed(() => (app.currentBook.value ?? app.nextBook.value ?? app.shownBooks.value[0])?.world ?? 'otros')

watchEffect(() => {
  document.documentElement.lang = lang.value
  document.body.dataset.world = activeWorld.value
  // The browser's own bar follows the leather.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', WORLDS[activeWorld.value].deep)
})

// The area fades in when the view changes, and on the phone the plate rises when it opens.
const entering = ref(false)
const rising = ref(false)
watch(
  () => app.view.value === 'shelf',
  () => (entering.value = true),
)
watch(selected, (book, before) => {
  if (phone.value && book && !before) rising.value = true
})

// On the PC the book in progress starts selected. In the ring its card stays closed until asked for: the sentence
// speaks at rest, and nothing covers the ring.
watch(
  () => app.status.value === 'ready',
  (ready) => {
    if (ready && !phone.value && app.selectedId.value === null) {
      const first = app.currentBook.value ?? app.nextBook.value
      if (first) app.selectedId.value = first.id
    }
  },
  { immediate: true },
)

// The ring makes room (PC, ring views): a card or a drawer opens beside the ring, the ring slides to the other
// side and shrinks a little, and the sentence folds to its first line.
const circle = ref<{ angleOf(id: string): number | null } | null>(null)
const cardOpen = ref(false)
const ringZoomed = ref(false)
watch(
  () => app.selectionCount.value,
  () => (cardOpen.value = true),
)
const roomy = computed(() => !phone.value && app.view.value !== 'shelf')
const showPlate = computed(() => selected.value !== null && (!roomy.value || cardOpen.value))
const roomOpen = computed(() => roomy.value && (panel.value !== null || showPlate.value))
const room = ref({ dx: 0, scale: 1 })
const openBox = ref<{ side: Side; box: Box } | null>(null)
const slotPlace = ref<Record<string, string>>({})
/** How far from the centre a title's middle sits, as a share of the ring's radius. */
const TITLE_RADIUS = 0.62

async function place(): Promise<void> {
  await nextTick()
  const coverEl = cover.value
  const slotEl = coverEl?.querySelector<HTMLElement>('.slot')
  const ringEl = coverEl?.querySelector<HTMLElement>('.ring')
  if (!roomOpen.value || !coverEl || !slotEl || !ringEl) {
    room.value = { dx: 0, scale: 1 }
    openBox.value = null
    slotPlace.value = {}
    return
  }
  const c = coverEl.getBoundingClientRect()
  const r = ringEl.getBoundingClientRect()
  const ring = { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height }
  const size = { w: c.width, h: c.height }
  const w = slotEl.offsetWidth
  const content = slotEl.scrollHeight
  let open: { side: Side; box: Box }
  if (panel.value) {
    const side: Side = panel.value === 'settings' ? 'left' : 'right'
    const h = Math.min(content, size.h - CLEAR_TOP - CLEAR_BOTTOM)
    const y = panel.value === 'filters' ? CLEAR_TOP : size.h - h - CLEAR_BOTTOM
    open = { side, box: { x: side === 'left' ? 22 : size.w - w - 22, y, w, h } }
  } else {
    const angle = selected.value ? (circle.value?.angleOf(selected.value.id) ?? null) : null
    const side = angle === null ? 'right' : sideOf(angle)
    const made = roomFor(ring, { side, box: cardBox(side, size.h / 2, { w, h: content }, size) }, size, ringZoomed.value)
    const cy = ring.y + ring.h / 2
    const titleY = angle === null ? cy : cy - Math.cos((angle * Math.PI) / 180) * TITLE_RADIUS * (ring.h / 2) * made.scale
    open = { side, box: cardBox(side, titleY, { w, h: content }, size) }
  }
  room.value = roomFor(ring, open, size, ringZoomed.value)
  openBox.value = open
  slotPlace.value = { '--slot-x': `${open.box.x}px`, '--slot-y': `${open.box.y}px`, '--slot-h': `${open.box.h}px` }
}
watch([() => selected.value?.id, showPlate, panel, roomy, ringZoomed, lang, () => app.view.value], () => void place())
const onResize = (): void => void place()
onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))

function closeCard(): void {
  cardOpen.value = false
  void nextTick(() => document.querySelector<HTMLElement>('.area .sel')?.focus({ preventScroll: true }))
}

/** The sentence's mark: the same path as the plate's. Its card opens with the undo, or asks first for an anthology. */
function markCurrent(): void {
  const book = app.currentBook.value
  if (!book) return
  select(book.id)
  if (!(book.format === 'anthology' && app.unreadWorksIn(book).length > 0)) app.markBooks([book.id], 'read')
}

const started = computed(() => Object.values(app.state.value.marks).some((m) => m.status !== 'none'))
const counted = computed(() => app.countedBooks.value)
const readCount = computed(() => counted.value.filter((b) => markOf(b.id) === 'read').length)
const segments = computed<Segment[]>(() =>
  counted.value.map((b) => {
    const mark = markOf(b.id)
    const state =
      mark === 'read' ? 'read' : mark === 'reading' ? 'reading' : app.nextBook.value?.id === b.id ? 'next' : mark === 'skipped' ? 'skipped' : 'unread'
    return { state, pages: b.pages ?? 0 }
  }),
)

const volumeOf = (book: Book | null): Book | null => (book ? volumeToBuy(book, books.value) : null)
const position = computed(() => {
  const index = counted.value.findIndex((b) => b.id === selected.value?.id)
  return index >= 0 ? { index: index + 1, total: counted.value.length } : null
})
const undoStatus = computed(() => {
  const change = app.lastChange.value
  return change && change.primaryId === selected.value?.id ? change.status : null
})
const carried = computed(() => (selected.value?.format === 'anthology' ? app.unreadWorksIn(selected.value) : []))

const includeRpg = computed({
  get: () => app.filters.value.formats.includes('rpg'),
  set: (on: boolean) => {
    const rest = app.filters.value.formats.filter((f) => f !== 'rpg')
    app.filters.value = { ...app.filters.value, formats: on ? [...rest, 'rpg'] : rest }
  },
})

// The filters leave out works that count, so the sentence can only speak of what is on show.
const narrowed = computed(() => counted.value.length < books.value.filter((b) => counts(b, app.readingOptions.value)).length)
function clearFilters(): void {
  const base = defaultFilters()
  app.filters.value = {
    ...app.filters.value,
    statuses: base.statuses,
    series: [],
    phases: [],
    formats: includeRpg.value ? [...base.formats, 'rpg'] : base.formats,
  }
}

const unlockedBooks = computed(() => books.value.filter((b) => isUnlocked(b.id)))
const medallionSpoilers = computed(() =>
  unlockedBooks.value.length ? t('byHand', lang.value, unlockedBooks.value.length) : t('spoilers', lang.value),
)

function select(id: string): void {
  app.selectBook(id)
  panel.value = null
  folded.value = true
}

// A panel takes the focus when it opens and gives it back when it closes.
let opener: HTMLElement | null = null
function togglePanel(name: PanelName): void {
  if (panel.value === name) return closePanel()
  const active = document.activeElement
  opener = active instanceof HTMLElement && active !== document.body ? active : null
  panel.value = name
  cardOpen.value = false
  void nextTick(() => document.querySelector<HTMLElement>('.slot .panel')?.focus({ preventScroll: true }))
}
function closePanel(): void {
  // Moved first, so that nothing is left holding the focus when the panel goes.
  opener?.focus({ preventScroll: true })
  opener = null
  panel.value = null
}
function closePlate(): void {
  document.querySelector<HTMLElement>('.area .sel')?.focus({ preventScroll: true })
  app.selectedId.value = null
}
function onEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (panel.value) closePanel()
  else if (phone.value && selected.value) closePlate()
  else if (roomy.value && cardOpen.value) closeCard()
}
onMounted(() => window.addEventListener('keydown', onEscape))
onBeforeUnmount(() => window.removeEventListener('keydown', onEscape))

// On the phone the plate docks under the list and takes room from it: the chosen book stays in sight.
watch([() => app.selectedId.value, folded], async () => {
  if (!phone.value || app.selectedId.value === null) return
  await nextTick()
  document.querySelector('.area .sel')?.scrollIntoView?.({ block: 'nearest' })
})
// What an import said belongs to that visit to the panel.
watch(panel, () => {
  importResult.value = null
  pendingImport.value = null
})

function mark(ids: string[], status: MarkStatus): void {
  app.markBooks(ids, status)
}

function download(): void {
  const blob = new Blob([app.exportData()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'cosmere-lo-leido.json'
  link.click()
  URL.revokeObjectURL(url)
}
function doImport(text: string): void {
  pendingImport.value = null
  const plan = app.planImport(text)
  if (!plan) {
    importResult.value = { ok: false }
    return
  }
  importResult.value = null
  // Unlocks reveal connections: a file that would turn one on asks first.
  if (plan.newUnlocks.length > 0 || plan.unknownUnlocks > 0) pendingImport.value = plan
  else importResult.value = plan.apply(true)
}
function answerImport(answer: 'all' | 'marks' | 'cancel'): void {
  const plan = pendingImport.value
  pendingImport.value = null
  importResult.value = !plan || answer === 'cancel' ? { ok: false, cancelled: true } : plan.apply(answer === 'all')
}
const pendingUnlocks = computed(() => {
  const plan = pendingImport.value
  if (!plan) return null
  const titles = plan.newUnlocks.map((b) => titleOf(b, lang.value))
  return plan.unknownUnlocks > 0 ? [...titles, t('importUnlockUnknown', lang.value, plan.unknownUnlocks)] : titles
})
</script>

<template>
  <div
    v-if="app.status.value !== 'ready'"
    class="app-message"
  >
    <p role="status">
      {{ app.status.value === 'failed' ? t('loadFailed', lang) : t('loading', lang) }}
    </p>
    <button
      v-if="app.status.value === 'failed'"
      type="button"
      class="quiet"
      @click="reload"
    >
      {{ t('tryAgain', lang) }}
    </button>
  </div>
  <div
    v-else
    class="app"
    :data-world="activeWorld"
    :data-connections="app.connectionsState.value"
    :data-content="app.contentState.value"
  >
    <SpriteSheet v-if="spriteReady" />
    <SpineStrip
      :segments="segments"
      :read="readCount"
      :total="counted.length"
      :view="app.view.value"
      :lang="lang"
      :unlocked-count="unlockedBooks.length"
      :phone="phone"
      @update:view="app.view.value = $event"
      @spoilers="togglePanel('spoilers')"
    />
    <main
      ref="cover"
      class="cover"
      :class="{ interior: app.view.value === 'shelf', 'with-panel': panel, 'room-open': roomOpen }"
    >
      <CoverFillet v-if="app.view.value !== 'shelf'" />
      <LeaderThread
        v-if="roomy && showPlate && !panel && openBox"
        :side="openBox.side"
        :box="openBox.box"
      />
      <div class="sentence-col">
        <NextSentence
          :current="app.currentBook.value"
          :next="app.nextBook.value"
          :gaps="app.gapBooks.value"
          :volume="volumeOf(app.nextBook.value)"
          :started="started"
          :narrowed="narrowed"
          :has-works="books.some((b) => counts(b, app.readingOptions.value))"
          :lang="lang"
          :rest-actions="roomy"
          @select="select"
          @clear-filters="clearFilters"
          @mark-current="markCurrent"
        />
      </div>
      <nav
        class="controls"
        :aria-label="t('controls', lang)"
      >
        <div class="tabs-phone">
          <button
            type="button"
            class="tab"
            :aria-pressed="app.view.value === 'map'"
            @click="app.view.value = 'map'"
          >
            {{ t('tabMap', lang) }}
          </button>
          <button
            type="button"
            class="tab"
            :aria-pressed="app.view.value === 'circle'"
            @click="app.view.value = 'circle'"
          >
            {{ t('tabCircle', lang) }}
          </button>
          <button
            type="button"
            class="tab"
            :aria-pressed="app.view.value === 'shelf'"
            @click="app.view.value = 'shelf'"
          >
            {{ t('tabShelf', lang) }}
          </button>
        </div>
        <button
          type="button"
          class="medallion m-lang"
          :aria-label="`ES EN, ${t('language', lang)}`"
          @click="lang = lang === 'es' ? 'en' : 'es'"
        >
          <span><span :class="{ 'lang-on': lang === 'es' }">ES</span> <span :class="{ 'lang-on': lang === 'en' }">EN</span></span>
        </button>
        <button
          type="button"
          class="medallion m-filters"
          :aria-pressed="panel === 'filters'"
          @click="togglePanel('filters')"
        >
          {{ t('filters', lang) }}
        </button>
        <button
          type="button"
          class="medallion m-settings"
          :aria-pressed="panel === 'settings'"
          @click="togglePanel('settings')"
        >
          {{ t('settings', lang) }}
        </button>
        <button
          type="button"
          class="medallion m-spoilers"
          :aria-pressed="panel === 'spoilers'"
          @click="togglePanel('spoilers')"
        >
          {{ medallionSpoilers }}
        </button>
      </nav>

      <div
        class="area"
        :class="{ 'ring-area': app.view.value !== 'shelf', entering }"
        data-scroll="area"
        @animationend.self="entering = false"
      >
        <CircleView
          v-if="app.view.value !== 'shelf'"
          ref="circle"
          :app="app"
          :room="room"
          :arrangement="app.view.value === 'map' ? 'map' : 'order'"
          :how-open="panel === 'how'"
          :phone="phone"
          :lang="lang"
          :now="now"
          @zoomed="ringZoomed = $event"
          @how="togglePanel('how')"
        />
        <ShelfView
          v-else
          :app="app"
          :phone="phone"
          :lang="lang"
          :now="now"
        />
        <AppFooter
          v-if="phone"
          :lang="lang"
          :updated-on="app.catalog.value?.meta.updatedOn ?? ''"
          :visible-count="app.visibleConnections.value.length"
          :sync-status="app.syncStatus.value"
          :corrupt="app.stateCorrupt.value"
          :connections-failed="app.connectionsState.value === 'failed'"
          :lifted="app.lifted.value"
          @lift="app.toggleLift"
        />
      </div>

      <div
        class="slot"
        :class="{ rising }"
        :style="slotPlace"
        :data-side="openBox?.side"
        @animationend.self="rising = false"
      >
        <SpoilersPanel
          v-if="panel === 'spoilers'"
          :lang="lang"
          :selected="selected"
          :selected-counts="selected ? countsAsRead(selected.id, app.state.value.marks, app.state.value.unlocks) : false"
          :unlocked="unlockedBooks"
          :visible-count="app.visibleConnections.value.length"
          @unlock="app.unlockBook($event, true)"
          @lock="app.unlockBook($event, false)"
          @close="closePanel"
        />
        <HowPanel
          v-else-if="panel === 'how'"
          :lang="lang"
          @close="closePanel"
        />
        <FiltersPanel
          v-else-if="panel === 'filters'"
          :filters="app.filters.value"
          :order="app.order.value"
          :books="books"
          :lang="lang"
          :worlds="worldsOnShow"
          :lifted="app.lifted.value"
          @lift="app.toggleLift"
          @update:filters="app.filters.value = $event"
          @update:order="app.order.value = $event"
          @close="closePanel"
        />
        <SettingsPanel
          v-else-if="panel === 'settings'"
          :lang="lang"
          :include-rpg="includeRpg"
          :sync-status="app.syncStatus.value"
          :import-result="importResult"
          :pending-unlocks="pendingUnlocks"
          @update:lang="lang = $event"
          @update:include-rpg="includeRpg = $event"
          @export="download"
          @import="doImport"
          @import-answer="answerImport"
          @close="closePanel"
        />
        <BookPlate
          v-else-if="selected && showPlate"
          :key="selected.id"
          :book="selected"
          :books="books"
          :lang="lang"
          :mark="markOf(selected.id)"
          :unlocked="isUnlocked(selected.id)"
          :position="position"
          :is-gap="app.gapBooks.value.some((b) => b.id === selected!.id)"
          :volume="volumeOf(selected)"
          :carried="carried"
          :items="app.connectionsOf(selected.id)"
          :synopsis="app.synopsisOf(selected.id)"
          :note-items="app.notesOf(selected.id)"
          :undo-status="undoStatus"
          :stamped="app.stampedId.value === selected.id"
          :lifted="app.lifted.value === selected.world"
          :folded="folded"
          :phone="phone"
          :closable="roomy"
          :now="now"
          @mark="mark"
          @undo="app.undoLast()"
          @close="roomy ? closeCard() : closePlate()"
          @select="select"
          @toggle-fold="folded = !folded"
          @lift="app.toggleLift"
        />
        <section
          v-else-if="!phone && !roomy && app.shownBooks.value.length"
          class="plate"
        >
          <p class="cons-empty">
            {{ t('tapABook', lang) }}
          </p>
        </section>
      </div>

      <div
        v-if="!phone"
        class="foot-area"
      >
        <AppFooter
          :lang="lang"
          :updated-on="app.catalog.value?.meta.updatedOn ?? ''"
          :visible-count="app.visibleConnections.value.length"
          :sync-status="app.syncStatus.value"
          :corrupt="app.stateCorrupt.value"
          :connections-failed="app.connectionsState.value === 'failed'"
          :lifted="app.lifted.value"
          @lift="app.toggleLift"
        />
      </div>
    </main>
  </div>
</template>

<style>
.app-message { display: grid; place-items: center; align-content: center; gap: 8px; height: 100dvh; padding: 24px; text-align: center; color: var(--bone); }
</style>
