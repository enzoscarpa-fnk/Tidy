<script setup lang="ts">
interface Props {
  progress: number
  filename: string
  status: 'uploading' | 'success' | 'error'
  errorMessage?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{ retry: [] }>()

const barColor = computed(() => {
  if (props.status === 'success') return 'bg-tidy-status-success'
  if (props.status === 'error')   return 'bg-tidy-status-error'
  return 'bg-tidy-orange'
})

const barWidth = computed(() =>
  props.status === 'error' ? '100%' : `${props.progress}%`
)
</script>

<template>
  <div class="w-full glass-panel p-4">
    <div class="mb-2 flex items-center justify-between gap-2">
      <span class="min-w-0 flex-1 truncate text-sm font-medium text-tidy-text-primary">
        {{ filename }}
      </span>
      <span v-if="status === 'uploading'" class="flex-shrink-0 text-xs tabular-nums text-tidy-text-secondary">
        {{ progress }}&nbsp;%
      </span>
      <span v-else-if="status === 'success'" class="flex-shrink-0 text-xs font-semibold text-tidy-status-success">
        Envoyé ✓
      </span>
      <span v-else class="flex-shrink-0 text-xs font-semibold text-tidy-status-error">
        Échec
      </span>
    </div>

    <!-- Barre de progression -->
    <div class="h-2 w-full overflow-hidden rounded-full bg-tidy-surface-overlay">
      <div
        class="h-2 rounded-full transition-all duration-300 ease-out"
        :class="barColor"
        :style="{ width: barWidth }"
      />
    </div>

    <p v-if="status === 'error' && errorMessage" class="mt-2 text-xs text-tidy-status-error">
      {{ errorMessage }}
    </p>

    <button
      v-if="status === 'error'"
      type="button"
      class="mt-3 text-xs font-medium text-tidy-orange underline underline-offset-2 active:opacity-70"
      @click="emit('retry')"
    >
      Réessayer
    </button>
  </div>
</template>
