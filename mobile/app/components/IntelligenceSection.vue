<script setup lang="ts">
import type { DetectedType, DocumentIntelligence, EntityType } from '~/types/api'
import { DETECTED_TYPE_LABELS } from '~/types/api'

interface Props {
  intelligence: DocumentIntelligence
  /** Si défini, l'utilisateur a corrigé le type — on affiche la détection originale en secondaire */
  userOverrideType: DetectedType | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  addSuggestedTag: [tag: string]
  requestTypeOverride: []
}>()

// Règle R6 : jamais "confidence score" dans le template
const isUncertain = computed(
  () =>
    props.intelligence.globalConfidenceScore !== null &&
    props.intelligence.globalConfidenceScore < 0.6
)

const displayedType = computed(() =>
  props.userOverrideType
    ? DETECTED_TYPE_LABELS[props.userOverrideType]
    : props.intelligence.detectedType
      ? DETECTED_TYPE_LABELS[props.intelligence.detectedType]
      : null
)

const originalDetectedLabel = computed(() =>
  props.userOverrideType && props.intelligence.detectedType
    ? DETECTED_TYPE_LABELS[props.intelligence.detectedType]
    : null
)

const ENTITY_LABELS: Record<EntityType, string> = {
  AMOUNT: 'Montant',
  DATE: 'Date',
  VENDOR: 'Fournisseur',
  IBAN: 'IBAN',
  SIRET: 'SIRET',
}
</script>

<template>
  <!--
    Règle R7 : ce composant est READ ONLY — aucun v-model, aucun champ modifiable.
    Règle R6 : les mots techniques (ENRICHED, confidence score…) n'apparaissent jamais ici.
  -->
  <section
    class="rounded-2xl border border-tidy-primary/20 bg-tidy-primary/5 p-4"
    aria-label="Détecté automatiquement"
  >
    <!-- En-tête section IA -->
    <div class="mb-3 flex items-center gap-2">
      <svg class="h-4 w-4 flex-shrink-0 text-tidy-primary" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M8 1a.5.5 0 0 1 .45.28l1.57 3.18 3.51.51a.5.5 0 0 1 .28.85L11.3 8.26l.6 3.5a.5.5 0 0 1-.73.53L8 10.56l-3.14 1.73a.5.5 0 0 1-.73-.53l.6-3.5L2.19 5.82a.5.5 0 0 1 .28-.85l3.51-.51L7.55 1.28A.5.5 0 0 1 8 1z" />
      </svg>
      <span class="text-xs font-semibold uppercase tracking-wide text-tidy-primary">
        Détecté automatiquement
      </span>
    </div>

    <!-- Alerte détection incertaine (sans exposer le score brut) -->
    <div
      v-if="isUncertain"
      class="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700"
      role="alert"
    >
      <svg class="mt-0.5 h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
      Détection incertaine — vérifiez les informations ci-dessous.
    </div>

    <!-- Type de document détecté -->
    <div v-if="displayedType" class="mb-3">
      <p class="mb-1 text-xs text-tidy-text-secondary">Type de document</p>
      <div class="flex flex-wrap items-center gap-2">
        <span class="rounded-lg bg-tidy-primary/15 px-3 py-1 text-sm font-semibold text-tidy-primary">
          {{ displayedType }}
        </span>
        <!-- Détection originale en secondaire si override actif -->
        <span
          v-if="originalDetectedLabel"
          class="text-xs text-tidy-text-secondary line-through"
          :aria-label="`Détection originale : ${originalDetectedLabel}`"
        >
          {{ originalDetectedLabel }}
        </span>
      </div>
      <button
        type="button"
        class="mt-1.5 text-xs text-tidy-text-secondary underline underline-offset-2 active:opacity-60"
        @click="emit('requestTypeOverride')"
      >
        Ce n'est pas le bon type ?
      </button>
    </div>

    <!-- Entités extraites -->
    <div v-if="intelligence.extractedEntities.length > 0" class="mb-3">
      <p class="mb-2 text-xs text-tidy-text-secondary">Informations détectées</p>
      <dl class="grid grid-cols-2 gap-x-3 gap-y-2">
        <div
          v-for="entity in intelligence.extractedEntities"
          :key="`${entity.entityType}-${entity.value}`"
          class="min-w-0"
        >
          <dt class="text-xs text-tidy-text-secondary">
            {{ ENTITY_LABELS[entity.entityType] ?? entity.entityType }}
          </dt>
          <dd class="truncate text-sm font-medium text-tidy-text-primary">
            {{ entity.value }}
          </dd>
        </div>
      </dl>
    </div>

    <!-- Tags suggérés -->
    <div v-if="intelligence.suggestedTags.length > 0">
      <p class="mb-2 text-xs text-tidy-text-secondary">Tags suggérés</p>
      <div class="flex flex-wrap gap-1.5">
        <div
          v-for="tag in intelligence.suggestedTags"
          :key="tag"
          class="flex items-center gap-1"
        >
          <!-- Règle R8 : variante 'suggested' pour différenciation visuelle -->
          <TagChip :label="tag" variant="suggested" />
          <button
            type="button"
            class="text-xs text-tidy-primary underline underline-offset-2 active:opacity-60"
            :aria-label="`Ajouter le tag ${tag} à mes tags`"
            @click="emit('addSuggestedTag', tag)"
          >
            + Ajouter
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
