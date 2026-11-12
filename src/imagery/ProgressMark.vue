<script setup lang="ts">
import { computed } from 'vue'
import { WRITING_STAGES, type Book } from '../data/types'

// How far the writing of an unpublished work has gone, from src/imagery/svg/progress-template.svg: four tooled
// stages, lit up to the current one, and a thin rail for the author's percentage when he gave one. The plate says
// the same in words, so this stays out of the accessibility tree.
const props = defineProps<{ writing: Book['writing'] }>()

const STAGE_X = [7.5, 35.5, 63.5, 91.5]
const RAIL = 105

const reached = computed(() => {
  const stage = props.writing?.stage
  return typeof stage === 'string' ? (WRITING_STAGES as readonly string[]).indexOf(stage) : -1
})
const fill = computed(() => {
  const p = props.writing?.percent
  return typeof p === 'number' && Number.isFinite(p) ? Math.round((RAIL * Math.min(100, Math.max(0, p))) / 100) : null
})
</script>

<template>
  <svg
    v-if="reached >= 0"
    class="progress-mark"
    viewBox="0 0 120 16"
    aria-hidden="true"
    focusable="false"
  >
    <rect
      v-for="(x, i) in STAGE_X"
      :key="x"
      class="stage"
      :class="{ on: i <= reached }"
      :x="x"
      y="2.5"
      width="21"
      height="6.5"
      rx=".8"
    />
    <path
      class="progress-dot"
      d="M32 3.55l2.2 2.2-2.2 2.2-2.2-2.2zM60 3.55l2.2 2.2-2.2 2.2-2.2-2.2zM88 3.55l2.2 2.2-2.2 2.2-2.2-2.2z"
    />
    <circle
      class="progress-dot"
      cx="3"
      cy="5.75"
      r="1.1"
    />
    <circle
      class="progress-dot"
      cx="117"
      cy="5.75"
      r="1.1"
    />
    <path
      class="progress-rail"
      d="M7.5 13.25H112.5M7.5 11.9v2.7M112.5 11.9v2.7"
    />
    <rect
      v-if="fill !== null"
      class="progress-fill"
      x="7.5"
      y="12.25"
      :width="fill"
      height="2"
    />
  </svg>
</template>
