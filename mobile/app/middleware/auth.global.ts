// Middleware global — appliqué sur toutes les routes.
// Exclut /auth/* (pages publiques) et /s/* (partage public).
// Tente un refresh silencieux avant de rediriger vers /auth/login.

function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.')
    if (parts.length !== 3 || !parts[1]) return true
    const payload = JSON.parse(atob(parts[1])) as { exp?: number }
    return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()
  } catch {
    return true
  }
}

export default defineNuxtRouteMiddleware(async (to) => {
  // Routes publiques — pas de garde
  if (to.path.startsWith('/auth/') || to.path.startsWith('/s/')) return

  const authStore = useAuthStore()

  // Déjà authentifié avec profil chargé → laisser passer
  if (authStore.isAuthenticated) return

  const at = authStore.accessToken
  const rt = authStore.refreshToken

  // Aucun token → redirection immédiate
  if (!at && !rt) return navigateTo('/auth/login')

  // Token d'accès expiré mais refresh token présent → refresh silencieux
  if ((!at || isTokenExpired(at)) && rt) {
    try {
      await authStore.refreshTokens()
      // refreshTokens() navigue déjà vers /auth/login en cas d'échec
      if (authStore.isAuthenticated) return
    } catch {
      return navigateTo('/auth/login')
    }
  }

  if (!authStore.isAuthenticated) return navigateTo('/auth/login')
})
