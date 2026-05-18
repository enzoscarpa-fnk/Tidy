export default defineNuxtPlugin(async (nuxtApp) => {
  // En environnement de test (Vitest/happy-dom), Capacitor n'est pas disponible.
  // Le guard ci-dessous empêche toute erreur au boot des tests.
  if (import.meta.env.TEST || typeof window === 'undefined') {
    return
  }

  // Vérification de la disponibilité de la plateforme native.
  // Sur le web (nuxt dev), Capacitor fonctionne en mode "web fallback".
  const { Capacitor } = await import('@capacitor/core')

  const platform = Capacitor.getPlatform() // 'ios' | 'android' | 'web'
  const isNative = Capacitor.isNativePlatform()

  // Exposer la plateforme à toute l'app via nuxtApp.$capacitorPlatform
  nuxtApp.provide('capacitorPlatform', platform)
  nuxtApp.provide('isNativePlatform', isNative)

  if (import.meta.dev) {
    console.info(`[Capacitor] Platform: ${platform} | Native: ${isNative}`)
  }
})
