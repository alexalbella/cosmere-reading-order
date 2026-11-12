<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import type { UseAppResult } from '../app/useApp'
import type { Book } from '../data/types'
import { t, titleOf, type Lang } from '../i18n'
import { bookName, phaseName } from '../i18n/labels'
import { isRecentlyAdded } from '../reading/recent'
import {
  groupBooks,
  pileWidthPercent,
  spineColumns,
  spineHeightRatio,
  spineWidthPx,
  titleColumns,
  type ShelfGroup,
} from './shelf'

const props = defineProps<{ app: UseAppResult; phone: boolean; lang: Lang; now: number }>()

const root = ref<HTMLElement | null>(null)
const groups = computed(() => groupBooks(props.app.shownBooks.value))

/** A book unlocked by hand looks like a read one. A skipped one looks unread; only its name says so. */
const stateClass = (b: Book): string => {
  const mark = props.app.markOf(b.id)
  if (mark === 'read' || props.app.isUnlocked(b.id)) return 's-read'
  return mark === 'reading' ? 's-reading' : 's-unread'
}
const classes = (b: Book): Record<string, boolean> => ({
  [stateClass(b)]: true,
  sig: props.app.nextBook.value?.id === b.id && props.app.markOf(b.id) !== 'reading',
  sel: props.app.selectedId.value === b.id,
  relief: props.app.lifted.value !== null && props.app.lifted.value !== b.world,
})
const nameOf = (b: Book): string => bookName(b, props.app.markOf(b.id), props.app.isUnlocked(b.id), props.lang)

function heading(g: ShelfGroup): string {
  if (g.phase !== null) return phaseName(g.phase, props.lang)
  return t(g.key === 'rpg' ? 'shelfRpg' : g.key === 'other' ? 'shelfOther' : 'shelfFuture', props.lang)
}

function spineStyle(b: Book): Record<string, string> {
  const title = titleOf(b, props.lang)
  const cols = titleColumns(title, b.format)
  return {
    '--cols': String(spineColumns(title, b.format, b.pages)),
    '--w': `${spineWidthPx(b.pages).toFixed(0)}px`,
    '--minw': `${cols * 17 + 8}px`,
    height: `calc(var(--tall) * ${spineHeightRatio(b.format)})`,
  }
}

// On the phone the pile opens near the book in progress, or the next one.
onMounted(async () => {
  if (!props.phone) return
  await nextTick()
  const target = root.value?.querySelector('.flat.s-reading') ?? root.value?.querySelector('.flat.sig')
  const area = root.value?.closest('.area')
  if (target && area) {
    area.scrollTop = target.getBoundingClientRect().top - area.getBoundingClientRect().top - 96
  }
})
</script>

<template>
  <div
    v-if="!phone"
    ref="root"
    class="shelf"
    role="group"
    :aria-label="t('shelfLabel', lang)"
  >
    <section
      v-for="g in groups"
      :key="g.key"
      class="board"
    >
      <h2>{{ heading(g) }}</h2>
      <div class="row">
        <button
          v-for="b in g.books"
          :key="b.id"
          type="button"
          class="vol"
          :class="classes(b)"
          :data-world="b.world"
          :style="spineStyle(b)"
          :aria-pressed="app.selectedId.value === b.id"
          :aria-label="nameOf(b)"
          @click="app.selectBook(b.id)"
        >
          <span :class="{ stamped: app.stampedId.value === b.id }">{{ titleOf(b, lang) }}</span>
          <i
            v-if="app.markOf(b.id) === 'reading'"
            class="ribbon"
            aria-hidden="true"
          />
        </button>
      </div>
    </section>
  </div>
  <div
    v-else
    ref="root"
    class="pile"
    role="group"
    :aria-label="t('shelfLabel', lang)"
  >
    <section
      v-for="g in groups"
      :key="g.key"
      class="stretch"
    >
      <h2>{{ heading(g) }}</h2>
      <ol class="flats">
        <li
          v-for="b in g.books"
          :key="b.id"
          class="flat-row"
        >
          <button
            type="button"
            class="flat"
            :class="classes(b)"
            :data-world="b.world"
            :style="{ '--width': `${pileWidthPercent(b.pages).toFixed(0)}%` }"
            :aria-pressed="app.selectedId.value === b.id"
            :aria-label="nameOf(b)"
            @click="app.selectBook(b.id)"
          >
            <span :class="{ stamped: app.stampedId.value === b.id }">
              {{ titleOf(b, lang) }}
              <em
                v-if="isRecentlyAdded(b, now)"
                class="new-tag"
              >{{ t('new', lang) }}</em>
            </span>
          </button>
          <span
            class="pp"
            aria-hidden="true"
          >{{ b.pages ?? '' }}</span>
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
/* Standing spines: three shelves fit a PC screen. The label stands in a gutter. */
.shelf { --tall: clamp(196px, 25.5vh, 320px); padding: 6px 0 4px; display: flex; flex-direction: column; gap: 12px; }
.board { display: grid; grid-template-columns: 84px minmax(0, 1fr); }
.board h2 { writing-mode: vertical-rl; transform: rotate(180deg); text-align: center; align-self: center; justify-self: center; font: 400 18px/1 var(--face-title); letter-spacing: .02em; color: var(--bone); }
/* On a short window the corner medallions reach the gutter: the label moves against the spines. */
@media (max-height: 820px) { .board h2 { justify-self: end; } }
.row { display: flex; align-items: flex-end; gap: 3px; min-height: calc(var(--tall) + 22px); padding: 18px 6px 13px; background: linear-gradient(var(--board), var(--board)) bottom / 100% 13px no-repeat; box-shadow: 0 12px 16px -6px rgba(0, 0, 0, .8); }
.vol { container-type: inline-size; position: relative; flex: 1 1 var(--w); max-width: calc(var(--w) * 1.7); min-width: max(var(--minw, 38px), 38px); display: flex; align-items: center; justify-content: center; padding: 22px 0; border-radius: 3px 3px 0 0; background-color: var(--field); background-image: var(--grain), linear-gradient(90deg, rgba(0, 0, 0, .42), rgba(255, 255, 255, .06) 28%, rgba(255, 255, 255, .02) 66%, rgba(0, 0, 0, .46)); transition: transform .3s var(--ease); }
.vol::before, .vol::after, .flat::before, .flat::after { content: ''; position: absolute; border: 0 solid var(--blind); background: rgba(0, 0, 0, .28); opacity: .55; }
.vol::before, .vol::after { left: 0; right: 0; height: 5px; border-block-width: 1px; }
.vol::before { top: 12px; }
.vol::after { bottom: 12px; }
/* The whole title is in the DOM, so name and text agree. Past the columns the spine has room for, CSS ends it in an ellipsis. */
.vol span { writing-mode: vertical-rl; transform: rotate(180deg); max-width: 100%; max-height: 100%; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: var(--cols); overflow: hidden; font: 400 15.5px/1.08 var(--face-title); letter-spacing: .03em; color: var(--blind); text-shadow: 0 -1px 0 rgba(0, 0, 0, .6); }
/* A title gets as many columns as it asks for, up to what the spine's width holds. Past that, an ellipsis and never a cut column. */
@container (max-width: 51px) { .vol span { -webkit-line-clamp: 2; } }
@container (min-width: 51.01px) and (max-width: 68px) { .vol span { -webkit-line-clamp: 3; } }
.s-read::before, .s-read::after, .s-reading::before, .s-reading::after, .sig::before, .sig::after { border-color: var(--gold); opacity: 1; }
@media (hover: hover) { .vol:hover { transform: translateY(-8px); } }
.vol.s-reading { transform: translateY(-6px); }
.vol.sig { transform: translateY(-14px); box-shadow: 0 0 0 1px var(--gold-hot), 0 8px 12px rgba(0, 0, 0, .6); }
.vol.sel { transform: translateY(-18px); box-shadow: 0 0 0 2px var(--gold-hot), 0 10px 14px rgba(0, 0, 0, .65); }
.ribbon { position: absolute; bottom: -13px; left: 50%; width: 9px; height: 27px; margin-left: -4px; background-color: var(--ribbon); clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 82%, 0 100%); }

/* The pile: flat spines, one row each, with the page count beside it */
.pile { max-width: 640px; margin-inline: auto; }
.stretch { padding-top: 10px; }
.stretch h2 { margin: 0 0 4px; font: 400 18px var(--face-title); color: var(--bone); }
.flats { display: flex; flex-direction: column; gap: 2px; }
.flat-row { display: grid; grid-template-columns: 1fr 40px; column-gap: 6px; align-items: center; }
.flat { position: relative; justify-self: center; width: var(--width); min-height: 46px; display: flex; align-items: center; justify-content: center; padding: 3px 18px; border-radius: 3px; background-color: var(--field); background-image: var(--grain), linear-gradient(180deg, rgba(255, 255, 255, .09), transparent 2px, transparent calc(100% - 3px), rgba(0, 0, 0, .34)); }
.flat::before, .flat::after { top: 0; bottom: 0; width: 5px; border-inline-width: 1px; }
.flat::before { left: 8px; }
.flat::after { right: 8px; }
.flat span { font: 400 15.5px/1.08 var(--face-title); text-align: center; letter-spacing: .02em; color: var(--blind); text-wrap: balance; }
.flat { scroll-margin-block: 10px; }
/* After both spines' base rules, or the base colour wins and a read book looks unread. */
.s-read span { color: var(--gold); }
.s-reading span { color: var(--gold-hot); }
.sig span { color: var(--bone); }
.flat.s-reading { box-shadow: 0 0 0 1px var(--gold), 0 3px 6px rgba(0, 0, 0, .5); }
.flat.s-reading::after { width: 9px; right: 6px; border: 0; background-color: var(--ribbon); opacity: 1; clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 90%, 0 100%); }
.flat.sig { box-shadow: 0 0 0 1px var(--gold-hot), 0 4px 8px rgba(0, 0, 0, .6); }
.flat.sel { box-shadow: 0 0 0 2px var(--gold-hot), 0 4px 8px rgba(0, 0, 0, .6); }

/* A lifted world: the rest drop to colourless relief, still readable */
.vol.relief, .flat.relief { background-color: var(--relief); }
.vol.relief span, .flat.relief span { color: var(--relief-text); }
.vol.relief::before, .vol.relief::after, .flat.relief::before, .flat.relief::after { border-color: var(--relief-band); opacity: .7; }
.pp { font-size: 15px; text-align: right; color: var(--blind); font-variant-numeric: lining-nums tabular-nums; }
</style>
