<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { atlasGrid, constellations } from '../views/atlas'

// A star chart tooled blind into the leather round the ring: a dark cut with a lit lip just below it, so it reads
// as pressed in. Drawn for the cover's size, and again only when that size changes. Decorative.
const size = ref({ w: 0, h: 0 })
const host = ref<SVGSVGElement | null>(null)
let observer: ResizeObserver | undefined

const grid = computed(() => (size.value.w ? atlasGrid(size.value.w, size.value.h) : []))
const groups = computed(() => (size.value.w ? constellations(size.value.w, size.value.h, Math.min(size.value.w, size.value.h) * 0.5, 5) : []))
const chain = (stars: { x: number; y: number }[]) => `M${stars.map((s) => `${s.x} ${s.y}`).join(' L')}`

function measure(): void {
  const box = host.value?.parentElement?.getBoundingClientRect()
  if (box && (Math.round(box.width) !== size.value.w || Math.round(box.height) !== size.value.h)) size.value = { w: Math.round(box.width), h: Math.round(box.height) }
}
onMounted(() => {
  measure()
  if (typeof ResizeObserver === 'function' && host.value?.parentElement) {
    observer = new ResizeObserver(measure)
    observer.observe(host.value.parentElement)
  }
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <svg
    ref="host"
    class="atlas"
    :viewBox="`0 0 ${size.w || 1} ${size.h || 1}`"
    aria-hidden="true"
    focusable="false"
  >
    <g class="atlas-lip">
      <path
        v-for="(d, i) in grid"
        :key="`l${i}`"
        :d="d"
      />
      <path
        v-for="(stars, i) in groups"
        :key="`lc${i}`"
        class="atlas-line"
        :d="chain(stars)"
      />
    </g>
    <g class="atlas-cut">
      <path
        v-for="(d, i) in grid"
        :key="`c${i}`"
        :d="d"
      />
      <path
        v-for="(stars, i) in groups"
        :key="`cc${i}`"
        class="atlas-line"
        :d="chain(stars)"
      />
    </g>
    <template
      v-for="(stars, i) in groups"
      :key="`s${i}`"
    >
      <template
        v-for="(s, j) in stars"
        :key="j"
      >
        <circle
          class="atlas-star-lip"
          :cx="s.x"
          :cy="s.y + 1.1"
          :r="s.r"
        />
        <circle
          class="atlas-star"
          :cx="s.x"
          :cy="s.y"
          :r="s.r"
        />
      </template>
    </template>
  </svg>
</template>
