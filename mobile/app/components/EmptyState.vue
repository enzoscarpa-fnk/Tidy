<script setup lang="ts">
interface Props {
  context: 'dashboard' | 'search' | 'search-empty-workspace'
  query?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  primaryAction: []
}>()

const content = computed(() => {
  switch (props.context) {
    case 'dashboard':
      return {
        title: 'Aucun document pour l\'instant',
        description: 'Utilisez le bouton + pour ajouter votre premier document.',
        cta: null, // Le FAB est mis en avant — pas de bouton ici
        showCta: false,
      }
    case 'search':
      return {
        title: props.query
          ? `Aucun résultat pour « ${props.query} »`
          : 'Aucun résultat',
        description: 'Essayez avec d\'autres mots-clés ou ajustez vos filtres.',
        cta: 'Effacer la recherche',
        showCta: true,
      }
    case 'search-empty-workspace':
      return {
        title: 'Cet espace de travail est vide',
        description: 'Ajoutez des documents pour pouvoir les rechercher.',
        cta: 'Ajouter un document',
        showCta: true,
      }
  }
})
</script>

<template>
  <!-- Dashboard : glassmorphism sombre centré, pas de CTA (le FAB est mis en valeur) -->
  <div
    v-if="context === 'dashboard'"
    class="flex flex-col items-center justify-center px-6 py-10 text-center"
    role="status"
    :aria-label="content.title"
  >
    <div class="glass-panel flex flex-col items-center px-8 py-8 max-w-xs w-full">
      <!-- Icône dossier (icon-folder.png) -->
      <img
        src="/img/icon-folder.png"
        alt=""
        aria-hidden="true"
        class="mb-4 h-20 w-20 object-contain opacity-80"
      />
      <h3 class="mb-2 text-base font-semibold text-tidy-text-primary">
        {{ content.title }}
      </h3>
      <p class="text-sm text-tidy-text-secondary leading-relaxed">
        {{ content.description }}
      </p>
    </div>
  </div>

  <!-- Search / autres contextes : style standard dark -->
  <div
    v-else
    class="flex flex-col items-center justify-center px-6 py-16 text-center"
    role="status"
    :aria-label="content.title"
  >
    <span class="mb-4 text-5xl" aria-hidden="true">🔍</span>

    <h3 class="mb-2 text-base font-semibold text-tidy-text-primary">
      {{ content.title }}
    </h3>

    <p class="mb-6 max-w-xs text-sm text-tidy-text-secondary">
      {{ content.description }}
    </p>

    <button
      v-if="content.showCta"
      type="button"
      class="btn-primary w-auto px-6"
      @click="emit('primaryAction')"
    >
      {{ content.cta }}
    </button>
  </div>
</template>
