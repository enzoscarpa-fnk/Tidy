<script setup lang="ts">
// Ticket 6.8 — Redirect guard
// Authentifié → charge les workspaces → navigue vers le premier
// Non authentifié → /auth/login (géré aussi par le middleware global)

const authStore = useAuthStore()
const workspaceStore = useWorkspaceStore()

onMounted(async () => {
  console.log('[index] isAuthenticated:', authStore.isAuthenticated)
  console.log('[index] accessToken:', authStore.accessToken ? 'SET' : 'NULL')
  console.log('[index] user:', authStore.user)
  if (!authStore.isAuthenticated) {
    await navigateTo('/auth/login')
    return
  }

  await workspaceStore.fetchWorkspaces()

  const defaultWorkspace = workspaceStore.workspaces[0]
  if (defaultWorkspace) {
    await navigateTo(`/workspace/${defaultWorkspace.id}`)
  }
})
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-tidy-surface">
    <div class="flex flex-col items-center gap-3">
      <div
        class="h-8 w-8 animate-spin rounded-full border-2 border-tidy-border border-t-tidy-primary"
      />
      <p class="text-sm text-tidy-text-secondary">Chargement…</p>
    </div>
  </div>
</template>
