import type { DocumentMetadata } from './document-metadata.value-object';
import type { DocumentIntelligence } from './document-intelligence.value-object';

export type ProcessingStatus =
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

export type TextExtractionMethod = 'NATIVE_PDF' | 'OCR' | 'NONE';

export interface DocumentProps {
  id:                   string;
  workspaceId:          string;
  uploadedById:         string;
  originalFilename:     string;
  mimeType:             string;
  fileSizeBytes:        number;
  pageCount:            number | null;
  s3Key:                string | null;
  thumbnailRef:         string | null;
  processingStatus:     ProcessingStatus;
  textExtractionMethod: TextExtractionMethod | null;
  isDeleted:            boolean;
  extractedText:        string | null;
  metadata:             DocumentMetadata;
  intelligence:         DocumentIntelligence | null;
  uploadedAt:           Date;
  updatedAt:            Date;
}

export class Document {
  readonly id:                   string;
  readonly workspaceId:          string;
  readonly uploadedById:         string;
  readonly originalFilename:     string;
  readonly mimeType:             string;
  readonly fileSizeBytes:        number;
  readonly pageCount:            number | null;
  readonly s3Key:                string | null;
  readonly thumbnailRef:         string | null;
  readonly processingStatus:     ProcessingStatus;
  readonly textExtractionMethod: TextExtractionMethod | null;
  readonly isDeleted:            boolean;
  readonly extractedText:        string | null;
  readonly metadata:             DocumentMetadata;
  readonly intelligence:         DocumentIntelligence | null;
  readonly uploadedAt:           Date;
  readonly updatedAt:            Date;

  constructor(props: DocumentProps) {
    this.id                   = props.id;
    this.workspaceId          = props.workspaceId;
    this.uploadedById         = props.uploadedById;
    this.originalFilename     = props.originalFilename;
    this.mimeType             = props.mimeType;
    this.fileSizeBytes        = props.fileSizeBytes;
    this.pageCount            = props.pageCount;
    this.s3Key                = props.s3Key;
    this.thumbnailRef         = props.thumbnailRef;
    this.processingStatus     = props.processingStatus;
    this.textExtractionMethod = props.textExtractionMethod;
    this.isDeleted            = props.isDeleted;
    this.extractedText        = props.extractedText;
    this.metadata             = props.metadata;
    this.intelligence         = props.intelligence;
    this.uploadedAt           = props.uploadedAt;
    this.updatedAt            = props.updatedAt;
  }
}
