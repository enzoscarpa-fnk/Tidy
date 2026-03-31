<script setup lang="ts">
definePageMeta({ middleware: ['workspace'] })

const route = useRoute()
const workspaceId = computed(() => route.params.workspaceId as string)

const router = useRouter()
const documentStore = useDocumentStore()

onUnmounted(() => {
  // Nettoie l'état d'upload si l'utilisateur quitte la page avant la fin
  if (documentStore.uploadStatus !== 'success') {
    documentStore.resetUpload()
  }
})
</script>

<template>
  <div class="flex min-h-screen flex-col bg-tidy-surface">
    <!-- Header -->
    <header class="flex items-center gap-3 border-b border-tidy-border bg-white px-4 py-3">
      <button
        type="button"
        class="flex h-9 w-9 items-center justify-center rounded-full text-tidy-text-secondary transition-colors hover:bg-gray-100 active:bg-gray-200"
        aria-label="Retour"
        @click="router.back()"
      >
        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h1 class="text-base font-semibold text-tidy-text-primary">Ajouter un document</h1>
    </header>

    <!-- Contenu -->
    <main class="flex-1 p-4">
      <UploadDropzone :workspace-id="workspaceId" />
    </main>
  </div>
</template>
