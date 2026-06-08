<script setup lang="ts">
definePageMeta({
  middleware: ['workspace'],
})

const workspaceStore = useWorkspaceStore()
const documentStore  = useDocumentStore()
const authStore      = useAuthStore()
const route          = useRoute()
const router         = useRouter()

const workspaceId = computed(() => route.params.workspaceId as string)

// ── FAB expandable ─────────────────────────────────────────────────────────
const fabOpen = ref(false)

function toggleFab(): void  { fabOpen.value = !fabOpen.value }
function closeFab(): void   { fabOpen.value = false }

function handleScan(): void {
  closeFab()
  router.push(`/workspace/${workspaceId.value}/scan?source=camera`)
}

function handleGallery(): void {
  closeFab()
  router.push(`/workspace/${workspaceId.value}/scan?source=gallery`)
}

const fileInputRef = ref<HTMLInputElement | null>(null)

function handleImportDocument(): void {
  closeFab()
  nextTick(() => fileInputRef.value?.click())
}

async function onFileSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file  = input.files?.[0]
  input.value = ''

  if (!file) return

  if (file.type !== 'application/pdf') {
    alert('Format non supporté. Utilisez un fichier PDF.')
    return
  }
  if (file.size > 50 * 1024 * 1024) {
    alert('Fichier trop volumineux. Maximum : 50 Mo.')
    return
  }

  await documentStore.uploadDocument(workspaceId.value, file)
}

// ── Recherche ──────────────────────────────────────────────────────────────
function handleSearch(query: string): void {
  router.push({
    path:  `/workspace/${workspaceId.value}/search`,
    query: { query },
  })
}
</script>

<template>
  <div class="relative flex min-h-screen flex-col bg-tidy-surface">

    <!-- ── Header ─────────────────────────────────────────────────────── -->
    <header class="sticky top-0 z-30 border-b border-tidy-border bg-white">
      <div class="flex items-center gap-3 px-4 py-3">
        <WorkspaceSelector class="flex-shrink-0" />
        <div class="flex-1" />
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

      <!-- Barre de recherche pleine largeur -->
      <div class="mb-4">
        <SearchBar
          class="w-full"
          placeholder="Rechercher un document…"
          :full-width="true"
          @search="handleSearch"
        />
      </div>

      <DocumentList :workspace-id="workspaceId" />
    </main>

    <!-- ── Backdrop ────────────────────────────────────────────────────── -->
    <Transition name="fade">
      <div
        v-if="fabOpen"
        class="fixed inset-0 z-30 bg-black/30"
        aria-hidden="true"
        @click="closeFab"
      />
    </Transition>

    <!-- ── FAB + actions expandables ──────────────────────────────────── -->
    <div class="fixed bottom-6 right-4 z-40 flex flex-col items-end gap-4">

      <!-- Action : Scanner -->
      <Transition name="fab-item">
        <div v-if="fabOpen" class="flex items-center gap-3">
          <span class="rounded-xl bg-white px-3 py-2 text-sm font-medium text-tidy-text-primary shadow-md">
            Scanner un document
          </span>
          <button
            type="button"
            class="flex h-14 w-14 items-center justify-center rounded-full bg-white text-tidy-primary shadow-lg transition-all hover:bg-tidy-primary/5 active:scale-95"
            aria-label="Scanner un document"
            @click="handleScan"
          >
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </Transition>

      <!-- Action : Galerie -->
      <Transition name="fab-item">
        <div v-if="fabOpen" class="flex items-center gap-3">
          <span class="rounded-xl bg-white px-3 py-2 text-sm font-medium text-tidy-text-primary shadow-md">
            Importer depuis la galerie
          </span>
          <button
            type="button"
            class="flex h-14 w-14 items-center justify-center rounded-full bg-white text-tidy-primary shadow-lg transition-all hover:bg-tidy-primary/5 active:scale-95"
            aria-label="Importer depuis la galerie"
            @click="handleGallery"
          >
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      </Transition>

      <!-- Action : Import document PDF -->
      <Transition name="fab-item">
        <div v-if="fabOpen" class="flex items-center gap-3">
          <span class="rounded-xl bg-white px-3 py-2 text-sm font-medium text-tidy-text-primary shadow-md">
            Importer un document
          </span>
          <button
            type="button"
            class="flex h-14 w-14 items-center justify-center rounded-full bg-white text-tidy-primary shadow-lg transition-all hover:bg-tidy-primary/5 active:scale-95"
            aria-label="Importer un document"
            @click="handleImportDocument"
          >
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>
        </div>
      </Transition>

      <!-- FAB principal -->
      <button
        type="button"
        class="flex h-14 w-14 items-center justify-center rounded-full bg-tidy-primary text-white shadow-lg transition-all hover:bg-tidy-primary-dark hover:shadow-xl active:scale-95"
        :aria-label="fabOpen ? 'Fermer le menu' : 'Ajouter un document'"
        @click="toggleFab"
      >
        <svg
          class="h-6 w-6 transition-transform duration-200"
          :class="{ 'rotate-45': fabOpen }"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M11.25 4.75a.75.75 0 011.5 0v6.5h6.5a.75.75 0 010 1.5h-6.5v6.5a.75.75 0 01-1.5 0v-6.5h-6.5a.75.75 0 010-1.5h6.5v-6.5z" />
        </svg>
      </button>
    </div>

    <input
      ref="fileInputRef"
      type="file"
      accept="application/pdf,.pdf"
      class="sr-only"
      aria-hidden="true"
      @change="onFileSelected"
    />

  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fab-item-enter-active {
  transition: all 0.2s ease-out;
}
.fab-item-leave-active {
  transition: all 0.15s ease-in;
}
.fab-item-enter-from,
.fab-item-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.95);
}
</style>
