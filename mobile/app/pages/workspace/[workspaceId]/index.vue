<script setup lang="ts">
definePageMeta({ middleware: ['workspace'] })

const workspaceStore = useWorkspaceStore()
const documentStore  = useDocumentStore()
const authStore      = useAuthStore()
const route          = useRoute()
const router         = useRouter()

const workspaceId = computed(() => route.params.workspaceId as string)
const isEmpty     = computed(() => !documentStore.isLoading && documentStore.documents.length === 0)

const fabOpen = ref(false)
function toggleFab(): void { fabOpen.value = !fabOpen.value }
function closeFab(): void  { fabOpen.value = false }
function handleScan(): void    { closeFab(); router.push(`/workspace/${workspaceId.value}/scan?source=camera`) }
function handleGallery(): void { closeFab(); router.push(`/workspace/${workspaceId.value}/scan?source=gallery`) }
const fileInputRef = ref<HTMLInputElement | null>(null)
function handleImportDocument(): void { closeFab(); nextTick(() => fileInputRef.value?.click()) }

async function onFileSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file  = input.files?.[0]; input.value = ''
  if (!file) return
  if (file.type !== 'application/pdf') { alert('Format non supporté.'); return }
  if (file.size > 50 * 1024 * 1024) { alert('Fichier trop volumineux. Maximum : 50 Mo.'); return }
  await documentStore.uploadDocument(workspaceId.value, file)
  await documentStore.fetchDocuments(workspaceId.value)
  documentStore.startPolling(workspaceId.value)
}

const searchFocused = ref(false)
function handleSearch(query: string): void {
  router.push({ path: `/workspace/${workspaceId.value}/search`, query: { query } })
}
</script>

<template>
  <div class="relative flex h-full flex-col overflow-hidden bg-tidy-surface">

    <!-- Shader -->
    <BayerShader :opacity="0.20" class="absolute inset-0 z-0 pointer-events-none" />

    <!-- Header — sticky, z-30, glassmorphism -->
    <header
      class="sticky top-0 z-30 flex-shrink-0 border-b border-white/10 backdrop-blur-md"
      style="background-color: rgba(13,13,20,0.75);"
    >
      <div class="flex items-center gap-3 px-4 py-3">
        <WorkspaceSelector class="flex-shrink-0" />
        <div class="flex-1" />
        <button
          type="button"
          class="flex-shrink-0 rounded-full p-0.5 ring-2 ring-white/10 transition-colors hover:ring-tidy-mauve/50"
          aria-label="Mon profil"
          @click="router.push('/profile')"
        >
          <div class="flex h-7 w-7 items-center justify-center rounded-full bg-tidy-mauve/20">
            <span class="text-xs font-bold text-tidy-mauve">
              {{ authStore.user?.displayName?.charAt(0)?.toUpperCase() ?? '?' }}
            </span>
          </div>
        </button>
      </div>
      <div class="px-4 pb-3">
        <SearchBar class="w-full" placeholder="Rechercher un document…" :full-width="true" @search="handleSearch" @focused="searchFocused = $event" />
      </div>
    </header>

    <!-- Overlay dim recherche -->
    <Transition name="fade">
      <div v-if="searchFocused" class="fixed inset-0 z-20 bg-black/60" aria-hidden="true" @click="searchFocused = false" />
    </Transition>

    <!-- Contenu scrollable -->
    <main class="scroll-area relative z-10 flex-1 overflow-y-auto px-4 py-4">
      <DocumentList :workspace-id="workspaceId" />
    </main>

    <!-- Backdrop FAB -->
    <Transition name="fade">
      <div v-if="fabOpen" class="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm" aria-hidden="true" @click="closeFab" />
    </Transition>

    <!-- FAB + actions -->
    <div class="fixed bottom-8 right-5 z-50 flex flex-col items-end gap-4">
      <Transition name="fab-item">
        <div v-if="fabOpen" class="flex items-center gap-3">
          <button type="button" class="rounded-full px-3 py-2 text-sm font-medium text-tidy-text-primary border border-white/15 backdrop-blur-md hover:bg-white/10" style="background-color:rgba(13,13,20,0.88);" @click="handleScan">Scanner un document</button>
          <button type="button" class="flex h-14 w-14 items-center justify-center rounded-full border border-white/15 backdrop-blur-md text-tidy-orange shadow-lg active:scale-95" style="background-color:rgba(13,13,20,0.88);" @click="handleScan">
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </button>
        </div>
      </Transition>
      <Transition name="fab-item">
        <div v-if="fabOpen" class="flex items-center gap-3">
          <button type="button" class="rounded-full px-3 py-2 text-sm font-medium text-tidy-text-primary border border-white/15 backdrop-blur-md hover:bg-white/10" style="background-color:rgba(13,13,20,0.88);" @click="handleGallery">Importer depuis la galerie</button>
          <button type="button" class="flex h-14 w-14 items-center justify-center rounded-full border border-white/15 backdrop-blur-md text-tidy-orange shadow-lg active:scale-95" style="background-color:rgba(13,13,20,0.88);" @click="handleGallery">
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          </button>
        </div>
      </Transition>
      <Transition name="fab-item">
        <div v-if="fabOpen" class="flex items-center gap-3">
          <button type="button" class="rounded-full px-3 py-2 text-sm font-medium text-tidy-text-primary border border-white/15 backdrop-blur-md hover:bg-white/10" style="background-color:rgba(13,13,20,0.88);" @click="handleImportDocument">Importer un document</button>
          <button type="button" class="flex h-14 w-14 items-center justify-center rounded-full border border-white/15 backdrop-blur-md text-tidy-orange shadow-lg active:scale-95" style="background-color:rgba(13,13,20,0.88);" @click="handleImportDocument">
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </button>
        </div>
      </Transition>
      <div class="relative">
        <template v-if="isEmpty && !fabOpen">
          <span class="animate-fab-sparkle pointer-events-none absolute -top-3 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-tidy-orange-light" aria-hidden="true" />
          <span class="animate-fab-sparkle-2 pointer-events-none absolute -top-2 -right-1 h-1 w-1 rounded-full bg-tidy-orange" aria-hidden="true" />
          <span class="animate-fab-sparkle-3 pointer-events-none absolute -top-3 -left-1 h-1.5 w-1.5 rounded-full bg-tidy-orange-light/70" aria-hidden="true" />
        </template>
        <button type="button"
                class="flex h-14 w-14 items-center justify-center rounded-full bg-tidy-orange text-white shadow-lg transition-all active:scale-95"
                :class="isEmpty && !fabOpen ? 'animate-fab-glow hover:bg-tidy-orange-light' : 'hover:bg-tidy-orange-dark'"
                :aria-label="fabOpen ? 'Fermer le menu' : 'Ajouter un document'"
                @click="toggleFab">
          <svg class="h-6 w-6 transition-transform duration-200" :class="{ 'rotate-45': fabOpen }" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.25 4.75a.75.75 0 011.5 0v6.5h6.5a.75.75 0 010 1.5h-6.5v6.5a.75.75 0 01-1.5 0v-6.5h-6.5a.75.75 0 010-1.5h6.5v-6.5z" />
          </svg>
        </button>
      </div>
    </div>

    <input ref="fileInputRef" type="file" accept="application/pdf,.pdf" class="sr-only" @change="onFileSelected" />
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to       { opacity: 0; }
.fab-item-enter-active { transition: all 0.2s ease-out; }
.fab-item-leave-active { transition: all 0.15s ease-in; }
.fab-item-enter-from, .fab-item-leave-to { opacity: 0; transform: translateY(8px) scale(0.95); }
</style>
