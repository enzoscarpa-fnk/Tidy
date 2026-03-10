import type { DomainEvent } from '../../../../shared/events/domain-event';

export class DocumentReadyEvent implements DomainEvent {
  readonly eventType  = 'DocumentReady' as const;
  readonly occurredAt: Date;

  constructor(public readonly documentId: string) {
    this.occurredAt = new Date();
  }
}
