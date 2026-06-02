import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ScanPage from '~/pages/workspace/[workspaceId]/scan.vue'

// ── Mocks hoistés ──────────────────────────────────────────────────────────

const {
  mockGetPhoto,
  mockUpload,
  mockResetUpload,
  mockRouterPush,
  mockRouterBack,
} = vi.hoisted(() => ({
  mockGetPhoto:    vi.fn(),
  mockUpload:      vi.fn(),
  mockResetUpload: vi.fn(),
  mockRouterPush:  vi.fn(),
  mockRouterBack:  vi.fn(),
}))

vi.mock('@capacitor/camera', () => ({
  Camera:           { getPhoto: mockGetPhoto },
  CameraResultType: { Base64: 'base64' },
  CameraSource:     { Camera: 'CAMERA', Photos: 'PHOTOS' },
}))

vi.mock('~/stores/document', () => ({
  useDocumentStore: () => ({
    uploadDocument:  mockUpload,
    resetUpload:     mockResetUpload,
    uploadProgress:  0,
  }),
}))

vi.mock('~/composables/useLocalDocumentRepository', () => ({
  useLocalDocumentRepository: () => ({}),
}))

vi.mock('~/composables/useDatabaseService', () => ({
  useDatabaseService: () => ({}),
}))

// ── Helpers ────────────────────────────────────────────────────────────────

const FAKE_BASE64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/' +
  'EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUBQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/' +
  'aAAwDAQACEQMRAD8AKwAB/9k='

function _makePhotoMock(base64 = FAKE_BASE64, format = 'jpeg') {
  return { base64String: base64, format }
}

/**
 * Draine la file de microtâches sans setTimeout (compatible avec tous les modes timer).
 * - N x Promise.resolve() pour laisser les chaînes async se résoudre
 * - 1 x $nextTick pour que Vue re-rende le DOM
 */
async function settle(wrapper: Awaited<ReturnType<typeof mountSuspended>>, depth = 4) {
  for (let i = 0; i < depth; i++) {
    await Promise.resolve()
  }
  await wrapper.vm.$nextTick()
}

/** Clic sur "Ouvrir la caméra" + attente résolution async. */
async function captureAndSettle(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  const btn = wrapper.findAll('button').find((b: { text(): string }) => b.text().includes('Ouvrir la caméra'))
  expect(btn).toBeDefined()
  await btn!.trigger('click')
  await settle(wrapper)
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('pages/workspace/[workspaceId]/scan.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpload.mockResolvedValue(undefined)
    vi.stubGlobal('useRoute',   () => ({ params: { workspaceId: 'ws-test' }, query: {}, path: '/workspace/ws-test/scan' }))
    vi.stubGlobal('useRouter',  () => ({ push: mockRouterPush, back: mockRouterBack }))
    vi.stubGlobal('useNuxtApp', () => ({ $isNativePlatform: false }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ── Capture + upload ─────────────────────────────────────────────────────

  it('capture → confirmAndUpload appelle uploadDocument avec un File JPEG valide', async () => {
    mockGetPhoto.mockResolvedValue(_makePhotoMock())

    const wrapper = await mountSuspended(ScanPage, { route: '/workspace/ws-test/scan' })
    await captureAndSettle(wrapper)

    const sendBtn = wrapper.findAll('button').find((b: { text(): string }) => b.text().includes('Envoyer'))
    expect(sendBtn).toBeDefined()
    await sendBtn!.trigger('click')
    await settle(wrapper)

    expect(mockResetUpload).toHaveBeenCalledOnce()
    expect(mockUpload).toHaveBeenCalledOnce()

    const [workspaceArg, fileArg] = mockUpload.mock.calls[0] as [string, File]
    expect(fileArg).toBeInstanceOf(File)
    expect(fileArg.type).toBe('image/jpeg')
    expect(fileArg.name).toMatch(/^scan_\d+\.jpg$/)
    expect(fileArg.size).toBeGreaterThan(0)
  })

  it('capture PNG → File transmis avec type image/png', async () => {
    mockGetPhoto.mockResolvedValue(_makePhotoMock(FAKE_BASE64, 'png'))

    const wrapper = await mountSuspended(ScanPage, { route: '/workspace/ws-test/scan' })
    await captureAndSettle(wrapper)

    const sendBtn = wrapper.findAll('button').find((b: { text(): string }) => b.text().includes('Envoyer'))
    await sendBtn!.trigger('click')
    await settle(wrapper)

    const [, fileArg] = mockUpload.mock.calls[0] as [string, File]
    expect(fileArg.type).toBe('image/png')
    expect(fileArg.name).toMatch(/^scan_\d+\.png$/)
  })

  it('upload réussi → step passe à success', async () => {
    mockGetPhoto.mockResolvedValue(_makePhotoMock())

    const wrapper = await mountSuspended(ScanPage, { route: '/workspace/ws-test/scan' })
    await captureAndSettle(wrapper)

    const sendBtn = wrapper.findAll('button').find((b: { text(): string }) => b.text().includes('Envoyer'))
    await sendBtn!.trigger('click')
    await settle(wrapper)

    expect(wrapper.text()).toContain('Document envoyé')
    expect(mockUpload).toHaveBeenCalledOnce()
  })

  it('upload échoué → affiche le message d\'erreur', async () => {
    mockGetPhoto.mockResolvedValue(_makePhotoMock())
    mockUpload.mockRejectedValue(new Error('Quota dépassé'))

    const wrapper = await mountSuspended(ScanPage, { route: '/workspace/ws-test/scan' })
    await captureAndSettle(wrapper)

    const sendBtn = wrapper.findAll('button').find((b: { text(): string }) => b.text().includes('Envoyer'))
    await sendBtn!.trigger('click')
    await settle(wrapper)

    expect(wrapper.text()).toContain('Quota dépassé')
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  // ── Annulation + erreur caméra ───────────────────────────────────────────

  it('annulation caméra → reste sur step idle sans afficher d\'erreur', async () => {
    mockGetPhoto.mockRejectedValue(new Error('User cancelled photos app'))

    const wrapper = await mountSuspended(ScanPage, { route: '/workspace/ws-test/scan' })
    await captureAndSettle(wrapper)

    expect(wrapper.text()).not.toContain('Impossible d\'accéder')
    expect(wrapper.text()).toContain('Ouvrir la caméra')
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('erreur caméra réelle → affiche le message d\'autorisation', async () => {
    mockGetPhoto.mockRejectedValue(new Error('Permission denied'))

    const wrapper = await mountSuspended(ScanPage, { route: '/workspace/ws-test/scan' })
    await captureAndSettle(wrapper)

    expect(wrapper.text()).toContain('Impossible d\'accéder à la caméra')
    expect(mockUpload).not.toHaveBeenCalled()
  })

  // ── Validation ───────────────────────────────────────────────────────────

  it('image trop volumineuse → erreur client sans appel uploadDocument', async () => {
    const bigBase64 = 'A'.repeat(70 * 1024 * 1024)
    mockGetPhoto.mockResolvedValue(_makePhotoMock(bigBase64))

    const wrapper = await mountSuspended(ScanPage, { route: '/workspace/ws-test/scan' })
    await captureAndSettle(wrapper)

    const sendBtn = wrapper.findAll('button').find((b: { text(): string }) => b.text().includes('Envoyer'))
    await sendBtn!.trigger('click')
    await settle(wrapper)

    expect(mockUpload).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('trop volumineuse')
  })

  // ── Retake ───────────────────────────────────────────────────────────────

  it('"Reprendre une photo" remet le step à idle', async () => {
    mockGetPhoto.mockResolvedValue(_makePhotoMock())

    const wrapper = await mountSuspended(ScanPage, { route: '/workspace/ws-test/scan' })
    await captureAndSettle(wrapper)

    const retakeBtn = wrapper.findAll('button').find((b: { text(): string }) => b.text().includes('Reprendre'))
    expect(retakeBtn).toBeDefined()
    await retakeBtn!.trigger('click')
    await settle(wrapper)

    expect(wrapper.text()).toContain('Ouvrir la caméra')
    expect(mockUpload).not.toHaveBeenCalled()
  })
})
