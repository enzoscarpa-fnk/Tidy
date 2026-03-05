import type { PrismaClient, Workspace as PrismaWorkspace } from '@prisma/client';
import type {
  IWorkspaceRepository,
  CreateWorkspaceData,
  UpdateWorkspaceData,
} from '../../../modules/workspace/domain/ports/workspace.repository.port';
import type { WorkspaceEntity, WorkspaceWithDocumentCount } from '../../../modules/workspace/domain/workspace.entity';

export class WorkspaceRepositoryAdapter implements IWorkspaceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Mapping Prisma → Domain ────────────────────────────────────────────────

  private toDomain(row: PrismaWorkspace): WorkspaceEntity {
    return {
      id:          row.id,
      ownerId:     row.ownerId,
      name:        row.name,
      description: row.description,
      isArchived:  row.isArchived,
      createdAt:   row.createdAt,
      updatedAt:   row.updatedAt,
    };
  }

  // ── Lecture ────────────────────────────────────────────────────────────────

  async findById(id: string): Promise<WorkspaceEntity | null> {
    const row = await this.prisma.workspace.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findAllByUser(
    userId: string,
    includeArchived: boolean,
  ): Promise<WorkspaceWithDocumentCount[]> {
    const rows = await this.prisma.workspace.findMany({
      where: {
        ownerId: userId,
        ...(includeArchived ? {} : { isArchived: false }),
      },
      include: {
        _count: {
          select: { documents: { where: { isDeleted: false } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map((row) => ({
      ...this.toDomain(row),
      documentCount: row._count.documents,
    }));
  }

  async countActiveByUser(userId: string): Promise<number> {
    return this.prisma.workspace.count({
      where: { ownerId: userId, isArchived: false },
    });
  }

  async countDocuments(workspaceId: string): Promise<number> {
    return this.prisma.document.count({
      where: { workspaceId, isDeleted: false },
    });
  }

  async hasActiveProcessingDocuments(workspaceId: string): Promise<boolean> {
    const count = await this.prisma.document.count({
      where: {
        workspaceId,
        isDeleted: false,
        processingStatus: { in: ['PROCESSING', 'PENDING_RETRY'] },
      },
    });
    return count > 0;
  }

  // ── Écriture ───────────────────────────────────────────────────────────────

  async create(data: CreateWorkspaceData): Promise<WorkspaceEntity> {
    const row = await this.prisma.workspace.create({
      data: {
        ownerId:     data.ownerId,
          name:        data.name,
        description: data.description ?? null,
      },
    });
    return this.toDomain(row);
  }

  async update(id: string, data: UpdateWorkspaceData): Promise<WorkspaceEntity> {
    const row = await this.prisma.workspace.update({
      where: { id },
      data: {
      ...(data.name        !== undefined && { name:        data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.isArchived  !== undefined && { isArchived:  data.isArchived }),
      },
    });
    return this.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.workspace.delete({ where: { id } });
  }
}
