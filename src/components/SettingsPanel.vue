<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ImportOutcome } from '../app/useApp'
import ConfirmDialog from './ConfirmDialog.vue'
import { t, type Lang, type StringKey } from '../i18n'
import { MAX_STATE_BYTES } from '../state/transfer'
import { SIGN_IN_HREF } from '../sync/client'
import type { SyncStatus } from '../sync/status'

const props = defineProps<{
  lang: Lang
  includeRpg: boolean
  syncStatus: SyncStatus
  importResult: ImportOutcome | null
  /** A file waiting for an answer about the unlocks it brings: what it would unlock, by title. */
  pendingUnlocks: string[] | null
}>()
const emit = defineEmits<{
  'update:lang': [Lang]
  'update:includeRpg': [boolean]
  export: []
  import: [text: string]
  importAnswer: ['all' | 'marks' | 'cancel']
  close: []
}>()

const SYNC_KEYS: Record<SyncStatus, StringKey> = {
  idle: 'syncIdle',
  syncing: 'syncSyncing',
  ok: 'syncOk',
  offline: 'syncOffline',
  signin: 'syncSignin',
  error: 'syncError',
}

const input = ref<HTMLInputElement | null>(null)

const result = computed(() => {
  const r = props.importResult
  if (!r) return ''
  if (!r.ok) return t(r.cancelled ? 'importCancelled' : 'importBad', props.lang)
  const parts: string[] = []
  if (r.marked > 0 || r.unlocked === 0) {
    parts.push(r.marked === 1 ? t('importDoneOne', props.lang) : t('importDone', props.lang, r.marked))
  }
  if (r.unlocked > 0) parts.push(r.unlocked === 1 ? t('importUnlockedOne', props.lang) : t('importUnlocked', props.lang, r.unlocked))
  if (r.unknown > 0) parts.push(t('importUnknown', props.lang, r.unknown))
  return parts.join(' ')
})

async function picked(event: Event): Promise<void> {
  const el = event.target as HTMLInputElement
  const file = el.files?.[0]
  if (!file) return
  // Refused without being read: an empty text is not a copy of anything.
  emit('import', file.size > MAX_STATE_BYTES ? '' : await file.text())
  el.value = ''
}
</script>

<template>
  <section
    class="panel"
    tabindex="-1"
    :aria-label="t('settings', lang)"
  >
    <header class="panel-head">
      <h2>{{ t('settings', lang) }}</h2>
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

    <div class="group">
      <h3>{{ t('language', lang) }}</h3>
      <div class="chips">
        <button
          type="button"
          class="chip"
          :aria-pressed="lang === 'es'"
          @click="emit('update:lang', 'es')"
        >
          {{ t('language_es', lang) }}
        </button>
        <button
          type="button"
          class="chip"
          :aria-pressed="lang === 'en'"
          @click="emit('update:lang', 'en')"
        >
          {{ t('language_en', lang) }}
        </button>
      </div>
    </div>

    <div class="group">
      <h3>{{ t('view', lang) }}</h3>
      <p class="panel-p">
        {{ t('viewNote', lang) }}
      </p>
    </div>

    <div class="group">
      <h3>{{ t('formatRpg', lang) }}</h3>
      <p class="panel-p">
        {{ t('includeRpgNote', lang) }}
      </p>
      <div class="chips mt">
        <button
          type="button"
          class="chip"
          :aria-pressed="includeRpg"
          @click="emit('update:includeRpg', !includeRpg)"
        >
          {{ t('includeRpg', lang) }}
        </button>
      </div>
    </div>

    <div class="group">
      <h3>{{ t('sync', lang) }}</h3>
      <p class="panel-p">
        {{ t(SYNC_KEYS[syncStatus], lang) }}
      </p>
      <div class="chips mt">
        <a
          v-if="syncStatus === 'signin'"
          class="chip"
          :href="SIGN_IN_HREF"
        >{{ t('syncSigninAction', lang) }}</a>
        <button
          type="button"
          class="chip"
          @click="emit('export')"
        >
          {{ t('export', lang) }}
        </button>
        <button
          type="button"
          class="chip"
          @click="input?.click()"
        >
          {{ t('import', lang) }}
        </button>
      </div>
      <input
        ref="input"
        class="file-input"
        type="file"
        accept="application/json,.json"
        tabindex="-1"
        aria-hidden="true"
        @change="picked"
      >
      <ConfirmDialog
        v-if="pendingUnlocks"
        danger
        :message="t('importUnlockAsk', lang)"
        :items="pendingUnlocks"
        :confirm-label="t('importUnlockAll', lang)"
        :alternate-label="t('importUnlockMarks', lang)"
        :cancel-label="t('cancel', lang)"
        @confirm="emit('importAnswer', 'all')"
        @alternate="emit('importAnswer', 'marks')"
        @cancel="emit('importAnswer', 'cancel')"
      />
      <p
        v-else-if="result"
        class="panel-p"
        role="status"
      >
        {{ result }}
      </p>
    </div>
  </section>
</template>
