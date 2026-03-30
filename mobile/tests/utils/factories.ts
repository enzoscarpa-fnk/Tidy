import type { DocumentListItem, ProcessingStatus } from '~/types/api'

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
