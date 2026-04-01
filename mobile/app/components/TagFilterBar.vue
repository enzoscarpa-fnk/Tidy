<script setup lang="ts">
import type { DetectedType } from '~/types/api'
import { DETECTED_TYPE_LABELS } from '~/types/api'
import type { SearchFilters } from '~/stores/search'

interface Props {
  availableTypes: DetectedType[]
  availableTags: string[]
  activeFilters: SearchFilters
}

const props = defineProps<Props>()

const emit = defineEmits<{
  filterChange: [filters: SearchFilters]
  clearAll: []
}>()

type DateRange = NonNullable<SearchFilters['dateRange']>

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'month', label: 'Ce mois-ci' },
  { value: 'quarter', label: 'Ce trimestre' },
  { value: 'year', label: 'Cette année' },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function isTypeActive(type: DetectedType): boolean {
  return props.activeFilters.types.includes(type)
}

function isTagActive(tag: string): boolean {
  return props.activeFilters.tags.includes(tag)
}

const hasActiveFilters = computed<boolean>(
  () =>
    props.activeFilters.types.length > 0 ||
    props.activeFilters.tags.length > 0 ||
    props.activeFilters.dateRange !== null
)

// ── Handlers ───────────────────────────────────────────────────────────────

function toggleType(type: DetectedType): void {
  const current = [...props.activeFilters.types]
  const idx = current.indexOf(type)
  if (idx === -1) current.push(type)
  else current.splice(idx, 1)
  emit('filterChange', { ...props.activeFilters, types: current })
}

function toggleTag(tag: string): void {
  const current = [...props.activeFilters.tags]
  const idx = current.indexOf(tag)
  if (idx === -1) current.push(tag)
  else current.splice(idx, 1)
  emit('filterChange', { ...props.activeFilters, tags: current })
}

function toggleDateRange(range: DateRange): void {
  const next = props.activeFilters.dateRange === range ? null : range
  emit('filterChange', { ...props.activeFilters, dateRange: next })
}
</script>

<template>
  <div class="flex flex-col gap-3 py-3">

    <!-- Section : Types de document -->
    <div v-if="availableTypes.length" class="px-4">
      <p class="text-[10px] font-semibold uppercase tracking-wider text-tidy-text-secondary mb-1.5">
        Type
      </p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="type in availableTypes"
          :key="type"
          type="button"
          class="px-3 py-1 rounded-full text-xs font-medium border transition-all"
          :class="
            isTypeActive(type)
              ? 'bg-tidy-primary text-white border-tidy-primary shadow-sm'
              : 'bg-tidy-surface text-tidy-text-secondary border-tidy-border hover:border-tidy-primary/50 hover:text-tidy-text-primary'
          "
          @click="toggleType(type)"
        >
          {{ DETECTED_TYPE_LABELS[type] }}
        </button>
      </div>
    </div>

    <!-- Section : Tags personnels -->
    <div v-if="availableTags.length" class="px-4">
      <p class="text-[10px] font-semibold uppercase tracking-wider text-tidy-text-secondary mb-1.5">
        Vos tags
      </p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="tag in availableTags"
          :key="tag"
          type="button"
          class="px-3 py-1 rounded-full text-xs font-medium border transition-all"
          :class="
            isTagActive(tag)
              ? 'bg-tidy-primary/15 text-tidy-primary border-tidy-primary/40 shadow-sm'
              : 'bg-tidy-surface text-tidy-text-secondary border-tidy-border hover:border-tidy-primary/50 hover:text-tidy-text-primary'
          "
          @click="toggleTag(tag)"
        >
          #&nbsp;{{ tag }}
        </button>
      </div>
    </div>

    <!-- Section : Plage de dates -->
    <div class="px-4">
      <p class="text-[10px] font-semibold uppercase tracking-wider text-tidy-text-secondary mb-1.5">
        Période
      </p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="option in DATE_RANGE_OPTIONS"
          :key="option.value"
          type="button"
          class="px-3 py-1 rounded-full text-xs font-medium border transition-all"
          :class="
            activeFilters.dateRange === option.value
              ? 'bg-tidy-primary/15 text-tidy-primary border-tidy-primary/40 shadow-sm'
              : 'bg-tidy-surface text-tidy-text-secondary border-tidy-border hover:border-tidy-primary/50 hover:text-tidy-text-primary'
          "
          @click="toggleDateRange(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <!-- Effacer tous les filtres -->
    <div v-if="hasActiveFilters" class="px-4 pt-0.5">
      <button
        type="button"
        class="text-xs text-tidy-text-secondary hover:text-tidy-primary underline
               underline-offset-2 transition-colors"
        @click="emit('clearAll')"
      >
        Effacer les filtres
      </button>
    </div>

  </div>
</template>
