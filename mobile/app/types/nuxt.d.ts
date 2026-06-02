import type { NuxtApp } from 'nuxt/app'

declare module 'nuxt/app' {
  interface NuxtApp {
    $capacitorPlatform: 'ios' | 'android' | 'web'
    $isNativePlatform: boolean
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $capacitorPlatform: 'ios' | 'android' | 'web'
    $isNativePlatform: boolean
  }
}

export {}
