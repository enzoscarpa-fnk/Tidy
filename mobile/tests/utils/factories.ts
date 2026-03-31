import type {
  DocumentDetail,
  DocumentIntelligence,
  DocumentListItem,
  DocumentMetadata,
  ProcessingStatus,
} from '~/types/api'

// ── Factories ───────────────────────────────────────────────────

export function makeDocument(
  overrides: Partial<DocumentListItem> = {}
): DocumentListItem {
  return {
    id: 'doc-123',
    workspaceId: 'ws-456',
    title: 'Facture Adobe Janvier 2025',
    originalFilename: 'facture_adobe_2025-01.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: 245_760,
    processingStatus: 'ENRICHED',
    thumbnailUrl: null,
    intelligence: null,
    metadata: null,
    uploadedAt: '2026-01-12T10:00:00.000Z',
    updatedAt: '2026-01-12T10:00:00.000Z',
    ...overrides,
  }
}

export function makeDocumentWithStatus(status: ProcessingStatus): DocumentListItem {
  return makeDocument({ processingStatus: status })
}

export function makeDocumentIntelligence(
  overrides: Partial<DocumentIntelligence> = {}
): DocumentIntelligence {
  return {
    detectedType: 'INVOICE',
    suggestedTags: ['Adobe', 'Logiciel'],
    globalConfidenceScore: 0.92,
    extractedEntities: [
      { entityType: 'AMOUNT', value: '59,99 €', confidence: 0.95 },
      { entityType: 'DATE',   value: '12/01/2026', confidence: 0.98 },
    ],
    ...overrides,
  }
}

export function makeDocumentMetadata(
  overrides: Partial<DocumentMetadata> = {}
): DocumentMetadata {
  return {
    userTags: [],
    notes: null,
    userOverrideType: null,
    lastEditedAt: null,
    ...overrides,
  }
}

export function makeDocumentDetail(
  overrides: Partial<DocumentDetail> = {}
): DocumentDetail {
  return {
    ...makeDocument(),
    uploadedBy: 'user-123',
    pageCount: 2,
    textExtractionMethod: 'NATIVE_PDF',
    extractedText: 'Contenu extrait du document PDF.',
    downloadUrl: 'https://s3.example.com/presigned-url',
    processingEvents: [],
    ...overrides,
  }
}

/**
 * Crée un File avec une taille simulée (sans allouer réellement N Mo en mémoire).
 */
export function makeFile(
  name: string,
  mimeType: string,
  sizeBytes: number
): File {
  const file = new File(['x'], name, { type: mimeType })
  Object.defineProperty(file, 'size', { value: sizeBytes, configurable: true })
  return file
}
