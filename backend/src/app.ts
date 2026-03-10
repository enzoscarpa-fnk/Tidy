import Fastify, {
  FastifyInstance,
  RawServerDefault,
  FastifyBaseLogger,
  FastifyTypeProviderDefault,
} from 'fastify';
import type { IncomingMessage, ServerResponse } from 'http';
import prismaPlugin       from './infra/database/prisma.plugin';
import errorHandlerPlugin from './shared/plugins/error-handler.plugin';
import processingPlugin   from './modules/processing/processing.plugin';
import authRoutes         from './modules/auth/interfaces/http/auth.routes';
import meRoutes           from './modules/user/interfaces/http/me.routes';
import workspaceRoutes    from './modules/workspace/interfaces/http/workspace.routes';
import documentRoutes     from './modules/document/interfaces/http/document.routes';
import { createSuccessResponse } from './shared/response.helpers';

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
            colorize:      true,
            translateTime: 'HH:MM:ss.l',
            ignore:        'pid,hostname',
          },
        },
      }
      : {
        level: process.env['LOG_LEVEL'] ?? 'info',
      },
    ajv: {
      customOptions: {
        removeAdditional: true,
        useDefaults:      true,
        coerceTypes:      false,
        allErrors:        false,
      },
    },
  }) as TidyApp;

  // ── Plugins infrastructure (ordre strict) ────────────────────────────────
  await app.register(errorHandlerPlugin);
  await app.register(prismaPlugin);
  await app.register(processingPlugin); // dépend de prismaPlugin

  // ── Health check ─────────────────────────────────────────────────────────
  app.get('/health', async (_request, _reply) => {
    return createSuccessResponse({
      status:    'ok',
      timestamp: new Date().toISOString(),
    });
  });

  // ── Routes ───────────────────────────────────────────────────────────────
  await app.register(authRoutes,      { prefix: '/api/v1/auth' });
  await app.register(meRoutes,        { prefix: '/api/v1' });
  await app.register(workspaceRoutes, { prefix: '/api/v1/workspaces' });
  await app.register(documentRoutes,  { prefix: '/api/v1/documents' });

  return app;
}
