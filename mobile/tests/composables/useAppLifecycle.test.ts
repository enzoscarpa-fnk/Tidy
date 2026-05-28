import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAppLifecycle } from '~/composables/useAppLifecycle'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockAppAddListener,
  mockNetworkGetStatus,
  mockDbExecute,
  mockCapacitorIsNative,
  mockCapacitorPlatform,
  mockFilesystemReaddir,
  mockFilesystemReadFile,
  mockFilesystemDeleteFile,
  mockUploadDocument,
  mockFetchDocuments,
  mockStartPolling,
  mockRefreshFromDatabase,
} = vi.hoisted(() => ({
  mockAppAddListener:      vi.fn(),
  mockNetworkGetStatus:    vi.fn(),
  mockDbExecute:           vi.fn(),
  mockCapacitorIsNative:   vi.fn(),
  mockCapacitorPlatform:   vi.fn(),
  mockFilesystemReaddir:   vi.fn(),
  mockFilesystemReadFile:  vi.fn(),
  mockFilesystemDeleteFile: vi.fn(),
  mockUploadDocument:      vi.fn(),
  mockFetchDocuments:      vi.fn(),
  mockStartPolling:        vi.fn(),
  mockRefreshFromDatabase: vi.fn(),
}))

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@capacitor/app', () => ({
  App: { addListener: mockAppAddListener },
}))

vi.mock('@capacitor/network', () => ({
  Network: { getStatus: mockNetworkGetStatus },
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: mockCapacitorIsNative,
    getPlatform:      mockCapacitorPlatform,
  },
}))

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    readdir:    mockFilesystemReaddir,
    readFile:   mockFilesystemReadFile,
    deleteFile: mockFilesystemDeleteFile,
  },
  Directory: { Library: 'LIBRARY' },
  Encoding:  { UTF8: 'utf8' },
}))

vi.mock('~/composables/useDatabaseService', () => ({
  useDatabaseService: () => ({ execute: mockDbExecute }),
}))

vi.mock('~/stores/document', () => ({
  useDocumentStore: () => ({
    uploadDocument:      mockUploadDocument,
    fetchDocuments:      mockFetchDocuments,
    startPolling:        mockStartPolling,
    refreshFromDatabase: mockRefreshFromDatabase,
  }),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const FAKE_BASE64 = btoa('fake-binary-content')

function makeManifestJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id:              'uuid-1',
    filename:        'document.pdf',
    mimeType:        'application/pdf',
    fileSizeBytes:   1024,
    sharedAt:        '2026-05-27T10:00:00.000Z',
    binaryFilename:  'uuid-1.pdf',
    ...overrides,
  })
}

/** Capture le callback appStateChange enregistré par App.addListener */
function captureStateCallback(): { fire: (s: { isActive: boolean }) => void } {
  const ref = { cb: null as ((s: { isActive: boolean }) => void) | null }
  mockAppAddListener.mockImplementation((_event: string, cb: any) => {
    ref.cb = cb
    return Promise.resolve({ remove: vi.fn() })
  })
  return {
    fire: (state) => ref.cb?.(state),
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useAppLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Réseau
    mockNetworkGetStatus.mockResolvedValue({ connected: true })
    mockAppAddListener.mockResolvedValue({ remove: vi.fn() })
    // SQLite
    mockDbExecute.mockResolvedValue(undefined)
    // Plateforme : non-iOS par défaut pour isoler les tests lifecycle
    mockCapacitorIsNative.mockReturnValue(false)
    mockCapacitorPlatform.mockReturnValue('web')
    // Document store
    mockRefreshFromDatabase.mockResolvedValue(undefined)
    mockUploadDocument.mockResolvedValue(undefined)
    mockFetchDocuments.mockResolvedValue(undefined)
    mockStartPolling.mockImplementation(() => {})
    // Filesystem
    mockFilesystemReaddir.mockResolvedValue({ files: [] })
    mockFilesystemDeleteFile.mockResolvedValue(undefined)
  })

  // ── Lifecycle ────────────────────────────────────────────────────────────

  it('déclenche onForeground au passage en foreground avec réseau', async () => {
    const onForeground = vi.fn()
    const { fire } = captureStateCallback()

    const { init } = useAppLifecycle()
    await init('ws-1', onForeground, vi.fn())

    fire({ isActive: true })
    await new Promise((r) => setTimeout(r, 0))

    expect(onForeground).toHaveBeenCalledOnce()
  })

  it('déclenche onBackground lors du passage en arrière-plan', async () => {
    const onBackground = vi.fn()
    const { fire } = captureStateCallback()

    const { init } = useAppLifecycle()
    await init('ws-1', vi.fn(), onBackground)

    fire({ isActive: false })
    await Promise.resolve()

    expect(onBackground).toHaveBeenCalledOnce()
  })

  it('suspend la queue OCR au passage en background', async () => {
    const { fire } = captureStateCallback()

    const { init } = useAppLifecycle()
    await init('ws-1', vi.fn(), vi.fn())

    fire({ isActive: false })
    await new Promise((r) => setTimeout(r, 10))

    expect(mockDbExecute).toHaveBeenCalledWith(
      expect.stringContaining("ocrstatus = 'pending'"),
      [],
    )
  })

  it('ne déclenche PAS onForeground si le réseau est absent', async () => {
    mockNetworkGetStatus.mockResolvedValue({ connected: false })
    const onForeground = vi.fn()
    const { fire } = captureStateCallback()

    const { init } = useAppLifecycle()
    await init('ws-1', onForeground, vi.fn())

    fire({ isActive: true })
    await Promise.resolve()

    expect(onForeground).not.toHaveBeenCalled()
  })

  it('retire le listener lors de destroy()', async () => {
    const removeSpy = vi.fn()
    mockAppAddListener.mockResolvedValue({ remove: removeSpy })

    const { init, destroy } = useAppLifecycle()
    await init('ws-1', vi.fn(), vi.fn())
    destroy()

    expect(removeSpy).toHaveBeenCalled()
  })

  // ── Share inbox ──────────────────────────────────────────────────────────

  describe('share inbox — _importPendingSharedFiles', () => {
    beforeEach(() => {
      mockCapacitorIsNative.mockReturnValue(true)
      mockCapacitorPlatform.mockReturnValue('ios')
    })

    it('ne fait rien si la plateforme n\'est pas iOS', async () => {
      mockCapacitorPlatform.mockReturnValue('android')
      mockFilesystemReaddir.mockResolvedValue({ files: ['uuid-1.manifest.json'] })

      const { init } = useAppLifecycle()
      await init('ws-1', vi.fn(), vi.fn())

      expect(mockFilesystemReaddir).not.toHaveBeenCalled()
      expect(mockUploadDocument).not.toHaveBeenCalled()
    })

    it('ne fait rien si l\'inbox est vide', async () => {
      mockFilesystemReaddir.mockResolvedValue({ files: [] })

      const { init } = useAppLifecycle()
      await init('ws-1', vi.fn(), vi.fn())

      expect(mockFilesystemReadFile).not.toHaveBeenCalled()
      expect(mockUploadDocument).not.toHaveBeenCalled()
    })

    it('ne fait rien s\'il n\'y a que des binaires orphelins sans manifest', async () => {
      mockFilesystemReaddir.mockResolvedValue({ files: ['uuid-orphan.pdf'] })

      const { init } = useAppLifecycle()
      await init('ws-1', vi.fn(), vi.fn())

      expect(mockFilesystemReadFile).not.toHaveBeenCalled()
      expect(mockUploadDocument).not.toHaveBeenCalled()
    })

    it('retourne silencieusement si le dossier inbox n\'existe pas encore', async () => {
      mockFilesystemReaddir.mockRejectedValue(new Error('Directory not found'))

      const { init } = useAppLifecycle()
      await expect(init('ws-1', vi.fn(), vi.fn())).resolves.not.toThrow()

      expect(mockUploadDocument).not.toHaveBeenCalled()
    })

    it('importe un fichier valide et construit un File avec les bons attributs', async () => {
      mockFilesystemReaddir.mockResolvedValue({
        files: ['uuid-1.manifest.json', 'uuid-1.pdf'],
      })
      mockFilesystemReadFile
        .mockResolvedValueOnce({ data: makeManifestJson() })
        .mockResolvedValueOnce({ data: FAKE_BASE64 })

      const { init } = useAppLifecycle()
      await init('ws-1', vi.fn(), vi.fn())

      expect(mockUploadDocument).toHaveBeenCalledOnce()
      const [workspaceId, file] = mockUploadDocument.mock.calls[0] as [string, File]
      expect(workspaceId).toBe('ws-1')
      expect(file).toBeInstanceOf(File)
      expect(file.name).toBe('document.pdf')
      expect(file.type).toBe('application/pdf')
    })

    it('déclenche fetchDocuments et startPolling après un import réussi', async () => {
      mockFilesystemReaddir.mockResolvedValue({
        files: ['uuid-1.manifest.json', 'uuid-1.pdf'],
      })
      mockFilesystemReadFile
        .mockResolvedValueOnce({ data: makeManifestJson() })
        .mockResolvedValueOnce({ data: FAKE_BASE64 })

      const { init } = useAppLifecycle()
      await init('ws-1', vi.fn(), vi.fn())

      expect(mockFetchDocuments).toHaveBeenCalledWith('ws-1')
      expect(mockStartPolling).toHaveBeenCalledWith('ws-1')
    })

    it('supprime le binaire et le manifest après un import réussi', async () => {
      mockFilesystemReaddir.mockResolvedValue({
        files: ['uuid-1.manifest.json', 'uuid-1.pdf'],
      })
      mockFilesystemReadFile
        .mockResolvedValueOnce({ data: makeManifestJson() })
        .mockResolvedValueOnce({ data: FAKE_BASE64 })

      const { init } = useAppLifecycle()
      await init('ws-1', vi.fn(), vi.fn())

      expect(mockFilesystemDeleteFile).toHaveBeenCalledTimes(2)
      const deletedPaths = mockFilesystemDeleteFile.mock.calls.map((c) => c[0].path)
      expect(deletedPaths).toContain('tidy_share_inbox/uuid-1.pdf')
      expect(deletedPaths).toContain('tidy_share_inbox/uuid-1.manifest.json')
    })

    it('ignore et nettoie un fichier avec un type MIME non supporté', async () => {
      mockFilesystemReaddir.mockResolvedValue({ files: ['uuid-2.manifest.json'] })
      mockFilesystemReadFile.mockResolvedValueOnce({
        data: makeManifestJson({ id: 'uuid-2', mimeType: 'text/plain', binaryFilename: 'uuid-2.txt' }),
      })

      const { init } = useAppLifecycle()
      await init('ws-1', vi.fn(), vi.fn())

      expect(mockUploadDocument).not.toHaveBeenCalled()
      expect(mockFilesystemDeleteFile).toHaveBeenCalled()
      expect(mockFetchDocuments).not.toHaveBeenCalled()
    })

    it('ignore et nettoie un fichier dépassant 50 Mo', async () => {
      mockFilesystemReaddir.mockResolvedValue({ files: ['uuid-3.manifest.json'] })
      mockFilesystemReadFile.mockResolvedValueOnce({
        data: makeManifestJson({
          id:             'uuid-3',
          fileSizeBytes:  51 * 1024 * 1024,
          binaryFilename: 'uuid-3.pdf',
        }),
      })

      const { init } = useAppLifecycle()
      await init('ws-1', vi.fn(), vi.fn())

      expect(mockUploadDocument).not.toHaveBeenCalled()
      expect(mockFilesystemDeleteFile).toHaveBeenCalled()
    })

    it('supprime un manifest au JSON invalide sans lever d\'erreur', async () => {
      mockFilesystemReaddir.mockResolvedValue({ files: ['uuid-bad.manifest.json'] })
      mockFilesystemReadFile.mockResolvedValueOnce({ data: 'NOT_VALID_JSON {{{' })

      const { init } = useAppLifecycle()
      await expect(init('ws-1', vi.fn(), vi.fn())).resolves.not.toThrow()

      expect(mockUploadDocument).not.toHaveBeenCalled()
      expect(mockFilesystemDeleteFile).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'tidy_share_inbox/uuid-bad.manifest.json' }),
      )
    })

    it('conserve le manifest si uploadDocument échoue (retry au prochain foreground)', async () => {
      mockFilesystemReaddir.mockResolvedValue({
        files: ['uuid-4.manifest.json', 'uuid-4.pdf'],
      })
      mockFilesystemReadFile
        .mockResolvedValueOnce({ data: makeManifestJson({ id: 'uuid-4', binaryFilename: 'uuid-4.pdf' }) })
        .mockResolvedValueOnce({ data: FAKE_BASE64 })
      mockUploadDocument.mockRejectedValueOnce(new Error('Network error'))

      const { init } = useAppLifecycle()
      await init('ws-1', vi.fn(), vi.fn())

      expect(mockFilesystemDeleteFile).not.toHaveBeenCalled()
      expect(mockFetchDocuments).not.toHaveBeenCalled()
    })

    it('importe plusieurs fichiers en séquence et n\'appelle fetchDocuments qu\'une fois', async () => {
      mockFilesystemReaddir.mockResolvedValue({
        files: [
          'uuid-a.manifest.json', 'uuid-a.pdf',
          'uuid-b.manifest.json', 'uuid-b.jpg',
        ],
      })
      mockFilesystemReadFile
        .mockResolvedValueOnce({ data: makeManifestJson({ id: 'uuid-a', filename: 'a.pdf',  binaryFilename: 'uuid-a.pdf' }) })
        .mockResolvedValueOnce({ data: FAKE_BASE64 })
        .mockResolvedValueOnce({ data: makeManifestJson({ id: 'uuid-b', filename: 'b.jpg', mimeType: 'image/jpeg', binaryFilename: 'uuid-b.jpg' }) })
        .mockResolvedValueOnce({ data: FAKE_BASE64 })

      const { init } = useAppLifecycle()
      await init('ws-1', vi.fn(), vi.fn())

      expect(mockUploadDocument).toHaveBeenCalledTimes(2)
      expect(mockFetchDocuments).toHaveBeenCalledOnce() // pas un appel par fichier
      expect(mockStartPolling).toHaveBeenCalledOnce()
    })

    it('ne lance pas de second import concurrent (_isImportingSharedFiles)', async () => {
      // Simuler un readdir lent pour que le premier import soit encore en cours
      let resolveReaddir!: () => void
      mockFilesystemReaddir.mockReturnValueOnce(
        new Promise<{ files: string[] }>((resolve) => {
          resolveReaddir = () => resolve({ files: [] })
        })
      )

      const { fire } = captureStateCallback()
      const { init } = useAppLifecycle()

      // Premier passage : init déclenche l'import (bloqué sur readdir)
      const initPromise = init('ws-1', vi.fn(), vi.fn())

      // Deuxième passage en foreground pendant que le premier est en cours
      fire({ isActive: true })
      await new Promise((r) => setTimeout(r, 0))

      // Débloquer le readdir
      resolveReaddir()
      await initPromise

      // Un seul appel à readdir malgré deux déclenchements
      expect(mockFilesystemReaddir).toHaveBeenCalledOnce()
    })
  })
})
