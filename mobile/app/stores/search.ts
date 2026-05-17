import type {
  ApiResponse,
  DetectedType,
  DocumentListItem,
  PaginationMeta,
} from '~/types/api'
import { DETECTED_TYPE_LABELS } from '~/types/api'

// ── Types ──────────────────────────────────────────────────────────────────

export interface SearchFilters {
  types: DetectedType[]
  tags: string[]
  dateRange: 'month' | 'quarter' | 'year' | null
}

/**
 * DocumentListItem étendu avec l'extrait surligné retourné par ts_headline.
 * Le champ headline peut contenir des balises <b> générées par PostgreSQL.
 */
export interface SearchResultItem extends DocumentListItem {
  headline?: string | null
}

// ── Store ──────────────────────────────────────────────────────────────────

export const useSearchStore = defineStore('search', () => {
  // ── State ────────────────────────────────────────────────────────────────

  const query = ref<string>('')
  const filters = ref<SearchFilters>({ types: [], tags: [], dateRange: null })
  const results = ref<SearchResultItem[]>([])
  const isLoading = ref<boolean>(false)
  const error = ref<string | null>(null)
  const resultCount = ref<number>(0)
  const hasSearched = ref<boolean>(false)

  // ── Computed ─────────────────────────────────────────────────────────────

  const hasActiveFilters = computed<boolean>(
    () =>
      filters.value.types.length > 0 ||
      filters.value.tags.length > 0 ||
      filters.value.dateRange !== null
  )

  const allAvailableTypes = computed<DetectedType[]>(
    () => Object.keys(DETECTED_TYPE_LABELS) as DetectedType[]
  )

  // ── Actions ──────────────────────────────────────────────────────────────

  async function search(
    workspaceId: string,
    searchQuery: string,
    searchFilters?: Partial<SearchFilters>
  ): Promise<void> {
    const { request } = useTidyApi()

    query.value = searchQuery

    if (searchFilters) {
      filters.value = { ...filters.value, ...searchFilters }
    }

    isLoading.value = true
    error.value = null
    hasSearched.value = true

    try {
      const params = new URLSearchParams({ workspaceId })

      const trimmed = searchQuery.trim()
      if (trimmed) params.set('q', trimmed)

      if (filters.value.types.length) {
        params.set('detectedType', filters.value.types.join(','))
      }
      if (filters.value.tags.length) {
        params.set('userTags', filters.value.tags.join(','))
      }

      const res = await request<ApiResponse<SearchResultItem[]>>(
        `/documents/search?${params.toString()}`
      )

      if (res?.data) {
        results.value = res.data
        resultCount.value =
          res.meta && 'total' in res.meta
            ? (res.meta as PaginationMeta).total
            : res.data.length
      } else {
        results.value = []
        resultCount.value = 0
      }
    } catch {
      error.value = 'Impossible d\'effectuer la recherche.'
      results.value = []
      resultCount.value = 0
    } finally {
      isLoading.value = false
    }
  }

  function setFilter<K extends keyof SearchFilters>(
    key: K,
    value: SearchFilters[K]
  ): void {
    filters.value = { ...filters.value, [key]: value }
  }

  function clearFilters(): void {
    filters.value = { types: [], tags: [], dateRange: null }
  }

  function clearSearch(): void {
    query.value = ''
    results.value = []
    error.value = null
    resultCount.value = 0
    hasSearched.value = false
    clearFilters()
  }

  // ── Helpers privés ────────────────────────────────────────────────────────

  function _resolveDateRange(range: SearchFilters['dateRange']): {
    dateFrom?: string
    dateTo?: string
  } {
    if (!range) return {}
    const now = new Date()
    const dateTo = now.toISOString()
    const dateFrom = new Date(now)
    if (range === 'month') dateFrom.setMonth(dateFrom.getMonth() - 1)
    else if (range === 'quarter') dateFrom.setMonth(dateFrom.getMonth() - 3)
    else if (range === 'year') dateFrom.setFullYear(dateFrom.getFullYear() - 1)
    return { dateFrom: dateFrom.toISOString(), dateTo }
  }

  return {
    // State
    query,
    filters,
    results,
    isLoading,
    error,
    resultCount,
    hasSearched,
    // Computed
    hasActiveFilters,
    allAvailableTypes,
    // Actions
    search,
    setFilter,
    clearFilters,
    clearSearch,
  }
})
