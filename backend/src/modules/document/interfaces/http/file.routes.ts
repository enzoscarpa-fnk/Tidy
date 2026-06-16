import type { FastifyPluginAsync } from 'fastify';
import { DocumentRepositoryAdapter }  from '../../../../infra/database/repositories/document.repository.adapter';
import { S3ServiceAdapter }           from '../../../../infra/storage/s3.service.adapter';
import { WorkspaceRepositoryAdapter } from '../../../../infra/database/repositories/workspace.repository.adapter';
import { WorkspaceService }           from '../../../workspace/application/workspace.service';
import { authenticate }               from '../../../../shared/plugins/authenticate.hook';
import { AppError }                   from '../../../../shared/errors/app-error';
import { createSuccessResponse }      from '../../../../shared/response.helpers';
import { uploadUrlBodySchema, documentIdParamSchema } from './document.schemas';

// ── Constantes ────────────────────────────────────────────────────────────────

const PRESIGNED_PUT_TTL_SEC = 10 * 60; // 10 minutes
const PRESIGNED_GET_TTL_SEC = 15 * 60; // 15 minutes
const MAX_FILE_SIZE_BYTES   = 50 * 1024 * 1024; // 50 Mo

const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png']);

/** Mapping MIME → extension de fichier pour la construction de la clé S3. */
const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg':      'jpg',
  'image/png':       'png',
};

// ── Types de requête ──────────────────────────────────────────────────────────

type UploadUrlBody = {
  document_id:     string;
  mime_type:       string;
  file_size_bytes: number;
};

type DocumentIdParam = {
  id: string;
};

// ── Plugin ────────────────────────────────────────────────────────────────────

const fileRoutes: FastifyPluginAsync = async (fastify) => {
  const documentRepo     = new DocumentRepositoryAdapter(fastify.prisma);
  const workspaceService = new WorkspaceService(new WorkspaceRepositoryAdapter(fastify.prisma));
  const s3               = S3ServiceAdapter.fromEnv();

  // ── POST /api/v1/files/upload-url ─────────────────────────────────────────

  fastify.post<{ Body: UploadUrlBody }>(
    '/upload-url',
    {
      schema:     { body: uploadUrlBodySchema },
      preHandler: authenticate,
    },
    async (request, reply) => {
      const { document_id, mime_type, file_size_bytes } = request.body;
      const userId = request.user.sub;

      if (!ALLOWED_MIME.has(mime_type)) {
        throw new AppError(
          'UNSUPPORTED_MIME_TYPE',
          `Type MIME non supporté : ${mime_type}. Acceptés : application/pdf, image/jpeg, image/png.`,
        );
      }

      if (file_size_bytes > MAX_FILE_SIZE_BYTES) {
        throw new AppError('FILE_TOO_LARGE', 'Le fichier dépasse la limite de 50 Mo.');
      }

      const doc = await documentRepo.findById(document_id);
      if (!doc || doc.isDeleted) {
        throw new AppError('DOCUMENT_NOT_FOUND', 'Document introuvable.');
      }

      await workspaceService.findById(doc.workspaceId, userId);

      let s3Key = doc.s3Key;
      if (!s3Key) {
        const ext = MIME_TO_EXT[mime_type] ?? 'bin';
        s3Key = `documents/${doc.workspaceId}/${doc.id}.${ext}`;
        await documentRepo.update(doc.id, { s3Key });
      }

      const uploadUrl = await s3.generatePresignedPutUrl(s3Key, mime_type, PRESIGNED_PUT_TTL_SEC);

      return reply
        .status(200)
        .send(createSuccessResponse({ upload_url: uploadUrl, s3_key: s3Key }));
    },
  );

  // ── GET /api/v1/files/download-url/:id ────────────────────────────────────

  fastify.get<{ Params: DocumentIdParam }>(
    '/download-url/:id',
    {
      schema:     { params: documentIdParamSchema },
      preHandler: authenticate,
    },
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.user.sub;

      const doc = await documentRepo.findById(id);
      if (!doc || doc.isDeleted) {
        throw new AppError('DOCUMENT_NOT_FOUND', 'Document introuvable.');
      }

      await workspaceService.findById(doc.workspaceId, userId);

      if (!doc.s3Key) {
        throw new AppError(
          'FILE_NOT_UPLOADED',
          'Le fichier n\'a pas encore été uploadé sur S3.',
        );
      }

      const downloadUrl = await s3.generatePresignedGetUrl(doc.s3Key, PRESIGNED_GET_TTL_SEC);

      return reply
        .status(200)
        .send(createSuccessResponse({ download_url: downloadUrl, expires_in: PRESIGNED_GET_TTL_SEC }));
    },
  );
};

export default fileRoutes;
