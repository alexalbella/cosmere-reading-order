<script setup lang="ts">
import { ref } from 'vue'
import { host, safeUrl } from '../app/links'
import type { Note, NoteKind } from '../data/types'
import { t, type Lang, type StringKey } from '../i18n'

// `items` are notes already cleared by the gate, and the plate renders this only when there is one.
// Each opens its text on request, so nothing of it is in the page until asked for.
defineProps<{ items: Note[]; lang: Lang }>()
const openId = ref<string | null>(null)

const KIND: Record<NoteKind, StringKey> = {
  wob: 'noteWob',
  egg: 'noteEgg',
  'confirmed-theory': 'noteConfirmedTheory',
  relation: 'noteRelation',
}
</script>

<template>
  <section class="cons plate-notes">
    <h3 class="plate-h">
      {{ t('notesTitle', lang) }}
    </h3>
    <ul>
      <li
        v-for="n in items"
        :key="n.id"
        class="con"
      >
        <button
          type="button"
          class="note-b"
          :aria-expanded="openId === n.id"
          :aria-controls="openId === n.id ? `nt-${n.id}` : undefined"
          @click="openId = openId === n.id ? null : n.id"
        >
          <span class="con-t">{{ t(KIND[n.kind], lang) }}</span>
          <span class="con-type" />
          <span class="con-act">{{ openId === n.id ? t('conClose', lang) : t('conRead', lang) }}</span>
        </button>
        <div
          v-if="openId === n.id"
          :id="`nt-${n.id}`"
          class="note-text"
        >
          <blockquote
            v-if="n.kind === 'wob' && n.quote"
            class="note-quote"
          >
            <p lang="en">
              {{ n.quote.en }}
            </p>
            <p
              v-if="lang === 'es'"
              class="con-src"
            >
              {{ t('quoteTranslation', lang) }}: {{ n.quote.es }}
            </p>
          </blockquote>
          <p>{{ n.text[lang] }}</p>
          <p class="con-src">
            {{ t('conSource', lang) }}:
            <template
              v-for="(s, i) in n.sources"
              :key="i"
            >
              <a
                v-if="safeUrl(s.url)"
                :href="safeUrl(s.url)!"
                target="_blank"
                rel="noopener noreferrer"
              >{{ host(safeUrl(s.url)!) }}</a><span v-if="safeUrl(s.url) && i < n.sources.length - 1">, </span>
            </template>
          </p>
          <p class="con-src">
            {{ t('conExternal', lang) }}
          </p>
        </div>
      </li>
    </ul>
  </section>
</template>
