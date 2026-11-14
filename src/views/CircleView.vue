<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { UseAppResult } from '../app/useApp'
import type { Book, BookId, MarkStatus, WorldKey } from '../data/types'
import { t, titleOf, type Lang } from '../i18n'
import { bookName, phaseName, seriesName, worldName } from '../i18n/labels'
import { isRecentlyAdded } from '../reading/recent'
import {
  angleAt,
  arcPath,
  ASIDE_STEP,
  BAND_RADIUS,
  DISC_RADIUS,
  DOT_INSET,
  LABEL_RADIUS,
  labelBox,
  labelSpan,
  LANE_RADIUS,
  layoutRing,
  LINE_INSET,
  linePath,
  mapOrder,
  nearestBook,
  OUTER_RADIUS,
  placeLabels,
  polar,
  ringFit,
  settleTitles,
  splitArc,
  TAP_INNER_RADIUS,
  TICK_FOOT_RADIUS,
  TITLES_FROM_PX,
  turn,
  unitsFor,
  wedgePoints,
  type Arrangement,
} from './circle'
import { layerInk } from './layers'
import { usePanZoom } from './panZoom'
import RingSky from './RingSky.vue'
import { PLANET_RADIUS, planetPoint } from './sky'

const props = defineProps<{
  app: UseAppResult
  phone: boolean
  lang: Lang
  now: number
  arrangement: Arrangement
  howOpen?: boolean
  /** On the PC the ring slides and shrinks to make room for a card or a drawer beside it. */
  room?: { dx: number; scale: number }
}>()
const emit = defineEmits<{ how: []; zoomed: [zoomed: boolean] }>()

// Clockwise, as the ring shows them: the map seats the books itself, the order ring takes them as they come.
const books = computed(() => (props.arrangement === 'map' ? mapOrder(props.app.shownBooks.value) : props.app.shownBooks.value))
const layout = computed(() => layoutRing(props.app.shownBooks.value, props.arrangement))
const step = computed(() => layout.value.step)

// The ring's size on screen, for the letters to keep their size whatever the ring's.
const frame = ref<HTMLElement | null>(null)
const svg = ref<SVGSVGElement | null>(null)
const ringPx = ref(1000)
const measured = ref(false)
let observer: ResizeObserver | undefined
onMounted(() => {
  if (typeof ResizeObserver !== 'function' || !frame.value) return
  observer = new ResizeObserver(([entry]) => {
    if (!entry) return
    ringPx.value = Math.min(entry.contentRect.width, entry.contentRect.height)
    measured.value = ringPx.value > 0
  })
  observer.observe(frame.value)
})
onBeforeUnmount(() => observer?.disconnect())

// Wheel, drag and pinch move a transform on the ring's own group. Nothing in the layout knows about it.
const pan = usePanZoom(svg, { wheel: () => !props.phone })
const zoomed = computed(() => pan.view.value.k > 1.001)
watch(zoomed, (z) => emit('zoomed', z), { immediate: true })
/** The ring's size on screen with the zoom in it: what the letters are sized against. */
const reach = computed(() => ringPx.value * pan.view.value.k)
/** Too small for titles: each book is a tick, and the whole ring is the target. Unmeasured, the width decides. */
const compact = computed(() => (measured.value ? reach.value < TITLES_FROM_PX : props.phone))

// While the books travel the titles keep the setting they had: their size and their breaks change once, when
// everything has arrived, and not at the first frame of the way there.
const liveFit = computed(() => ringFit(step.value, reach.value))
const heldFit = shallowRef<ReturnType<typeof ringFit> | null>(null)
let settledFit = liveFit.value
const fit = computed(() => heldFit.value ?? liveFit.value)
const dotRadius = computed(() => (compact.value ? TICK_FOOT_RADIUS : fit.value.radius - DOT_INSET))
const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v))
const worldFont = computed(() => clamp(unitsFor(compact.value ? 12 : 15.5, reach.value), 9, 34))
const laneFont = computed(() => clamp(unitsFor(14, reach.value), 8, 24))

// The books travel when the arrangement or the filters change: every angle eases to its new place the
// short way round. What is shown is `shown`; `layout` is where it is going.
const MOVE_MS = 900
const shown = shallowRef<Record<BookId, number>>(layout.value.angles)
const moving = ref(false)
/** The books a change of filters has just brought in: they fade in where they belong. */
const entered = ref<ReadonlySet<BookId>>(new Set())
/** Set for a moment when the travel ends and the titles take their new setting. */
const resettled = ref(false)
/** A book as it was last drawn. What a change of filters takes away fades out where it stood, and touches nothing. */
interface Ghost {
  id: BookId
  world: WorldKey
  state: string
  rotation: string
  side: 1 | -1
  markX: number
  read: boolean
  box: { x: number; y: number; width: number; height: number }
  lines: string[]
  scale: string
}
const ghosts = shallowRef<Ghost[]>([])
let lastDrawn = new Map<BookId, Ghost>()
let ghostTimer: ReturnType<typeof setTimeout> | undefined
const LEAVE_MS = 280
let raf = 0
let enteredTimer: ReturnType<typeof setTimeout> | undefined
let resettledTimer: ReturnType<typeof setTimeout> | undefined
function arrive(): void {
  moving.value = false
  if (heldFit.value === null) return
  const changed = JSON.stringify(heldFit.value) !== JSON.stringify(liveFit.value)
  heldFit.value = null
  if (!changed) return
  resettled.value = true
  clearTimeout(resettledTimer)
  resettledTimer = setTimeout(() => (resettled.value = false), 360)
}
const still = (): boolean =>
  typeof requestAnimationFrame !== 'function' ||
  typeof matchMedia !== 'function' ||
  matchMedia('(prefers-reduced-motion: reduce)').matches
watch(
  () => layout.value.angles,
  (target) => {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf)
    const from = shown.value
    const gone = Object.keys(from).filter((id) => target[id] === undefined)
    if (!still() && gone.length > 0 && Object.keys(target).length > 0) {
      ghosts.value = gone.map((id) => lastDrawn.get(id)).filter((g): g is Ghost => g !== undefined)
      clearTimeout(ghostTimer)
      ghostTimer = setTimeout(() => (ghosts.value = []), LEAVE_MS)
    }
    const travels = Object.keys(target).some((id) => from[id] !== undefined && Math.abs(turn(from[id], target[id]!)) > 0.01)
    if (still() || !travels) {
      shown.value = target
      arrive()
      return
    }
    const incoming = Object.keys(target).filter((id) => from[id] === undefined)
    if (incoming.length > 0 && Object.keys(from).length > 0) {
      entered.value = new Set(incoming)
      clearTimeout(enteredTimer)
      enteredTimer = setTimeout(() => (entered.value = new Set()), MOVE_MS)
    }
    if (!moving.value) heldFit.value = settledFit
    moving.value = true
    const started = performance.now()
    const frameStep = (now: number): void => {
      const p = Math.min(1, (now - started) / MOVE_MS)
      const eased = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2
      shown.value =
        p === 1
          ? target
          : Object.fromEntries(
              Object.entries(target).map(([id, to]) => [id, from[id] === undefined ? to : from[id] + turn(from[id], to) * eased]),
            )
      if (p < 1) raf = requestAnimationFrame(frameStep)
      else arrive()
    }
    raf = requestAnimationFrame(frameStep)
  },
)
// After each render at rest, what the titles are set by is remembered, for the next travel to hold.
watch(
  [liveFit, moving],
  () => {
    if (!moving.value) settledFit = liveFit.value
  },
  { flush: 'post' },
)
onBeforeUnmount(() => {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf)
  clearTimeout(enteredTimer)
  clearTimeout(resettledTimer)
  clearTimeout(ghostTimer)
})
const angleOf = (id: BookId): number => shown.value[id] ?? layout.value.angles[id] ?? 0

// What the pointer rests on. It lasts as long as the pointer does and only ever dims: nothing is added.
const hoverId = ref<BookId | null>(null)
const hoverWorld = ref<WorldKey | null>(null)
const byMouse = (event: PointerEvent): boolean => event.pointerType === 'mouse'

const isRelief = (world: WorldKey): boolean => props.app.lifted.value !== null && props.app.lifted.value !== world

function stateClass(b: Book): string {
  const mark = props.app.markOf(b.id)
  return mark === 'read' ? 's-read' : mark === 'reading' ? 's-reading' : mark === 'skipped' ? 's-skipped' : 's-unread'
}

// Only what the engine and the filters let through is drawn, and a marker with one end is no line.
const drawn = computed(() => {
  const { angles } = layout.value
  const onRing = (id: string | null): id is string => id !== null && Object.hasOwn(angles, id)
  return props.app.visibleConnections.value.filter((c) => onRing(c.from) && onRing(c.to))
})

/** The book the lines answer to: the one under the pointer, else the selected one. */
const focusId = computed(() => hoverId.value ?? props.app.selectedId.value)
/** The books joined to the one under the pointer by a line already on the ring. Null when it has none. */
const joined = computed(() => {
  const id = hoverId.value
  if (id === null) return null
  const ids = new Set<BookId>([id])
  for (const c of drawn.value) {
    if (c.from === id) ids.add(c.to!)
    else if (c.to === id) ids.add(c.from)
  }
  return ids.size > 1 ? ids : null
})

/** How far back a book's dot stands: a story told beside its series, on a ring with titles. */
const backOf = (book: Book): number => (book.aside && !compact.value ? ASIDE_STEP : 0)
const back = computed(() => new Map(books.value.map((b) => [b.id, backOf(b)])))

/** Every title as it is set on the ring: its lines, where its text starts and its size. */
const typeset = computed(() => {
  const set = settleTitles(
    books.value.map((book) => ({
      text: titleOf(book, props.lang),
      reserve: (isRecentlyAdded(book, props.now) ? 6 : 0) + (book.aside ? 2 : 0),
      back: backOf(book),
    })),
    fit.value,
    step.value,
  )
  return new Map(books.value.map((book, i) => [book.id, set[i]!]))
})

/** The ink of the colour layer in use, as a property the stylesheet reads. With the world layer, nothing. */
function inkStyle(book: Book, mark: MarkStatus): Record<string, string> | undefined {
  const ink = layerInk(book, props.app.layer.value, mark)
  return ink ? { '--layer-ink': ink } : undefined
}

const items = computed(() => {
  const { radius } = fit.value
  return books.value.map((book) => {
    const title = titleOf(book, props.lang)
    const isNew = isRecentlyAdded(book, props.now)
    const mark = props.app.markOf(book.id)
    const set = typeset.value.get(book.id)!
    return {
      book,
      title,
      isNew,
      mark,
      lines: set.lines,
      cut: set.cut,
      scale: book.aside ? '0.92' : '1',
      name: bookName(book, mark, props.app.isUnlocked(book.id), props.lang),
      innerHit: compact.value ? TICK_FOOT_RADIUS - 6 : radius - DOT_INSET - 14,
      classes: {
        [stateClass(book)]: true,
        aside: book.aside === true,
        sig: props.app.nextBook.value?.id === book.id && mark !== 'reading',
        sel: props.app.selectedId.value === book.id,
        unlocked: props.app.isUnlocked(book.id),
        relief: isRelief(book.world),
        entered: entered.value.has(book.id),
        dim:
          (joined.value !== null && !joined.value.has(book.id)) ||
          (hoverWorld.value !== null && hoverWorld.value !== book.world),
      },
    }
  })
})

/** Where a title stands now: its side of the ring, its turn, and the boxes that side gives it. */
function place(book: Book) {
  const angle = angleOf(book.id)
  const side: 1 | -1 = angle > 180 ? -1 : 1
  return {
    side,
    rotation: (side < 0 ? angle + 90 : angle - 90).toFixed(2),
    markX: 500 + side * (dotRadius.value + backOf(book)),
    box: labelBox(side, fit.value, typeset.value.get(book.id)?.back ?? 0, typeset.value.get(book.id)?.lines.length),
  }
}
const places = computed(() => {
  const out: Record<BookId, ReturnType<typeof place>> = {}
  for (const book of books.value) out[book.id] = place(book)
  return out
})
const placed = (id: BookId) => places.value[id]!

// After each render at rest, every book is remembered as it was drawn, for the day a filter takes it away.
watch(
  [items, places, moving],
  () => {
    if (moving.value) return
    lastDrawn = new Map(
      items.value.map((item) => {
        const at = placed(item.book.id)
        return [
          item.book.id,
          {
            id: item.book.id,
            world: item.book.world,
            state: stateClass(item.book),
            rotation: at.rotation,
            side: at.side,
            markX: at.markX,
            read: item.mark === 'read',
            box: at.box,
            lines: item.lines,
            scale: item.scale,
          },
        ]
      }),
    )
  },
  { flush: 'post', immediate: true },
)

const lines = computed(() => {
  const focus = focusId.value
  const focusHasLines = drawn.value.some((c) => c.from === focus || c.to === focus)
  const r = dotRadius.value - LINE_INSET
  return drawn.value.map((c) => {
    const fresh = props.app.freshConnectionIds.value.has(c.id)
    // A new line leaves from the dot just stamped, whichever end that is. Any other runs from its book to the other.
    const [start, end] = fresh && c.to === props.app.stampedId.value ? [c.to!, c.from] : [c.from, c.to!]
    const active = c.from === focus || c.to === focus
    return {
      key: c.id,
      d: linePath(angleOf(start), angleOf(end), r + (back.value.get(start) ?? 0), r + (back.value.get(end) ?? 0)),
      active,
      fresh,
      classes: {
        [`t-${c.type}`]: true,
        theory: c.tier === 'theory',
        active,
        behind: focusHasLines && !active,
        'line-new': fresh,
      },
    }
  })
})

const arcs = computed(() =>
  layout.value.arcs.map((arc) => ({
    ...arc,
    key: `${arc.world}-${arc.from.toFixed(1)}`,
    d: arcPath(BAND_RADIUS, arc.from, arc.to),
    name: worldName(arc.world, props.lang),
  })),
)

/** Each world's planet on its band, clear of its name where the name is written. */
const planets = computed(() => {
  const at = new Map<string, { x: number; y: number }>()
  for (const arc of arcs.value) {
    const named = worldLabels.value.has(arc.key)
    const mid = (arc.from + arc.to) / 2
    const half = named ? labelSpan(arc.name, worldFont.value, 0.62, LABEL_RADIUS) / 2 : 0
    at.set(arc.key, planetPoint(arc, named ? { from: mid - half, to: mid + half } : null))
  }
  return at
})

// Names of the worlds, written along their bands. A name may run past its band, and takes the outer lane when it
// would meet its neighbour. The bands of the books in hand (selected, in progress, next) are named first, so they
// are the last to go without: where you are is never an unnamed sliver.
const worldLabels = computed(() => {
  const { angles } = layout.value
  const inHand = [props.app.selectedId.value, props.app.currentBook.value?.id, props.app.nextBook.value?.id]
    .map((id) => (id != null ? angles[id] : undefined))
    .filter((a): a is number => a !== undefined)
  const labels = placeLabels(
    arcs.value.map((a) => ({
      key: a.key,
      text: a.name,
      from: a.from,
      to: a.to,
      priority: inHand.some((angle) => angle >= a.from && angle <= a.to),
    })),
    {
      radius: LABEL_RADIUS,
      fontSize: worldFont.value,
      charWidth: 0.62,
      // A small ring has more names than rim: a third lane there, in the page's own margin.
      lanes: compact.value ? 3 : 2,
      overhang: true,
      laneGap: compact.value ? worldFont.value * 0.3 : undefined,
    },
  )
  return new Map(labels.map((l) => [l.key, l]))
})

const laneName = (lane: { kind: 'series' | 'phase'; name: string }): string =>
  lane.kind === 'phase' ? phaseName(Number(lane.name), props.lang) : seriesName(lane.name, props.lang)

/**
 * A part of a series is named after it («Nacidos de la bruma: Era 1», «Cosmere RPG: El Archivo de las Tormentas»).
 * Where the whole does not fit, what the name adds to its series may: «Era 1», «Cosmere RPG».
 */
function shortName(full: string, series: string): string {
  const parts = full.split(': ')
  return parts.find((part) => part !== series) ?? parts.at(-1)!
}

const lanes = computed(() => {
  const font = laneFont.value
  // Centred on the hairline: half a cap height inside it.
  const options = { radius: LANE_RADIUS - font * 0.33, fontSize: font, charWidth: 0.43, lanes: 1, overhang: false }
  return layout.value.lanes.map((lane, i) => {
    const key = `${lane.kind}-${lane.name}-${i}`
    const full = laneName(lane)
    const owner = lane.kind === 'series' ? books.value.find((b) => (b.subseries ?? b.series) === lane.name)?.series : undefined
    const names = full.includes(': ') ? [full, shortName(full, owner ? seriesName(owner, props.lang) : '')] : [full]
    let text = full
    let label
    if (!compact.value) {
      for (const candidate of names) {
        label = placeLabels([{ key, text: candidate, from: lane.from + 0.6, to: lane.to - 0.6 }], options)[0]
        if (label) {
          text = candidate
          break
        }
      }
    }
    const gap = label ? labelSpan(text, font, 0.43, LANE_RADIUS) + ((font * 1.2) / LANE_RADIUS) * (180 / Math.PI) : 0
    return { ...lane, key, text, label, parts: splitArc(LANE_RADIUS, lane.from, lane.to, gap) }
  })
})

const needle = computed(() => {
  const selected = props.app.selectedId.value
  if (selected === null || !Object.hasOwn(layout.value.angles, selected)) return null
  return { rotation: angleOf(selected).toFixed(2) }
})

// One tab stop for the whole ring: the selected book, or where the arrows were left. Arrows only
// move the focus. Selecting stays with Enter and Space, and marking stays on the plate.
const walked = ref<BookId | null>(null)
watch(
  () => props.app.selectedId.value,
  () => (walked.value = null),
)
const tabStop = computed(() => {
  const onRing = (id: BookId | null) => id !== null && Object.hasOwn(layout.value.angles, id)
  if (onRing(walked.value)) return walked.value
  if (onRing(props.app.selectedId.value)) return props.app.selectedId.value
  return books.value[0]?.id ?? null
})

function walkTo(event: KeyboardEvent, index: number): void {
  const count = books.value.length
  const target = (index + count) % count
  walked.value = books.value[target]?.id ?? null
  const titles = (event.currentTarget as Element).parentElement?.querySelectorAll<SVGGElement>('.t')
  titles?.[target]?.focus()
}

/** A zoomed ring follows the focus, so a title walked to with the keys is never off the edge. */
function follow(id: BookId): void {
  if (!zoomed.value) return
  const [x, y] = polar(angleOf(id), (fit.value.radius + OUTER_RADIUS) / 2)
  pan.centreOn(x, y)
}

// On a ring of ticks a tick's box is small, so the target is the whole ring: a tap picks the nearest tick.
function tapRing(event: MouseEvent): void {
  if (pan.dragged()) return
  if (!compact.value) return
  const point = pan.toRing(event)
  if (!point) return
  const [x, y] = point
  if (Math.hypot(x - 500, y - 500) < TAP_INNER_RADIUS) return
  const id = nearestBook(layout.value.angles, angleAt(x, y))
  if (id !== null) props.app.selectBook(id)
}

/** The book a zoom from the buttons goes to: the one selected, else the one to read next, else the first. */
const anchor = computed(() => {
  const onRing = (id: BookId | null | undefined): id is BookId => id != null && Object.hasOwn(layout.value.angles, id)
  const id = [props.app.selectedId.value, props.app.currentBook.value?.id, props.app.nextBook.value?.id, books.value[0]?.id].find(onRing)
  return id ?? null
})
function zoomStep(factor: number): void {
  const id = anchor.value
  const [x, y] = id === null ? [500, 500] : polar(angleOf(id), (fit.value.radius + OUTER_RADIUS) / 2)
  pan.glide(pan.towards(factor, x, y))
}
/**
 * The lens's radius, as a share of the ring's side. From 1280 px the controls sit in the corner of the square, three
 * rows while the lens is up (the key, «Ver entero», the two zoom buttons), so the lens stops short of them and its
 * rim is whole. Below, the controls are a row above the ring.
 */
const CLUSTER = { width: 122, height: 150, clear: 10 }
const lens = computed(() => {
  const side = ringPx.value
  if (props.phone || !measured.value) return 49.4
  const toCluster = Math.hypot(side / 2 - CLUSTER.width, side / 2 - CLUSTER.height) - CLUSTER.clear
  return Math.max(30, Math.min(49.4, (toCluster / side) * 100))
})

/** Dots and marks grow more slowly than the ring, so a close view is not a view of dots. */
const markScale = computed(() => 1 / Math.sqrt(pan.view.value.k))

defineExpose({ angleOf: (id: BookId): number | null => (Object.hasOwn(layout.value.angles, id) ? angleOf(id) : null) })

function pick(id: BookId): void {
  if (pan.dragged()) return
  props.app.selectBook(id)
}
</script>

<template>
  <div
    ref="frame"
    class="ring-frame"
  >
    <div class="ring">
      <!-- Before the ring in the document: from the ring, the next stop is the plate. -->
      <div
        class="zoom"
        :style="room && room.scale < 1 ? { transform: `translate(${room.dx.toFixed(1)}px, 0)` } : undefined"
        role="group"
        :aria-label="t('zoom', lang)"
      >
        <button
          type="button"
          class="zoom-btn ring-how"
          :aria-pressed="howOpen === true"
          @click="emit('how')"
        >
          {{ t('howTitle', lang) }}
        </button>
        <button
          v-if="zoomed"
          type="button"
          class="zoom-btn zoom-reset"
          @click="pan.reset()"
        >
          {{ t('zoomReset', lang) }}
        </button>
        <button
          type="button"
          class="zoom-btn"
          :aria-label="t('zoomOut', lang)"
          :disabled="!zoomed"
          @click="zoomStep(1 / 1.6)"
        >
          <svg
            viewBox="0 0 20 20"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            aria-hidden="true"
          ><path d="M4 10h12" /></svg>
        </button>
        <button
          type="button"
          class="zoom-btn"
          :aria-label="t('zoomIn', lang)"
          :disabled="pan.view.value.k >= pan.max"
          @click="zoomStep(1.6)"
        >
          <svg
            viewBox="0 0 20 20"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            aria-hidden="true"
          ><path d="M4 10h12M10 4v12" /></svg>
        </button>
      </div>
      <div
        class="ring-window"
        :class="{ lens: zoomed, 'making-room': room && room.scale < 1 }"
        :style="{ '--lens': `${lens.toFixed(2)}%`, transform: room && room.scale < 1 ? `translate(${room.dx.toFixed(1)}px, 0) scale(${room.scale.toFixed(3)})` : undefined }"
      >
        <svg
          ref="svg"
          class="ring-svg"
          :class="{ 'with-ticks': compact, zoomed, moving, resettled, grabbing: pan.dragging.value }"
          viewBox="0 0 1000 1000"
          role="group"
          :aria-label="t(arrangement === 'map' ? 'ringLabelMap' : 'ringLabel', lang)"
          :style="{ '--ring-font': `${fit.fontSize.toFixed(2)}px`, '--world-font': `${worldFont.toFixed(2)}px`, '--lane-font': `${laneFont.toFixed(2)}px` }"
          @click="tapRing"
          @dblclick.prevent="pan.toggleAt($event)"
          v-on="pan.handlers"
        >
          <defs>
            <path
              v-for="label in worldLabels.values()"
              :id="`world-path-${label.key}`"
              :key="label.key"
              :d="label.d"
            />
            <template
              v-for="lane in lanes"
              :key="lane.key"
            >
              <path
                v-if="lane.label"
                :id="`lane-path-${lane.key}`"
                :d="lane.label.d"
              />
            </template>
          </defs>
          <g :transform="pan.transform.value">
            <RingSky :arcs="layout.arcs" />
            <g
              class="lanes"
              aria-hidden="true"
            >
              <g
                v-for="lane in lanes"
                :key="lane.key"
                class="lane"
                :class="`lane-${lane.kind}`"
              >
                <path
                  v-for="(part, i) in lane.parts"
                  :key="i"
                  class="lane-line"
                  :d="part"
                />
                <text
                  v-if="lane.label"
                  class="lane-name"
                >
                  <textPath
                    :href="`#lane-path-${lane.key}`"
                    startOffset="50%"
                    text-anchor="middle"
                  >{{ lane.text }}</textPath>
                </text>
              </g>
            </g>
            <path
              v-for="line in lines"
              :key="line.key"
              class="linea"
              :class="line.classes"
              :d="line.d"
              pathLength="1"
              aria-hidden="true"
            />
            <!-- One pass of light along the lines of the book in hand, from its end to the other. -->
            <template
              v-for="line in lines"
              :key="`glint-${focusId}-${line.key}`"
            >
              <path
                v-if="line.active && !line.fresh"
                class="glint"
                :d="line.d"
                pathLength="1"
                aria-hidden="true"
              />
            </template>
            <circle
              class="disc"
              cx="500"
              cy="500"
              :r="DISC_RADIUS"
            />
            <circle
              class="disc-line"
              cx="500"
              cy="500"
              :r="DISC_RADIUS"
            />
            <circle
              class="disc-line fine"
              cx="500"
              cy="500"
              :r="DISC_RADIUS - 7"
            />
            <foreignObject
              class="seal-box"
              :x="500 - DISC_RADIUS * 0.8"
              :y="500 - DISC_RADIUS * 0.8"
              :width="DISC_RADIUS * 1.6"
              :height="DISC_RADIUS * 1.6"
            >
              <span
                class="seal ring-seal"
                aria-hidden="true"
              />
            </foreignObject>
            <g
              v-for="(item, index) in items"
              :key="item.book.id"
              class="t"
              :class="item.classes"
              :data-world="item.book.world"
              :style="inkStyle(item.book, item.mark)"
              role="button"
              :tabindex="item.book.id === tabStop ? 0 : -1"
              :aria-pressed="app.selectedId.value === item.book.id"
              :aria-label="item.name"
              :transform="`rotate(${placed(item.book.id).rotation} 500 500)`"
              @click.stop="pick(item.book.id)"
              @focus="follow(item.book.id)"
              @pointerenter="byMouse($event) && (hoverId = item.book.id)"
              @pointerleave="hoverId = null"
              @keydown.enter.prevent="app.selectBook(item.book.id)"
              @keydown.space.prevent="app.selectBook(item.book.id)"
              @keydown.right.prevent="walkTo($event, index + 1)"
              @keydown.down.prevent="walkTo($event, index + 1)"
              @keydown.left.prevent="walkTo($event, index - 1)"
              @keydown.up.prevent="walkTo($event, index - 1)"
            >
              <title v-if="compact">{{ item.title }}</title>
              <polygon
                class="t-hit"
                :points="wedgePoints(placed(item.book.id).side, step, item.innerHit, compact ? 420 : OUTER_RADIUS)"
              />
              <g
                class="ink"
                :class="{ stamped: app.stampedId.value === item.book.id }"
              >
                <template v-if="compact">
                  <line
                    class="tick"
                    :x1="500 + placed(item.book.id).side * (TICK_FOOT_RADIUS + 12)"
                    y1="500"
                    :x2="500 + placed(item.book.id).side * (OUTER_RADIUS + 6)"
                    y2="500"
                  />
                  <circle
                    v-if="item.mark === 'read'"
                    class="tick-foil"
                    :cx="500 + placed(item.book.id).side * (TICK_FOOT_RADIUS + 2)"
                    cy="500"
                    r="4.5"
                  />
                </template>
                <template v-else>
                  <path
                    v-if="item.mark === 'reading'"
                    class="ribbon-mark"
                    :d="`M${placed(item.book.id).markX - 6} 491 h12 v18 l-6 -5 l-6 5 z`"
                    :transform="`rotate(${placed(item.book.id).side > 0 ? -90 : 90} ${placed(item.book.id).markX} 500)`"
                  />
                  <template v-else-if="item.classes.sig">
                    <circle
                      class="next-dot"
                      :cx="placed(item.book.id).markX"
                      cy="500"
                      :r="4 * markScale"
                    />
                    <circle
                      class="next-ring"
                      :cx="placed(item.book.id).markX"
                      cy="500"
                      :r="8 * markScale"
                    />
                  </template>
                  <circle
                    v-else
                    class="mark-dot"
                    :cx="placed(item.book.id).markX"
                    cy="500"
                    :r="(item.mark === 'read' ? 4.4 : 3.4) * markScale"
                  />
                  <foreignObject
                    :x="placed(item.book.id).box.x"
                    :y="placed(item.book.id).box.y"
                    :width="placed(item.book.id).box.width"
                    :height="placed(item.book.id).box.height"
                  >
                    <div
                      class="t-box"
                      :class="{ 't-end': placed(item.book.id).side < 0 }"
                      :style="{ '--t-scale': item.scale }"
                      :title="item.title"
                    >
                      <div class="t-fit">
                        <div
                          v-for="(line, i) in item.lines"
                          :key="i"
                          class="t-line"
                        >
                          <template v-if="item.cut">
                            <span class="t-text">{{ line.slice(0, item.cut) }}</span><span class="t-text t-tail">{{ line.slice(item.cut) }}</span>
                          </template>
                          <span
                            v-else
                            class="t-text"
                          >{{ line }}</span>
                          <span
                            v-if="item.isNew && i === item.lines.length - 1"
                            class="new-mark"
                            aria-hidden="true"
                          >{{ t('new', lang) }}</span>
                        </div>
                      </div>
                    </div>
                  </foreignObject>
                </template>
              </g>
            </g>
            <!-- What a filter has just taken away, fading where it stood. Nothing here can be reached or read aloud. -->
            <g
              v-for="ghost in ghosts"
              :key="`ghost-${ghost.id}`"
              class="t-ghost"
              :class="ghost.state"
              :data-world="ghost.world"
              :transform="`rotate(${ghost.rotation} 500 500)`"
              aria-hidden="true"
            >
              <line
                v-if="compact"
                class="tick"
                :x1="500 + ghost.side * (TICK_FOOT_RADIUS + 12)"
                y1="500"
                :x2="500 + ghost.side * (OUTER_RADIUS + 6)"
                y2="500"
              />
              <template v-else>
                <circle
                  class="mark-dot"
                  :cx="ghost.markX"
                  cy="500"
                  :r="ghost.read ? 4.4 : 3.4"
                />
                <foreignObject
                  :x="ghost.box.x"
                  :y="ghost.box.y"
                  :width="ghost.box.width"
                  :height="ghost.box.height"
                >
                  <div
                    class="t-box"
                    :class="{ 't-end': ghost.side < 0 }"
                    :style="{ '--t-scale': ghost.scale }"
                  >
                    <div class="t-fit">
                      <div
                        v-for="(line, i) in ghost.lines"
                        :key="i"
                        class="t-line"
                      >
                        <span class="t-text">{{ line }}</span>
                      </div>
                    </div>
                  </div>
                </foreignObject>
              </template>
            </g>
            <!-- For the mouse. The keyboard and touch route to a world is its name on the plate. -->
            <g
              v-for="arc in arcs"
              :key="arc.key"
              class="arc"
              :class="{ lifted: app.lifted.value === arc.world, relief: isRelief(arc.world), named: worldLabels.has(arc.key) }"
              :data-arc="arc.world"
              :data-world="arc.world"
              @pointerenter="byMouse($event) && (hoverWorld = arc.world)"
              @pointerleave="hoverWorld = null"
              v-on="compact ? {} : { click: () => !pan.dragged() && app.toggleLift(arc.world) }"
            >
              <title v-if="!compact">{{ arc.name }}</title>
              <path
                class="arc-hit"
                :d="arc.d"
              />
              <path
                class="arc-band"
                :d="arc.d"
                :style="isRelief(arc.world) ? undefined : { '--arc-tone': `var(--tone-${arc.world})` }"
              />
              <g
                v-if="planets.get(arc.key)"
                class="planet"
                :transform="`translate(${planets.get(arc.key)!.x} ${planets.get(arc.key)!.y})`"
                aria-hidden="true"
              >
                <ellipse
                  class="planet-ring"
                  rx="24"
                  ry="7"
                  transform="rotate(-18)"
                />
                <circle
                  class="planet-disc"
                  :r="PLANET_RADIUS"
                  :fill="`url(#sky-planet-${arc.world})`"
                />
                <use
                  class="planet-emblem"
                  :href="`#emblem-${arc.world}`"
                  x="-13"
                  y="-13"
                  width="26"
                  height="26"
                />
              </g>
              <text
                v-if="worldLabels.has(arc.key)"
                class="world-name"
                aria-hidden="true"
              >
                <textPath
                  :href="`#world-path-${arc.key}`"
                  startOffset="50%"
                  text-anchor="middle"
                >{{ arc.name }}</textPath>
              </text>
            </g>
            <!-- Where the reading order begins: the first book is the first clockwise from here. -->
            <path
              v-if="arrangement === 'order' && items.length > 1"
              class="head-mark"
              :d="`M500 ${500 - LANE_RADIUS - 13} l3.2 9.8 l9.8 3.2 l-9.8 3.2 l-3.2 9.8 l-3.2 -9.8 l-9.8 -3.2 l9.8 -3.2 z`"
              aria-hidden="true"
            />
            <g
              v-if="needle"
              class="needle"
              :transform="`rotate(${needle.rotation} 500 500)`"
            >
              <line
                x1="500"
                :y1="500 - BAND_RADIUS - 9"
                x2="500"
                :y2="500 - BAND_RADIUS + 9"
              />
            </g>
          </g>
        </svg>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* From 1280 px the ring fills the cover's height; below it, the width of the column. */
.ring-frame { container-type: size; width: 100%; height: 100%; display: grid; place-items: center; }
.ring { position: relative; width: min(100cqw, 100cqh); height: min(100cqw, 100cqh); }
.ring-svg { display: block; width: 100%; height: 100%; overflow: visible; touch-action: pan-y; user-select: none; -webkit-user-select: none; }
/* Zoomed in, the ring is cut at its own square and takes the finger for itself. */
.ring-svg.zoomed { overflow: hidden; clip-path: circle(var(--lens, 49.4%)); touch-action: none; cursor: grab; }
/* The close view is a lens on the map: a round window with the cover's double gold frame, clear of the corners. */
.ring-window { position: relative; width: 100%; height: 100%; }
.ring-window.lens::after { content: ''; position: absolute; inset: calc(50% - var(--lens, 49.4%)); border-radius: 50%; border: 1px solid var(--gold); outline: 2px solid var(--gold); outline-offset: 3px; pointer-events: none; }
.ring-svg.grabbing { cursor: grabbing; }
.seal-box { pointer-events: none; }
.ring-seal { width: 100%; height: 100%; color: var(--gold); }

/* The lane of series: a hairline with the name set into it. */
.lane-line { fill: none; stroke: var(--gold-dark); stroke-width: 1.2; }
.lane-name { font: italic 400 var(--lane-font, 15px)/1 var(--face-text); fill: var(--second); }
/* A phase is a stage of the reading, not a land: its line is gold thread, and its name is set like a series', never like a world's. */
.lane-phase .lane-line { stroke: var(--gold-line); stroke-width: 1.4; }
.head-mark { fill: var(--gold); pointer-events: none; }
.moving .head-mark { opacity: 0; }
.lanes, .arc, .world-name { transition: opacity 260ms ease; }
/* While the books travel, the names of where they were stand down. */
.moving .lanes, .moving .arc { opacity: 0; transition-duration: 120ms; }

.arc { cursor: pointer; }
.arc-hit { fill: none; stroke: transparent; stroke-width: 26; }
/* Without a tone of its own a band is colourless relief. */
.arc-band { fill: none; stroke: var(--arc-tone, var(--relief-tone)); stroke-width: 8; transition: stroke 300ms var(--ease), stroke-width 300ms var(--ease); }
.arc.lifted .arc-band { stroke-width: 12; }
.world-name { font: 500 var(--world-font, 17px)/1 var(--face-caps); letter-spacing: .06em; fill: var(--ink-world); transition: fill 300ms var(--ease); }
.arc.relief .world-name { fill: var(--relief-ring); }
.arc.lifted .world-name { fill: var(--bone); }
@media (hover: hover) {
  .arc:hover .arc-band { stroke-width: 12; }
  .arc:hover .world-name { fill: var(--bone); }
}
/* On the ticks the bands are part of the ring: a tap on them goes on to the nearest tick. */
.with-ticks .arc { pointer-events: none; }

.needle { pointer-events: none; }
.needle line { stroke: var(--gold-hot); stroke-width: 4; stroke-linecap: square; }
.needle { transition: transform 0s; }

/* Lines are gold thread, and the weight says what kind: the heavier, the more it matters. */
.linea { fill: none; stroke: var(--gold-line); stroke-width: 1.6; pointer-events: none; transition: stroke 150ms ease, stroke-opacity 150ms ease; }
.linea.t-major { stroke-width: 3.8; }
.linea.t-significant { stroke-width: 2.6; }
.linea.t-minor { stroke-width: 1.6; }
.linea.t-egg { stroke-width: .9; }
/* A theory is a broken line. Its dashes are shares of the line, which is measured as 1. */
.linea.theory { stroke-dasharray: .018 .012; }
.linea.behind { stroke-opacity: .5; }
.linea.active { stroke: var(--gold-hot); stroke-opacity: 1; }
.linea.active.t-major { stroke-width: 4.4; }
.linea.active.t-significant { stroke-width: 3.1; }
.linea.active.t-minor { stroke-width: 2; }
.linea.active.t-egg { stroke-width: 1.3; }
.glint { fill: none; stroke: var(--bone); stroke-width: 2.6; stroke-linecap: round; stroke-dasharray: .1 1; stroke-dashoffset: .1; opacity: 0; pointer-events: none; }

/* The lines run under the disc and show through it, faint, so a line across the ring is seen whole. */
.disc { fill: var(--deep); fill-opacity: .6; transition: fill 500ms var(--ease); }
.disc-line { fill: none; stroke: var(--gold); stroke-width: 1.4; }
.disc-line.fine { stroke: var(--gold-line); stroke-width: .8; }

/* A title wears its world's colour. Its state is never colour alone: dot, ribbon, weight, italic and underline say it too. */
.t { cursor: pointer; outline: none; transition: opacity 180ms ease; }
.t.dim { opacity: .32; }
.t-hit { fill: transparent; }
.t-ghost { pointer-events: none; }
.t-box { display: flex; flex-direction: column; justify-content: center; height: 100%; font: 400 calc(var(--ring-font, 18px) * var(--t-scale, 1))/1.02 var(--face-text); color: var(--ink-unread); transition: color 150ms ease; }
.t-line { display: flex; align-items: baseline; gap: .4em; }
.t-end .t-line { justify-content: flex-end; }
/* The whole title is in the DOM, so name and text agree. Only this shortens what is seen.
   The padding keeps accents and descenders out of the clip, since the line height is tight. */
/* The last word of a shortened title is never the part that goes. */
.t-tail { flex: none; margin-left: -.15em; overflow: visible; }
.t-text { min-width: 0; padding: .14em .06em; margin: -.14em -.06em; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.new-mark { flex: none; font: 500 .8em var(--face-caps); color: var(--gold-hot); }
.mark-dot { fill: none; stroke: var(--ink-unread); stroke-width: 1.2; }
.s-read .t-box { color: var(--ink-world); font-weight: 500; }
.s-read .mark-dot { fill: var(--gold); stroke: var(--gold); }
.s-skipped .t-box { font-style: italic; }
.s-reading .t-box { color: var(--gold-hot); font-weight: 500; }
/* A colour layer repaints the title by one public fact. The mark keeps its dot, ribbon, weight and italic, and the
   rules after this one keep theirs: the next book, the chosen one, the one under the pointer, a world in relief. */
:where(.app[data-layer]:not([data-layer=world])) .t .t-box { color: var(--layer-ink, var(--ink-unread)); }
.t.sig .t-box { color: var(--bone); font-weight: 500; }
.ribbon-mark { fill: var(--ribbon); stroke: var(--gold-hot); stroke-width: 1; }
.next-dot { fill: var(--bone); }
.next-ring { fill: none; stroke: var(--bone); stroke-width: 1.2; }
/* Relief is quieter than any world's unread ink, so the lifted world is the brightest thing on the ring. */
.t.relief .t-box { color: var(--relief-ring); font-weight: 400; }
.t.relief .mark-dot { fill: none; stroke: var(--relief-ring); }
.t.relief.s-read .mark-dot { fill: var(--relief-ring); }
.t.unlocked .mark-dot { stroke: var(--danger); stroke-width: 1.8; }
@media (hover: hover) { .t:hover .t-box { color: var(--bone); } }
.t.sel .t-box { font-weight: 500; color: var(--bone); }
.t.sel .t-text { text-decoration: underline; text-decoration-thickness: 1px; }
/* The focus ring hugs the title itself. On a ring of ticks, where there is no title, it is the tick's own wedge. */
.t-fit { min-width: 0; max-width: 100%; align-self: flex-start; padding: 0 .28em; margin: 0 -.28em; }
.t-end .t-fit { align-self: flex-end; }
.t:focus-visible .t-fit { outline: 1.5px solid var(--gold-hot); outline-offset: 1px; }
.with-ticks .t:focus-visible .t-hit { stroke: var(--gold-hot); stroke-width: 2; }

/* A ring too small for titles: a tick a book, in its world's colour, with a point of foil at its foot when read. */
.tick { stroke: var(--ink-unread); stroke-opacity: .55; stroke-width: 7; }
.tick-foil { fill: var(--gold); }
.s-read .tick { stroke: var(--ink-world); stroke-opacity: 1; }
.s-reading .tick, .t.sig .tick { stroke: var(--gold-hot); stroke-opacity: 1; stroke-width: 11; }
:where(.app[data-layer]:not([data-layer=world])) .t .tick { stroke: var(--layer-ink, var(--ink-unread)); stroke-opacity: 1; }
.t.relief .tick { stroke: var(--relief-ring); }
.t.unlocked .tick { stroke: var(--danger); stroke-opacity: 1; }
.t.sel .tick { stroke: var(--bone); stroke-opacity: 1; stroke-width: 13; }

/* The key to the map and the zoom: in the corners the circle leaves free. */
.zoom-btn.ring-how[aria-pressed=true]:not(:disabled) { background-color: var(--gold); border-color: var(--gold); color: var(--ink); }
/* From 1280 px: rows in the corner. The key, «Ver entero» while the lens is up, and the two zoom buttons. */
.zoom { position: absolute; z-index: 1; right: 0; bottom: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.ring-how, .zoom-reset { grid-column: 1 / -1; white-space: nowrap; }
.zoom-btn { min-width: 44px; height: 44px; display: grid; place-items: center; padding: 0 12px; border: 1px solid var(--gold-dark); background-color: var(--deep); color: var(--gold); font: 500 14px/1 var(--face-caps); letter-spacing: .03em; transition: color 150ms, border-color 150ms; }
.zoom-btn:hover:not(:disabled) { color: var(--gold-hot); border-color: var(--gold); }
.zoom-btn:disabled { color: var(--gold-dark); cursor: default; }

@media (prefers-reduced-motion: no-preference) {
  /* Backwards only: once the light has passed, nothing is left running or held. */
  .glint { animation: glint 820ms var(--ease) backwards; }
  /* A book the filters bring in fades in at its place, and titles that take a new setting on arrival settle into it. */
  .t.entered { animation: ring-arrive 520ms var(--ease) backwards; }
  .resettled .t-box { animation: ring-arrive 320ms var(--ease) backwards; }
  .t-ghost { animation: ring-leave 280ms ease forwards; }
}
@keyframes ring-arrive { from { opacity: 0; } }
@keyframes ring-leave { to { opacity: 0; } }
@keyframes glint {
  0% { opacity: 0; stroke-dashoffset: .1; }
  12% { opacity: .95; }
  82% { opacity: .9; }
  100% { opacity: 0; stroke-dashoffset: -1; }
}

@media (max-width: 1279px) {
  .ring-frame { container-type: normal; height: auto; display: block; }
  .ring { width: 100%; height: auto; max-width: 560px; margin-inline: auto; }
  .ring-window, .ring-svg { height: auto; }
  /* Below 1280 px they are a row above the ring. */
  .ring { display: flex; flex-direction: column; }
  .zoom { position: static; display: flex; align-items: center; justify-content: flex-end; margin-bottom: 14px; }
  .ring-window { margin-bottom: 10px; }
  .ring-how { margin-right: auto; }
}
</style>
