<script setup lang="ts">
import { ref } from 'vue'
import { t, type Lang } from '../i18n'
import type { SynopsisView } from '../spoilers/visible'

// `view` comes from the gate. A gated synopsis says one line, the same on every work, and names nothing;
// a visible one is folded, and its text enters the page only when asked for.
defineProps<{ view: SynopsisView; lang: Lang }>()
const open = ref(false)
</script>

<template>
  <section class="syn">
    <template v-if="view.state === 'visible'">
      <button
        type="button"
        class="syn-b"
        :aria-expanded="open"
        :aria-controls="open ? 'syn-text' : undefined"
        @click="open = !open"
      >
        <span class="con-t plate-h">{{ t('synopsisTitle', lang) }}</span>
        <span class="con-type" />
        <span class="con-act">{{ open ? t('conClose', lang) : t('conRead', lang) }}</span>
      </button>
      <p
        v-if="open"
        id="syn-text"
        class="syn-text"
      >
        {{ view.text[lang] }}
      </p>
    </template>
    <p
      v-else
      class="syn-empty"
    >
      {{ t(view.state === 'gated' ? 'synopsisGated' : 'synopsisMissing', lang) }}
    </p>
  </section>
</template>
