<script setup lang="ts">
import type { DetectedType } from '~/types/api'
import { DETECTED_TYPE_LABELS } from '~/types/api'
import type { SearchFilters } from '~/stores/search'

interface Props {
  availableTypes: DetectedType[]
  availableTags:  string[]
  activeFilters:  SearchFilters
}

const props = defineProps<Props>()
const emit  = defineEmits<{ filterChange: [filters: SearchFilters]; clearAll: [] }>()

type DateRange = NonNullable<SearchFilters['dateRange']>

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'month',   label: 'Ce mois-ci' },
  { value: 'quarter', label: 'Ce trimestre' },
  { value: 'year',    label: 'Cette année' },
]

const isTypeActive  = (type: DetectedType) => props.activeFilters.types.includes(type)
const isTagActive   = (tag: string)        => props.activeFilters.tags.includes(tag)

const hasActiveFilters = computed(() =>
  props.activeFilters.types.length > 0 ||
  props.activeFilters.tags.length  > 0 ||
  props.activeFilters.dateRange !== null
)

function toggleType(type: DetectedType): void {
  const current = [...props.activeFilters.types]
  const idx = current.indexOf(type)
  if (idx === -1) current.push(type); else current.splice(idx, 1)
  emit('filterChange', { ...props.activeFilters, types: current })
}

function toggleTag(tag: string): void {
  const current = [...props.activeFilters.tags]
  const idx = current.indexOf(tag)
  if (idx === -1) current.push(tag); else current.splice(idx, 1)
  emit('filterChange', { ...props.activeFilters, tags: current })
}

function toggleDateRange(range: DateRange): void {
  emit('filterChange', { ...props.activeFilters, dateRange: props.activeFilters.dateRange === range ? null : range })
}
</script>

<template>
  <div class="flex flex-col gap-3 py-3">

    <div v-if="availableTypes.length" class="px-4">
      <p class="text-[10px] font-semibold uppercase tracking-wider text-tidy-text-tertiary mb-1.5">Type</p>
      <div class="flex flex-wrap gap-2">
        <button v-for="type in availableTypes" :key="type" type="button"
                class="px-3 py-1 rounded-full text-xs font-medium border transition-all"
                :class="isTypeActive(type)
            ? 'bg-tidy-orange/20 text-tidy-orange border-tidy-orange/40 shadow-sm'
            : 'bg-white/5 text-tidy-text-secondary border-tidy-border-glass hover:border-tidy-mauve/40 hover:text-tidy-text-primary'"
                @click="toggleType(type)">
          {{ DETECTED_TYPE_LABELS[type] }}
        </button>
      </div>
    </div>

    <div v-if="availableTags.length" class="px-4">
      <p class="text-[10px] font-semibold uppercase tracking-wider text-tidy-text-tertiary mb-1.5">Vos tags</p>
      <div class="flex flex-wrap gap-2">
        <button v-for="tag in availableTags" :key="tag" type="button"
                class="px-3 py-1 rounded-full text-xs font-medium border transition-all"
                :class="isTagActive(tag)
            ? 'bg-tidy-mauve/15 text-tidy-mauve border-tidy-mauve/30 shadow-sm'
            : 'bg-white/5 text-tidy-text-secondary border-tidy-border-glass hover:border-tidy-mauve/40 hover:text-tidy-text-primary'"
                @click="toggleTag(tag)">
          #&nbsp;{{ tag }}
        </button>
      </div>
    </div>

    <div class="px-4">
      <p class="text-[10px] font-semibold uppercase tracking-wider text-tidy-text-tertiary mb-1.5">Période</p>
      <div class="flex flex-wrap gap-2">
        <button v-for="option in DATE_RANGE_OPTIONS" :key="option.value" type="button"
                class="px-3 py-1 rounded-full text-xs font-medium border transition-all"
                :class="activeFilters.dateRange === option.value
            ? 'bg-tidy-mauve/15 text-tidy-mauve border-tidy-mauve/30 shadow-sm'
            : 'bg-white/5 text-tidy-text-secondary border-tidy-border-glass hover:border-tidy-mauve/40 hover:text-tidy-text-primary'"
                @click="toggleDateRange(option.value)">
          {{ option.label }}
        </button>
      </div>
    </div>

    <div v-if="hasActiveFilters" class="px-4 pt-0.5">
      <button type="button"
              class="text-xs text-tidy-text-secondary hover:text-tidy-mauve underline underline-offset-2 transition-colors"
              @click="emit('clearAll')">
        Effacer les filtres
      </button>
    </div>
  </div>
</template>
