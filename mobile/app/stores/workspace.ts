import type {
  ApiResponse,
  CreateWorkspacePayload,
  UpdateWorkspacePayload,
  Workspace,
} from '~/types/api'

export const useWorkspaceStore = defineStore('workspace', () => {
  // ── State ──────────────────────────────────────────────────────────────

  const workspaces = ref<Workspace[]>([])
  const currentWorkspaceId = ref<string | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // ── Getters ────────────────────────────────────────────────────────────

  const currentWorkspace = computed(
    () => workspaces.value.find((w) => w.id === currentWorkspaceId.value) ?? null
  )

  const activeWorkspaces = computed(
    () => workspaces.value.filter((w) => !w.isArchived)
  )

  // ── Actions ────────────────────────────────────────────────────────────

  async function fetchWorkspaces(): Promise<void> {
    const { request } = useTidyApi()
    isLoading.value = true
    error.value = null
    try {
      const res = await request<ApiResponse<Workspace[]>>('/workspaces')
      if (res?.data) workspaces.value = res.data
    } catch {
      error.value = 'Impossible de charger les espaces de travail.'
    } finally {
      isLoading.value = false
    }
  }

  async function createWorkspace(payload: CreateWorkspacePayload): Promise<Workspace | null> {
    const { request } = useTidyApi()
    error.value = null
    try {
      const res = await request<ApiResponse<Workspace>>('/workspaces', {
        method: 'POST',
        body: payload,
      })
      if (res?.data) {
        // Insérer en tête de liste — le plus récent en premier
        workspaces.value = [res.data, ...workspaces.value]
        return res.data
      }
      return null
    } catch (err: unknown) {
      const fetchErr = err as { data?: ApiResponse<null> }
      error.value =
        fetchErr?.data?.error?.message ?? 'Impossible de créer l\'espace de travail.'
      throw err
    }
  }

  async function updateWorkspace(
    id: string,
    payload: UpdateWorkspacePayload
  ): Promise<Workspace | null> {
    const { request } = useTidyApi()
    error.value = null
    try {
      const res = await request<ApiResponse<Workspace>>(`/workspaces/${id}`, {
        method: 'PATCH',
        body: payload,
      })
      if (res?.data) {
        // Mise à jour locale optimiste après confirmation serveur
        const idx = workspaces.value.findIndex((w) => w.id === id)
        if (idx !== -1) workspaces.value[idx] = res.data
        return res.data
      }
      return null
    } catch (err: unknown) {
      const fetchErr = err as { data?: ApiResponse<null> }
      error.value =
        fetchErr?.data?.error?.message ?? 'Impossible de mettre à jour l\'espace de travail.'
      throw err
    }
  }

  function setCurrentWorkspace(id: string): void {
    currentWorkspaceId.value = id
  }

  function getWorkspaceById(id: string): Workspace | undefined {
    return workspaces.value.find((w) => w.id === id)
  }

  return {
    // State
    workspaces,
    currentWorkspaceId,
    isLoading,
    error,
    // Getters
    currentWorkspace,
    activeWorkspaces,
    // Actions
    fetchWorkspaces,
    createWorkspace,
    updateWorkspace,
    setCurrentWorkspace,
    getWorkspaceById,
  }
})
