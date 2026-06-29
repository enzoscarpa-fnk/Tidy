<script setup lang="ts">
import type { DetectedType } from '~/types/api'

definePageMeta({ middleware: ['workspace'] })

const route = useRoute()
const router = useRouter()
const documentStore = useDocumentStore()

const workspaceId = computed(() => route.params.workspaceId as string)
const documentId  = computed(() => route.params.documentId as string)

onMounted(async () => {
  if (!documentStore.currentDocument || documentStore.currentDocument.id !== documentId.value) {
    await documentStore.fetchDocument(documentId.value)
  }
  _initForm()
})

const title        = ref('')
const userTags     = ref<string[]>([])
const notes        = ref<string>('')
const overrideType = ref<DetectedType | null>(null)
const tagInput     = ref('')

function _initForm(): void {
  const doc = documentStore.currentDocument; if (!doc) return
  title.value = doc.title
  userTags.value = [...(doc.metadata?.userTags ?? [])]
  notes.value = doc.metadata?.notes ?? ''
  overrideType.value = doc.metadata?.userOverrideType ?? null
}

function addTag(): void {
  const trimmed = tagInput.value.trim()
  if (!trimmed || userTags.value.includes(trimmed)) return
  userTags.value.push(trimmed); tagInput.value = ''
}
function removeTag(label: string): void { userTags.value = userTags.value.filter((t) => t !== label) }
function onTagKeydown(event: KeyboardEvent): void { if (event.key === 'Enter') { event.preventDefault(); addTag() } }

const showToast  = ref(false)
const toastTimer = ref<ReturnType<typeof setTimeout> | null>(null)
function _showSuccessToast(): void {
  showToast.value = true
  if (toastTimer.value) clearTimeout(toastTimer.value)
  toastTimer.value = setTimeout(() => { showToast.value = false }, 2_500)
}
onUnmounted(() => { if (toastTimer.value) clearTimeout(toastTimer.value) })

const isSaving  = ref(false)
const saveError = ref<string | null>(null)

async function handleSave(): Promise<void> {
  if (isSaving.value) return
  isSaving.value = true; saveError.value = null
  try {
    await documentStore.updateDocument(documentId.value, {
      title: title.value.trim() || undefined,
      userTags: userTags.value,
      notes: notes.value.trim() || null,
      userOverrideType: overrideType.value,
    })
    _showSuccessToast()
    setTimeout(() => router.back(), 1_200)
  } catch { saveError.value = 'Impossible d\'enregistrer les modifications. Réessayez.' }
  finally { isSaving.value = false }
}
</script>

<template>
  <SwipeBack>
    <div class="flex h-full flex-col overflow-hidden bg-tidy-surface">

      <!-- Header fixe -->
      <header
        class="relative z-10 flex-shrink-0 flex items-center justify-between border-b border-white/10 px-4 py-3 backdrop-blur-md"
        style="background-color: rgba(13,13,20,0.85);"
      >
        <button type="button"
                class="flex h-9 w-9 items-center justify-center rounded-full text-tidy-text-secondary transition-colors hover:bg-white/10 active:bg-white/15"
                aria-label="Annuler" :disabled="isSaving" @click="router.back()">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 class="text-base font-semibold text-tidy-text-primary">Modifier le document</h1>
        <button type="button"
                class="rounded-full bg-tidy-orange px-4 py-1.5 text-sm font-semibold text-white transition-colors active:opacity-80 disabled:opacity-40"
                :disabled="isSaving" @click="handleSave">
          {{ isSaving ? 'Enregistrement…' : 'Enregistrer' }}
        </button>
      </header>

      <!-- Contenu scrollable -->
      <main class="scroll-area flex-1 overflow-y-auto p-4 pb-16">
        <template v-if="documentStore.isLoadingDetail">
          <SkeletonLoader variant="document-detail" :count="1" />
        </template>
        <template v-else-if="documentStore.currentDocument">
          <form class="flex flex-col gap-5" @submit.prevent="handleSave">
            <div>
              <label for="doc-title" class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-tidy-text-secondary">Titre</label>
              <input id="doc-title" v-model="title" type="text" maxlength="200" placeholder="Titre du document" class="input-field" />
            </div>
            <div>
              <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-tidy-text-secondary">Tags personnels</p>
              <div class="mb-2 flex flex-wrap gap-1.5">
                <TagChip v-for="tag in userTags" :key="tag" :label="tag" variant="user" :removable="true" @remove="removeTag" />
                <span v-if="userTags.length === 0" class="text-xs italic text-tidy-text-tertiary">Aucun tag</span>
              </div>
              <div class="flex gap-2">
                <input v-model="tagInput" type="text" maxlength="40" placeholder="Nouveau tag…" class="input-field flex-1" @keydown="onTagKeydown" />
                <button type="button"
                        class="rounded-full border border-tidy-border-glass bg-tidy-surface-glass px-4 py-2.5 text-sm font-medium text-tidy-text-primary transition-colors hover:border-tidy-mauve/40 active:opacity-70 disabled:opacity-40"
                        :disabled="!tagInput.trim()" @click="addTag">Ajouter</button>
              </div>
            </div>
            <div>
              <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-tidy-text-secondary">Type de document</p>
              <TypeOverrideDropdown
                :current-detected-type="documentStore.currentDocument.intelligence?.detectedType ?? null"
                :current-override-type="overrideType"
                @override="overrideType = $event"
              />
              <button v-if="overrideType" type="button"
                      class="mt-1.5 text-xs text-tidy-text-secondary underline underline-offset-2 active:opacity-60"
                      @click="overrideType = null">
                Rétablir la détection automatique
              </button>
            </div>
            <div>
              <label for="doc-notes" class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-tidy-text-secondary">Notes</label>
              <textarea id="doc-notes" v-model="notes" rows="4" placeholder="Ajoutez une note personnelle…"
                        class="w-full resize-none rounded-3xl border border-tidy-border-glass bg-tidy-surface-glass backdrop-blur-sm px-4 py-3 text-sm text-tidy-text-primary placeholder:text-tidy-text-tertiary focus:border-tidy-mauve focus:outline-none focus:ring-2 focus:ring-tidy-mauve/20" />
            </div>
            <div v-if="saveError" role="alert"
                 class="rounded-3xl bg-tidy-status-error/10 border border-tidy-status-error/20 px-4 py-3 text-sm text-tidy-status-error">
              {{ saveError }}
            </div>
            <button type="submit" class="btn-primary" :disabled="isSaving">
              {{ isSaving ? 'Enregistrement…' : 'Enregistrer les modifications' }}
            </button>
            <button type="button" class="w-full py-2 text-sm text-tidy-text-secondary underline underline-offset-2 active:opacity-60"
                    :disabled="isSaving" @click="router.back()">Annuler</button>
          </form>
        </template>
      </main>

      <!-- Toast -->
      <Transition
        enter-active-class="transition duration-200 ease-out" enter-from-class="opacity-0 translate-y-2" enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-150 ease-in" leave-from-class="opacity-100 translate-y-0" leave-to-class="opacity-0 translate-y-2"
      >
        <div v-if="showToast" role="status" aria-live="polite"
             class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 glass-panel px-5 py-2.5 text-sm font-medium text-tidy-text-primary shadow-lg">
          ✓ Modifications enregistrées
        </div>
      </Transition>
    </div>
  </SwipeBack>
</template>
