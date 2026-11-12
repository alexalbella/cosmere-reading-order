<script setup lang="ts">
import type { WorldKey } from '../data/types'

// A world's emblem from the sprite, tinted by the text colour around it. Decorative: the world's name is always
// written beside it.
withDefaults(defineProps<{ world: WorldKey; size?: number }>(), { size: 24 })
</script>

<template>
  <svg
    class="world-emblem"
    viewBox="0 0 64 64"
    :width="size"
    :height="size"
    aria-hidden="true"
    focusable="false"
  >
    <use :href="`#emblem-${world}`" />
  </svg>
</template>
