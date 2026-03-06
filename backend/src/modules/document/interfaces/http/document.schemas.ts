export const idParamSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
} as const;

export const getDocumentsQuerySchema = {
  type: 'object',
  required: ['workspaceId'],
  properties: {
    workspaceId:  { type: 'string', format: 'uuid' },
    query:        { type: 'string', minLength: 2, maxLength: 200 },
    status:       { type: 'string' },
    detectedType: { type: 'string' },
    userTags:     { type: 'string' },
    dateFrom:     { type: 'string' },
    dateTo:       { type: 'string' },
    sortBy:       { type: 'string', enum: ['uploadedAt', 'updatedAt', 'title'] },
    sortOrder:    { type: 'string', enum: ['asc', 'desc'] },
    page:         { type: 'integer', minimum: 1, default: 1 },
    limit:        { type: 'integer', minimum: 1, maximum: 100, default: 30 },
  },
} as const;

export const patchDocumentBodySchema = {
  type: 'object',
  properties: {
    title:            { type: 'string', minLength: 1, maxLength: 255 },
    userTags:         { type: 'array',  items: { type: 'string' } },
    notes:            { type: ['string', 'null'], maxLength: 2000 },
    userOverrideType: {
      type: ['string', 'null'],
      enum: ['INVOICE', 'CONTRACT', 'RECEIPT', 'ID_DOCUMENT', 'BANK_STATEMENT', 'OTHER', null],
    },
  },
  additionalProperties: false,
} as const;
