import type {
  ApiResponse,
  DocumentFilters,
  DocumentListItem,
  PaginationMeta,
} from '~/types/api'
import { POLLING_STATUSES } from '~/types/api'

export const useDocumentStore = defineStore('document', () => {
  // ── State ──────────────────────────────────────────────────────────────

  const documents = ref<DocumentListItem[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const pagination = ref<PaginationMeta | null>(null)

  // Ref interne au dernier [workspaceId] + filters utilisés (pour le polling)
  let _lastWorkspaceId: string | null = null
  let _lastFilters: DocumentFilters = {}
  let _pollingInterval: ReturnType<typeof setInterval> | null = null

  // ── Getters ────────────────────────────────────────────────────────────

  /**
   * Vrai si au moins un document est dans un statut instable.
   * Utilisé par startPolling pour décider d'arrêter le poll automatiquement.
   */
  const hasDocumentsPending = computed(() =>
    documents.value.some((d) => POLLING_STATUSES.includes(d.processingStatus))
  )

  const hasNextPage = computed(() => pagination.value?.hasNextPage ?? false)

  const currentPage = computed(() => pagination.value?.page ?? 1)

  // ── Action principale : fetch liste ───────────────────────────────────

  /**
   * @param workspaceId  Obligatoire — règle de traversée du domaine
   * @param filters      Filtres + pagination optionnels
   * @param append       true = infinite scroll (page suivante), false = reset liste
   */
  async function fetchDocuments(
    workspaceId: string,
    filters: DocumentFilters = {},
    append = false
  ): Promise<void> {
    const { request } = useTidyApi()

    // On ne mute isLoading que pour le chargement initial (pas pour l'infinite scroll)
    if (!append) {
      isLoading.value = true
      error.value = null
    }

    // Mémoriser pour le polling silencieux
    _lastWorkspaceId = workspaceId
    _lastFilters = filters

    try {
      const qs = _buildQueryString(workspaceId, filters)
      const res = await request<ApiResponse<DocumentListItem[]>>(`/documents?${qs}`)

      if (res?.data) {
        documents.value = append
          ? [...documents.value, ...res.data]
          : res.data

        pagination.value = (res.meta && 'page' in res.meta)
          ? (res.meta as PaginationMeta)
          : null
      }
    } catch {
      if (!append) {
        error.value = 'Impossible de charger les documents.'
      }
    } finally {
      if (!append) {
        isLoading.value = false
      }
    }
  }

  // ── Infinite scroll : page suivante ───────────────────────────────────

  async function fetchNextPage(): Promise<void> {
    if (!hasNextPage.value || isLoading.value || !_lastWorkspaceId) return
    const nextPage = currentPage.value + 1
    await fetchDocuments(
      _lastWorkspaceId,
      { ..._lastFilters, page: nextPage },
      true // append mode
    )
  }

  // ── Polling ────────────────────────────────────────────────────────────

  /**
   * Démarre un poll toutes les 5s si des documents sont en traitement.
   * S'arrête automatiquement quand plus aucun document n'est instable.
   * Appel idempotent : n'ouvre pas deux intervalles.
   *
   * NOTE Phase 7 → Phase 10 :
   * Actuellement, le poll appelle l'API réseau.
   * En Phase 10, il sera remplacé par une lecture SQLite locale (0 réseau).
   * L'interface publique (startPolling/stopPolling) ne change pas.
   */
  function startPolling(workspaceId: string, filters: DocumentFilters = {}): void {
    if (_pollingInterval) return

    _pollingInterval = setInterval(async () => {
      // Auto-stop si plus rien à suivre
      if (!hasDocumentsPending.value) {
        stopPolling()
        return
      }
      await _silentPoll(workspaceId, filters)
    }, 5_000)
  }

  function stopPolling(): void {
    if (_pollingInterval) {
      clearInterval(_pollingInterval)
      _pollingInterval = null
    }
  }

  // ── Poll silencieux (ne touche pas isLoading — UX Flow §5) ────────────

  async function _silentPoll(
    workspaceId: string,
    filters: DocumentFilters = {}
  ): Promise<void> {
    const { request } = useTidyApi()
    try {
      // Récupérer autant de docs que la liste actuelle (au minimum 30)
      const limit = Math.max(documents.value.length, 30)
      const qs = _buildQueryString(workspaceId, { ...filters, page: 1, limit })
      const res = await request<ApiResponse<DocumentListItem[]>>(`/documents?${qs}`)

      if (res?.data) {
        _patchDocuments(res.data)
        if (res.meta && 'page' in res.meta) {
          pagination.value = res.meta as PaginationMeta
        }
      }
    } catch {
      // Polling silencieux — jamais d'erreur remontée à l'UI (UX Flow §5)
    }
  }

  /**
   * Patch ciblé : ne remplace que les documents dont le statut a changé.
   * Ne retire JAMAIS un document de la liste via le poll (UX Flow §5).
   * Insère en tête les documents nouvellement créés.
   */
  function _patchDocuments(freshList: DocumentListItem[]): void {
    const freshMap = new Map(freshList.map((d) => [d.id, d]))

    // Mise à jour ciblée des documents existants
    documents.value = documents.value.map((doc) => {
      const fresh = freshMap.get(doc.id)
      if (!fresh) return doc
      // Remplacer uniquement si le statut ou les données ont changé
      return fresh.updatedAt !== doc.updatedAt ? fresh : doc
    })

    // Insérer en tête les documents absents de la liste locale
    // (créés sur un autre appareil et remontés par la sync)
    const existingIds = new Set(documents.value.map((d) => d.id))
    const newDocs = freshList.filter((d) => !existingIds.has(d.id))
    if (newDocs.length > 0) {
      documents.value = [...newDocs, ...documents.value]
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  function _buildQueryString(workspaceId: string, filters: DocumentFilters): string {
    const params = new URLSearchParams({ workspaceId })

    if (filters.query)      params.set('query', filters.query)
    if (filters.page)       params.set('page', String(filters.page))
    if (filters.limit)      params.set('limit', String(filters.limit))
    if (filters.sortBy)     params.set('sortBy', filters.sortBy)
    if (filters.sortOrder)  params.set('sortOrder', filters.sortOrder)
    if (filters.dateFrom)   params.set('dateFrom', filters.dateFrom)
    if (filters.dateTo)     params.set('dateTo', filters.dateTo)

    if (filters.status) {
      const statuses = Array.isArray(filters.status)
        ? filters.status
        : [filters.status]
      params.set('status', statuses.join(','))
    }

    if (filters.detectedType) {
      const types = Array.isArray(filters.detectedType)
        ? filters.detectedType
        : [filters.detectedType]
      params.set('detectedType', types.join(','))
    }

    if (filters.userTags?.length) {
      params.set('userTags', filters.userTags.join(','))
    }

    return params.toString()
  }

  /**
   * Reset complet — appeler lors d'un changement de workspace.
   * Stoppe le polling avant de vider la liste.
   */
  function reset(): void {
    stopPolling()
    documents.value = []
    isLoading.value = false
    error.value = null
    pagination.value = null
    _lastWorkspaceId = null
    _lastFilters = {}
  }

  return {
    // State
    documents,
    isLoading,
    error,
    pagination,
    // Getters
    hasDocumentsPending,
    hasNextPage,
    currentPage,
    // Actions
    fetchDocuments,
    fetchNextPage,
    startPolling,
    stopPolling,
    reset,
  }
})
