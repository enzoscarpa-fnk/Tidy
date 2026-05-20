import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reactive, nextTick } from 'vue'
import type { Mock } from 'vitest'
import ShareModal from '~/components/ShareModal.vue'
import type { ShareLink } from '~/stores/share'

const mockCreateShareLink = vi.fn()
const mockRevokeShareLink = vi.fn()

const mockShareStore = reactive({
  isLoading: false,
  error: null as string | null,
  getShareLink: vi.fn(() => null) as Mock<() => ShareLink | null>,
  createShareLink: mockCreateShareLink,
  revokeShareLink: mockRevokeShareLink,
})

mockNuxtImport('useShareStore', () => () => mockShareStore)

vi.mock('@capacitor/share', () => ({
  Share: { share: vi.fn().mockResolvedValue(undefined) },
}))

function bodyText(): string {
  return document.body.textContent ?? ''
}

function findBodyButton(label: string): HTMLButtonElement | undefined {
  return Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
    .find((b) => b.textContent?.includes(label))
}

describe('ShareModal', () => {
  beforeEach(() => {
    mockCreateShareLink.mockReset()
    mockRevokeShareLink.mockReset()
    mockShareStore.isLoading = false
    mockShareStore.error = null
    mockShareStore.getShareLink = vi.fn(() => null) as Mock<() => ShareLink | null>
  })

  it('affiche le sélecteur de durée quand aucun lien actif', async () => {
    await mountSuspended(ShareModal, {
      props: { documentId: 'doc-1', modelValue: true },
      attachTo: document.body,
    })

    expect(bodyText()).toContain('24 heures')
    expect(bodyText()).toContain('7 jours')
    expect(bodyText()).toContain('30 jours')
    expect(bodyText()).toContain('Générer le lien')
  })

  it('appelle createShareLink avec la durée sélectionnée', async () => {
    mockCreateShareLink.mockResolvedValue({
      id: 'link-1',
      documentId: 'doc-1',
      token: 'abc',
      shareUrl: 'https://example.com/s/abc',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      accessCount: 0,
      isRevoked: false,
      createdAt: new Date().toISOString(),
    })

    await mountSuspended(ShareModal, {
      props: { documentId: 'doc-1', modelValue: true },
      attachTo: document.body,
    })

    const generateBtn = findBodyButton('Générer')
    expect(generateBtn).toBeDefined()
    generateBtn!.click()
    await nextTick()

    expect(mockCreateShareLink).toHaveBeenCalledWith('doc-1', '7d')
  })

  it('affiche le lien et le bouton Révoquer quand un lien actif existe', async () => {
    mockShareStore.getShareLink = vi.fn((): ShareLink | null => ({
      id: 'link-1',
      documentId: 'doc-1',
      token: 'abc',
      shareUrl: 'https://example.com/s/abc',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      accessCount: 0,
      isRevoked: false,
      createdAt: new Date().toISOString(),
    }))

    await mountSuspended(ShareModal, {
      props: { documentId: 'doc-1', modelValue: true },
      attachTo: document.body,
    })

    expect(bodyText()).toContain('https://example.com/s/abc')
    expect(findBodyButton('Révoquer')).toBeDefined()
  })

  it('appelle revokeShareLink au clic sur Révoquer', async () => {
    mockShareStore.getShareLink = vi.fn((): ShareLink | null => ({
      id: 'link-42',
      documentId: 'doc-1',
      token: 'abc',
      shareUrl: 'https://example.com/s/abc',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      accessCount: 0,
      isRevoked: false,
      createdAt: new Date().toISOString(),
    }))

    await mountSuspended(ShareModal, {
      props: { documentId: 'doc-1', modelValue: true },
      attachTo: document.body,
    })

    const revokeBtn = findBodyButton('Révoquer')
    expect(revokeBtn).toBeDefined()
    revokeBtn!.click()
    await nextTick()

    expect(mockRevokeShareLink).toHaveBeenCalledWith('link-42', 'doc-1')
  })

  it('émet update:modelValue=false au clic sur Fermer', async () => {
    const wrapper = await mountSuspended(ShareModal, {
      props: { documentId: 'doc-1', modelValue: true },
      attachTo: document.body,
    })

    await (wrapper.vm as unknown as { close: () => void }).close()
    await nextTick()

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([false])
  })

  it('appelle Share.share au clic sur Envoyer via…', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@capacitor/share', () => ({ Share: { share: shareMock } }))

    mockShareStore.getShareLink = vi.fn((): ShareLink | null => ({
      id: 'link-1',
      documentId: 'doc-1',
      token: 'abc',
      shareUrl: 'https://example.com/s/abc',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      accessCount: 0,
      isRevoked: false,
      createdAt: new Date().toISOString(),
    }))

    const wrapper = await mountSuspended(ShareModal, {
      props: { documentId: 'doc-1', modelValue: true },
      attachTo: document.body,
    })

    await (wrapper.vm as unknown as { handleNativeShare: () => Promise<void> }).handleNativeShare()
    await nextTick()

    expect(shareMock).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/s/abc' })
    )
  })
})
