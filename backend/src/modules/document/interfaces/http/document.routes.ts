import { randomUUID }                    from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { MultipartFile }            from '@fastify/multipart';
import { authenticate }                  from '../../../../shared/plugins/authenticate.hook';
import { createSuccessResponse }         from '../../../../shared/response.helpers';
import type {
  IDocumentRepository,
  ProcessingEventData,
  DocumentFilters,
}                                        from '../../domain/ports/document.repository.port';
import type { IWorkspaceRepository }     from '../../../workspace/domain/ports/workspace.repository.port';
import type { IS3Service }               from '../../domain/ports/s3.service.port';
import type { IEventBus }                from '../../../../shared/events/event-bus.port';
import { createDocumentUploadedEvent }   from '../../../../shared/events/domain-events';
import { DocumentRepositoryAdapter }     from '../../../../infra/database/repositories/document.repository.adapter';
import { WorkspaceRepositoryAdapter }    from '../../../../infra/database/repositories/workspace.repository.adapter';
import { S3ServiceAdapter }              from '../../../../infra/storage/s3.service.adapter';
import { DocumentMetadata }              from '../../domain/document-metadata.value-object';
import type { Document, ProcessingStatus } from '../../domain/document.aggregate';
import type { DetectedType }             from '../../domain/document-intelligence.value-object';
import {
  WorkspaceNotFoundError,
  DocumentNotFoundError,
  ForbiddenError,
  DocumentNotReadyError,
  InvalidStatusTransitionError,
  WorkspaceArchivedError,
  UnsupportedMimeTypeError,
  FileTooLargeError,
  DocumentQuotaExceededError,
}                                        from '../../../../shared/errors/domain-errors';
import {
  idParamSchema,
  patchDocumentBodySchema,
}                                        from './document.schemas';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SUPPORTED_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

function extFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'application/pdf': '.pdf',
    'image/jpeg':      '.jpg',
    'image/png':       '.png',
  };
  return map[mimeType] ?? '';
}

function fileNameWithoutExt(name: string): string {
  return name.replace(/\.[^.]+$/, '') || name;
}

function detectMimeFromMagicBytes(buf: Buffer): string | null {
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  return null;
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function toListResponse(doc: Document) {
  return {
    id:               doc.id,
    workspaceId:      doc.workspaceId,
    title:            doc.metadata.title,
    originalFilename: doc.originalFilename,
    mimeType:         doc.mimeType,
    fileSizeBytes:    Number(doc.fileSizeBytes),
    processingStatus: doc.processingStatus,
    thumbnailUrl:     doc.thumbnailRef ?? null,
    intelligence:     doc.intelligence
      ? {
        detectedType:          doc.intelligence.detectedType,
        suggestedTags:         doc.intelligence.suggestedTags,
        globalConfidenceScore: doc.intelligence.globalConfidenceScore,
        extractedEntities:     doc.intelligence.extractedEntities,
      }
      : null,
    metadata: {
      userTags:         doc.metadata.userTags,
      notes:            doc.metadata.notes,
      userOverrideType: doc.metadata.userOverrideType,
      lastEditedAt:     doc.metadata.lastEditedAt?.toISOString() ?? null,
    },
    uploadedAt: doc.uploadedAt.toISOString(),
    updatedAt:  doc.updatedAt.toISOString(),
  };
}

function toDetailResponse(
  doc:         Document,
  events:      ProcessingEventData[],
  downloadUrl: string | null,
) {
  return {
    ...toListResponse(doc),
    uploadedBy:           doc.uploadedById,
    pageCount:            doc.pageCount ?? null,
    textExtractionMethod: doc.textExtractionMethod ?? null,
    extractedText:        doc.extractedText ?? null,
    downloadUrl,
    processingEvents: events.map((e) => ({
      eventId:      e.id,
      eventType:    e.eventType,
      occurredAt:   e.occurredAt.toISOString(),
      isSuccess:    e.isSuccess,
      errorMessage: e.errorMessage,
    })),
  };
}

// ── Factory ───────────────────────────────────────────────────────────────────

export interface DocumentRouteDeps {
  documentRepo:  IDocumentRepository;
  workspaceRepo: IWorkspaceRepository;
  s3Service:     IS3Service;
  eventBus:      IEventBus;
}

export function createDocumentRoutes(deps: DocumentRouteDeps): FastifyPluginAsync {
  return async function documentRoutes(fastify: FastifyInstance): Promise<void> {
    const { documentRepo, workspaceRepo, s3Service, eventBus } = deps;
    const auth = { preHandler: [authenticate] };

    // ── POST / — Upload ─────────────────────────────────────────────────────

    fastify.post('/', auth, async (request, reply) => {
      const userId    = request.user.sub;
      const userTier  = request.user.tier;

      // Quota Free
      if (String(userTier).toLowerCase() === 'free') {
        const count = await documentRepo.countActiveByUploadedById(userId);
        if (count >= 30) throw new DocumentQuotaExceededError();
      }

      // Parse multipart
      let fileBuffer: Buffer | null = null;
      let fileMimeType              = '';
      let fileName                  = 'document';
      let workspaceId               = '';
      let title: string | null      = null;

      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (part.fieldname !== 'file') {
            await part.toBuffer();
            continue;
          }
          const mpFile = part as MultipartFile;
          fileBuffer   = await mpFile.toBuffer();
          fileMimeType = mpFile.mimetype;
          fileName     = mpFile.filename ?? 'document';
          if ((mpFile as unknown as { file: { truncated: boolean } }).file?.truncated) {
            throw new FileTooLargeError();
          }
        } else {
          const val = part.value as string;
          if (part.fieldname === 'workspaceId') workspaceId = val ?? '';
          if (part.fieldname === 'title')       title       = val || null;
        }
      }

      if (!fileBuffer || !workspaceId) {
        throw new DocumentNotReadyError('Champs "file" et "workspaceId" requis.');
      }

      if (!SUPPORTED_MIMES.has(fileMimeType)) throw new UnsupportedMimeTypeError();
      const magic = detectMimeFromMagicBytes(fileBuffer);
      if (magic && magic !== fileMimeType) {
        throw new UnsupportedMimeTypeError('Le type MIME déclaré ne correspond pas au contenu du fichier.');
      }

      const workspace = await workspaceRepo.findById(workspaceId);
      if (!workspace)                   throw new WorkspaceNotFoundError(); // ← classe concrète
      if (workspace.ownerId !== userId) throw new ForbiddenError();
      if (workspace.isArchived)         throw new WorkspaceArchivedError();

      const documentId = randomUUID();
      const s3Key      = `uploads/${userId}/${documentId}${extFromMime(fileMimeType)}`;

      await s3Service.putObject(s3Key, fileBuffer, fileMimeType);

      const document = await documentRepo.create({
        id:               documentId,
        workspaceId,
        uploadedById:     userId,
        originalFilename: fileName,
        mimeType:         fileMimeType,
        fileSizeBytes:    fileBuffer.length,
        title:            title ?? fileNameWithoutExt(fileName),
        s3Key,
      });

      // Fire-and-forget : ne pas await le pipeline
      void eventBus.publish(createDocumentUploadedEvent({
        documentId:   document.id,
        workspaceId:  document.workspaceId,
        uploadedById: userId,
        mimeType:     document.mimeType,
        s3Key,
      }));

      return reply.code(201).send(createSuccessResponse(toListResponse(document)));
    });

    // ── GET / — Liste ────────────────────────────────────────────────────────

    fastify.get('/', auth, async (request, reply) => {
      const userId = request.user.sub;
      const q = request.query as {
        workspaceId:   string;
        query?:        string;
        status?:       string;
        detectedType?: string;
        userTags?:     string;
        dateFrom?:     string;
        dateTo?:       string;
        sortBy?:       string;
        sortOrder?:    string;
        page?:         string;
        limit?:        string;
      };

      if (!q.workspaceId) throw new DocumentNotReadyError('workspaceId est requis.');

      const workspace = await workspaceRepo.findById(q.workspaceId);
      if (!workspace)                   throw new WorkspaceNotFoundError();
      if (workspace.ownerId !== userId) throw new ForbiddenError();

      const filters: DocumentFilters = {};
      if (q.query)        filters.query           = q.query;
      if (q.detectedType) filters.detectedType    = q.detectedType.split(',').filter(Boolean) as DetectedType[];
      if (q.userTags)     filters.userTags        = q.userTags.split(',').filter(Boolean);
      if (q.status)       filters.processingStatus = q.status.split(',').filter(Boolean) as ProcessingStatus[];
      if (q.dateFrom)     filters.dateFrom        = new Date(q.dateFrom);
      if (q.dateTo)       filters.dateTo          = new Date(q.dateTo);
      if (q.sortBy)       filters.sortBy          = q.sortBy as 'uploadedAt' | 'updatedAt' | 'title';
      if (q.sortOrder)    filters.sortOrder       = q.sortOrder as 'asc' | 'desc';
      if (q.page)         filters.page            = parseInt(q.page, 10);
      if (q.limit)        filters.limit           = parseInt(q.limit, 10);

      const result     = await documentRepo.findAllByWorkspace(q.workspaceId, filters);
      const page       = result.page;
      const limit      = result.limit;
      const totalPages = Math.ceil(result.total / limit);

      return reply.send({
        data: result.items.map(toListResponse),
        meta: {
          page,
          limit,
          total:       result.total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
        error: null,
      });
    });

    // ── GET /:id — Détail ────────────────────────────────────────────────────

    fastify.get<{ Params: { id: string } }>(
      '/:id',
      { ...auth, schema: { params: idParamSchema } },
      async (request, reply) => {
        const userId = request.user.sub;
        const result = await documentRepo.findByIdWithEvents(request.params.id);

        if (!result)                                  throw new DocumentNotFoundError();
        if (result.document.uploadedById !== userId)  throw new ForbiddenError();

        const downloadUrl = result.document.s3Key
          ? await s3Service.generatePresignedGetUrl(result.document.s3Key, 900)
          : null;

        return reply.send(
          createSuccessResponse(
            toDetailResponse(result.document, result.processingEvents, downloadUrl),
          ),
        );
      },
    );

    // ── PATCH /:id — Métadonnées ─────────────────────────────────────────────

    fastify.patch<{
      Params: { id: string };
      Body: { title?: string; userTags?: string[]; notes?: string | null; userOverrideType?: DetectedType | null };
    }>(
      '/:id',
      { ...auth, schema: { params: idParamSchema, body: patchDocumentBodySchema } },
      async (request, reply) => {
        const userId   = request.user.sub;
        const document = await documentRepo.findById(request.params.id);

        if (!document)                        throw new DocumentNotFoundError();
        if (document.uploadedById !== userId) throw new ForbiddenError();
        if (['UPLOADED', 'PROCESSING'].includes(document.processingStatus)) {
          throw new DocumentNotReadyError('Modification impossible pendant le traitement.');
        }

        const { title, userTags, notes, userOverrideType } = request.body;
        const now = new Date();

        const updatedMetadata = new DocumentMetadata(
          title            ?? document.metadata.title,
          userTags         ?? [...document.metadata.userTags],
          notes            !== undefined ? notes            : document.metadata.notes,
          userOverrideType !== undefined ? userOverrideType : document.metadata.userOverrideType,
          now,
        );

        const updated = await documentRepo.update(request.params.id, {
          metadata:  updatedMetadata,
          updatedAt: now,
        });

        const downloadUrl = updated.s3Key
          ? await s3Service.generatePresignedGetUrl(updated.s3Key, 900)
          : null;

        const withEvents = await documentRepo.findByIdWithEvents(updated.id);
        return reply.send(
          createSuccessResponse(
            toDetailResponse(updated, withEvents?.processingEvents ?? [], downloadUrl),
          ),
        );
      },
    );

    // ── DELETE /:id — Soft delete ────────────────────────────────────────────

    fastify.delete<{ Params: { id: string } }>(
      '/:id',
      { ...auth, schema: { params: idParamSchema } },
      async (request, reply) => {
        const userId   = request.user.sub;
        const document = await documentRepo.findById(request.params.id);

        if (!document)                        throw new DocumentNotFoundError();
        if (document.uploadedById !== userId) throw new ForbiddenError();

        await documentRepo.softDelete(request.params.id);
        return reply.code(204).send();
      },
    );

    // ── POST /:id/reprocess ──────────────────────────────────────────────────

    fastify.post<{ Params: { id: string } }>(
      '/:id/reprocess',
      { ...auth, schema: { params: idParamSchema } },
      async (request, reply) => {
        const userId   = request.user.sub;
        const document = await documentRepo.findById(request.params.id);

        if (!document)                        throw new DocumentNotFoundError();
        if (document.uploadedById !== userId) throw new ForbiddenError();
        if (document.processingStatus !== 'FAILED') {
          throw new InvalidStatusTransitionError(document.processingStatus, 'PENDING_RETRY');
        }

        await documentRepo.updateStatus(request.params.id, 'PENDING_RETRY');

        if (document.s3Key) {
          void eventBus.publish(createDocumentUploadedEvent({
            documentId:   document.id,
            workspaceId:  document.workspaceId,
            uploadedById: userId,
            mimeType:     document.mimeType,
            s3Key:        document.s3Key,
          }));
        }

        return reply.send(createSuccessResponse({
          id:               document.id,
          processingStatus: 'PENDING_RETRY',
          updatedAt:        new Date().toISOString(),
        }));
      },
    );

    // ── POST /:id/archive ────────────────────────────────────────────────────

    fastify.post<{ Params: { id: string } }>(
      '/:id/archive',
      { ...auth, schema: { params: idParamSchema } },
      async (request, reply) => {
        const userId   = request.user.sub;
        const document = await documentRepo.findById(request.params.id);

        if (!document)                        throw new DocumentNotFoundError();
        if (document.uploadedById !== userId) throw new ForbiddenError();
        if (!['ENRICHED', 'CLASSIFIED_ONLY'].includes(document.processingStatus)) {
          throw new InvalidStatusTransitionError(document.processingStatus, 'ARCHIVED');
        }

        await documentRepo.updateStatus(request.params.id, 'ARCHIVED');

        return reply.send(createSuccessResponse({
          id:               document.id,
          processingStatus: 'ARCHIVED',
          updatedAt:        new Date().toISOString(),
        }));
      },
    );
  };
}

// ── Export par défaut (production) ────────────────────────────────────────────

export default async function documentRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(
    createDocumentRoutes({
      documentRepo:  new DocumentRepositoryAdapter(fastify.prisma),
      workspaceRepo: new WorkspaceRepositoryAdapter(fastify.prisma),
      s3Service:     S3ServiceAdapter.fromEnv(),
      eventBus:      fastify.eventBus,
    }),
  );
}
