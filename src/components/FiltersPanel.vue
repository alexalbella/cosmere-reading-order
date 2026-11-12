<script setup lang="ts">
import { computed } from 'vue'
import { BOOK_STATUSES, CONNECTION_TYPES, ORDER_KEYS } from '../data/types'
import type { Book, BookStatus, ConnectionType, Format, OrderKey, WorldKey } from '../data/types'
import type { Filters } from '../filters/filters'
import { t, type Lang, type StringKey } from '../i18n'
import { formatLabel, phaseName, typeLabel, worldName } from '../i18n/labels'

const props = defineProps<{
  filters: Filters
  order: OrderKey
  books: Book[]
  lang: Lang
  /** The worlds with a book on show, the only ones that can be lifted. */
  worlds: WorldKey[]
  lifted: WorldKey | null
}>()
const emit = defineEmits<{ 'update:filters': [Filters]; 'update:order': [OrderKey]; close: []; lift: [WorldKey] }>()

const STATUS_KEYS: Record<BookStatus, StringKey> = {
  published: 'statusPublished',
  announced: 'statusAnnounced',
  planned: 'statusPlanned',
  apocryphal: 'statusApocryphal',
}
const ORDER_LABELS: Record<OrderKey, StringKey> = { recommended: 'orderRecommended', publication: 'orderPublication' }

const formats = computed(() => [...new Set(props.books.map((b) => b.format))])
const series = computed(() => [
  ...new Set(props.books.filter((b) => b.status === 'published').map((b) => b.series).filter((s): s is string => !!s)),
])
const phases = computed(() => [...new Set(props.books.map((b) => b.phase).filter((p): p is number => p !== null))].sort())

const countBy = (fn: (b: Book) => boolean): number => props.books.filter(fn).length

function toggled<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
}
const update = (change: Partial<Filters>) => emit('update:filters', { ...props.filters, ...change })
</script>

<template>
  <section
    class="panel"
    tabindex="-1"
    :aria-label="t('filters', lang)"
  >
    <header class="panel-head">
      <h2>{{ t('filters', lang) }}</h2>
      <button
        type="button"
        class="plate-x"
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
    </header>

    <div class="group">
      <h3>{{ t('order', lang) }}</h3>
      <div class="chips">
        <button
          v-for="key in ORDER_KEYS"
          :key="key"
          type="button"
          class="chip"
          :aria-pressed="order === key"
          @click="emit('update:order', key)"
        >
          {{ t(ORDER_LABELS[key], lang) }}
        </button>
      </div>
    </div>

    <div
      class="group"
      data-group="world"
    >
      <h3>{{ t('filterWorld', lang) }}</h3>
      <div class="chips">
        <button
          v-for="w in worlds"
          :key="w"
          type="button"
          class="chip"
          :aria-pressed="lifted === w"
          @click="emit('lift', w)"
        >
          <span
            class="world-dot"
            :style="{ '--dot': `var(--tone-${w})` }"
            aria-hidden="true"
          />{{ worldName(w, lang) }}
        </button>
      </div>
    </div>

    <div class="group">
      <h3>{{ t('filterStatus', lang) }}</h3>
      <div class="chips">
        <button
          v-for="s in BOOK_STATUSES"
          :key="s"
          type="button"
          class="chip"
          :aria-pressed="filters.statuses.includes(s)"
          @click="update({ statuses: toggled<BookStatus>(filters.statuses, s) })"
        >
          {{ t(STATUS_KEYS[s], lang) }} <span class="chip-n">{{ countBy((b) => b.status === s) }}</span>
        </button>
      </div>
    </div>

    <div class="group">
      <h3>{{ t('filterFormat', lang) }}</h3>
      <div class="chips">
        <button
          v-for="f in formats"
          :key="f"
          type="button"
          class="chip"
          :aria-pressed="filters.formats.includes(f)"
          @click="update({ formats: toggled<Format>(filters.formats, f) })"
        >
          {{ formatLabel(f, lang) }}
        </button>
      </div>
    </div>

    <div
      v-if="phases.length"
      class="group"
    >
      <h3>{{ t('filterPhase', lang) }}</h3>
      <div class="chips">
        <button
          v-for="p in phases"
          :key="p"
          type="button"
          class="chip"
          :aria-pressed="filters.phases.includes(p)"
          @click="update({ phases: toggled<number>(filters.phases, p) })"
        >
          {{ phaseName(p, lang) }}
        </button>
      </div>
    </div>

    <div
      v-if="series.length"
      class="group"
    >
      <h3>{{ t('filterSeries', lang) }}</h3>
      <div class="chips">
        <button
          v-for="s in series"
          :key="s"
          type="button"
          class="chip"
          :aria-pressed="filters.series.includes(s)"
          @click="update({ series: toggled<string>(filters.series, s) })"
        >
          {{ s }}
        </button>
      </div>
    </div>

    <div class="group">
      <h3>{{ t('filterTypes', lang) }}</h3>
      <div class="chips">
        <button
          v-for="c in CONNECTION_TYPES"
          :key="c"
          type="button"
          class="chip"
          :aria-pressed="filters.connectionTypes.includes(c)"
          @click="update({ connectionTypes: toggled<ConnectionType>(filters.connectionTypes, c) })"
        >
          {{ typeLabel(c, lang) }}
        </button>
        <button
          type="button"
          class="chip"
          :aria-pressed="filters.theories"
          @click="update({ theories: !filters.theories })"
        >
          {{ t('theories', lang) }}
        </button>
      </div>
    </div>
  </section>
</template>
