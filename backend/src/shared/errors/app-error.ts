export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'REFRESH_TOKEN_INVALID'
  | 'FORBIDDEN'
  | 'DOCUMENT_NOT_FOUND'
  | 'WORKSPACE_NOT_FOUND'
  | 'USER_NOT_FOUND'
  | 'EMAIL_ALREADY_EXISTS'
  | 'WORKSPACE_NAME_DUPLICATE'
  | 'WORKSPACE_ARCHIVED'
  | 'DOCUMENT_NOT_READY'
  | 'INVALID_STATUS_TRANSITION'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_MIME_TYPE'
  | 'RATE_LIMIT_EXCEEDED'
  | 'DOCUMENT_QUOTA_EXCEEDED'
  | 'OCR_SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

// Table de mapping code → HTTP status
export const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  VALIDATION_ERROR:           400,
  INVALID_CREDENTIALS:        401,
  TOKEN_EXPIRED:              401,
  TOKEN_INVALID:              401,
  REFRESH_TOKEN_INVALID:      401,
  FORBIDDEN:                  403,
  DOCUMENT_NOT_FOUND:         404,
  WORKSPACE_NOT_FOUND:        404,
  USER_NOT_FOUND:             404,
  EMAIL_ALREADY_EXISTS:       409,
  WORKSPACE_NAME_DUPLICATE:   409,
  WORKSPACE_ARCHIVED:         422,
  DOCUMENT_NOT_READY:         422,
  INVALID_STATUS_TRANSITION:  422,
  FILE_TOO_LARGE:             413,
  UNSUPPORTED_MIME_TYPE:      415,
  RATE_LIMIT_EXCEEDED:        429,
  DOCUMENT_QUOTA_EXCEEDED:    422,
  OCR_SERVICE_UNAVAILABLE:    503,
  INTERNAL_ERROR:             500,
};

export interface ErrorDetail {
  field?: string;
  message: string;
}

/**
 * AppError — erreur métier typée, mappée vers un code HTTP.
 * Lancée depuis n'importe quelle couche (service, repository, handler).
 * Capturée et formatée par errorHandlerPlugin.
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details: ErrorDetail[];

  constructor(
    code: ErrorCode,
    message: string,
    details: ErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = ERROR_STATUS_MAP[code];
    this.details = details;
  }
}
