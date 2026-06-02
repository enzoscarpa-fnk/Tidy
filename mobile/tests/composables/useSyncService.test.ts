import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useSyncService } from '~/composables/useSyncService'

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockDb = {
  getAppState: vi.fn(),
  setAppState: vi.fn(),
  getPendingSyncLogEntries: vi.fn(),
  addSyncLogEntry: vi.fn(),
  updateSyncLogEntry: vi.fn(),
  getPendingOcrDocuments: vi.fn(),
  insertDocument: vi.fn(),
  updateDocument: vi.fn(),
  upsertDocumentFromCloud: vi.fn(),
  getDocumentById: vi.fn(),
}

const mockRequest = vi.fn()
const mockLocalRepo = {
  getPendingOcrDocuments: vi.fn(),
  upsertDocumentFromCloud: vi.fn(),
  getAllDocuments: vi.fn(),
  getDocumentById: vi.fn(),
  updateDocument: vi.fn(),
}
const mockReadRawFile = vi.fn()
const mockReadDecryptedFile = vi.fn()
const mockRefreshFromDatabase = vi.fn()

vi.mock('~/composables/useDatabaseService', () => ({
  useDatabaseService: () => mockDb,
}))

vi.mock('~/composables/useTidyApi', () => ({
  useTidyApi: () => ({ request: mockRequest }),
}))

vi.mock('~/composables/useLocalDocumentRepository', () => ({
  useLocalDocumentRepository: () => mockLocalRepo,
}))

vi.mock('~/composables/useFileSystem', () => ({
  useFileSystem: () => ({
    readRawFile: mockReadRawFile,
    readDecryptedFile: mockReadDecryptedFile,
  }),
}))

vi.mock('~/stores/document', () => ({
  useDocumentStore: () => ({ refreshFromDatabase: mockRefreshFromDatabase }),
}))

vi.mock('~/stores/localSearch', () => ({
  useLocalSearchStore: () => ({ query: '', searchOffline: vi.fn() }),
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeCloudDoc(overrides = {}) {
  return {
    id: 'doc-cloud-1',
    workspaceid: 'ws-1',
    originalfilename: 'invoice.pdf',
    mimetype: 'application/pdf',
    filesizebytes: 12345,
    tag: 'Facture',
    ocrtext: 'Montant: 150€',
    ocrstatus: 'done',
    ocrconfidence: 0.92,
    isdeleted: false,
    createdat: Date.now() - 5000,
    updatedat: Date.now(),
    ...overrides,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useSyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb.getAppState.mockResolvedValue(null)
    mockDb.setAppState.mockResolvedValue(undefined)
    mockDb.getPendingSyncLogEntries.mockResolvedValue([])
    mockDb.getPendingOcrDocuments.mockResolvedValue([])
    mockDb.updateSyncLogEntry.mockResolvedValue(undefined)
    mockDb.updateDocument.mockResolvedValue(undefined)
    mockLocalRepo.getPendingOcrDocuments.mockResolvedValue([])
    mockLocalRepo.upsertDocumentFromCloud.mockResolvedValue(undefined)
    mockRefreshFromDatabase.mockResolvedValue(undefined)
  })

  // ── Pull ────────────────────────────────────────────────────

  describe('pullFromCloud', () => {
    it('devrait appeler GET /documents/sync?since et upserter chaque document reçu', async () => {
      const cloudDocs = [makeCloudDoc(), makeCloudDoc({ id: 'doc-cloud-2' })]
      mockRequest.mockResolvedValue({
        data: {
          documents: cloudDocs,
          server_timestamp: '2026-05-19T12:00:00.000Z',
        },
      })

      const { pullFromCloud } = useSyncService()
      await pullFromCloud('ws-1')

      expect(mockRequest).toHaveBeenCalledWith(
        expect.stringContaining('/documents/sync?since='),
      )
      expect(mockLocalRepo.upsertDocumentFromCloud).toHaveBeenCalledTimes(2)
      expect(mockDb.setAppState).toHaveBeenCalledWith(
        'lastSyncAt_ws-1',
        '2026-05-19T12:00:00.000Z',
      )
    })

    it('devrait utiliser la valeur lastSyncAt stockée dans appstate', async () => {
      mockDb.getAppState.mockResolvedValue('2026-05-10T10:00:00.000Z')
      mockRequest.mockResolvedValue({ data: [], meta: { serverTimestamp: '2026-05-19T12:00:00.000Z' } })

      const { pullFromCloud } = useSyncService()
      await pullFromCloud('ws-1')

      expect(mockRequest).toHaveBeenCalledWith(
        expect.stringContaining('since=2026-05-10T10%3A00%3A00.000Z'),
      )
    })

    it('devrait être silencieux en cas d\'erreur réseau (ne pas throw)', async () => {
      mockRequest.mockRejectedValue(new Error('Network error'))

      const { pullFromCloud } = useSyncService()
      await expect(pullFromCloud('ws-1')).resolves.toBeUndefined()
    })

    it('ne devrait pas appeler upsert si data est null', async () => {
      mockRequest.mockResolvedValue({ data: null, meta: {} })

      const { pullFromCloud } = useSyncService()
      await pullFromCloud('ws-1')

      expect(mockLocalRepo.upsertDocumentFromCloud).not.toHaveBeenCalled()
    })
  })

  // ── LWW ────────────────────────────────────────────────────

  describe('LWW — Last Write Wins', () => {
    it('devrait mettre à jour SQLite si le doc serveur est plus récent', async () => {
      const serverUpdatedAt = Date.now()
      const cloudDoc = makeCloudDoc({ updatedat: serverUpdatedAt })

      mockRequest.mockResolvedValue({
        data: {
          documents: [cloudDoc],
          server_timestamp: new Date(serverUpdatedAt).toISOString(),
        },
      })

      // upsertDocumentFromCloud gère LWW en interne (Blueprint R19)
      const { pullFromCloud } = useSyncService()
      await pullFromCloud('ws-1')

      expect(mockLocalRepo.upsertDocumentFromCloud).toHaveBeenCalledWith(
        expect.objectContaining({ id: cloudDoc.id })
      )
    })
  })

  // ── Upload S3 ───────────────────────────────────────────────

  describe('uploadPendingFiles', () => {
    it('devrait appeler POST /files/upload-url puis PUT vers l\'URL presignée', async () => {
      const entry = {
        id: 1,
        documentId: 'doc-1',
        mimeType: 'application/pdf',
        fileSizeBytes: 5000,
        localPath: 'tidy/files/doc-1.pdf',
        operation: 'upload',
        status: 'pending',
      }
      mockDb.getPendingSyncLogEntries.mockResolvedValue([entry])
      mockRequest.mockResolvedValue({
      data: { uploadUrl: 'https://s3.example.com/presigned', s3Key: 's3/doc-1.pdf' },
    })
      const mockBuffer = new ArrayBuffer(8)
      mockReadRawFile.mockResolvedValue(mockBuffer)

      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })

      const { uploadPendingFiles } = useSyncService()
      await uploadPendingFiles()

      expect(mockRequest).toHaveBeenCalledWith(
        '/files/upload-url',
        expect.objectContaining({ method: 'POST' }),
      )
      expect(global.fetch).toHaveBeenCalledWith(
        'https://s3.example.com/presigned',
        expect.objectContaining({ method: 'PUT' }),
      )
      expect(mockDb.updateSyncLogEntry).toHaveBeenCalledWith(
        1,
        'done',
      )
    })

    it('ne devrait pas déchiffrer le fichier avant l\'upload S3 (blob opaque R20)', async () => {
      const entry = {
        id: 2,
        documentId: 'doc-2',
        mimeType: 'image/jpeg',
        fileSizeBytes: 3000,
        localPath: 'tidy/files/doc-2.jpg',
        operation: 'upload',
        status: 'pending',
      }
      mockDb.getPendingSyncLogEntries.mockResolvedValue([entry])
      mockRequest.mockResolvedValue({ data:  { uploadUrl: 'https://s3.example.com/x', s3Key: 'x' } })
      mockReadRawFile.mockResolvedValue(new ArrayBuffer(4))
      global.fetch = vi.fn().mockResolvedValue({ ok: true })

      const { uploadPendingFiles } = useSyncService()
      await uploadPendingFiles()

      // readRawFile doit être appelé (pas readDecryptedFile)
      expect(mockReadRawFile).toHaveBeenCalledWith(entry.localPath)
      expect(mockReadDecryptedFile).not.toHaveBeenCalled()
    })

    it('devrait marquer l\'entrée synclog en erreur si le PUT S3 échoue', async () => {
      const entry = {
        id: 3,
        documentId: 'doc-3',
        mimeType: 'application/pdf',
        fileSizeBytes: 1000,
        localPath: 'tidy/files/doc-3.pdf',
        operation: 'upload',
        status: 'pending',
      }
      mockDb.getPendingSyncLogEntries.mockResolvedValue([entry])
      mockRequest.mockResolvedValue({ data:  { uploadUrl: 'https://s3.example.com/y', s3Key: 'y' } })
      mockReadRawFile.mockResolvedValue(new ArrayBuffer(4))
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })

      const { uploadPendingFiles } = useSyncService()
      await uploadPendingFiles()

      expect(mockDb.updateSyncLogEntry).toHaveBeenCalledWith(
        3,
        'error',
        expect.any(String),
      )
    })
  })

  // ── Push metadata ───────────────────────────────────────────

  describe('pushToCloud', () => {
    it('devrait appeler POST /documents/sync avec les documents pendants', async () => {
      const entries = [
        { id: 10, documentId: 'doc-10', operation: 'update_meta', status: 'pending' },
      ]
      mockDb.getPendingSyncLogEntries.mockResolvedValue(entries)
      mockLocalRepo.getDocumentById.mockResolvedValue({
        id: 'doc-10',
        originalfilename: 'contract.pdf',
        mimetype: 'application/pdf',
        filesizebytes: 2000,
        tag: 'Contrat',
        ocrtext: 'Contrat signé',
        ocrstatus: 'done',
        isdeleted: 0,
        createdat: 1000000,
        updatedat: 2000000,
      })
      mockRequest.mockResolvedValue({
        data: [{ id: 'doc-10', status: 'updated', serverUpdatedAt: '2026-05-19T12:00:00.000Z' }],
      })

      const { pushToCloud } = useSyncService()
      await pushToCloud()

      expect(mockRequest).toHaveBeenCalledWith(
        '/documents/sync',
        expect.objectContaining({ method: 'POST' }),
      )
      expect(mockDb.updateSyncLogEntry).toHaveBeenCalledWith(
        10,
        'done',
      )
    })

    it('ne devrait rien faire si aucune entrée pendante', async () => {
      mockDb.getPendingSyncLogEntries.mockResolvedValue([])

      const { pushToCloud } = useSyncService()
      await pushToCloud()

      expect(mockRequest).not.toHaveBeenCalled()
    })
  })

  // ── OCR Queue ───────────────────────────────────────────────

  describe('processOcrQueue', () => {
    it('devrait traiter les docs en attente de façon séquentielle (R21)', async () => {
      const callOrder: string[] = []
      const docs = [
        { id: 'doc-ocr-1', localPath: 'tidy/files/doc-ocr-1.pdf', mimeType: 'application/pdf', ocrStatus: 'pending' },
        { id: 'doc-ocr-2', localPath: 'tidy/files/doc-ocr-2.pdf', mimeType: 'application/pdf', ocrStatus: 'pending' },
      ]
      mockLocalRepo.getPendingOcrDocuments.mockResolvedValue(docs)
      mockReadDecryptedFile.mockImplementation(async (path: string) => {
        callOrder.push(path)
        return new ArrayBuffer(4)
      })
      mockRequest.mockResolvedValue({
        data: { ocrText: 'Texte extrait', confidence: 0.88 },
    })

      const { processOcrQueue } = useSyncService()
      await processOcrQueue()

      // Séquentiel : doc-ocr-1 avant doc-ocr-2
      expect(callOrder[0]).toContain('doc-ocr-1')
      expect(callOrder[1]).toContain('doc-ocr-2')
    })

    it('devrait marquer ocrStatus=failed après 3 tentatives échouées', async () => {
      const doc = {
        id: 'doc-fail',
        localPath: 'tidy/files/doc-fail.pdf',
        mimeType: 'application/pdf',
        ocrStatus: 'pending',
      }
      mockLocalRepo.getPendingOcrDocuments.mockResolvedValue([doc])
      mockReadDecryptedFile.mockResolvedValue(new ArrayBuffer(4))
      mockRequest.mockRejectedValue(new Error('OCR server error'))

      const { processOcrQueue } = useSyncService()
      await processOcrQueue()

      expect(mockLocalRepo.updateDocument).toHaveBeenCalledWith(
        'doc-fail',
        expect.objectContaining({ ocrStatus: 'failed' }),
      )
    })

    it('ne devrait pas throw si la queue est vide', async () => {
      mockLocalRepo.getPendingOcrDocuments.mockResolvedValue([])

      const { processOcrQueue } = useSyncService()
      await expect(processOcrQueue()).resolves.toBeUndefined()
    })
  })

  // ── Guard isSyncing ─────────────────────────────────────────

  describe('guard isSyncing', () => {
    it('ne devrait pas démarrer une 2ème sync si une est déjà en cours', async () => {
      let syncResolve!: () => void
      const blockingPromise = new Promise<{ data: never[]; meta: object }>((resolve) => {
        syncResolve = () => resolve({ data: [], meta: { serverTimestamp: new Date().toISOString() } })
      })

      mockDb.getAppState.mockResolvedValue(null)
      mockRequest.mockReturnValue(blockingPromise)

      // Deux instances distinctes — le guard _isSyncing est au niveau module
      const { triggerAsync: trigger1 } = useSyncService()
      const { triggerAsync: trigger2 } = useSyncService()

      // Premier appel — bloqué sur mockRequest (dans pullFromCloud)
      trigger1('ws-1')

      // Laisser le temps d'atteindre mockRequest : getAppState → request
      await new Promise((r) => setTimeout(r, 10))

      // _isSyncing module-level est true → trigger2 doit être ignoré
      trigger2('ws-1')

      // Débloquer
      syncResolve()
      await new Promise((r) => setTimeout(r, 20))

      // mockRequest appelé exactement 1 fois (le second trigger a été ignoré)
      expect(mockRequest).toHaveBeenCalledTimes(1)
    })
  })

  // ── refreshFromDatabase après syncAll ──────────────────────

  describe('syncAll', () => {
    it('devrait appeler refreshFromDatabase une fois le cycle terminé', async () => {
      mockRequest.mockResolvedValue({ data: [], meta: { serverTimestamp: new Date().toISOString() } })

      const { syncAll } = useSyncService()
      await syncAll('ws-1')

      expect(mockRefreshFromDatabase).toHaveBeenCalledWith('ws-1')
    })
  })
})
