import fp                                      from 'fastify-plugin';
import type { FastifyPluginAsync }             from 'fastify';
import { PipelineOrchestrator }               from '../../modules/document/application/pipeline-orchestrator';
import { ProcessingEventRepositoryAdapter }    from '../../infra/database/repositories/processing-event.repository.adapter';
import { DocumentRepositoryAdapter }          from '../../infra/database/repositories/document.repository.adapter';
import { S3ServiceAdapter }                   from '../../infra/storage/s3.service.adapter';
import { MistralOcrAdapter }                  from '../../infra/ocr/mistral-ocr.adapter';
import { MistralClassificationAdapter }       from '../../infra/classification/mistral-classification.adapter';
import { SharpThumbnailAdapter }              from '../../infra/thumbnail/sharp-thumbnail.adapter';

const pipelinePlugin: FastifyPluginAsync = fp(async (fastify) => {
  // En environnement de test (absence des variables d'env), le plugin
  // se désactive gracieusement sans faire planter le serveur.
  try {
    const s3Service             = S3ServiceAdapter.fromEnv();
    const ocrService            = MistralOcrAdapter.fromEnv();
    const classificationService = MistralClassificationAdapter.fromEnv();

    const documentRepo        = new DocumentRepositoryAdapter(fastify.prisma);
    const processingEventRepo = new ProcessingEventRepositoryAdapter(fastify.prisma);
    const thumbnailService    = new SharpThumbnailAdapter(s3Service);

    const orchestrator = new PipelineOrchestrator(
      documentRepo,
      processingEventRepo,
      s3Service,
      ocrService,
      classificationService,
      thumbnailService,
    );

    orchestrator.register(fastify.eventBus);
    fastify.log.info('✅ PipelineOrchestrator registered on eventBus');
  } catch (err) {
    fastify.log.warn(
      { err },
      '⚠️  Pipeline plugin désactivé (variables d\'env manquantes — normal en test)',
    );
  }
});

export default pipelinePlugin;
