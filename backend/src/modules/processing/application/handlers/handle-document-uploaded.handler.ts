import type { ProcessingPipelineOrchestrator } from '../orchestration/processing-pipeline.orchestrator';
import type { DocumentUploadedEvent }           from '../../../document/domain/events/document-uploaded.event';

/**
 * Handler fire-and-forget : appelé par le bus après un upload.
 * Les erreurs sont absorbées par l'orchestrateur lui-même (updateStatus FAILED).
 */
export function createDocumentUploadedHandler(
  orchestrator: ProcessingPipelineOrchestrator,
) {
  return async (event: DocumentUploadedEvent): Promise<void> => {
    await orchestrator.run(event);
  };
}
