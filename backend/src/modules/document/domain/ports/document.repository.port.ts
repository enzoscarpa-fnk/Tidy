import type { Document, ProcessingStatus, TextExtractionMethod } from '../document.aggregate';
import type { DocumentMetadata } from '../document-metadata.value-object';
import type { DocumentIntelligence, DetectedType } from '../document-intelligence.value-object';

// ── Create ────────────────────────────────────────────────────────────────────

export interface CreateDocumentData {
  id:               string;
  workspaceId:      string;
  uploadedById:     string;
  originalFilename: string;
  mimeType:         string;
  fileSizeBytes:    number;
  title?:           string | null;
  s3Key:            string;
  uploadedAt?:      Date;
}

// ── Update ────────────────────────────────────────────────────────────────────

export interface UpdateDocumentData {
  metadata?:             DocumentMetadata;
  intelligence?:         DocumentIntelligence | null;
  s3Key?:                string | null;
  thumbnailRef?:         string | null;
  extractedText?:        string | null;
  textExtractionMethod?: TextExtractionMethod | null;
  pageCount?:            number | null;
  updatedAt?:            Date;
}

// ── Filters & Pagination ──────────────────────────────────────────────────────

export interface DocumentFilters {
  query?:            string;
  processingStatus?: ProcessingStatus[];
  detectedType?:     DetectedType[];
  userTags?:         string[];
  dateFrom?:         Date;
  dateTo?:           Date;
  sortBy?:           'uploadedAt' | 'title' | 'updatedAt';
  sortOrder?:        'asc' | 'desc';
  page?:             number;
  limit?:            number;
}

// ── ProcessingEvent ───────────────────────────────────────────────────────────

export interface ProcessingEventData {
  id:           string;
  eventType:    string;
  occurredAt:   Date;
  isSuccess:    boolean;
  errorMessage: string | null;
}

export interface DocumentWithEvents {
  document:         Document;
  processingEvents: ProcessingEventData[];
}

// ── Port ──────────────────────────────────────────────────────────────────────

export interface IDocumentRepository {
  create(data: CreateDocumentData): Promise<Document>;
  findById(id: string): Promise<Document | null>;
  findByIdWithEvents(id: string): Promise<DocumentWithEvents | null>;
  findAllByWorkspace(
    workspaceId: string,
    filters: DocumentFilters,
  ): Promise<{ items: Document[]; total: number; page: number; limit: number }>;
  update(id: string, data: UpdateDocumentData): Promise<Document>;
  softDelete(id: string): Promise<void>;
  updateStatus(
    id: string,
    status: ProcessingStatus,
    textExtractionMethod?: TextExtractionMethod | null,
  ): Promise<void>;
  countActiveByUploadedById(userId: string): Promise<number>;
}
