<script setup lang="ts">
import type { CreateWorkspacePayload } from '~/types/api'

const workspaceStore = useWorkspaceStore()
const router = useRouter()
const route = useRoute()

// ── Dropdown ───────────────────────────────────────────────────────────────
const isOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLElement | null>(null)

onClickOutside(dropdownRef, () => { isOpen.value = false })

// Position du dropdown calculée depuis le bouton trigger
const dropdownTop = ref(0)

function openDropdown(): void {
  if (triggerRef.value) {
    const rect = triggerRef.value.getBoundingClientRect()
    dropdownTop.value = rect.bottom + 8 // 8px sous le bouton
  }
  isOpen.value = !isOpen.value
}

// ── Modal Création ─────────────────────────────────────────────────────────
const isModalOpen    = ref(false)
const newName        = ref('')
const newDescription = ref('')
const isCreating     = ref(false)
const createError    = ref<string | null>(null)
const nameInputRef   = ref<HTMLInputElement | null>(null)

watch(isModalOpen, (val) => {
  if (val) nextTick(() => nameInputRef.value?.focus())
})

// ── Computed ───────────────────────────────────────────────────────────────
const currentWorkspaceId = computed<string | null>(() => {
  const id = route.params.workspaceId
  return typeof id === 'string' ? id : null
})

// ── Handlers ───────────────────────────────────────────────────────────────
function selectWorkspace(id: string): void {
  isOpen.value = false
  if (id !== currentWorkspaceId.value) {
    router.push(`/workspace/${id}`)
  }
}

function openCreateModal(): void {
  isOpen.value = false
  newName.value = ''
  newDescription.value = ''
  createError.value = null
  isModalOpen.value = true
}

function closeModal(): void {
  if (isCreating.value) return
  isModalOpen.value = false
}

async function handleCreate(): Promise<void> {
  const trimmedName = newName.value.trim()
  if (!trimmedName) return

  isCreating.value = true
  createError.value = null

  try {
    const payload: CreateWorkspacePayload = { name: trimmedName }
    if (newDescription.value.trim()) {
      payload.description = newDescription.value.trim()
    }
    const created = await workspaceStore.createWorkspace(payload)
    if (created) {
      isModalOpen.value = false
      router.push(`/workspace/${created.id}`)
    }
  } catch (err: unknown) {
    const fetchErr = err as { data?: { error?: { message?: string } } }
    createError.value =
      fetchErr?.data?.error?.message ?? "Impossible de créer l'espace de travail."
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <div ref="dropdownRef" class="relative">

    <!-- ── Bouton déclencheur — toujours rounded-full ─────────────────── -->
    <button
      ref="triggerRef"
      type="button"
      class="flex items-center gap-2 rounded-full border border-tidy-border bg-white px-3 py-2 text-sm font-medium text-tidy-text-primary transition-colors hover:bg-tidy-surface-overlay"
      :aria-expanded="isOpen"
      aria-haspopup="listbox"
      @click="openDropdown"
    >
      <span class="max-w-[160px] truncate">
        {{ workspaceStore.currentWorkspace?.name ?? 'Espace de travail' }}
      </span>
      <svg
        class="h-4 w-4 flex-shrink-0 text-tidy-text-secondary transition-transform duration-200"
        :class="{ 'rotate-180': isOpen }"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
          clip-rule="evenodd"
        />
      </svg>
    </button>

    <!-- ── Dropdown style FAB — options depuis le haut à gauche ──────── -->
    <Teleport to="body">
      <!-- Backdrop -->
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="isOpen"
          class="fixed inset-0 z-40 bg-black/30"
          aria-hidden="true"
          @click="isOpen = false"
        />
      </Transition>

      <!-- Options -->
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 -translate-y-2 scale-95"
        enter-to-class="opacity-100 translate-y-0 scale-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 translate-y-0 scale-100"
        leave-to-class="opacity-0 -translate-y-2 scale-95"
      >
        <div
          v-if="isOpen"
          class="fixed left-4 z-50 flex flex-col gap-2"
          :style="{ top: `${dropdownTop}px` }"
          role="listbox"
          aria-label="Sélectionner un espace de travail"
        >
          <!-- Workspaces -->
          <div
            v-for="workspace in workspaceStore.activeWorkspaces"
            :key="workspace.id"
            class="flex items-center gap-3"
          >
            <!-- Bouton icône rond (à gauche) -->
            <button
              type="button"
              class="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full shadow-lg transition-all active:scale-95"
              :class="workspace.id === currentWorkspaceId
                ? 'bg-tidy-primary text-white'
                : 'bg-white text-tidy-primary hover:bg-tidy-primary/5'"
              role="option"
              :aria-selected="workspace.id === currentWorkspaceId"
              :aria-label="`Sélectionner ${workspace.name}`"
              @click="selectWorkspace(workspace.id)"
            >
              <span class="text-lg font-bold">
                {{ workspace.name.charAt(0).toUpperCase() }}
              </span>
            </button>
            <!-- Label bulle (à droite) -->
            <span
              class="rounded-xl bg-white px-3 py-2 text-sm shadow-md"
              :class="workspace.id === currentWorkspaceId
                ? 'font-semibold text-tidy-primary'
                : 'font-medium text-tidy-text-primary'"
            >
              {{ workspace.name }}
            </span>
          </div>

          <!-- Guard aucun workspace -->
          <div v-if="workspaceStore.activeWorkspaces.length === 0" class="flex items-center gap-3">
            <div class="h-12 w-12 flex-shrink-0 rounded-full bg-white/60 shadow-lg" />
            <span class="rounded-2xl bg-white/95 px-4 py-2.5 text-sm text-tidy-text-tertiary shadow-lg">
              Aucun espace de travail actif
            </span>
          </div>

          <!-- Action : Nouvel espace -->
          <div class="flex items-center gap-3">
            <!-- Bouton icône : fond blanc, texte vert, border animé -->
            <button
              type="button"
              class="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-white shadow-lg transition-all active:scale-95" style="border: 2px solid #4F6EF7"
              aria-label="Créer un nouvel espace de travail"
              @click="openCreateModal"
            >
              <svg class="h-6 w-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="color: #4F6EF7">
                <path d="M11.25 4.75a.75.75 0 011.5 0v6.5h6.5a.75.75 0 010 1.5h-6.5v6.5a.75.75 0 01-1.5 0v-6.5h-6.5a.75.75 0 010-1.5h6.5v-6.5z" />
              </svg>
            </button>
            <!-- Label bulle : fond blanc, texte vert, border animé -->
            <span class="ws-new-label px-3 py-2 text-sm font-medium shadow-md" style="color: #4F6EF7">
              Nouvel espace de travail
            </span>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>

  <!-- ── Modale Création ────────────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isModalOpen"
        class="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-workspace-title"
      >
        <div class="absolute inset-0 bg-black/40" aria-hidden="true" @click="closeModal" />

        <Transition
          enter-active-class="transition duration-200 ease-out"
          enter-from-class="translate-y-full opacity-0 sm:translate-y-0 sm:scale-95"
          enter-to-class="translate-y-0 opacity-100 sm:scale-100"
          leave-active-class="transition duration-150 ease-in"
          leave-from-class="translate-y-0 opacity-100 sm:scale-100"
          leave-to-class="translate-y-full opacity-0 sm:translate-y-0 sm:scale-95"
        >
          <div
            v-if="isModalOpen"
            class="relative z-10 w-full rounded-t-2xl bg-white px-6 pb-8 pt-6 shadow-2xl sm:max-w-md sm:rounded-2xl sm:pb-6"
          >
            <div class="mb-5 flex items-center justify-between">
              <h2 id="create-workspace-title" class="text-base font-semibold text-tidy-text-primary">
                Nouvel espace de travail
              </h2>
              <button
                type="button"
                class="rounded-lg p-1 text-tidy-text-secondary transition-colors hover:bg-tidy-surface-overlay disabled:opacity-40"
                :disabled="isCreating"
                aria-label="Fermer la modale"
                @click="closeModal"
              >
                <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>

            <form class="space-y-4" @submit.prevent="handleCreate">
              <div>
                <label for="workspace-name" class="mb-1.5 block text-sm font-medium text-tidy-text-primary">
                  Nom <span class="text-tidy-status-error" aria-hidden="true">*</span>
                </label>
                <input
                  id="workspace-name"
                  ref="nameInputRef"
                  v-model="newName"
                  type="text"
                  maxlength="100"
                  placeholder="Ex : Pro, Perso, Comptabilité…"
                  autocomplete="off"
                  required
                  :disabled="isCreating"
                  class="w-full rounded-lg border border-tidy-border bg-tidy-surface px-3 py-2.5 text-sm text-tidy-text-primary placeholder:text-tidy-text-tertiary transition-colors focus:border-tidy-primary focus:outline-none focus:ring-2 focus:ring-tidy-primary/20 disabled:opacity-50"
                  :class="{ 'border-tidy-status-error focus:border-tidy-status-error focus:ring-tidy-status-error/20': createError }"
                />
              </div>

              <div>
                <label for="workspace-description" class="mb-1.5 block text-sm font-medium text-tidy-text-primary">
                  Description
                  <span class="ml-1 text-xs font-normal text-tidy-text-tertiary">(optionnel)</span>
                </label>
                <input
                  id="workspace-description"
                  v-model="newDescription"
                  type="text"
                  maxlength="500"
                  placeholder="Description de cet espace…"
                  autocomplete="off"
                  :disabled="isCreating"
                  class="w-full rounded-lg border border-tidy-border bg-tidy-surface px-3 py-2.5 text-sm text-tidy-text-primary placeholder:text-tidy-text-tertiary transition-colors focus:border-tidy-primary focus:outline-none focus:ring-2 focus:ring-tidy-primary/20 disabled:opacity-50"
                />
              </div>

              <p
                v-if="createError"
                class="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-tidy-status-error"
                role="alert"
              >
                <svg class="mt-0.5 h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
                </svg>
                {{ createError }}
              </p>

              <div class="flex gap-3 pt-1">
                <button
                  type="button"
                  class="flex-1 rounded-lg border border-tidy-border py-2.5 text-sm font-medium text-tidy-text-secondary transition-colors hover:bg-tidy-surface-overlay disabled:opacity-40"
                  :disabled="isCreating"
                  @click="closeModal"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-tidy-primary py-2.5 text-sm font-medium text-white transition-colors hover:bg-tidy-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="isCreating || !newName.trim()"
                >
                  <svg v-if="isCreating" class="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
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
/*
 * Border animé "sweep" sens horaire — uniquement sur la bulle label.
 * Technique : conic-gradient rotatif en border-box + ::before blanc pour masquer le fond.
 * Halo : ::after duplique le gradient avec filter blur pour l'effet lumineux.
 * Couleur : même bleu que le workspace actif.
 * NOTE : remplacer #4F6EF7 par la valeur hex exacte de tidy-primary si différente.
 */

@property --angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

@keyframes border-sweep {
  to { --angle: 360deg; }
}

/* ── Bulle label ─────────────────────────────────────────────────────────── */
.ws-new-label {
  position: relative;
  isolation: isolate;
  background:
    conic-gradient(
      from var(--angle),
      #4F6EF7 0deg 80deg,
      transparent 80deg 360deg
    )
    border-box;
  border: 2px solid transparent;
  border-radius: 0.75rem;
  animation: border-sweep 3.5s linear infinite;
}

/* Fond blanc qui masque l'intérieur du gradient conique */
.ws-new-label::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: calc(0.75rem - 2px);
  background: white;
  z-index: -1;
}


</style>
