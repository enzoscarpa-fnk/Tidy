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

// ── Pull-to-refresh ────────────────────────────────────────────────────────
const isPulling = ref(false)
const pullStartY = ref(0)
const pullDistance = ref(0)
const PULL_THRESHOLD = 72 // px avant déclenchement

function onTouchStart(e: TouchEvent): void {
  // Seulement si on est en haut de la liste
  if (window.scrollY === 0) {
    pullStartY.value = e.touches[0]?.clientY ?? 0
  }
}

function onTouchMove(e: TouchEvent): void {
  if (!pullStartY.value) return
  const delta = (e.touches[0]?.clientY ?? 0) - pullStartY.value
  if (delta > 0 && window.scrollY === 0) {
    pullDistance.value = Math.min(delta * 0.5, PULL_THRESHOLD + 20) // résistance
  }
}

async function onTouchEnd(): Promise<void> {
  if (pullDistance.value >= PULL_THRESHOLD && !isPulling.value) {
    isPulling.value = true
    try {
      await documentStore.fetchDocuments(props.workspaceId, props.filters)
      if (documentStore.hasDocumentsPending) {
        documentStore.startPolling(props.workspaceId, props.filters)
      }
    } finally {
      isPulling.value = false
    }
  }
  pullDistance.value = 0
  pullStartY.value = 0
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
  <section
    aria-label="Liste des documents"
    class="flex flex-col gap-2"
    @touchstart.passive="onTouchStart"
    @touchmove.passive="onTouchMove"
    @touchend.passive="onTouchEnd"
  >

    <!-- ── Pull-to-refresh indicator ──────────────────────────────────────── -->
    <div
      class="flex items-center justify-center overflow-hidden transition-all duration-200 ease-out"
      :style="{ height: `${pullDistance}px`, opacity: pullDistance / PULL_THRESHOLD }"
      aria-hidden="true"
    >
      <svg
        class="h-5 w-5 text-tidy-text-tertiary transition-transform duration-200"
        :class="{ 'animate-spin': isPulling }"
        :style="{ transform: `rotate(${(pullDistance / PULL_THRESHOLD) * 180}deg)` }"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </div>

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
