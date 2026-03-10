// Interface de base pour tous les domain events
export interface DomainEvent {
  readonly eventType:  string;
  readonly occurredAt: Date;
}

// Handler : peut être sync ou async
export type EventHandler<T extends DomainEvent = DomainEvent> =
  (event: T) => Promise<void> | void;

// Port (contrat) du bus d'événements
export interface IEventBus {
  publish<T extends DomainEvent>(event: T): void;
  subscribe<T extends DomainEvent>(
    eventType: string,
    handler:   EventHandler<T>,
  ): void;
}
