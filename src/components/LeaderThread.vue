<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Box, Side } from '../views/room'

// A gold thread from the touched title to its card. It follows the title while the ring slides to make room,
// for as long as that slide lasts, then stays. Decorative: the card names its work.
const props = defineProps<{ side: Side; box: Box }>()
const path = ref('')
const dot = ref<{ x: number; y: number } | null>(null)
const FOLLOW_MS = 700
let frame = 0

function draw(): void {
  const cover = document.querySelector('.cover')
  const title = document.querySelector('.ring-svg .t[aria-pressed="true"]')
  if (!cover || !title) {
    path.value = ''
    dot.value = null
    return
  }
  const c = cover.getBoundingClientRect()
  const t = title.getBoundingClientRect()
  const right = props.side === 'right'
  const ax = right ? t.right - c.left + 4 : t.left - c.left - 4
  const ay = t.top + t.height / 2 - c.top
  const bx = right ? props.box.x : props.box.x + props.box.w
  const by = Math.max(props.box.y + 28, Math.min(ay, props.box.y + props.box.h - 28))
  const mx = (ax + bx) / 2
  const n = (v: number) => String(Math.round(v))
  path.value = `M${n(ax)} ${n(ay)} C${n(mx)} ${n(ay)} ${n(mx)} ${n(by)} ${n(bx)} ${n(by)}`
  dot.value = { x: Math.round(ax), y: Math.round(ay) }
}

function follow(): void {
  if (typeof requestAnimationFrame !== 'function') return draw()
  cancelAnimationFrame(frame)
  const until = performance.now() + FOLLOW_MS
  const step = (): void => {
    draw()
    if (performance.now() < until) frame = requestAnimationFrame(step)
  }
  step()
}

// Once more where the ring comes to rest, however long its slide took.
const onSettled = (event: TransitionEvent): void => {
  if ((event.target as Element | null)?.classList?.contains('ring-window')) draw()
}
watch(() => [props.side, props.box.x, props.box.y, props.box.h], follow)
onMounted(() => {
  follow()
  document.addEventListener('transitionend', onSettled)
})
onBeforeUnmount(() => {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
  document.removeEventListener('transitionend', onSettled)
})
</script>

<template>
  <svg
    class="leader"
    aria-hidden="true"
    focusable="false"
  >
    <path
      v-if="path"
      :d="path"
    />
    <circle
      v-if="dot"
      :cx="dot.x"
      :cy="dot.y"
      r="2.5"
    />
  </svg>
</template>
