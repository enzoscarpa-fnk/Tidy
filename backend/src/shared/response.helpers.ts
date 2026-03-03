import type { ErrorCode, ErrorDetail } from './errors/app-error';

// ── Types de réponse standard (contrat API §2) ───────────────────────────────

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface SuccessResponse<T> {
  data: T;
  meta: Record<string, unknown> | PaginationMeta;
  error: null;
}

export interface ErrorResponse {
  data: null;
  meta: Record<string, unknown>;
  error: {
    code: ErrorCode;
    message: string;
    details: ErrorDetail[];
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function createSuccessResponse<T>(
  data: T,
  meta: Record<string, unknown> | PaginationMeta = {},
): SuccessResponse<T> {
  return { data, meta, error: null };
}

export function createPaginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): SuccessResponse<T[]> {
  const totalPages = Math.ceil(total / limit);
  return {
    data: items,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
    error: null,
  };
}

export function createErrorResponse(
  code: ErrorCode,
  message: string,
  details: ErrorDetail[] = [],
): ErrorResponse {
  return {
    data: null,
    meta: {},
    error: { code, message, details },
  };
}
