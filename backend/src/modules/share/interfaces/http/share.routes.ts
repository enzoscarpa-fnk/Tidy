import { randomBytes }                from 'node:crypto';
import type { FastifyPluginAsync }     from 'fastify';
import { DocumentRepositoryAdapter }  from '../../../../infra/database/repositories/document.repository.adapter';
import { WorkspaceRepositoryAdapter } from '../../../../infra/database/repositories/workspace.repository.adapter';
import { WorkspaceService }           from '../../../workspace/application/workspace.service';
import { ShareLinkRepositoryAdapter } from '../../../../infra/database/repositories/share-link.repository.adapter';
import { authenticate }               from '../../../../shared/plugins/authenticate.hook';
import { createSuccessResponse }      from '../../../../shared/response.helpers';
import { AppError }                   from '../../../../shared/errors/app-error';

// ── Constantes ────────────────────────────────────────────────────────────────

/**
 * Durées en millisecondes pour chaque valeur d'expiresIn.
 * Invariant : seules ces trois valeurs sont acceptées (validé par JSON Schema).
 */
const EXPIRES_IN_MS: Record<string, number> = {
  '24h': 24       * 60 * 60 * 1000,
  '7d':  7  * 24  * 60 * 60 * 1000,
  '30d': 30 * 24  * 60 * 60 * 1000,
};

// ── Schémas ───────────────────────────────────────────────────────────────────

const documentIdParamSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
} as const;

const shareLinkIdParamSchema = {
  type: 'object',
  required: ['linkId'],
  properties: {
    linkId: { type: 'string', format: 'uuid' },
  },
} as const;

const createShareLinkBodySchema = {
  type: 'object',
  required: ['expiresIn'],
  additionalProperties: false,
  properties: {
    expiresIn: { type: 'string', enum: ['24h', '7d', '30d'] },
  },
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

type IdParam     = { id: string };
type LinkIdParam = { linkId: string };
type ShareBody   = { expiresIn: '24h' | '7d' | '30d' };

// ── Plugin ────────────────────────────────────────────────────────────────────

/**
 * Routes de partage authentifiées — enregistrées sous le préfixe `/api/v1`.
 *
 * Chemins exposés :
 *   POST   /api/v1/documents/:id/share  → création d'un lien de partage
 *   DELETE /api/v1/share/:linkId        → révocation d'un lien
 */
const shareRoutes: FastifyPluginAsync = async (fastify) => {
  const documentRepo     = new DocumentRepositoryAdapter(fastify.prisma);
  const shareLinkRepo    = new ShareLinkRepositoryAdapter(fastify.prisma);
  const workspaceService = new WorkspaceService(new WorkspaceRepositoryAdapter(fastify.prisma));

  // ── POST /documents/:id/share ─────────────────────────────────────────────

  fastify.post<{ Params: IdParam; Body: ShareBody }>(
    '/documents/:id/share',
    {
      schema:     { params: documentIdParamSchema, body: createShareLinkBodySchema },
      preHandler: authenticate,
    },
    async (request, reply) => {
      const { id: documentId } = request.params;
      const { expiresIn }      = request.body;
      const userId             = request.user.sub;

      // Vérification existence + ownership via workspace
      const doc = await documentRepo.findById(documentId);
      if (!doc || doc.isDeleted) {
        throw new AppError('DOCUMENT_NOT_FOUND', 'Document introuvable.');
      }
      await workspaceService.findById(doc.workspaceId, userId);

      // Invariant : 1 seul lien actif max par document → révoquer les existants
      await shareLinkRepo.revokeAllForDocument(documentId);

      // Génération du token — 32 bytes → 43 chars base64url (URL-safe, pas de padding)
      const token     = randomBytes(32).toString('base64url');
      const now       = new Date();
      const expiresAt = new Date(now.getTime() + EXPIRES_IN_MS[expiresIn]!);

      const shareLink = await shareLinkRepo.create({
        documentId,
        userId,
        token,
        expiresAt,
      });

      // Construction de l'URL publique — APP_BASE_URL doit être défini en prod
      const baseUrl  = (process.env['APP_BASE_URL'] ?? '').replace(/\/$/, '');
      const shareUrl = `${baseUrl}/s/${shareLink.token}`;

      return reply.status(201).send(
        createSuccessResponse({
          linkId:    shareLink.id,
          shareUrl,
          token:     shareLink.token,
          expiresAt: shareLink.expiresAt.toISOString(),
        }),
      );
    },
  );

  // ── DELETE /share/:linkId — révocation ────────────────────────────────────

  fastify.delete<{ Params: LinkIdParam }>(
    '/share/:linkId',
    {
      schema:     { params: shareLinkIdParamSchema },
      preHandler: authenticate,
    },
    async (request, reply) => {
      const { linkId } = request.params;
      const userId     = request.user.sub;

      const shareLink = await shareLinkRepo.findById(linkId);

      if (!shareLink) {
        throw new AppError('SHARE_LINK_NOT_FOUND', 'Lien de partage introuvable.');
      }

      // Ownership check : le lien doit appartenir à l'utilisateur courant
      if (shareLink.userId !== userId) {
        throw new AppError('FORBIDDEN', 'Accès refusé.');
      }

      await shareLinkRepo.revoke(linkId);

      return reply.status(204).send();
    },
  );
};

export default shareRoutes;
