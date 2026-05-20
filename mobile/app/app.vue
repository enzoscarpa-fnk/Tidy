<script setup lang="ts">
const workspaceStore = useWorkspaceStore()
const syncService = useSyncService()
const networkListener = useNetworkListener()
const appLifecycle = useAppLifecycle()
const { isReady } = useDatabaseService()

onMounted(async () => {
  // Attendre que la DB soit initialisée (plugin 02.database.client.ts)
  // avant d'enregistrer les listeners qui peuvent déclencher syncAll
  await until(isReady).toBe(true)

  await networkListener.init(() => {
    const wId = workspaceStore.currentWorkspaceId
    if (wId) syncService.triggerAsync(wId)
  })

  const wId = workspaceStore.currentWorkspaceId ?? ''
  await appLifecycle.init(
    wId,
    () => {
      if (workspaceStore.currentWorkspaceId)
        syncService.triggerAsync(workspaceStore.currentWorkspaceId)
    },
    () => console.debug('[App] entering background')
  )
})

onUnmounted(() => {
  networkListener.destroy()
  appLifecycle.destroy()
})
</script>

<template>
  <div class="min-h-screen bg-tidy-surface text-tidy-text-primary">
    <NuxtPage />
  </div>
</template>
