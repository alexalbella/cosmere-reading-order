<script setup lang="ts">
import type { Book } from '../data/types'

// The «uniform edition» cover of a work, from src/imagery/svg/cover-template.svg: its world's leather, gold foil,
// the world's emblem, its number in its series when it has one, and its format. Never an official cover.
// The emblem and the format come from the sprite, which arrives after the first paint.
defineProps<{ book: Book }>()

const CORNERS = ['', 'translate(200 0) scale(-1 1)', 'translate(0 300) scale(1 -1)', 'translate(200 300) scale(-1 -1)']
</script>

<template>
  <svg
    class="cover-thumb"
    viewBox="0 0 200 300"
    :data-world="book.world"
    aria-hidden="true"
    focusable="false"
  >
    <rect
      class="cover-field"
      width="200"
      height="300"
      rx="4"
    />
    <g class="cover-foil">
      <rect
        x="10"
        y="10"
        width="180"
        height="280"
        stroke-width="1.5"
      />
      <path
        stroke-width=".8"
        d="M25 16H175A9 9 0 0 0 184 25V275A9 9 0 0 0 175 284H25A9 9 0 0 0 16 275V25A9 9 0 0 0 25 16Z"
      />
      <g
        v-for="corner in CORNERS"
        :key="corner"
        :transform="corner || undefined"
      >
        <circle
          class="cover-dot"
          cx="18.5"
          cy="18.5"
          r="1.5"
        />
        <path
          class="cover-dot"
          d="M27 24.2l2.8 2.8-2.8 2.8-2.8-2.8z"
        />
        <path
          stroke-width=".7"
          d="M30 20.5h11M20.5 30v11"
        />
      </g>
      <path
        stroke-width=".8"
        d="M62 50H84M116 50H138"
      />
      <path
        class="cover-dot"
        d="M58 47.8l2.2 2.2-2.2 2.2-2.2-2.2zM142 47.8l2.2 2.2-2.2 2.2-2.2-2.2z"
      />
      <circle
        cx="100"
        cy="140"
        r="50"
        stroke-width=".8"
      />
      <path
        stroke-width=".8"
        d="M68 212H93M107 212H132"
      />
      <path
        class="cover-dot"
        d="M100 208.5l3.5 3.5-3.5 3.5-3.5-3.5z"
      />
      <path
        stroke-width=".8"
        d="M62 244H80M120 244H138"
      />
    </g>
    <text
      v-if="book.series && book.seriesIndex"
      class="cover-number"
      x="100"
      y="50"
      text-anchor="middle"
      dominant-baseline="central"
    >{{ book.seriesIndex }}</text>
    <use
      class="cover-emblem"
      :href="`#emblem-${book.world}`"
      x="55"
      y="95"
      width="90"
      height="90"
    />
    <use
      class="cover-format"
      :href="`#format-${book.format}`"
      x="88"
      y="232"
      width="24"
      height="24"
    />
  </svg>
</template>
