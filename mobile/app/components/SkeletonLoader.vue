<script setup lang="ts">
interface Props {
  variant?: 'document-card' | 'document-detail' | 'search-result'
  count?: number
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'document-card',
  count: 3,
})

const items = computed(() => Array.from({ length: props.count }))
</script>

<template>
  <!-- document-card -->
  <template v-if="variant === 'document-card'">
    <div
      v-for="(_, i) in items" :key="i"
      class="card-base flex items-start gap-3 p-4"
      role="status" aria-label="Chargement…" aria-busy="true"
    >
      <div class="h-14 w-14 flex-shrink-0 animate-pulse rounded-2xl bg-white/10" />
      <div class="flex-1 space-y-2">
        <div class="flex items-start justify-between gap-2">
          <div class="h-4 w-2/3 animate-pulse rounded-full bg-white/10" />
          <div class="h-5 w-16 animate-pulse rounded-full bg-white/10" />
        </div>
        <div class="h-3 w-1/3 animate-pulse rounded-full bg-white/10" />
        <div class="flex gap-1.5">
          <div class="h-5 w-14 animate-pulse rounded-full bg-white/10" />
          <div class="h-5 w-16 animate-pulse rounded-full bg-white/10" />
        </div>
      </div>
    </div>
  </template>

  <!-- document-detail -->
  <template v-else-if="variant === 'document-detail'">
    <div class="space-y-5 p-4" role="status" aria-label="Chargement du document…" aria-busy="true">
      <div class="mx-auto h-32 w-32 animate-pulse rounded-3xl bg-white/10" />
      <div class="mx-auto h-5 w-3/4 animate-pulse rounded-full bg-white/10" />
      <div class="mx-auto h-6 w-24 animate-pulse rounded-full bg-white/10" />
      <div class="space-y-2 rounded-3xl border border-tidy-border-glass p-4 bg-white/[0.03]">
        <div class="h-4 w-1/4 animate-pulse rounded-full bg-white/10" />
        <div class="h-3 w-full animate-pulse rounded-full bg-white/10" />
        <div class="h-3 w-4/5 animate-pulse rounded-full bg-white/10" />
      </div>
      <div class="space-y-2 rounded-3xl border border-tidy-border-glass p-4 bg-white/[0.03]">
        <div class="h-4 w-1/4 animate-pulse rounded-full bg-white/10" />
        <div class="flex gap-1.5">
          <div class="h-5 w-16 animate-pulse rounded-full bg-white/10" />
          <div class="h-5 w-20 animate-pulse rounded-full bg-white/10" />
        </div>
      </div>
    </div>
  </template>

  <!-- search-result -->
  <template v-else-if="variant === 'search-result'">
    <div
      v-for="(_, i) in items" :key="i"
      class="card-base flex items-start gap-3 p-4"
      role="status" aria-label="Chargement…" aria-busy="true"
    >
      <div class="h-10 w-10 flex-shrink-0 animate-pulse rounded-2xl bg-white/10" />
      <div class="flex-1 space-y-2">
        <div class="h-4 w-3/4 animate-pulse rounded-full bg-white/10" />
        <div class="h-3 w-full animate-pulse rounded-full bg-white/10" />
        <div class="h-3 w-2/3 animate-pulse rounded-full bg-white/10" />
      </div>
    </div>
  </template>
</template>
