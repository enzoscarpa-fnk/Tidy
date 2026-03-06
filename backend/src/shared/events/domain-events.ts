import type { DomainEvent } from './event-bus.port';

// ── DocumentUploaded ───────────────────────────────────────────────────────────
// Émis par le handler POST /documents après stockage S3 + création en base.
// Consommé par le PipelineOrchestrator pour démarrer l'enrichissement.

export const DOCUMENT_UPLOADED = 'DOCUMENT_UPLOADED' as const;

export interface DocumentUploadedEvent extends DomainEvent {
  readonly type:         typeof DOCUMENT_UPLOADED;
  readonly documentId:   string;
  readonly workspaceId:  string;
  readonly uploadedById: string;
  readonly mimeType:     string;
  readonly s3Key:        string;
}

export function createDocumentUploadedEvent(
  payload: Omit<DocumentUploadedEvent, 'type' | 'occurredAt'>,
): DocumentUploadedEvent {
  return {
    type:        DOCUMENT_UPLOADED,
    occurredAt:  new Date(),
    ...payload,
  };
}

// ── Union de tous les événements du domaine (extensible) ───────────────────────

export type TidyDomainEvent = DocumentUploadedEvent;
