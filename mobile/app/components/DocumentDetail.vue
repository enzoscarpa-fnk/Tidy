<script setup lang="ts">
import type { DetectedType } from '~/types/api'
import { STABLE_STATUSES } from '~/types/api'
import { Browser } from '@capacitor/browser'

interface Props {
  documentId: string
  workspaceId: string
}

const props = defineProps<Props>()

const router = useRouter()
const documentStore = useDocumentStore()

const doc = computed(() => documentStore.currentDocument)

const isFailed    = computed(() => doc.value?.processingStatus === 'FAILED')
const isArchived  = computed(() => doc.value?.processingStatus === 'ARCHIVED')
const isStable    = computed(() => doc.value !== null && STABLE_STATUSES.includes(doc.value.processingStatus))
const canArchive  = computed(() => doc.value?.processingStatus === 'ENRICHED' || doc.value?.processingStatus === 'CLASSIFIED_ONLY')

const failureCount = computed(() => {
  if (!doc.value?.processingEvents) return 1
  return doc.value.processingEvents.filter((e) => !e.isSuccess).length
})

// ── Titre inline-edit ──────────────────────────────────────────────────────
const isEditingTitle = ref(false)
const titleDraft     = ref('')

function startTitleEdit(): void {
  if (!doc.value) return
  titleDraft.value = doc.value.title
  isEditingTitle.value = true
}

async function commitTitleEdit(): Promise<void> {
  const trimmed = titleDraft.value.trim()
  if (!trimmed || trimmed === doc.value?.title) { isEditingTitle.value = false; return }
  await documentStore.updateDocument(props.documentId, { title: trimmed })
  isEditingTitle.value = false
}

function cancelTitleEdit(): void { isEditingTitle.value = false }

// ── TypeOverride ───────────────────────────────────────────────────────────
const showTypeOverride = ref(false)

async function handleTypeOverride(type: DetectedType): Promise<void> {
  await documentStore.updateDocument(props.documentId, { userOverrideType: type })
  showTypeOverride.value = false
}

// ── Share Modal ────────────────────────────────────────────────────────────
const showShareModal = ref(false)

// ── Archive Modal ──────────────────────────────────────────────────────────
const showArchiveInfo = ref(false)
const isArchiving     = ref(false)

async function handleArchive(): Promise<void> {
  if (!canArchive.value || isArchiving.value) return
  isArchiving.value = true
  try {
    await documentStore.archiveDocument(props.documentId)
    router.replace(`/workspace/${props.workspaceId}`)
  } finally {
    isArchiving.value = false
    showArchiveInfo.value = false
  }
}

// ── Suppression ────────────────────────────────────────────────────────────
const showDeleteModal  = ref(false)
const isDeleting       = ref(false)
const deleteError      = ref<string | null>(null)

async function handleDelete(): Promise<void> {
  if (isDeleting.value) return
  isDeleting.value = true
  deleteError.value = null
  try {
    await documentStore.deleteDocument(props.documentId)
    router.replace(`/workspace/${props.workspaceId}`)
  } catch {
    deleteError.value = 'Impossible de supprimer ce document. Réessayez.'
    isDeleting.value = false
  }
}

// ── Visualisation native ───────────────────────────────────────────────────
async function handleView(): Promise<void> {
  if (!doc.value?.downloadUrl) return
  await Browser.open({
    url:            doc.value.downloadUrl,
    presentationStyle: 'popover',
  })
}

// ── Téléchargement ─────────────────────────────────────────────────────────
function handleDownload(): void {
  if (!doc.value?.downloadUrl) return
  window.open(doc.value.downloadUrl, '_blank', 'noopener')
}

// ── Tag suggéré → tag utilisateur ─────────────────────────────────────────
async function handleAddSuggestedTag(tag: string): Promise<void> {
  if (!doc.value?.metadata) return
  const existing = doc.value.metadata.userTags ?? []
  if (existing.includes(tag)) return
  await documentStore.updateDocument(props.documentId, { userTags: [...existing, tag] })
}

// ── Reprocess ──────────────────────────────────────────────────────────────
const isReprocessing = ref(false)

async function handleReprocess(): Promise<void> {
  if (isReprocessing.value) return
  isReprocessing.value = true
  try { await documentStore.reprocessDocument(props.documentId) }
  finally { isReprocessing.value = false }
}

function handleKeepWithoutAnalysis(): void {
  router.push(`/workspace/${props.workspaceId}`)
}

// ── Lifecycle ──────────────────────────────────────────────────────────────
onMounted(async () => { await documentStore.fetchDocument(props.documentId) })
</script>

<template>
  <div class="flex flex-col gap-4">

    <!-- État chargement -->
    <template v-if="documentStore.isLoadingDetail">
      <SkeletonLoader variant="document-detail" :count="1" />
    </template>

    <!-- État erreur -->
    <template v-else-if="documentStore.errorDetail">
      <ErrorState context="generic" :retryable="true" @retry="documentStore.fetchDocument(documentId)" />
    </template>

    <!-- Contenu document -->
    <template v-else-if="doc">

      <!-- Miniature + titre ──────────────────────────────────────────────── -->
      <div class="flex items-start gap-4">
        <ThumbnailPreview
          :thumbnail-url="doc.thumbnailUrl"
          :mime-type="doc.mimeType"
          class="h-20 w-16 flex-shrink-0 rounded-xl object-cover shadow-sm"
        />
        <div class="min-w-0 flex-1 pt-1">
          <div v-if="isEditingTitle" class="flex items-center gap-2">
            <input
              v-model="titleDraft"
              type="text"
              maxlength="200"
              autofocus
              class="min-w-0 flex-1 rounded-lg border border-tidy-primary bg-white px-3 py-1.5 text-sm font-semibold text-tidy-text-primary focus:outline-none"
              @keydown.enter.prevent="commitTitleEdit"
              @keydown.escape.prevent="cancelTitleEdit"
              @blur="commitTitleEdit"
            />
          </div>
          <button
            v-else
            type="button"
            class="group flex items-center gap-1 text-left"
            :aria-label="`Modifier le titre : ${doc.title}`"
            @click="startTitleEdit"
          >
            <span class="line-clamp-2 text-base font-semibold text-tidy-text-primary">{{ doc.title }}</span>
            <svg class="h-3.5 w-3.5 flex-shrink-0 text-tidy-text-secondary opacity-0 transition-opacity group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <p class="mt-0.5 text-xs text-tidy-text-secondary">{{ doc.originalFilename }}</p>
          <div class="mt-1.5"><DocumentStatusBadge :status="doc.processingStatus" /></div>
        </div>
      </div>

      <!-- Actions principales ─────────────────────────────────────────────── -->
      <div class="flex flex-wrap gap-2">

        <!-- Visualiser -->
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-xl bg-tidy-primary px-4 py-2 text-sm font-medium text-white transition-colors active:opacity-80 disabled:opacity-40"
          :disabled="!doc.downloadUrl"
          @click="handleView"
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          Visualiser
        </button>

        <!-- Télécharger -->
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-xl border border-tidy-border bg-white px-4 py-2 text-sm font-medium text-tidy-text-primary transition-colors hover:border-tidy-primary active:opacity-70 disabled:opacity-40"
          :disabled="!doc.downloadUrl"
          @click="handleDownload"
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Télécharger
        </button>

        <!-- Modifier -->
        <NuxtLink
          :to="`/workspace/${workspaceId}/document/${documentId}/edit`"
          class="flex items-center gap-1.5 rounded-xl border border-tidy-border bg-white px-4 py-2 text-sm font-medium text-tidy-text-primary transition-colors hover:border-tidy-primary active:opacity-70"
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Modifier
        </NuxtLink>

        <!-- Partager -->
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-xl border border-tidy-border bg-white px-4 py-2 text-sm font-medium text-tidy-text-primary transition-colors hover:border-tidy-primary active:opacity-70"
          @click="showShareModal = true"
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          Partager
        </button>

        <!-- Archiver -->
        <button
          v-if="canArchive"
          type="button"
          class="flex items-center gap-1.5 rounded-xl border border-tidy-border bg-white px-4 py-2 text-sm font-medium text-tidy-text-secondary transition-colors hover:border-tidy-primary active:opacity-70 disabled:opacity-40"
          :disabled="isArchiving"
          @click="showArchiveInfo = true"
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
          {{ isArchiving ? 'Archivage…' : 'Archiver' }}
        </button>

        <!-- Supprimer -->
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 active:opacity-70"
          @click="showDeleteModal = true"
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Supprimer
        </button>
      </div>

      <!-- Share Modal -->
      <ShareModal v-model="showShareModal" :document-id="documentId" />

      <!-- Type override -->
      <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 -translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-1"
      >
        <div v-if="showTypeOverride" class="rounded-2xl border border-tidy-border bg-white p-4">
          <p class="mb-2 text-sm font-medium text-tidy-text-primary">Corriger le type détecté</p>
          <TypeOverrideDropdown
            :current-detected-type="doc.intelligence?.detectedType ?? null"
            :current-override-type="doc.metadata?.userOverrideType ?? null"
            @override="handleTypeOverride"
          />
          <button type="button" class="mt-2 text-xs text-tidy-text-secondary underline underline-offset-2" @click="showTypeOverride = false">Annuler</button>
        </div>
      </Transition>

      <!-- Section IA -->
      <IntelligenceSection
        v-if="doc.intelligence && !isFailed"
        :intelligence="doc.intelligence"
        :user-override-type="doc.metadata?.userOverrideType ?? null"
        @add-suggested-tag="handleAddSuggestedTag"
        @request-type-override="showTypeOverride = true"
      />

      <!-- Section utilisateur -->
      <UserMetadataSection
        v-if="doc.metadata"
        :user-tags="doc.metadata.userTags"
        :notes="doc.metadata.notes"
        :edit-mode="false"
      />

      <!-- Actions document en échec -->
      <FailedDocumentActions
        v-if="isFailed"
        :failure-count="failureCount"
        @retry="handleReprocess"
        @keep-without-analysis="handleKeepWithoutAnalysis"
      />

      <!-- Détails fichier -->
      <section v-if="isStable && !isFailed" class="rounded-2xl border border-tidy-border bg-white p-4">
        <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-tidy-text-secondary">Détails du fichier</p>
        <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt class="text-xs text-tidy-text-secondary">Taille</dt>
            <dd class="font-medium text-tidy-text-primary">{{ (doc.fileSizeBytes / 1024 / 1024).toFixed(2) }} Mo</dd>
          </div>
          <div v-if="doc.pageCount !== null">
            <dt class="text-xs text-tidy-text-secondary">Pages</dt>
            <dd class="font-medium text-tidy-text-primary">{{ doc.pageCount }}</dd>
          </div>
          <div>
            <dt class="text-xs text-tidy-text-secondary">Ajouté le</dt>
            <dd class="font-medium text-tidy-text-primary">
              {{ new Date(doc.uploadedAt).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' }) }}
            </dd>
          </div>
          <div v-if="doc.textExtractionMethod">
            <dt class="text-xs text-tidy-text-secondary">Extraction</dt>
            <dd class="font-medium text-tidy-text-primary">{{ doc.textExtractionMethod === 'NATIVE_PDF' ? 'Texte natif' : 'OCR' }}</dd>
          </div>
        </dl>
      </section>

    </template>
  </div>

  <!-- ── Modale confirmation archivage ──────────────────────────────────── -->
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="showArchiveInfo" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="showArchiveInfo = false" />
        <div class="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-2xl px-6 pt-6 pb-16 sm:pb-6 shadow-xl">
          <div class="flex justify-center mb-4">
            <div class="flex h-14 w-14 items-center justify-center rounded-full bg-tidy-surface">
              <svg class="h-7 w-7 text-tidy-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            </div>
          </div>
          <h2 class="text-center text-base font-semibold text-tidy-text-primary mb-2">Archiver ce document ?</h2>
          <p class="text-center text-sm text-tidy-text-secondary mb-6">
            Archiver ce document le retire de votre liste principale tout en le conservant dans Tidy. Il reste accessible, téléchargeable et trouvable dans les résultats de recherche, mais n'apparaît plus dans le dashboard.
          </p>
          <div class="flex flex-col gap-3">
            <button
              type="button"
              class="w-full rounded-xl bg-tidy-primary py-3 text-sm font-medium text-white transition-colors hover:bg-tidy-primary-dark disabled:opacity-50"
              :disabled="isArchiving"
              @click="handleArchive"
            >
              <span v-if="isArchiving" class="flex items-center justify-center gap-2">
                <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Archivage…
              </span>
              <span v-else>Archiver</span>
            </button>
            <button type="button" class="w-full rounded-xl border border-tidy-border py-3 text-sm font-medium text-tidy-text-primary transition-colors hover:bg-tidy-surface" @click="showArchiveInfo = false">Annuler</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ── Modale confirmation suppression ───────────────────────────────── -->
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="showDeleteModal" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="delete-doc-title">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="showDeleteModal = false" />
        <div class="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-2xl px-6 pt-6 pb-16 sm:pb-6 shadow-xl">
          <div class="flex justify-center mb-4">
            <div class="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
              <svg class="h-7 w-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
          </div>
          <h2 id="delete-doc-title" class="text-center text-base font-semibold text-tidy-text-primary mb-2">Supprimer ce document ?</h2>
          <p class="text-center text-sm text-tidy-text-secondary mb-6">
            Cette action est <strong>irréversible</strong>. Le document et toutes ses données (texte extrait, tags, notes) seront définitivement supprimés. Le fichier original sur le serveur sera également effacé.
          </p>
          <div v-if="deleteError" class="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600" role="alert">{{ deleteError }}</div>
          <div class="flex flex-col gap-3">
            <button
              type="button"
              class="w-full rounded-xl bg-red-500 py-3 text-sm font-medium text-white transition-colors hover:bg-red-600 active:scale-95 disabled:opacity-50"
              :disabled="isDeleting"
              @click="handleDelete"
            >
              <span v-if="isDeleting" class="flex items-center justify-center gap-2">
                <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Suppression…
              </span>
              <span v-else>Supprimer définitivement</span>
            </button>
            <button type="button" class="w-full rounded-xl border border-tidy-border py-3 text-sm font-medium text-tidy-text-primary transition-colors hover:bg-tidy-surface" :disabled="isDeleting" @click="showDeleteModal = false">Annuler</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .relative { transform: translateY(100%); }
@media (min-width: 640px) { .modal-enter-from .relative { transform: translateY(8px) scale(0.97); } }
</style>
