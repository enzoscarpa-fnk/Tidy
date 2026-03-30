// ── Enveloppe standard API ─────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T | null
  meta: PaginationMeta | Record<string, never>
  error: ApiError | null
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

export interface ApiError {
  code: string
  message: string
  details?: Record<string, string>
}

// ── Utilisateur ────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  displayName: string
  tier: 'free' | 'pro'
  status: 'active' | 'suspended'
  createdAt: string
  updatedAt: string
}

// ── Auth ───────────────────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

/** Shape du backend : tokens imbriqués sous la clé `tokens` */
export interface AuthResponse {
  user: User
  tokens: AuthTokens
}

/** Shape du endpoint /auth/refresh */
export interface AuthRefreshResponse {
  tokens: AuthTokens
}

/** Shape du endpoint /auth/register (superset de AuthResponse) */
export interface AuthRegisterResponse extends AuthResponse {
  defaultWorkspace: {
    id: string
    name: string
  }
}

// ── Workspace ──────────────────────────────────────────────────────────────

export interface Workspace {
  id: string
  name: string
  description: string | null
  isArchived: boolean
  documentCount: number
  createdAt: string
  updatedAt: string
}

export interface WorkspaceListData {
  workspaces: Workspace[]
}

export interface CreateWorkspacePayload {
  name: string
  description?: string
}

export interface UpdateWorkspacePayload {
  name?: string
  description?: string | null
  isArchived?: boolean
}

// ── Document — Enums & types de base ──────────────────────────────────────

export type ProcessingStatus =
  | 'PENDING_UPLOAD'
  | 'UPLOADED'
  | 'PROCESSING'
  | 'PARTIALLY_ENRICHED'
  | 'CLASSIFIED_ONLY'
  | 'ENRICHED'
  | 'FAILED'
  | 'PENDING_RETRY'
  | 'ARCHIVED'

export type DetectedType =
  | 'INVOICE'
  | 'CONTRACT'
  | 'RECEIPT'
  | 'ID_DOCUMENT'
  | 'BANK_STATEMENT'
  | 'OTHER'

export type TextExtractionMethod = 'NATIVE_PDF' | 'OCR' | 'NONE'

export type EntityType = 'AMOUNT' | 'DATE' | 'VENDOR' | 'IBAN' | 'SIRET'

// ── Document — Value Objects ───────────────────────────────────────────────

export interface ExtractedEntity {
  entityType: EntityType
  value: string
  confidence: number
}

/**
 * Partie READ-ONLY — issue du pipeline automatique.
 * Jamais modifiable directement via PATCH /documents/:id.
 * Présent uniquement si processingStatus ∈ { ENRICHED, CLASSIFIED_ONLY, PARTIALLY_ENRICHED }.
 */
export interface DocumentIntelligence {
  detectedType: DetectedType
  suggestedTags: string[]
  globalConfidenceScore: number
  extractedEntities: ExtractedEntity[]
}

/**
 * Partie éditable par l'utilisateur.
 * Modifiable via PATCH /documents/:id.
 */
export interface DocumentMetadata {
  userTags: string[]
  notes: string | null
  /** Surcharge du detectedType — n'écrase PAS la valeur IA originale */
  userOverrideType: DetectedType | null
  lastEditedAt: string | null
}

// ── Document — Entités ─────────────────────────────────────────────────────

export interface ProcessingEvent {
  eventId: string
  eventType: string
  occurredAt: string
  isSuccess: boolean
  errorMessage: string | null
}

/**
 * Shape retournée par GET /documents (liste paginée).
 * intelligence et metadata sont null si le traitement n'est pas terminé.
 */
export interface DocumentListItem {
  id: string
  workspaceId: string
  title: string
  originalFilename: string
  mimeType: string
  fileSizeBytes: number
  processingStatus: ProcessingStatus
  thumbnailUrl: string | null
  intelligence: DocumentIntelligence | null
  metadata: DocumentMetadata | null
  uploadedAt: string
  updatedAt: string
}

/**
 * Shape retournée par GET /documents/:id (détail complet).
 * Étend DocumentListItem avec les champs lourds (texte extrait, events, downloadUrl).
 */
export interface DocumentDetail extends DocumentListItem {
  uploadedBy: string
  pageCount: number | null
  textExtractionMethod: TextExtractionMethod | null
  extractedText: string | null
  /** Presigned S3 GET URL — valide 15 minutes, régénérée à chaque appel */
  downloadUrl: string
  processingEvents: ProcessingEvent[]
}

// ── Document — Payloads de requête ─────────────────────────────────────────

export interface DocumentFilters {
  query?: string
  status?: ProcessingStatus | ProcessingStatus[]
  detectedType?: DetectedType | DetectedType[]
  userTags?: string[]
  dateFrom?: string
  dateTo?: string
  sortBy?: 'uploadedAt' | 'title' | 'updatedAt'
  sortOrder?: 'asc' | 'desc'
  page?: number
  limit?: number
}

export interface UpdateDocumentMetadataPayload {
  title?: string
  userTags?: string[]
  notes?: string | null
  userOverrideType?: DetectedType | null
}

// ── Document — Labels UX (table de mapping centrale, utilisée par les composants) ──

export const PROCESSING_STATUS_LABELS: Record<ProcessingStatus, string> = {
  PENDING_UPLOAD: 'En attente',
  UPLOADED: 'Document reçu',
  PROCESSING: 'Analyse en cours…',
  PARTIALLY_ENRICHED: 'Analyse en cours…',
  CLASSIFIED_ONLY: 'Prêt',
  ENRICHED: 'Prêt',
  FAILED: 'Analyse incomplète',
  PENDING_RETRY: 'Nouvelle analyse en cours…',
  ARCHIVED: 'Archivé',
} as const

export const DETECTED_TYPE_LABELS: Record<DetectedType, string> = {
  INVOICE: 'Facture',
  CONTRACT: 'Contrat',
  RECEIPT: 'Reçu',
  ID_DOCUMENT: "Pièce d'identité",
  BANK_STATEMENT: 'Relevé bancaire',
  OTHER: 'Autre',
} as const

/** Statuts qui requièrent un polling actif côté client */
export const POLLING_STATUSES: ProcessingStatus[] = [
  'UPLOADED',
  'PROCESSING',
  'PARTIALLY_ENRICHED',
  'PENDING_RETRY',
]

/** Statuts stables (pas de polling nécessaire) */
export const STABLE_STATUSES: ProcessingStatus[] = [
  'ENRICHED',
  'CLASSIFIED_ONLY',
  'FAILED',
  'ARCHIVED',
]
