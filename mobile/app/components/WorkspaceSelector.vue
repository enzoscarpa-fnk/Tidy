<script setup lang="ts">
import type { CreateWorkspacePayload } from '~/types/api'

const workspaceStore = useWorkspaceStore()
const router = useRouter()
const route  = useRoute()

const isOpen      = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)
const triggerRef  = ref<HTMLElement | null>(null)

onClickOutside(dropdownRef, () => { isOpen.value = false })

const dropdownTop = ref(0)

function openDropdown(): void {
  if (triggerRef.value) {
    const rect = triggerRef.value.getBoundingClientRect()
    dropdownTop.value = rect.bottom + 8
  }
  isOpen.value = !isOpen.value
}

const isModalOpen    = ref(false)
const newName        = ref('')
const newDescription = ref('')
const isCreating     = ref(false)
const createError    = ref<string | null>(null)
const nameInputRef   = ref<HTMLInputElement | null>(null)

const currentWorkspaceId = computed<string | null>(() => {
  const id = route.params.workspaceId
  return typeof id === 'string' ? id : null
})

const currentWorkspaceName = computed(
  () => workspaceStore.currentWorkspace?.name ?? 'Espace de travail'
)

function selectWorkspace(id: string): void {
  isOpen.value = false
  if (id !== currentWorkspaceId.value) router.push(`/workspace/${id}`)
}

function openCreateModal(): void {
  isOpen.value = false
  newName.value = ''; newDescription.value = ''; createError.value = null
  isModalOpen.value = true
}

function closeModal(): void {
  if (isCreating.value) return
  isModalOpen.value = false
}

// ── Gestion clavier (iOS WKWebView / Capacitor) ───────────────────────────
// Sur WKWebView, quand le clavier s'ouvre, window.visualViewport.height diminue.
// On mesure la différence entre window.innerHeight et visualViewport.height
// pour calculer le padding-bottom à appliquer au panel de la modale,
// ce qui pousse son contenu vers le haut sans déplacer le conteneur fixed.
const keyboardPadding = ref(0)

function updateKeyboardPadding(): void {
  if (!window.visualViewport) return
  const offset = Math.max(0, window.innerHeight - window.visualViewport.height)
  keyboardPadding.value = offset
}

watch(isModalOpen, (val) => {
  if (val) {
    nextTick(() => nameInputRef.value?.focus())
    window.visualViewport?.addEventListener('resize', updateKeyboardPadding)
    window.visualViewport?.addEventListener('scroll', updateKeyboardPadding)
  } else {
    keyboardPadding.value = 0
    window.visualViewport?.removeEventListener('resize', updateKeyboardPadding)
    window.visualViewport?.removeEventListener('scroll', updateKeyboardPadding)
  }
})

onUnmounted(() => {
  window.visualViewport?.removeEventListener('resize', updateKeyboardPadding)
  window.visualViewport?.removeEventListener('scroll', updateKeyboardPadding)
})

async function handleCreate(): Promise<void> {
  const trimmedName = newName.value.trim()
  if (!trimmedName) return
  isCreating.value = true; createError.value = null
  try {
    const payload: CreateWorkspacePayload = { name: trimmedName }
    if (newDescription.value.trim()) payload.description = newDescription.value.trim()
    const created = await workspaceStore.createWorkspace(payload)
    if (created) { isModalOpen.value = false; router.push(`/workspace/${created.id}`) }
  } catch (err: unknown) {
    const fetchErr = err as { data?: { error?: { message?: string } } }
    createError.value = fetchErr?.data?.error?.message ?? "Impossible de créer l'espace de travail."
  } finally { isCreating.value = false }
}
</script>

<template>
  <div ref="dropdownRef" class="relative">

    <!-- Bouton trigger — nom en mauve -->
    <button
      ref="triggerRef"
      type="button"
      class="flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 text-sm font-medium backdrop-blur-sm transition-all hover:border-tidy-mauve/40 hover:bg-white/[0.07]"
      style="background-color: rgba(13,13,20,0.80);"
      :aria-expanded="isOpen"
      aria-haspopup="listbox"
      @click="openDropdown"
    >
      <span class="max-w-[160px] truncate text-tidy-mauve">{{ currentWorkspaceName }}</span>
      <svg class="h-4 w-4 flex-shrink-0 text-tidy-text-secondary transition-transform duration-200" :class="{ 'rotate-180': isOpen }"
           xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
      </svg>
    </button>

    <!-- Dropdown -->
    <Teleport to="body">
      <Transition enter-active-class="transition duration-200 ease-out" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition duration-150 ease-in" leave-from-class="opacity-100" leave-to-class="opacity-0">
        <div v-if="isOpen" class="fixed inset-0 z-[60] bg-black/65 backdrop-blur-sm" aria-hidden="true" @click="isOpen = false" />
      </Transition>

      <Transition enter-active-class="transition duration-200 ease-out" enter-from-class="opacity-0 -translate-y-2 scale-95" enter-to-class="opacity-100 translate-y-0 scale-100" leave-active-class="transition duration-150 ease-in" leave-from-class="opacity-100 translate-y-0 scale-100" leave-to-class="opacity-0 -translate-y-2 scale-95">
        <div v-if="isOpen" class="fixed left-4 z-[61] flex flex-col gap-2" :style="{ top: `${dropdownTop}px` }" role="listbox" aria-label="Sélectionner un espace de travail">

          <!-- Workspaces existants -->
          <div v-for="workspace in workspaceStore.activeWorkspaces" :key="workspace.id" class="flex items-center gap-3">
            <button type="button"
                    class="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full border backdrop-blur-md shadow-lg transition-all active:scale-95"
                    :class="workspace.id === currentWorkspaceId
                ? 'bg-tidy-mauve/20 border-tidy-mauve/40 text-tidy-mauve shadow-[0_0_14px_4px_rgba(167,139,250,0.25)]'
                : 'border-white/15 text-tidy-text-secondary hover:bg-white/[0.08] hover:text-tidy-mauve'"
                    :style="workspace.id !== currentWorkspaceId ? 'background-color:rgba(13,13,20,0.88);' : ''"
                    role="option" :aria-selected="workspace.id === currentWorkspaceId"
                    :aria-label="`Sélectionner ${workspace.name}`"
                    @click="selectWorkspace(workspace.id)">
              <span class="text-lg font-bold">{{ workspace.name.charAt(0).toUpperCase() }}</span>
            </button>
            <button type="button"
                    class="rounded-full px-3 py-2 text-sm border backdrop-blur-md shadow-md transition-all hover:bg-white/10 active:opacity-80"
                    :class="workspace.id === currentWorkspaceId
                ? 'font-semibold text-tidy-mauve border-tidy-mauve/30'
                : 'font-medium text-tidy-text-primary border-white/15'"
                    style="background-color:rgba(13,13,20,0.88);"
                    @click="selectWorkspace(workspace.id)">
              {{ workspace.name }}
            </button>
          </div>

          <!-- Aucun workspace -->
          <div v-if="workspaceStore.activeWorkspaces.length === 0" class="flex items-center gap-3">
            <div class="h-14 w-14 flex-shrink-0 rounded-full border border-white/10 shadow-lg" style="background-color:rgba(13,13,20,0.88);" />
            <span class="rounded-full border border-white/10 px-4 py-2.5 text-sm text-tidy-text-tertiary shadow-lg backdrop-blur-md" style="background-color:rgba(13,13,20,0.88);">
              Aucun espace de travail actif
            </span>
          </div>

          <!-- Nouvel espace -->
          <div class="flex items-center gap-3 mt-2">
            <div class="relative">
              <span class="sparkle-1 pointer-events-none absolute -top-2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-tidy-orange-light" aria-hidden="true" />
              <span class="sparkle-2 pointer-events-none absolute -top-1 -right-0.5 h-1 w-1 rounded-full bg-tidy-orange" aria-hidden="true" />
              <span class="sparkle-3 pointer-events-none absolute -top-2 -left-0.5 h-1.5 w-1.5 rounded-full bg-tidy-orange-light/70" aria-hidden="true" />
              <button type="button"
                      class="ws-new-btn relative flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full
                       border border-tidy-orange/35 backdrop-blur-md shadow-lg transition-all active:scale-95 hover:bg-tidy-orange/10"
                      style="background-color:rgba(13,13,20,0.88);"
                      aria-label="Créer un nouvel espace de travail"
                      @click="openCreateModal">
                <svg class="h-6 w-6 text-tidy-orange" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M11.25 4.75a.75.75 0 011.5 0v6.5h6.5a.75.75 0 010 1.5h-6.5v6.5a.75.75 0 01-1.5 0v-6.5h-6.5a.75.75 0 010-1.5h6.5v-6.5z" />
                </svg>
              </button>
            </div>
            <button type="button"
                    class="ws-new-label rounded-full px-3 py-2 text-sm font-medium text-tidy-orange
                     border border-tidy-orange/35 backdrop-blur-md shadow-md
                     transition-all hover:bg-tidy-orange/10 active:opacity-80"
                    style="background-color:rgba(13,13,20,0.88);"
                    @click="openCreateModal">
              Nouvel espace de travail
            </button>
          </div>

        </div>
      </Transition>
    </Teleport>
  </div>

  <!-- Modale Création -->
  <Teleport to="body">
    <Transition enter-active-class="transition duration-200 ease-out" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition duration-150 ease-in" leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div v-if="isModalOpen" class="fixed inset-0 z-[62] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="create-workspace-title">
        <div class="absolute inset-0 bg-black/65 backdrop-blur-sm" aria-hidden="true" @click="closeModal" />
        <Transition enter-active-class="transition duration-200 ease-out" enter-from-class="translate-y-full opacity-0 sm:translate-y-0 sm:scale-95" enter-to-class="translate-y-0 opacity-100 sm:scale-100" leave-active-class="transition duration-150 ease-in" leave-from-class="translate-y-0 opacity-100 sm:scale-100" leave-to-class="translate-y-full opacity-0 sm:translate-y-0 sm:scale-95">
          <div v-if="isModalOpen"
               class="glass-panel relative z-10 w-full px-6 pt-6 shadow-2xl rounded-t-3xl sm:max-w-md sm:rounded-3xl"
               :style="{
                 paddingBottom: keyboardPadding > 0
                   ? `${keyboardPadding + 24}px`
                   : '2rem',
                 transition: 'padding-bottom 0.25s ease'
               }"
          >
            <div class="mb-5 flex items-center justify-between">
              <h2 id="create-workspace-title" class="text-base font-semibold text-tidy-text-primary">Nouvel espace de travail</h2>
              <button type="button" class="rounded-full p-1 text-tidy-text-secondary transition-colors hover:bg-white/10 disabled:opacity-40" :disabled="isCreating" aria-label="Fermer la modale" @click="closeModal">
                <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
            <form class="space-y-4" @submit.prevent="handleCreate">
              <div>
                <label for="workspace-name" class="input-label">Nom <span class="text-tidy-status-error" aria-hidden="true">*</span></label>
                <input id="workspace-name" ref="nameInputRef" v-model="newName" type="text" maxlength="100" placeholder="Ex : Pro, Perso, Comptabilité…" autocomplete="off" required :disabled="isCreating" class="input-field" :class="{ 'input-field-error': createError }" />
              </div>
              <div>
                <label for="workspace-description" class="input-label">Description <span class="ml-1 text-xs font-normal text-tidy-text-tertiary">(optionnel)</span></label>
                <input id="workspace-description" v-model="newDescription" type="text" maxlength="500" placeholder="Description de cet espace…" autocomplete="off" :disabled="isCreating" class="input-field" />
              </div>
              <p v-if="createError" class="flex items-start gap-2 rounded-2xl bg-tidy-status-error/10 border border-tidy-status-error/20 px-3 py-2 text-sm text-tidy-status-error" role="alert">
                <svg class="mt-0.5 h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" /></svg>
                {{ createError }}
              </p>
              <div class="flex gap-3 pt-1">
                <button type="button" class="flex-1 rounded-full border border-tidy-border py-2.5 text-sm font-medium text-tidy-text-secondary transition-colors hover:bg-white/[0.05] disabled:opacity-40" :disabled="isCreating" @click="closeModal">Annuler</button>
                <button type="submit" class="flex flex-1 items-center justify-center gap-2 rounded-full bg-tidy-orange py-2.5 text-sm font-medium text-white transition-colors hover:bg-tidy-orange-dark disabled:cursor-not-allowed disabled:opacity-50" :disabled="isCreating || !newName.trim()">
                  <svg v-if="isCreating" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" /><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  {{ isCreating ? 'Création…' : 'Créer' }}
                </button>
              </div>
            </form>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Aura orange pulsante — bouton */
@keyframes ws-glow {
  0%, 100% { box-shadow: 0 0 8px 2px #F9731628, 0 0 20px 5px #F9731615; }
  50%       { box-shadow: 0 0 16px 5px #F9731645, 0 0 32px 9px #F9731625; }
}
.ws-new-btn  { animation: ws-glow 2.5s ease-in-out infinite; }

/* Aura propagée sur la bulle */
@keyframes ws-glow-label {
  0%, 100% { box-shadow: 0 0 6px 2px #F9731620, 0 0 14px 4px #F9731610; }
  50%       { box-shadow: 0 0 12px 4px #F9731638, 0 0 24px 7px #F9731620; }
}
.ws-new-label { animation: ws-glow-label 2.5s ease-in-out infinite; }

/* Scintillements */
@keyframes sparkle-anim {
  0%   { opacity: 0; transform: scale(0) translateY(0); }
  30%  { opacity: 1; transform: scale(1) translateY(-4px); }
  70%  { opacity: 0.6; transform: scale(0.8) translateY(-8px); }
  100% { opacity: 0; transform: scale(0) translateY(-14px); }
}
.sparkle-1 { animation: sparkle-anim 3s ease-in-out infinite; }
.sparkle-2 { animation: sparkle-anim 3s ease-in-out 1s infinite; }
.sparkle-3 { animation: sparkle-anim 3s ease-in-out 2s infinite; }
</style>
