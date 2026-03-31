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
  if (props.status === 'success') return 'bg-green-500'
  if (props.status === 'error')   return 'bg-red-500'
  return 'bg-tidy-primary'
})

const barWidth = computed(() =>
  props.status === 'error' ? '100%' : `${props.progress}%`
)
</script>

<template>
  <div class="w-full rounded-2xl border border-tidy-border bg-white p-4 shadow-sm">
    <div class="mb-2 flex items-center justify-between gap-2">
      <span class="min-w-0 flex-1 truncate text-sm font-medium text-tidy-text-primary">
        {{ filename }}
      </span>
      <span
        v-if="status === 'uploading'"
        class="flex-shrink-0 text-xs tabular-nums text-tidy-text-secondary"
      >
        {{ progress }}&nbsp;%
      </span>
      <span v-else-if="status === 'success'" class="flex-shrink-0 text-xs font-semibold text-green-600">
        Envoyé ✓
      </span>
      <span v-else class="flex-shrink-0 text-xs font-semibold text-red-600">
        Échec
      </span>
    </div>

    <div class="h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div
        class="h-2 rounded-full transition-all duration-300 ease-out"
        :class="barColor"
        :style="{ width: barWidth }"
      />
    </div>

    <p v-if="status === 'error' && errorMessage" class="mt-2 text-xs text-red-600">
      {{ errorMessage }}
    </p>

    <button
      v-if="status === 'error'"
      type="button"
      class="mt-3 text-xs font-medium text-tidy-primary underline underline-offset-2 active:opacity-70"
      @click="emit('retry')"
    >
      Réessayer
    </button>
  </div>
</template>
