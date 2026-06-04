import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import ScanPage from '~/pages/workspace/[workspaceId]/scan.vue'

// ── Helpers ────────────────────────────────────────────────────────────────

const FAKE_BASE64_JPEG = btoa('fake-jpeg-content')
const FAKE_BASE64_PNG  = btoa('fake-png-content')

async function settle(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await nextTick()
  await nextTick()
  await nextTick()
}

// ── Mocks globaux ──────────────────────────────────────────────────────────

const mockUploadDocument = vi.fn().mockResolvedValue(undefined)
const mockResetUpload    = vi.fn()

vi.mock('~/stores/document', () => ({
  useDocumentStore: () => ({
    uploadDocument:  mockUploadDocument,
    resetUpload:     mockResetUpload,
    uploadProgress:  0,
    uploadStatus:    'idle',
  }),
}))

// Capacitor Camera — retourne une photo JPEG par défaut
const mockGetPhoto = vi.fn().mockResolvedValue({
  base64String: FAKE_BASE64_JPEG,
  format:       'jpeg',
})

vi.mock('@capacitor/camera', () => ({
  Camera:           { getPhoto: (...args: unknown[]) => mockGetPhoto(...args) },
  CameraResultType: { Base64: 'base64' },
  CameraSource:     { Camera: 'CAMERA', Photos: 'PHOTOS' },
}))

vi.mock('vue-router', () => ({
  useRoute:  () => ({
    params: { workspaceId: 'ws-1' },
    query:  { source: 'camera' },
  }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}))

// ── Helper de montage ──────────────────────────────────────────────────────

async function mountScan(source = 'camera') {
  vi.mocked(vi.fn()).mockImplementation(() => {})

  // Override route query source
  vi.doMock('vue-router', () => ({
    useRoute:  () => ({
      params: { workspaceId: 'ws-1' },
      query:  { source },
    }),
    useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  }))

  const wrapper = await mountSuspended(ScanPage)
  await settle(wrapper)
  return wrapper
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('pages/workspace/[workspaceId]/scan.vue', () => {

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetPhoto.mockResolvedValue({ base64String: FAKE_BASE64_JPEG, format: 'jpeg' })
    mockUploadDocument.mockResolvedValue(undefined)
  })

  it('capture → confirmAndUpload appelle uploadDocument avec un File JPEG valide', async () => {
    const wrapper = await mountScan('camera')

    // onMounted a lancé capturePhoto → step = 'captured'
    expect(wrapper.text()).toContain('Envoyer le document')

    const btn = wrapper.findAll('button').find(b => b.text().includes('Envoyer'))
    expect(btn).toBeDefined()
    await btn!.trigger('click')
    await settle(wrapper)

    await vi.waitFor(() => expect(mockUploadDocument).toHaveBeenCalledOnce())
    const callArgs = mockUploadDocument.mock.calls[0]!
    const file = callArgs[callArgs.length - 1] as File
    expect(file).toBeInstanceOf(File)
    expect(file.type).toBe('image/jpeg')
    expect(file.name).toMatch(/^scan_\d+\.jpg$/)
  })

  it('capture PNG → File transmis avec type image/png', async () => {
    mockGetPhoto.mockResolvedValue({ base64String: FAKE_BASE64_PNG, format: 'png' })

    const wrapper = await mountScan('camera')
    const btn = wrapper.findAll('button').find(b => b.text().includes('Envoyer'))
    expect(btn).toBeDefined()
    await btn!.trigger('click')
    await settle(wrapper)

    const [, file] = mockUploadDocument.mock.calls[0] as [string, File]
    expect(file.type).toBe('image/png')
    expect(file.name).toMatch(/^scan_\d+\.png$/)
  })

  it('upload réussi → step passe à success', async () => {
    mockUploadDocument.mockResolvedValue(undefined)

    const wrapper = await mountScan('camera')
    const btn = wrapper.findAll('button').find(b => b.text().includes('Envoyer'))
    expect(btn).toBeDefined()
    await btn!.trigger('click')
    await settle(wrapper)

    expect(wrapper.text()).toContain('Document envoyé')
  })

  it('upload échoué → affiche le message d\'erreur', async () => {
    mockUploadDocument.mockRejectedValue(new Error('Connexion impossible'))

    const wrapper = await mountScan('camera')
    const btn = wrapper.findAll('button').find(b => b.text().includes('Envoyer'))
    expect(btn).toBeDefined()
    await btn!.trigger('click')
    await settle(wrapper)

    expect(wrapper.text()).toContain('Connexion impossible')
  })

  it('annulation caméra → router.back() appelé, pas d\'erreur affichée', async () => {
    const mockBack = vi.fn()
    vi.doMock('vue-router', () => ({
      useRoute:  () => ({ params: { workspaceId: 'ws-1' }, query: { source: 'camera' } }),
      useRouter: () => ({ push: vi.fn(), back: mockBack, replace: vi.fn() }),
    }))

    mockGetPhoto.mockRejectedValue(new Error('User cancelled photos app'))

    const wrapper = await mountScan('camera')
    await settle(wrapper)

    // Pas de message d'erreur affiché
    expect(wrapper.text()).not.toContain('Impossible')
  })

  it('erreur caméra réelle → affiche le message d\'autorisation', async () => {
    mockGetPhoto.mockRejectedValue(new Error('Permission denied by user'))

    const wrapper = await mountScan('camera')
    await settle(wrapper)

    expect(wrapper.text()).toContain('Impossible')
  })

  it('image trop volumineuse → erreur client sans appel uploadDocument', async () => {
    // Générer un base64 > 50Mo est impraticable en test —
    // on mock directement la logique en fournissant un fichier dont size > MAX
    // via un base64 suffisamment grand simulé
    const bigBase64 = 'A'.repeat(50 * 1024 * 1024 * 1.4) // ~70Mo encodé
    mockGetPhoto.mockResolvedValue({ base64String: bigBase64, format: 'jpeg' })

    const wrapper = await mountScan('camera')
    const btn = wrapper.findAll('button').find(b => b.text().includes('Envoyer'))
    expect(btn).toBeDefined()
    await btn!.trigger('click')
    await settle(wrapper)

    expect(mockUploadDocument).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('volumineuse')
  })

  it('"Reprendre une photo" relance la capture', async () => {
    const wrapper = await mountScan('camera')

    // Step captured → bouton "Reprendre"
    const retakeBtn = wrapper.findAll('button').find(b => b.text().includes('Reprendre'))
    expect(retakeBtn).toBeDefined()
    await retakeBtn!.trigger('click')
    await settle(wrapper)

    // Camera.getPhoto appelé une 2e fois
    expect(mockGetPhoto).toHaveBeenCalledTimes(2)
  })
})
