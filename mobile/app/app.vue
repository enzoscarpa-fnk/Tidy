<script setup lang="ts">
const workspaceStore = useWorkspaceStore()
const syncService = useSyncService()
const networkListener = useNetworkListener()
const appLifecycle = useAppLifecycle()

onMounted(async () => {
  await networkListener.init(() => {
    const wId = workspaceStore.currentWorkspaceId
    if (wId) syncService.triggerAsync(wId)
  })

  const wId = workspaceStore.currentWorkspaceId ?? ''
  await appLifecycle.init(
    wId,
    () => { if (workspaceStore.currentWorkspaceId) syncService.triggerAsync(workspaceStore.currentWorkspaceId) },
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
