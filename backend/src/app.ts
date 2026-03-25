import Fastify, {
  FastifyInstance,
  RawServerDefault,
  FastifyBaseLogger,
  FastifyTypeProviderDefault,
} from 'fastify';
import type { IncomingMessage, ServerResponse } from 'http';
import prismaPlugin          from './infra/database/prisma.plugin';
import errorHandlerPlugin    from './shared/plugins/error-handler.plugin';
import processingPlugin      from './modules/processing/processing.plugin';
import authRoutes            from './modules/auth/interfaces/http/auth.routes';
import meRoutes              from './modules/user/interfaces/http/me.routes';
import workspaceRoutes       from './modules/workspace/interfaces/http/workspace.routes';
import documentRoutes        from './modules/document/interfaces/http/document.routes';
import fileRoutes            from './modules/document/interfaces/http/file.routes';
import ocrRoutes             from './modules/ocr/interfaces/http/ocr.routes';
import shareRoutes           from './modules/share/interfaces/http/share.routes';
import publicShareRoutes     from './modules/share/interfaces/http/public-share.routes';
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

  // ── Plugins infrastructure (ordre strict) ─────────────────────────────────
  await app.register(errorHandlerPlugin);
  await app.register(prismaPlugin);
  await app.register(processingPlugin); // dépend de prismaPlugin

  // ── Health check ──────────────────────────────────────────────────────────
  app.get('/health', async (_request, _reply) => {
    return createSuccessResponse({
      status:    'ok',
      timestamp: new Date().toISOString(),
    });
  });

  // ── Routes API privées ────────────────────────────────────────────────────
  await app.register(authRoutes,      { prefix: '/api/v1/auth' });
  await app.register(meRoutes,        { prefix: '/api/v1' });
  await app.register(workspaceRoutes, { prefix: '/api/v1/workspaces' });
  await app.register(documentRoutes,  { prefix: '/api/v1/documents' });
  await app.register(fileRoutes,      { prefix: '/api/v1/files' });
  await app.register(ocrRoutes,       { prefix: '/api/v1/ocr' });

  // shareRoutes expose :
  //   POST   /api/v1/documents/:id/share
  //   DELETE /api/v1/share/:linkId
  await app.register(shareRoutes,     { prefix: '/api/v1' });

  // ── Route publique (sans auth) ────────────────────────────────────────────
  // GET /s/:token — accès au document partagé
  await app.register(publicShareRoutes, { prefix: '/s' });

  return app;
}
