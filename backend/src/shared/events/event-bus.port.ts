export interface DomainEvent {
  readonly type:       string;
  readonly occurredAt: Date;
}

export type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => Promise<void>;

export interface IEventBus {
  publish<T extends DomainEvent>(event: T): Promise<void>;
  subscribe<T extends DomainEvent>(eventType: string, handler: EventHandler<T>): void;
}
