<script setup lang="ts">
interface Props {
  workspaceId: string
}

const props = defineProps<Props>()
const router = useRouter()
const documentStore = useDocumentStore()

const isDragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFilename = ref<string>('')
const validationError = ref<string | null>(null)

const ACCEPTED_MIMES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_SIZE_BYTES = 50 * 1024 * 1024

function triggerPicker(): void {
  fileInput.value?.click()
}

function onFileInputChange(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) handleFile(file)
}

function onDrop(event: DragEvent): void {
  isDragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) handleFile(file)
}

function handleFile(file: File): void {
  validationError.value = null

  if (!ACCEPTED_MIMES.includes(file.type)) {
    validationError.value = 'Format non supporté. Utilisez un PDF, JPEG ou PNG.'
    return
  }
  if (file.size > MAX_SIZE_BYTES) {
    validationError.value = 'Fichier trop volumineux. Maximum : 50 Mo.'
    return
  }

  selectedFilename.value = file.name
  documentStore.uploadDocument(props.workspaceId, file).catch(() => {
    // L'erreur est déjà reflétée dans documentStore.uploadError
  })
}

function handleRetry(): void {
  documentStore.resetUpload()
  selectedFilename.value = ''
}

watch(
  () => documentStore.uploadStatus,
  (status) => {
    if (status === 'success') {
      router.push(`/workspace/${props.workspaceId}`)
    }
  }
)

// Expose pour les tests
defineExpose({ handleFile })
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Zone de dépôt — visible uniquement hors upload en cours -->
    <div
      v-if="documentStore.uploadStatus === 'idle'"
      role="button"
      tabindex="0"
      aria-label="Zone de dépôt — appuyez pour sélectionner un fichier"
      class="relative flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tidy-primary"
      :class="
        isDragging
          ? 'border-tidy-primary bg-tidy-primary/5'
          : 'border-tidy-border bg-tidy-surface'
      "
      @click="triggerPicker"
      @keydown.enter.prevent="triggerPicker"
      @dragover.prevent="isDragging = true"
      @dragleave="isDragging = false"
      @drop.prevent="onDrop"
    >
      <svg
        class="mb-3 h-10 w-10 text-tidy-primary/60"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
        />
      </svg>
      <p class="text-sm font-semibold text-tidy-text-primary">
        Appuyez pour ajouter un document
      </p>
      <p class="mt-1 text-xs text-tidy-text-secondary">PDF, JPEG ou PNG · max 50 Mo</p>

      <input
        ref="fileInput"
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        class="sr-only"
        @change="onFileInputChange"
      />
    </div>

    <!-- Message d'erreur de validation côté client -->
    <div
      v-if="validationError"
      role="alert"
      class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {{ validationError }}
    </div>

    <!-- Barre de progression (règle R9 : uniquement dans /upload) -->
    <UploadProgressBar
      v-if="documentStore.uploadStatus !== 'idle'"
      :progress="documentStore.uploadProgress"
      :filename="selectedFilename"
      :status="
        documentStore.uploadStatus === 'uploading'
          ? 'uploading'
          : documentStore.uploadStatus === 'success'
            ? 'success'
            : 'error'
      "
      :error-message="documentStore.uploadError ?? undefined"
      @retry="handleRetry"
    />
  </div>
</template>
