import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { DocumentRepositoryAdapter } from './document.repository.adapter';
import { DocumentMetadata } from '../../../modules/document/domain/document-metadata.value-object';
import { DocumentIntelligence } from '../../../modules/document/domain/document-intelligence.value-object';

// ── Mock PrismaClient ─────────────────────────────────────────────────────────

const mockPrisma = {
  document: {
    create:     vi.fn(),
    findUnique: vi.fn(),
    findMany:   vi.fn(),
    count:      vi.fn(),
    update:     vi.fn(),
  },
  $transaction: vi.fn(),
};

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DOC_ID  = 'doc-uuid-1111';
const WS_ID   = 'ws-uuid-aaaa';
const USER_ID = 'user-uuid-bbbb';
const NOW     = new Date('2026-03-05T00:00:00Z');

const prismaDocBase = {
  id:                   DOC_ID,
  workspaceId:          WS_ID,
  uploadedById:         USER_ID,
  originalFilename:     'facture.pdf',
  mimeType:             'application/pdf',
  fileSizeBytes:        BigInt(204800),
  pageCount:            null,
  s3Key:                null,
  thumbnailRef:         null,
  processingStatus:     'UPLOADED' as const,
  textExtractionMethod: null,
  isDeleted:            false,
  extractedText:        null,
  metadata:             { title: 'facture', userTags: [], notes: null, lastEditedAt: null },
  intelligence:         null,
  detectedType:         null,
  uploadedAt:           NOW,
  updatedAt:            NOW,
  syncedAt:             NOW,
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('DocumentRepositoryAdapter', () => {
  let adapter: DocumentRepositoryAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new DocumentRepositoryAdapter(mockPrisma as never);
    mockPrisma.$transaction.mockImplementation(
      (ops: Promise<unknown>[]) => Promise.all(ops),
    );
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a document and return a domain entity', async () => {
      mockPrisma.document.create.mockResolvedValueOnce(prismaDocBase);

      const result = await adapter.create({
        id:               DOC_ID,
        workspaceId:      WS_ID,
        uploadedById:     USER_ID,
        originalFilename: 'facture.pdf',
        mimeType:         'application/pdf',
        fileSizeBytes:    204800,
        uploadedAt:       NOW,
      });

      expect(result.id).toBe(DOC_ID);
      expect(result.processingStatus).toBe('UPLOADED');
      expect(result.fileSizeBytes).toBe(204800); // BigInt → number
      expect(result.intelligence).toBeNull();
    });

    it('should set title to originalFilename without extension when no title provided', async () => {
      mockPrisma.document.create.mockResolvedValueOnce(prismaDocBase);
      await adapter.create({
        id: DOC_ID, workspaceId: WS_ID, uploadedById: USER_ID,
        originalFilename: 'facture.pdf', mimeType: 'application/pdf',
        fileSizeBytes: 100, uploadedAt: NOW,
      });

      const callData = mockPrisma.document.create.mock.calls[0][0].data;
      expect(callData.title).toBe('facture');
    });

    it('should use provided title when given', async () => {
      mockPrisma.document.create.mockResolvedValueOnce(prismaDocBase);
      await adapter.create({
        id: DOC_ID, workspaceId: WS_ID, uploadedById: USER_ID,
        originalFilename: 'facture.pdf', mimeType: 'application/pdf',
        fileSizeBytes: 100, uploadedAt: NOW,
        title: 'Facture Adobe Janvier 2025',
      });

      const callData = mockPrisma.document.create.mock.calls[0][0].data;
      expect(callData.title).toBe('Facture Adobe Janvier 2025');
    });

    it('should convert fileSizeBytes to BigInt for Prisma', async () => {
      mockPrisma.document.create.mockResolvedValueOnce(prismaDocBase);
      await adapter.create({
        id: DOC_ID, workspaceId: WS_ID, uploadedById: USER_ID,
        originalFilename: 'f.pdf', mimeType: 'application/pdf',
        fileSizeBytes: 52428800, uploadedAt: NOW,
      });

      const callData = mockPrisma.document.create.mock.calls[0][0].data;
      expect(typeof callData.fileSizeBytes).toBe('bigint');
      expect(callData.fileSizeBytes).toBe(BigInt(52428800));
    });
  });

  // ── findById ──────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return domain entity when found', async () => {
      mockPrisma.document.findUnique.mockResolvedValueOnce(prismaDocBase);
      const result = await adapter.findById(DOC_ID);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(DOC_ID);
    });

    it('should return null when not found', async () => {
      mockPrisma.document.findUnique.mockResolvedValueOnce(null);
      const result = await adapter.findById('nonexistent');
      expect(result).toBeNull();
    });

    it('should deserialize DocumentIntelligence when present', async () => {
      const withIntelligence = {
        ...prismaDocBase,
        processingStatus: 'ENRICHED' as const,
        detectedType:     'INVOICE' as const,
        intelligence: {
          extractedEntities:    [{ entityType: 'AMOUNT', value: '1250', confidence: 0.97 }],
          globalConfidenceScore: 0.94,
          suggestedTags:        ['facture', 'adobe'],
        },
      };
      mockPrisma.document.findUnique.mockResolvedValueOnce(withIntelligence);

      const result = await adapter.findById(DOC_ID);
      expect(result!.intelligence).not.toBeNull();
      expect(result!.intelligence!.detectedType).toBe('INVOICE');
      expect(result!.intelligence!.globalConfidenceScore).toBe(0.94);
      expect(result!.intelligence!.extractedEntities).toHaveLength(1);
    });

    it('should deserialize DocumentMetadata JSONB correctly', async () => {
      const withMeta = {
        ...prismaDocBase,
        metadata: {
          title:       'Facture Adobe',
          userTags:    ['logiciel', 'adobe'],
          notes:       'déclarer Q1',
          lastEditedAt: '2026-03-01T11:30:00.000Z',
        },
      };
      mockPrisma.document.findUnique.mockResolvedValueOnce(withMeta);

      const result = await adapter.findById(DOC_ID);
      expect(result!.metadata.title).toBe('Facture Adobe');
      expect(result!.metadata.userTags).toEqual(['logiciel', 'adobe']);
      expect(result!.metadata.notes).toBe('déclarer Q1');
      expect(result!.metadata.lastEditedAt).toBeInstanceOf(Date);
    });
  });

  // ── findAllByWorkspace ────────────────────────────────────────────────────

  describe('findAllByWorkspace', () => {
    it('should return items and total', async () => {
      mockPrisma.document.findMany.mockResolvedValueOnce([prismaDocBase]);
      mockPrisma.document.count.mockResolvedValueOnce(1);

      const result = await adapter.findAllByWorkspace(WS_ID, {});
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should filter by processingStatus', async () => {
      mockPrisma.document.findMany.mockResolvedValueOnce([]);
      mockPrisma.document.count.mockResolvedValueOnce(0);

      await adapter.findAllByWorkspace(WS_ID, { processingStatus: ['ENRICHED', 'FAILED'] });

      const where = mockPrisma.document.findMany.mock.calls[0][0].where;
      expect(where.processingStatus).toEqual({ in: ['ENRICHED', 'FAILED'] });
    });

    it('should filter by detectedType', async () => {
      mockPrisma.document.findMany.mockResolvedValueOnce([]);
      mockPrisma.document.count.mockResolvedValueOnce(0);

      await adapter.findAllByWorkspace(WS_ID, { detectedType: ['INVOICE'] });

      const where = mockPrisma.document.findMany.mock.calls[0][0].where;
      expect(where.detectedType).toEqual({ in: ['INVOICE'] });
    });

    it('should always filter isDeleted: false', async () => {
      mockPrisma.document.findMany.mockResolvedValueOnce([]);
      mockPrisma.document.count.mockResolvedValueOnce(0);

      await adapter.findAllByWorkspace(WS_ID, {});

      const where = mockPrisma.document.findMany.mock.calls[0][0].where;
      expect(where.isDeleted).toBe(false);
    });

    it('should apply pagination correctly', async () => {
      mockPrisma.document.findMany.mockResolvedValueOnce([]);
      mockPrisma.document.count.mockResolvedValueOnce(100);

      await adapter.findAllByWorkspace(WS_ID, { page: 3, limit: 10 });

      const call = mockPrisma.document.findMany.mock.calls[0][0];
      expect(call.skip).toBe(20); // (3-1) * 10
      expect(call.take).toBe(10);
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update metadata and sync title column', async () => {
      const newMeta = new DocumentMetadata('Nouveau titre', ['tag1'], null, null);
      mockPrisma.document.update.mockResolvedValueOnce({
        ...prismaDocBase,
        title:    'Nouveau titre',
        metadata: newMeta.toJSON(),
      });

      await adapter.update(DOC_ID, { metadata: newMeta });

      const callData = mockPrisma.document.update.mock.calls[0][0].data;
      expect(callData.title).toBe('Nouveau titre');
      expect(callData.metadata).toEqual(newMeta.toJSON());
    });

    it('should set intelligence to JsonNull when null passed', async () => {
      mockPrisma.document.update.mockResolvedValueOnce(prismaDocBase);

      await adapter.update(DOC_ID, { intelligence: null });

      const callData = mockPrisma.document.update.mock.calls[0][0].data;
      expect(callData.intelligence).toBe(Prisma.JsonNull);
      expect(callData.detectedType).toBeNull();
    });

    it('should not overwrite fields not included in UpdateDocumentData', async () => {
      mockPrisma.document.update.mockResolvedValueOnce(prismaDocBase);

      await adapter.update(DOC_ID, { s3Key: 'uploads/doc.pdf' });

      const callData = mockPrisma.document.update.mock.calls[0][0].data;
      expect(callData.title).toBeUndefined();
      expect(callData.metadata).toBeUndefined();
      expect(callData.s3Key).toBe('uploads/doc.pdf');
    });
  });

  // ── softDelete ────────────────────────────────────────────────────────────

  describe('softDelete', () => {
    it('should set isDeleted to true', async () => {
      mockPrisma.document.update.mockResolvedValueOnce({ ...prismaDocBase, isDeleted: true });

      await adapter.softDelete(DOC_ID);

      const callData = mockPrisma.document.update.mock.calls[0][0];
      expect(callData.where).toEqual({ id: DOC_ID });
      expect(callData.data.isDeleted).toBe(true);
    });
  });

  // ── updateStatus ──────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('should update processingStatus', async () => {
      mockPrisma.document.update.mockResolvedValueOnce({
        ...prismaDocBase, processingStatus: 'PROCESSING',
      });

      await adapter.updateStatus(DOC_ID, 'PROCESSING');

      const callData = mockPrisma.document.update.mock.calls[0][0].data;
      expect(callData.processingStatus).toBe('PROCESSING');
    });

    it('should update textExtractionMethod when provided', async () => {
      mockPrisma.document.update.mockResolvedValueOnce(prismaDocBase);

      await adapter.updateStatus(DOC_ID, 'ENRICHED', 'NATIVE_PDF');

      const callData = mockPrisma.document.update.mock.calls[0][0].data;
      expect(callData.textExtractionMethod).toBe('NATIVE_PDF');
    });

    it('should NOT include textExtractionMethod when not provided', async () => {
      mockPrisma.document.update.mockResolvedValueOnce(prismaDocBase);

      await adapter.updateStatus(DOC_ID, 'PROCESSING');

      const callData = mockPrisma.document.update.mock.calls[0][0].data;
      expect(callData.textExtractionMethod).toBeUndefined();
    });
  });
});
