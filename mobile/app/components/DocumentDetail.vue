<script setup lang="ts">
import type { DetectedType } from '~/types/api'
import { DETECTED_TYPE_LABELS, STABLE_STATUSES } from '~/types/api'

interface Props {
  documentId: string
  workspaceId: string
}

const props = defineProps<Props>()

const router = useRouter()
const documentStore = useDocumentStore()

const doc = computed(() => documentStore.currentDocument)

const isFailed = computed(() => doc.value?.processingStatus === 'FAILED')
const isArchived = computed(() => doc.value?.processingStatus === 'ARCHIVED')
const isStable = computed(
  () => doc.value !== null && STABLE_STATUSES.includes(doc.value.processingStatus)
)
const canArchive = computed(
  () =>
    doc.value?.processingStatus === 'ENRICHED' ||
    doc.value?.processingStatus === 'CLASSIFIED_ONLY'
)

/** Nombre d'échecs consécutifs dérivé des processingEvents */
const failureCount = computed(() => {
  if (!doc.value?.processingEvents) return 1
  return doc.value.processingEvents.filter((e) => !e.isSuccess).length
})

// ── Titre inline-edit ──────────────────────────────────────────────────
const isEditingTitle = ref(false)
const titleDraft = ref('')

function startTitleEdit(): void {
  if (!doc.value) return
  titleDraft.value = doc.value.title
  isEditingTitle.value = true
}

async function commitTitleEdit(): Promise<void> {
  const trimmed = titleDraft.value.trim()
  if (!trimmed || trimmed === doc.value?.title) {
    isEditingTitle.value = false
    return
  }
  await documentStore.updateDocument(props.documentId, { title: trimmed })
  isEditingTitle.value = false
}

function cancelTitleEdit(): void {
  isEditingTitle.value = false
}

// ── TypeOverride depuis IntelligenceSection ────────────────────────────
const showTypeOverride = ref(false)

async function handleTypeOverride(type: DetectedType): Promise<void> {
  await documentStore.updateDocument(props.documentId, { userOverrideType: type })
  showTypeOverride.value = false
}

// ── Actions document ───────────────────────────────────────────────────
const isArchiving = ref(false)
const isReprocessing = ref(false)

async function handleArchive(): Promise<void> {
  if (!canArchive.value || isArchiving.value) return
  isArchiving.value = true
  try {
    await documentStore.archiveDocument(props.documentId)
  } finally {
    isArchiving.value = false
  }
}

async function handleReprocess(): Promise<void> {
  if (isReprocessing.value) return
  isReprocessing.value = true
  try {
    await documentStore.reprocessDocument(props.documentId)
  } finally {
    isReprocessing.value = false
  }
}

function handleKeepWithoutAnalysis(): void {
  router.push(`/workspace/${props.workspaceId}`)
}

// ── Téléchargement (presigned URL — valide 15 min) ─────────────────────
function handleDownload(): void {
  if (!doc.value?.downloadUrl) return
  window.open(doc.value.downloadUrl, '_blank', 'noopener')
}

// ── Tag suggéré → tag utilisateur ─────────────────────────────────────
async function handleAddSuggestedTag(tag: string): Promise<void> {
  if (!doc.value?.metadata) return
  const existing = doc.value.metadata.userTags ?? []
  if (existing.includes(tag)) return
  await documentStore.updateDocument(props.documentId, {
    userTags: [...existing, tag],
  })
}

// ── Cycle de vie ───────────────────────────────────────────────────────
onMounted(async () => {
  await documentStore.fetchDocument(props.documentId)
})

onUnmounted(() => {
  // Ne pas vider currentDocument ici — la page /edit en a besoin
})
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
      <!-- Miniature + titre -->
      <div class="flex items-start gap-4">
        <ThumbnailPreview
          :thumbnail-url="doc.thumbnailUrl"
          :mime-type="doc.mimeType"
          class="h-20 w-16 flex-shrink-0 rounded-xl object-cover shadow-sm"
        />

        <div class="min-w-0 flex-1 pt-1">
          <!-- Titre inline-edit -->
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
            <span class="line-clamp-2 text-base font-semibold text-tidy-text-primary">
              {{ doc.title }}
            </span>
            <svg
              class="h-3.5 w-3.5 flex-shrink-0 text-tidy-text-secondary opacity-0 transition-opacity group-hover:opacity-100"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>

          <p class="mt-0.5 text-xs text-tidy-text-secondary">
            {{ doc.originalFilename }}
          </p>

          <div class="mt-1.5">
            <DocumentStatusBadge :status="doc.processingStatus" />
          </div>
        </div>
      </div>

      <!-- Actions principales -->
      <div class="flex flex-wrap gap-2">
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

        <!-- Archiver — uniquement si ENRICHED ou CLASSIFIED_ONLY -->
        <button
          v-if="canArchive"
          type="button"
          class="flex items-center gap-1.5 rounded-xl border border-tidy-border bg-white px-4 py-2 text-sm font-medium text-tidy-text-secondary transition-colors hover:border-tidy-primary active:opacity-70 disabled:opacity-40"
          :disabled="isArchiving"
          @click="handleArchive"
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
          {{ isArchiving ? 'Archivage…' : 'Archiver' }}
        </button>
      </div>

      <!-- Type override inline (affiché à la demande) -->
      <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 -translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-1"
      >
        <div v-if="showTypeOverride" class="rounded-2xl border border-tidy-border bg-white p-4">
          <p class="mb-2 text-sm font-medium text-tidy-text-primary">
            Corriger le type détecté
          </p>
          <TypeOverrideDropdown
            :current-detected-type="doc.intelligence?.detectedType ?? null"
            :current-override-type="doc.metadata?.userOverrideType ?? null"
            @override="handleTypeOverride"
          />
          <button
            type="button"
            class="mt-2 text-xs text-tidy-text-secondary underline underline-offset-2"
            @click="showTypeOverride = false"
          >
            Annuler
          </button>
        </div>
      </Transition>

      <!-- Section IA — visible si intelligence disponible -->
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

      <!-- Infos complémentaires (pages, méthode extraction) -->
      <section
        v-if="isStable && !isFailed"
        class="rounded-2xl border border-tidy-border bg-white p-4"
      >
        <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-tidy-text-secondary">
          Détails du fichier
        </p>
        <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt class="text-xs text-tidy-text-secondary">Taille</dt>
            <dd class="font-medium text-tidy-text-primary">
              {{ (doc.fileSizeBytes / 1024 / 1024).toFixed(2) }} Mo
            </dd>
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
            <dd class="font-medium text-tidy-text-primary">
              {{ doc.textExtractionMethod === 'NATIVE_PDF' ? 'Texte natif' : 'OCR' }}
            </dd>
          </div>
        </dl>
      </section>
    </template>
  </div>
</template>
