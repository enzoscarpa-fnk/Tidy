<script setup lang="ts">
import { PROCESSING_STATUS_LABELS } from '~/types/api'
import type { ProcessingStatus } from '~/types/api'

interface Props { status: ProcessingStatus }
const props = defineProps<Props>()

// Couleurs adaptées au dark mode — fond semi-transparent, texte lisible
const STATUS_CLASSES: Record<ProcessingStatus, string> = {
  PENDING_UPLOAD:     'bg-white/10 text-tidy-text-secondary',
  UPLOADED:           'bg-white/10 text-tidy-text-secondary',
  PROCESSING:         'bg-blue-500/15 text-blue-300 animate-status-pulse',
  PARTIALLY_ENRICHED: 'bg-blue-500/15 text-blue-300 animate-status-pulse',
  CLASSIFIED_ONLY:    'bg-tidy-status-success/15 text-tidy-status-success',
  ENRICHED:           'bg-tidy-status-success/15 text-tidy-status-success',
  FAILED:             'bg-tidy-status-warning/15 text-tidy-status-warning',
  PENDING_RETRY:      'bg-blue-500/15 text-blue-300 animate-status-pulse',
  ARCHIVED:           'bg-white/8 text-tidy-text-tertiary',
}

const PULSING_STATUSES: ProcessingStatus[] = ['PROCESSING', 'PARTIALLY_ENRICHED', 'PENDING_RETRY']
const isPulsing = computed(() => PULSING_STATUSES.includes(props.status))
const label     = computed(() => PROCESSING_STATUS_LABELS[props.status])
const classes   = computed(() => STATUS_CLASSES[props.status])
</script>

<template>
  <span
    class="badge-status inline-flex items-center gap-1.5"
    :class="classes"
    :aria-label="`Statut : ${label}`"
  >
    <span v-if="isPulsing" class="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current" aria-hidden="true" />
    {{ label }}
  </span>
</template>
