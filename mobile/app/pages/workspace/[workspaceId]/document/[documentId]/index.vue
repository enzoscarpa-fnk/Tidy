<script setup lang="ts">
definePageMeta({ middleware: ['workspace'] })

const route = useRoute()
const router = useRouter()
const workspaceId = computed(() => route.params.workspaceId as string)
const documentId  = computed(() => route.params.documentId as string)
</script>

<template>
  <SwipeBack>
    <div class="flex h-full flex-col overflow-hidden bg-tidy-surface">

      <!-- Header fixe glassmorphism -->
      <header
        class="relative z-10 flex-shrink-0 flex items-center gap-3 border-b border-white/10 px-4 py-3 backdrop-blur-md"
        style="background-color: rgba(13,13,20,0.85);"
      >
        <button type="button"
                class="flex h-9 w-9 items-center justify-center rounded-full text-tidy-text-secondary transition-colors hover:bg-white/10 active:bg-white/15"
                aria-label="Retour" @click="router.back()">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 class="text-base font-semibold text-tidy-text-primary">Document</h1>
      </header>

      <!-- Contenu scrollable — padding-bottom géré uniquement par .scroll-area dans components.css -->
      <main class="scroll-area flex-1 overflow-y-auto px-4 pt-4">
        <DocumentDetail :document-id="documentId" :workspace-id="workspaceId" />
      </main>
    </div>
  </SwipeBack>
</template>
