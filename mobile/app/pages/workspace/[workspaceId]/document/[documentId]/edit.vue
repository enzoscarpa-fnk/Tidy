<script setup lang="ts">
import type { DetectedType } from '~/types/api'

definePageMeta({ middleware: ['workspace'] })

const route = useRoute()
const router = useRouter()
const documentStore = useDocumentStore()

const workspaceId = computed(() => route.params.workspaceId as string)
const documentId  = computed(() => route.params.documentId as string)

// ── Chargement ────────────────────────────────────────────────────────
onMounted(async () => {
  // Charge si non déjà en mémoire (navigation directe via URL)
  if (!documentStore.currentDocument || documentStore.currentDocument.id !== documentId.value) {
    await documentStore.fetchDocument(documentId.value)
  }
  _initForm()
})

// ── État du formulaire ─────────────────────────────────────────────────
const title          = ref('')
const userTags       = ref<string[]>([])
const notes          = ref<string>('')
const overrideType   = ref<DetectedType | null>(null)
const tagInput       = ref('')

function _initForm(): void {
  const doc = documentStore.currentDocument
  if (!doc) return
  title.value        = doc.title
  userTags.value     = [...(doc.metadata?.userTags ?? [])]
  notes.value        = doc.metadata?.notes ?? ''
  overrideType.value = doc.metadata?.userOverrideType ?? null
}

// ── Gestion des tags ──────────────────────────────────────────────────
function addTag(): void {
  const trimmed = tagInput.value.trim()
  if (!trimmed || userTags.value.includes(trimmed)) return
  userTags.value.push(trimmed)
  tagInput.value = ''
}

function removeTag(label: string): void {
  userTags.value = userTags.value.filter((t) => t !== label)
}

function onTagKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault()
    addTag()
  }
}

// ── Toast discret ─────────────────────────────────────────────────────
const showToast  = ref(false)
const toastTimer = ref<ReturnType<typeof setTimeout> | null>(null)

function _showSuccessToast(): void {
  showToast.value = true
  if (toastTimer.value) clearTimeout(toastTimer.value)
  toastTimer.value = setTimeout(() => {
    showToast.value = false
  }, 2_500)
}

onUnmounted(() => {
  if (toastTimer.value) clearTimeout(toastTimer.value)
})

// ── Sauvegarde ────────────────────────────────────────────────────────
const isSaving = ref(false)
const saveError = ref<string | null>(null)

async function handleSave(): Promise<void> {
  if (isSaving.value) return
  isSaving.value = true
  saveError.value = null

  try {
    await documentStore.updateDocument(documentId.value, {
      title:            title.value.trim() || undefined,
      userTags:         userTags.value,
      notes:            notes.value.trim() || null,
      userOverrideType: overrideType.value,
    })
    _showSuccessToast()
    // Léger délai pour que le toast soit visible avant la navigation
    setTimeout(() => router.back(), 1_200)
  } catch {
    saveError.value = 'Impossible d\'enregistrer les modifications. Réessayez.'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-tidy-surface">
    <!-- Header -->
    <header class="flex items-center justify-between border-b border-tidy-border bg-white px-4 py-3">
      <button
        type="button"
        class="flex h-9 w-9 items-center justify-center rounded-full text-tidy-text-secondary transition-colors hover:bg-gray-100 active:bg-gray-200"
        aria-label="Annuler"
        :disabled="isSaving"
        @click="router.back()"
      >
        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <h1 class="text-base font-semibold text-tidy-text-primary">Modifier le document</h1>

      <!-- Bouton Enregistrer — header -->
      <button
        type="button"
        class="rounded-xl bg-tidy-primary px-4 py-1.5 text-sm font-semibold text-white transition-colors active:opacity-80 disabled:opacity-40"
        :disabled="isSaving"
        @click="handleSave"
      >
        {{ isSaving ? 'Enregistrement…' : 'Enregistrer' }}
      </button>
    </header>

    <!-- Formulaire -->
    <main class="flex-1 overflow-y-auto p-4">
      <template v-if="documentStore.isLoadingDetail">
        <SkeletonLoader variant="document-detail" :count="1" />
      </template>

      <template v-else-if="documentStore.currentDocument">
        <form class="flex flex-col gap-5" @submit.prevent="handleSave">

          <!-- Titre -->
          <div>
            <label
              for="doc-title"
              class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-tidy-text-secondary"
            >
              Titre
            </label>
            <input
              id="doc-title"
              v-model="title"
              type="text"
              maxlength="200"
              placeholder="Titre du document"
              class="w-full rounded-xl border border-tidy-border bg-white px-4 py-3 text-sm text-tidy-text-primary placeholder:text-tidy-text-secondary focus:border-tidy-primary focus:outline-none"
            />
          </div>

          <!-- Tags personnels -->
          <div>
            <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-tidy-text-secondary">
              Tags personnels
            </p>

            <!-- Chips existants -->
            <div class="mb-2 flex flex-wrap gap-1.5">
              <TagChip
                v-for="tag in userTags"
                :key="tag"
                :label="tag"
                variant="user"
                :removable="true"
                @remove="removeTag"
              />
              <span
                v-if="userTags.length === 0"
                class="text-xs italic text-tidy-text-secondary"
              >
                Aucun tag
              </span>
            </div>

            <!-- Input ajout tag -->
            <div class="flex gap-2">
              <input
                v-model="tagInput"
                type="text"
                maxlength="40"
                placeholder="Nouveau tag…"
                class="flex-1 rounded-xl border border-tidy-border bg-white px-4 py-2.5 text-sm text-tidy-text-primary placeholder:text-tidy-text-secondary focus:border-tidy-primary focus:outline-none"
                @keydown="onTagKeydown"
              />
              <button
                type="button"
                class="rounded-xl bg-tidy-surface px-4 py-2.5 text-sm font-medium text-tidy-text-primary border border-tidy-border transition-colors hover:border-tidy-primary active:opacity-70 disabled:opacity-40"
                :disabled="!tagInput.trim()"
                @click="addTag"
              >
                Ajouter
              </button>
            </div>
          </div>

          <!-- Type de document -->
          <div>
            <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-tidy-text-secondary">
              Type de document
            </p>
            <TypeOverrideDropdown
              :current-detected-type="documentStore.currentDocument.intelligence?.detectedType ?? null"
              :current-override-type="overrideType"
              @override="overrideType = $event"
            />
            <!-- Permettre l'effacement de l'override -->
            <button
              v-if="overrideType"
              type="button"
              class="mt-1.5 text-xs text-tidy-text-secondary underline underline-offset-2 active:opacity-60"
              @click="overrideType = null"
            >
              Rétablir la détection automatique
            </button>
          </div>

          <!-- Notes -->
          <div>
            <label
              for="doc-notes"
              class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-tidy-text-secondary"
            >
              Notes
            </label>
            <textarea
              id="doc-notes"
              v-model="notes"
              rows="4"
              placeholder="Ajoutez une note personnelle…"
              class="w-full resize-none rounded-xl border border-tidy-border bg-white px-4 py-3 text-sm text-tidy-text-primary placeholder:text-tidy-text-secondary focus:border-tidy-primary focus:outline-none"
            />
          </div>

          <!-- Message d'erreur sauvegarde -->
          <div
            v-if="saveError"
            role="alert"
            class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {{ saveError }}
          </div>

          <!-- Bouton Enregistrer — bas de page (accessibilité mobile) -->
          <button
            type="submit"
            class="w-full rounded-xl bg-tidy-primary py-3.5 text-sm font-semibold text-white transition-colors active:opacity-80 disabled:opacity-40"
            :disabled="isSaving"
          >
            {{ isSaving ? 'Enregistrement…' : 'Enregistrer les modifications' }}
          </button>

          <!-- Annuler -->
          <button
            type="button"
            class="w-full py-2 text-sm text-tidy-text-secondary underline underline-offset-2 active:opacity-60"
            :disabled="isSaving"
            @click="router.back()"
          >
            Annuler
          </button>
        </form>
      </template>
    </main>

    <!-- Toast "Modifications enregistrées" -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-2"
    >
      <div
        v-if="showToast"
        role="status"
        aria-live="polite"
        class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-gray-900/90 px-5 py-2.5 text-sm font-medium text-white shadow-lg backdrop-blur-sm"
      >
        ✓ Modifications enregistrées
      </div>
    </Transition>
  </div>
</template>
