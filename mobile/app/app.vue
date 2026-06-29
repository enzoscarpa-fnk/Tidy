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

const router = useRouter()
const transitionName = ref('slide-left')

router.beforeEach((to, from) => {
  const backRoutes = ['/auth/login', '/auth/register']
  const goingBack = (
    backRoutes.includes(to.path) ||
    (!!to.params.workspaceId &&
      !to.params.documentId &&
      to.path === `/workspace/${to.params.workspaceId}`) ||
    (from.path.startsWith(to.path + '/'))
  )
  transitionName.value = goingBack ? 'slide-right' : 'slide-left'
})

onMounted(async () => {
  await until(isReady).toBe(true)
  await logService.purgeOldLogs()

  const sentryDsn = config.public.sentryDsn as string | undefined
  if (sentryDsn) {
    Sentry.init({
      app: nuxtApp.vueApp,
      dsn: sentryDsn,
      beforeBreadcrumb(breadcrumb) {
        if (breadcrumb.data) {
          delete breadcrumb.data['ocr_text']
          delete breadcrumb.data['original_filename']
        }
        return breadcrumb
      },
    })
  }

  await networkListener.init(() => {
    const wId = workspaceStore.currentWorkspaceId
    if (wId) syncService.triggerAsync(wId)
  })

  const wId = workspaceStore.currentWorkspaceId ?? ''
  await appLifecycle.init(
    wId,
    () => { if (workspaceStore.currentWorkspaceId) syncService.triggerAsync(workspaceStore.currentWorkspaceId) },
    () => { logService.log('debug', 'UI', 'App passée en arrière-plan') },
  )
})

onUnmounted(() => {
  networkListener.destroy()
  appLifecycle.destroy()
})
</script>

<template>
  <!--
    Stratégie safe-area :

    Le wrapper flex-col contient :
      1. Une bande "spacer" de hauteur env(safe-area-inset-top), avec le même
         fond glassmorphism que le header. Elle est dans le flux normal (pas fixed),
         flex-shrink-0, donc elle occupe de l'espace réel en haut.
      2. NuxtPage dans un div flex-1 overflow-hidden.

    Avantages :
    - Jamais détruite → pas de jump lors des transitions
    - Pas de z-index élevé → ne masque rien
    - Les pages voient leur espace disponible = hauteur totale - safe-area-inset-top
      ce qui est exactement ce qu'on veut
    - Le shader (fixed inset-0) reste visible DERRIÈRE la bande grâce au backdrop-blur
  -->
  <div class="flex flex-col h-full overflow-hidden bg-tidy-surface text-tidy-text-primary">

    <!-- Bande safe-area top — dans le flux, jamais recréée, même fond que le header -->
    <div
      class="flex-shrink-0 w-full backdrop-blur-md"
      style="
        height: env(safe-area-inset-top);
        min-height: env(safe-area-inset-top);
        background-color: rgba(13, 13, 20, 0.85);
      "
      aria-hidden="true"
    />

    <!-- Zone pages — position:relative pour les transitions absolute -->
    <div class="relative flex-1 overflow-hidden">
      <NuxtPage
        :transition="{ name: transitionName, mode: 'default' }"
        :keepalive="{ include: ['WorkspaceWorkspaceId', 'Profile'] }"
      />
    </div>

  </div>
</template>
