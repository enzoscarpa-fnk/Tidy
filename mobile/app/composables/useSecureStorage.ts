// Wrapper autour de capacitor-secure-storage-plugin.
// iOS Keychain / Android Keystore via plugin natif.
// Fallback sur sessionStorage en mode web/dev (jamais en production native).

import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin'

function _isNative(): boolean {
  if (!process.client) return false
  const cap = (window as typeof window & {
    Capacitor?: { isNativePlatform?: () => boolean }
  }).Capacitor
  return typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform()
}

export function useSecureStorage() {
  async function setItem(key: string, value: string): Promise<void> {
    if (_isNative()) {
      await SecureStoragePlugin.set({ key, value })
    } else if (process.client) {
      sessionStorage.setItem(key, value)
    }
  }

  async function getItem(key: string): Promise<string | null> {
    if (_isNative()) {
      try {
        const result = await SecureStoragePlugin.get({ key })
        return result.value
      } catch {
        return null
      }
    } else if (process.client) {
      return sessionStorage.getItem(key)
    }
    return null
  }

  async function removeItem(key: string): Promise<void> {
    if (_isNative()) {
      try {
        await SecureStoragePlugin.remove({ key })
      } catch {}
    } else if (process.client) {
      sessionStorage.removeItem(key)
    }
  }

  return { setItem, getItem, removeItem }
}
