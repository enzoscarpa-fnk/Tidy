import { randomUUID }                from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import multipart                     from '@fastify/multipart';
import type { MultipartFile, MultipartValue } from '@fastify/multipart';
import { DocumentRepositoryAdapter } from '../../../../infra/database/repositories/document.repository.adapter';
import { S3ServiceAdapter }          from '../../../../infra/storage/s3.service.adapter';
import { WorkspaceRepositoryAdapter } from '../../../../infra/database/repositories/workspace.repository.adapter';
import { WorkspaceService }          from '../../../workspace/application/workspace.service';
import { authenticate }              from '../../../../shared/plugins/authenticate.hook';
import { DocumentUploadedEvent }     from '../../domain/events/document-uploaded.event';
import { DocumentIntelligence }      from '../../domain/document-intelligence.value-object';
import type { DetectedType }         from '../../domain/document-intelligence.value-object';
import {
  createSuccessResponse,
  createPaginatedResponse,
}                                    from '../../../../shared/response.helpers';
import { AppError }                  from '../../../../shared/errors/app-error';
import type { Document, ProcessingStatus } from '../../domain/document.aggregate';
import {
  documentIdParamSchema,
  listDocumentsQuerySchema,
  patchDocumentBodySchema,
}                                    from './document.schemas';

// ── Constantes ────────────────────────────────────────────────────────────────

const ALLOWED_MIME         = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_SIZE_BYTES       = 50 * 1024 * 1024;
const DOWNLOAD_URL_TTL_SEC = 15 * 60;

const REPROCESSABLE_STATUSES = new Set<ProcessingStatus>(['FAILED']);
const ARCHIVABLE_STATUSES    = new Set<ProcessingStatus>(['ENRICHED', 'CLASSIFIED_ONLY']);

// ── Types de requête ──────────────────────────────────────────────────────────

type IdParam   = { id: string };
type ListQuery = {
  workspaceId?:      string;
  processingStatus?: string;
  detectedType?:     string;
  query?:            string;
  userTags?:         string;
  page?:             string;
  limit?:            string;
  sortBy?:           'uploadedAt' | 'title' | 'updatedAt';
  sortOrder?:        'asc' | 'desc';
};
type PatchBody = {
  title?:            string;
  userTags?:         string[];
  notes?:            string | null;
  userOverrideType?: DetectedType;
};

// ── Helper : FastifyRequest augmenté par @fastify/multipart ──────────────────

type MultipartRequest = FastifyRequest & {
  parts(): AsyncIterableIterator<MultipartFile | MultipartValue<unknown>>;
};

// ── DTOs ──────────────────────────────────────────────────────────────────────

function toListDto(doc: Document) {
  return {
    id:               doc.id,
    workspaceId:      doc.workspaceId,
    originalFilename: doc.originalFilename,
    mimeType:         doc.mimeType,
    fileSizeBytes:    doc.fileSizeBytes,
    processingStatus: doc.processingStatus,
    title:            doc.metadata.title,
    userTags:         [...doc.metadata.userTags],
    thumbnailRef:     doc.thumbnailRef,
    detectedType:     doc.intelligence?.detectedType ?? null,
    uploadedAt:       doc.uploadedAt.toISOString(),
    updatedAt:        doc.updatedAt.toISOString(),
  };
}

interface ProcessingEventRow {
  id:           string;
  eventType:    string;
  isSuccess:    boolean;
  errorMessage: string | null;
  payload:      unknown;
  occurredAt:   Date;
}

function toDetailDto(
  doc: Document,
  processingEvents: ProcessingEventRow[],
  downloadUrl: string | null,
) {
  return {
    ...toListDto(doc),
    uploadedById:         doc.uploadedById,
    notes:                doc.metadata.notes,
    pageCount:            doc.pageCount,
    s3Key:                doc.s3Key,
    extractedText:        doc.extractedText,
    textExtractionMethod: doc.textExtractionMethod,
    downloadUrl,
    intelligence: doc.intelligence
      ? {
        detectedType:          doc.intelligence.detectedType,
        globalConfidenceScore: doc.intelligence.globalConfidenceScore,
        suggestedTags:         [...doc.intelligence.suggestedTags],
        extractedEntities:     doc.intelligence.extractedEntities,
      }
      : null,
    processingEvents: processingEvents.map((e) => ({
      id:           e.id,
      eventType:    e.eventType,
      isSuccess:    e.isSuccess,
      errorMessage: e.errorMessage,
      payload:      e.payload,
      occurredAt:   e.occurredAt.toISOString(),
    })),
  };
}

// ── Helper partagé : récupère un doc et vérifie l'ownership ──────────────────

async function resolveDocument(
  documentRepo: DocumentRepositoryAdapter,
  workspaceService: WorkspaceService,
  documentId: string,
  userId: string,
): Promise<Document> {
  const doc = await documentRepo.findById(documentId);

  if (!doc || doc.isDeleted) {
    throw new AppError('DOCUMENT_NOT_FOUND', 'Document introuvable.');
  }

  await workspaceService.findById(doc.workspaceId, userId);

  return doc;
}

// ── Plugin ────────────────────────────────────────────────────────────────────

const documentRoutes: FastifyPluginAsync = async (fastify) => {

  await fastify.register(multipart, {
    limits: { fileSize: MAX_SIZE_BYTES, files: 1, fields: 10 },
  });

  const documentRepo     = new DocumentRepositoryAdapter(fastify.prisma);
  const workspaceService = new WorkspaceService(new WorkspaceRepositoryAdapter(fastify.prisma));
  const s3               = S3ServiceAdapter.fromEnv();

  // ── POST / — upload multipart ──────────────────────────────────────────────

  fastify.post(
    '/',
    { preHandler: authenticate },
    async (request, reply) => {
      let fileBuffer:       Buffer | null = null;
      let originalFilename: string        = '';
      let mimeType:         string        = '';
      let workspaceId:      string | undefined;
      let title:            string | undefined;

      for await (const part of (request as MultipartRequest).parts()) {
        if (part.type === 'file') {
          try {
            fileBuffer = await part.toBuffer();
          } catch (error: unknown) {
            const code = (error as { code?: string }).code;
            if (code === 'FST_REQ_FILE_TOO_LARGE') {
              throw new AppError('FILE_TOO_LARGE', 'Le fichier dépasse la limite de 50 Mo.');
            }
            throw error;
          }

          if ((part.file as NodeJS.ReadableStream & { truncated?: boolean }).truncated) {
            throw new AppError('FILE_TOO_LARGE', 'Le fichier dépasse la limite de 50 Mo.');
          }

          originalFilename = part.filename;
          mimeType         = part.mimetype;
        } else {
          const val = (part.value as string)?.trim();
          if (part.fieldname === 'workspaceId') workspaceId = val || undefined;
          if (part.fieldname === 'title'      ) title       = val || undefined;
        }
      }

      if (!fileBuffer || !originalFilename) {
        throw new AppError('VALIDATION_ERROR', 'Aucun fichier fourni.');
      }

      if (!ALLOWED_MIME.has(mimeType)) {
        throw new AppError(
          'UNSUPPORTED_MIME_TYPE',
          `Type MIME non supporté : ${mimeType}. Acceptés : application/pdf, image/jpeg, image/png.`,
        );
      }

      if (!workspaceId) {
        throw new AppError('VALIDATION_ERROR', 'Le champ workspaceId est requis.');
      }

      await workspaceService.findById(workspaceId, request.user.sub);

      const documentId = randomUUID();
      const ext        = originalFilename.split('.').pop()?.toLowerCase() ?? 'bin';
      const s3Key      = `documents/${workspaceId}/${documentId}.${ext}`;
      const now        = new Date();

      await s3.putObject(s3Key, fileBuffer, mimeType);

      await documentRepo.create({
        id:               documentId,
        workspaceId,
        uploadedById:     request.user.sub,
        originalFilename,
        mimeType,
        fileSizeBytes:    fileBuffer.length,
        title:            title ?? null,
        uploadedAt:       now,
      });

      const document = await documentRepo.update(documentId, { s3Key, updatedAt: now });

      fastify.eventBus.publish(
        new DocumentUploadedEvent({
          documentId,
          workspaceId,
          uploadedById:  request.user.sub,
          s3Key,
          mimeType,
          fileSizeBytes: fileBuffer.length,
        }),
      );

      return reply.status(201).send(createSuccessResponse(toListDto(document)));
    },
  );

  // ── GET / — liste avec filtres ─────────────────────────────────────────────

  fastify.get<{ Querystring: ListQuery }>(
    '/',
    {
      schema:     { querystring: listDocumentsQuerySchema },
      preHandler: authenticate,
    },
    async (request, reply) => {
      const q = request.query;

      if (!q.workspaceId) {
        throw new AppError('VALIDATION_ERROR', 'Le paramètre workspaceId est requis.');
      }

      await workspaceService.findById(q.workspaceId, request.user.sub);

      const page  = Math.max(1, parseInt(q.page  ?? '1',  10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(q.limit ?? '30', 10) || 30));

      const processingStatus = q.processingStatus
        ? (q.processingStatus.split(',').map(s => s.trim()).filter(Boolean) as ProcessingStatus[])
        : undefined;

      const detectedType = q.detectedType
        ? (q.detectedType.split(',').map(s => s.trim()).filter(Boolean) as DetectedType[])
        : undefined;

      const userTags = q.userTags
        ? q.userTags.split(',').map(s => s.trim()).filter(Boolean)
        : undefined;

      const query = q.query?.trim() || undefined;

      const { items, total } = await documentRepo.findAllByWorkspace(q.workspaceId, {
        ...(processingStatus && { processingStatus }),
        ...(detectedType     && { detectedType }),
        ...(userTags         && { userTags }),
        ...(query            && { query }),
        ...(q.sortBy         && { sortBy: q.sortBy }),
        ...(q.sortOrder      && { sortOrder: q.sortOrder }),
        page,
        limit,
      });

      return reply.send(
        createPaginatedResponse(items.map(toListDto), total, page, limit),
      );
    },
  );

  // ── GET /:id — détail complet ──────────────────────────────────────────────

  fastify.get<{ Params: IdParam }>(
    '/:id',
    {
      schema:     { params: documentIdParamSchema },
      preHandler: authenticate,
    },
    async (request, reply) => {
      const doc = await resolveDocument(
        documentRepo, workspaceService, request.params.id, request.user.sub,
      );

      const processingEvents = await fastify.prisma.processingEvent.findMany({
        where:   { documentId: doc.id },
        orderBy: { occurredAt: 'asc' },
        select: {
          id:           true,
          eventType:    true,
          isSuccess:    true,
          errorMessage: true,
          payload:      true,
          occurredAt:   true,
        },
      });

      const downloadUrl = doc.s3Key
        ? await s3.generatePresignedGetUrl(doc.s3Key, DOWNLOAD_URL_TTL_SEC)
        : null;

      return reply.send(
        createSuccessResponse(toDetailDto(doc, processingEvents, downloadUrl)),
      );
    },
  );

  // ── PATCH /:id — métadonnées uniquement ───────────────────────────────────

  fastify.patch<{ Params: IdParam; Body: PatchBody }>(
    '/:id',
    {
      schema:     { params: documentIdParamSchema, body: patchDocumentBodySchema },
      preHandler: authenticate,
    },
    async (request, reply) => {
      const doc  = await resolveDocument(
        documentRepo, workspaceService, request.params.id, request.user.sub,
      );
      const body = request.body;

      if (doc.processingStatus === 'UPLOADED' || doc.processingStatus === 'PROCESSING') {
        throw new AppError(
          'DOCUMENT_NOT_READY',
          "Action impossible : document pas dans l'état requis.",
        );
      }

      let metadata = doc.metadata;
      if (body.title    !== undefined) metadata = metadata.withTitle(body.title);
      if (body.userTags !== undefined) metadata = metadata.withUserTags(body.userTags);
      if (body.notes    !== undefined) metadata = metadata.withNotes(body.notes);

      let intelligence = doc.intelligence ?? undefined;
      if (body.userOverrideType !== undefined) {
        if (intelligence) {
          intelligence = new DocumentIntelligence(
            body.userOverrideType,
            intelligence.extractedEntities,
            intelligence.globalConfidenceScore,
            intelligence.suggestedTags,
          );
        } else {
          intelligence = new DocumentIntelligence(body.userOverrideType, [], 0, []);
        }
      }

      const updated = await documentRepo.update(doc.id, {
        metadata,
        ...(body.userOverrideType !== undefined && { intelligence: intelligence ?? null }),
        updatedAt: new Date(),
      });

      const processingEvents = await fastify.prisma.processingEvent.findMany({
        where:   { documentId: updated.id },
        orderBy: { occurredAt: 'asc' },
        select: {
          id:           true,
          eventType:    true,
          isSuccess:    true,
          errorMessage: true,
          payload:      true,
          occurredAt:   true,
        },
      });

      const downloadUrl = updated.s3Key
        ? await s3.generatePresignedGetUrl(updated.s3Key, DOWNLOAD_URL_TTL_SEC)
        : null;

      return reply.send(
        createSuccessResponse(toDetailDto(updated, processingEvents, downloadUrl)),
      );
    },
  );

  // ── DELETE /:id — soft delete ──────────────────────────────────────────────

  fastify.delete<{ Params: IdParam }>(
    '/:id',
    {
      schema:     { params: documentIdParamSchema },
      preHandler: authenticate,
    },
    async (request, reply) => {
      await resolveDocument(
        documentRepo, workspaceService, request.params.id, request.user.sub,
      );

      await documentRepo.softDelete(request.params.id);

      return reply.status(204).send();
    },
  );

  // ── POST /:id/reprocess ────────────────────────────────────────────────────

  fastify.post<{ Params: IdParam }>(
    '/:id/reprocess',
    {
      schema:     { params: documentIdParamSchema },
      preHandler: authenticate,
    },
    async (request, reply) => {
      const doc = await resolveDocument(
        documentRepo, workspaceService, request.params.id, request.user.sub,
      );

      if (!REPROCESSABLE_STATUSES.has(doc.processingStatus)) {
        throw new AppError(
          'INVALID_STATUS_TRANSITION',
          `Impossible de relancer l'analyse : statut "${doc.processingStatus}" non éligible. ` +
          'Statut autorisé : FAILED.',
        );
      }

      if (!doc.s3Key) {
        throw new AppError(
          'INVALID_STATUS_TRANSITION',
          "Impossible de relancer l'analyse : aucun fichier associé au document.",
        );
      }

      await documentRepo.updateStatus(doc.id, 'PENDING_RETRY');

      fastify.eventBus.publish(
        new DocumentUploadedEvent({
          documentId:    doc.id,
          workspaceId:   doc.workspaceId,
          uploadedById:  doc.uploadedById,
          s3Key:         doc.s3Key,
          mimeType:      doc.mimeType,
          fileSizeBytes: doc.fileSizeBytes,
        }),
      );

      return reply.send(
        createSuccessResponse({ id: doc.id, processingStatus: 'PENDING_RETRY' }),
      );
    },
  );

  // ── POST /:id/archive ──────────────────────────────────────────────────────

  fastify.post<{ Params: IdParam }>(
    '/:id/archive',
    {
      schema:     { params: documentIdParamSchema },
      preHandler: authenticate,
    },
    async (request, reply) => {
      const doc = await resolveDocument(
        documentRepo, workspaceService, request.params.id, request.user.sub,
      );

      if (!ARCHIVABLE_STATUSES.has(doc.processingStatus)) {
        throw new AppError(
          'INVALID_STATUS_TRANSITION',
          `Impossible d'archiver : statut "${doc.processingStatus}" non éligible. ` +
          'Statuts autorisés : ENRICHED, CLASSIFIEDONLY.',
        );
      }

      await documentRepo.updateStatus(doc.id, 'ARCHIVED');

      return reply.send(
        createSuccessResponse({ id: doc.id, processingStatus: 'ARCHIVED' }),
      );
    },
  );
};

export default documentRoutes;
