<script setup lang="ts">
// Blind tooling: an inner fillet that scoops around each corner medallion, with a small tool where
// it turns. Tone on tone, so it reads as pressed into the leather rather than drawn on it.
const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const
const RULES = ['top', 'right', 'bottom', 'left'] as const
</script>

<template>
  <div
    class="fillet"
    aria-hidden="true"
  >
    <i
      v-for="side in RULES"
      :key="side"
      class="fillet-rule"
      :class="side"
    />
    <svg
      v-for="corner in CORNERS"
      :key="corner"
      class="fillet-corner"
      :class="corner"
      viewBox="0 0 110 110"
      width="110"
      height="110"
    >
      <path
        class="scoop"
        d="M7 80.2A52 52 0 1 0 80.2 7"
      />
      <path
        class="scoop fine"
        d="M34.7 90.4A45 45 0 0 0 90.4 34.7"
      />
      <path d="M91.5 80l2.5 9 9 2.5-9 2.5-2.5 9-2.5-9-9-2.5 9-2.5z" />
      <circle
        cx="104"
        cy="62"
        r="2"
      />
      <circle
        cx="62"
        cy="104"
        r="2"
      />
    </svg>
  </div>
</template>

<style scoped>
/* Inside the frame, under everything else on the cover. The medallions' centres are 47 px from its corners.
   A lighter tint of the leather's own colour: the grain is black, so a darker line would sink into it. */
.fillet { position: absolute; inset: 0; z-index: -1; pointer-events: none; color: color-mix(in srgb, var(--field) 72%, var(--blind)); transition: color 500ms var(--ease); }
.fillet-rule { position: absolute; background-color: currentColor; }
.fillet-rule.top, .fillet-rule.bottom { left: 80px; right: 80px; height: 2px; }
.fillet-rule.left, .fillet-rule.right { top: 80px; bottom: 80px; width: 2px; }
.fillet-rule.top { top: 6px; }
.fillet-rule.bottom { bottom: 6px; }
.fillet-rule.left { left: 6px; }
.fillet-rule.right { right: 6px; }
.fillet-corner { position: absolute; fill: currentColor; }
.scoop { fill: none; stroke: currentColor; stroke-width: 2; }
.scoop.fine { stroke-width: 1; }
.top-left { top: 0; left: 0; }
.top-right { top: 0; right: 0; transform: scaleX(-1); }
.bottom-left { bottom: 0; left: 0; transform: scaleY(-1); }
.bottom-right { bottom: 0; right: 0; transform: scale(-1); }
@media (max-width: 1279px) { .fillet { display: none; } }
</style>
