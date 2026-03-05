export const workspaceIdParamSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
} as const;

export const createWorkspaceBodySchema = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    name:        { type: 'string', minLength: 1, maxLength: 100 },
    description: { type: 'string', maxLength: 500 },
  },
} as const;

export const updateWorkspaceBodySchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    name:        { type: 'string', minLength: 1, maxLength: 100 },
    description: { type: ['string', 'null'], maxLength: 500 },
    isArchived:  { type: 'boolean' },
  },
} as const;

export const listWorkspacesQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    includeArchived: { type: 'string', enum: ['true', 'false'] },
    page:            { type: 'string', pattern: '^[0-9]+$' },
    limit:           { type: 'string', pattern: '^[0-9]+$' },
  },
} as const;
