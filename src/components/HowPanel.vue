<script setup lang="ts">
import { CONNECTION_TYPES } from '../data/types'
import { t, type Lang } from '../i18n'
import { typeLabel } from '../i18n/labels'

// The key to the map. It replaces the plate while it is open, like every panel, and holds no data:
// what a mark means is the same whatever has been read.
defineProps<{ lang: Lang }>()
const emit = defineEmits<{ close: [] }>()

/** The four kinds a line can be, heaviest first, at the weights the ring draws them. A marker with one end is no line. */
const LINE_WEIGHTS = { major: 3.8, significant: 2.6, minor: 1.6, egg: 0.9 } as const
const lineKinds = CONNECTION_TYPES.filter((type): type is keyof typeof LINE_WEIGHTS => type in LINE_WEIGHTS)
</script>

<template>
  <section
    class="panel"
    tabindex="-1"
    :aria-label="t('howTitle', lang)"
  >
    <header class="panel-head">
      <h2>{{ t('howTitle', lang) }}</h2>
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

    <dl class="how">
      <dt>{{ t('howWorldsHead', lang) }}</dt>
      <dd>
        <p>{{ t('howWorlds', lang) }}</p>
        <p>{{ t('howLift', lang) }}</p>
      </dd>

      <dt>{{ t('howMarksHead', lang) }}</dt>
      <dd>
        <ul class="marks">
          <li class="fact">
            <svg
              viewBox="0 0 26 20"
              width="26"
              height="20"
              aria-hidden="true"
            ><circle
              cx="13"
              cy="10"
              r="5"
              fill="var(--gold)"
            /></svg>
            <span>{{ t('howMarkRead', lang) }}</span>
          </li>
          <li class="fact">
            <svg
              viewBox="0 0 26 20"
              width="26"
              height="20"
              aria-hidden="true"
            ><circle
              cx="13"
              cy="10"
              r="4.2"
              fill="none"
              stroke="var(--second)"
              stroke-width="1.4"
            /></svg>
            <span>{{ t('howMarkUnread', lang) }}</span>
          </li>
          <li class="fact">
            <svg
              viewBox="0 0 26 20"
              width="26"
              height="20"
              aria-hidden="true"
            ><path
              d="M8 2h10v16l-5-4.2L8 18z"
              fill="var(--ribbon)"
              stroke="var(--gold-hot)"
              stroke-width="1"
            /></svg>
            <span>{{ t('howMarkReading', lang) }}</span>
          </li>
          <li class="fact">
            <svg
              viewBox="0 0 26 20"
              width="26"
              height="20"
              aria-hidden="true"
            ><circle
              cx="13"
              cy="10"
              r="3.2"
              fill="var(--bone)"
            /><circle
              cx="13"
              cy="10"
              r="7"
              fill="none"
              stroke="var(--bone)"
              stroke-width="1.2"
            /></svg>
            <span>{{ t('howMarkNext', lang) }}</span>
          </li>
          <li class="fact">
            <svg
              viewBox="0 0 26 20"
              width="26"
              height="20"
              aria-hidden="true"
            ><text
              x="13"
              y="15"
              text-anchor="middle"
              font-style="italic"
              font-size="16"
              fill="var(--second)"
            >Aa</text></svg>
            <span>{{ t('howMarkSkipped', lang) }}</span>
          </li>
          <li class="fact">
            <svg
              viewBox="0 0 26 20"
              width="26"
              height="20"
              aria-hidden="true"
            ><circle
              cx="13"
              cy="10"
              r="4.2"
              fill="none"
              stroke="var(--danger)"
              stroke-width="2"
            /></svg>
            <span>{{ t('howMarkUnlocked', lang) }}</span>
          </li>
          <li class="fact">
            <svg
              viewBox="0 0 26 20"
              width="26"
              height="20"
              aria-hidden="true"
            ><circle
              cx="6"
              cy="4.5"
              r="2.6"
              fill="none"
              stroke="var(--blind)"
              stroke-width="1.1"
            /><circle
              cx="14"
              cy="10"
              r="3.4"
              fill="none"
              stroke="var(--second)"
              stroke-width="1.4"
            /><circle
              cx="6"
              cy="15.5"
              r="2.6"
              fill="none"
              stroke="var(--blind)"
              stroke-width="1.1"
            /></svg>
            <span>{{ t('howMarkAside', lang) }}</span>
          </li>
          <li class="fact">
            <span class="new-tag how-new">{{ t('new', lang) }}</span>
            <span>{{ t('howMarkNew', lang) }}</span>
          </li>
          <li class="fact">
            <svg
              viewBox="0 0 26 20"
              width="26"
              height="20"
              aria-hidden="true"
            ><path
              d="M2 10h22"
              stroke="var(--relief-band)"
              stroke-width="5"
            /><path
              d="M13 2v16"
              stroke="var(--gold-hot)"
              stroke-width="3"
            /></svg>
            <span>{{ t('howMarkNeedle', lang) }}</span>
          </li>
        </ul>
      </dd>

      <dt>{{ t('howLinesHead', lang) }}</dt>
      <dd>
        <p>{{ t('howLines', lang) }}</p>
        <ul class="marks">
          <li
            v-for="kind in lineKinds"
            :key="kind"
            class="fact"
          >
            <svg
              viewBox="0 0 26 20"
              width="26"
              height="20"
              aria-hidden="true"
            ><path
              d="M1 10h24"
              stroke="var(--gold-line)"
              :stroke-width="LINE_WEIGHTS[kind]"
            /></svg>
            <span>{{ typeLabel(kind, lang) }}</span>
          </li>
          <li class="fact">
            <svg
              viewBox="0 0 26 20"
              width="26"
              height="20"
              aria-hidden="true"
            ><path
              d="M1 10h24"
              stroke="var(--gold-line)"
              stroke-width="1.6"
              stroke-dasharray="4 3"
            /></svg>
            <span>{{ t('howLineTheory', lang) }}</span>
          </li>
        </ul>
      </dd>

      <dt>{{ t('howViewsHead', lang) }}</dt>
      <dd>{{ t('howViews', lang) }}</dd>

      <dt>{{ t('howPhasesHead', lang) }}</dt>
      <dd>
        <p>{{ t('howPhases', lang) }}</p>
        <p>{{ t('howPhase1', lang) }}</p>
        <p>{{ t('howPhase2', lang) }}</p>
        <p>{{ t('howPhase3', lang) }}</p>
      </dd>

      <dt>{{ t('howZoomHead', lang) }}</dt>
      <dd>{{ t('howZoom', lang) }}</dd>
    </dl>
  </section>
</template>
