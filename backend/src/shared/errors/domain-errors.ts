import { AppError } from './app-error';
import type { ErrorDetail } from './app-error';

// DomainError étend AppError → capté automatiquement par le handler existant.
// Le statusCode est résolu via ERROR_STATUS_MAP dans AppError.

export class DomainError extends AppError {
  constructor(code: ConstructorParameters<typeof AppError>[0], message: string, details?: ErrorDetail[]) {
    super(code, message, details);
    this.name = 'DomainError';
  }
}

// ── 401 ──────────────────────────────────────────────────────────────────────

export class InvalidCredentialsError extends DomainError {
  constructor() {
    super('INVALID_CREDENTIALS', 'Email ou mot de passe incorrect.');
  }
}

export class TokenExpiredError extends DomainError {
  constructor() {
    super('TOKEN_EXPIRED', 'Access token expiré.');
  }
}

export class TokenInvalidError extends DomainError {
  constructor() {
    super('TOKEN_INVALID', 'Token malformé ou signature invalide.');
  }
}

export class RefreshTokenInvalidError extends DomainError {
  constructor() {
    super('REFRESH_TOKEN_INVALID', 'Refresh token invalide ou révoqué.');
  }
}

// ── 403 ──────────────────────────────────────────────────────────────────────

export class ForbiddenError extends DomainError {
  constructor() {
    super('FORBIDDEN', 'Accès refusé à cette ressource.');
  }
}

// ── 404 ──────────────────────────────────────────────────────────────────────

export class UserNotFoundError extends DomainError {
  constructor() {
    super('USER_NOT_FOUND', 'Utilisateur introuvable.');
  }
}

export class WorkspaceNotFoundError extends DomainError {
  constructor() {
    super('WORKSPACE_NOT_FOUND', 'Workspace introuvable.');
  }
}

export class DocumentNotFoundError extends DomainError {
  constructor() {
    super('DOCUMENT_NOT_FOUND', 'Document introuvable.');
  }
}

// ── 409 ──────────────────────────────────────────────────────────────────────

export class EmailAlreadyExistsError extends DomainError {
  constructor() {
    super('EMAIL_ALREADY_EXISTS', 'Cette adresse email est déjà utilisée.');
  }
}

export class WorkspaceNameDuplicateError extends DomainError {
  constructor() {
    super('WORKSPACE_NAME_DUPLICATE', 'Un workspace avec ce nom existe déjà.');
  }
}

// ── 422 ──────────────────────────────────────────────────────────────────────

export class WorkspaceArchivedError extends DomainError {
  constructor() {
    super('WORKSPACE_ARCHIVED', 'Action impossible sur un workspace archivé.');
  }
}

export class InvalidStatusTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super(
      'INVALID_STATUS_TRANSITION',
      `Transition d'état invalide : ${from} → ${to}.`,
    );
  }
}

export class DocumentNotReadyError extends DomainError {
  constructor() {
    super('DOCUMENT_NOT_READY', "Action impossible : document pas dans l'état requis.");
  }
}

export class DocumentQuotaExceededError extends DomainError {
  constructor() {
    super('DOCUMENT_QUOTA_EXCEEDED', 'Quota de documents atteint pour le tier Free (30 max).');
  }
}

// ── 503 ──────────────────────────────────────────────────────────────────────

export class OcrServiceUnavailableError extends AppError {
  constructor(detail?: string) {
    super(      'OCR_SERVICE_UNAVAILABLE', detail ?? 'Le service OCR est temporairement indisponible.');
  }
}
