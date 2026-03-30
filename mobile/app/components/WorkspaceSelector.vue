<script setup lang="ts">
import type { CreateWorkspacePayload } from '~/types/api'

// ── Store & Router ─────────────────────────────────────────────────────────
const workspaceStore = useWorkspaceStore()
const router = useRouter()
const route = useRoute()

// ── Dropdown ───────────────────────────────────────────────────────────────
const isOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

// onClickOutside est auto-importé via @vueuse/nuxt
onClickOutside(dropdownRef, () => {
  isOpen.value = false
})

// ── Modal Création ─────────────────────────────────────────────────────────
const isModalOpen = ref(false)
const newName = ref('')
const newDescription = ref('')
const isCreating = ref(false)
const createError = ref<string | null>(null)
const nameInputRef = ref<HTMLInputElement | null>(null)

// Focus automatique sur le champ nom à l'ouverture de la modale
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
  <!-- Wrapper avec ref pour onClickOutside -->
  <div ref="dropdownRef" class="relative">

    <!-- ── Bouton déclencheur ─────────────────────────────────────────── -->
    <button
      type="button"
      class="flex items-center gap-2 rounded-lg border border-tidy-border bg-white px-3 py-2 text-sm font-medium text-tidy-text-primary transition-colors hover:bg-tidy-surface-overlay"
      :aria-expanded="isOpen"
      aria-haspopup="listbox"
      @click="isOpen = !isOpen"
    >
      <span class="max-w-[160px] truncate">
        {{ workspaceStore.currentWorkspace?.name ?? 'Espace de travail' }}
      </span>
      <!-- Chevron animé -->
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

    <!-- ── Dropdown ───────────────────────────────────────────────────── -->
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="isOpen"
        class="absolute left-0 z-50 mt-2 w-64 origin-top-left rounded-xl border border-tidy-border bg-white shadow-lg"
        role="listbox"
        aria-label="Sélectionner un espace de travail"
      >
        <!-- Liste des workspaces actifs -->
        <ul class="max-h-56 overflow-y-auto py-1">
          <li
            v-for="workspace in workspaceStore.activeWorkspaces"
            :key="workspace.id"
            class="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm text-tidy-text-primary transition-colors hover:bg-tidy-surface-overlay"
            :class="{
              'bg-tidy-surface-overlay font-semibold': workspace.id === currentWorkspaceId,
            }"
            role="option"
            :aria-selected="workspace.id === currentWorkspaceId"
            @click="selectWorkspace(workspace.id)"
          >
            <!-- Avatar initiale -->
            <span
              class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-tidy-primary/10 text-xs font-bold text-tidy-primary"
              aria-hidden="true"
            >
              {{ workspace.name.charAt(0).toUpperCase() }}
            </span>

            <span class="flex-1 truncate">{{ workspace.name }}</span>

            <!-- Checkmark workspace courant -->
            <svg
              v-if="workspace.id === currentWorkspaceId"
              class="h-4 w-4 flex-shrink-0 text-tidy-primary"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fill-rule="evenodd"
                d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                clip-rule="evenodd"
              />
            </svg>
          </li>

          <!-- Guard : ne devrait jamais apparaître (invariant 1 workspace minimum) -->
          <li
            v-if="workspaceStore.activeWorkspaces.length === 0"
            class="px-4 py-3 text-sm text-tidy-text-tertiary"
          >
            Aucun espace de travail actif
          </li>
        </ul>

        <!-- Séparateur -->
        <div class="border-t border-tidy-border" />

        <!-- Créer un nouvel espace -->
        <div class="py-1">
          <button
            type="button"
            class="flex w-full items-center gap-3 px-3 py-2.5 text-sm font-medium text-tidy-primary transition-colors hover:bg-tidy-surface-overlay"
            @click="openCreateModal"
          >
            <svg
              class="h-5 w-5 flex-shrink-0"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z"
              />
            </svg>
            Nouvel espace de travail
          </button>
        </div>
      </div>
    </Transition>
  </div>

  <!-- ── Modale Création (Teleport hors layout pour z-index propre) ──── -->
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
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/40"
          aria-hidden="true"
          @click="closeModal"
        />

        <!-- Panel — bottom sheet sur mobile, modale centrée sur desktop -->
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
            <!-- En-tête -->
            <div class="mb-5 flex items-center justify-between">
              <h2
                id="create-workspace-title"
                class="text-base font-semibold text-tidy-text-primary"
              >
                Nouvel espace de travail
              </h2>
              <button
                type="button"
                class="rounded-lg p-1 text-tidy-text-secondary transition-colors hover:bg-tidy-surface-overlay disabled:opacity-40"
                :disabled="isCreating"
                aria-label="Fermer la modale"
                @click="closeModal"
              >
                <svg
                  class="h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
                  />
                </svg>
              </button>
            </div>

            <!-- Formulaire -->
            <form class="space-y-4" @submit.prevent="handleCreate">
              <!-- Champ Nom -->
              <div>
                <label
                  for="workspace-name"
                  class="mb-1.5 block text-sm font-medium text-tidy-text-primary"
                >
                  Nom
                  <span class="text-tidy-status-error" aria-hidden="true"> *</span>
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
                  :class="{
                    'border-tidy-status-error focus:border-tidy-status-error focus:ring-tidy-status-error/20':
                      createError,
                  }"
                />
              </div>

              <!-- Champ Description (optionnel) -->
              <div>
                <label
                  for="workspace-description"
                  class="mb-1.5 block text-sm font-medium text-tidy-text-primary"
                >
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

              <!-- Erreur serveur (ex : WORKSPACE_NAME_DUPLICATE) -->
              <p
                v-if="createError"
                class="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-tidy-status-error"
                role="alert"
              >
                <svg
                  class="mt-0.5 h-4 w-4 flex-shrink-0"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fill-rule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                    clip-rule="evenodd"
                  />
                </svg>
                {{ createError }}
              </p>

              <!-- Boutons d'action -->
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
                  <svg
                    v-if="isCreating"
                    class="h-4 w-4 animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      class="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      stroke-width="4"
                    />
                    <path
                      class="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
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
