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

// ── Types Sync LWW ───────────────────────────────────────────────

/**
 * Résultat de syncUpsert :
 * - 'created'  → document inexistant, créé en base
 * - 'updated'  → clientUpdatedAt > serverUpdatedAt, mise à jour effectuée
 * - 'skipped'  → clientUpdatedAt ≤ serverUpdatedAt, serveur plus récent, ignoré
 */
export type SyncResult = 'created' | 'updated' | 'skipped';

/**
 * Payload envoyé par le client mobile pour synchroniser un document.
 * Seuls les champs éditables côté client participent au LWW.
 * Les champs gérés par le pipeline serveur (intelligence, extractedText,
 * processingStatus, detectedType) ne sont jamais écrasés par la sync.
 */
export interface SyncUpsertPayload {
  // Identité
  id:               string;
  workspaceId:      string;
  uploadedById:     string;

  // Métadonnées techniques (éditables client au sens upload)
  originalFilename: string;
  mimeType:         string;
  fileSizeBytes:    number;
  s3Key:            string | null;

  // Métadonnées utilisateur (éditables client)
  title:            string;
  userTags:         string[];
  notes:            string | null;

  // Cycle de vie
  isDeleted:        boolean;

  // Horloges clientes (source LWW)
  clientCreatedAt:  Date;
  clientUpdatedAt:  Date;
}

// ── Interface du port ────────────────────────────────────────────────────────

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
}
