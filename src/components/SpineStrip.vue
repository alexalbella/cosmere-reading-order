<script setup lang="ts">
import { t, type Lang } from '../i18n'
import type { View } from '../state/prefs'

export interface Segment {
  state: 'read' | 'reading' | 'next' | 'skipped' | 'unread'
  pages: number
}

defineProps<{ segments: Segment[]; read: number; total: number; view: View; lang: Lang; unlockedCount: number; phone: boolean }>()
const emit = defineEmits<{ 'update:view': [View]; spoilers: [] }>()
</script>

<template>
  <aside class="spine">
    <span
      class="seal spine-seal"
      aria-hidden="true"
    />
    <div class="rib" />
    <div class="tabs">
      <button
        type="button"
        class="tab"
        :aria-pressed="view === 'map'"
        @click="emit('update:view', 'map')"
      >
        {{ t('tabMap', lang) }}
      </button>
      <button
        type="button"
        class="tab"
        :aria-pressed="view === 'circle'"
        @click="emit('update:view', 'circle')"
      >
        {{ t('tabCircle', lang) }}
      </button>
      <button
        type="button"
        class="tab"
        :aria-pressed="view === 'shelf'"
        @click="emit('update:view', 'shelf')"
      >
        {{ t('tabShelf', lang) }}
      </button>
    </div>
    <div class="rib" />
    <h1>{{ t('name', lang) }}</h1>
    <div class="rib" />
    <div
      class="foilbar"
      :class="phone ? 'horizontal' : 'vertical'"
      role="img"
      :aria-label="t('worksProgress', lang, read, total)"
    >
      <i
        v-for="(s, i) in segments"
        :key="i"
        class="seg"
        :class="`seg-${s.state}`"
        :style="{ flexGrow: Math.max(40, s.pages) }"
      />
    </div>
    <div class="rib" />
    <div
      class="tally"
      aria-hidden="true"
    >
      {{ read }}<br> {{ t('of', lang) }}<br> {{ total }}
    </div>
    <button
      type="button"
      class="spine-lock"
      :aria-label="t('spoilers', lang)"
      @click="emit('spoilers')"
    >
      <svg
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <path :d="unlockedCount ? 'M7 11V8a5 5 0 0 1 9.6-2' : 'M7 11V8a5 5 0 0 1 10 0v3'" />
        <rect
          x="5"
          y="11"
          width="14"
          height="9"
        />
        <path d="M12 14.5v2" />
      </svg>
    </button>
  </aside>
</template>
