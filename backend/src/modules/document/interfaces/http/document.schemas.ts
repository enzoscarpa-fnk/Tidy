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
    title:            { type: 'string',         minLength: 1, maxLength: 255 },
    userTags:         { type: 'array', items: { type: 'string', maxLength: 50 }, maxItems: 20 },
    notes:            { type: ['string', 'null'], maxLength: 5000 },
    userOverrideType: {
      type: 'string',
      enum: ['INVOICE', 'CONTRACT', 'ID_DOCUMENT', 'RECEIPT', 'REPORT', 'OTHER'],
    },
  },
} as const;
