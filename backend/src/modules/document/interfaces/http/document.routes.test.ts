import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

type ProcessingStatus =
  | 'PENDING_UPLOAD'
  | 'UPLOADED'
  | 'PROCESSING'
  | 'PARTIALLY_ENRICHED'
  | 'ENRICHED'
  | 'CLASSIFIED_ONLY'
  | 'READY'
  | 'FAILED'
  | 'PENDING_RETRY'
  | 'ARCHIVED';

type TextExtractionMethod = 'NATIVE_PDF' | 'OCR' | 'NONE';
type DetectedType = 'INVOICE' | 'CONTRACT' | 'RECEIPT' | 'ID_DOCUMENT' | 'BANK_STATEMENT' | 'OTHER';

interface MetadataJson {
  title: string;
  userTags: string[];
  notes: string | null;
  lastEditedAt: string | null;
}

interface IntelligenceJson {
  extractedEntities: Array<{
    entityType: string;
    value: string;
    confidence: number;
  }>;
  globalConfidenceScore: number;
  suggestedTags: string[];
}

interface DocumentRow {
  id: string;
  workspaceId: string;
  uploadedById: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: bigint;
  pageCount: number | null;
  s3Key: string | null;
  thumbnailRef: string | null;
  processingStatus: ProcessingStatus;
  textExtractionMethod: TextExtractionMethod | null;
  isDeleted: boolean;
  extractedText: string | null;
  title: string;
  metadata: MetadataJson;
  intelligence: IntelligenceJson | null;
  detectedType: DetectedType | null;
  uploadedAt: Date;
  updatedAt: Date;
}

interface WorkspaceRow {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ProcessingEventRow {
  id: string;
  documentId: string;
  eventType: string;
  occurredAt: Date;
  payload: Record<string, unknown> | null;
  isSuccess: boolean;
  errorMessage: string | null;
}

interface AuthenticatedUser {
  sub: string;
  tier: 'FREE' | 'PRO';
}

interface RequestWithUser extends FastifyRequest {
  user?: AuthenticatedUser;
}

const testState = vi.hoisted(() => {
  const USER_ID = '11111111-1111-4111-8111-111111111111';
  const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
  const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

  let sequence = 1;

  const nextUuid = (): string => {
    const suffix = String(sequence++).padStart(12, '0');
    return `00000000-0000-4000-8000-${suffix}`;
  };

  const documents = new Map<string, DocumentRow>();
  const workspaces = new Map<string, WorkspaceRow>();
  const processingEvents = new Map<string, ProcessingEventRow[]>();
  const s3Objects = new Map<string, Buffer>();

  const reset = (): void => {
    sequence = 1;
    documents.clear();
    workspaces.clear();
    processingEvents.clear();
    s3Objects.clear();

    const now = new Date();
    workspaces.set(WORKSPACE_ID, {
      id: WORKSPACE_ID,
      ownerId: USER_ID,
      name: 'Mon espace',
      description: null,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    });
  };

  const clone = <T>(value: T): T => structuredClone(value);

  const pushProcessingEvent = (documentId: string, event: Omit<ProcessingEventRow, 'id' | 'documentId'>): void => {
    const current = processingEvents.get(documentId) ?? [];
    current.push({
      id: nextUuid(),
      documentId,
      ...event,
    });
    processingEvents.set(documentId, current);
  };

  const seedDocument = (partial?: Partial<DocumentRow>): DocumentRow => {
    const now = new Date();
    const id = partial?.id ?? nextUuid();

    const row: DocumentRow = {
      id,
      workspaceId: partial?.workspaceId ?? WORKSPACE_ID,
      uploadedById: partial?.uploadedById ?? USER_ID,
      originalFilename: partial?.originalFilename ?? 'seed.pdf',
      mimeType: partial?.mimeType ?? 'application/pdf',
      fileSizeBytes: partial?.fileSizeBytes ?? BigInt(1024),
      pageCount: partial?.pageCount ?? 1,
      s3Key: partial?.s3Key ?? `documents/${id}`,
      thumbnailRef: partial?.thumbnailRef ?? null,
      processingStatus: partial?.processingStatus ?? 'ENRICHED',
      textExtractionMethod: partial?.textExtractionMethod ?? 'NATIVE_PDF',
      isDeleted: partial?.isDeleted ?? false,
      extractedText: partial?.extractedText ?? 'FACTURE test seed',
      title: partial?.title ?? 'seed',
      metadata: partial?.metadata ?? {
        title: partial?.title ?? 'seed',
        userTags: [],
        notes: null,
        lastEditedAt: null,
      },
      intelligence: partial?.intelligence ?? {
        extractedEntities: [],
        globalConfidenceScore: 0.91,
        suggestedTags: ['facture'],
      },
      detectedType: partial?.detectedType ?? 'INVOICE',
      uploadedAt: partial?.uploadedAt ?? now,
      updatedAt: partial?.updatedAt ?? now,
    };

    documents.set(id, clone(row));
    return clone(row);
  };

  const scheduleProcessing = (documentId: string): void => {
    const existing = documents.get(documentId);
    if (!existing) return;

    setTimeout(() => {
      const current = documents.get(documentId);
      if (!current || current.isDeleted) return;

      current.processingStatus = 'PROCESSING';
      current.updatedAt = new Date();

      pushProcessingEvent(documentId, {
        eventType: 'PROCESSING_STARTED',
        occurredAt: new Date(),
        payload: null,
        isSuccess: true,
        errorMessage: null,
      });

      setTimeout(() => {
        const row = documents.get(documentId);
        if (!row || row.isDeleted) return;

        const isImage = row.mimeType === 'image/jpeg' || row.mimeType === 'image/png';

        row.processingStatus = 'ENRICHED';
        row.textExtractionMethod = isImage ? 'OCR' : 'NATIVE_PDF';
        row.extractedText = isImage
          ? 'FACTURE OCR image 2026'
          : 'FACTURE PDF native 2026';
        row.pageCount = 1;
        row.thumbnailRef = `thumbnails/${row.id}.jpg`;
        row.detectedType = 'INVOICE';
        row.intelligence = {
          extractedEntities: [
            { entityType: 'DATE', value: '2026-03-10', confidence: 0.99 },
            { entityType: 'AMOUNT', value: '125.00', confidence: 0.97 },
          ],
          globalConfidenceScore: 0.94,
          suggestedTags: ['facture', isImage ? 'ocr' : 'pdf'],
        };
        row.updatedAt = new Date();

        pushProcessingEvent(documentId, {
          eventType: isImage ? 'OCR_DONE' : 'TEXT_EXTRACTION_DONE',
          occurredAt: new Date(),
          payload: {
            method: row.textExtractionMethod,
          },
          isSuccess: true,
          errorMessage: null,
        });

        pushProcessingEvent(documentId, {
          eventType: 'PIPELINE_COMPLETED',
          occurredAt: new Date(),
          payload: null,
          isSuccess: true,
          errorMessage: null,
        });
      }, 10);
    }, 0);
  };

  return {
    USER_ID,
    WORKSPACE_ID,
    MAX_FILE_SIZE_BYTES,
    documents,
    workspaces,
    processingEvents,
    s3Objects,
    reset,
    seedDocument,
    scheduleProcessing,
    clone,
    nextUuid,
  };
});

vi.mock('@prisma/client', () => {
  const ProcessingStatusEnum: Record<ProcessingStatus, ProcessingStatus> = {
    PENDING_UPLOAD: 'PENDING_UPLOAD',
    UPLOADED: 'UPLOADED',
    PROCESSING: 'PROCESSING',
    PARTIALLY_ENRICHED: 'PARTIALLY_ENRICHED',
    ENRICHED: 'ENRICHED',
    CLASSIFIED_ONLY: 'CLASSIFIED_ONLY',
    READY: 'READY',
    FAILED: 'FAILED',
    PENDING_RETRY: 'PENDING_RETRY',
    ARCHIVED: 'ARCHIVED',
  };

  const TextExtractionMethodEnum: Record<TextExtractionMethod, TextExtractionMethod> = {
    NATIVE_PDF: 'NATIVE_PDF',
    OCR: 'OCR',
    NONE: 'NONE',
  };

  const DetectedTypeEnum: Record<DetectedType, DetectedType> = {
    INVOICE: 'INVOICE',
    CONTRACT: 'CONTRACT',
    RECEIPT: 'RECEIPT',
    ID_DOCUMENT: 'ID_DOCUMENT',
    BANK_STATEMENT: 'BANK_STATEMENT',
    OTHER: 'OTHER',
  };

  const JsonNull = Symbol('JsonNull');

  class PrismaClient {}

  return {
    PrismaClient,
    ProcessingStatus: ProcessingStatusEnum,
    TextExtractionMethod: TextExtractionMethodEnum,
    DetectedType: DetectedTypeEnum,
    Prisma: {
      JsonNull,
      raw: (value: string) => value,
      sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
      join: (parts: unknown[], separator: string) => ({ parts, separator }),
    },
  };
});

vi.mock('../../../../shared/plugins/authenticate.hook', () => {
  const authenticate = async (request: RequestWithUser): Promise<void> => {
    request.user = {
      sub: testState.USER_ID,
      tier: 'FREE',
    };
  };

  return {
    default: authenticate,
    authenticate,
    authenticateHook: authenticate,
  };
});

vi.mock('../../../../modules/auth/interfaces/http/auth.routes', async () => {
  const fp = (await import('fastify-plugin')).default;
  const plugin = fp(async () => {});
  return { default: plugin };
});

vi.mock('../../../../modules/user/interfaces/http/me.routes', async () => {
  const fp = (await import('fastify-plugin')).default;
  const plugin = fp(async () => {});
  return { default: plugin };
});

vi.mock('../../../../modules/workspace/interfaces/http/workspace.routes', async () => {
  const fp = (await import('fastify-plugin')).default;
  const plugin = fp(async () => {});
  return { default: plugin };
});

vi.mock('../../../../infra/storage/s3.service.adapter', () => {
  class MockS3ServiceAdapter {
    static fromEnv(): MockS3ServiceAdapter {
      return new MockS3ServiceAdapter();
    }

    async putObject(key: string, buffer: Buffer, _mimeType: string): Promise<void> {
      testState.s3Objects.set(key, Buffer.from(buffer));
    }

    async deleteObject(key: string): Promise<void> {
      testState.s3Objects.delete(key);
    }

    async generatePresignedGetUrl(key: string, _expiresIn: number): Promise<string> {
      return `https://example.test/presigned/${encodeURIComponent(key)}`;
    }

    async generatePresignedPutUrl(key: string, _mimeType: string, _expiresIn: number): Promise<string> {
      return `https://example.test/upload/${encodeURIComponent(key)}`;
    }
  }

  return {
    S3ServiceAdapter: MockS3ServiceAdapter,
  };
});

vi.mock('../../../../infra/database/prisma.plugin', async () => {
  const fp = (await import('fastify-plugin')).default;

  const matchesWorkspace = (
    row: WorkspaceRow,
    where: Record<string, unknown> | undefined,
  ): boolean => {
    if (!where) return true;
    return Object.entries(where).every(([key, value]) => row[key as keyof WorkspaceRow] === value);
  };

  const matchesDocument = (
    row: DocumentRow,
    where: Record<string, unknown> | undefined,
  ): boolean => {
    if (!where) return true;

    return Object.entries(where).every(([key, value]) => {
      if (key === 'processingStatus' && typeof value === 'object' && value !== null && 'in' in value) {
        const values = value as { in: ProcessingStatus[] };
        return values.in.includes(row.processingStatus);
      }

      if (key === 'detectedType' && typeof value === 'object' && value !== null && 'in' in value) {
        const values = value as { in: DetectedType[] };
        return row.detectedType !== null && values.in.includes(row.detectedType);
      }

      if (key === 'uploadedAt' && typeof value === 'object' && value !== null) {
        const range = value as { gte?: Date; lte?: Date };
        if (range.gte && row.uploadedAt < range.gte) return false;
        if (range.lte && row.uploadedAt > range.lte) return false;
        return true;
      }

      return row[key as keyof DocumentRow] === value;
    });
  };

  const sortDocuments = (
    rows: DocumentRow[],
    orderBy: Record<string, 'asc' | 'desc'> | undefined,
  ): DocumentRow[] => {
    if (!orderBy) return rows;

    const [sortKey, sortDirection] = Object.entries(orderBy)[0] ?? [];
    if (!sortKey || !sortDirection) return rows;

    return [...rows].sort((left, right) => {
      const a = left[sortKey as keyof DocumentRow];
      const b = right[sortKey as keyof DocumentRow];

      if (a instanceof Date && b instanceof Date) {
        return sortDirection === 'asc'
          ? a.getTime() - b.getTime()
          : b.getTime() - a.getTime();
      }

      if (typeof a === 'string' && typeof b === 'string') {
        return sortDirection === 'asc'
          ? a.localeCompare(b)
          : b.localeCompare(a);
      }

      if (typeof a === 'bigint' && typeof b === 'bigint') {
        return sortDirection === 'asc'
          ? Number(a - b)
          : Number(b - a);
      }

      return 0;
    });
  };

  const prisma = {
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    document: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = String(data.id);
        const now = new Date();

        const row: DocumentRow = {
          id,
          workspaceId: String((data.workspace as { connect: { id: string } }).connect.id),
          uploadedById: String((data.uploadedBy as { connect: { id: string } }).connect.id),
          originalFilename: String(data.originalFilename),
          mimeType: String(data.mimeType),
          fileSizeBytes: BigInt(data.fileSizeBytes as bigint | number | string),
          pageCount: (data.pageCount as number | null | undefined) ?? null,
          s3Key: (data.s3Key as string | null | undefined) ?? null,
          thumbnailRef: (data.thumbnailRef as string | null | undefined) ?? null,
          processingStatus: data.processingStatus as ProcessingStatus,
          textExtractionMethod: (data.textExtractionMethod as TextExtractionMethod | null | undefined) ?? null,
          isDeleted: Boolean(data.isDeleted),
          extractedText: (data.extractedText as string | null | undefined) ?? null,
          title: String(data.title),
          metadata: testState.clone(data.metadata as MetadataJson),
          intelligence:
            typeof data.intelligence === 'symbol' || data.intelligence == null
              ? null
              : testState.clone(data.intelligence as IntelligenceJson),
          detectedType: (data.detectedType as DetectedType | null | undefined) ?? null,
          uploadedAt: (data.uploadedAt as Date | undefined) ?? now,
          updatedAt: (data.updatedAt as Date | undefined) ?? now,
        };

        testState.documents.set(id, testState.clone(row));
        return testState.clone(row);
      }),

      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = testState.documents.get(where.id);
        return row ? testState.clone(row) : null;
      }),

      findFirst: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => {
        const row = [...testState.documents.values()].find((item) => matchesDocument(item, where));
        return row ? testState.clone(row) : null;
      }),

      findMany: vi.fn(
        async ({
                 where,
                 orderBy,
                 skip = 0,
                 take = 30,
               }: {
          where?: Record<string, unknown>;
          orderBy?: Record<string, 'asc' | 'desc'>;
          skip?: number;
          take?: number;
        }) => {
          const filtered = [...testState.documents.values()].filter((item) => matchesDocument(item, where));
          const sorted = sortDocuments(filtered, orderBy);
          return sorted.slice(skip, skip + take).map((row) => testState.clone(row));
        },
      ),

      count: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => {
        return [...testState.documents.values()].filter((item) => matchesDocument(item, where)).length;
      }),

      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = testState.documents.get(where.id);
        if (!row) {
          throw new Error(`Document ${where.id} not found`);
        }

        const next: DocumentRow = {
          ...row,
          ...(data.title !== undefined ? { title: String(data.title) } : {}),
          ...(data.metadata !== undefined ? { metadata: testState.clone(data.metadata as MetadataJson) } : {}),
          ...(data.detectedType !== undefined
            ? { detectedType: (data.detectedType as DetectedType | null) ?? null }
            : {}),
          ...(data.intelligence !== undefined
            ? {
              intelligence:
                typeof data.intelligence === 'symbol' || data.intelligence == null
                  ? null
                  : testState.clone(data.intelligence as IntelligenceJson),
            }
            : {}),
          ...(data.s3Key !== undefined ? { s3Key: (data.s3Key as string | null) ?? null } : {}),
          ...(data.thumbnailRef !== undefined ? { thumbnailRef: (data.thumbnailRef as string | null) ?? null } : {}),
          ...(data.extractedText !== undefined ? { extractedText: (data.extractedText as string | null) ?? null } : {}),
          ...(data.textExtractionMethod !== undefined
            ? { textExtractionMethod: (data.textExtractionMethod as TextExtractionMethod | null) ?? null }
            : {}),
          ...(data.pageCount !== undefined ? { pageCount: (data.pageCount as number | null) ?? null } : {}),
          ...(data.processingStatus !== undefined
            ? { processingStatus: data.processingStatus as ProcessingStatus }
            : {}),
          ...(data.isDeleted !== undefined ? { isDeleted: Boolean(data.isDeleted) } : {}),
          updatedAt: (data.updatedAt as Date | undefined) ?? new Date(),
        };

        testState.documents.set(where.id, testState.clone(next));
        return testState.clone(next);
      }),
    },

    workspace: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = testState.workspaces.get(where.id);
        return row ? testState.clone(row) : null;
      }),

      findFirst: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => {
        const row = [...testState.workspaces.values()].find((item) => matchesWorkspace(item, where));
        return row ? testState.clone(row) : null;
      }),
    },

    processingEvent: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: ProcessingEventRow = {
          id: testState.nextUuid(),
          documentId: String(data.documentId),
          eventType: String(data.eventType),
          occurredAt: (data.occurredAt as Date | undefined) ?? new Date(),
          payload: (data.payload as Record<string, unknown> | null | undefined) ?? null,
          isSuccess: Boolean(data.isSuccess),
          errorMessage: (data.errorMessage as string | null | undefined) ?? null,
        };

        const current = testState.processingEvents.get(row.documentId) ?? [];
        current.push(testState.clone(row));
        testState.processingEvents.set(row.documentId, current);

        return testState.clone(row);
      }),

      findMany: vi.fn(
        async ({
                 where,
                 orderBy,
               }: {
          where?: { documentId?: string };
          orderBy?: { occurredAt?: 'asc' | 'desc' };
        }) => {
          const documentId = where?.documentId;
          const rows = documentId ? (testState.processingEvents.get(documentId) ?? []) : [];
          const sorted = [...rows].sort((left, right) => {
            const direction = orderBy?.occurredAt ?? 'asc';
            return direction === 'asc'
              ? left.occurredAt.getTime() - right.occurredAt.getTime()
              : right.occurredAt.getTime() - left.occurredAt.getTime();
          });

          return sorted.map((row) => testState.clone(row));
        },
      ),
    },
  };

  const plugin = fp(async (app) => {
    app.decorate('prisma', prisma as unknown as typeof app.prisma);
  });

  return {
    default: plugin,
  };
});

vi.mock('../../../../modules/processing/processing.plugin', async () => {
  const fp = (await import('fastify-plugin')).default;

  const plugin = fp(async (app) => {
    const eventBus = {
      subscribe: vi.fn(),
      publish: vi.fn(async (event: Record<string, unknown>) => {
        const documentId =
          (event.documentId as string | undefined) ??
          (typeof event.payload === 'object' && event.payload !== null && 'documentId' in event.payload
            ? String((event.payload as Record<string, unknown>).documentId)
            : undefined);

        if (documentId) {
          testState.scheduleProcessing(documentId);
        }
      }),
    };

    app.decorate('eventBus', eventBus);
  });

  return {
    default: plugin,
  };
});

import { buildApp } from '../../../../app';

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const pdfBuffer = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF',
  'utf8',
);

const jpegBuffer = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
  0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xff, 0xd9,
]);

async function pollDocumentDetail(
  app: FastifyInstance,
  documentId: string,
  predicate: (body: Record<string, unknown>) => boolean,
  attempts = 25,
  delayMs = 20,
): Promise<Record<string, unknown>> {
  for (let index = 0; index < attempts; index += 1) {
    const response = await supertest(app.server)
      .get(`/api/v1/documents/${documentId}`)
      .expect(200);

    const data = response.body.data as Record<string, unknown>;
    if (predicate(data)) {
      return data;
    }

    await sleep(delayMs);
  }

  throw new Error(`Document ${documentId} did not reach expected state in time`);
}

describe('document.routes.ts - Phase 4 checkpoint', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(() => {
    testState.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/v1/documents upload un PDF puis le polling atteint ENRICHED', async () => {
    const uploadResponse = await supertest(app.server)
      .post('/api/v1/documents')
      .field('workspaceId', testState.WORKSPACE_ID)
      .attach('file', pdfBuffer, {
        filename: 'facture-adobe.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    expect(uploadResponse.body).toMatchObject({
      data: {
        workspaceId: testState.WORKSPACE_ID,
          originalFilename: 'facture-adobe.pdf',
        mimeType: 'application/pdf',
        processingStatus: 'UPLOADED',
      },
      meta: {},
      error: null,
    });

    const documentId = uploadResponse.body.data.id as string;

    const detail = await pollDocumentDetail(
      app,
      documentId,
      (data) => data.processingStatus === 'ENRICHED',
    );

    expect(detail.processingStatus).toBe('ENRICHED');
    expect(detail.textExtractionMethod).toBe('NATIVE_PDF');
    expect(detail.extractedText).toBeTruthy();
  });

  it('POST /api/v1/documents upload une image et le détail expose OCR', async () => {
    const uploadResponse = await supertest(app.server)
      .post('/api/v1/documents')
      .field('workspaceId', testState.WORKSPACE_ID)
      .attach('file', jpegBuffer, {
        filename: 'scan-facture.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);

    expect(uploadResponse.body.data.processingStatus).toBe('UPLOADED');

    const documentId = uploadResponse.body.data.id as string;

    const detail = await pollDocumentDetail(
      app,
      documentId,
      (data) =>
        data.processingStatus === 'ENRICHED' &&
        data.textExtractionMethod === 'OCR',
    );

    expect(detail.processingStatus).toBe('ENRICHED');
    expect(detail.textExtractionMethod).toBe('OCR');
    expect(detail.extractedText).toBeTruthy();
  });

  it('POST /api/v1/documents rejette un fichier > 50 Mo avec 413 FILE_TOO_LARGE', async () => {
    const oversizedBuffer = Buffer.alloc(testState.MAX_FILE_SIZE_BYTES + 1, 0);

    const response = await supertest(app.server)
      .post('/api/v1/documents')
      .field('workspaceId', testState.WORKSPACE_ID)
      .attach('file', oversizedBuffer, {
        filename: 'too-large.pdf',
        contentType: 'application/pdf',
      })
      .expect(413);

    expect(response.body).toMatchObject({
      data: null,
      meta: {},
      error: {
        code: 'FILE_TOO_LARGE',
      },
    });
  });

  it('POST /api/v1/documents/:id/reprocess retourne 422 si le document n’est pas FAILED', async () => {
    const seeded = testState.seedDocument({
      id: '33333333-3333-4333-8333-333333333333',
      workspaceId: testState.WORKSPACE_ID,
      uploadedById: testState.USER_ID,
      processingStatus: 'ENRICHED',
      textExtractionMethod: 'NATIVE_PDF',
      originalFilename: 'already-ready.pdf',
      mimeType: 'application/pdf',
      title: 'already-ready',
      metadata: {
        title: 'already-ready',
        userTags: [],
        notes: null,
        lastEditedAt: null,
      },
    });

    const response = await supertest(app.server)
      .post(`/api/v1/documents/${seeded.id}/reprocess`)
      .expect(422);

    expect(response.body).toMatchObject({
      data: null,
      meta: {},
      error: {
        code: 'INVALID_STATUS_TRANSITION',
      },
    });
  });
});
