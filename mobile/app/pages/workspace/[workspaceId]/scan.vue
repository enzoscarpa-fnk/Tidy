<script setup lang="ts">
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'

definePageMeta({ middleware: ['workspace'] })

const route = useRoute()
const router = useRouter()
const workspaceId = computed(() => route.params.workspaceId as string)

const documentStore = useDocumentStore()
const localRepo = useLocalDocumentRepository()
const db = useDatabaseService()

// ── État de la page ────────────────────────────────────────────────────────

type ScanStep = 'idle' | 'captured' | 'cropping' | 'uploading' | 'success' | 'error'

const step = ref<ScanStep>('idle')
const capturedBase64 = ref<string | null>(null)          // base64 brut (data URI stripped)
const capturedDataUri = ref<string | null>(null)          // pour preview <img>
const capturedMimeType = ref<'image/jpeg' | 'image/png'>('image/jpeg')
const errorMessage = ref<string | null>(null)
const isNative = ref(false)

// ── Init plateforme ────────────────────────────────────────────────────────

onMounted(() => {
  const nuxtApp = useNuxtApp()
  isNative.value = nuxtApp.$isNativePlatform as boolean
})

// ── Capture photo ──────────────────────────────────────────────────────────

async function capturePhoto(): Promise<void> {
  errorMessage.value = null
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Base64,
      quality: 90,
      // Pas de correctToOrientation (iOS/Android le fait nativement)
      // width/height non fixés → résolution max du capteur
    })

    if (!photo.base64String) {
      errorMessage.value = 'La photo n\'a pas pu être capturée.'
      return
    }

    const mime = photo.format === 'png' ? 'image/png' : 'image/jpeg'
    capturedMimeType.value = mime
    capturedBase64.value = photo.base64String
    capturedDataUri.value = `data:${mime};base64,${photo.base64String}`
    step.value = 'captured'
  } catch (err: unknown) {
    // L'utilisateur a annulé la caméra → pas d'erreur affichée
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('dismissed')) {
      return
    }
    errorMessage.value = 'Impossible d\'accéder à la caméra. Vérifiez les autorisations.'
    step.value = 'error'
  }
}

// ── Import depuis la galerie (fallback web/test) ───────────────────────────

async function pickFromGallery(): Promise<void> {
  errorMessage.value = null
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Photos,
      resultType: CameraResultType.Base64,
      quality: 90,
    })

    if (!photo.base64String) return

    const mime = photo.format === 'png' ? 'image/png' : 'image/jpeg'
    capturedMimeType.value = mime
    capturedBase64.value = photo.base64String
    capturedDataUri.value = `data:${mime};base64,${photo.base64String}`
    step.value = 'captured'
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('dismissed')) {
      return
    }
    errorMessage.value = 'Impossible d\'ouvrir la galerie.'
  }
}

// ── Recadrage (Ticket 13.2) ────────────────────────────────────────────────

const croppedBase64 = ref<string | null>(null)

function openCropEditor(): void {
  step.value = 'cropping'
}

function onCropConfirmed(result: string): void {
  // result = base64 de l'image recadrée (sans data URI prefix)
  croppedBase64.value = result
  capturedDataUri.value = `data:${capturedMimeType.value};base64,${result}`
  step.value = 'captured'
}

function onCropCancelled(): void {
  step.value = 'captured'
}

// ── Retake ─────────────────────────────────────────────────────────────────

function retake(): void {
  capturedBase64.value = null
  capturedDataUri.value = null
  croppedBase64.value = null
  step.value = 'idle'
  errorMessage.value = null
}

// ── Validation MIME + taille (miroir de UploadDropzone) ───────────────────

const MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50 Mo
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'application/pdf']

function _base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function _arrayBufferToFile(buffer: ArrayBuffer, name: string, mime: string): File {
  const blob = new Blob([buffer], { type: mime })
  return new File([blob], name, { type: mime })
}

// ── Upload ─────────────────────────────────────────────────────────────────

async function confirmAndUpload(): Promise<void> {
  const finalBase64 = croppedBase64.value ?? capturedBase64.value
  if (!finalBase64) return

  errorMessage.value = null
  step.value = 'uploading'
  documentStore.resetUpload()

  try {
    // Construire le File depuis le base64
    const buffer = _base64ToArrayBuffer(finalBase64)
    const ext = capturedMimeType.value === 'image/png' ? 'png' : 'jpg'
    const filename = `scan_${Date.now()}.${ext}`
    const file = _arrayBufferToFile(buffer, filename, capturedMimeType.value)

    // Validation taille côté client
    if (!ALLOWED_MIME.includes(file.type)) {
      errorMessage.value = 'Format non supporté.'
      step.value = 'error'
      return
    }
    if (file.size > MAX_SIZE_BYTES) {
      errorMessage.value = 'L\'image est trop volumineuse (max 50 Mo).'
      step.value = 'error'
      return
    }

    await documentStore.uploadDocument(workspaceId.value, file)
    step.value = 'success'

    // Redirection vers le dashboard après succès (légère pause UX)
    setTimeout(() => {
      router.push(`/workspace/${workspaceId.value}`)
    }, 1200)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Une erreur est survenue lors de l\'envoi.'
    errorMessage.value = msg
    step.value = 'error'
  }
}
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
        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h1 class="text-base font-semibold text-tidy-text-primary">Scanner un document</h1>
    </header>

    <!-- Contenu principal -->
    <main class="flex flex-1 flex-col items-center justify-start px-4 py-6">

      <!-- ── STEP : idle ─────────────────────────────────────────────── -->
      <template v-if="step === 'idle'">
        <div class="flex w-full max-w-sm flex-col items-center gap-4 pt-8">
          <!-- Illustration -->
          <div class="flex h-24 w-24 items-center justify-center rounded-full bg-tidy-primary/10">
            <svg class="h-12 w-12 text-tidy-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>

          <div class="text-center">
            <p class="text-base font-semibold text-tidy-text-primary">Prenez en photo votre document</p>
            <p class="mt-1 text-sm text-tidy-text-secondary">
              Cadrez bien le document sur une surface plane et bien éclairée.
            </p>
          </div>

          <!-- Bouton principal : caméra -->
          <button
            type="button"
            class="flex w-full items-center justify-center gap-2 rounded-2xl bg-tidy-primary px-6 py-4 text-base font-semibold text-white shadow-sm transition-opacity active:opacity-80"
            @click="capturePhoto"
          >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Ouvrir la caméra
          </button>

          <!-- Bouton secondaire : galerie -->
          <button
            type="button"
            class="flex w-full items-center justify-center gap-2 rounded-2xl border border-tidy-border bg-white px-6 py-3.5 text-sm font-medium text-tidy-text-primary transition-colors hover:border-tidy-primary active:opacity-70"
            @click="pickFromGallery"
          >
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Importer depuis la galerie
          </button>
        </div>
      </template>

      <!-- ── STEP : captured ─────────────────────────────────────────── -->
      <template v-else-if="step === 'captured'">
        <div class="flex w-full max-w-sm flex-col gap-4">
          <!-- Prévisualisation -->
          <div class="relative overflow-hidden rounded-2xl border border-tidy-border bg-white shadow-sm">
            <img
              :src="capturedDataUri!"
              alt="Document scanné"
              class="h-auto w-full object-contain"
              loading="eager"
            />
          </div>

          <!-- Actions -->
          <button
            type="button"
            class="flex w-full items-center justify-center gap-2 rounded-2xl bg-tidy-primary px-6 py-4 text-base font-semibold text-white shadow-sm transition-opacity active:opacity-80"
            @click="confirmAndUpload"
          >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Envoyer le document
          </button>

          <!-- Recadrer -->
          <button
            type="button"
            class="flex w-full items-center justify-center gap-2 rounded-2xl border border-tidy-border bg-white px-6 py-3.5 text-sm font-medium text-tidy-text-primary transition-colors hover:border-tidy-primary active:opacity-70"
            @click="openCropEditor"
          >
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21H3a1 1 0 01-1-1v-4m4 5V7a1 1 0 011-1h4M21 7V3a1 1 0 00-1-1h-4m5 4h-5m0 0v5M3 17h5m0 0v-5" />
            </svg>
            Recadrer / Corriger la perspective
          </button>

          <!-- Reprendre -->
          <button
            type="button"
            class="text-center text-sm text-tidy-text-secondary underline underline-offset-2 active:opacity-70"
            @click="retake"
          >
            Reprendre une photo
          </button>
        </div>
      </template>

      <!-- ── STEP : cropping ─────────────────────────────────────────── -->
      <template v-else-if="step === 'cropping'">
        <ScanCropEditor
          :image-base64="capturedBase64!"
          :mime-type="capturedMimeType"
          @confirm="onCropConfirmed"
          @cancel="onCropCancelled"
        />
      </template>

      <!-- ── STEP : uploading ────────────────────────────────────────── -->
      <template v-else-if="step === 'uploading'">
        <div class="flex flex-col items-center gap-4 pt-12">
          <div class="flex h-16 w-16 items-center justify-center rounded-full bg-tidy-primary/10">
            <svg
              class="h-8 w-8 animate-spin text-tidy-primary"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <UploadProgressBar
            :progress="documentStore.uploadProgress"
            :filename="`scan_${Date.now()}.jpg`"
            status="uploading"
          />
        </div>
      </template>

      <!-- ── STEP : success ──────────────────────────────────────────── -->
      <template v-else-if="step === 'success'">
        <div class="flex flex-col items-center gap-4 pt-12">
          <div class="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg class="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p class="text-base font-semibold text-tidy-text-primary">Document envoyé !</p>
          <p class="text-sm text-tidy-text-secondary">Analyse en cours…</p>
        </div>
      </template>

      <!-- ── STEP : error ────────────────────────────────────────────── -->
      <template v-else-if="step === 'error'">
        <div class="flex w-full max-w-sm flex-col items-center gap-4 pt-8">
          <div class="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg class="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p class="text-center text-sm text-tidy-text-primary font-semibold">{{ errorMessage }}</p>
          <button
            type="button"
            class="flex w-full items-center justify-center gap-2 rounded-2xl bg-tidy-primary px-6 py-4 text-base font-semibold text-white shadow-sm transition-opacity active:opacity-80"
            @click="retake"
          >
            Réessayer
          </button>
        </div>
      </template>

    </main>
  </div>
</template>
