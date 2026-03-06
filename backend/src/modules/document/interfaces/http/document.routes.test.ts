import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify          from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import { createDocumentRoutes } from './document.routes';

// ── Mock authenticate : contourne le vrai hook JWT ────────────────────────────
// vi.mock doit être au niveau module (avant les imports qui utilisent le hook)
vi.mock('../../../../shared/plugins/authenticate.hook', () => ({
  authenticate: vi.fn(async () => {
    // no-op : request.user est déjà injecté par le hook onRequest du test
  }),
}));

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockDocumentRepo = {
  create:                    vi.fn(),
  findById:                  vi.fn(),
  findByIdWithEvents:        vi.fn(),
  findAllByWorkspace:        vi.fn(),
  update:                    vi.fn(),
  softDelete:                vi.fn(),
  updateStatus:              vi.fn(),
  countActiveByUploadedById: vi.fn(),
};

const mockWorkspaceRepo = { findById: vi.fn() };

const mockS3Service = {
  putObject:               vi.fn().mockResolvedValue(undefined),
  getObject:               vi.fn(),
  generatePresignedGetUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned'),
  generatePresignedPutUrl: vi.fn(),
  deleteObject:            vi.fn(),
};

const mockEventBus = { publish: vi.fn(), subscribe: vi.fn() };

// ── Fixtures ───────────────────────────────────────────────────────────────────

const USER_ID = 'a0000000-0000-0000-0000-000000000001';
const WS_ID   = 'b0000000-0000-0000-0000-000000000002';
const DOC_ID  = 'c0000000-0000-0000-0000-000000000003'; // ← UUID valide (format v4-compatible)

const mockWorkspace = {
  id:         WS_ID,
  ownerId:    USER_ID,
  isArchived: false,
  name:       'Mon espace',
};

const mockDocument = {
  id:                   DOC_ID,
  workspaceId:          WS_ID,
  uploadedById:         USER_ID,
  originalFilename:     'facture.pdf',
  mimeType:             'application/pdf',
  fileSizeBytes:        102400,
  processingStatus:     'ENRICHED',
  thumbnailRef:         null,
  s3Key:                `uploads/${USER_ID}/${DOC_ID}.pdf`,
  extractedText:        null,
  textExtractionMethod: null,
  pageCount:            null,
  intelligence:         null,
  isDeleted:            false,
  uploadedAt:           new Date('2026-03-01T10:00:00Z'),
  updatedAt:            new Date('2026-03-01T10:00:00Z'),
  metadata: {
    title:            'facture',
    userTags:         [],
    notes:            null,
    userOverrideType: null,
    lastEditedAt:     null,
  },
};

// ── App factory ────────────────────────────────────────────────────────────────

async function buildTestApp() {
  const app = Fastify({ logger: false });

  app.setErrorHandler((error, _req, reply) => {
    const codeToStatus: Record<string, number> = {
      DOCUMENT_NOT_FOUND:        404,
      WORKSPACE_NOT_FOUND:       404,
      FORBIDDEN:                 403,
      INVALID_STATUS_TRANSITION: 422,
      DOCUMENT_QUOTA_EXCEEDED:   422,
      DOCUMENT_NOT_READY:        422,
      WORKSPACE_ARCHIVED:        422,
      UNSUPPORTED_MIME_TYPE:     415,
      FILE_TOO_LARGE:            413,
    };
    const code   = (error as any).code as string | undefined;
    const status = code ? (codeToStatus[code] ?? 500) : 500;
    return reply.code(status).send({
      data: null,
      meta:  {},
      error: { code: code ?? 'INTERNAL_ERROR', message: error.message },
    });
  });

  app.addHook('onRequest', async (request) => {
    (request as any).user = { sub: USER_ID, tier: 'free' };
  });

  await app.register(fastifyMultipart, {
    limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 10 },
  });

  await app.register(
    createDocumentRoutes({
      documentRepo:  mockDocumentRepo as never,
      workspaceRepo: mockWorkspaceRepo as never,
      s3Service:     mockS3Service    as never,
      eventBus:      mockEventBus     as never,
    }),
  );

  await app.ready();
  return app;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Document Routes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildTestApp();
    mockWorkspaceRepo.findById.mockResolvedValue(mockWorkspace);
    mockDocumentRepo.countActiveByUploadedById.mockResolvedValue(0);
    mockDocumentRepo.create.mockResolvedValue({ ...mockDocument, processingStatus: 'UPLOADED' });

    mockDocumentRepo.findById.mockResolvedValue(mockDocument);
    mockDocumentRepo.findByIdWithEvents.mockResolvedValue({
      document: mockDocument, processingEvents: [],
    });
    mockDocumentRepo.findAllByWorkspace.mockResolvedValue({
      items: [mockDocument], total: 1, page: 1, limit: 30,
    });
    mockDocumentRepo.update.mockResolvedValue(mockDocument);
    mockDocumentRepo.softDelete.mockResolvedValue(undefined);
    mockDocumentRepo.updateStatus.mockResolvedValue(undefined);
  });

  // ── POST / ────────────────────────────────────────────────────────────────

  describe('POST /', () => {
    it('should return 201 and created document on valid upload', async () => {
      const pdfMagic = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
      const response = await app.inject({
        method:  'POST',
        url:     '/',
        headers: { 'content-type': 'multipart/form-data; boundary=----test' },
        payload: [
          '------test\r\n',
          'Content-Disposition: form-data; name="workspaceId"\r\n\r\n',
          `${WS_ID}\r\n`,
          '------test\r\n',
          'Content-Disposition: form-data; name="file"; filename="facture.pdf"\r\n',
          'Content-Type: application/pdf\r\n\r\n',
          pdfMagic.toString('binary'),
          '\r\n------test--\r\n',
        ].join(''),
      });
      expect(response.statusCode).toBe(201);
      expect(JSON.parse(response.body).data.processingStatus).toBe('UPLOADED');
    });

    it('should return 422 when quota exceeded (FREE tier)', async () => {
      mockDocumentRepo.countActiveByUploadedById.mockResolvedValue(30);
      const response = await app.inject({
        method:  'POST',
        url:     '/',
        headers: { 'content-type': 'multipart/form-data; boundary=----test' },
        payload: '------test--\r\n',
      });
      expect(response.statusCode).toBe(422);
      expect(JSON.parse(response.body).error.code).toBe('DOCUMENT_QUOTA_EXCEEDED');
    });

    it('should emit DocumentUploadedEvent after successful upload', async () => {
      const pdfMagic = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
      await app.inject({
        method:  'POST',
        url:     '/',
        headers: { 'content-type': 'multipart/form-data; boundary=----test' },
        payload: [
          '------test\r\nContent-Disposition: form-data; name="workspaceId"\r\n\r\n',
          `${WS_ID}\r\n`,
          '------test\r\nContent-Disposition: form-data; name="file"; filename="f.pdf"\r\n',
          'Content-Type: application/pdf\r\n\r\n',
          pdfMagic.toString('binary'),
          '\r\n------test--\r\n',
        ].join(''),
      });
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'DOCUMENT_UPLOADED', workspaceId: WS_ID }),
      );
    });
  });

  // ── GET / ────────────────────────────────────────────────────────────────

  describe('GET /', () => {
    it('should return paginated documents list', async () => {
      const response = await app.inject({ method: 'GET', url: `/?workspaceId=${WS_ID}` });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
      expect(body.meta.total).toBe(1);
    });

    it('should return 403 when workspace belongs to another user', async () => {
      mockWorkspaceRepo.findById.mockResolvedValue({ ...mockWorkspace, ownerId: 'another-user' });
      const response = await app.inject({ method: 'GET', url: `/?workspaceId=${WS_ID}` });
      expect(response.statusCode).toBe(403);
    });
  });

  // ── GET /:id ─────────────────────────────────────────────────────────────

  describe('GET /:id', () => {
    it('should return full document detail with presigned URL', async () => {
      const response = await app.inject({ method: 'GET', url: `/${DOC_ID}` });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.downloadUrl).toBe('https://s3.example.com/presigned');
      expect(body.data.processingEvents).toEqual([]);
    });

    it('should return 404 when document not found', async () => {
      mockDocumentRepo.findByIdWithEvents.mockResolvedValue(null);
      const response = await app.inject({
        method: 'GET',
        url:    '/00000000-0000-0000-0000-000000000000', // UUID valide mais inconnu
      });
      expect(response.statusCode).toBe(404);
    });
  });

  // ── PATCH /:id ───────────────────────────────────────────────────────────

  describe('PATCH /:id', () => {
    it('should update document metadata and return full detail', async () => {
      const response = await app.inject({
        method:  'PATCH',
        url:     `/${DOC_ID}`,
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ title: 'Nouveau titre', userTags: ['facture'] }),
      });
      expect(response.statusCode).toBe(200);
      expect(mockDocumentRepo.update).toHaveBeenCalledWith(
        DOC_ID,
        expect.objectContaining({
          metadata: expect.objectContaining({ title: 'Nouveau titre' }),
        }),
      );
    });

    it('should return 422 when document is PROCESSING', async () => {
      mockDocumentRepo.findById.mockResolvedValue({ ...mockDocument, processingStatus: 'PROCESSING' });
      const response = await app.inject({
        method:  'PATCH',
        url:     `/${DOC_ID}`,
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ title: 'Test' }),
      });
      expect(response.statusCode).toBe(422);
    });
  });

  // ── DELETE /:id ──────────────────────────────────────────────────────────

  describe('DELETE /:id', () => {
    it('should soft delete and return 204', async () => {
      const response = await app.inject({ method: 'DELETE', url: `/${DOC_ID}` });
      expect(response.statusCode).toBe(204);
      expect(mockDocumentRepo.softDelete).toHaveBeenCalledWith(DOC_ID);
    });
  });

  // ── POST /:id/reprocess ──────────────────────────────────────────────────

  describe('POST /:id/reprocess', () => {
    it('should transition to PENDING_RETRY and emit event', async () => {
      mockDocumentRepo.findById.mockResolvedValue({ ...mockDocument, processingStatus: 'FAILED' });
      const response = await app.inject({ method: 'POST', url: `/${DOC_ID}/reprocess` });
      expect(response.statusCode).toBe(200);
      expect(mockDocumentRepo.updateStatus).toHaveBeenCalledWith(DOC_ID, 'PENDING_RETRY');
      expect(mockEventBus.publish).toHaveBeenCalled();
    });

    it('should return 422 when document is not FAILED', async () => {
      mockDocumentRepo.findById.mockResolvedValue({ ...mockDocument, processingStatus: 'ENRICHED' });
      const response = await app.inject({ method: 'POST', url: `/${DOC_ID}/reprocess` });
      expect(response.statusCode).toBe(422);
    });
  });

  // ── POST /:id/archive ─────────────────────────────────────────────────────

  describe('POST /:id/archive', () => {
    it('should transition to ARCHIVED from ENRICHED', async () => {
      const response = await app.inject({ method: 'POST', url: `/${DOC_ID}/archive` });
      expect(response.statusCode).toBe(200);
      expect(mockDocumentRepo.updateStatus).toHaveBeenCalledWith(DOC_ID, 'ARCHIVED');
    });

    it('should return 422 when document is UPLOADED', async () => {
      mockDocumentRepo.findById.mockResolvedValue({ ...mockDocument, processingStatus: 'UPLOADED' });
      const response = await app.inject({ method: 'POST', url: `/${DOC_ID}/archive` });
      expect(response.statusCode).toBe(422);
    });
  });
});
