import type { ApiResponse, Workspace, WorkspaceListData } from '~/app/types/api'

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

  // ── Actions ────────────────────────────────────────────────────────────

  async function fetchWorkspaces(): Promise<void> {
    const { request } = useTidyApi()
    isLoading.value = true
    error.value = null
    try {
      const res = await request<ApiResponse<WorkspaceListData>>('/workspaces')
      if (res?.data) workspaces.value = res.data.workspaces
    } catch {
      error.value = 'Impossible de charger les espaces de travail.'
    } finally {
      isLoading.value = false
    }
  }

  function setCurrentWorkspace(id: string): void {
    currentWorkspaceId.value = id
  }

  return {
    workspaces,
    currentWorkspaceId,
    currentWorkspace,
    isLoading,
    error,
    fetchWorkspaces,
    setCurrentWorkspace,
  }
})
