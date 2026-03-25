// ── Entité domaine ShareLink ──────────────────────────────────────────────────

export interface ShareLink {
  id:          string;
  documentId:  string;
  userId:      string;
  token:       string;
  expiresAt:   Date;
  isRevoked:   boolean;
  accessCount: number;
  createdAt:   Date;
}

// ── Data de création ──────────────────────────────────────────────────────────

export interface CreateShareLinkData {
  documentId: string;
  userId:     string;
  token:      string;
  expiresAt:  Date;
}

// ── Port ──────────────────────────────────────────────────────────────────────

export interface IShareLinkRepository {
  create(data: CreateShareLinkData): Promise<ShareLink>;
  findById(id: string): Promise<ShareLink | null>;
  findByToken(token: string): Promise<ShareLink | null>;
  findByDocumentId(docId: string): Promise<ShareLink[]>;
  revoke(id: string): Promise<void>;
  revokeAllForDocument(docId: string): Promise<void>;
  incrementAccessCount(id: string): Promise<void>;
}
