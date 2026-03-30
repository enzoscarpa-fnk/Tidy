<script setup lang="ts">
import type { DocumentFilters } from '~/types/api'

// ── Props ──────────────────────────────────────────────────────────────────
interface Props {
  workspaceId: string
  filters?: DocumentFilters
}

const props = withDefaults(defineProps<Props>(), {
  filters: () => ({}),
})

// ── Store & Router ─────────────────────────────────────────────────────────
const documentStore = useDocumentStore()
const router = useRouter()

// ── Infinite scroll sentinel ───────────────────────────────────────────────
// useIntersectionObserver est auto-importé via @vueuse/nuxt
const sentinel = ref<HTMLElement | null>(null)
const isFetchingNextPage = ref(false)

const { stop: stopObserver } = useIntersectionObserver(
  sentinel,
  async ([entry]) => {
    if (
      entry?.isIntersecting &&
      documentStore.hasNextPage &&
      !isFetchingNextPage.value &&
      !documentStore.isLoading
    ) {
      isFetchingNextPage.value = true
      try {
        await documentStore.fetchNextPage()
      } finally {
        isFetchingNextPage.value = false
      }
    }
  },
  { threshold: 0.1 }
)

// ── Navigation ─────────────────────────────────────────────────────────────
function navigateToDocument(documentId: string): void {
  router.push(`/workspace/${props.workspaceId}/document/${documentId}`)
}

// ── Handlers ───────────────────────────────────────────────────────────────
function handleEmptyAction(): void {
  router.push(`/workspace/${props.workspaceId}/upload`)
}

async function handleRetry(): Promise<void> {
  await documentStore.fetchDocuments(props.workspaceId, props.filters)
  if (documentStore.hasDocumentsPending) {
    documentStore.startPolling(props.workspaceId, props.filters)
  }
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

onMounted(async () => {
  // Reset si on change de workspace (évite flash des données précédentes)
  documentStore.reset()

  await documentStore.fetchDocuments(props.workspaceId, props.filters)

  // Démarrer le polling si des documents sont en cours de traitement
  if (documentStore.hasDocumentsPending) {
    documentStore.startPolling(props.workspaceId, props.filters)
  }
})

// Redémarrer quand les filtres changent (ex : depuis la SearchBar du Dashboard)
watch(
  () => props.filters,
  async (newFilters) => {
    documentStore.stopPolling()
    await documentStore.fetchDocuments(props.workspaceId, newFilters)
    if (documentStore.hasDocumentsPending) {
      documentStore.startPolling(props.workspaceId, newFilters)
    }
  },
  { deep: true }
)

onUnmounted(() => {
  // Règle absolue du blueprint : stopper le polling au unmount
  documentStore.stopPolling()
  // Stopper l'observer pour éviter les memory leaks
  stopObserver()
})
</script>

<template>
  <section aria-label="Liste des documents" class="flex flex-col gap-2">

    <!-- ── État : chargement initial ──────────────────────────────────────── -->
    <SkeletonLoader
      v-if="documentStore.isLoading && documentStore.documents.length === 0"
      variant="document-card"
      :count="5"
    />

    <!-- ── État : erreur ───────────────────────────────────────────────────── -->
    <ErrorState
      v-else-if="!documentStore.isLoading && !!documentStore.error"
      context="list-load"
      :retryable="true"
      @retry="handleRetry"
    />

    <!-- ── État : liste vide ───────────────────────────────────────────────── -->
    <EmptyState
      v-else-if="
    !documentStore.isLoading &&
    !documentStore.error &&
    documentStore.documents.length === 0
  "
      :context="filters?.query ? 'search' : 'dashboard'"
      :query="filters?.query"
      @primary-action="handleEmptyAction"
    />

    <!-- ── État : liste de documents ───────────────────────────────────────── -->
    <template
      v-else-if="!documentStore.error && documentStore.documents.length > 0"
    >
      <TransitionGroup
        name="list"
        tag="ul"
        class="flex flex-col gap-2"
        aria-label="Documents"
      >
        <li
          v-for="document in documentStore.documents"
          :key="document.id"
        >
          <DocumentCard
            :document="document"
            @click="navigateToDocument"
          />
        </li>
      </TransitionGroup>

      <!-- ── Infinite scroll sentinel ──────────────────────────────── -->
      <div
        ref="sentinel"
        class="h-4 w-full"
        aria-hidden="true"
      />

      <!-- Loader page suivante (ne remplace pas la liste — juste en bas) -->
      <div
        v-if="isFetchingNextPage"
        class="flex items-center justify-center py-4"
        aria-label="Chargement de la suite…"
        aria-live="polite"
      >
        <svg
          class="h-5 w-5 animate-spin text-tidy-text-tertiary"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      </div>

      <!-- Fin de liste — feedback discret -->
      <p
        v-if="!documentStore.hasNextPage && documentStore.documents.length > 0 && !isFetchingNextPage"
        class="py-3 text-center text-xs text-tidy-text-tertiary"
        aria-live="polite"
      >
        {{ documentStore.documents.length }}
        {{ documentStore.documents.length === 1 ? 'document' : 'documents' }}
      </p>
    </template>

  </section>
</template>

<style scoped>
/* Transition d'entrée pour les nouveaux documents (polling) */
.list-enter-active {
  transition: all 0.25s ease-out;
}
.list-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}

/* Pas de transition de sortie — évite le flash lors du reset */
.list-leave-active {
  display: none;
}
</style>
