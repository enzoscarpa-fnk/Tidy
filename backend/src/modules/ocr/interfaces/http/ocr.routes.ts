import type { FastifyPluginAsync } from 'fastify';
import { MistralOcrAdapter }          from '../../../../infra/ocr/mistral-ocr.adapter';
import { DocumentRepositoryAdapter }  from '../../../../infra/database/repositories/document.repository.adapter';
import { WorkspaceRepositoryAdapter } from '../../../../infra/database/repositories/workspace.repository.adapter';
import { WorkspaceService }           from '../../../workspace/application/workspace.service';
import { authenticate }               from '../../../../shared/plugins/authenticate.hook';
import { createSuccessResponse }      from '../../../../shared/response.helpers';
import { AppError }                   from '../../../../shared/errors/app-error';

// ── Schéma de validation ──────────────────────────────────────────────────────

const ocrProcessBodySchema = {
  type: 'object',
  required: ['documentId', 'fileBase64', 'mimeType'],
  additionalProperties: false,
  properties: {
    documentId: { type: 'string', format: 'uuid' },
    fileBase64: { type: 'string', minLength: 1 },
    mimeType: {
      type: 'string',
      enum: ['application/pdf', 'image/jpeg', 'image/png'],
    },
  },
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

type OcrProcessBody = {
  documentId: string;
  fileBase64: string;
  mimeType:   'application/pdf' | 'image/jpeg' | 'image/png';
};

// ── Plugin ────────────────────────────────────────────────────────────────────

const ocrRoutes: FastifyPluginAsync = async (fastify) => {
  const documentRepo     = new DocumentRepositoryAdapter(fastify.prisma);
  const workspaceService = new WorkspaceService(new WorkspaceRepositoryAdapter(fastify.prisma));
  const ocrAdapter       = MistralOcrAdapter.fromEnv();

  /**
   * POST /api/v1/ocr/process
   *
   * Proxy OCR sécurisé pour le client mobile.
   * La clé MISTRAL_API_KEY ne quitte jamais le backend.
   *
   * - Vérifie que le document appartient au workspace de l'utilisateur.
   * - Délègue l'OCR à MistralOcrAdapter (retry + backoff intégré).
   * - Retourne ocrText + confidence + pageCount.
   */
  fastify.post<{ Body: OcrProcessBody }>(
    '/process',
    {
      schema:     { body: ocrProcessBodySchema },
      preHandler: authenticate,
    },
    async (request, reply) => {
      const { documentId, fileBase64, mimeType } = request.body;
      const userId = request.user.sub;

      // ── Vérification ownership ─────────────────────────────────────────────

      const doc = await documentRepo.findById(documentId);

      if (!doc || doc.isDeleted) {
        throw new AppError('DOCUMENT_NOT_FOUND', 'Document introuvable.');
      }

      // findById workspace vérifie que le workspace appartient à userId
      await workspaceService.findById(doc.workspaceId, userId);

      // ── Appel OCR (retry + backoff géré dans l'adapter) ───────────────────

      const result = await ocrAdapter.processDocument(fileBase64, mimeType);

      return reply.send(
        createSuccessResponse({
          ocrText:    result.text,
          confidence: result.confidence,
          pageCount:  result.pageCount ?? null,
        }),
      );
    },
  );
};

export default ocrRoutes;
