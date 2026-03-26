// ── Enveloppe standard API ─────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T | null
  meta: PaginationMeta | Record<string, never>
  error: ApiError | null
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface ApiError {
  code: string
  message: string
  details?: Record<string, string>
}

// ── Utilisateur ────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  displayName: string
  tier: 'free' | 'pro'
  status: 'active' | 'suspended'
  createdAt: string
  updatedAt: string
}

// ── Auth ───────────────────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface AuthResponse extends AuthTokens {
  user: User
}

// ── Workspace ──────────────────────────────────────────────────────────────

export interface Workspace {
  id: string
  name: string
  description: string | null
  isArchived: boolean
  documentCount: number
  createdAt: string
  updatedAt: string
}

export interface WorkspaceListData {
  workspaces: Workspace[]
}
