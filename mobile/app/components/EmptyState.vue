<script setup lang="ts">
// ── Props & Emits ──────────────────────────────────────────────────────────
interface Props {
  /**
   * 'dashboard'              → workspace sans aucun document
   * 'search'                 → recherche sans résultats avec query
   * 'search-empty-workspace' → recherche dans un workspace vide
   */
  context: 'dashboard' | 'search' | 'search-empty-workspace'
  /** Terme recherché — utilisé dans le contexte 'search' */
  query?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  primaryAction: []
}>()

// ── Contenu contextuel ────────────────────────────────────────────────────
const content = computed(() => {
  switch (props.context) {
    case 'dashboard':
      return {
        emoji: '📂',
        title: 'Aucun document pour l\'instant',
        description: 'Ajoutez votre premier document pour commencer à organiser vos fichiers.',
        cta: 'Ajouter un document',
        showCta: true,
      }
    case 'search':
      return {
        emoji: '🔍',
        title: props.query
          ? `Aucun résultat pour « ${props.query} »`
          : 'Aucun résultat',
        description: 'Essayez avec d\'autres mots-clés ou ajustez vos filtres.',
        cta: 'Effacer la recherche',
        showCta: true,
      }
    case 'search-empty-workspace':
      return {
        emoji: '📂',
        title: 'Cet espace de travail est vide',
        description: 'Ajoutez des documents pour pouvoir les rechercher.',
        cta: 'Ajouter un document',
        showCta: true,
      }
  }
})
</script>

<template>
  <div
    class="flex flex-col items-center justify-center px-6 py-16 text-center"
    role="status"
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

    <!-- CTA principal -->
    <button
      v-if="content.showCta"
      type="button"
      class="inline-flex items-center gap-2 rounded-xl bg-tidy-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-tidy-primary-dark active:scale-95"
      @click="emit('primaryAction')"
    >
      <svg
        v-if="context === 'dashboard' || context === 'search-empty-workspace'"
        class="h-4 w-4"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z"
        />
      </svg>
      <svg
        v-else
        class="h-4 w-4"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
          clip-rule="evenodd"
        />
      </svg>
      {{ content.cta }}
    </button>
  </div>
</template>
