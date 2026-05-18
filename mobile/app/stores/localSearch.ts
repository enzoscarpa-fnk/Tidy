// Store Pinia de recherche locale offline.
// Utilise useLocalDocumentRepository.searchDocuments() via FTS5 SQLite.
// Activé en fallback quand @capacitor/network indique offline.
// En mode online, c'est useSearchStore (Phase 9) qui prend le relais.

import type { DocumentListItem, DocumentFilters } from '~/types/api'

export const useLocalSearchStore = defineStore('localSearch', () => {
  // ── State ──────────────────────────────────────────────────────────────

  const results = ref<DocumentListItem[]>([])
  const query = ref('')
  const filters = ref<Pick<DocumentFilters, 'status' | 'detectedType' | 'userTags'>>({})
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // ── Getters ────────────────────────────────────────────────────────────

  const hasResults = computed(() => results.value.length > 0)
  const isEmpty = computed(() => !isLoading.value && query.value.length > 0 && results.value.length === 0)

  // ── Actions ────────────────────────────────────────────────────────────

  /**
   * Recherche offline via FTS5 SQLite.
   * Appelé uniquement quand @capacitor/network retourne isConnected = false.
   */
  async function searchOffline(
    workspaceId: string,
    searchQuery: string,
    searchFilters: Pick<DocumentFilters, 'status' | 'detectedType' | 'userTags'> = {}
  ): Promise<void> {
    const trimmed = searchQuery.trim()
    if (!trimmed) {
      clearSearch()
      return
    }

    query.value = trimmed
    filters.value = searchFilters
    isLoading.value = true
    error.value = null

    try {
      const repo = useLocalDocumentRepository()

      // Étape 1 : recherche FTS5 sur le texte
      let ftsResults = await repo.searchDocuments(workspaceId, trimmed)

      // Étape 2 : appliquer les filtres post-FTS en mémoire
      // (SQLite FTS5 ne supporte pas les WHERE composites sur la table virtuelle)
      if (searchFilters.status) {
        const statuses = Array.isArray(searchFilters.status)
          ? searchFilters.status
          : [searchFilters.status]
        ftsResults = ftsResults.filter((d) =>
          statuses.includes(d.processingStatus)
        )
      }

      if (searchFilters.detectedType) {
        const types = Array.isArray(searchFilters.detectedType)
          ? searchFilters.detectedType
          : [searchFilters.detectedType]
        ftsResults = ftsResults.filter((d) =>
          d.intelligence && types.includes(d.intelligence.detectedType)
        )
      }

      if (searchFilters.userTags?.length) {
        ftsResults = ftsResults.filter((d) =>
          searchFilters.userTags!.every((tag) =>
            d.metadata?.userTags.includes(tag)
          )
        )
      }

      results.value = ftsResults
    } catch (err) {
      error.value = 'Recherche locale indisponible.'
      console.error('[LocalSearch] Erreur FTS5 :', err)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Réinitialise l'état de recherche.
   */
  function clearSearch(): void {
    results.value = []
    query.value = ''
    filters.value = {}
    error.value = null
    isLoading.value = false
  }

  /**
   * Met à jour un filtre individuel sans relancer la recherche.
   * La recherche doit être relancée manuellement après setFilter().
   */
  function setFilter<K extends keyof typeof filters.value>(
    key: K,
    value: typeof filters.value[K]
  ): void {
    filters.value[key] = value
  }

  return {
    // State
    results,
    query,
    filters,
    isLoading,
    error,
    // Getters
    hasResults,
    isEmpty,
    // Actions
    searchOffline,
    clearSearch,
    setFilter,
  }
})
