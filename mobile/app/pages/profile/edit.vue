<script setup lang="ts">
const authStore = useAuthStore()
const router    = useRouter()
const config    = useRuntimeConfig()
const baseURL   = config.public.apiBaseUrl as string

const displayName = ref(authStore.user?.displayName ?? '')
const isLoading   = ref(false)
const error       = ref<string | null>(null)
const fieldError  = ref('')
const success     = ref(false)

const showDeleteModal = ref(false)
const deleteCountdown = ref(10)
const isDeleting      = ref(false)
const deleteError     = ref<string | null>(null)
let countdownTimer: ReturnType<typeof setInterval> | null = null

function openDeleteModal(): void {
  showDeleteModal.value = true; deleteCountdown.value = 10; deleteError.value = null
  countdownTimer = setInterval(() => {
    if (deleteCountdown.value > 0) deleteCountdown.value--
    else if (countdownTimer) clearInterval(countdownTimer)
  }, 1000)
}
function closeDeleteModal(): void {
  showDeleteModal.value = false
  if (countdownTimer) clearInterval(countdownTimer)
  deleteCountdown.value = 10; deleteError.value = null
}
onUnmounted(() => { if (countdownTimer) clearInterval(countdownTimer) })

async function handleDeleteAccount(): Promise<void> {
  if (deleteCountdown.value > 0) return
  isDeleting.value = true; deleteError.value = null
  try {
    await $fetch('/me', { baseURL, method: 'DELETE', headers: { Authorization: `Bearer ${authStore.accessToken}` } })
    await authStore.logout()
  } catch (err: unknown) {
    const fetchErr = err as { data?: { error?: { message?: string } } }
    deleteError.value = fetchErr?.data?.error?.message ?? 'Impossible de supprimer le compte.'
    isDeleting.value = false
  }
}

function validate(): boolean {
  fieldError.value = ''
  if (!displayName.value || displayName.value.trim().length < 2) { fieldError.value = 'Le nom doit contenir au moins 2 caractères.'; return false }
  if (displayName.value.trim().length > 100) { fieldError.value = 'Le nom ne peut pas dépasser 100 caractères.'; return false }
  return true
}

async function handleSubmit(): Promise<void> {
  if (!validate()) return
  if (displayName.value.trim() === authStore.user?.displayName) { router.back(); return }
  isLoading.value = true; error.value = null; success.value = false
  try {
    const res = await $fetch<{ data: { displayName: string } | null; error: { message: string } | null }>(
      '/me', { baseURL, method: 'PATCH', headers: { Authorization: `Bearer ${authStore.accessToken}` }, body: { displayName: displayName.value.trim() } }
    )
    if (!res.data) throw new Error(res.error?.message ?? 'Erreur lors de la mise à jour.')
    if (authStore.user) authStore.user = { ...authStore.user, displayName: res.data.displayName }
    success.value = true; setTimeout(() => router.back(), 800)
  } catch (err: unknown) {
    const fetchErr = err as { data?: { error?: { message?: string } } }
    error.value = fetchErr?.data?.error?.message ?? 'Impossible de sauvegarder les modifications.'
  } finally { isLoading.value = false }
}
</script>

<template>
  <SwipeBack>
    <div class="flex h-full flex-col overflow-hidden bg-tidy-surface">

      <!-- Header compact fixe -->
      <header class="flex-shrink-0 flex items-center gap-3 px-4 pt-4 pb-2 border-b border-white/10"
              style="background-color: rgba(13,13,20,0.96);">
        <button class="flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/10 transition-colors"
                aria-label="Annuler" :disabled="isLoading" @click="router.back()">
          <svg class="w-5 h-5 text-tidy-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 class="text-base font-semibold text-tidy-text-primary">Modifier le profil</h1>
      </header>

      <!-- Contenu scrollable — padding-bottom géré uniquement par .scroll-area dans components.css -->
      <div class="scroll-area flex-1 overflow-y-auto px-4 pt-4 flex flex-col gap-4">

        <!-- Formulaire -->
        <form class="flex flex-col gap-4" novalidate @submit.prevent="handleSubmit">
          <div>
            <label for="displayName" class="input-label">Nom affiché</label>
            <input id="displayName" v-model="displayName" type="text" autocomplete="name" placeholder="Votre nom"
                   :class="fieldError ? 'input-field-error' : 'input-field'" :disabled="isLoading" />
            <p v-if="fieldError" class="mt-1 text-xs text-tidy-status-error">{{ fieldError }}</p>
          </div>
          <div>
            <label class="input-label">Email</label>
            <input type="email" :value="authStore.user?.email ?? ''" class="input-field opacity-60 cursor-not-allowed" disabled />
            <p class="mt-1 text-xs text-tidy-text-tertiary">L'adresse email ne peut pas être modifiée.</p>
          </div>
          <div v-if="error" class="rounded-3xl bg-tidy-status-error/10 border border-tidy-status-error/20 px-4 py-3 text-sm text-tidy-status-error" role="alert">{{ error }}</div>
          <div v-if="success" class="rounded-3xl bg-tidy-status-success/10 border border-tidy-status-success/20 px-4 py-3 text-sm text-tidy-status-success flex items-center gap-2" role="status">
            <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
            Modifications enregistrées.
          </div>
          <button type="submit" class="btn-primary" :disabled="isLoading || success">
            <span v-if="isLoading" class="flex items-center justify-center gap-2">
              <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" /><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              Enregistrement…
            </span>
            <span v-else>Enregistrer</span>
          </button>
        </form>

        <!-- Zone dangereuse -->
        <div class="glass-panel p-4 space-y-3">
          <p class="px-1 pb-1 text-xs font-semibold uppercase tracking-wider text-tidy-status-error/80">
            Zone dangereuse
          </p>
          <p class="px-1 text-sm text-tidy-text-secondary">
            La suppression de votre compte est définitive. Tous vos documents et données seront effacés.
          </p>
          <button
            type="button"
            class="action-pill-danger w-full justify-between py-3.5"
            @click="openDeleteModal"
          >
            <div class="flex items-center gap-2">
              <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span class="text-sm font-medium">Supprimer mon compte</span>
            </div>
          </button>
        </div>

        <!-- Modale suppression -->
        <Teleport to="body">
          <Transition name="modal">
            <div v-if="showDeleteModal" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
              <div class="absolute inset-0 bg-black/65 backdrop-blur-sm" @click="closeDeleteModal" />
              <div class="glass-panel relative w-full sm:max-w-sm px-6 pt-6 pb-10 sm:pb-6 shadow-xl rounded-t-3xl sm:rounded-3xl">
                <div class="flex justify-center mb-4">
                  <div class="flex h-14 w-14 items-center justify-center rounded-full bg-tidy-status-error/20">
                    <svg class="h-7 w-7 text-tidy-status-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  </div>
                </div>
                <h2 id="delete-modal-title" class="text-center text-base font-semibold text-tidy-text-primary mb-2">Supprimer mon compte ?</h2>
                <p class="text-center text-sm text-tidy-text-secondary mb-6">Cette action est <strong class="text-tidy-text-primary">irréversible</strong>. Tous vos documents, workspaces et données seront définitivement supprimés.</p>
                <div v-if="deleteError" class="mb-4 rounded-2xl bg-tidy-status-error/10 border border-tidy-status-error/20 px-4 py-3 text-sm text-tidy-status-error" role="alert">{{ deleteError }}</div>
                <div class="flex flex-col gap-3">
                  <button type="button"
                          class="w-full rounded-full py-3 text-sm font-medium transition-all"
                          :class="deleteCountdown > 0 ? 'bg-tidy-status-error/15 text-tidy-status-error/40 cursor-not-allowed' : 'bg-tidy-status-error text-white hover:bg-red-600 active:scale-95'"
                          :disabled="deleteCountdown > 0 || isDeleting"
                          @click="handleDeleteAccount">
                    <span v-if="isDeleting" class="flex items-center justify-center gap-2">
                      <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" /><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      Suppression…
                    </span>
                    <span v-else-if="deleteCountdown > 0">Confirmer ({{ deleteCountdown }}s)</span>
                    <span v-else>Confirmer</span>
                  </button>
                  <button type="button" class="w-full rounded-full border border-tidy-border py-3 text-sm font-medium text-tidy-text-primary hover:bg-white/[0.05]" :disabled="isDeleting" @click="closeDeleteModal">Annuler</button>
                </div>
              </div>
            </div>
          </Transition>
        </Teleport>
      </div>
    </div>
  </SwipeBack>
</template>
