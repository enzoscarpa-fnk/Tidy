<script setup lang="ts">
// ── Middleware & Meta ──────────────────────────────────────────────────────
definePageMeta({
  middleware: ['workspace'],
})

// ── Stores & Router ────────────────────────────────────────────────────────
const workspaceStore = useWorkspaceStore()
const documentStore = useDocumentStore()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

// ── Workspace courant ──────────────────────────────────────────────────────
const workspaceId = computed(() => route.params.workspaceId as string)

// ── Actions de la page ─────────────────────────────────────────────────────
function navigateToUpload(): void {
  router.push(`/workspace/${workspaceId.value}/upload`)
}

// ── SearchBar navigue vers /search ──────────────────────────────
// La recherche quitte le Dashboard et délègue à useSearchStore + SearchResults.
function handleSearch(query: string): void {
  router.push({
    path: `/workspace/${workspaceId.value}/search`,
    query: { query },
  })
}
</script>

<template>
  <div class="relative flex min-h-screen flex-col bg-tidy-surface">

    <!-- ── Header ─────────────────────────────────────────────────────── -->
    <header class="sticky top-0 z-30 border-b border-tidy-border bg-white">
      <div class="flex items-center gap-3 px-4 py-3">

        <!-- Sélecteur de workspace -->
        <WorkspaceSelector class="flex-shrink-0" />

        <!-- SearchBar -->
        <!-- La soumission navigue vers /search?query=... (jamais de live search) -->
        <SearchBar
          class="flex-1"
          placeholder="Rechercher un document…"
          @search="handleSearch"
        />

        <!-- Bouton Profil → /profile -->
        <button
          type="button"
          class="flex-shrink-0 rounded-full p-0.5 ring-2 ring-tidy-border transition-colors hover:ring-tidy-primary"
          aria-label="Mon profil"
          @click="router.push('/profile')"
        >
          <div class="flex h-7 w-7 items-center justify-center rounded-full bg-tidy-primary/10">
            <span class="text-xs font-bold text-tidy-primary">
              {{ authStore.user?.displayName?.charAt(0)?.toUpperCase() ?? '?' }}
            </span>
          </div>
        </button>
      </div>
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

      <!-- Liste des documents — affiche TOUS les docs du workspace (pas de filtre search ici) -->
      <DocumentList :workspace-id="workspaceId" />

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
