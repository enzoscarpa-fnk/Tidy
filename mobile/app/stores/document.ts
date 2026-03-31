import type {
  ApiResponse,
  DocumentDetail,
  DocumentFilters,
  DocumentListItem,
  PaginationMeta,
  UpdateDocumentMetadataPayload,
} from '~/types/api'
import { POLLING_STATUSES } from '~/types/api'

export const useDocumentStore = defineStore('document', () => {
  // ── State ──────────────────────────────────────────────────────────────

  const documents = ref<DocumentListItem[]>([])
  const currentDocument = ref<DocumentDetail | null>(null)
  const isLoading = ref(false)
  const isLoadingDetail = ref(false)
  const error = ref<string | null>(null)
  const errorDetail = ref<string | null>(null)
  const pagination = ref<PaginationMeta | null>(null)

  const uploadProgress = ref(0)
  const uploadStatus = ref<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const uploadError = ref<string | null>(null)

  let _lastWorkspaceId: string | null = null
  let _lastFilters: DocumentFilters = {}
  let _pollingInterval: ReturnType<typeof setInterval> | null = null

  // ── Getters ────────────────────────────────────────────────────────────

  const hasDocumentsPending = computed(() =>
    documents.value.some((d) => POLLING_STATUSES.includes(d.processingStatus))
  )

  const hasNextPage = computed(() => pagination.value?.hasNextPage ?? false)
  const currentPage = computed(() => pagination.value?.page ?? 1)

  // ── Actions liste ──────────────────────────────────────────────────────

  async function fetchDocuments(
    workspaceId: string,
    filters: DocumentFilters = {},
    append = false
  ): Promise<void> {
    const { request } = useTidyApi()

    if (!append) {
      isLoading.value = true
      error.value = null
    }

    _lastWorkspaceId = workspaceId
    _lastFilters = filters

    try {
      const qs = _buildQueryString(workspaceId, filters)
      const res = await request<ApiResponse<DocumentListItem[]>>(`/documents?${qs}`)

      if (res?.data) {
        documents.value = append ? [...documents.value, ...res.data] : res.data
        pagination.value =
          res.meta && 'page' in res.meta ? (res.meta as PaginationMeta) : null
      }
    } catch {
      if (!append) error.value = 'Impossible de charger les documents.'
    } finally {
      if (!append) isLoading.value = false
    }
  }

  async function fetchNextPage(): Promise<void> {
    if (!hasNextPage.value || isLoading.value || !_lastWorkspaceId) return
    await fetchDocuments(
      _lastWorkspaceId,
      { ..._lastFilters, page: currentPage.value + 1 },
      true
    )
  }

  // ── Actions document unique (Ticket 8.3) ───────────────────────────────

  async function fetchDocument(id: string): Promise<void> {
    const { request } = useTidyApi()
    isLoadingDetail.value = true
    errorDetail.value = null
    try {
      const res = await request<ApiResponse<DocumentDetail>>(`/documents/${id}`)
      currentDocument.value = res?.data ?? null
      if (!res?.data) errorDetail.value = 'Document introuvable.'
    } catch {
      errorDetail.value = 'Impossible de charger ce document.'
    } finally {
      isLoadingDetail.value = false
    }
  }

  async function updateDocument(
    id: string,
    payload: UpdateDocumentMetadataPayload
  ): Promise<void> {
    const { request } = useTidyApi()
    const res = await request<ApiResponse<DocumentDetail>>(`/documents/${id}`, {
      method: 'PATCH',
      body: payload,
    })
    if (res?.data) {
      currentDocument.value = res.data
      _patchListItem(res.data)
    }
  }

  async function archiveDocument(id: string): Promise<void> {
    const { request } = useTidyApi()
    const res = await request<ApiResponse<DocumentDetail>>(
      `/documents/${id}/archive`,
      { method: 'POST' }
    )
    if (res?.data) {
      currentDocument.value = res.data
      _patchListItem(res.data)
    }
  }

  async function reprocessDocument(id: string): Promise<void> {
    const { request } = useTidyApi()
    const res = await request<ApiResponse<DocumentDetail>>(
      `/documents/${id}/reprocess`,
      { method: 'POST' }
    )
    if (res?.data) {
      currentDocument.value = res.data
      _patchListItem(res.data)
      if (_lastWorkspaceId) startPolling(_lastWorkspaceId, _lastFilters)
    }
  }

  async function deleteDocument(id: string): Promise<void> {
    const { request } = useTidyApi()
    await request(`/documents/${id}`, { method: 'DELETE' })
    documents.value = documents.value.filter((d) => d.id !== id)
    if (currentDocument.value?.id === id) currentDocument.value = null
  }

  /**
   * Upload via XMLHttpRequest pour exposer la progression (progress event).
   * La validation MIME + taille est faite en amont dans UploadDropzone.
   */
  async function uploadDocument(workspaceId: string, file: File): Promise<void> {
    const authStore = useAuthStore()
    const config = useRuntimeConfig()
    const baseURL = config.public.apiBaseUrl as string

    uploadStatus.value = 'uploading'
    uploadProgress.value = 0
    uploadError.value = null

    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const formData = new FormData()
      formData.append('file', file)
      formData.append('workspaceId', workspaceId)

      xhr.upload.onprogress = (e: ProgressEvent) => {
        if (e.lengthComputable) {
          uploadProgress.value = Math.round((e.loaded / e.total) * 100)
        }
      }

      xhr.onload = () => {
        if (xhr.status === 201) {
          uploadStatus.value = 'success'
          uploadProgress.value = 100
          resolve()
        } else {
          const msg =
            xhr.status === 413
              ? 'Fichier trop volumineux pour le serveur.'
              : xhr.status === 422
                ? 'Format de fichier non accepté.'
                : "Une erreur est survenue lors de l'envoi."
          uploadStatus.value = 'error'
          uploadError.value = msg
          reject(new Error(msg))
        }
      }

      xhr.onerror = () => {
        uploadStatus.value = 'error'
        uploadError.value =
          'Impossible de se connecter au serveur. Vérifiez votre connexion.'
        reject(new Error('Network error'))
      }

      xhr.open('POST', `${baseURL}/documents`)
      if (authStore.accessToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${authStore.accessToken}`)
      }
      xhr.send(formData)
    })
  }

  function resetUpload(): void {
    uploadStatus.value = 'idle'
    uploadProgress.value = 0
    uploadError.value = null
  }

  // ── Polling ────────────────────────────────────────────────────────────

  function startPolling(workspaceId: string, filters: DocumentFilters = {}): void {
    if (_pollingInterval) return
    _pollingInterval = setInterval(async () => {
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

  async function _silentPoll(
    workspaceId: string,
    filters: DocumentFilters = {}
  ): Promise<void> {
    const { request } = useTidyApi()
    try {
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
      // Polling silencieux — jamais d'erreur remontée à l'UI
    }
  }

  function _patchDocuments(freshList: DocumentListItem[]): void {
    const freshMap = new Map(freshList.map((d) => [d.id, d]))
    documents.value = documents.value.map((doc) => {
      const fresh = freshMap.get(doc.id)
      if (!fresh) return doc
      return fresh.updatedAt !== doc.updatedAt ? fresh : doc
    })
    const existingIds = new Set(documents.value.map((d) => d.id))
    const newDocs = freshList.filter((d) => !existingIds.has(d.id))
    if (newDocs.length > 0) documents.value = [...newDocs, ...documents.value]
  }

  function _patchListItem(updated: DocumentListItem): void {
    const idx = documents.value.findIndex((d) => d.id === updated.id)
    if (idx !== -1) documents.value[idx] = updated
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  function _buildQueryString(workspaceId: string, filters: DocumentFilters): string {
    const params = new URLSearchParams({ workspaceId })
    if (filters.query)     params.set('query', filters.query)
    if (filters.page)      params.set('page', String(filters.page))
    if (filters.limit)     params.set('limit', String(filters.limit))
    if (filters.sortBy)    params.set('sortBy', filters.sortBy)
    if (filters.sortOrder) params.set('sortOrder', filters.sortOrder)
    if (filters.dateFrom)  params.set('dateFrom', filters.dateFrom)
    if (filters.dateTo)    params.set('dateTo', filters.dateTo)

    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status]
      params.set('status', statuses.join(','))
    }
    if (filters.detectedType) {
      const types = Array.isArray(filters.detectedType)
        ? filters.detectedType
        : [filters.detectedType]
      params.set('detectedType', types.join(','))
    }
    if (filters.userTags?.length) params.set('userTags', filters.userTags.join(','))
    return params.toString()
  }

  function reset(): void {
    stopPolling()
    documents.value = []
    currentDocument.value = null
    isLoading.value = false
    isLoadingDetail.value = false
    error.value = null
    errorDetail.value = null
    pagination.value = null
    _lastWorkspaceId = null
    _lastFilters = {}
    resetUpload()
  }

  return {
    // State
    documents,
    currentDocument,
    isLoading,
    isLoadingDetail,
    error,
    errorDetail,
    pagination,
    uploadProgress,
    uploadStatus,
    uploadError,
    // Getters
    hasDocumentsPending,
    hasNextPage,
    currentPage,
    // Actions
    fetchDocuments,
    fetchNextPage,
    fetchDocument,
    updateDocument,
    archiveDocument,
    reprocessDocument,
    deleteDocument,
    uploadDocument,
    resetUpload,
    startPolling,
    stopPolling,
    reset,
  }
})
