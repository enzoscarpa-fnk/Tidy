import {
  Prisma,
  type PrismaClient,
  type Document as PrismaDocument,
  ProcessingStatus     as PrismaProcessingStatus,
  TextExtractionMethod as PrismaTextExtractionMethod,
  DetectedType         as PrismaDetectedType,
} from '@prisma/client';
import type {
  IDocumentRepository,
  CreateDocumentData,
  UpdateDocumentData,
  DocumentFilters,
  SyncUpsertPayload,
  SyncResult,
} from '../../../modules/document/domain/ports/document.repository.port';
import { Document }             from '../../../modules/document/domain/document.aggregate';
import type { ProcessingStatus, TextExtractionMethod } from '../../../modules/document/domain/document.aggregate';
import { DocumentMetadata }     from '../../../modules/document/domain/document-metadata.value-object';
import type { MetadataJson }    from '../../../modules/document/domain/document-metadata.value-object';
import { DocumentIntelligence } from '../../../modules/document/domain/document-intelligence.value-object';
import type { IntelligenceJson, DetectedType } from '../../../modules/document/domain/document-intelligence.value-object';

export class DocumentRepositoryAdapter implements IDocumentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Pivot Prisma → Domain ─────────────────────────────────────────────────

  private toDomain(row: PrismaDocument): Document {
    const metaJson = row.metadata as unknown as MetadataJson;
    const metadata = new DocumentMetadata(
      metaJson.title,
      metaJson.userTags    ?? [],
      metaJson.notes,
      metaJson.lastEditedAt ? new Date(metaJson.lastEditedAt) : null,
    );

    let intelligence: DocumentIntelligence | null = null;
    if (row.intelligence && row.detectedType) {
      const intelJson = row.intelligence as unknown as IntelligenceJson;
      intelligence = new DocumentIntelligence(
        row.detectedType as DetectedType,
        intelJson.extractedEntities    ?? [],
        intelJson.globalConfidenceScore ?? 0,
        intelJson.suggestedTags        ?? [],
      );
    }

    return new Document({
      id:                   row.id,
      workspaceId:          row.workspaceId,
      uploadedById:         row.uploadedById,
      originalFilename:     row.originalFilename,
      mimeType:             row.mimeType,
      fileSizeBytes:        Number(row.fileSizeBytes),
      pageCount:            row.pageCount,
      s3Key:                row.s3Key,
      thumbnailRef:         row.thumbnailRef,
      processingStatus:     row.processingStatus as ProcessingStatus,
      textExtractionMethod: row.textExtractionMethod as TextExtractionMethod | null,
      isDeleted:            row.isDeleted,
      extractedText:        row.extractedText,
      metadata,
      intelligence,
      uploadedAt:           row.uploadedAt,
      updatedAt:            row.updatedAt,
    });
  }

  // ── Création ───────────────────────────────────────────────────────────────

  async create(data: CreateDocumentData): Promise<Document> {
    const title = (data.title?.trim() || null) ?? data.originalFilename.replace(/\.[^.]+$/, '');

    const row = await this.prisma.document.create({
      data: {
        id:               data.id,
          workspace:        { connect: { id: data.workspaceId } },
        uploadedBy:       { connect: { id: data.uploadedById } },
        originalFilename: data.originalFilename,
          mimeType:         data.mimeType,
        fileSizeBytes:    BigInt(data.fileSizeBytes),
        processingStatus: PrismaProcessingStatus.UPLOADED,
        isDeleted:        false,
        title,
        metadata:         DocumentMetadata.default(title).toJSON() as Prisma.InputJsonValue,
        intelligence:     Prisma.JsonNull,
        uploadedAt:       data.uploadedAt,
        updatedAt:        data.uploadedAt,
      },
    });

    return this.toDomain(row);
  }

  // ── Lecture simple ─────────────────────────────────────────────────────────

  async findById(id: string): Promise<Document | null> {
    const row = await this.prisma.document.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  // ── Lecture liste — chemin Prisma standard ────────────────────────────────

  async findAllByWorkspace(
    workspaceId: string,
    filters: DocumentFilters,
  ): Promise<{ items: Document[]; total: number }> {
    const page  = Math.max(1, filters.page  ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 30));

    if (filters.query || filters.userTags?.length) {
      return this.findAllByWorkspaceRaw(workspaceId, filters, page, limit);
    }

    const where: Prisma.DocumentWhereInput = {
      workspaceId,
      isDeleted: false,
      ...(filters.processingStatus?.length && {
        processingStatus: { in: filters.processingStatus as PrismaProcessingStatus[] },
      }),
      ...(filters.detectedType?.length && {
        detectedType: { in: filters.detectedType as PrismaDetectedType[] },
      }),
      ...(filters.dateFrom && { uploadedAt: { gte: filters.dateFrom } }),
      ...(filters.dateTo   && { uploadedAt: { lte: filters.dateTo   } }),
    };

    const orderBy: Prisma.DocumentOrderByWithRelationInput = {
      [filters.sortBy ?? 'uploadedAt']: filters.sortOrder ?? 'desc',
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.document.count({ where }),
    ]);

    return { items: rows.map(this.toDomain.bind(this)), total };
  }

  // ── Lecture liste — chemin raw SQL (FTS + userTags) ───────────────────────

  private async findAllByWorkspaceRaw(
    workspaceId: string,
    filters: DocumentFilters,
    page: number,
    limit: number,
  ): Promise<{ items: Document[]; total: number }> {
    const offset = (page - 1) * limit;

    const conditions: Prisma.Sql[] = [
      Prisma.sql`d."workspaceId" = ${workspaceId}`,
      Prisma.sql`d."isDeleted"   = false`,
    ];

    if (filters.processingStatus?.length) {
      const vals = Prisma.raw(filters.processingStatus.map(s => `'${s}'`).join(', '));
      conditions.push(Prisma.sql`d."processingStatus"::text = ANY(ARRAY[${vals}])`);
    }

    if (filters.detectedType?.length) {
      const vals = Prisma.raw(filters.detectedType.map(s => `'${s}'`).join(', '));
      conditions.push(Prisma.sql`d."detectedType"::text = ANY(ARRAY[${vals}])`);
    }

    if (filters.dateFrom) {
      conditions.push(Prisma.sql`d."uploadedAt" >= ${filters.dateFrom}`);
    }
    if (filters.dateTo) {
      conditions.push(Prisma.sql`d."uploadedAt" <= ${filters.dateTo}`);
    }

    if (filters.query) {
      conditions.push(
        Prisma.sql`d."searchVector" @@ plainto_tsquery('french', ${filters.query})`,
      );
    }

    if (filters.userTags?.length) {
      const tagsJson = JSON.stringify(filters.userTags);
      conditions.push(
        Prisma.sql`d.metadata->'userTags' @> ${tagsJson}::jsonb`,
      );
    }

    const where = Prisma.join(conditions, ' AND ');

    const sortCol = Prisma.raw(`"${filters.sortBy ?? 'uploadedAt'}"`);
    const sortDir = Prisma.raw(filters.sortOrder === 'asc' ? 'ASC' : 'DESC');

    const orderBy = filters.query
      ? Prisma.sql`ts_rank(d."searchVector", plainto_tsquery('french', ${filters.query})) DESC`
      : Prisma.sql`d.${sortCol} ${sortDir}`;

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<PrismaDocument[]>`
        SELECT d.*
        FROM   "Document" d
        WHERE  ${where}
        ORDER  BY ${orderBy}
          LIMIT  ${limit}
        OFFSET ${offset}
      `,
      this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) AS count
        FROM   "Document" d
        WHERE  ${where}
      `,
    ]);

    return {
      items: rows.map(this.toDomain.bind(this)),
      total: Number(countRows[0]?.count ?? 0),
    };
  }

  // ── Mise à jour ────────────────────────────────────────────────────────────

  async update(id: string, data: UpdateDocumentData): Promise<Document> {
    const row = await this.prisma.document.update({
      where: { id },
      data: {
      ...(data.metadata && {
        title:    data.metadata.title,
        metadata: data.metadata.toJSON() as Prisma.InputJsonValue,
      }),
      ...(data.intelligence !== undefined && {
        detectedType: (data.intelligence?.detectedType ?? null) as PrismaDetectedType | null,
        intelligence: (data.intelligence?.toJSON() as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
      }),
      ...(data.s3Key                !== undefined && { s3Key:                data.s3Key }),
      ...(data.thumbnailRef         !== undefined && { thumbnailRef:         data.thumbnailRef }),
      ...(data.extractedText        !== undefined && { extractedText:        data.extractedText }),
      ...(data.textExtractionMethod !== undefined && {
        textExtractionMethod: data.textExtractionMethod as PrismaTextExtractionMethod | null,
      }),
      ...(data.pageCount !== undefined && { pageCount: data.pageCount }),
        updatedAt: data.updatedAt ?? new Date(),
      },
    });

    return this.toDomain(row);
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.document.update({
      where: { id },
      data: { isDeleted: true, updatedAt: new Date() },
    });
  }

  async updateStatus(
    id: string,
    status: ProcessingStatus,
    textExtractionMethod?: TextExtractionMethod | null,
  ): Promise<void> {
    await this.prisma.document.update({
      where: { id },
      data: {
        processingStatus: status as PrismaProcessingStatus,
      ...(textExtractionMethod !== undefined && {
        textExtractionMethod: textExtractionMethod as PrismaTextExtractionMethod | null,
      }),
        updatedAt: new Date(),
      },
    });
  }

  // ── Sync LWW ─────────────────────────────────────────────────

  /**
   * Upsert avec stratégie Last Write Wins.
   *
   * Règles :
   *   - Document inexistant          → CREATE  → 'created'
   *   - clientUpdatedAt ≤ updatedAt  → SKIP    → 'skipped'  (serveur gagne, égalité incluse)
   *   - clientUpdatedAt > updatedAt  → UPDATE  → 'updated'  (client plus récent)
   *
   * Seuls les champs éditables côté client sont LWW.
   * Les champs pipeline (intelligence, detectedType, extractedText,
   * processingStatus, textExtractionMethod) ne sont jamais écrasés par la sync.
   *
   * syncedAt = horloge serveur, mis à jour à chaque CREATE/UPDATE.
   * updatedAt = horloge cliente, source de vérité LWW.
   */
  async syncUpsert(payload: SyncUpsertPayload): Promise<SyncResult> {
    return this.prisma.$transaction(async (tx) => {

      // ── 1. Lire l'état actuel (lecture minimale — seul updatedAt nécessaire) ──

      const existing = await tx.document.findUnique({
        where:  { id: payload.id },
        select: { updatedAt: true },
      });

      // ── 2. CAS : document inexistant → CREATE ──────────────────────────────

      if (!existing) {
        const metadata = new DocumentMetadata(
          payload.title,
          payload.userTags,
          payload.notes,
          null, // lastEditedAt : inconnu côté serveur lors de la création via sync
        );

        await tx.document.create({
          data: {
            id:               payload.id,
              workspace:        { connect: { id: payload.workspaceId } },
            uploadedBy:       { connect: { id: payload.uploadedById } },
            originalFilename: payload.originalFilename,
              mimeType:         payload.mimeType,
            fileSizeBytes:    BigInt(payload.fileSizeBytes),
            processingStatus: PrismaProcessingStatus.PENDING_UPLOAD,
            isDeleted:        payload.isDeleted,
            s3Key:            payload.s3Key,
            title:            metadata.title,
            metadata:         metadata.toJSON() as Prisma.InputJsonValue,
            intelligence:     Prisma.JsonNull,
            uploadedAt:       payload.clientCreatedAt,
            updatedAt:        payload.clientUpdatedAt, // horloge cliente
            syncedAt:         new Date(),              // horloge serveur
          },
        });

        return 'created';
      }

      // ── 3. CAS : LWW — le serveur gagne en cas d'égalité exacte ────────────

      if (payload.clientUpdatedAt <= existing.updatedAt) {
        return 'skipped';
      }

      // ── 4. CAS : client plus récent → UPDATE des champs éditables client ───

      const metadata = new DocumentMetadata(
        payload.title,
        payload.userTags,
        payload.notes,
        payload.clientUpdatedAt, // lastEditedAt = timestamp de la dernière édition cliente
      );

      await tx.document.update({
        where: { id: payload.id },
        data: {
          originalFilename: payload.originalFilename,
            isDeleted:        payload.isDeleted,
          s3Key:            payload.s3Key,
          title:            metadata.title,
          metadata:         metadata.toJSON() as Prisma.InputJsonValue,
          updatedAt:        payload.clientUpdatedAt, // horloge cliente
          syncedAt:         new Date(),              // horloge serveur
          //   PAS de mise à jour de : processingStatus, textExtractionMethod,
          //   extractedText, intelligence, detectedType, thumbnailRef
          //   → champs pipeline, source de vérité = serveur uniquement
        },
      });

      return 'updated';
    });
  }

  // ── Sync — pull since ────────────────────────────────────────

  /**
   * Retourne tous les documents dont syncedAt > since, triés par syncedAt ASC.
   * Inclut les soft-deleted pour que le client puisse les tombstoner localement.
   * since = epoch → premier pull complet du workspace.
   */
  async findSince(workspaceId: string, since: Date): Promise<Document[]> {
    const rows = await this.prisma.document.findMany({
      where: {
        workspaceId,
        syncedAt: { gt: since },
        // ⚠ PAS de filtre isDeleted — le client doit recevoir les tombstones
      },
      orderBy: { syncedAt: 'asc' },
    });

    return rows.map(this.toDomain.bind(this));
  }
}
