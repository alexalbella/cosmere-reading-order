import { computed, ref, type Ref } from 'vue'

/** A scale and an offset, in the units of the 1000 × 1000 viewBox. */
export interface PanView {
  k: number
  x: number
  y: number
}

const SIZE = 1000
const MAX = 6
const GLIDE_MS = 240
/** A drag shorter than this, in pixels, is a click that wobbled. */
const DRAG_PX = 5

/** Keeps the ring over its square: zoomed in it can be moved, and it never leaves a gap at an edge. */
export function settle(view: PanView): PanView {
  const k = Math.max(1, Math.min(MAX, view.k))
  const limit = SIZE * (1 - k)
  return { k, x: Math.max(limit, Math.min(0, view.x)), y: Math.max(limit, Math.min(0, view.y)) }
}

/** Zooms about a point of the viewBox, which stays where it is on screen. */
export function zoomAbout(view: PanView, factor: number, px: number, py: number): PanView {
  const k = Math.max(1, Math.min(MAX, view.k * factor))
  const ratio = k / view.k
  return settle({ k, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio })
}

/**
 * Zoom and pan for the ring: wheel, drag, pinch, double click and buttons. It only ever moves one
 * transform, so the layout underneath knows nothing of it. `wheel` says whether a plain wheel zooms;
 * where the page scrolls it does not, and a pinch on a trackpad (a wheel with Ctrl) always does.
 */
export function usePanZoom(svg: Ref<SVGSVGElement | null>, options: { wheel: () => boolean }) {
  const view = ref<PanView>({ k: 1, x: 0, y: 0 })
  const dragging = ref(false)
  const transform = computed(() => {
    const { k, x, y } = view.value
    return k === 1 ? undefined : `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${k.toFixed(4)})`
  })

  /** A pointer's place on the viewBox, before the zoom. Null while the ring has no size. */
  function onBox(event: { clientX: number; clientY: number }): [number, number] | null {
    const box = svg.value?.getBoundingClientRect()
    if (!box || box.width === 0 || box.height === 0) return null
    return [((event.clientX - box.left) / box.width) * SIZE, ((event.clientY - box.top) / box.height) * SIZE]
  }

  /** A pointer's place on the ring itself, with the zoom undone. */
  function toRing(event: { clientX: number; clientY: number }): [number, number] | null {
    const point = onBox(event)
    if (!point) return null
    const { k, x, y } = view.value
    return [(point[0] - x) / k, (point[1] - y) / k]
  }

  function zoomBy(factor: number, about: [number, number] = [SIZE / 2, SIZE / 2]): void {
    stopGlide()
    view.value = zoomAbout(view.value, factor, about[0], about[1])
  }

  // A press of a button or a double click is a jump: it is eased, so the eye keeps its place. Wheel, pinch and
  // drag follow the hand and are never eased. With reduced motion, or where frames cannot be asked for, it is instant.
  let gliding = 0
  const instant = (): boolean =>
    typeof requestAnimationFrame !== 'function' ||
    typeof matchMedia !== 'function' ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  function stopGlide(): void {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(gliding)
  }
  function glide(target: PanView): void {
    stopGlide()
    const to = settle(target)
    if (instant()) {
      view.value = to
      return
    }
    const from = view.value
    const started = performance.now()
    const frame = (now: number): void => {
      const p = Math.min(1, (now - started) / GLIDE_MS)
      const eased = 1 - (1 - p) ** 3
      const between = (a: number, b: number): number => a + (b - a) * eased
      view.value = p === 1 ? to : { k: between(from.k, to.k), x: between(from.x, to.x), y: between(from.y, to.y) }
      if (p < 1) gliding = requestAnimationFrame(frame)
    }
    gliding = requestAnimationFrame(frame)
  }

  function reset(): void {
    glide({ k: 1, x: 0, y: 0 })
  }

  /** The view at `factor` times this zoom with a point of the ring in the middle of the square. */
  function towards(factor: number, x: number, y: number): PanView {
    const k = Math.max(1, Math.min(MAX, view.value.k * factor))
    return settle({ k, x: SIZE / 2 - x * k, y: SIZE / 2 - y * k })
  }

  /** Brings a point of the ring to the middle of the square. */
  function centreOn(x: number, y: number): void {
    stopGlide()
    view.value = towards(1, x, y)
  }

  function toggleAt(event: MouseEvent): void {
    if (view.value.k > 1.001) return reset()
    const point = onBox(event)
    if (point) glide(zoomAbout(view.value, 2.4, point[0], point[1]))
  }

  const pointers = new Map<number, { x: number; y: number }>()
  let travelled = 0
  let lastDragAt = 0
  let pinch = 0

  function onWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !options.wheel()) return
    const point = onBox(event)
    if (!point) return
    event.preventDefault()
    // A pinch on a trackpad comes in small steps, a wheel in large ones.
    const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.012 : 0.0016))
    zoomBy(factor, point)
  }

  function onPointerDown(event: PointerEvent): void {
    stopGlide()
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.size === 1) travelled = 0
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y)
    }
  }

  function onPointerMove(event: PointerEvent): void {
    const before = pointers.get(event.pointerId)
    if (!before) return
    const box = svg.value?.getBoundingClientRect()
    if (!box || box.width === 0) return
    const scale = SIZE / box.width
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      const apart = Math.hypot(a!.x - b!.x, a!.y - b!.y)
      const middle = onBox({ clientX: (a!.x + b!.x) / 2, clientY: (a!.y + b!.y) / 2 })
      if (pinch > 0 && middle) zoomBy(apart / pinch, middle)
      pinch = apart
      travelled = DRAG_PX + 1
      dragging.value = true
      return
    }
    if (view.value.k <= 1.001) return
    travelled += Math.hypot(event.clientX - before.x, event.clientY - before.y)
    if (travelled < DRAG_PX) return
    if (!dragging.value) {
      dragging.value = true
      svg.value?.setPointerCapture?.(event.pointerId)
    }
    const { k, x, y } = view.value
    view.value = settle({ k, x: x + (event.clientX - before.x) * scale, y: y + (event.clientY - before.y) * scale })
  }

  function onPointerEnd(event: PointerEvent): void {
    pointers.delete(event.pointerId)
    if (pointers.size < 2) pinch = 0
    if (pointers.size === 0) {
      if (dragging.value) lastDragAt = Date.now()
      dragging.value = false
    }
  }

  /** The click that ends a drag is not a click on what was under it. */
  const dragged = (): boolean => Date.now() - lastDragAt < 250

  return {
    view,
    max: MAX,
    transform,
    dragging,
    dragged,
    toRing,
    zoomBy,
    glide,
    towards,
    reset,
    centreOn,
    toggleAt,
    handlers: {
      wheel: onWheel,
      pointerdown: onPointerDown,
      pointermove: onPointerMove,
      pointerup: onPointerEnd,
      pointercancel: onPointerEnd,
      pointerleave: (event: PointerEvent) => {
        if (!dragging.value) pointers.delete(event.pointerId)
      },
    },
  }
}
