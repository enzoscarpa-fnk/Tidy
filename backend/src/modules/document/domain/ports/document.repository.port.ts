import type { Document, ProcessingStatus, TextExtractionMethod } from '../document.aggregate';
import type { DocumentMetadata } from '../document-metadata.value-object';
import type { DocumentIntelligence, DetectedType } from '../document-intelligence.value-object';

// ── Types existants ───────────────────────────────────────────────────────────

export interface CreateDocumentData {
  id:               string;
  workspaceId:      string;
  uploadedById:     string;
  originalFilename: string;
  mimeType:         string;
  fileSizeBytes:    number;
  title?:           string | null;
  uploadedAt:       Date;
}

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

export interface DocumentFilters {
  processingStatus?: ProcessingStatus[];
  detectedType?:     DetectedType[];
  userTags?:         string[];
  query?:            string;
  dateFrom?:         Date;
  dateTo?:           Date;
  sortBy?:           'uploadedAt' | 'title' | 'updatedAt';
  sortOrder?:        'asc' | 'desc';
  page?:             number;
  limit?:            number;
}

// ── Types Sync LWW ────────────────────────────────────────────────────────────

export type SyncResult = 'created' | 'updated' | 'skipped';

export interface SyncUpsertPayload {
  id:               string;
  workspaceId:      string;
  uploadedById:     string;
  originalFilename: string;
  mimeType:         string;
  fileSizeBytes:    number;
  s3Key:            string | null;
  title:            string;
  userTags:         string[];
  notes:            string | null;
  isDeleted:        boolean;
  clientCreatedAt:  Date;
  clientUpdatedAt:  Date;
}

// ── Types Search FTS ──────────────────────────────────────────────────────────

/**
 * Filtres pour la recherche full-text PostgreSQL.
 * `query` est obligatoire — la route `GET /documents/search` l'exige.
 */
export interface SearchFilters {
  workspaceId:   string;
  query:         string;
  detectedType?: DetectedType[];
  userTags?:     string[];
  page?:         number;
  limit?:        number;
}

/**
 * Un résultat de recherche FTS enrichi d'un extrait `ts_headline`
 * (termes surlignés via balises <mark>) et du score `ts_rank`.
 */
export interface SearchDocumentResult {
  document: Document;
  headline: string;
  rank:     number;
}

// ── Interface du port ─────────────────────────────────────────────────────────

export interface IDocumentRepository {
  create(data: CreateDocumentData): Promise<Document>;
  findById(id: string): Promise<Document | null>;
  findAllByWorkspace(
    workspaceId: string,
    filters: DocumentFilters,
  ): Promise<{ items: Document[]; total: number }>;
  update(id: string, data: UpdateDocumentData): Promise<Document>;
  softDelete(id: string): Promise<void>;
  updateStatus(
    id: string,
    status: ProcessingStatus,
    textExtractionMethod?: TextExtractionMethod | null,
  ): Promise<void>;
  syncUpsert(payload: SyncUpsertPayload): Promise<SyncResult>;
  findSince(workspaceId: string, since: Date): Promise<Document[]>;
  search(filters: SearchFilters): Promise<{ items: SearchDocumentResult[]; total: number }>;
}
