<script setup lang="ts">
const authStore = useAuthStore()
const router = useRouter()
const config = useRuntimeConfig()
const baseURL = config.public.apiBaseUrl as string

// ── State formulaire ───────────────────────────────────────────────────────
const displayName = ref(authStore.user?.displayName ?? '')
const isLoading = ref(false)
const error = ref<string | null>(null)
const fieldError = ref('')
const success = ref(false)

// ── State modale suppression ───────────────────────────────────────────────
const showDeleteModal = ref(false)
const deleteCountdown = ref(10)
const isDeleting = ref(false)
const deleteError = ref<string | null>(null)
let countdownTimer: ReturnType<typeof setInterval> | null = null

function openDeleteModal(): void {
  showDeleteModal.value = true
  deleteCountdown.value = 10
  deleteError.value = null
  countdownTimer = setInterval(() => {
    if (deleteCountdown.value > 0) {
      deleteCountdown.value--
    } else {
      if (countdownTimer) clearInterval(countdownTimer)
    }
  }, 1000)
}

function closeDeleteModal(): void {
  showDeleteModal.value = false
  if (countdownTimer) clearInterval(countdownTimer)
  deleteCountdown.value = 10
  deleteError.value = null
}

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})

async function handleDeleteAccount(): Promise<void> {
  if (deleteCountdown.value > 0) return
  isDeleting.value = true
  deleteError.value = null
  try {
    await $fetch('/me', {
      baseURL,
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
    })
    // Vider la session et rediriger
    await authStore.logout()
  } catch (err: unknown) {
    const fetchErr = err as { data?: { error?: { message?: string } } }
    deleteError.value = fetchErr?.data?.error?.message ?? 'Impossible de supprimer le compte.'
    isDeleting.value = false
  }
}

// ── Validation & submit profil ─────────────────────────────────────────────
function validate(): boolean {
  fieldError.value = ''
  if (!displayName.value || displayName.value.trim().length < 2) {
    fieldError.value = 'Le nom doit contenir au moins 2 caractères.'
    return false
  }
  if (displayName.value.trim().length > 100) {
    fieldError.value = 'Le nom ne peut pas dépasser 100 caractères.'
    return false
  }
  return true
}

async function handleSubmit(): Promise<void> {
  if (!validate()) return
  if (displayName.value.trim() === authStore.user?.displayName) {
    router.back()
    return
  }
  isLoading.value = true
  error.value = null
  success.value = false
  try {
    const res = await $fetch<{ data: { displayName: string } | null; error: { message: string } | null }>(
      '/me',
      {
        baseURL,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${authStore.accessToken}` },
        body: { displayName: displayName.value.trim() },
      }
    )
    if (!res.data) throw new Error(res.error?.message ?? 'Erreur lors de la mise à jour.')
    if (authStore.user) {
      authStore.user = { ...authStore.user, displayName: res.data.displayName }
    }
    success.value = true
    setTimeout(() => router.back(), 800)
  } catch (err: unknown) {
    const fetchErr = err as { data?: { error?: { message?: string } } }
    error.value = fetchErr?.data?.error?.message ?? 'Impossible de sauvegarder les modifications.'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-tidy-surface">

    <!-- Header -->
    <header class="flex items-center gap-3 px-4 pt-12 pb-4">
      <button
        class="flex items-center justify-center w-9 h-9 rounded-full hover:bg-tidy-border/50 transition-colors"
        aria-label="Annuler"
        :disabled="isLoading"
        @click="router.back()"
      >
        <svg class="w-5 h-5 text-tidy-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h1 class="text-lg font-semibold text-tidy-text-primary">Modifier le profil</h1>
    </header>

    <div class="px-4 flex-1 flex flex-col gap-6">

      <!-- Formulaire -->
      <form class="flex flex-col gap-5" novalidate @submit.prevent="handleSubmit">

        <div>
          <label for="displayName" class="input-label">Nom affiché</label>
          <input
            id="displayName"
            v-model="displayName"
            type="text"
            autocomplete="name"
            placeholder="Votre nom"
            :class="fieldError ? 'input-field-error' : 'input-field'"
            :disabled="isLoading"
          />
          <p v-if="fieldError" class="mt-1 text-xs text-tidy-status-error">
            {{ fieldError }}
          </p>
        </div>

        <div>
          <label class="input-label">Email</label>
          <input
            type="email"
            :value="authStore.user?.email ?? ''"
            class="input-field opacity-60 cursor-not-allowed"
            disabled
          />
          <p class="mt-1 text-xs text-tidy-text-tertiary">
            L'adresse email ne peut pas être modifiée.
          </p>
        </div>

        <div
          v-if="error"
          class="rounded-xl bg-red-50 px-4 py-3 text-sm text-tidy-status-error"
          role="alert"
        >
          {{ error }}
        </div>

        <div
          v-if="success"
          class="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2"
          role="status"
        >
          <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Modifications enregistrées.
        </div>

        <button
          type="submit"
          class="btn-primary"
          :disabled="isLoading || success"
        >
          <span v-if="isLoading" class="flex items-center justify-center gap-2">
            <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Enregistrement…
          </span>
          <span v-else>Enregistrer</span>
        </button>

      </form>

      <!-- Zone danger -->
      <div class="mt-auto pb-10">
        <div class="rounded-2xl border border-red-100 bg-white overflow-hidden">
          <div class="px-5 py-3 border-b border-red-100">
            <p class="text-xs font-semibold uppercase tracking-wider text-red-400">Zone dangereuse</p>
          </div>
          <div class="px-5 py-4">
            <p class="text-sm text-tidy-text-secondary mb-3">
              La suppression de votre compte est définitive. Tous vos documents et données seront effacés.
            </p>
            <button
              type="button"
              class="w-full rounded-xl border border-red-200 bg-red-50 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
              @click="openDeleteModal"
            >
              Supprimer mon compte
            </button>
          </div>
        </div>
      </div>

    </div>

    <!-- ── Modale confirmation suppression ──────────────────────────────── -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showDeleteModal"
          class="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <!-- Backdrop -->
          <div
            class="absolute inset-0 bg-black/40 backdrop-blur-sm"
            @click="closeDeleteModal"
          />

          <!-- Panneau -->
          <div class="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-2xl px-6 pt-6 pb-10 sm:pb-6 shadow-xl">

            <!-- Icône avertissement -->
            <div class="flex justify-center mb-4">
              <div class="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
                <svg class="h-7 w-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
            </div>

            <h2 id="delete-modal-title" class="text-center text-base font-semibold text-tidy-text-primary mb-2">
              Supprimer mon compte ?
            </h2>
            <p class="text-center text-sm text-tidy-text-secondary mb-6">
              Cette action est <strong>irréversible</strong>. Tous vos documents, workspaces et données seront définitivement supprimés.
            </p>

            <!-- Erreur suppression -->
            <div
              v-if="deleteError"
              class="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-tidy-status-error"
              role="alert"
            >
              {{ deleteError }}
            </div>

            <!-- Boutons -->
            <div class="flex flex-col gap-3">

              <!-- Confirmer — inactif pendant le décompte -->
              <button
                type="button"
                class="w-full rounded-xl py-3 text-sm font-medium transition-all"
                :class="deleteCountdown > 0
                  ? 'bg-red-100 text-red-300 cursor-not-allowed'
                  : 'bg-red-500 text-white hover:bg-red-600 active:scale-95'"
                :disabled="deleteCountdown > 0 || isDeleting"
                @click="handleDeleteAccount"
              >
                <span v-if="isDeleting" class="flex items-center justify-center gap-2">
                  <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Suppression…
                </span>
                <span v-else-if="deleteCountdown > 0">
                  Confirmer ({{ deleteCountdown }}s)
                </span>
                <span v-else>Confirmer</span>
              </button>

              <!-- Annuler -->
              <button
                type="button"
                class="w-full rounded-xl border border-tidy-border py-3 text-sm font-medium text-tidy-text-primary transition-colors hover:bg-tidy-surface"
                :disabled="isDeleting"
                @click="closeDeleteModal"
              >
                Annuler
              </button>

            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

  </div>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-active .relative,
.modal-leave-active .relative {
  transition: transform 0.25s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .relative {
  transform: translateY(100%);
}
@media (min-width: 640px) {
  .modal-enter-from .relative {
    transform: translateY(8px) scale(0.97);
  }
}
</style>
