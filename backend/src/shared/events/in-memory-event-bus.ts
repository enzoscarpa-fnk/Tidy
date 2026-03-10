import type { DomainEvent, EventHandler, IEventBus } from './domain-event';

export class InMemoryEventBus implements IEventBus {
  // Map eventType → liste de handlers
  private readonly handlers = new Map<string, EventHandler[]>();

  subscribe<T extends DomainEvent>(
    eventType: string,
    handler:   EventHandler<T>,
  ): void {
    const existing = this.handlers.get(eventType) ?? [];
    this.handlers.set(eventType, [...existing, handler as EventHandler]);
  }

  /**
   * Fire-and-forget : la requête HTTP n'est JAMAIS bloquée.
   * - setImmediate garantit que les handlers s'exécutent après
   *   le retour de la réponse HTTP (hors du call stack courant).
   * - Les erreurs sont catchées silencieusement pour éviter
   *   un crash de processus sur un handler défaillant.
   */
  publish<T extends DomainEvent>(event: T): void {
    const eventHandlers = this.handlers.get(event.eventType) ?? [];

    for (const handler of eventHandlers) {
      setImmediate(() => {
        Promise.resolve(handler(event)).catch((err: unknown) => {
          // Logging défensif : ne jamais laisser une erreur de handler
          // remonter jusqu'au process et crasher le serveur.
          console.error(
            `[InMemoryEventBus] Uncaught error in handler for "${event.eventType}":`,
            err,
          );
        });
      });
    }
  }
}
