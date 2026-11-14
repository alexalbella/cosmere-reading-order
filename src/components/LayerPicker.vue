<script setup lang="ts">
import { computed } from 'vue'
import { t, type Lang, type StringKey } from '../i18n'
import { LAYERS, layerLegend, type Layer } from '../views/layers'

// Which fact colours the titles of the ring: their world, how far their publication is, their format, or what
// the reader has marked. The legend names the values of the layer in use and carries no count.
const props = defineProps<{
  layer: Layer
  lang: Lang
  /** The values of this layer that some title on the ring has. Given, the legend names only those. */
  onShow?: ReadonlySet<string>
}>()
const emit = defineEmits<{ 'update:layer': [layer: Layer] }>()

const NAMES: Record<Layer, StringKey> = { world: 'filterWorld', status: 'layerStatus', format: 'filterFormat', read: 'layerRead' }
const legend = computed(() => layerLegend(props.layer).filter((entry) => props.onShow === undefined || props.onShow.has(entry.value)))
</script>

<template>
  <div class="layer-picker">
    <div
      class="layers"
      role="group"
      :aria-label="t('layerGroup', lang)"
    >
      <button
        v-for="name in LAYERS"
        :key="name"
        type="button"
        :aria-pressed="layer === name"
        @click="emit('update:layer', name)"
      >
        {{ t(NAMES[name], lang) }}
      </button>
    </div>
    <ul
      v-if="legend.length"
      class="legend"
    >
      <li
        v-for="entry in legend"
        :key="entry.value"
      >
        <span
          class="swatch"
          :style="{ '--swatch': entry.ink }"
          aria-hidden="true"
        />{{ t(entry.label, lang) }}
      </li>
    </ul>
  </div>
</template>
