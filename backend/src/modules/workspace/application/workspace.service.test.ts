import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceService } from './workspace.service';
import {
  WorkspaceNotFoundError,
  ForbiddenError,
  WorkspaceArchivedError,
  WorkspaceNameDuplicateError,
  DocumentNotReadyError,
} from '../../../shared/errors/domain-errors';
import { Prisma } from '@prisma/client';

// ── Mock repository ────────────────────────────────────────────────────────────

const mockRepo = {
  create:                       vi.fn(),
  findById:                     vi.fn(),
  findAllByUser:                vi.fn(),
  update:                       vi.fn(),
  delete:                       vi.fn(),
  countActiveByUser:            vi.fn(),
  countDocuments:               vi.fn(),
  hasActiveProcessingDocuments: vi.fn(),
};

// ── Fixtures ───────────────────────────────────────────────────────────────────

const USER_A = 'user-uuid-aaaa';
const USER_B = 'user-uuid-bbbb';
const WS_ID  = 'ws-uuid-1111';

const baseWorkspace = {
  id:          WS_ID,
  ownerId:     USER_A,
  name:        'Mon espace',
  description: null,
  isArchived:  false,
  createdAt:   new Date('2026-01-01T00:00:00Z'),
  updatedAt:   new Date('2026-01-01T00:00:00Z'),
};

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('WorkspaceService', () => {
  let service: WorkspaceService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WorkspaceService(mockRepo as never);
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create and return workspace with documentCount 0', async () => {
      mockRepo.create.mockResolvedValueOnce(baseWorkspace);

      const result = await service.create(USER_A, '  Mon espace  ', null);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Mon espace', ownerId: USER_A }),
      );
      expect(result.documentCount).toBe(0);
    });

    it('should throw WorkspaceNameDuplicateError on Prisma P2002', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code:     'P2002',
        clientVersion: '6.0.0',
      });
      mockRepo.create.mockRejectedValueOnce(p2002);

      await expect(service.create(USER_A, 'Mon espace')).rejects.toThrow(
        WorkspaceNameDuplicateError,
      );
    });
  });

  // ── findById ───────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return workspace with documentCount', async () => {
      mockRepo.findById.mockResolvedValueOnce(baseWorkspace);
      mockRepo.countDocuments.mockResolvedValueOnce(7);

      const result = await service.findById(WS_ID, USER_A);

      expect(result.documentCount).toBe(7);
    });

    it('should throw WorkspaceNotFoundError when workspace does not exist', async () => {
      mockRepo.findById.mockResolvedValueOnce(null);

      await expect(service.findById(WS_ID, USER_A)).rejects.toThrow(WorkspaceNotFoundError);
    });

    it('🔒 should throw ForbiddenError when workspace belongs to another user', async () => {
      mockRepo.findById.mockResolvedValueOnce(baseWorkspace); // ownerId = USER_A

      await expect(service.findById(WS_ID, USER_B)).rejects.toThrow(ForbiddenError);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update workspace name', async () => {
      const updated = { ...baseWorkspace, name: 'Pro' };
      mockRepo.findById.mockResolvedValueOnce(baseWorkspace);
      mockRepo.update.mockResolvedValueOnce(updated);
      mockRepo.countDocuments.mockResolvedValueOnce(3);

      const result = await service.update(WS_ID, USER_A, { name: 'Pro' });

      expect(mockRepo.update).toHaveBeenCalledWith(WS_ID, { name: 'Pro' });
      expect(result.name).toBe('Pro');
    });

    it('should throw WorkspaceNameDuplicateError on Prisma P2002 during update', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code:     'P2002',
        clientVersion: '6.0.0',
      });
      mockRepo.findById.mockResolvedValueOnce(baseWorkspace);
      mockRepo.update.mockRejectedValueOnce(p2002);

      await expect(service.update(WS_ID, USER_A, { name: 'Copie' })).rejects.toThrow(
        WorkspaceNameDuplicateError,
      );
    });

    it('🔒 should throw ForbiddenError when not owner', async () => {
      mockRepo.findById.mockResolvedValueOnce(baseWorkspace);

      await expect(service.update(WS_ID, USER_B, { name: 'Hack' })).rejects.toThrow(
        ForbiddenError,
      );
    });

    it('🔒 should throw WorkspaceArchivedError when trying to rename an archived workspace', async () => {
      mockRepo.findById.mockResolvedValueOnce({ ...baseWorkspace, isArchived: true });

      await expect(service.update(WS_ID, USER_A, { name: 'Nouveau nom' })).rejects.toThrow(
        WorkspaceArchivedError,
      );
    });

    it('🔒 should throw WorkspaceArchivedError when trying to rename + unarchive in same request', async () => {
      mockRepo.findById.mockResolvedValueOnce({ ...baseWorkspace, isArchived: true });

      await expect(
        service.update(WS_ID, USER_A, { name: 'Nouveau nom', isArchived: false }),
      ).rejects.toThrow(WorkspaceArchivedError);
    });

    it('should allow unarchiving (isArchived: false only)', async () => {
      const archivedWs = { ...baseWorkspace, isArchived: true };
      const unarchived = { ...baseWorkspace, isArchived: false };
      mockRepo.findById.mockResolvedValueOnce(archivedWs);
      mockRepo.update.mockResolvedValueOnce(unarchived);
      mockRepo.countDocuments.mockResolvedValueOnce(2);

      const result = await service.update(WS_ID, USER_A, { isArchived: false });

      expect(result.isArchived).toBe(false);
    });
  });

  // ── delete ─────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should delete workspace successfully', async () => {
      mockRepo.findById.mockResolvedValueOnce(baseWorkspace);
      mockRepo.countActiveByUser.mockResolvedValueOnce(2); // 2 actifs → peut supprimer
      mockRepo.hasActiveProcessingDocuments.mockResolvedValueOnce(false);
      mockRepo.delete.mockResolvedValueOnce(undefined);

      await expect(service.delete(WS_ID, USER_A)).resolves.toBeUndefined();
      expect(mockRepo.delete).toHaveBeenCalledWith(WS_ID);
    });

    it('🔒 should throw ForbiddenError when not owner', async () => {
      mockRepo.findById.mockResolvedValueOnce(baseWorkspace);

      await expect(service.delete(WS_ID, USER_B)).rejects.toThrow(ForbiddenError);
    });

    it('🔒 should throw 422 when trying to delete last active workspace', async () => {
      mockRepo.findById.mockResolvedValueOnce(baseWorkspace); // isArchived: false
      mockRepo.countActiveByUser.mockResolvedValueOnce(1);   // dernier workspace actif

      const err = await service.delete(WS_ID, USER_A).catch((e) => e);
      expect(err.code).toBe('DOCUMENT_NOT_READY');
      expect(err.statusCode).toBe(422);
    });

    it('🔒 should throw DocumentNotReadyError when workspace has processing documents', async () => {
      mockRepo.findById.mockResolvedValueOnce(baseWorkspace);
      mockRepo.countActiveByUser.mockResolvedValueOnce(2);
      mockRepo.hasActiveProcessingDocuments.mockResolvedValueOnce(true);

      await expect(service.delete(WS_ID, USER_A)).rejects.toThrow(DocumentNotReadyError);
    });

    it('should allow deletion of archived workspace even if last active', async () => {
      // Workspace archivé → pas dans le comptage des "actifs"
      mockRepo.findById.mockResolvedValueOnce({ ...baseWorkspace, isArchived: true });
      mockRepo.hasActiveProcessingDocuments.mockResolvedValueOnce(false);
      mockRepo.delete.mockResolvedValueOnce(undefined);

      await expect(service.delete(WS_ID, USER_A)).resolves.toBeUndefined();
      // countActiveByUser ne doit PAS être appelé pour un workspace archivé
      expect(mockRepo.countActiveByUser).not.toHaveBeenCalled();
    });
  });
});
