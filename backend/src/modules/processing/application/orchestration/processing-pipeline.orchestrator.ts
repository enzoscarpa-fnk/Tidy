import type { IDocumentRepository }        from '../../../document/domain/ports/document.repository.port';
import type { IProcessingEventRepository } from '../../../document/domain/ports/processing-event.repository.port';
import type { IOcrService }                from '../../../document/domain/ports/ocr.service.port';
import type { ITextExtractorService }      from '../../../document/domain/ports/text-extractor.service.port';
import type { IDocumentClassifierService } from '../../../document/domain/ports/document-classifier.service.port';
import type { IEntityExtractorService }    from '../../../document/domain/ports/entity-extractor.service.port';
import type { IThumbnailGeneratorService } from '../../../document/domain/ports/thumbnail-generator.service.port';
import type { IS3Service }                 from '../../../document/domain/ports/s3.service.port';
import type { IEventBus }                  from '../../../../shared/events/domain-event';
import type { TextExtractionMethod }       from '../../../document/domain/document.aggregate';
import type { DocumentUploadedEvent }      from '../../../document/domain/events/document-uploaded.event';
import { DocumentIntelligence }            from '../../../document/domain/document-intelligence.value-object';
import { DocumentReadyEvent }              from '../../../document/domain/events/document-ready.event';

// ── Helpers ───────────────────────────────────────────────────────────────────

function thumbnailS3Key(documentId: string): string {
  return `thumbnails/${documentId}.jpg`;
}

function buildSuggestedTags(
  detectedType: string,
  entities: Array<{ entityType: string }>,
): string[] {
  const typeTag    = detectedType.toLowerCase();
  const entityTags = [...new Set(entities.map((e) => e.entityType.toLowerCase()))];
  return [typeTag, ...entityTags];
}

// ── Injection de dépendances ──────────────────────────────────────────────────

export interface PipelineDeps {
  documentRepository:     IDocumentRepository;
  processingEventRepo:    IProcessingEventRepository;
  ocrService:             IOcrService;
  textExtractorService:   ITextExtractorService;
  classifierService:      IDocumentClassifierService;
  entityExtractorService: IEntityExtractorService;
  thumbnailService:       IThumbnailGeneratorService;
  s3Service:              IS3Service;
  eventBus:               IEventBus;
}

// ── Orchestrateur ─────────────────────────────────────────────────────────────

export class ProcessingPipelineOrchestrator {
  constructor(private readonly deps: PipelineDeps) {}

  async run(event: DocumentUploadedEvent): Promise<void> {
    const { documentId, s3Key, mimeType } = event.payload;

    await this.deps.documentRepository.updateStatus(documentId, 'PROCESSING');

    try {
      const fileBuffer = await this.deps.s3Service.getObject(s3Key);

      let extractedText: string | null     = null;
      let textMethod: TextExtractionMethod = 'NONE';
      let pageCount: number | null         = null;

      if (mimeType === 'application/pdf') {
        const textResult = await this.deps.textExtractorService.extractFromPdf(fileBuffer);

        if (textResult.method === 'NATIVE_PDF') {
          extractedText = textResult.text;
          textMethod    = 'NATIVE_PDF';
        } else {
          const ocrResult = await this.deps.ocrService.processDocument(
            fileBuffer.toString('base64'),
            mimeType,
          );
          extractedText = ocrResult.text || null;
          textMethod    = 'OCR';
          pageCount     = ocrResult.pageCount;
        }
      } else {
        const ocrResult = await this.deps.ocrService.processDocument(
          fileBuffer.toString('base64'),
          mimeType,
        );
        extractedText = ocrResult.text || null;
        textMethod    = 'OCR';
        pageCount     = ocrResult.pageCount;
      }

      const classification = this.deps.classifierService.classify(extractedText ?? '');
      const entities       = this.deps.entityExtractorService.extractEntities(extractedText ?? '');

      let thumbnailRef: string | null = null;
      try {
        const thumbBuffer = await this.deps.thumbnailService.generateThumbnail(
          fileBuffer,
          mimeType,
        );
        if (thumbBuffer) {
          const tKey = thumbnailS3Key(documentId);
          await this.deps.s3Service.putObject(tKey, thumbBuffer, 'image/jpeg');
          thumbnailRef = tKey;
        }
      } catch {
        // Thumbnail optionnel — ne jamais bloquer l'enrichissement
      }

      const intelligence = new DocumentIntelligence(
        classification.detectedType,
        entities,
        classification.confidence,
        buildSuggestedTags(classification.detectedType, entities),
      );

      await this.deps.documentRepository.update(documentId, {
        intelligence,
        extractedText,
        textExtractionMethod: textMethod,
        thumbnailRef,
        pageCount,
        updatedAt: new Date(),
      });

      await this.deps.documentRepository.updateStatus(documentId, 'ENRICHED');

      await this.deps.processingEventRepo.create({
        documentId,
        eventType: 'PIPELINE_SUCCESS',
        isSuccess: true,
        payload: {
          textMethod,
          detectedType: classification.detectedType,
          entityCount:  entities.length,
        },
      });

      this.deps.eventBus.publish(new DocumentReadyEvent(documentId));

    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Erreur inconnue dans le pipeline OCR.';

      await this.deps.documentRepository
        .updateStatus(documentId, 'FAILED')
        .catch(() => {});

      await this.deps.processingEventRepo
        .create({
          documentId,
          eventType:    'PIPELINE_FAILURE',
          isSuccess:    false,
          errorMessage,
        })
        .catch(() => {});
    }
  }
}
