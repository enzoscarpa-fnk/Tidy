import type { IDocumentRepository }          from '../domain/ports/document.repository.port';
import type { IProcessingEventRepository }   from '../domain/ports/processing-event.repository.port';
import type { IS3Service }                   from '../domain/ports/s3.service.port';
import type { IOcrService }                  from '../domain/ports/ocr.service.port';
import type { IClassificationService }       from '../domain/ports/classification.service.port';
import type { IThumbnailService }            from '../domain/ports/thumbnail.service.port';
import type { IEventBus }                    from '../../../shared/events/event-bus.port';
import type { DocumentUploadedEvent }        from '../../../shared/events/domain-events';
import { DOCUMENT_UPLOADED }                 from '../../../shared/events/domain-events';
import type { ProcessingStatus, TextExtractionMethod } from '../domain/document.aggregate';
import { DocumentIntelligence }              from '../domain/document-intelligence.value-object';

// ── Type pour l'extraction PDF (injectable → testable sans mock de module) ────

export type PdfExtractFn = (
  buffer: Buffer,
) => Promise<{ text: string; pageCount: number } | null>;

// Implémentation par défaut via pdf-parse (dynamic import pour ESM compat)
export const defaultPdfExtract: PdfExtractFn = async (buffer) => {
  try {
    const pdfParse = require('pdf-parse') as (
      buffer: Buffer,
    ) => Promise<{ text: string; numpages: number }>;

    const data = await pdfParse(buffer);
    const text = data.text.trim();
    // Heuristique : PDF natif si >50 caractères par page en moyenne
    if (text.length > 50 * Math.max(1, data.numpages)) {
      return { text, pageCount: data.numpages };
    }
    return null; // trop peu de texte → OCR nécessaire
  } catch {
    return null;  // PDF corrompu ou illisible → fallback OCR
  }
};

// ── Types de ProcessingEvent ───────────────────────────────────────────────────

const EV = {
  OCR_STARTED:          'OCR_STARTED',
  OCR_DONE:             'OCR_DONE',
  CLASSIFICATION_DONE:  'CLASSIFICATION_DONE',
  THUMBNAIL_GENERATED:  'THUMBNAIL_GENERATED',
  PIPELINE_FAILED:      'PIPELINE_FAILED',
} as const;

// ── Logger minimal injectable ─────────────────────────────────────────────────

interface PipelineLogger {
  warn(msg: string, ctx?: unknown):  void;
  error(msg: string, ctx?: unknown): void;
}

// ── Orchestrateur ─────────────────────────────────────────────────────────────

export class PipelineOrchestrator {
  private readonly logger: PipelineLogger;

  constructor(
    private readonly documentRepo:         IDocumentRepository,
    private readonly processingEventRepo:  IProcessingEventRepository,
    private readonly s3Service:            IS3Service,
    private readonly ocrService:           IOcrService,
    private readonly classificationService: IClassificationService,
    private readonly thumbnailService:     IThumbnailService,
    private readonly pdfExtract:           PdfExtractFn = defaultPdfExtract,
    logger?: PipelineLogger,
  ) {
    this.logger = logger ?? {
      warn:  (msg, ctx) => console.warn(msg, ctx),
      error: (msg, ctx) => console.error(msg, ctx),
    };
  }

  // ── Enregistrement sur l'EventBus ─────────────────────────────────────────

  register(eventBus: IEventBus): void {
    eventBus.subscribe<DocumentUploadedEvent>(
      DOCUMENT_UPLOADED,
      (event) => this.handle(event),
    );
  }

  // ── Handler principal ─────────────────────────────────────────────────────

  private async handle(event: DocumentUploadedEvent): Promise<void> {
    const { documentId, mimeType, s3Key } = event;

    try {
      // Étape 1 : marquer PROCESSING
      await this.documentRepo.updateStatus(documentId, 'PROCESSING');

      // Étape 2 : télécharger le fichier depuis S3
      const buffer = await this.s3Service.getObject(s3Key);

      // Étape 3 : extraction de texte
      const { extractedText, textExtractionMethod, pageCount } =
        await this.extractText(documentId, buffer, mimeType);

      // Étape 4 : mise à jour du contenu extrait
      await this.documentRepo.update(documentId, {
        extractedText,
        textExtractionMethod,
        pageCount,
        updatedAt: new Date(),
      });

      // Étape 5 : classification
      const classification = await this.classificationService.classify(
        extractedText ?? '',
        mimeType,
      );
      await this.processingEventRepo.create({
        documentId,
        eventType: EV.CLASSIFICATION_DONE,
        isSuccess: true,
        payload:   {
          detectedType: classification.detectedType,
          confidence:   classification.globalConfidenceScore,
        },
      });

      // Étape 6 : génération du thumbnail (non bloquante en cas d'échec)
      const thumbnailRef = await this.tryGenerateThumbnail(documentId, buffer, mimeType);

      // Étape 7 : persistance de l'intelligence + thumbnail
      const intelligence = new DocumentIntelligence(
        classification.detectedType,
        classification.extractedEntities,
        classification.globalConfidenceScore,
        classification.suggestedTags,
      );

      await this.documentRepo.update(documentId, {
        intelligence,
        thumbnailRef: thumbnailRef ?? null,
        updatedAt:    new Date(),
      });

      // Étape 8 : statut final
      const finalStatus: ProcessingStatus =
        textExtractionMethod === 'NATIVE_PDF' ? 'CLASSIFIED_ONLY' : 'ENRICHED';
      await this.documentRepo.updateStatus(documentId, finalStatus);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue dans le pipeline';
      this.logger.error('PipelineOrchestrator: échec du pipeline', { documentId, err });
      await this.safeUpdateFailed(documentId, message);
    }
  }

  // ── Extraction de texte (natif ou OCR) ────────────────────────────────────

  private async extractText(
    documentId: string,
    buffer:     Buffer,
    mimeType:   string,
  ): Promise<{
    extractedText:        string | null;
    textExtractionMethod: TextExtractionMethod;
    pageCount:            number | null;
  }> {
    // Tentative d'extraction native uniquement pour les PDFs
    if (mimeType === 'application/pdf') {
      const native = await this.pdfExtract(buffer);
      if (native) {
        return {
          extractedText:        native.text,
          textExtractionMethod: 'NATIVE_PDF',
          pageCount:            native.pageCount,
        };
      }
    }

    // Fallback OCR (scanned PDF ou image)
    await this.processingEventRepo.create({
      documentId,
      eventType: EV.OCR_STARTED,
      isSuccess: true,
    });

    const ocr = await this.ocrService.processDocument(buffer.toString('base64'), mimeType);

    await this.processingEventRepo.create({
      documentId,
      eventType: EV.OCR_DONE,
      isSuccess: true,
      payload:   { confidence: ocr.confidence, pageCount: ocr.pageCount },
    });

    // Statut intermédiaire après OCR
    await this.documentRepo.updateStatus(documentId, 'PARTIALLY_ENRICHED', 'OCR');

    return {
      extractedText:        ocr.text,
      textExtractionMethod: 'OCR',
      pageCount:            ocr.pageCount,
    };
  }

  // ── Génération thumbnail (non bloquante) ──────────────────────────────────

  private async tryGenerateThumbnail(
    documentId: string,
    buffer:     Buffer,
    mimeType:   string,
  ): Promise<string | null> {
    try {
      const ref = await this.thumbnailService.generate(documentId, buffer, mimeType);
      if (ref) {
        await this.processingEventRepo.create({
          documentId,
          eventType: EV.THUMBNAIL_GENERATED,
          isSuccess: true,
        });
      }
      return ref;
    } catch (err) {
      // Thumbnail non bloquant : un échec ne fait pas échouer le pipeline
      this.logger.warn('PipelineOrchestrator: génération thumbnail échouée', { documentId, err });
      return null;
    }
  }

  // ── Gestion FAILED (double try-catch pour résilience) ─────────────────────

  private async safeUpdateFailed(documentId: string, errorMessage: string): Promise<void> {
    try {
      await this.documentRepo.updateStatus(documentId, 'FAILED');
    } catch (err) {
      this.logger.error('PipelineOrchestrator: impossible de mettre FAILED', { documentId, err });
    }
    try {
      await this.processingEventRepo.create({
        documentId,
        eventType:    EV.PIPELINE_FAILED,
        isSuccess:    false,
        errorMessage,
      });
    } catch (err) {
      this.logger.error('PipelineOrchestrator: impossible de créer PIPELINE_FAILED event', { documentId, err });
    }
  }
}
