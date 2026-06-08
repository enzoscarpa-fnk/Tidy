<script setup lang="ts">
const authStore = useAuthStore()
const router = useRouter()

const isLoggingOut = ref(false)

// ── Stats documents (depuis SQLite local) ──────────────────────────────────
const readyCount     = ref(0)
const archivedCount  = ref(0)
const isLoadingStats = ref(true)

// ── Stockage ───────────────────────────────────────────────────────────────
const localStorageBytes = ref(0)
const cloudStorageBytes = ref(0)
const isLoadingStorage  = ref(true)

const FREE_TIER_LIMIT = 30

const tierLabel = computed(() =>
  authStore.userTier === 'pro' ? 'Pro' : 'Gratuit'
)

const tierBadgeClass = computed(() =>
  authStore.userTier === 'pro'
    ? 'bg-tidy-primary/10 text-tidy-primary border border-tidy-primary/20'
    : 'bg-tidy-surface text-tidy-text-muted border border-tidy-border'
)

const isFree = computed(() => authStore.userTier !== 'pro')

const totalCount = computed(() => readyCount.value + archivedCount.value)

// ── Calcul des segments de la barre ───────────────────────────────────────

const readyPercent = computed(() => {
  if (isFree.value) {
    return Math.min((readyCount.value / FREE_TIER_LIMIT) * 100, 100)
  }
  // Pro : barre toujours pleine — répartition proportionnelle entre statuts
  if (totalCount.value === 0) return 50 // visuellement centré si vide
  return (readyCount.value / totalCount.value) * 100
})

const archivedPercent = computed(() => {
  if (isFree.value) {
    const used = Math.min(((readyCount.value + archivedCount.value) / FREE_TIER_LIMIT) * 100, 100)
    return Math.max(used - readyPercent.value, 0)
  }
  if (totalCount.value === 0) return 50
  return (archivedCount.value / totalCount.value) * 100
})

// Segment vide : uniquement pour les utilisateurs free
const emptyPercent = computed(() =>
  isFree.value ? Math.max(100 - readyPercent.value - archivedPercent.value, 0) : 0
)

// ── Formatage octets → unité lisible ──────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 o'
  if (bytes < 1_024) return `${bytes} o`
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} Ko`
  if (bytes < 1_024 * 1_024 * 1_024) return `${(bytes / 1_024 / 1_024).toFixed(1)} Mo`
  return `${(bytes / 1_024 / 1_024 / 1_024).toFixed(2)} Go`
}

// ── Chargement ─────────────────────────────────────────────────────────────

async function loadStats(): Promise<void> {
  isLoadingStats.value = true
  try {
    const db = useDatabaseService()
    // Lecture directe depuis SQLite — pas de dépendance au workspaceId
    const counts = await db.getDocumentCountByStatus()
    readyCount.value    = (counts['READY'] ?? 0) + (counts['ENRICHED'] ?? 0) + (counts['CLASSIFIED_ONLY'] ?? 0)
    archivedCount.value = counts['ARCHIVED'] ?? 0
  } catch {
    // Non bloquant
  } finally {
    isLoadingStats.value = false
  }
}

async function loadStorageStats(): Promise<void> {
  isLoadingStorage.value = true
  try {
    const db = useDatabaseService()
    localStorageBytes.value = await db.getTotalLocalStorageBytes()

    // Stockage cloud : tentative best-effort, reste à 0 si l'endpoint n'existe pas
    try {
      const { request } = useTidyApi()
      const statsRes = await request<{ data: { cloudStorageBytes: number } }>('/me/stats')
      cloudStorageBytes.value = statsRes?.data?.cloudStorageBytes ?? 0
    } catch {
      cloudStorageBytes.value = 0
    }
  } catch {
    localStorageBytes.value = 0
    cloudStorageBytes.value = 0
  } finally {
    isLoadingStorage.value = false
  }
}

async function handleLogout(): Promise<void> {
  isLoggingOut.value = true
  try {
    await authStore.logout()
    await router.replace('/auth/login')
  } finally {
    isLoggingOut.value = false
  }
}

onMounted(() => {
  loadStats()
  loadStorageStats()
})
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
          <span :class="['text-xs font-medium px-2.5 py-1 rounded-full', tierBadgeClass]">
            {{ tierLabel }}
          </span>
        </div>
      </div>

      <!-- ── Carte utilisation ────────────────────────────────────────── -->
      <div class="bg-white rounded-2xl px-5 py-4 shadow-sm border border-tidy-border">

        <!-- Skeleton -->
        <template v-if="isLoadingStats">
          <div class="animate-pulse space-y-3">
            <div class="flex justify-between">
              <div class="h-3 w-20 rounded bg-tidy-surface" />
              <div class="h-3 w-24 rounded bg-tidy-surface" />
            </div>
            <div class="h-3 rounded-full bg-tidy-surface" />
            <div class="h-3 w-32 rounded bg-tidy-surface mx-auto" />
            <div class="flex justify-center gap-6">
              <div class="h-3 w-16 rounded bg-tidy-surface" />
              <div class="h-3 w-16 rounded bg-tidy-surface" />
            </div>
          </div>
        </template>

        <template v-else>
          <!-- En-tête -->
          <div class="flex items-center justify-between mb-3">
            <p class="text-xs font-semibold uppercase tracking-wider text-tidy-text-muted">
              Utilisation
            </p>
            <p class="text-xs text-tidy-text-muted">
              <template v-if="isFree">
                {{ totalCount }} / {{ FREE_TIER_LIMIT }} documents
              </template>
              <template v-else>
                {{ totalCount }} document{{ totalCount !== 1 ? 's' : '' }}
              </template>
            </p>
          </div>

          <!-- Barre style iPhone -->
          <div
            class="h-3 w-full rounded-full overflow-hidden flex"
            style="background-color: #1c1c1e;"
            role="img"
            :aria-label="`${readyCount} documents prêts, ${archivedCount} archivés`"
          >
            <!-- READY : vert iOS -->
            <div
              v-if="readyPercent > 0"
              class="h-full transition-all duration-700 ease-out"
              :style="{ width: `${readyPercent}%`, backgroundColor: '#34c759' }"
            />
            <!-- Séparateur 1px entre segments -->
            <div
              v-if="readyPercent > 0 && archivedPercent > 0"
              class="h-full w-px flex-shrink-0"
              style="background-color: rgba(255,255,255,0.25)"
            />
            <!-- ARCHIVED : gris iOS -->
            <div
              v-if="archivedPercent > 0"
              class="h-full transition-all duration-700 ease-out"
              :style="{ width: `${archivedPercent}%`, backgroundColor: '#8e8e93' }"
            />
            <!-- Pro sans documents : remplissage neutre -->
            <div
              v-if="!isFree && totalCount === 0"
              class="h-full flex-1"
              style="background-color: #3a3a3c"
            />
          </div>

          <!-- Stockage local + cloud -->
          <div class="flex items-center justify-center gap-4 mt-3">
            <template v-if="isLoadingStorage">
              <div class="animate-pulse h-3 w-28 rounded bg-tidy-surface" />
            </template>
            <template v-else>
              <!-- Local -->
              <span class="flex items-center gap-1 text-xs text-tidy-text-muted">
                <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                {{ formatBytes(localStorageBytes) }}
              </span>
              <span class="text-tidy-border text-xs" aria-hidden="true">·</span>
              <!-- Cloud -->
              <span class="flex items-center gap-1 text-xs text-tidy-text-muted">
                <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
                {{ formatBytes(cloudStorageBytes) }}
              </span>
            </template>
          </div>

          <!-- Légende -->
          <div class="flex items-center justify-center gap-5 mt-3">
            <div class="flex items-center gap-1.5">
              <span class="block h-2.5 w-2.5 rounded-full flex-shrink-0" style="background-color: #34c759" aria-hidden="true" />
              <span class="text-xs text-tidy-text-secondary">
                {{ readyCount }} prêt{{ readyCount !== 1 ? 's' : '' }}
              </span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="block h-2.5 w-2.5 rounded-full flex-shrink-0" style="background-color: #8e8e93" aria-hidden="true" />
              <span class="text-xs text-tidy-text-secondary">
                {{ archivedCount }} archivé{{ archivedCount !== 1 ? 's' : '' }}
              </span>
            </div>
          </div>
        </template>
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
      <div class="bg-white rounded-2xl shadow-sm border border-tidy-border overflow-hidden mb-8">
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
