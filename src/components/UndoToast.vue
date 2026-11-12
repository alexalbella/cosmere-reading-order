<script setup lang="ts">
defineProps<{ message: string; undoLabel: string }>()
const emit = defineEmits<{ undo: [] }>()
</script>

<template>
  <div
    class="undo"
    role="status"
  >
    <span class="undo-text">{{ message }}</span>
    <button
      type="button"
      class="undo-btn"
      @click="emit('undo')"
    >
      {{ undoLabel }}
    </button>
    <i
      class="fuse"
      aria-hidden="true"
    />
  </div>
</template>
