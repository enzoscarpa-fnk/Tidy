import type { FastifyPluginAsync }    from 'fastify';
import { ShareLinkRepositoryAdapter } from '../../../../infra/database/repositories/share-link.repository.adapter';
import { DocumentRepositoryAdapter }  from '../../../../infra/database/repositories/document.repository.adapter';
import { S3ServiceAdapter }           from '../../../../infra/storage/s3.service.adapter';
import { AppError }                   from '../../../../shared/errors/app-error';
import { createSuccessResponse }      from '../../../../shared/response.helpers';

// ── Constantes ────────────────────────────────────────────────────────────────

/** Durée de validité de la presigned GET URL générée pour le téléchargement. */
const DOWNLOAD_URL_TTL_SEC = 15 * 60;

// ── Schéma ────────────────────────────────────────────────────────────────────

const tokenParamSchema = {
  type: 'object',
  required: ['token'],
  properties: {
    token: { type: 'string', minLength: 1, maxLength: 100 },
  },
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

type TokenParam = { token: string };

// ── Plugin ────────────────────────────────────────────────────────────────────

/**
 * Route publique — aucune authentification requise.
 * Enregistrée sous le préfixe `/s`.
 *
 * Chemin exposé :
 *   GET /s/:token → accès au document partagé
 */
const publicShareRoutes: FastifyPluginAsync = async (fastify) => {
  const shareLinkRepo = new ShareLinkRepositoryAdapter(fastify.prisma);
  const documentRepo  = new DocumentRepositoryAdapter(fastify.prisma);
  const s3            = S3ServiceAdapter.fromEnv();

  /**
   * GET /:token
   *
   * Lookup du lien par token, vérification validité (révocation + expiration),
   * incrément accessCount, génération presigned GET URL S3.
   *
   * Retourne 404 avec un message explicite si le lien est invalide —
   * que ce soit révoqué, expiré ou inexistant (pas de distinction volontaire
   * pour éviter l'énumération de tokens).
   */
  fastify.get<{ Params: TokenParam }>(
    '/:token',
    { schema: { params: tokenParamSchema } },
    async (request, reply) => {
      const { token } = request.params;

      const shareLink = await shareLinkRepo.findByToken(token);

      // Lien inexistant → message générique (évite l'énumération de tokens)
      if (!shareLink) {
        throw new AppError(
          'SHARE_LINK_NOT_FOUND',
          'Ce lien de partage est introuvable ou a expiré.',
        );
      }

      // Lien révoqué → message explicite (conforme spec 5.9)
      if (shareLink.isRevoked) {
        throw new AppError(
          'SHARE_LINK_REVOKED',
          'Ce lien de partage a été révoqué par son propriétaire.',
        );
      }

      // Lien expiré → message explicite (conforme spec 5.9)
      if (shareLink.expiresAt <= new Date()) {
        throw new AppError(
          'SHARE_LINK_EXPIRED',
          'Ce lien de partage a expiré. Demandez un nouveau lien au propriétaire.',
        );
      }

      // Incrément du compteur d'accès avant la génération de l'URL
      await shareLinkRepo.incrementAccessCount(shareLink.id);

      // Récupération du document
      const doc = await documentRepo.findById(shareLink.documentId);

      if (!doc || doc.isDeleted) {
        throw new AppError('DOCUMENT_NOT_FOUND', 'Le document associé est introuvable.');
      }

      if (!doc.s3Key) {
        throw new AppError(
          'DOCUMENT_NOT_READY',
          'Le fichier n\'est pas encore disponible au téléchargement.',
        );
      }

      // Génération de la presigned GET URL (valable 15 min)
      const downloadUrl = await s3.generatePresignedGetUrl(doc.s3Key, DOWNLOAD_URL_TTL_SEC);

      return reply.send(
        createSuccessResponse({
          document: {
            title:    doc.metadata.title,
            mimeType: doc.mimeType,
          },
          downloadUrl,
        }),
      );
    },
  );
};

export default publicShareRoutes;
