import type { Document, ProcessingStatus, TextExtractionMethod } from '../document.aggregate';
import type { DocumentMetadata } from '../document-metadata.value-object';
import type { DocumentIntelligence, DetectedType } from '../document-intelligence.value-object';

export interface CreateDocumentData {
  id:               string;   // UUID généré côté client
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
}
