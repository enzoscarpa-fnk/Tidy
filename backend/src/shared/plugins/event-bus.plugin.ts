import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { InMemoryEventBus } from '../events/in-memory-event-bus';
import type { IEventBus } from '../events/event-bus.port';

// Augmentation du type Fastify pour accès typé depuis les routes
declare module 'fastify' {
  interface FastifyInstance {
    eventBus: IEventBus;
  }
}

const eventBusPlugin: FastifyPluginAsync = fp(async (fastify) => {
  const eventBus = new InMemoryEventBus({
    error: (msg, ctx) => fastify.log.error(ctx, msg),
  });

  fastify.decorate('eventBus', eventBus);
});

export default eventBusPlugin;
