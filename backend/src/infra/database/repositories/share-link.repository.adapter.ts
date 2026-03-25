import type { PrismaClient, ShareLink as PrismaShareLink } from '@prisma/client';
import type {
  IShareLinkRepository,
  ShareLink,
  CreateShareLinkData,
} from '../../../modules/share/domain/ports/share-link.repository.port';

export class ShareLinkRepositoryAdapter implements IShareLinkRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Pivot Prisma → Domaine ────────────────────────────────────────────────

  private toDomain(row: PrismaShareLink): ShareLink {
    return {
      id:          row.id,
      documentId:  row.documentId,
      userId:      row.userId,
      token:       row.token,
      expiresAt:   row.expiresAt,
      isRevoked:   row.isRevoked,
      accessCount: row.accessCount,
      createdAt:   row.createdAt,
    };
  }

  // ── Création ──────────────────────────────────────────────────────────────

  async create(data: CreateShareLinkData): Promise<ShareLink> {
    const row = await this.prisma.shareLink.create({
      data: {
        document:  { connect: { id: data.documentId } },
        user:      { connect: { id: data.userId } },
        token:     data.token,
          expiresAt: data.expiresAt,
      },
    });
    return this.toDomain(row);
  }

  // ── Lectures ──────────────────────────────────────────────────────────────

  async findById(id: string): Promise<ShareLink | null> {
    const row = await this.prisma.shareLink.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findByToken(token: string): Promise<ShareLink | null> {
    const row = await this.prisma.shareLink.findUnique({ where: { token } });
    return row ? this.toDomain(row) : null;
  }

  async findByDocumentId(docId: string): Promise<ShareLink[]> {
    const rows = await this.prisma.shareLink.findMany({
      where:   { documentId: docId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(this.toDomain.bind(this));
  }

  // ── Révocation ────────────────────────────────────────────────────────────

  async revoke(id: string): Promise<void> {
    await this.prisma.shareLink.update({
      where: { id },
      data: { isRevoked: true },
    });
  }

  /**
   * Révoque tous les liens actifs d'un document.
   * Utilisé avant la création d'un nouveau lien (invariant : 1 lien actif max).
   */
  async revokeAllForDocument(docId: string): Promise<void> {
    await this.prisma.shareLink.updateMany({
      where: { documentId: docId, isRevoked: false },
      data: { isRevoked: true },
    });
  }

  // ── Compteur d'accès ──────────────────────────────────────────────────────

  async incrementAccessCount(id: string): Promise<void> {
    await this.prisma.shareLink.update({
      where: { id },
      data: { accessCount: { increment: 1 } },
    });
  }
}
