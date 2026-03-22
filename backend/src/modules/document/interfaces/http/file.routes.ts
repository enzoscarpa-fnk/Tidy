import type { FastifyPluginAsync } from 'fastify';
import { DocumentRepositoryAdapter }  from '../../../../infra/database/repositories/document.repository.adapter';
import { S3ServiceAdapter }           from '../../../../infra/storage/s3.service.adapter';
import { WorkspaceRepositoryAdapter } from '../../../../infra/database/repositories/workspace.repository.adapter';
import { WorkspaceService }           from '../../../workspace/application/workspace.service';
import { authenticate }               from '../../../../shared/plugins/authenticate.hook';
import { AppError }                   from '../../../../shared/errors/app-error';
import { createSuccessResponse }      from '../../../../shared/response.helpers';
import { uploadUrlBodySchema }        from './document.schemas';

// ── Constantes ────────────────────────────────────────────────────────────────

const PRESIGNED_PUT_TTL_SEC = 10 * 60; // 10 minutes
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

// ── Plugin ────────────────────────────────────────────────────────────────────

const fileRoutes: FastifyPluginAsync = async (fastify) => {
  const documentRepo     = new DocumentRepositoryAdapter(fastify.prisma);
  const workspaceService = new WorkspaceService(new WorkspaceRepositoryAdapter(fastify.prisma));
  const s3               = S3ServiceAdapter.fromEnv();

  /**
   * POST /api/v1/files/upload-url
   *
   * Génère une presigned PUT URL S3 valide 10 minutes pour l'upload direct
   * depuis le client mobile (flux offline-first / sync).
   *
   * Flux attendu :
   *   1. Le client a créé le document localement et l'a synchronisé via POST /documents/sync.
   *   2. Le client appelle cette route pour obtenir l'URL de dépôt S3.
   *   3. Le client PUT le fichier binaire directement vers S3.
   *   4. Le pipeline OCR est déclenché séparément (POST /ocr/process).
   *
   * Si le document n'a pas encore de s3Key en base (cas sync sans upload préalable),
   * une clé est générée et persistée immédiatement — le pipeline pourra la trouver.
   */
  fastify.post<{ Body: UploadUrlBody }>(
    '/upload-url',
    {
      schema:     { body: uploadUrlBodySchema },
      preHandler: authenticate,
    },
    async (request, reply) => {
      const { document_id, mime_type, file_size_bytes } = request.body;
      const userId = request.user.sub;

      // ── 1. Validation du MIME ──────────────────────────────────────────────

      if (!ALLOWED_MIME.has(mime_type)) {
        throw new AppError(
          'UNSUPPORTED_MIME_TYPE',
          `Type MIME non supporté : ${mime_type}. Acceptés : application/pdf, image/jpeg, image/png.`,
        );
      }

      // ── 2. Validation de la taille (défense en profondeur — aussi dans le schéma) ─

      if (file_size_bytes > MAX_FILE_SIZE_BYTES) {
        throw new AppError(
          'FILE_TOO_LARGE',
          'Le fichier dépasse la limite de 50 Mo.',
        );
      }

      // ── 3. Vérification existence du document ──────────────────────────────

      const doc = await documentRepo.findById(document_id);

      if (!doc || doc.isDeleted) {
        throw new AppError('DOCUMENT_NOT_FOUND', 'Document introuvable.');
      }

      // ── 4. Vérification ownership via le workspace ─────────────────────────
      //    workspaceService.findById lance WORKSPACE_NOT_FOUND (404) ou FORBIDDEN (403)
      //    si le workspace n'appartient pas à l'utilisateur.

      await workspaceService.findById(doc.workspaceId, userId);

      // ── 5. Génération / réutilisation de la clé S3 ────────────────────────
      //    Si le document possède déjà un s3Key (upload direct précédent ou sync),
      //    on le réutilise — l'URL presignée pointera vers la même clé.
      //    Sinon on en génère une et on la persiste immédiatement.

      let s3Key = doc.s3Key;

      if (!s3Key) {
        const ext = MIME_TO_EXT[mime_type] ?? 'bin';
        s3Key = `documents/${doc.workspaceId}/${doc.id}.${ext}`;

        await documentRepo.update(doc.id, { s3Key });
      }

      // ── 6. Génération de la presigned PUT URL (TTL : 10 min) ──────────────

      const uploadUrl = await s3.generatePresignedPutUrl(s3Key, mime_type, PRESIGNED_PUT_TTL_SEC);

      return reply
        .status(200)
        .send(createSuccessResponse({ upload_url: uploadUrl, s3_key: s3Key }));
    },
  );
};

export default fileRoutes;
