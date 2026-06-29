<script setup lang="ts">
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'

definePageMeta({ middleware: ['workspace'] })

const route  = useRoute()
const router = useRouter()
const workspaceId = computed(() => route.params.workspaceId as string)
const source      = computed(() => (route.query.source as string) ?? 'camera')
const documentStore = useDocumentStore()

type ScanStep = 'idle' | 'captured' | 'cropping' | 'uploading' | 'success' | 'error'
const step             = ref<ScanStep>('idle')
const capturedBase64   = ref<string | null>(null)
const capturedDataUri  = ref<string | null>(null)
const capturedMimeType = ref<'image/jpeg' | 'image/png'>('image/jpeg')
const croppedBase64    = ref<string | null>(null)
const errorMessage     = ref<string | null>(null)

onMounted(async () => {
  if (source.value === 'gallery') await pickFromGallery()
  else await capturePhoto()
})

async function capturePhoto(): Promise<void> {
  errorMessage.value = null
  try {
    const photo = await Camera.getPhoto({ source: CameraSource.Camera, resultType: CameraResultType.Base64, quality: 90 })
    if (!photo.base64String) { errorMessage.value = 'La photo n\'a pas pu être capturée.'; return }
    _setCapture(photo.base64String, photo.format === 'png' ? 'image/png' : 'image/jpeg')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('dismissed')) { router.back(); return }
    errorMessage.value = 'Impossible d\'accéder à la caméra. Vérifiez les autorisations.'; step.value = 'error'
  }
}

async function pickFromGallery(): Promise<void> {
  errorMessage.value = null
  try {
    const photo = await Camera.getPhoto({ source: CameraSource.Photos, resultType: CameraResultType.Base64, quality: 90 })
    if (!photo.base64String) return
    _setCapture(photo.base64String, photo.format === 'png' ? 'image/png' : 'image/jpeg')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('dismissed')) { router.back(); return }
    errorMessage.value = 'Impossible d\'ouvrir la galerie.'; step.value = 'error'
  }
}

function _setCapture(base64: string, mime: 'image/jpeg' | 'image/png'): void {
  capturedMimeType.value = mime; capturedBase64.value = base64
  capturedDataUri.value = `data:${mime};base64,${base64}`; step.value = 'captured'
}

function openCropEditor(): void { step.value = 'cropping' }
function onCropConfirmed(result: string): void { croppedBase64.value = result; capturedDataUri.value = `data:${capturedMimeType.value};base64,${result}`; step.value = 'captured' }
function onCropCancelled(): void { step.value = 'captured' }

async function retake(): Promise<void> {
  capturedBase64.value = null; capturedDataUri.value = null; croppedBase64.value = null; errorMessage.value = null; step.value = 'idle'
  if (source.value === 'gallery') await pickFromGallery(); else await capturePhoto()
}

const MAX_SIZE_BYTES = 50 * 1024 * 1024

async function confirmAndUpload(): Promise<void> {
  const finalBase64 = croppedBase64.value ?? capturedBase64.value
  if (!finalBase64) return
  errorMessage.value = null; step.value = 'uploading'; documentStore.resetUpload()
  try {
    const binary = atob(finalBase64); const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: capturedMimeType.value })
    const ext  = capturedMimeType.value === 'image/png' ? 'png' : 'jpg'
    const file = new File([blob], `scan_${Date.now()}.${ext}`, { type: capturedMimeType.value })
    if (file.size > MAX_SIZE_BYTES) { errorMessage.value = 'L\'image est trop volumineuse (max 50 Mo).'; step.value = 'error'; return }
    await documentStore.uploadDocument(workspaceId.value, file)
    step.value = 'success'
    setTimeout(() => router.push(`/workspace/${workspaceId.value}`), 1200)
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'Une erreur est survenue lors de l\'envoi.'
    step.value = 'error'
  }
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden bg-tidy-surface">

    <!-- Header -->
    <header class="flex items-center gap-3 border-b border-tidy-border-glass bg-tidy-surface-glass backdrop-blur-xl px-4 py-3">
      <button type="button"
              class="flex h-9 w-9 items-center justify-center rounded-full text-tidy-text-secondary
               transition-colors hover:bg-white/10 active:bg-white/15"
              aria-label="Retour" @click="router.back()">
        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h1 class="text-base font-semibold text-tidy-text-primary">
        {{ source === 'gallery' ? 'Importer depuis la galerie' : 'Scanner un document' }}
      </h1>
    </header>

    <main class="flex flex-1 flex-col items-center justify-start px-4 py-6">

      <!-- idle -->
      <template v-if="step === 'idle'">
        <div class="flex w-full max-w-sm flex-col items-center gap-4 pt-8">
          <div class="flex h-16 w-16 items-center justify-center rounded-full bg-tidy-mauve/20">
            <svg class="h-8 w-8 animate-spin text-tidy-mauve" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <p class="text-sm text-tidy-text-secondary">Ouverture en cours…</p>
        </div>
      </template>

      <!-- captured -->
      <template v-else-if="step === 'captured'">
        <div class="flex w-full max-w-sm flex-col gap-4">
          <div class="relative overflow-hidden rounded-3xl border border-tidy-border-glass shadow-lg">
            <img :src="capturedDataUri!" alt="Document capturé" class="h-auto w-full object-contain" loading="eager" />
            <div v-if="croppedBase64"
                 class="absolute top-3 right-3 rounded-full bg-tidy-orange px-2.5 py-1 text-xs font-medium text-white shadow">
              Recadré ✓
            </div>
          </div>
          <button type="button" class="btn-primary" @click="confirmAndUpload">
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Envoyer le document
          </button>
          <button type="button" class="btn-secondary" @click="openCropEditor">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5" />
            </svg>
            {{ croppedBase64 ? 'Recadrer à nouveau' : 'Recadrer / Corriger la perspective' }}
          </button>
          <button type="button" class="text-center text-sm text-tidy-text-secondary underline underline-offset-2 active:opacity-70" @click="retake">
            {{ source === 'gallery' ? 'Choisir une autre photo' : 'Reprendre une photo' }}
          </button>
        </div>
      </template>

      <!-- cropping -->
      <template v-else-if="step === 'cropping'">
        <ScanCropEditor :image-base64="capturedBase64!" :mime-type="capturedMimeType" @confirm="onCropConfirmed" @cancel="onCropCancelled" />
      </template>

      <!-- uploading -->
      <template v-else-if="step === 'uploading'">
        <div class="flex flex-col items-center gap-4 pt-12 w-full max-w-sm">
          <div class="flex h-16 w-16 items-center justify-center rounded-full bg-tidy-orange/20">
            <svg class="h-8 w-8 animate-spin text-tidy-orange" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <UploadProgressBar :progress="documentStore.uploadProgress" :filename="`scan_${Date.now()}.jpg`" status="uploading" />
        </div>
      </template>

      <!-- success -->
      <template v-else-if="step === 'success'">
        <div class="flex flex-col items-center gap-4 pt-12">
          <div class="flex h-16 w-16 items-center justify-center rounded-full bg-tidy-status-success/20">
            <svg class="h-8 w-8 text-tidy-status-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p class="text-base font-semibold text-tidy-text-primary">Document envoyé !</p>
          <p class="text-sm text-tidy-text-secondary">Analyse en cours…</p>
        </div>
      </template>

      <!-- error -->
      <template v-else-if="step === 'error'">
        <div class="flex w-full max-w-sm flex-col items-center gap-4 pt-8">
          <div class="flex h-16 w-16 items-center justify-center rounded-full bg-tidy-status-error/20">
            <svg class="h-8 w-8 text-tidy-status-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p class="text-center text-sm font-semibold text-tidy-text-primary">{{ errorMessage }}</p>
          <button type="button" class="btn-primary w-full" @click="retake">Réessayer</button>
        </div>
      </template>

    </main>
  </div>
</template>
