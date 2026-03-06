import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PipelineOrchestrator }          from './pipeline-orchestrator';
import { InMemoryEventBus }              from '../../../shared/events/in-memory-event-bus';
import { createDocumentUploadedEvent }   from '../../../shared/events/domain-events';
import { DocumentIntelligence }          from '../domain/document-intelligence.value-object';
import { OcrServiceUnavailableError }    from '../../../shared/errors/domain-errors';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockDocumentRepo = {
  create:     vi.fn(),
  findById:   vi.fn(),
  findAllByWorkspace: vi.fn(),
  update:     vi.fn(),
  softDelete: vi.fn(),
  updateStatus: vi.fn(),
};

const mockProcessingEventRepo = { create: vi.fn() };
const mockS3Service           = { getObject: vi.fn(), putObject: vi.fn(), deleteObject: vi.fn(), generatePresignedGetUrl: vi.fn(), generatePresignedPutUrl: vi.fn() };
const mockOcrService          = { processDocument: vi.fn() };
const mockClassificationService = { classify: vi.fn() };
const mockThumbnailService    = { generate: vi.fn() };
const mockPdfExtract          = vi.fn();

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DOC_ID  = 'doc-uuid-1';
const WS_ID   = 'ws-uuid-1';
const USER_ID = 'user-uuid-1';
const S3_KEY  = 'uploads/doc-uuid-1/file.pdf';
const BUFFER  = Buffer.from('fake-file-content');

const uploadedEvent = createDocumentUploadedEvent({
  documentId:   DOC_ID,
  workspaceId:  WS_ID,
  uploadedById: USER_ID,
  mimeType:     'application/pdf',
  s3Key:        S3_KEY,
});

const classificationResult = {
  detectedType:          'INVOICE' as const,
  extractedEntities:     [{ entityType: 'AMOUNT', value: '1250', confidence: 0.97 }],
  globalConfidenceScore: 0.94,
  suggestedTags:         ['facture', 'adobe'],
};

// ── Helper ─────────────────────────────────────────────────────────────────────

function makeOrchestrator() {
  return new PipelineOrchestrator(
    mockDocumentRepo       as never,
    mockProcessingEventRepo as never,
    mockS3Service          as never,
    mockOcrService         as never,
    mockClassificationService as never,
    mockThumbnailService   as never,
    mockPdfExtract,
    { warn: vi.fn(), error: vi.fn() },
  );
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('PipelineOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDocumentRepo.updateStatus.mockResolvedValue(undefined);
    mockDocumentRepo.update.mockResolvedValue({});
    mockProcessingEventRepo.create.mockResolvedValue(undefined);
    mockS3Service.getObject.mockResolvedValue(BUFFER);
    mockClassificationService.classify.mockResolvedValue(classificationResult);
    mockThumbnailService.generate.mockResolvedValue('thumbnails/doc-uuid-1.jpg');
  });

  // ── Enregistrement EventBus ────────────────────────────────────────────────

  it('should subscribe to DOCUMENT_UPLOADED on register()', () => {
    const bus          = new InMemoryEventBus();
    const orchestrator = makeOrchestrator();
    orchestrator.register(bus);
    expect(bus.handlerCount('DOCUMENT_UPLOADED')).toBe(1);
  });

  // ── Chemin natif PDF ───────────────────────────────────────────────────────

  describe('native PDF path', () => {
    beforeEach(() => {
      mockPdfExtract.mockResolvedValue({ text: 'Contenu PDF natif', pageCount: 2 });
    });

    it('should set CLASSIFIED_ONLY as final status', async () => {
      const bus = new InMemoryEventBus();
      makeOrchestrator().register(bus);
      await bus.publish(uploadedEvent);

      const statusCalls = mockDocumentRepo.updateStatus.mock.calls.map((c) => c[1]);
      expect(statusCalls).toContain('PROCESSING');
      expect(statusCalls).toContain('CLASSIFIED_ONLY');
      expect(statusCalls).not.toContain('PARTIALLY_ENRICHED');
      expect(statusCalls).not.toContain('ENRICHED');
    });

    it('should update document with NATIVE_PDF extraction method', async () => {
      const bus = new InMemoryEventBus();
      makeOrchestrator().register(bus);
      await bus.publish(uploadedEvent);

      expect(mockDocumentRepo.update).toHaveBeenCalledWith(
        DOC_ID,
        expect.objectContaining({ textExtractionMethod: 'NATIVE_PDF', pageCount: 2 }),
      );
    });

    it('should NOT call OCR for native PDFs', async () => {
      const bus = new InMemoryEventBus();
      makeOrchestrator().register(bus);
      await bus.publish(uploadedEvent);

      expect(mockOcrService.processDocument).not.toHaveBeenCalled();
    });

    it('should persist DocumentIntelligence from classification', async () => {
      const bus = new InMemoryEventBus();
      makeOrchestrator().register(bus);
      await bus.publish(uploadedEvent);

      const updateCalls = mockDocumentRepo.update.mock.calls;
      const intelligenceCall = updateCalls.find((c) => c[1].intelligence instanceof DocumentIntelligence);
      expect(intelligenceCall).toBeDefined();
      expect(intelligenceCall![1].intelligence.detectedType).toBe('INVOICE');
    });
  });

  // ── Chemin OCR ─────────────────────────────────────────────────────────────

  describe('OCR path', () => {
    beforeEach(() => {
      mockPdfExtract.mockResolvedValue(null); // PDF scanné → OCR nécessaire
      mockOcrService.processDocument.mockResolvedValue({
        text:       'Texte extrait par OCR',
        confidence: 0.92,
        pageCount:  3,
      });
    });

    it('should set PARTIALLY_ENRICHED then ENRICHED as final status', async () => {
      const bus = new InMemoryEventBus();
      makeOrchestrator().register(bus);
      await bus.publish(uploadedEvent);

      const statusCalls = mockDocumentRepo.updateStatus.mock.calls.map((c) => c[1]);
      expect(statusCalls).toEqual(['PROCESSING', 'PARTIALLY_ENRICHED', 'ENRICHED']);
    });

    it('should call OCR service with correct params', async () => {
      const bus = new InMemoryEventBus();
      makeOrchestrator().register(bus);
      await bus.publish(uploadedEvent);

      expect(mockOcrService.processDocument).toHaveBeenCalledWith(
        BUFFER.toString('base64'),
        'application/pdf',
      );
    });

    it('should create OCR_STARTED and OCR_DONE processing events', async () => {
      const bus = new InMemoryEventBus();
      makeOrchestrator().register(bus);
      await bus.publish(uploadedEvent);

      const eventTypes = mockProcessingEventRepo.create.mock.calls.map((c) => c[0].eventType);
      expect(eventTypes).toContain('OCR_STARTED');
      expect(eventTypes).toContain('OCR_DONE');
    });

    it('should always call OCR for images (skip pdfExtract)', async () => {
      const imageEvent = createDocumentUploadedEvent({
        ...uploadedEvent,
        mimeType: 'image/jpeg',
      });
      const bus = new InMemoryEventBus();
      makeOrchestrator().register(bus);
      await bus.publish(imageEvent);

      expect(mockPdfExtract).not.toHaveBeenCalled();
      expect(mockOcrService.processDocument).toHaveBeenCalledWith(
        expect.any(String),
        'image/jpeg',
      );
    });
  });

  // ── Gestion des erreurs ────────────────────────────────────────────────────

  describe('error handling', () => {
    it('should set FAILED when S3 download fails', async () => {
      mockS3Service.getObject.mockRejectedValue(new Error('S3 error'));
      const bus = new InMemoryEventBus();
      makeOrchestrator().register(bus);
      await bus.publish(uploadedEvent);

      expect(mockDocumentRepo.updateStatus).toHaveBeenCalledWith(DOC_ID, 'FAILED');
    });

    it('should set FAILED when OCR fails', async () => {
      mockPdfExtract.mockResolvedValue(null);
      mockOcrService.processDocument.mockRejectedValue(
        new OcrServiceUnavailableError('Mistral indisponible'),
      );
      const bus = new InMemoryEventBus();
      makeOrchestrator().register(bus);
      await bus.publish(uploadedEvent);

      expect(mockDocumentRepo.updateStatus).toHaveBeenCalledWith(DOC_ID, 'FAILED');
    });

    it('should set FAILED when classification fails', async () => {
      mockPdfExtract.mockResolvedValue({ text: 'texte natif', pageCount: 1 });
      mockClassificationService.classify.mockRejectedValue(new Error('classification error'));
      const bus = new InMemoryEventBus();
      makeOrchestrator().register(bus);
      await bus.publish(uploadedEvent);

      expect(mockDocumentRepo.updateStatus).toHaveBeenCalledWith(DOC_ID, 'FAILED');
    });

    it('should create PIPELINE_FAILED processing event on error', async () => {
      mockS3Service.getObject.mockRejectedValue(new Error('crash'));
      const bus = new InMemoryEventBus();
      makeOrchestrator().register(bus);
      await bus.publish(uploadedEvent);

      const failedEvent = mockProcessingEventRepo.create.mock.calls.find(
        (c) => c[0].eventType === 'PIPELINE_FAILED',
      );
      expect(failedEvent).toBeDefined();
      expect(failedEvent![0].isSuccess).toBe(false);
      expect(failedEvent![0].errorMessage).toContain('crash');
    });

    it('should NOT throw even when FAILED status update fails', async () => {
      mockS3Service.getObject.mockRejectedValue(new Error('S3 down'));
      mockDocumentRepo.updateStatus.mockRejectedValue(new Error('DB down'));
      const bus = new InMemoryEventBus();
      makeOrchestrator().register(bus);

      // Le bus absorbe les erreurs mais le handler lui-même ne doit pas throw
      await expect(bus.publish(uploadedEvent)).resolves.toBeUndefined();
    });

    it('should NOT fail pipeline when thumbnail generation fails', async () => {
      mockPdfExtract.mockResolvedValue({ text: 'texte natif', pageCount: 1 });
      mockThumbnailService.generate.mockRejectedValue(new Error('thumbnail error'));
      const bus = new InMemoryEventBus();
      makeOrchestrator().register(bus);
      await bus.publish(uploadedEvent);

      // Le pipeline se termine quand même avec CLASSIFIED_ONLY
      const finalStatus = mockDocumentRepo.updateStatus.mock.calls.at(-1)?.[1];
      expect(finalStatus).toBe('CLASSIFIED_ONLY');
    });
  });
});
