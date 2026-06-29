<script setup lang="ts">
const authStore   = useAuthStore()
const router      = useRouter()
const { request } = useTidyApi()

const isLoggingOut      = ref(false)
const docCount          = ref(0)
const archivedCount     = ref(0)
const isLoadingStats    = ref(true)
const localStorageBytes = ref(0)
const isLoadingStorage  = ref(true)

const FREE_TIER_LIMIT = 30
const isPro      = computed(() => authStore.userTier === 'pro')
const tierLabel  = computed(() => isPro.value ? 'Premium' : 'Gratuit')
const totalCount = computed(() => docCount.value + archivedCount.value)

const docPercent = computed(() => {
  if (!isPro.value) return Math.min((docCount.value / FREE_TIER_LIMIT) * 100, 100)
  if (totalCount.value === 0) return 50
  return (docCount.value / totalCount.value) * 100
})
const archivedPercent = computed(() => {
  if (!isPro.value) return Math.min((archivedCount.value / FREE_TIER_LIMIT) * 100, 100)
  if (totalCount.value === 0) return 50
  return (archivedCount.value / totalCount.value) * 100
})

function pieArc(angleDeg: number): string {
  if (angleDeg <= 0) return ''
  if (angleDeg >= 360) return 'M 16 16 m -14 0 a 14 14 0 1 1 28 0 a 14 14 0 1 1 -28 0'
  const rad = (angleDeg - 90) * (Math.PI / 180)
  const x   = 16 + 14 * Math.cos(rad)
  const y   = 16 + 14 * Math.sin(rad)
  return `M 16 16 L 16 2 A 14 14 0 ${angleDeg > 180 ? 1 : 0} 1 ${x} ${y} Z`
}
const pieAngle = computed(() =>
  totalCount.value === 0 ? 0 : (docCount.value / totalCount.value) * 360
)

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 o'
  if (bytes < 1_024)          return `${bytes} o`
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} Ko`
  if (bytes < 1_024 ** 3)    return `${(bytes / 1_024 / 1_024).toFixed(1)} Mo`
  return `${(bytes / 1_024 ** 3).toFixed(2)} Go`
}

// ── Stats cloud depuis l'API (PostgreSQL = source de vérité) ───────────────
async function loadStats(): Promise<void> {
  isLoadingStats.value = true
  try {
    const res = await request<{
      data: { cloudStorageBytes: number; totalCount: number; archivedCount: number }
    }>('/me/stats')
    if (res?.data) {
      archivedCount.value = res.data.archivedCount ?? 0
      docCount.value      = Math.max(0, (res.data.totalCount ?? 0) - archivedCount.value)
    }
  } catch { /* non bloquant */ }
  finally { isLoadingStats.value = false }
}

// ── Stockage local depuis SQLite ──────────────────────────────────────────
// IMPORTANT : on utilise directement le composable useDatabaseService
// qui expose getTotalLocalStorageBytes() lisant via _getDb().query()
// (connexion ouverte), PAS via CapacitorSQLite.query() (API statique).
async function loadStorageStats(): Promise<void> {
  isLoadingStorage.value = true
  try {
    const db = useDatabaseService()
    // getTotalLocalStorageBytes() : SUM(file_size_bytes) WHERE is_deleted = 0
    const bytes = await db.getTotalLocalStorageBytes()
    localStorageBytes.value = bytes ?? 0
  } catch {
    localStorageBytes.value = 0
  } finally {
    isLoadingStorage.value = false
  }
}

async function handleLogout(): Promise<void> {
  isLoggingOut.value = true
  try { await authStore.logout(); await router.replace('/auth/login') }
  finally { isLoggingOut.value = false }
}

onMounted(() => { loadStats(); loadStorageStats() })
</script>

<template>
  <SwipeBack>
    <div class="flex h-full flex-col overflow-hidden bg-tidy-surface">

      <!-- Header -->
      <header class="flex-shrink-0 flex items-center gap-3 px-4 pt-4 pb-2 border-b border-white/10"
              style="background-color: rgba(13,13,20,0.96);">
        <button class="flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/10 transition-colors"
                aria-label="Retour" @click="router.back()">
          <svg class="w-5 h-5 text-tidy-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 class="text-base font-semibold text-tidy-text-primary">Mon profil</h1>
      </header>

      <div class="scroll-area flex-1 overflow-y-auto px-4 py-3 space-y-3">

        <!-- ── Bloc identité + utilisation fusionnés ─────────────────────── -->
        <div class="neo-card-light p-4 space-y-4">

          <!-- Identité -->
          <div class="flex items-center gap-3">
            <div class="flex-shrink-0 w-12 h-12 rounded-full bg-tidy-mauve/25 flex items-center justify-center">
            <span class="text-lg font-bold text-tidy-mauve">
              {{ authStore.user?.displayName?.charAt(0)?.toUpperCase() ?? '?' }}
            </span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold text-tidy-text-primary truncate">
                {{ authStore.user?.displayName ?? '—' }}
              </p>
              <p class="text-xs text-tidy-text-secondary truncate">
                {{ authStore.user?.email ?? '—' }}
              </p>
            </div>
            <span class="text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0"
                  :class="isPro
              ? 'bg-tidy-orange/20 text-tidy-orange'
              : 'bg-tidy-mauve/20 text-tidy-mauve'">
            {{ tierLabel }}
          </span>
          </div>

          <!-- Séparateur -->
          <div class="h-px bg-white/[0.06]" aria-hidden="true" />

          <!-- Utilisation -->
          <template v-if="isLoadingStats || isLoadingStorage">
            <div class="animate-pulse space-y-2">
              <div class="h-3 w-24 rounded-full bg-white/8" />
              <div class="h-3 rounded-full bg-white/8" />
            </div>
          </template>
          <template v-else>
            <div>
              <!-- Titre même style que les labels de section -->
              <div class="flex items-center justify-between mb-2">
                <p class="text-xs font-semibold uppercase tracking-wider text-tidy-text-secondary">
                  Utilisation
                </p>
                <p class="text-xs text-tidy-text-secondary">
                  <template v-if="!isPro">{{ totalCount }} / {{ FREE_TIER_LIMIT }} docs</template>
                  <template v-else>{{ docCount }} docs, {{ archivedCount }} archivés</template>
                </p>
              </div>

              <!--
                Barre neomorphism :
                padding p-1 (4px) pour un espace visible autour de la barre de remplissage
              -->
              <div class="neo-bar-track rounded-full p-1 mb-3"
                   role="img" :aria-label="`${docCount} documents, ${archivedCount} archivés`">
                <div class="h-2 w-full rounded-full overflow-hidden flex">
                  <!-- Segment docs — orange, coin droit carré si archivés présents -->
                  <div
                    v-if="docPercent > 0"
                    class="neo-bar-fill h-full transition-all duration-700 ease-out"
                    :style="{
                    width: `${docPercent}%`,
                    backgroundColor: '#F97316',
                    borderRadius: archivedPercent > 0 ? '9999px 0 0 9999px' : '9999px',
                  }"
                  />
                  <!-- Segment archivés — gris, coin gauche carré -->
                  <div
                    v-if="archivedPercent > 0"
                    class="neo-bar-fill h-full transition-all duration-700 ease-out"
                    :style="{
                    width: `${archivedPercent}%`,
                    backgroundColor: '#b0b0b8',
                    borderRadius: '0 9999px 9999px 0',
                  }"
                  />
                  <div v-if="isPro && totalCount === 0" class="h-full flex-1 rounded-full" style="background-color: #1a1a2e" />
                </div>
              </div>

              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="flex items-center gap-1.5">
                  <span class="neo-dot-track flex items-center justify-center h-4 w-4 rounded-full flex-shrink-0">
                    <span class="neo-dot block h-2 w-2 rounded-full" style="background-color: #F97316" />
                  </span>
                    <span class="text-xs text-tidy-text-secondary">
                    {{ docCount }} doc{{ docCount !== 1 ? 's' : '' }}
                  </span>
                  </div>
                  <div class="flex items-center gap-1.5">
                  <span class="neo-dot-track flex items-center justify-center h-4 w-4 rounded-full flex-shrink-0">
                    <span class="neo-dot block h-2 w-2 rounded-full" style="background-color: #b0b0b8" />
                  </span>
                    <span class="text-xs text-tidy-text-secondary">
                    {{ archivedCount }} archivé{{ archivedCount !== 1 ? 's' : '' }}
                  </span>
                  </div>
                </div>
                <div class="flex items-center gap-1.5">
                  <!-- Icône stockage — 3 disques durs empilés, style fill orange -->
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"
                       aria-hidden="true" class="flex-shrink-0 text-tidy-orange">
                    <path d="M4 20h16c1.1 0 2-.9 2-2s-.9-2-2-2H4c-1.1 0-2 .9-2 2s.9 2 2 2m0-3h2v2H4zM2 6c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2s-.9-2-2-2H4c-1.1 0-2 .9-2 2m4 1H4V5h2zm-2 7h16c1.1 0 2-.9 2-2s-.9-2-2-2H4c-1.1 0-2 .9-2 2s.9 2 2 2m0-3h2v2H4z"/>
                  </svg>
                  <span class="text-xs text-tidy-text-secondary">
                  {{ formatBytes(localStorageBytes) }}
                </span>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- ── Carte Compte — glass-panel, boutons style action-pill ─────── -->
        <div class="glass-panel p-4 space-y-3">
          <!-- Titre même style que "Utilisation" -->
          <p class="px-1 pb-1 text-xs font-semibold uppercase tracking-wider text-tidy-text-secondary">
            Compte
          </p>

          <!-- Modifier le profil — style action-pill (comme document details) -->
          <button
            class="action-pill w-full justify-between py-3.5"
            @click="router.push('/profile/edit')"
          >
            <div class="flex items-center gap-2">
              <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              <span class="text-sm">Modifier le profil</span>
            </div>
            <svg class="w-4 h-4 text-tidy-text-tertiary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <!-- Se déconnecter — style action-pill danger -->
          <button
            class="action-pill-danger w-full justify-between py-3.5 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="isLoggingOut"
            @click="handleLogout"
          >
            <div class="flex items-center gap-2">
              <svg v-if="!isLoggingOut" class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <svg v-else class="w-4 h-4 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span class="text-sm font-medium">{{ isLoggingOut ? 'Déconnexion…' : 'Se déconnecter' }}</span>
            </div>
          </button>
        </div>

      </div>
    </div>
  </SwipeBack>
</template>

<style scoped>
/* Bloc identité+utilisation — neomorphism fond clair */
.neo-card-light {
  border-radius: 1.5rem;
  background-color: #141424;
  box-shadow:
    inset 2px 2px 6px rgba(0, 0, 0, 0.55),
    inset -1px -1px 4px rgba(255, 255, 255, 0.06);
}

/* Piste de barre creusée — p-1 donne l'espace autour de la barre */
.neo-bar-track {
  background-color: #08080f;
  box-shadow:
    inset 2px 2px 5px rgba(0, 0, 0, 0.85),
    inset -1px -1px 3px rgba(255, 255, 255, 0.04);
}

/* Segments en léger relief */
.neo-bar-fill {
  box-shadow: 0 1px 4px rgba(0,0,0,0.4), 0 0 5px rgba(255,255,255,0.06);
  border-radius: 9999px;
}

/* Anneau creusé */
.neo-dot-track {
  background-color: #08080f;
  box-shadow:
    inset 1px 1px 3px rgba(0, 0, 0, 0.85),
    inset -1px -1px 2px rgba(255, 255, 255, 0.04);
}

/* Point en relief */
.neo-dot {
  box-shadow: 0 1px 3px rgba(0,0,0,0.6), 0 0 4px rgba(255,255,255,0.1);
}
</style>
