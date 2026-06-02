export default defineNuxtPlugin(async (nuxtApp) => {
  if (import.meta.env.TEST || typeof window === 'undefined') {
    return
  }

  const { Capacitor } = await import('@capacitor/core')

  const platform = Capacitor.getPlatform()
  const isNative = Capacitor.isNativePlatform()

  nuxtApp.provide('capacitorPlatform', platform)
  nuxtApp.provide('isNativePlatform', isNative)

  if (import.meta.dev) {
    console.info(`[Capacitor] Platform: ${platform} | Native: ${isNative}`)
  }
})
