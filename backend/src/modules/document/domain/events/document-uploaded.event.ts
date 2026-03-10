import type { DomainEvent } from '../../../../shared/events/domain-event';

export interface DocumentUploadedPayload {
  documentId:    string;
  workspaceId:   string;
  uploadedById:  string;
  s3Key:         string;
  mimeType:      string;
  fileSizeBytes: number;
}

export class DocumentUploadedEvent implements DomainEvent {
  readonly eventType  = 'DocumentUploaded' as const;
  readonly occurredAt: Date;

  constructor(public readonly payload: DocumentUploadedPayload) {
    this.occurredAt = new Date();
  }
}
