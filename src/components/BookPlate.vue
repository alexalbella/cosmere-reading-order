<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Book, BookId, Connection, MarkStatus, Note, WorldKey } from '../data/types'
import type { SynopsisView } from '../spoilers/visible'
import { t, titleOf, type Lang, type StringKey } from '../i18n'
import {
  apocryphalLabel,
  canonLabel,
  editionFact,
  expectedText,
  formatLabel,
  numberText,
  phaseName,
  publicationText,
  rpgKindLabel,
  seriesText,
  stateLabel,
  systemName,
  worldName,
  writingText,
} from '../i18n/labels'
import { isRecentlyAdded } from '../reading/recent'
import ConfirmDialog from './ConfirmDialog.vue'
import ConnectionList from './ConnectionList.vue'
import NoteList from './NoteList.vue'
import SynopsisRow from './SynopsisRow.vue'
import UndoToast from './UndoToast.vue'

const props = defineProps<{
  book: Book
  books: Book[]
  lang: Lang
  mark: MarkStatus
  unlocked: boolean
  /** Position among the works that count, 1-based, or null when it is not one of them. */
  position: { index: number; total: number } | null
  /** Unread and before the work in progress: it can be dismissed. */
  isGap: boolean
  volume: Book | null
  /** Works inside this volume that are not marked yet. */
  carried: Book[]
  items: Connection[]
  /** What the gate lets the plate say about the synopsis. */
  synopsis: SynopsisView
  /** The visible notes that hang on this book. */
  noteItems: Note[]
  /** The change just made to this book, which the undo takes back. */
  undoStatus: MarkStatus | null
  stamped: boolean
  /** This book's world is the one lifted. */
  lifted: boolean
  folded: boolean
  phone: boolean
  now: number
}>()

const emit = defineEmits<{
  mark: [ids: BookId[], status: MarkStatus]
  undo: []
  close: []
  select: [id: BookId]
  toggleFold: []
  lift: [world: WorldKey]
}>()

const asking = ref(false)

// On the phone the plate docks under the finger that picked the book, and a second tap of a double tap lands on
// whatever is now there. For a moment the plate takes no touch: a keyboard press (a click with no detail) still goes.
const SETTLE_MS = 400
const settling = ref(false)
let settleTimer: ReturnType<typeof setTimeout> | undefined
onMounted(() => {
  if (!props.phone) return
  settling.value = true
  settleTimer = setTimeout(() => (settling.value = false), SETTLE_MS)
})
onBeforeUnmount(() => clearTimeout(settleTimer))
function refuseEarlyTouch(event: MouseEvent): void {
  if (settling.value && event.detail > 0) {
    event.preventDefault()
    event.stopPropagation()
  }
}
watch(
  () => props.book.id,
  () => (asking.value = false),
)

const counts = computed(() => props.book.status === 'published')
const title = computed(() => titleOf(props.book, props.lang))
const original = computed(() =>
  props.lang === 'es' && props.book.titles.es && props.book.titles.es !== props.book.titles.en ? props.book.titles.en : '',
)
const isNew = computed(() => isRecentlyAdded(props.book, props.now))
const done = computed(() => props.mark === 'read')
const titleTone = computed(() => (done.value || props.mark === 'reading' ? 'gold' : 'blind'))

/**
 * Every public fact the catalogue has about the book, each beside its name. On a published or apocryphal work a
 * fact it lacks takes no row; on an announced or planned one the row stays and says it is to be announced.
 */
const facts = computed(() => {
  const { book, lang } = props
  const rows: { key: string; label: string; value: string; href?: string }[] = []
  const add = (key: string, label: StringKey, value: string, href?: string) => {
    if (value) rows.push({ key, label: t(label, lang), value, href })
  }
  const always = (key: string, label: StringKey, value: string, href?: string) =>
    rows.push({ key, label: t(label, lang), value: value || t('toBeAnnounced', lang), href: value ? href : undefined })
  const length = [
    formatLabel(book.format, lang),
    book.pages ? `${numberText(book.pages, lang)} ${t('pages', lang)}` : '',
    book.words ? `${numberText(book.words, lang)} ${t('words', lang)}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const date = publicationText(book.publication, lang) || (book.year ? String(book.year) : '')
  add('series', 'factSeries', seriesText(book, lang))
  add('system', 'factSystem', systemName(book.world, lang))
  if (book.status === 'announced' || book.status === 'planned') {
    always('format', 'factFormat', formatLabel(book.format, lang))
    always('writing', 'factWriting', writingText(book.writing, lang))
    always('expected', 'factExpected', expectedText(book.expected, lang))
    always('announced', 'factAnnouncedIn', book.announcedIn ? t('factAnnouncedLink', lang) : '', book.announcedIn)
  }
  if (book.status === 'apocryphal') {
    add('apocryphal', 'factApocryphal', apocryphalLabel(book.apocryphal?.reason, lang))
    add('appeared', 'factAppeared', [date, book.publisher ?? ''].filter(Boolean).join(' · '))
    add('format', 'factFormat', length)
    if (book.readFree) add('free', 'factFree', t('factFreeLink', lang), book.readFree)
  }
  if (counts.value) {
    add('format', 'factFormat', length)
    add('published', 'factPublished', date)
    add('spain', 'factSpain', editionFact(book, props.volume, lang))
    if (props.position) {
      const place = t('workOf', lang, props.position.index, props.position.total)
      add('reading', 'factReading', book.phase ? `${place} · ${phaseName(book.phase, lang)}` : place)
    }
    if (book.readFree) add('free', 'factFree', t('factFreeLink', lang), book.readFree)
    if (book.format === 'rpg') {
      add('publisher', 'factPublisher', book.publisher ?? '')
      add('line', 'factLine', book.line ?? '')
      add('kind', 'factRpgKind', rpgKindLabel(book.rpgKind, lang))
      if (book.crowdfunding) add('campaign', 'factCrowdfunding', t('factCrowdfundingLink', lang), book.crowdfunding)
      add('canon', 'factCanon', canonLabel(book.canon?.value, lang))
    }
  }
  return rows
})

const UNDO_MESSAGE: Record<MarkStatus, StringKey> = {
  read: 'markedRead',
  reading: 'markedReading',
  skipped: 'markedSkipped',
  none: 'markedNone',
}

function markRead(): void {
  if (props.book.format === 'anthology' && props.carried.length > 0) {
    asking.value = true
    return
  }
  markOnly()
}

function markOnly(): void {
  asking.value = false
  emit('mark', [props.book.id], 'read')
}

function confirmAll(): void {
  asking.value = false
  emit('mark', [props.book.id, ...props.carried.map((b) => b.id)], 'read')
}
</script>

<template>
  <section
    class="plate"
    :class="{ folded }"
    :data-world="book.world"
    :aria-label="title"
  >
    <button
      v-if="phone"
      type="button"
      class="plate-x plate-close"
      :aria-label="t('close', lang)"
      @click="emit('close')"
    >
      <svg
        viewBox="0 0 20 20"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <path d="M4 4l12 12M16 4L4 16" />
      </svg>
    </button>
    <button
      v-if="phone"
      type="button"
      class="plate-more"
      :aria-expanded="!folded"
      :aria-label="t('expandPlate', lang)"
      @click="emit('toggleFold')"
    >
      <svg
        viewBox="0 0 20 20"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <path :d="folded ? 'M4 12.5L10 7l6 5.5' : 'M4 7.5L10 13l6-5.5'" />
      </svg>
    </button>

    <header class="plate-head">
      <h2
        class="plate-title"
        :class="[titleTone, { stamped }]"
      >
        {{ title }}
      </h2>
      <p
        v-if="isNew"
        class="plate-new"
      >
        {{ t('new', lang) }}
      </p>
      <p
        v-if="original"
        class="plate-orig"
      >
        {{ original }}
      </p>
      <p class="plate-sub">
        <button
          type="button"
          class="plate-world"
          :aria-pressed="lifted"
          @click="emit('lift', book.world)"
        >
          <span
            class="world-dot"
            :style="{ '--dot': `var(--tone-${book.world})` }"
            aria-hidden="true"
          />{{ worldName(book.world, lang) }}
        </button><span
          class="sep"
          aria-hidden="true"
        > · </span><span>{{ stateLabel(book, mark, unlocked, lang) }}</span>
      </p>
    </header>

    <div
      v-if="counts"
      class="plate-actions"
      @click.capture="refuseEarlyTouch"
    >
      <ConfirmDialog
        v-if="asking"
        danger
        :message="t('anthologyAsk', lang)"
        :items="carried.map((b) => titleOf(b, lang))"
        :confirm-label="t('anthologyAll', lang)"
        :alternate-label="t('anthologyOnly', lang)"
        :cancel-label="t('cancel', lang)"
        @confirm="confirmAll"
        @alternate="markOnly"
        @cancel="asking = false"
      />
      <UndoToast
        v-else-if="undoStatus"
        :message="t(UNDO_MESSAGE[undoStatus], lang)"
        :undo-label="t('undo', lang)"
        @undo="emit('undo')"
      />
      <div
        v-else-if="done"
        class="quiet-row"
      >
        <button
          type="button"
          class="quiet"
          @click="emit('mark', [book.id], 'none')"
        >
          {{ t('clearMark', lang) }}
        </button>
      </div>
      <div
        v-else-if="mark === 'skipped'"
        class="quiet-row"
      >
        <button
          type="button"
          class="quiet"
          @click="emit('mark', [book.id], 'none')"
        >
          {{ t('recount', lang) }}
        </button>
      </div>
      <template v-else>
        <button
          type="button"
          class="btn-gold"
          @click="markRead"
        >
          {{ t('markRead', lang) }}
        </button>
        <div
          v-if="mark !== 'reading' || isGap"
          class="quiet-row"
        >
          <button
            v-if="mark !== 'reading'"
            type="button"
            class="quiet"
            @click="emit('mark', [book.id], 'reading')"
          >
            {{ t('markReading', lang) }}
          </button>
          <button
            v-if="isGap"
            type="button"
            class="quiet"
            @click="emit('mark', [book.id], 'skipped')"
          >
            {{ t('markSkipped', lang) }}
          </button>
        </div>
      </template>
    </div>

    <dl
      v-if="facts.length"
      class="plate-data plate-facts"
    >
      <div
        v-for="row in facts"
        :key="row.key"
        class="fact"
      >
        <dt>{{ row.label }}</dt>
        <dd>
          <a
            v-if="row.href"
            :href="row.href"
            target="_blank"
            rel="noopener noreferrer"
          >{{ row.value }}</a>
          <template v-else>
            {{ row.value }}
          </template>
        </dd>
      </div>
    </dl>

    <SynopsisRow
      :view="synopsis"
      :lang="lang"
    />
    <NoteList
      v-if="noteItems.length"
      :items="noteItems"
      :lang="lang"
    />

    <ConnectionList
      v-if="counts"
      :items="items"
      :self-id="book.id"
      :books="books"
      :lang="lang"
      @select="emit('select', $event)"
    />
  </section>
</template>
