<script setup lang="ts">
import { nextTick, ref } from 'vue'
import type { Book, BookId, Connection } from '../data/types'
import { descriptionOf, t, titleOf, type Lang } from '../i18n'
import { typeLabel } from '../i18n/labels'
import { host, safeUrl } from '../app/links'

// `items` are connections already cleared by `visible`. Nothing here can show more.
const props = defineProps<{ items: Connection[]; selfId: BookId; books: Book[]; lang: Lang }>()
const emit = defineEmits<{ select: [id: BookId] }>()

const openId = ref<string | null>(null)

function otherEnd(c: Connection): Book | null {
  const id = c.from === props.selfId ? c.to : c.from
  return props.books.find((b) => b.id === id) ?? null
}

async function toggle(id: string): Promise<void> {
  openId.value = openId.value === id ? null : id
  if (openId.value === null) return
  // The plate scrolls on its own, and a note opens below its fold.
  await nextTick()
  document.getElementById(`note-${id}`)?.scrollIntoView?.({ block: 'nearest' })
}
</script>

<template>
  <section class="cons">
    <h3 class="plate-h">
      {{ t('conTitle', lang) }}
    </h3>
    <p
      v-if="items.length === 0"
      class="cons-empty"
    >
      {{ t('conEmpty', lang) }}
    </p>
    <ul v-else>
      <li
        v-for="c in items"
        :key="c.id"
        class="con"
      >
        <button
          type="button"
          class="con-b"
          :aria-expanded="openId === c.id"
          :aria-controls="openId === c.id ? `note-${c.id}` : undefined"
          @click="toggle(c.id)"
        >
          <span class="con-t">{{ otherEnd(c) ? titleOf(otherEnd(c)!, lang) : typeLabel(c.type, lang) }}</span>
          <span class="con-type">{{ otherEnd(c) ? typeLabel(c.type, lang) : '' }}</span>
          <span class="con-act">{{ openId === c.id ? t('conClose', lang) : t('conRead', lang) }}</span>
        </button>
        <div
          v-if="openId === c.id"
          :id="`note-${c.id}`"
          class="con-note"
        >
          <p>{{ descriptionOf(c, lang) || t('conNoText', lang) }}</p>
          <p
            v-if="c.sources.length"
            class="con-src"
          >
            {{ t('conSource', lang) }}:
            <template
              v-for="(s, i) in c.sources"
              :key="i"
            >
              <a
                v-if="safeUrl(s.url)"
                :href="safeUrl(s.url)!"
                target="_blank"
                rel="noopener noreferrer"
              >{{ host(safeUrl(s.url)!) }}</a><span v-if="safeUrl(s.url) && i < c.sources.length - 1">, </span>
            </template>
          </p>
          <p
            v-if="c.sources.some((s) => safeUrl(s.url))"
            class="con-src"
          >
            {{ t('conExternal', lang) }}
          </p>
          <button
            v-if="otherEnd(c)"
            type="button"
            class="quiet"
            @click="emit('select', otherEnd(c)!.id)"
          >
            {{ t('conGoTo', lang) }}
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>
