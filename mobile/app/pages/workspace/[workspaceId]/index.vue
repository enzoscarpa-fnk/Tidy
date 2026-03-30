<script setup lang="ts">
import type { DocumentFilters } from '~/types/api'

// ── Middleware & Meta ──────────────────────────────────────────────────────
// Le middleware 'workspace' vérifie l'ownership et synchro currentWorkspaceId
definePageMeta({
  middleware: ['workspace'],
})

// ── Stores & Router ────────────────────────────────────────────────────────
const workspaceStore = useWorkspaceStore()
const documentStore = useDocumentStore()
const route = useRoute()
const router = useRouter()

// ── Workspace courant ──────────────────────────────────────────────────────
// [workspaceId] est garanti string par le middleware (ownership vérifié)
const workspaceId = computed(() => route.params.workspaceId as string)

// ── Filtres actifs (transmis à DocumentList) ───────────────────────────────
// NOTE Phase 7 : seul le filtre `query` est géré ici via le champ de recherche
// inline. En Phase 9, ce bloc sera remplacé par <SearchBar> + useSearchStore.
const activeFilters = ref<DocumentFilters>({})

// ── Recherche inline (sera remplacé par SearchBar.vue en Phase 9) ──────────
const searchInput = ref('')

function handleSearch(): void {
  const q = searchInput.value.trim()
  // UX Flow §6 : déclencher à la soumission uniquement — jamais en live
  activeFilters.value = q ? { query: q } : {}
}

function clearSearch(): void {
  searchInput.value = ''
  activeFilters.value = {}
}

// ── Actions de la page ─────────────────────────────────────────────────────
function navigateToUpload(): void {
  router.push(`/workspace/${workspaceId.value}/upload`)
}

async function handleRefresh(): Promise<void> {
  await documentStore.fetchDocuments(workspaceId.value, activeFilters.value)
  if (documentStore.hasDocumentsPending) {
    documentStore.startPolling(workspaceId.value, activeFilters.value)
  }
}

// ── Reset filtres au changement de workspace ───────────────────────────────
// (ex : navigation via WorkspaceSelector)
watch(workspaceId, () => {
  searchInput.value = ''
  activeFilters.value = {}
})
</script>

<template>
  <div class="relative flex min-h-screen flex-col bg-tidy-surface">

    <!-- ── Header ─────────────────────────────────────────────────────── -->
    <header class="sticky top-0 z-30 border-b border-tidy-border bg-white">
      <div class="flex items-center gap-3 px-4 py-3">

        <!-- Sélecteur de workspace -->
        <WorkspaceSelector class="flex-shrink-0" />

        <!-- Barre de recherche inline (Phase 9 → sera <SearchBar />) -->
        <div class="relative flex-1">
          <label for="dashboard-search" class="sr-only">
            Rechercher un document
          </label>
          <div class="relative">
            <!-- Icône loupe -->
            <svg
              class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tidy-text-tertiary"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fill-rule="evenodd"
                d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                clip-rule="evenodd"
              />
            </svg>

            <input
              id="dashboard-search"
              v-model="searchInput"
              type="search"
              placeholder="Rechercher un document…"
              autocomplete="off"
              class="w-full rounded-lg border border-tidy-border bg-tidy-surface py-2 pl-9 pr-9 text-sm text-tidy-text-primary placeholder:text-tidy-text-tertiary transition-colors focus:border-tidy-primary focus:outline-none focus:ring-2 focus:ring-tidy-primary/20"
              @keydown.enter.prevent="handleSearch"
              @keydown.escape="clearSearch"
            />

            <!-- Bouton effacer (visible uniquement si query non vide) -->
            <button
              v-if="searchInput"
              type="button"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-tidy-text-tertiary transition-colors hover:text-tidy-text-primary"
              aria-label="Effacer la recherche"
              @click="clearSearch"
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
                />
              </svg>
            </button>
          </div>
        </div>

        <!-- Bouton Actualiser — discret, icône seule -->
        <button
          type="button"
          class="flex-shrink-0 rounded-lg p-2 text-tidy-text-secondary transition-colors hover:bg-tidy-surface-overlay hover:text-tidy-text-primary"
          :class="{ 'pointer-events-none opacity-40': documentStore.isLoading }"
          aria-label="Actualiser la liste"
          :disabled="documentStore.isLoading"
          @click="handleRefresh"
        >
          <svg
            class="h-5 w-5 transition-transform"
            :class="{ 'animate-spin': documentStore.isLoading }"
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
        </button>
      </div>

      <!-- Indicateur de recherche active -->
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 -translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-1"
      >
        <div
          v-if="activeFilters.query"
          class="flex items-center gap-2 border-t border-tidy-border bg-tidy-primary/5 px-4 py-2"
        >
          <svg
            class="h-3.5 w-3.5 flex-shrink-0 text-tidy-primary"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fill-rule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clip-rule="evenodd"
            />
          </svg>
          <p class="text-xs text-tidy-primary">
            Résultats pour
            <span class="font-semibold">« {{ activeFilters.query }} »</span>
          </p>
          <button
            type="button"
            class="ml-auto text-xs font-medium text-tidy-primary underline-offset-2 hover:underline"
            @click="clearSearch"
          >
            Effacer
          </button>
        </div>
      </Transition>
    </header>

    <!-- ── Contenu principal ───────────────────────────────────────────── -->
    <main class="flex-1 px-4 py-4">

      <!-- Titre workspace + compteur — discret -->
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h1 class="text-base font-semibold text-tidy-text-primary">
            {{ workspaceStore.currentWorkspace?.name ?? '' }}
          </h1>
          <p
            v-if="!documentStore.isLoading && !documentStore.error"
            class="text-xs text-tidy-text-tertiary"
          >
            {{ workspaceStore.currentWorkspace?.documentCount ?? 0 }}
            {{ (workspaceStore.currentWorkspace?.documentCount ?? 0) === 1
            ? 'document'
            : 'documents' }}
          </p>
        </div>
      </div>

      <!-- Liste des documents (Smart Component — gère son propre cycle de vie) -->
      <DocumentList
        :workspace-id="workspaceId"
        :filters="activeFilters"
      />

    </main>

    <!-- ── FAB : Ajouter un document ──────────────────────────────────── -->
    <div
      class="fixed bottom-6 right-4 z-40"
      aria-label="Ajouter un document"
    >
      <button
        type="button"
        class="flex h-14 w-14 items-center justify-center rounded-full bg-tidy-primary text-white shadow-lg transition-all hover:bg-tidy-primary-dark hover:shadow-xl active:scale-95"
        aria-label="Ajouter un document"
        @click="navigateToUpload"
      >
        <svg
          class="h-6 w-6"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            d="M11.25 4.75a.75.75 0 011.5 0v6.5h6.5a.75.75 0 010 1.5h-6.5v6.5a.75.75 0 01-1.5 0v-6.5h-6.5a.75.75 0 010-1.5h6.5v-6.5z"
          />
        </svg>
      </button>
    </div>

  </div>
</template>
