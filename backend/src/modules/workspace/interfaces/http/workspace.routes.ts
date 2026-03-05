import type { FastifyPluginAsync } from 'fastify';
import { WorkspaceRepositoryAdapter } from '../../../../infra/database/repositories/workspace.repository.adapter';
import { WorkspaceService } from '../../application/workspace.service';
import { authenticate } from '../../../../shared/plugins/authenticate.hook';
import {
  workspaceIdParamSchema,
  createWorkspaceBodySchema,
  updateWorkspaceBodySchema,
  listWorkspacesQuerySchema,
} from './workspace.schemas';
import {
  createSuccessResponse,
  createPaginatedResponse,
} from '../../../../shared/response.helpers';
import type { WorkspaceWithDocumentCount } from '../../domain/workspace.entity';

// ── Types de requête ───────────────────────────────────────────────────────────

type CreateBody    = { name: string; description?: string };
type UpdateBody    = { name?: string; description?: string | null; isArchived?: boolean };
type ListQuery     = { includeArchived?: string; page?: string; limit?: string };
type IdParam       = { id: string };

// ── DTO formatter ──────────────────────────────────────────────────────────────

function toDto(ws: WorkspaceWithDocumentCount) {
  return {
    id:            ws.id,
    name:          ws.name,
    description:   ws.description,
    isArchived:    ws.isArchived,
    documentCount: ws.documentCount,
    createdAt:     ws.createdAt.toISOString(),
    updatedAt:     ws.updatedAt.toISOString(),
  };
}

// ── Plugin de routes ───────────────────────────────────────────────────────────

const workspaceRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new WorkspaceService(
    new WorkspaceRepositoryAdapter(fastify.prisma),
  );

  // ── POST / ─────────────────────────────────────────────────────────────────
  fastify.post<{ Body: CreateBody }>(
    '/',
    {
      schema:     { body: createWorkspaceBodySchema },
      preHandler: authenticate,
    },
    async (request, reply) => {
      const ws = await service.create(
        request.user.sub,
        request.body.name,
        request.body.description,
      );
      return reply.status(201).send(createSuccessResponse(toDto(ws)));
    },
  );

  // ── GET / ──────────────────────────────────────────────────────────────────
  fastify.get<{ Querystring: ListQuery }>(
    '/',
    {
      schema:     { querystring: listWorkspacesQuerySchema },
      preHandler: authenticate,
    },
    async (request, reply) => {
      const page           = Math.max(1, parseInt(request.query.page  ?? '1',  10) || 1);
      const limit          = Math.min(100, Math.max(1, parseInt(request.query.limit ?? '30', 10) || 30));
      const includeArchived = request.query.includeArchived === 'true';

      const { items, total } = await service.findAllByUser(
        request.user.sub,
        includeArchived,
        page,
        limit,
      );

      return reply.send(
        createPaginatedResponse(items.map(toDto), total, page, limit),
      );
    },
  );

  // ── GET /:id ───────────────────────────────────────────────────────────────
  fastify.get<{ Params: IdParam }>(
    '/:id',
    {
      schema:     { params: workspaceIdParamSchema },
      preHandler: authenticate,
    },
    async (request, reply) => {
      const ws = await service.findById(request.params.id, request.user.sub);
      return reply.send(createSuccessResponse(toDto(ws)));
    },
  );

  // ── PATCH /:id ─────────────────────────────────────────────────────────────
  fastify.patch<{ Params: IdParam; Body: UpdateBody }>(
    '/:id',
    {
      schema:     { params: workspaceIdParamSchema, body: updateWorkspaceBodySchema },
      preHandler: authenticate,
    },
    async (request, reply) => {
      const ws = await service.update(
        request.params.id,
        request.user.sub,
        request.body,
      );
      return reply.send(createSuccessResponse(toDto(ws)));
    },
  );

  // ── DELETE /:id ────────────────────────────────────────────────────────────
  fastify.delete<{ Params: IdParam }>(
    '/:id',
    {
      schema:     { params: workspaceIdParamSchema },
      preHandler: authenticate,
    },
    async (request, reply) => {
      await service.delete(request.params.id, request.user.sub);
      return reply.status(204).send();
    },
  );
};

export default workspaceRoutes;
