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
          tier:        user.tier.toLowerCase(),   // "FREE" → "free" (contrat API)
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

      // Body vide → rien à faire, retourner le profil actuel
      const user = await userRepo.findById(request.user.sub);
      if (!user) throw new UserNotFoundError();

      if (displayName !== undefined) {
        await userRepo.updateDisplayName(user.id, displayName.trim());
      }

      // Recharger le profil mis à jour
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
};

export default meRoutes;
