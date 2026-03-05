import type { PrismaClient, User as PrismaUser } from '@prisma/client';
import type { IUserRepository } from '../../../modules/user/domain/ports/user.repository.port';
import { User, UserTier } from '../../../modules/user/domain/user.entity';
import type { CreateUserData } from '../../../modules/user/domain/user.entity';

export class UserRepositoryAdapter implements IUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Mapping Prisma → Domain ──────────────────────────────────────────────

  private toDomain(row: PrismaUser): User {
    return new User(
      row.id,
      row.email,
      row.passwordHash,
      row.displayName,
      row.tier,
      row.status,
      row.createdAt,
      row.updatedAt,
    );
  }

  // ── Lecture ──────────────────────────────────────────────────────────────

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row ? this.toDomain(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  // ── Écriture ─────────────────────────────────────────────────────────────

  async create(data: CreateUserData): Promise<User> {
    const row = await this.prisma.user.create({
    data: {
      email: data.email,
        passwordHash: data.passwordHash,
      displayName: data.displayName,
      // tier, status : valeurs par défaut FREE / ACTIVE gérées par Prisma
      // updatedAt : géré automatiquement via @updatedAt dans le schéma
    },
  });
    return this.toDomain(row);
  }

  async updateTier(id: string, tier: UserTier): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { tier },
    // updatedAt mis à jour automatiquement via @updatedAt
  });
  }

  async updateDisplayName(id: string, displayName: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { displayName },
  });
  }
}
