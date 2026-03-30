import type { ApiResponse, AuthRegisterResponse, AuthResponse, AuthRefreshResponse, User } from '~/types/api'

const ACCESS_TOKEN_KEY = 'tidy_access_token'
const REFRESH_TOKEN_KEY = 'tidy_refresh_token'

export const useAuthStore = defineStore('auth', () => {
  const config = useRuntimeConfig()
  const baseURL = config.public.apiBaseUrl as string

  // ── State ──────────────────────────────────────────────────────────────

  const accessToken = ref<string | null>(null)
  const refreshToken = ref<string | null>(null)
  const user = ref<User | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // ── Getters ────────────────────────────────────────────────────────────

  const isAuthenticated = computed(() => !!accessToken.value && !!user.value)
  const userTier = computed(() => user.value?.tier ?? 'free')

  // ── Helpers privés ─────────────────────────────────────────────────────

  async function _persistTokens(at: string, rt: string): Promise<void> {
    const storage = useSecureStorage()
    accessToken.value = at
    refreshToken.value = rt
    await Promise.all([
      storage.setItem(ACCESS_TOKEN_KEY, at),
      storage.setItem(REFRESH_TOKEN_KEY, rt),
    ])
  }

  async function _clearTokens(): Promise<void> {
    const storage = useSecureStorage()
    accessToken.value = null
    refreshToken.value = null
    user.value = null
    await Promise.all([
      storage.removeItem(ACCESS_TOKEN_KEY),
      storage.removeItem(REFRESH_TOKEN_KEY),
    ])
  }

  // ── Actions ────────────────────────────────────────────────────────────

  /**
   * Doit être appelé au démarrage de l'app (plugins/auth.client.ts).
   * Recharge les tokens depuis le stockage sécurisé.
   */
  async function init(): Promise<void> {
    const storage = useSecureStorage()
    const [storedAt, storedRt] = await Promise.all([
      storage.getItem(ACCESS_TOKEN_KEY),
      storage.getItem(REFRESH_TOKEN_KEY),
    ])
    if (storedAt) accessToken.value = storedAt
    if (storedRt) refreshToken.value = storedRt

    // Charger le profil si on a un token (peut échouer si expiré — géré par le middleware)
    if (accessToken.value) {
      await fetchProfile().catch(() => {})
    }
  }

  async function login(email: string, password: string): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const res = await $fetch<ApiResponse<AuthResponse>>('/auth/login', {
        baseURL,
        method: 'POST',
        body: { email, password },
      })
      if (!res.data) {
        throw new Error(res.error?.message ?? 'Erreur de connexion')
      }
      await _persistTokens(res.data.tokens.accessToken, res.data.tokens.refreshToken)
      user.value = res.data.user
    } catch (err: unknown) {
      const fetchErr = err as { data?: ApiResponse<null> }
      error.value =
        fetchErr?.data?.error?.message ?? 'Email ou mot de passe incorrect.'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function register(
    email: string,
    password: string,
    displayName: string
  ): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const res = await $fetch<ApiResponse<AuthRegisterResponse>>('/auth/register', {
        baseURL,
        method: 'POST',
        body: { email, password, displayName },
      })
      if (!res.data) {
        throw new Error(res.error?.message ?? 'Erreur lors de la création du compte')
      }
      await _persistTokens(res.data.tokens.accessToken, res.data.tokens.refreshToken)
      user.value = res.data.user
    } catch (err: unknown) {
      const fetchErr = err as { data?: ApiResponse<null> }
      error.value =
        fetchErr?.data?.error?.message ?? 'Impossible de créer le compte.'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function refreshTokens(): Promise<void> {
    const currentRt = refreshToken.value
    if (!currentRt) {
      await logout()
      return
    }
    try {
      const res = await $fetch<ApiResponse<AuthRefreshResponse>>('/auth/refresh', {
        baseURL,
        method: 'POST',
        body: { refreshToken: currentRt },
      })
      if (!res.data) throw new Error('Refresh token invalide')
      await _persistTokens(res.data.tokens.accessToken, res.data.tokens.refreshToken)
    } catch {
      await logout()
      await navigateTo('/auth/login')
    }
  }

  async function logout(): Promise<void> {
    // Révocation best-effort du refresh token côté serveur
    if (accessToken.value) {
      await $fetch('/auth/logout', {
        baseURL,
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken.value}` },
      }).catch(() => {})
    }
    await _clearTokens()
  }

  async function fetchProfile(): Promise<void> {
    if (!accessToken.value) return
    const res = await $fetch<ApiResponse<User>>('/me', {
      baseURL,
      headers: { Authorization: `Bearer ${accessToken.value}` },
    })
    if (res.data) user.value = res.data
  }

  return {
    // State
    accessToken,
    refreshToken,
    user,
    isLoading,
    error,
    // Getters
    isAuthenticated,
    userTier,
    // Actions
    init,
    login,
    register,
    refreshTokens,
    logout,
    fetchProfile,
  }
})
