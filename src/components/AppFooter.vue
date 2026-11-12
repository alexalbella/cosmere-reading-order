<script setup lang="ts">
import { computed } from 'vue'
import { isCalendarDate } from '../data/soundness'
import type { WorldKey } from '../data/types'
import { t, type Lang, type StringKey } from '../i18n'
import { worldName } from '../i18n/labels'
import { reload } from '../app/reload'
import { SIGN_IN_HREF } from '../sync/client'
import type { SyncStatus } from '../sync/status'

const props = defineProps<{
  lang: Lang
  updatedOn: string
  visibleCount: number
  syncStatus: SyncStatus
  /** The saved list could not be read. */
  corrupt: boolean
  /** The connections file failed. While it is on its way nothing is said. */
  connectionsFailed?: boolean
  lifted: WorldKey | null
}>()
const emit = defineEmits<{ lift: [WorldKey] }>()

const NOTICES: Partial<Record<SyncStatus, StringKey>> = { offline: 'syncOffline', signin: 'syncSignin', error: 'syncError' }

const notices = computed(() => {
  const keys: StringKey[] = []
  if (props.corrupt) keys.push('stateCorrupt')
  const sync = NOTICES[props.syncStatus]
  if (sync) keys.push(sync)
  return keys.map((key) => ({ text: t(key, props.lang), signIn: key === 'syncSignin' }))
})

const updated = computed(() => {
  const date = isCalendarDate(props.updatedOn) ? new Date(`${props.updatedOn}T00:00:00Z`) : null
  if (!date || Number.isNaN(date.getTime())) return ''
  const text = new Intl.DateTimeFormat(props.lang === 'es' ? 'es-ES' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
  return t('updatedOn', props.lang, text)
})

// Only the global count is ever shown. With nothing visible nothing is said here: the plate says it.
const count = computed(() => {
  if (props.visibleCount === 0) return ''
  return props.visibleCount === 1 ? t('inViewOne', props.lang) : t('inView', props.lang, props.visibleCount)
})
</script>

<template>
  <footer class="site-footer">
    <p
      v-for="notice in notices"
      :key="notice.text"
      class="notice"
      role="status"
    >
      {{ notice.text }}
      <a
        v-if="notice.signIn"
        class="foot-btn"
        :href="SIGN_IN_HREF"
      >{{ t('syncSigninAction', lang) }}</a>
    </p>
    <p class="foot-line">
      <span class="foot-date">{{ updated }}</span>
      <span class="foot-mid">
        <span
          v-if="count"
          class="foot-count"
        >{{ count }}</span>
        <span
          v-if="connectionsFailed"
          class="notice"
          role="status"
        >
          {{ t('connectionsFailed', lang) }}
          <button
            type="button"
            class="foot-btn"
            @click="reload"
          >{{ t('tryAgain', lang) }}</button>
        </span>
        <button
          v-if="lifted"
          type="button"
          class="foot-btn"
          @click="emit('lift', lifted)"
        >
          {{ t('liftClear', lang, worldName(lifted, lang)) }}
        </button>
      </span>
      <span class="foot-end">
        <span class="unofficial">{{ t('unofficial', lang) }}</span>
        <a
          class="credit"
          href="https://github.com/17thshard/reading-order"
          target="_blank"
          rel="noopener noreferrer"
        >{{ t('credit', lang) }}</a>
      </span>
    </p>
  </footer>
</template>
