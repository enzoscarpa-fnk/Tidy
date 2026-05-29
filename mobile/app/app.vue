<script setup lang="ts">
import * as Sentry from '@sentry/vue'

const workspaceStore  = useWorkspaceStore()
const syncService     = useSyncService()
const networkListener = useNetworkListener()
const appLifecycle    = useAppLifecycle()
const logService      = useLogService()
const { isReady }     = useDatabaseService()
const nuxtApp         = useNuxtApp()
const config          = useRuntimeConfig()

onMounted(async () => {
  await until(isReady).toBe(true)

  // ── Ticket 13.5 — purge logs > 7 jours ────────────────────────────────────
  await logService.purgeOldLogs()

  // ── Ticket 13.6 — Sentry ──────────────────────────────────────────────────
  const sentryDsn = config.public.sentryDsn as string | undefined
  if (sentryDsn) {
    Sentry.init({
      app:  nuxtApp.vueApp,
      dsn:  sentryDsn,
      // RGPD : exclure explicitement les champs sensibles des breadcrumbs
      beforeBreadcrumb(breadcrumb) {
        if (breadcrumb.data) {
          delete breadcrumb.data['ocr_text']
          delete breadcrumb.data['original_filename']
        }
        return breadcrumb
      },
    })
  }

  // ── Listeners ────────────────────────────────────────────────────────────
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
    () => {
      logService.log('debug', 'UI', 'App passée en arrière-plan')
    },
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
