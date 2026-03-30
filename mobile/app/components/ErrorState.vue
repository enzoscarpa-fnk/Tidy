<script setup lang="ts">
// ── Props & Emits ──────────────────────────────────────────────────────────
interface Props {
  /**
   * 'list-load'      → échec du chargement de la liste documents
   * 'upload-network' → échec réseau pendant l'upload
   * 'ocr-failed'     → pipeline OCR échoué sur un document
   * 'generic'        → erreur générique non catégorisée
   */
  context: 'list-load' | 'upload-network' | 'ocr-failed' | 'generic'
  /** Affiche le bouton "Réessayer" */
  retryable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  retryable: true,
})

const emit = defineEmits<{
  retry: []
}>()

// ── Contenu contextuel ────────────────────────────────────────────────────
const content = computed(() => {
  switch (props.context) {
    case 'list-load':
      return {
        emoji: '⚠️',
        title: 'Impossible de charger les documents',
        description: 'Vérifiez votre connexion et réessayez.',
        retryLabel: 'Réessayer',
      }
    case 'upload-network':
      return {
        emoji: '📡',
        title: 'Erreur de connexion',
        description: 'L\'envoi du fichier a échoué. Vérifiez votre réseau et réessayez.',
        retryLabel: 'Relancer l\'envoi',
      }
    case 'ocr-failed':
      return {
        emoji: '🔬',
        title: 'Analyse incomplète',
        description: 'Le traitement automatique a rencontré une erreur. Vous pouvez relancer l\'analyse.',
        retryLabel: 'Relancer l\'analyse',
      }
    case 'generic':
    default:
      return {
        emoji: '😕',
        title: 'Une erreur est survenue',
        description: 'Quelque chose s\'est mal passé. Réessayez ou contactez le support si le problème persiste.',
        retryLabel: 'Réessayer',
      }
  }
})
</script>

<template>
  <div
    class="flex flex-col items-center justify-center px-6 py-12 text-center"
    role="alert"
    :aria-label="content.title"
  >
    <!-- Illustration emoji -->
    <span class="mb-4 text-5xl" aria-hidden="true">{{ content.emoji }}</span>

    <!-- Titre -->
    <h3 class="mb-2 text-base font-semibold text-tidy-text-primary">
      {{ content.title }}
    </h3>

    <!-- Description -->
    <p class="mb-6 max-w-xs text-sm text-tidy-text-secondary">
      {{ content.description }}
    </p>

    <!-- Bouton Réessayer -->
    <button
      v-if="retryable"
      type="button"
      class="inline-flex items-center gap-2 rounded-xl border border-tidy-border bg-white px-5 py-2.5 text-sm font-medium text-tidy-text-primary shadow-sm transition-colors hover:bg-tidy-surface-overlay active:scale-95"
      @click="emit('retry')"
    >
      <svg
        class="h-4 w-4"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z"
          clip-rule="evenodd"
        />
      </svg>
      {{ content.retryLabel }}
    </button>
  </div>
</template>
