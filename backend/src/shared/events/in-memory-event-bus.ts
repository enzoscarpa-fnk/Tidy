import type { DomainEvent, EventHandler, IEventBus } from './event-bus.port';

interface BusLogger {
  error(msg: string, context: { eventType: string; err: unknown }): void;
}

export class InMemoryEventBus implements IEventBus {
  private readonly handlers = new Map<string, EventHandler[]>();
  private readonly logger:   BusLogger;

  constructor(logger?: BusLogger) {
    this.logger = logger ?? {
      error: (msg, ctx) =>
        console.error(msg, { eventType: ctx.eventType, err: ctx.err }),
    };
  }

  // ── Abonnement ─────────────────────────────────────────────────────────────

  subscribe<T extends DomainEvent>(
    eventType: string,
    handler:   EventHandler<T>,
  ): void {
    const existing = this.handlers.get(eventType) ?? [];
    this.handlers.set(eventType, [
      ...existing,
      handler as EventHandler, // safe : le type est contraint par eventType à l'usage
    ]);
  }

  // ── Publication ────────────────────────────────────────────────────────────
  // Chaque handler est exécuté de manière indépendante :
  // - une erreur dans un handler n'interrompt pas les autres
  // - l'erreur est loguée et avalée (le pipeline gère ses propres erreurs)

  async publish<T extends DomainEvent>(event: T): Promise<void> {
    const handlers = this.handlers.get(event.type) ?? [];
    await Promise.all(
      handlers.map(async (handler) => {
        try {
          await handler(event);
        } catch (err) {
          this.logger.error(
            `InMemoryEventBus: erreur dans le handler de l'événement "${event.type}"`,
            { eventType: event.type, err },
          );
        }
      }),
    );
  }

  // ── Utilitaire de test / debug ─────────────────────────────────────────────

  handlerCount(eventType: string): number {
    return this.handlers.get(eventType)?.length ?? 0;
  }
}
