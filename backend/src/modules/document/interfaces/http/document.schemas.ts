export const documentIdParamSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
} as const;

export const listDocumentsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    workspaceId:      { type: 'string', format: 'uuid' },
    processingStatus: { type: 'string' },
    detectedType:     { type: 'string' },
    query:            { type: 'string', maxLength: 200 },
    userTags:         { type: 'string' },
    page:             { type: 'string', pattern: '^[0-9]+$' },
    limit:            { type: 'string', pattern: '^[0-9]+$' },
    sortBy:           { type: 'string', enum: ['uploadedAt', 'title', 'updatedAt'] },
    sortOrder:        { type: 'string', enum: ['asc', 'desc'] },
  },
} as const;

export const patchDocumentBodySchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    title:            { type: 'string',           minLength: 1, maxLength: 255 },
    userTags:         { type: 'array', items: { type: 'string', maxLength: 50 }, maxItems: 20 },
    notes:            { type: ['string', 'null'],  maxLength: 5000 },
    userOverrideType: {
      type: 'string',
      enum: ['INVOICE', 'CONTRACT', 'ID_DOCUMENT', 'RECEIPT', 'REPORT', 'OTHER'],
    },
  },
} as const;

// ── Sync batch ────────────────────────────────────────────────────────────────

export const syncDocumentItemSchema = {
  type: 'object',
  required: [
    'id', 'workspaceId', 'originalFilename', 'mimeType',
    'fileSizeBytes', 'title', 'userTags', 'isDeleted', 'createdAt', 'updatedAt',
  ],
  additionalProperties: false,
  properties: {
    id:               { type: 'string', format: 'uuid' },
    workspaceId:      { type: 'string', format: 'uuid' },
    originalFilename: { type: 'string', minLength: 1, maxLength: 500 },
    mimeType:         { type: 'string', minLength: 1, maxLength: 100 },
    fileSizeBytes:    { type: 'integer', minimum: 1 },
    s3Key:            { type: ['string', 'null'], maxLength: 500 },
    title:            { type: 'string', minLength: 1, maxLength: 255 },
    userTags:         { type: 'array', items: { type: 'string', maxLength: 50 }, maxItems: 20 },
    notes:            { type: ['string', 'null'], maxLength: 5000 },
    isDeleted:        { type: 'boolean' },
    createdAt:        { type: 'string', format: 'date-time' },
    updatedAt:        { type: 'string', format: 'date-time' },
  },
} as const;

export const syncDocumentsBatchBodySchema = {
  type: 'object',
  required: ['documents'],
  additionalProperties: false,
  properties: {
    documents: {
      type:     'array',
      items:    syncDocumentItemSchema,
      minItems: 1,
      maxItems: 100,
    },
  },
} as const;

// ── Pull sync ─────────────────────────────────────────────────────────────────

export const pullSyncQuerySchema = {
  type: 'object',
  required: ['workspaceId'],
  additionalProperties: false,
  properties: {
    workspaceId: { type: 'string', format: 'uuid' },
    since:       { type: 'string' },
  },
} as const;

// ── Presigned upload URL ──────────────────────────────────────────────────────

export const uploadUrlBodySchema = {
  type: 'object',
  required: ['document_id', 'mime_type', 'file_size_bytes'],
  additionalProperties: false,
  properties: {
    document_id:     { type: 'string', format: 'uuid' },
    mime_type:       { type: 'string', minLength: 1, maxLength: 100 },
    file_size_bytes: { type: 'integer', minimum: 1, maximum: 52_428_800 },
  },
} as const;

// ── Search FTS ────────────────────────────────────────────────────────────────

/**
 * `q`            : terme(s) de recherche — obligatoire, min 1 char
 * `workspaceId`  : obligatoire — scope de la recherche
 * `detectedType` : filtre optionnel, valeurs séparées par virgule
 * `userTags`     : filtre optionnel, valeurs séparées par virgule
 * `page` / `limit` : pagination standard
 */
export const searchDocumentsQuerySchema = {
  type: 'object',
  required: ['workspaceId', 'q'],
  additionalProperties: false,
  properties: {
    workspaceId:  { type: 'string', format: 'uuid' },
    q:            { type: 'string', minLength: 1, maxLength: 200 },
    detectedType: { type: 'string' },
    userTags:     { type: 'string' },
    page:         { type: 'string', pattern: '^[0-9]+$' },
    limit:        { type: 'string', pattern: '^[0-9]+$' },
  },
} as const;
