<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { WORLD_KEYS } from '../data/types'
import { WORLDS } from '../design/worlds'
import type { WorldArc } from './circle'
import { NEBULA_STOPS, nebulaWedge, NIGHT_STOPS, SKY_RADIUS, starField } from './sky'

// The living sky inside the ring: a smooth ground in the world's colour, the night over it, a faint nebula behind
// each world's arc, dotted orbits, three layers of stars that drift and shift with the mouse, and now and then a
// comet. It reads the ring's layout and nothing else: no mark, no connection. Motion only under no-preference.
const props = defineProps<{ arcs: WorldArc[] }>()

const STARS = starField(7, 340)
const LAYERS = [0, 1, 2] as const
const ORBITS = [150, 240, 330, 420]
const PARALLAX = [3, 7, 13]
const COMET_MS = 11_000

const layers = LAYERS.map((layer) => STARS.map((s, i) => ({ ...s, i })).filter((s) => s.layer === layer))
const wedges = computed(() => props.arcs.map((arc) => ({ key: `${arc.world}-${arc.from.toFixed(1)}`, world: arc.world, d: nebulaWedge(arc, SKY_RADIUS, 1) })))

const pointer = ref({ x: 0, y: 0 })
const comet = ref({ d: 'M160 300 L420 210', go: false })
let timer: ReturnType<typeof setInterval> | undefined

const moves = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: no-preference)').matches

function onPointer(event: PointerEvent): void {
  if (event.pointerType !== 'mouse') return
  const ring = document.querySelector('.ring-svg')?.getBoundingClientRect()
  if (!ring || ring.width === 0) return
  const clamp = (v: number) => Math.max(-1, Math.min(1, v))
  pointer.value = {
    x: clamp((event.clientX - (ring.left + ring.width / 2)) / (ring.width / 2)),
    y: clamp((event.clientY - (ring.top + ring.height / 2)) / (ring.height / 2)),
  }
}
const shift = (layer: number) => ({ transform: `translate(${(-pointer.value.x * PARALLAX[layer]!).toFixed(1)}px, ${(-pointer.value.y * PARALLAX[layer]!).toFixed(1)}px)` })

function launch(): void {
  if (document.hidden) return
  const a = Math.random() * Math.PI * 2
  const x = 500 + Math.cos(a) * 300
  const y = 500 + Math.sin(a) * 300
  comet.value = { d: `M${x.toFixed(0)} ${y.toFixed(0)} l${(Math.cos(a + 1.9) * 260).toFixed(0)} ${(Math.sin(a + 1.9) * 260).toFixed(0)}`, go: false }
  requestAnimationFrame(() => (comet.value = { ...comet.value, go: true }))
}

onMounted(() => {
  if (!moves()) return
  document.addEventListener('pointermove', onPointer, { passive: true })
  timer = setInterval(launch, COMET_MS)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointermove', onPointer)
  clearInterval(timer)
})
</script>

<template>
  <g
    class="sky"
    aria-hidden="true"
  >
    <defs>
      <radialGradient
        id="sky-night"
        cx="500"
        cy="500"
        :r="SKY_RADIUS"
        gradientUnits="userSpaceOnUse"
      >
        <stop
          v-for="s in NIGHT_STOPS"
          :key="s.offset"
          :offset="s.offset"
          :stop-color="s.color"
          :stop-opacity="s.opacity"
        />
      </radialGradient>
      <linearGradient
        id="sky-comet"
        x1="0"
        x2="1"
      >
        <stop
          offset="0"
          stop-color="#fff"
          stop-opacity="0"
        />
        <stop
          offset="1"
          stop-color="#fff6dc"
        />
      </linearGradient>
      <filter
        id="sky-soft"
        x="-10%"
        y="-10%"
        width="120%"
        height="120%"
      >
        <feGaussianBlur stdDeviation="14" />
      </filter>
      <template
        v-for="w in WORLD_KEYS"
        :key="w"
      >
        <radialGradient
          :id="`sky-neb-${w}`"
          cx="500"
          cy="500"
          :r="SKY_RADIUS"
          gradientUnits="userSpaceOnUse"
        >
          <stop
            v-for="s in NEBULA_STOPS"
            :key="s.offset"
            :offset="s.offset"
            :stop-color="WORLDS[w].tone"
            :stop-opacity="s.opacity"
          />
        </radialGradient>
        <radialGradient
          :id="`sky-planet-${w}`"
          cx="0.35"
          cy="0.3"
          r="0.8"
        >
          <stop
            offset="0"
            stop-color="#fff"
            stop-opacity="0.55"
          />
          <stop
            offset="0.25"
            :stop-color="WORLDS[w].tone"
          />
          <stop
            offset="1"
            :stop-color="WORLDS[w].field"
          />
        </radialGradient>
      </template>
    </defs>
    <circle
      class="sky-base"
      cx="500"
      cy="500"
      :r="SKY_RADIUS"
    />
    <circle
      cx="500"
      cy="500"
      :r="SKY_RADIUS"
      fill="url(#sky-night)"
    />
    <g
      class="sky-nebula"
      filter="url(#sky-soft)"
    >
      <path
        v-for="wedge in wedges"
        :key="wedge.key"
        :d="wedge.d"
        :fill="`url(#sky-neb-${wedge.world})`"
      />
    </g>
    <circle
      v-for="r in ORBITS"
      :key="r"
      class="sky-orbit"
      cx="500"
      cy="500"
      :r="r"
    />
    <g class="sky-field">
      <g
        v-for="layer in LAYERS"
        :key="layer"
        class="sky-layer"
        :style="shift(layer)"
      >
        <circle
          v-for="s in layers[layer]"
          :key="s.i"
          class="sky-star"
          :class="{ twinkle: s.twinkle }"
          :cx="s.x"
          :cy="s.y"
          :r="s.r"
          :opacity="s.o"
          :style="s.twinkle ? { '--o': s.o, animationDelay: `-${((s.i * 37) % 40) / 10}s` } : undefined"
        />
      </g>
    </g>
    <path
      class="sky-comet"
      :class="{ go: comet.go }"
      :d="comet.d"
    />
  </g>
</template>
