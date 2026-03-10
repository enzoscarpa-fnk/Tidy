import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { InMemoryEventBus }                    from '../../shared/events/in-memory-event-bus';
import { ProcessingPipelineOrchestrator }      from './application/orchestration/processing-pipeline.orchestrator';
import { createDocumentUploadedHandler }       from './application/handlers/handle-document-uploaded.handler';
import { DocumentRepositoryAdapter }           from '../../infra/database/repositories/document.repository.adapter';
import { ProcessingEventRepositoryAdapter }    from '../../infra/database/repositories/processing-event.repository.adapter';
import { MistralOcrAdapter }                   from '../../infra/ocr/mistral-ocr.adapter';
import { TextExtractorAdapter }                from '../../infra/processing/text-extractor.adapter';
import { DocumentClassifierAdapter }           from '../../infra/processing/document-classifier.adapter';
import { EntityExtractorAdapter }              from '../../infra/processing/entity-extractor.adapter';
import { ThumbnailGeneratorAdapter }           from '../../infra/processing/thumbnail-generator.adapter';
import { S3ServiceAdapter }                    from '../../infra/storage/s3.service.adapter';
import type { DocumentUploadedEvent }          from '../document/domain/events/document-uploaded.event';

/**
 * Plugin Fastify qui :
 * 1. Crée le bus d'événements (singleton partagé via décoration)
 * 2. Instancie tous les adapters du pipeline OCR
 * 3. Construit l'orchestrateur
 * 4. Abonne le handler à l'event DocumentUploaded
 *
 * Doit être enregistré APRÈS prismaPlugin (dépend de app.prisma).
 */
async function processingPlugin(app: FastifyInstance): Promise<void> {
  // ── Event Bus (singleton) ───────────────────────────────────────────────
  const eventBus = new InMemoryEventBus();
  app.decorate('eventBus', eventBus);

  // ── Adapters infrastructure ─────────────────────────────────────────────
  const documentRepository  = new DocumentRepositoryAdapter(app.prisma);
  const processingEventRepo = new ProcessingEventRepositoryAdapter(app.prisma);
  const ocrService          = MistralOcrAdapter.fromEnv();
  const textExtractorService   = new TextExtractorAdapter();
  const classifierService      = new DocumentClassifierAdapter();
  const entityExtractorService = new EntityExtractorAdapter();
  const thumbnailService       = new ThumbnailGeneratorAdapter();
  const s3Service              = S3ServiceAdapter.fromEnv();

  // ── Orchestrateur ───────────────────────────────────────────────────────
  const orchestrator = new ProcessingPipelineOrchestrator({
    documentRepository,
    processingEventRepo,
    ocrService,
    textExtractorService,
    classifierService,
    entityExtractorService,
    thumbnailService,
    s3Service,
    eventBus,
  });

  // ── Abonnement au bus ───────────────────────────────────────────────────
  const handler = createDocumentUploadedHandler(orchestrator);
  eventBus.subscribe<DocumentUploadedEvent>('DocumentUploaded', handler);

  app.log.info('✅ ProcessingPlugin: handler DocumentUploaded abonné au bus.');
}

export default fp(processingPlugin, {
  name:         'processingPlugin',
});
