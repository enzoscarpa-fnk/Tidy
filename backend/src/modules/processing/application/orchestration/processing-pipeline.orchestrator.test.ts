import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessingPipelineOrchestrator } from './processing-pipeline.orchestrator';
import { DocumentUploadedEvent }           from '../../../document/domain/events/document-uploaded.event';
import { DocumentReadyEvent }              from '../../../document/domain/events/document-ready.event';
import { DocumentIntelligence }            from '../../../document/domain/document-intelligence.value-object';
import type { PipelineDeps }               from './processing-pipeline.orchestrator';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DOC_ID   = 'doc-uuid-1';
const S3_KEY   = 'uploads/doc-uuid-1.pdf';
const MIME_PDF = 'application/pdf';
const MIME_IMG = 'image/jpeg';

function makeEvent(mimeType = MIME_PDF, s3Key = S3_KEY): DocumentUploadedEvent {
  return new DocumentUploadedEvent({
    documentId:    DOC_ID,
    workspaceId:   'ws-uuid-1',
    uploadedById:  'user-uuid-1',
    s3Key,
    mimeType,
    fileSizeBytes: 1024,
  });
}

const FILE_BUFFER = Buffer.from('fake-pdf-content');

function makeDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    documentRepository: {
      create:             vi.fn(),
      findById:           vi.fn(),
      findAllByWorkspace: vi.fn(),
      update:             vi.fn().mockResolvedValue(undefined),
      softDelete:         vi.fn(),
      updateStatus:       vi.fn().mockResolvedValue(undefined),
    },
    processingEventRepo: {
      create: vi.fn().mockResolvedValue(undefined),
    },
    ocrService: {
      processDocument: vi.fn().mockResolvedValue({
        text:       'texte OCR extrait',
        confidence: 0.95,
        pageCount:  2,
      }),
    },
    textExtractorService: {
      extractFromPdf: vi.fn().mockResolvedValue({
        text:   'texte natif PDF',
        method: 'NATIVE_PDF',
      }),
    },
    classifierService: {
      classify: vi.fn().mockReturnValue({
        detectedType: 'INVOICE',
        confidence:   0.88,
      }),
    },
    entityExtractorService: {
      extractEntities: vi.fn().mockReturnValue([
        { entityType: 'AMOUNT', value: '1 200,00 €', confidence: 0.95 },
      ]),
    },
    thumbnailService: {
      generateThumbnail: vi.fn().mockResolvedValue(Buffer.from('thumb-jpeg')),
    },
    s3Service: {
      getObject:               vi.fn().mockResolvedValue(FILE_BUFFER),
      putObject:               vi.fn().mockResolvedValue(undefined),
      deleteObject:            vi.fn(),
      generatePresignedGetUrl: vi.fn(),
      generatePresignedPutUrl: vi.fn(),
    },
    eventBus: {
      publish:   vi.fn(),
      subscribe: vi.fn(),
    },
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProcessingPipelineOrchestrator', () => {
  let deps: PipelineDeps;
  let orchestrator: ProcessingPipelineOrchestrator;

  beforeEach(() => {
    deps         = makeDeps();
    orchestrator = new ProcessingPipelineOrchestrator(deps);
  });

  it('traite un PDF natif sans appel OCR et passe à ENRICHED', async () => {
    await orchestrator.run(makeEvent(MIME_PDF));

    expect(deps.ocrService.processDocument).not.toHaveBeenCalled();
    expect(deps.textExtractorService.extractFromPdf).toHaveBeenCalledWith(FILE_BUFFER);
    expect(deps.documentRepository.updateStatus).toHaveBeenNthCalledWith(1, DOC_ID, 'PROCESSING');
    expect(deps.documentRepository.updateStatus).toHaveBeenNthCalledWith(2, DOC_ID, 'ENRICHED');
    expect(deps.documentRepository.update).toHaveBeenCalledWith(
      DOC_ID,
      expect.objectContaining({
        extractedText:        'texte natif PDF',
        textExtractionMethod: 'NATIVE_PDF',
        intelligence:         expect.any(DocumentIntelligence),
      }),
    );
  });

  it('intelligence est une instance de DocumentIntelligence avec les bonnes données', async () => {
    await orchestrator.run(makeEvent(MIME_PDF));

    const callArgs = vi.mocked(deps.documentRepository.update).mock.calls[0][1];
    const intel    = callArgs.intelligence as DocumentIntelligence;

    expect(intel).toBeInstanceOf(DocumentIntelligence);
    expect(intel.detectedType).toBe('INVOICE');
    expect(intel.globalConfidenceScore).toBe(0.88);
    expect(intel.extractedEntities).toHaveLength(1);
    expect(intel.suggestedTags).toContain('invoice');
    expect(intel.suggestedTags).toContain('amount');
  });

  it('émet DocumentReadyEvent après un pipeline réussi', async () => {
    await orchestrator.run(makeEvent(MIME_PDF));

    expect(deps.eventBus.publish).toHaveBeenCalledOnce();
    const emitted = vi.mocked(deps.eventBus.publish).mock.calls[0][0];
    expect(emitted).toBeInstanceOf(DocumentReadyEvent);
    expect((emitted as DocumentReadyEvent).documentId).toBe(DOC_ID);
  });

  it('crée un ProcessingEvent PIPELINE_SUCCESS avec isSuccess=true après succès', async () => {
    await orchestrator.run(makeEvent(MIME_PDF));

    expect(deps.processingEventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: DOC_ID,
        eventType:  'PIPELINE_SUCCESS',
        isSuccess:  true,
      }),
    );
  });

  it('appelle OCR si le PDF ne contient pas de texte natif', async () => {
    vi.mocked(deps.textExtractorService.extractFromPdf).mockResolvedValueOnce({
      text:   null,
      method: 'OCR_NEEDED',
    });

    await orchestrator.run(makeEvent(MIME_PDF));

    expect(deps.ocrService.processDocument).toHaveBeenCalledOnce();
    expect(deps.documentRepository.update).toHaveBeenCalledWith(
      DOC_ID,
      expect.objectContaining({ textExtractionMethod: 'OCR', pageCount: 2 }),
    );
  });

  it('appelle OCR directement pour une image JPEG sans passer par extractFromPdf', async () => {
    await orchestrator.run(makeEvent(MIME_IMG));

    expect(deps.textExtractorService.extractFromPdf).not.toHaveBeenCalled();
    expect(deps.ocrService.processDocument).toHaveBeenCalledWith(
      FILE_BUFFER.toString('base64'),
      MIME_IMG,
    );
    expect(deps.documentRepository.update).toHaveBeenCalledWith(
      DOC_ID,
      expect.objectContaining({ textExtractionMethod: 'OCR' }),
    );
  });

  it('upload le thumbnail en S3 et stocke la clé dans thumbnailRef', async () => {
    await orchestrator.run(makeEvent(MIME_PDF));

    expect(deps.s3Service.putObject).toHaveBeenCalledWith(
      `thumbnails/${DOC_ID}.jpg`,
      expect.any(Buffer),
      'image/jpeg',
    );
    expect(deps.documentRepository.update).toHaveBeenCalledWith(
      DOC_ID,
      expect.objectContaining({ thumbnailRef: `thumbnails/${DOC_ID}.jpg` }),
    );
  });

  it('continue le pipeline normalement si la génération du thumbnail échoue', async () => {
    vi.mocked(deps.thumbnailService.generateThumbnail).mockRejectedValueOnce(
      new Error('sharp crash'),
    );

    await orchestrator.run(makeEvent(MIME_PDF));

    expect(deps.documentRepository.updateStatus).toHaveBeenCalledWith(DOC_ID, 'ENRICHED');
    expect(deps.documentRepository.update).toHaveBeenCalledWith(
      DOC_ID,
      expect.objectContaining({ thumbnailRef: null }),
    );
  });

  it('passe à FAILED et crée un ProcessingEvent si S3 getObject échoue', async () => {
    vi.mocked(deps.s3Service.getObject).mockRejectedValueOnce(new Error('S3 unreachable'));

    await orchestrator.run(makeEvent(MIME_PDF));

    expect(deps.documentRepository.updateStatus).toHaveBeenNthCalledWith(1, DOC_ID, 'PROCESSING');
    expect(deps.documentRepository.updateStatus).toHaveBeenNthCalledWith(2, DOC_ID, 'FAILED');
    expect(deps.processingEventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId:   DOC_ID,
        eventType:    'PIPELINE_FAILURE',
        isSuccess:    false,
        errorMessage: 'S3 unreachable',
      }),
    );
    expect(deps.eventBus.publish).not.toHaveBeenCalled();
  });

  it('passe à FAILED si OCR échoue après extraction native impossible', async () => {
    vi.mocked(deps.textExtractorService.extractFromPdf).mockResolvedValueOnce({
      text:   null,
      method: 'OCR_NEEDED',
    });
    vi.mocked(deps.ocrService.processDocument).mockRejectedValueOnce(
      new Error('Mistral OCR : statut HTTP 503.'),
    );

    await orchestrator.run(makeEvent(MIME_PDF));

    expect(deps.documentRepository.updateStatus).toHaveBeenCalledWith(DOC_ID, 'FAILED');
    expect(deps.documentRepository.update).not.toHaveBeenCalled();
  });

  it('n\'émet pas DocumentReady en cas d\'échec', async () => {
    vi.mocked(deps.s3Service.getObject).mockRejectedValueOnce(new Error('erreur'));

    await orchestrator.run(makeEvent(MIME_PDF));

    expect(deps.eventBus.publish).not.toHaveBeenCalled();
  });
});
