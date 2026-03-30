<script setup lang="ts">
// ── Props ──────────────────────────────────────────────────────────────────
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
  <!-- ── Variant : document-card (liste Dashboard) ─────────────────────── -->
  <template v-if="variant === 'document-card'">
    <div
      v-for="(_, i) in items"
      :key="i"
      class="card-base flex items-start gap-3 p-4"
      role="status"
      aria-label="Chargement…"
      aria-busy="true"
    >
      <!-- Miniature skeleton -->
      <div class="h-14 w-14 flex-shrink-0 animate-pulse rounded-xl bg-tidy-border" />

      <div class="flex-1 space-y-2">
        <!-- Titre + badge -->
        <div class="flex items-start justify-between gap-2">
          <div class="h-4 w-2/3 animate-pulse rounded-md bg-tidy-border" />
          <div class="h-5 w-16 animate-pulse rounded-full bg-tidy-border" />
        </div>
        <!-- Méta -->
        <div class="h-3 w-1/3 animate-pulse rounded-md bg-tidy-border" />
        <!-- Tags -->
        <div class="flex gap-1.5">
          <div class="h-5 w-14 animate-pulse rounded-full bg-tidy-border" />
          <div class="h-5 w-16 animate-pulse rounded-full bg-tidy-border" />
        </div>
      </div>
    </div>
  </template>

  <!-- ── Variant : document-detail ─────────────────────────────────────── -->
  <template v-else-if="variant === 'document-detail'">
    <div
      class="space-y-5 p-4"
      role="status"
      aria-label="Chargement du document…"
      aria-busy="true"
    >
      <!-- Thumbnail large -->
      <div class="mx-auto h-32 w-32 animate-pulse rounded-2xl bg-tidy-border" />
      <!-- Titre -->
      <div class="mx-auto h-5 w-3/4 animate-pulse rounded-md bg-tidy-border" />
      <!-- Badge statut -->
      <div class="mx-auto h-6 w-24 animate-pulse rounded-full bg-tidy-border" />
      <!-- Section intelligence -->
      <div class="space-y-2 rounded-xl border border-tidy-border p-4">
        <div class="h-4 w-1/4 animate-pulse rounded-md bg-tidy-border" />
        <div class="h-3 w-full animate-pulse rounded-md bg-tidy-border" />
        <div class="h-3 w-4/5 animate-pulse rounded-md bg-tidy-border" />
      </div>
      <!-- Section metadata -->
      <div class="space-y-2 rounded-xl border border-tidy-border p-4">
        <div class="h-4 w-1/4 animate-pulse rounded-md bg-tidy-border" />
        <div class="flex gap-1.5">
          <div class="h-5 w-16 animate-pulse rounded-full bg-tidy-border" />
          <div class="h-5 w-20 animate-pulse rounded-full bg-tidy-border" />
        </div>
      </div>
    </div>
  </template>

  <!-- ── Variant : search-result ────────────────────────────────────────── -->
  <template v-else-if="variant === 'search-result'">
    <div
      v-for="(_, i) in items"
      :key="i"
      class="card-base flex items-start gap-3 p-4"
      role="status"
      aria-label="Chargement…"
      aria-busy="true"
    >
      <div class="h-10 w-10 flex-shrink-0 animate-pulse rounded-lg bg-tidy-border" />
      <div class="flex-1 space-y-2">
        <div class="h-4 w-3/4 animate-pulse rounded-md bg-tidy-border" />
        <!-- Extrait de texte surligné -->
        <div class="h-3 w-full animate-pulse rounded-md bg-tidy-border" />
        <div class="h-3 w-2/3 animate-pulse rounded-md bg-tidy-border" />
      </div>
    </div>
  </template>
</template>
