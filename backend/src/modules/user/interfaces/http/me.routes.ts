import type { FastifyPluginAsync } from 'fastify';
import { UserRepositoryAdapter } from '../../../../infra/database/repositories/user.repository.adapter';
import { authenticate } from '../../../../shared/plugins/authenticate.hook';
import { UserNotFoundError } from '../../../../shared/errors/domain-errors';
import { createSuccessResponse } from '../../../../shared/response.helpers';

// ── JSON Schemas ──────────────────────────────────────────────────────────────

const patchMeBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    displayName: { type: 'string', minLength: 2, maxLength: 100 },
  },
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface PatchMeBody {
  displayName?: string;
}

// ── Plugin ────────────────────────────────────────────────────────────────────

const meRoutes: FastifyPluginAsync = async (fastify) => {
  const userRepo = new UserRepositoryAdapter(fastify.prisma);

  // ── GET /api/v1/me ──────────────────────────────────────────────────────────

  fastify.get('/me', {
    onRequest: [authenticate],
    handler: async (request, reply) => {
      const user = await userRepo.findById(request.user.sub);
      if (!user) throw new UserNotFoundError();

      return reply.status(200).send(
        createSuccessResponse({
          id:          user.id,
          email:       user.email,
          displayName: user.displayName,
          tier:        user.tier.toLowerCase(),
          createdAt:   user.createdAt,
        }),
      );
    },
  });

  // ── PATCH /api/v1/me ────────────────────────────────────────────────────────

  fastify.patch<{ Body: PatchMeBody }>('/me', {
    onRequest: [authenticate],
    schema: { body: patchMeBodySchema },
    handler: async (request, reply) => {
      const { displayName } = request.body;

      const user = await userRepo.findById(request.user.sub);
      if (!user) throw new UserNotFoundError();

      if (displayName !== undefined) {
        await userRepo.updateDisplayName(user.id, displayName.trim());
      }

      const updated = await userRepo.findById(request.user.sub);
      if (!updated) throw new UserNotFoundError();

      return reply.status(200).send(
        createSuccessResponse({
          id:          updated.id,
          email:       updated.email,
          displayName: updated.displayName,
          tier:        updated.tier.toLowerCase(),
          createdAt:   updated.createdAt,
        }),
      );
    },
  });

  // ── DELETE /api/v1/me ───────────────────────────────────────────────────────

  fastify.delete('/me', {
    onRequest: [authenticate],
    handler: async (request, reply) => {
      const user = await userRepo.findById(request.user.sub);
      if (!user) throw new UserNotFoundError();

      await userRepo.delete(user.id);

      return reply.status(204).send();
    },
  });

  // ── GET /api/v1/me/stats ────────────────────────────────────────────────────
  // Retourne la somme des fileSizeBytes de tous les documents non supprimés
  // appartenant à l'utilisateur, tous workspaces confondus, la taille est stockée en base.

  fastify.get('/me/stats', {
    onRequest: [authenticate],
    handler: async (request, reply) => {
      const result = await fastify.prisma.document.aggregate({
        where: {
          uploadedById: request.user.sub,
          isDeleted:    false,
        },
        _sum: {
          fileSizeBytes: true,
        },
      });

      const cloudStorageBytes = Number(result._sum.fileSizeBytes ?? 0);

      return reply.status(200).send(
        createSuccessResponse({ cloudStorageBytes }),
      );
    },
  });
};

export default meRoutes;
