<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Book, BookId } from '../data/types'
import { t, titleOf, type Lang } from '../i18n'
import ConfirmDialog from './ConfirmDialog.vue'

// Unlocking lives here and nowhere else: this panel replaces the plate, so the mark
// button is never on screen beside it.
const props = defineProps<{
  lang: Lang
  selected: Book | null
  /** The selected book already counts as read, by mark or by unlock. */
  selectedCounts: boolean
  unlocked: Book[]
  visibleCount: number
}>()
const emit = defineEmits<{ unlock: [id: BookId]; lock: [id: BookId]; close: [] }>()

const confirming = ref(false)
watch(
  () => props.selected?.id,
  () => (confirming.value = false),
)

function confirmUnlock(): void {
  if (!props.selected) return
  confirming.value = false
  emit('unlock', props.selected.id)
}
</script>

<template>
  <section
    class="panel"
    tabindex="-1"
    :aria-label="t('spoilersTitle', lang)"
  >
    <header class="panel-head">
      <h2>{{ t('spoilersTitle', lang) }}</h2>
      <button
        type="button"
        class="plate-x"
        :aria-label="t('close', lang)"
        @click="emit('close')"
      >
        <svg
          viewBox="0 0 20 20"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <path d="M4 4l12 12M16 4L4 16" />
        </svg>
      </button>
    </header>
    <p class="panel-p">
      {{ t('spoilersNote', lang) }}
      <span
        v-if="visibleCount > 0"
        class="foot-count"
      >{{
        visibleCount === 1 ? t('inViewOne', lang) : t('inView', lang, visibleCount)
      }}.</span>
    </p>

    <div
      v-if="unlocked.length"
      class="group"
    >
      <h3>{{ t('unlockedList', lang) }}</h3>
      <ul class="unlocked-list">
        <li
          v-for="b in unlocked"
          :key="b.id"
        >
          <span>{{ titleOf(b, lang) }}</span>
          <button
            type="button"
            class="quiet"
            @click="emit('lock', b.id)"
          >
            {{ t('lockAgain', lang) }}
          </button>
        </li>
      </ul>
    </div>

    <div class="group apart">
      <h3>{{ t('unlockTitle', lang) }}</h3>
      <p
        v-if="!selected"
        class="panel-p"
      >
        {{ t('unlockPick', lang) }}
      </p>
      <p
        v-else-if="selectedCounts"
        class="panel-p"
      >
        {{ t('unlockAlready', lang) }}
      </p>
      <ConfirmDialog
        v-else-if="confirming"
        danger
        :message="t('unlockWarning', lang)"
        :confirm-label="t('unlockYes', lang)"
        :cancel-label="t('unlockNo', lang)"
        @confirm="confirmUnlock"
        @cancel="confirming = false"
      />
      <template v-else>
        <p class="panel-p">
          {{ t('unlockWarning', lang) }}
        </p>
        <button
          type="button"
          class="btn-danger"
          @click="confirming = true"
        >
          {{ t('unlockButton', lang, titleOf(selected, lang)) }}
        </button>
      </template>
    </div>
  </section>
</template>
