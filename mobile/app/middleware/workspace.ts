// app/middleware/workspace.ts
//
// Middleware NOMMÉ — à déclarer sur chaque page workspace/:[workspaceId]/** :
//   definePageMeta({ middleware: ['workspace'] })
//
// Responsabilités :
//   1. Charger les workspaces si le cache est vide
//   2. Vérifier que [workspaceId] appartient bien au user connecté
//   3. Synchroniser currentWorkspaceId dans le store
//   4. Rediriger vers '/' si le workspace est introuvable ou non autorisé

export default defineNuxtRouteMiddleware(async (to) => {
  const workspaceStore = useWorkspaceStore()

  const workspaceId = to.params.workspaceId

  // Paramètre absent ou malformé → retour à l'accueil
  if (!workspaceId || typeof workspaceId !== 'string') {
    return navigateTo('/')
  }

  // Charger les workspaces si le cache est vide (premier accès ou reload)
  if (workspaceStore.workspaces.length === 0) {
    await workspaceStore.fetchWorkspaces()
  }

  // Vérifier l'appartenance via le cache local (getWorkspaceById — lookup O(n) synchrone)
  const workspace = workspaceStore.getWorkspaceById(workspaceId)

  if (!workspace) {
    // Workspace introuvable ou appartenant à un autre user → accueil
    return navigateTo('/')
  }

  // Synchroniser le workspace courant dans le store
  // (évite de devoir appeler setCurrentWorkspace() dans chaque page)
  workspaceStore.setCurrentWorkspace(workspaceId)
})
