<script setup lang="ts">
import { PROCESSING_STATUS_LABELS } from '~/types/api'
import type { ProcessingStatus } from '~/types/api'

// ── Props ──────────────────────────────────────────────────────────────────
interface Props {
  status: ProcessingStatus
}

const props = defineProps<Props>()

// ── Mapping statut → classes Tailwind ─────────────────────────────────────
// Règle absolue (Blueprint §3.3) : PARTIALLY_ENRICHED et CLASSIFIED_ONLY
// ne s'affichent JAMAIS en label brut — ce composant est l'unique point
// de conversion technique → UX dans toute l'application.
const STATUS_CLASSES: Record<ProcessingStatus, string> = {
  PENDING_UPLOAD: 'bg-gray-100 text-gray-500',
  UPLOADED:       'bg-gray-100 text-gray-600',
  PROCESSING:     'bg-blue-100 text-blue-700 animate-status-pulse',
  PARTIALLY_ENRICHED: 'bg-blue-100 text-blue-700 animate-status-pulse',
  CLASSIFIED_ONLY: 'bg-green-100 text-green-700',
  ENRICHED:       'bg-green-100 text-green-700',
  FAILED:         'bg-amber-100 text-amber-700',
  PENDING_RETRY:  'bg-blue-100 text-blue-700 animate-status-pulse',
  ARCHIVED:       'bg-gray-100 text-gray-400',
}

// ── Dot indicator pour les statuts pulsants ────────────────────────────────
const PULSING_STATUSES: ProcessingStatus[] = [
  'PROCESSING',
  'PARTIALLY_ENRICHED',
  'PENDING_RETRY',
]

const isPulsing = computed(() => PULSING_STATUSES.includes(props.status))
const label = computed(() => PROCESSING_STATUS_LABELS[props.status])
const classes = computed(() => STATUS_CLASSES[props.status])
</script>

<template>
  <span
    class="badge-status inline-flex items-center gap-1.5"
    :class="classes"
    :aria-label="`Statut : ${label}`"
  >
    <!-- Point indicateur — visible uniquement pour les statuts en cours -->
    <span
      v-if="isPulsing"
      class="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current"
      aria-hidden="true"
    />
    {{ label }}
  </span>
</template>
