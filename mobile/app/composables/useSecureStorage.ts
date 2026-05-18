// Wrapper autour de capacitor-secure-storage-plugin.
// iOS Keychain / Android Keystore via plugin natif.
// Fallback sur sessionStorage en mode web/dev (jamais en production native).
//
// Dépendance : le plugin 01.capacitor.client.ts doit s'être exécuté avant
// que ce composable soit appelé (garanti par l'ordre alphabétique des plugins Nuxt).

import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin'

/**
 * Détecte si l'app tourne sur une plateforme native Capacitor.
 * Utilise l'injection Nuxt ($isNativePlatform) si disponible,
 * sinon fallback sur l'accès direct à window.Capacitor (SSR-safe).
 */
function _isNative(): boolean {
  if (!import.meta.client) return false

  // Tenter d'utiliser la valeur injectée par 01.capacitor.client.ts
  try {
    const nuxtApp = useNuxtApp()
    return nuxtApp.$isNativePlatform === true
  } catch {
    // useNuxtApp() non disponible hors composant Vue (ex: store Pinia init)
    // → fallback sur window.Capacitor direct
    const cap = (window as typeof window & {
      Capacitor?: { isNativePlatform?: () => boolean }
    }).Capacitor
    return typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform()
  }
}

export function useSecureStorage() {
  /**
   * Persiste une valeur de façon sécurisée.
   * Native : iOS Keychain / Android Keystore
   * Web/dev : sessionStorage (non persisté entre onglets, jamais chiffré)
   */
  async function setItem(key: string, value: string): Promise<void> {
    if (_isNative()) {
      await SecureStoragePlugin.set({ key, value })
    } else if (import.meta.client) {
      sessionStorage.setItem(key, value)
    }
  }

  /**
   * Récupère une valeur persistée.
   * Retourne null si la clé n'existe pas ou si une erreur survient.
   */
  async function getItem(key: string): Promise<string | null> {
    if (_isNative()) {
      try {
        const result = await SecureStoragePlugin.get({ key })
        return result.value
      } catch {
        // Clé inexistante → le plugin throw, on normalise en null
        return null
      }
    } else if (import.meta.client) {
      return sessionStorage.getItem(key)
    }
    return null
  }

  /**
   * Supprime une valeur persistée.
   * Silencieux si la clé n'existe pas.
   */
  async function removeItem(key: string): Promise<void> {
    if (_isNative()) {
      try {
        await SecureStoragePlugin.remove({ key })
      } catch {
        // Clé inexistante — pas d'erreur à remonter
      }
    } else if (import.meta.client) {
      sessionStorage.removeItem(key)
    }
  }

  return { setItem, getItem, removeItem }
}
