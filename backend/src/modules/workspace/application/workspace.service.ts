import { Prisma } from '@prisma/client';
import type { IWorkspaceRepository, UpdateWorkspaceData } from '../domain/ports/workspace.repository.port';
import type { WorkspaceWithDocumentCount } from '../domain/workspace.entity';
import {
  WorkspaceNotFoundError,
  ForbiddenError,
  WorkspaceArchivedError,
  WorkspaceNameDuplicateError,
  DocumentNotReadyError,
} from '../../../shared/errors/domain-errors';
import { DomainError } from '../../../shared/errors/domain-errors';

export interface WorkspaceDto extends WorkspaceWithDocumentCount {}

export class WorkspaceService {
  constructor(private readonly workspaceRepo: IWorkspaceRepository) {}

  // ── Création ───────────────────────────────────────────────────────────────

  async create(
    ownerId: string,
    name: string,
    description?: string | null,
  ): Promise<WorkspaceDto> {
    try {
      const workspace = await this.workspaceRepo.create({
        ownerId,
        name: name.trim(),
        description: description ?? null,
      });
      return { ...workspace, documentCount: 0 };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new WorkspaceNameDuplicateError();
      }
      throw err;
    }
  }

  // ── Liste paginée ──────────────────────────────────────────────────────────

  async findAllByUser(
    userId: string,
    includeArchived: boolean,
    page: number,
    limit: number,
  ): Promise<{ items: WorkspaceDto[]; total: number }> {
    const all = await this.workspaceRepo.findAllByUser(userId, includeArchived);
    const total = all.length;
    const start = (page - 1) * limit;
    const items = all.slice(start, start + limit);
    return { items, total };
  }

  // ── Détail par ID ──────────────────────────────────────────────────────────

  async findById(id: string, userId: string): Promise<WorkspaceDto> {
    const workspace = await this.workspaceRepo.findById(id);
    if (!workspace) throw new WorkspaceNotFoundError();
    if (workspace.ownerId !== userId) throw new ForbiddenError();

    const documentCount = await this.workspaceRepo.countDocuments(id);
    return { ...workspace, documentCount };
  }

  // ── Mise à jour ────────────────────────────────────────────────────────────

  async update(
    id: string,
    userId: string,
    data: UpdateWorkspaceData,
  ): Promise<WorkspaceDto> {
    const workspace = await this.workspaceRepo.findById(id);
    if (!workspace) throw new WorkspaceNotFoundError();
    if (workspace.ownerId !== userId) throw new ForbiddenError();

    // Invariant : workspace archivé → seul isArchived: false (désarchivage) est autorisé
    if (workspace.isArchived) {
      const hasOtherFields = data.name !== undefined || data.description !== undefined;
      const isUnarchiving  = data.isArchived === false;
      if (!isUnarchiving || hasOtherFields) {
        throw new WorkspaceArchivedError();
      }
    }

    const payload: UpdateWorkspaceData = {};
    if (data.name        !== undefined) payload.name        = data.name.trim();
    if (data.description !== undefined) payload.description = data.description;
    if (data.isArchived  !== undefined) payload.isArchived  = data.isArchived;

    try {
      const updated = await this.workspaceRepo.update(id, payload);
      const documentCount = await this.workspaceRepo.countDocuments(id);
      return { ...updated, documentCount };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new WorkspaceNameDuplicateError();
      }
      throw err;
    }
  }

  // ── Suppression ────────────────────────────────────────────────────────────

  async delete(id: string, userId: string): Promise<void> {
    const workspace = await this.workspaceRepo.findById(id);
    if (!workspace) throw new WorkspaceNotFoundError();
    if (workspace.ownerId !== userId) throw new ForbiddenError();

    // Invariant : 1 workspace actif minimum
    if (!workspace.isArchived) {
      const activeCount = await this.workspaceRepo.countActiveByUser(userId);
      if (activeCount <= 1) {
        throw new DomainError(
          'DOCUMENT_NOT_READY',
          'Impossible de supprimer le dernier workspace actif.',
        );
      }
    }

    // Invariant : pas de documents en cours de traitement
    const hasProcessing = await this.workspaceRepo.hasActiveProcessingDocuments(id);
    if (hasProcessing) {
      throw new DocumentNotReadyError();
    }

    await this.workspaceRepo.delete(id);
  }
}
