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
  DocumentWithEvents,
  ProcessingEventData,
} from '../../../modules/document/domain/ports/document.repository.port';
import { Document }            from '../../../modules/document/domain/document.aggregate';
import type { ProcessingStatus, TextExtractionMethod } from '../../../modules/document/domain/document.aggregate';
import { DocumentMetadata }    from '../../../modules/document/domain/document-metadata.value-object';
import type { MetadataJson }   from '../../../modules/document/domain/document-metadata.value-object';
import { DocumentIntelligence } from '../../../modules/document/domain/document-intelligence.value-object';
import type { IntelligenceJson, DetectedType } from '../../../modules/document/domain/document-intelligence.value-object';

export class DocumentRepositoryAdapter implements IDocumentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Pivot Prisma → Domain ──────────────────────────────────────────────────

  private toDomain(row: PrismaDocument): Document {
    const metaJson = row.metadata as unknown as MetadataJson;
    const metadata = new DocumentMetadata(
      metaJson.title,
      metaJson.userTags         ?? [],
      metaJson.notes            ?? null,
      metaJson.userOverrideType ?? null,
      metaJson.lastEditedAt ? new Date(metaJson.lastEditedAt) : null,
    );

    let intelligence: DocumentIntelligence | null = null;
    if (row.intelligence && row.detectedType) {
      const intelJson = row.intelligence as unknown as IntelligenceJson;
      intelligence = new DocumentIntelligence(
        row.detectedType as DetectedType,
        intelJson.extractedEntities     ?? [],
        intelJson.globalConfidenceScore ?? 0,
        intelJson.suggestedTags         ?? [],
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
    const now   = data.uploadedAt ?? new Date();
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
        s3Key:            data.s3Key,
        metadata:         DocumentMetadata.default(title).toJSON() as Prisma.InputJsonValue,
        intelligence:     Prisma.JsonNull,
        uploadedAt:       now,
        updatedAt:        now,
      },
    });

    return this.toDomain(row);
  }

  // ── Lecture simple ─────────────────────────────────────────────────────────

  async findById(id: string): Promise<Document | null> {
    const row = await this.prisma.document.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  // ── Lecture avec ProcessingEvents ─────────────────────────────────────────

  async findByIdWithEvents(id: string): Promise<DocumentWithEvents | null> {
    const row = await this.prisma.document.findUnique({
      where:   { id, isDeleted: false },
      include: {
        processingEvents: {
          orderBy: { occurredAt: 'asc' },
        },
      },
    });

    if (!row) return null;

    const processingEvents: ProcessingEventData[] = row.processingEvents.map((e) => ({
      id:           e.id,
      eventType:    e.eventType,
      occurredAt:   e.occurredAt,
      isSuccess:    e.isSuccess,
      errorMessage: e.errorMessage ?? null,
    }));

    return { document: this.toDomain(row), processingEvents };
  }

  // ── Liste paginée avec filtres ─────────────────────────────────────────────

  async findAllByWorkspace(
    workspaceId: string,
    filters: DocumentFilters,
  ): Promise<{ items: Document[]; total: number; page: number; limit: number }> {
    const page  = Math.max(1, filters.page  ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 30));

    const where: Prisma.DocumentWhereInput = {
      workspaceId,
      isDeleted: false,
      // Par défaut, les documents ARCHIVED sont exclus (sauf si status est explicitement spécifié)
      ...(!filters.processingStatus?.length && {
        processingStatus: { not: PrismaProcessingStatus.ARCHIVED },
      }),
      ...(filters.processingStatus?.length && {
        processingStatus: { in: filters.processingStatus as PrismaProcessingStatus[] },
      }),
      ...(filters.detectedType?.length && {
        detectedType: { in: filters.detectedType as PrismaDetectedType[] },
      }),
      ...(filters.dateFrom && { uploadedAt: { gte: filters.dateFrom } }),
      ...(filters.dateTo   && { uploadedAt: { lte: filters.dateTo   } }),
      // ── Recherche plein-texte basique (FTS tsvector en ticket 5.5) ─────────
      ...(filters.query && filters.query.length >= 2 && {
        OR: [
          { title:         { contains: filters.query, mode: 'insensitive' } },
          { extractedText: { contains: filters.query, mode: 'insensitive' } },
        ],
      }),
      // ── Filtre userTags (OR : contient au moins un des tags) ──────────────
      // TODO ticket 5.5 : remplacer par index GIN jsonb_path_ops pour performances
      ...(filters.userTags?.length && {
        OR: filters.userTags.map((tag) => ({
          metadata: {
            path:            ['userTags'],
            array_contains:  tag,
          },
        })),
      }),
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

    return { items: rows.map(this.toDomain.bind(this)), total, page, limit };
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

  // ── Suppression logique ────────────────────────────────────────────────────

  async softDelete(id: string): Promise<void> {
    await this.prisma.document.update({
      where: { id },
      data: { isDeleted: true, updatedAt: new Date() },
    });
  }

  // ── Mise à jour de statut ──────────────────────────────────────────────────

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

  // ── Quota Free tier ───────────────────────────────────────────────────────

  async countActiveByUploadedById(userId: string): Promise<number> {
    return this.prisma.document.count({
      where: { uploadedById: userId, isDeleted: false },
    });
  }
}
