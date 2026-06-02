<script setup lang="ts">
const authStore = useAuthStore()
const router = useRouter()

const isLoggingOut = ref(false)

const tierLabel = computed(() =>
  authStore.userTier === 'pro' ? 'Pro' : 'Gratuit'
)

const tierBadgeClass = computed(() =>
  authStore.userTier === 'pro'
    ? 'bg-tidy-primary/10 text-tidy-primary border border-tidy-primary/20'
    : 'bg-tidy-surface text-tidy-text-muted border border-tidy-border'
)

async function handleLogout(): Promise<void> {
  isLoggingOut.value = true
  try {
    await authStore.logout()
    // logout() appelle navigateTo('/auth/login') en interne,
    // mais on force la navigation ici au cas où l'état serait déjà vidé
    await router.replace('/auth/login')
  } finally {
    isLoggingOut.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-tidy-surface">

    <!-- Header -->
    <header class="flex items-center gap-3 px-4 pt-12 pb-4">
      <button
        class="flex items-center justify-center w-9 h-9 rounded-full hover:bg-tidy-border/50 transition-colors"
        aria-label="Retour"
        @click="router.back()"
      >
        <svg class="w-5 h-5 text-tidy-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h1 class="text-lg font-semibold text-tidy-text-primary">Mon profil</h1>
    </header>

    <div class="px-4 space-y-4">

      <!-- Carte identité -->
      <div class="bg-white rounded-2xl p-5 shadow-sm border border-tidy-border">
        <div class="flex items-center gap-4">
          <!-- Avatar initiales -->
          <div class="flex-shrink-0 w-14 h-14 rounded-full bg-tidy-primary/10 flex items-center justify-center">
            <span class="text-xl font-bold text-tidy-primary">
              {{ authStore.user?.displayName?.charAt(0)?.toUpperCase() ?? '?' }}
            </span>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-base font-semibold text-tidy-text-primary truncate">
              {{ authStore.user?.displayName ?? '—' }}
            </p>
            <p class="text-sm text-tidy-text-muted truncate">
              {{ authStore.user?.email ?? '—' }}
            </p>
          </div>
          <!-- Badge tier -->
          <span :class="['text-xs font-medium px-2.5 py-1 rounded-full', tierBadgeClass]">
            {{ tierLabel }}
          </span>
        </div>
      </div>

      <!-- Section compte -->
      <div class="bg-white rounded-2xl shadow-sm border border-tidy-border overflow-hidden">
        <div class="px-5 py-3 border-b border-tidy-border">
          <p class="text-xs font-semibold uppercase tracking-wider text-tidy-text-muted">Compte</p>
        </div>
        <button
          class="w-full flex items-center gap-3 px-5 py-4 hover:bg-tidy-surface transition-colors text-left"
          @click="router.push('/profile/edit')"
        >
          <svg class="w-5 h-5 text-tidy-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          <span class="text-sm text-tidy-text-primary">Modifier le profil</span>
          <svg class="w-4 h-4 text-tidy-text-muted ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <!-- Section déconnexion -->
      <div class="bg-white rounded-2xl shadow-sm border border-tidy-border overflow-hidden">
        <button
          class="w-full flex items-center gap-3 px-5 py-4 hover:bg-red-50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="isLoggingOut"
          @click="handleLogout"
        >
          <svg
            v-if="!isLoggingOut"
            class="w-5 h-5 text-red-500 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <svg
            v-else
            class="w-5 h-5 text-red-400 flex-shrink-0 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span class="text-sm font-medium text-red-500">
            {{ isLoggingOut ? 'Déconnexion…' : 'Se déconnecter' }}
          </span>
        </button>
      </div>

    </div>
  </div>
</template>
