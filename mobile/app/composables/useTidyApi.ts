// Client HTTP centralisé.
// - Injecte Authorization: Bearer depuis useAuthStore
// - Gère le refresh automatique sur 401 (1 retry)
// - Retourne null sur erreur réseau (offline) sans throw

export function useTidyApi() {
  const authStore = useAuthStore()
  const config = useRuntimeConfig()
  const baseURL = config.public.apiBaseUrl as string

  function _authHeaders(): Record<string, string> {
    if (!authStore.accessToken) return {}
    return { Authorization: `Bearer ${authStore.accessToken}` }
  }

  async function request<T>(
    url: string,
    options: Parameters<typeof $fetch>[1] = {}
  ): Promise<T | null> {
    const buildOptions = (): Parameters<typeof $fetch>[1] => ({
      baseURL,
      ...options,
      headers: {
        ..._authHeaders(),
        ...(options?.headers as Record<string, string> | undefined),
      },
    })

    try {
      return await $fetch<T>(url, buildOptions())
    } catch (err: unknown) {
      const fetchErr = err as {
        response?: { status?: number }
        message?: string
      }

      // 401 → tentative de refresh silencieux puis un seul retry
      if (fetchErr?.response?.status === 401) {
        try {
          await authStore.refreshTokens()
          return await $fetch<T>(url, buildOptions())
        } catch {
          return null
        }
      }

      // Erreur réseau (pas de réponse serveur) → offline, ne pas throw
      if (!fetchErr?.response) {
        return null
      }

      throw err
    }
  }

  return { request }
}
