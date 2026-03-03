import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../errors/app-error';
import { createErrorResponse } from '../response.helpers';

const errorHandlerPlugin: FastifyPluginAsync = fp(async (fastify) => {
  // ── Erreurs dans les handlers ─────────────────────────────────────────────
  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      request.log.info(
        { code: error.code, statusCode: error.statusCode },
        `AppError: ${error.message}`,
      );
      return reply
        .status(error.statusCode)
        .send(createErrorResponse(error.code, error.message, error.details));
    }

    if (error.validation != null) {
      const details = error.validation.map((v) => ({
        field:
          v.instancePath.replace(/^\//, '') ||
          (v.params as Record<string, string>)['missingProperty'] ||
          'unknown',
        message: v.message ?? 'Valeur invalide',
      }));
      return reply
        .status(400)
        .send(createErrorResponse('VALIDATION_ERROR', 'Les données fournies sont invalides.', details));
    }

    if (error.statusCode != null && error.statusCode < 500) {
      return reply
        .status(error.statusCode)
        .send(createErrorResponse('INTERNAL_ERROR', error.message));
    }

    request.log.error(
      { err: error, url: request.url, method: request.method },
      'Unexpected error',
    );
    return reply
      .status(500)
      .send(createErrorResponse('INTERNAL_ERROR', 'Une erreur interne est survenue.'));
  });

  // ── Route inconnue (404) — setNotFoundHandler obligatoire ─────────────────
  fastify.setNotFoundHandler((request, reply) => {
    return reply.status(404).send(
      createErrorResponse('INTERNAL_ERROR', `Route ${request.method}:${request.url} not found`),
    );
  });
});

export default errorHandlerPlugin;
