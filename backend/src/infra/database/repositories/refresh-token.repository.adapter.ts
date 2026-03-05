import type { PrismaClient, RefreshToken as PrismaRefreshToken } from '@prisma/client';
import type {
  IRefreshTokenRepository,
  RefreshTokenRecord,
} from '../../../modules/auth/domain/ports/refresh-token.repository.port';

export class RefreshTokenRepositoryAdapter implements IRefreshTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Mapping Prisma → Domain ──────────────────────────────────────────────

  private toDomain(row: PrismaRefreshToken): RefreshTokenRecord {
    return {
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      createdAt: row.createdAt,
    };
  }

  // ── Écriture ─────────────────────────────────────────────────────────────

  async create(userId: string, tokenHash: string, expiresAt: Date): Promise<RefreshTokenRecord> {
    const row = await this.prisma.refreshToken.create({
    data: { userId, tokenHash, expiresAt },
  });
    return this.toDomain(row);
  }

  // ── Lecture ──────────────────────────────────────────────────────────────

  async findByHash(hash: string): Promise<RefreshTokenRecord | null> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hash },
    });
    return row ? this.toDomain(row) : null;
  }

  // ── Révocation ───────────────────────────────────────────────────────────

  async revoke(id: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
  });
  }

  /**
   * Révoque TOUS les tokens actifs d'un user.
   * Utilisé lors de la détection de re-soumission d'un token déjà révoqué
   * (stratégie de détection de vol de token — ticket 2.7).
   */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
  });
  }
}
