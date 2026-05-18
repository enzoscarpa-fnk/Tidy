// Déclarations de types pour les injections Nuxt du plugin Capacitor.

declare module '#app' {
  interface NuxtApp {
    $capacitorPlatform: 'ios' | 'android' | 'web'
    $isNativePlatform: boolean
  }
}

// Pour useNuxtApp() dans les composables Vue
declare module 'vue' {
  interface ComponentCustomProperties {
    $capacitorPlatform: 'ios' | 'android' | 'web'
    $isNativePlatform: boolean
  }
}

export {}
