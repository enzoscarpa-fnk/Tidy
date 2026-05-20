import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useTidyApi } from '~/composables/useTidyApi'

export interface ShareLink {
  id: string
  documentId: string
  token: string
  shareUrl: string
  expiresAt: string
  accessCount: number
  isRevoked: boolean
  createdAt: string
}

export type ShareExpiry = '24h' | '7d' | '30d'

export const useShareStore = defineStore('share', () => {
  const { request } = useTidyApi()

  /** Map documentId → ShareLink actif */
  const activeShareLinks = ref<Record<string, ShareLink>>({})
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  /** Getter — retourne le lien actif pour un document */
  function getShareLink(documentId: string): ShareLink | null {
    return activeShareLinks.value[documentId] ?? null
  }

  async function createShareLink(
    documentId: string,
    expiresIn: ShareExpiry
  ): Promise<ShareLink | null> {
    isLoading.value = true
    error.value = null
    try {
      const response = await request<{ data: ShareLink }>(
        `documents/${documentId}/share`,
        {
          method: 'POST',
          body: { expiresIn },
        }
      )
      if (!response?.data) return null
      activeShareLinks.value[documentId] = response.data
      return response.data
    } catch {
      error.value = 'Impossible de générer le lien de partage.'
      return null
    } finally {
      isLoading.value = false
    }
  }

  async function revokeShareLink(
    linkId: string,
    documentId: string
  ): Promise<boolean> {
    isLoading.value = true
    error.value = null
    try {
      await request(`share/${linkId}`, { method: 'DELETE' })
      delete activeShareLinks.value[documentId]
      return true
    } catch {
      error.value = 'Impossible de révoquer le lien de partage.'
      return false
    } finally {
      isLoading.value = false
    }
  }

  return {
    activeShareLinks,
    isLoading,
    error,
    getShareLink,
    createShareLink,
    revokeShareLink,
  }
})
