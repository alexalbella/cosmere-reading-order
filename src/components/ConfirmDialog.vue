<script setup lang="ts">
import { onMounted, ref, useId } from 'vue'

const props = defineProps<{
  message: string
  items?: string[]
  confirmLabel: string
  cancelLabel: string
  alternateLabel?: string
  /** A confirmation that reveals something: the safe answer comes first and takes the focus. */
  danger?: boolean
}>()
const emit = defineEmits<{ confirm: []; alternate: []; cancel: [] }>()

const id = useId()
const root = ref<HTMLElement | null>(null)

onMounted(() => {
  const target = props.danger ? root.value?.querySelector('.btn-quiet') : root.value?.querySelector('.btn-gold')
  if (target instanceof HTMLElement) target.focus({ preventScroll: true })
})
</script>

<template>
  <div
    ref="root"
    class="confirm-box"
    role="alertdialog"
    :aria-labelledby="id"
    @keydown.esc.stop="emit('cancel')"
  >
    <div class="anthology">
      <p
        :id="id"
        class="panel-p"
        :class="{ warn: danger }"
      >
        {{ message }}
      </p>
      <ul v-if="items && items.length">
        <li
          v-for="item in items"
          :key="item"
        >
          {{ item }}
        </li>
      </ul>
    </div>
    <div
      v-if="danger"
      class="confirm"
    >
      <button
        type="button"
        class="btn-quiet"
        @click="emit('cancel')"
      >
        {{ cancelLabel }}
      </button>
      <button
        v-if="alternateLabel"
        type="button"
        class="quiet"
        @click="emit('alternate')"
      >
        {{ alternateLabel }}
      </button>
      <button
        type="button"
        class="btn-danger"
        @click="emit('confirm')"
      >
        {{ confirmLabel }}
      </button>
    </div>
    <template v-else>
      <button
        type="button"
        class="btn-gold"
        @click="emit('confirm')"
      >
        {{ confirmLabel }}
      </button>
      <div class="quiet-row">
        <button
          v-if="alternateLabel"
          type="button"
          class="quiet"
          @click="emit('alternate')"
        >
          {{ alternateLabel }}
        </button>
        <button
          type="button"
          class="quiet"
          @click="emit('cancel')"
        >
          {{ cancelLabel }}
        </button>
      </div>
    </template>
  </div>
</template>
