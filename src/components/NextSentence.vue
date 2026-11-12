<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { PHONE_QUERY } from '../app/viewport'
import type { Book, BookId } from '../data/types'
import { t, titleOf, type Lang } from '../i18n'
import { editionLine } from '../i18n/labels'

const props = defineProps<{
  current: Book | null
  next: Book | null
  gaps: Book[]
  volume: Book | null
  /** Anything marked yet. Before that the sentence says where to begin. */
  started: boolean
  /** The filters leave out works that count, so "everything" would not be true. */
  narrowed: boolean
  /** There are works that count at all. With none, nothing was read and nothing is left, so nothing is claimed. */
  hasWorks: boolean
  lang: Lang
  /** On the PC, in the ring: mark the book in progress, or see its card, from here. */
  restActions?: boolean
}>()
const emit = defineEmits<{ select: [id: BookId]; clearFilters: []; markCurrent: [] }>()

// For a finger each title needs a row of its own height. If they all fit one row they stay a sentence;
// if not they become a list, because a sentence wrapped at 44 px a line falls apart.
const FOR_A_FINGER = `${PHONE_QUERY}, (pointer: coarse)`
const gapsEl = ref<HTMLElement | null>(null)
const listed = ref(false)
/** The first title is too long to share a row with the label. */
const labelAlone = ref(false)
let fitting = 0

async function fitGaps(): Promise<void> {
  const run = ++fitting
  listed.value = false
  labelAlone.value = false
  await nextTick()
  const el = gapsEl.value
  if (run !== fitting || !el || typeof matchMedia !== 'function' || !matchMedia(FOR_A_FINGER).matches) return
  // Measured first: unwrapped text can widen everything around it, this element included.
  const room = el.clientWidth
  el.style.whiteSpace = 'nowrap'
  const needed = el.scrollWidth
  el.style.whiteSpace = ''
  listed.value = needed > room
  if (!listed.value) return
  await nextTick()
  if (run !== fitting) return
  const label = el.querySelector('.gaps-label')
  const first = el.querySelector('.gap-btn')
  if (label && first) labelAlone.value = first.getBoundingClientRect().top >= label.getBoundingClientRect().bottom - 1
}

watch(() => [props.gaps, props.lang], fitGaps)
let observer: ResizeObserver | undefined
let width = 0
onMounted(() => {
  void fitGaps()
  void document.fonts?.ready.then(fitGaps)
  if (typeof ResizeObserver !== 'function') return
  observer = new ResizeObserver(() => {
    if (window.innerWidth === width) return
    width = window.innerWidth
    void fitGaps()
  })
  observer.observe(document.documentElement)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div class="sentence">
    <p
      v-if="current"
      class="line line-reading"
    >
      <span class="kicker">{{ t('reading', lang) }}</span>
      <!-- A button by role and not by element: a real one is laid out as one box and cannot break with its sentence. -->
      <span
        class="title-btn"
        role="button"
        tabindex="0"
        @click="emit('select', current.id)"
        @keydown.enter.prevent="emit('select', current.id)"
        @keydown.space.prevent="emit('select', current.id)"
      >{{ titleOf(current, lang) }}<span class="dot">.</span></span>
    </p>
    <div
      v-if="current && restActions"
      class="rest-actions"
    >
      <button
        type="button"
        class="btn-gold"
        @click="emit('markCurrent')"
      >
        {{ t('markRead', lang) }}
      </button>
      <button
        type="button"
        class="rest-see"
        @click="emit('select', current.id)"
      >
        {{ t('seeCard', lang) }}
      </button>
    </div>
    <template v-if="next">
      <p class="line line-next">
        <span class="kicker">{{ current ? t('upNext', lang) : started ? t('continueWith', lang) : t('startWith', lang) }}</span>
        <span
          class="title-btn"
          role="button"
          tabindex="0"
          @click="emit('select', next.id)"
          @keydown.enter.prevent="emit('select', next.id)"
          @keydown.space.prevent="emit('select', next.id)"
        >{{ titleOf(next, lang) }}<span class="dot">.</span></span>
      </p>
      <p class="edition">
        {{ editionLine(next, volume, lang) }}
      </p>
    </template>
    <template v-else-if="narrowed">
      <p class="line">
        {{ t('nothingLeft', lang) }}
      </p>
      <p>
        <button
          type="button"
          class="quiet"
          @click="emit('clearFilters')"
        >
          {{ t('clearFilters', lang) }}
        </button>
      </p>
    </template>
    <!-- Only when true: with a book in progress or books skipped, "everything read" would be false. -->
    <p
      v-else-if="hasWorks && !current && gaps.length === 0"
      class="line line-done"
    >
      {{ t('allRead', lang) }}
    </p>
    <p
      v-if="gaps.length"
      ref="gapsEl"
      class="gaps"
      :class="{ 'gaps-list': listed, 'gaps-alone': labelAlone }"
    >
      <span class="gaps-label">{{ `${t('skipped', lang)} ` }}</span>
      <template
        v-for="(g, i) in gaps"
        :key="g.id"
      >
        <span
          v-if="i > 0"
          class="gaps-join"
        >{{ i === gaps.length - 1 ? ` ${t('and', lang)} ` : ', ' }}</span><button
          type="button"
          class="gap-btn"
          @click="emit('select', g.id)"
        >
          {{ titleOf(g, lang) }}
        </button>
      </template><span class="gaps-join">.</span>
    </p>
  </div>
</template>
