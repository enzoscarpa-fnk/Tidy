import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeDocument, makeDocumentDetail, makeDocumentIntelligence, makeDocumentMetadata } from '../utils/factories'

// ── Mock DB ────────────────────────────────────────────────────────────────

const mockDb = {
  run: vi.fn().mockResolvedValue(undefined),
  query: vi.fn().mockResolvedValue({ values: [] }),
}

vi.mock('~/composables/useDatabaseService', () => ({
  useDatabaseService: () => ({
    getDatabase: () => mockDb,
  }),
}))

// ── Import après mocks ─────────────────────────────────────────────────────

import { useLocalDocumentRepository } from '~/composables/useLocalDocumentRepository'
import type { CloudDocumentPayload } from '~/composables/useLocalDocumentRepository'

// ── Helpers ────────────────────────────────────────────────────────────────

/** Construit une row SQLite brute à partir d'un DocumentListItem */
function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-123',
    workspace_id: 'ws-456',
    title: 'Facture Adobe Janvier 2025',
    original_filename: 'facture_adobe_2025-01.pdf',
    mime_type: 'application/pdf',
    file_size_bytes: 245760,
    processing_status: 'ENRICHED',
    thumbnail_url: null,
    local_path: null,
    cloud_key: null,
    detected_type: null,
    suggested_tags: null,
    global_confidence: null,
    extracted_entities: null,
    user_tags: '[]',
    notes: null,
    user_override_type: null,
    last_edited_at: null,
    extracted_text: null,
    text_extraction_method: null,
    page_count: null,
    ocr_status: 'none',
    sync_status: 'synced',
    uploaded_at: '2026-01-12T10:00:00.000Z',
    updated_at: '2026-01-12T10:00:00.000Z',
    client_updated_at: '2026-01-12T10:00:00.000Z',
    is_deleted: 0,
    ...overrides,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('useLocalDocumentRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb.run.mockResolvedValue(undefined)
    mockDb.query.mockResolvedValue({ values: [] })
  })

  describe('insertDocument()', () => {
    it('insère un document avec les bons paramètres SQL', async () => {
      const { insertDocument } = useLocalDocumentRepository()
      const doc = makeDocument()

      await insertDocument(doc)

      expect(mockDb.run).toHaveBeenCalledOnce()
      const [sql, params] = mockDb.run.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('INSERT INTO documents')
      expect(params).toContain(doc.id)
      expect(params).toContain(doc.workspaceId)
      expect(params).toContain(doc.title)
    })

    it('sérialise les userTags en JSON string', async () => {
      const { insertDocument } = useLocalDocumentRepository()
      const doc = makeDocument({
        metadata: makeDocumentMetadata({ userTags: ['tag1', 'tag2'] }),
      })

      await insertDocument(doc)

      const [, params] = mockDb.run.mock.calls[0] as [string, unknown[]]
      expect(params).toContain(JSON.stringify(['tag1', 'tag2']))
    })

    it('insère null pour intelligence si absente', async () => {
      const { insertDocument } = useLocalDocumentRepository()
      const doc = makeDocument({ intelligence: null })

      await insertDocument(doc)

      const [, params] = mockDb.run.mock.calls[0] as [string, unknown[]]
      // detected_type, suggested_tags, global_confidence, extracted_entities = null
      expect(params).toContain(null)
    })
  })

  describe('getDocumentById()', () => {
    it('retourne null si le document n\'existe pas', async () => {
      const { getDocumentById } = useLocalDocumentRepository()
      mockDb.query.mockResolvedValueOnce({ values: [] })

      const result = await getDocumentById('nonexistent')
      expect(result).toBeNull()
    })

    it('retourne un DocumentDetail mappé depuis la row SQLite', async () => {
      const { getDocumentById } = useLocalDocumentRepository()
      mockDb.query.mockResolvedValueOnce({ values: [makeRow()] })

      const result = await getDocumentById('doc-123')

      expect(result).not.toBeNull()
      expect(result!.id).toBe('doc-123')
      expect(result!.workspaceId).toBe('ws-456')
      expect(result!.processingStatus).toBe('ENRICHED')
    })

    it('parse correctement les champs intelligence depuis JSON', async () => {
      const { getDocumentById } = useLocalDocumentRepository()
      const intelligence = makeDocumentIntelligence()
      mockDb.query.mockResolvedValueOnce({
        values: [makeRow({
          detected_type: intelligence.detectedType,
          suggested_tags: JSON.stringify(intelligence.suggestedTags),
          global_confidence: intelligence.globalConfidenceScore,
          extracted_entities: JSON.stringify(intelligence.extractedEntities),
        })],
      })

      const result = await getDocumentById('doc-123')

      expect(result!.intelligence).not.toBeNull()
      expect(result!.intelligence!.detectedType).toBe('INVOICE')
      expect(result!.intelligence!.suggestedTags).toEqual(['Adobe', 'Logiciel'])
      expect(result!.intelligence!.globalConfidenceScore).toBe(0.92)
    })
  })

  describe('getAllDocuments()', () => {
    it('retourne une liste vide si aucun document', async () => {
      const { getAllDocuments } = useLocalDocumentRepository()
      const result = await getAllDocuments('ws-456')
      expect(result).toEqual([])
    })

    it('retourne les documents mappés du workspace', async () => {
      const { getAllDocuments } = useLocalDocumentRepository()
      mockDb.query.mockResolvedValueOnce({
        values: [makeRow(), makeRow({ id: 'doc-456', title: 'Contrat 2026' })],
      })

      const result = await getAllDocuments('ws-456')
      expect(result).toHaveLength(2)
      expect(result[0]!.id).toBe('doc-123')
      expect(result[1]!.id).toBe('doc-456')
    })

    it('filtre par processingStatus', async () => {
      const { getAllDocuments } = useLocalDocumentRepository()
      await getAllDocuments('ws-456', { status: 'FAILED' })

      const [sql, params] = mockDb.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('processing_status IN')
      expect(params).toContain('FAILED')
    })

    it('filtre par detectedType', async () => {
      const { getAllDocuments } = useLocalDocumentRepository()
      await getAllDocuments('ws-456', { detectedType: 'INVOICE' })

      const [sql, params] = mockDb.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('detected_type IN')
      expect(params).toContain('INVOICE')
    })

    it('filtre par userTags via LIKE', async () => {
      const { getAllDocuments } = useLocalDocumentRepository()
      await getAllDocuments('ws-456', { userTags: ['Adobe'] })

      const [sql, params] = mockDb.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('user_tags LIKE')
      expect(params).toContain('%"Adobe"%')
    })
  })

  describe('updateDocument()', () => {
    it('ne fait rien si aucun champ fourni', async () => {
      const { updateDocument } = useLocalDocumentRepository()
      await updateDocument('doc-123', {})
      expect(mockDb.run).not.toHaveBeenCalled()
    })

    it('met à jour uniquement les champs fournis', async () => {
      const { updateDocument } = useLocalDocumentRepository()
      await updateDocument('doc-123', { title: 'Nouveau titre' })

      const [sql, params] = mockDb.run.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('title = ?')
      expect(params).toContain('Nouveau titre')
      expect(sql).not.toContain('user_tags = ?')
    })

    it('sérialise userTags en JSON', async () => {
      const { updateDocument } = useLocalDocumentRepository()
      await updateDocument('doc-123', { userTags: ['tag-a', 'tag-b'] })

      const [, params] = mockDb.run.mock.calls[0] as [string, unknown[]]
      expect(params).toContain(JSON.stringify(['tag-a', 'tag-b']))
    })
  })

  describe('softDeleteDocument()', () => {
    it('marque le document comme supprimé avec sync_status pending', async () => {
      const { softDeleteDocument } = useLocalDocumentRepository()
      await softDeleteDocument('doc-123')

      const [sql, params] = mockDb.run.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('is_deleted = 1')
      expect(sql).toContain("sync_status = 'pending'")
      expect(params).toContain('doc-123')
    })
  })

  describe('getPendingOcrDocuments()', () => {
    it('retourne les documents avec ocr_status = pending', async () => {
      const { getPendingOcrDocuments } = useLocalDocumentRepository()
      mockDb.query.mockResolvedValueOnce({
        values: [makeRow({ ocr_status: 'pending' })],
      })

      const result = await getPendingOcrDocuments()
      expect(result).toHaveLength(1)

      const [sql] = mockDb.query.mock.calls[0] as [string]
      expect(sql).toContain("ocr_status = 'pending'")
    })
  })

  describe('upsertDocumentFromCloud()', () => {
    const basePayload = (): CloudDocumentPayload => ({
      ...makeDocument(),
      clientUpdatedAt: '2026-01-13T10:00:00.000Z',
    })

    it('crée le document s\'il n\'existe pas localement', async () => {
      const { upsertDocumentFromCloud } = useLocalDocumentRepository()
      mockDb.query.mockResolvedValueOnce({ values: [] })

      const result = await upsertDocumentFromCloud(basePayload())
      expect(result).toBe('created')
      expect(mockDb.run).toHaveBeenCalled()
    })

    it('skip si le timestamp local est plus récent', async () => {
      const { upsertDocumentFromCloud } = useLocalDocumentRepository()
      mockDb.query.mockResolvedValueOnce({
        values: [{ id: 'doc-123', client_updated_at: '2026-01-14T10:00:00.000Z' }],
      })

      const result = await upsertDocumentFromCloud(basePayload())
      expect(result).toBe('skipped')
    })

    it('met à jour si le timestamp cloud est plus récent', async () => {
      const { upsertDocumentFromCloud } = useLocalDocumentRepository()
      mockDb.query.mockResolvedValueOnce({
        values: [{ id: 'doc-123', client_updated_at: '2026-01-10T10:00:00.000Z' }],
      })

      const result = await upsertDocumentFromCloud(basePayload())
      expect(result).toBe('updated')
    })

    it('skip si les timestamps sont identiques (LWW — pas de ré-écriture inutile)', async () => {
      const { upsertDocumentFromCloud } = useLocalDocumentRepository()
      mockDb.query.mockResolvedValueOnce({
        values: [{ id: 'doc-123', client_updated_at: '2026-01-13T10:00:00.000Z' }],
      })

      const payload = { ...basePayload(), clientUpdatedAt: '2026-01-13T10:00:00.000Z' }
      const result = await upsertDocumentFromCloud(payload)
      expect(result).toBe('skipped')
    })
  })

  describe('searchDocuments()', () => {
    it('retourne une liste vide pour une query vide', async () => {
      const { searchDocuments } = useLocalDocumentRepository()
      const result = await searchDocuments('ws-456', '')
      expect(result).toEqual([])
      expect(mockDb.query).not.toHaveBeenCalled()
    })

    it('retourne une liste vide pour une query de whitespace', async () => {
      const { searchDocuments } = useLocalDocumentRepository()
      const result = await searchDocuments('ws-456', '   ')
      expect(result).toEqual([])
    })

    it('exécute une requête FTS5 avec la query sanitisée', async () => {
      const { searchDocuments } = useLocalDocumentRepository()
      mockDb.query.mockResolvedValueOnce({ values: [] })

      await searchDocuments('ws-456', 'facture')

      const [sql, params] = mockDb.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('documents_fts MATCH')
      expect(sql).toContain('ORDER BY fts.rank')
      expect(params[0]).toContain('"facture"*')
      expect(params[1]).toBe('ws-456')
    })

    it('retourne les documents mappés triés par pertinence FTS5', async () => {
      const { searchDocuments } = useLocalDocumentRepository()
      mockDb.query.mockResolvedValueOnce({
        values: [
          makeRow({ id: 'doc-1', title: 'Facture Adobe' }),
          makeRow({ id: 'doc-2', title: 'Facture Microsoft' }),
        ],
      })

      const result = await searchDocuments('ws-456', 'facture')
      expect(result).toHaveLength(2)
      expect(result[0]!.id).toBe('doc-1')
      expect(result[1]!.id).toBe('doc-2')
    })

    it('échappe les guillemets doubles dans la query FTS5', async () => {
      const { searchDocuments } = useLocalDocumentRepository()
      mockDb.query.mockResolvedValueOnce({ values: [] })

      await searchDocuments('ws-456', '"facture"')

      const [, params] = mockDb.query.mock.calls[0] as [string, unknown[]]
      expect(params[0]).toContain('""facture""')
    })
  })
})
