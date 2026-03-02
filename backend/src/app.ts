import Fastify, {
  FastifyInstance,
  RawServerDefault,
  FastifyBaseLogger,
  FastifyTypeProviderDefault,
} from 'fastify';
import type { IncomingMessage, ServerResponse } from 'http';
import prismaPlugin from './infra/database/prisma.plugin';

type TidyApp = FastifyInstance<
  RawServerDefault,
  IncomingMessage,
  ServerResponse<IncomingMessage>,
  FastifyBaseLogger,
  FastifyTypeProviderDefault
>;

export async function buildApp(): Promise<TidyApp> {
  const isDev = process.env['NODE_ENV'] === 'development';

  const app = Fastify({
    logger: isDev
      ? {
        level: process.env['LOG_LEVEL'] ?? 'info',
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }
      : {
        level: process.env['LOG_LEVEL'] ?? 'info',
      },
    ajv: {
      customOptions: {
        removeAdditional: true,
        useDefaults: true,
        coerceTypes: false,
        allErrors: false,
      },
    },
  }) as TidyApp;

  // ── Plugins infrastructure ───────────────────────────────────────────────
  await app.register(prismaPlugin);

  // ── Health check ─────────────────────────────────────────────────────────
  app.get(
    '/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request, _reply) => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
      };
    },
  );

  // ── Plugins et routes enregistrés au fil des tickets ────────────────────
  // Ticket 1.5 : await app.register(errorHandlerPlugin)
  // Ticket 2.x : await app.register(authRoutes, { prefix: '/api/v1/auth' })

  return app;
}
