import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceRepositoryAdapter } from './workspace.repository.adapter';

// ── Prisma Client mock minimal ────────────────────────────────────────────────

const mockPrisma = {
  workspace: {
    create:    vi.fn(),
    findUnique: vi.fn(),
    findMany:  vi.fn(),
    update:    vi.fn(),
    delete:    vi.fn(),
    count:     vi.fn(),
  },
  document: {
    count: vi.fn(),
  },
};

// ── Fixtures ───────────────────────────────────────────────────────────────────

const baseWorkspace = {
  id:          'ws-uuid-1',
  ownerId:     'user-uuid-1',
  name:        'Mon espace',
  description: null,
  isArchived:  false,
  createdAt:   new Date('2026-01-01T00:00:00Z'),
  updatedAt:   new Date('2026-01-01T00:00:00Z'),
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('WorkspaceRepositoryAdapter', () => {
  let adapter: WorkspaceRepositoryAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new WorkspaceRepositoryAdapter(mockPrisma as never);
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a workspace and return domain entity', async () => {
      mockPrisma.workspace.create.mockResolvedValueOnce(baseWorkspace);

      const result = await adapter.create({
        ownerId:     'user-uuid-1',
        name:        'Mon espace',
        description: null,
      });

      expect(mockPrisma.workspace.create).toHaveBeenCalledWith({
        data:{ ownerId: 'user-uuid-1', name: 'Mon espace', description: null },
      });
      expect(result.id).toBe('ws-uuid-1');
      expect(result.name).toBe('Mon espace');
      expect(result.isArchived).toBe(false);
    });

    it('should default description to null when omitted', async () => {
      mockPrisma.workspace.create.mockResolvedValueOnce(baseWorkspace);
      await adapter.create({ ownerId: 'user-uuid-1', name: 'Test' });

      const callData = mockPrisma.workspace.create.mock.calls[0][0].data;
      expect(callData.description).toBeNull();
    });
  });

  // ── findById ────────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return domain entity when found', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValueOnce(baseWorkspace);
      const result = await adapter.findById('ws-uuid-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('ws-uuid-1');
    });

    it('should return null when not found', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValueOnce(null);
      const result = await adapter.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  // ── findAllByUser ───────────────────────────────────────────────────────────

  describe('findAllByUser', () => {
    it('should return workspaces with documentCount', async () => {
      mockPrisma.workspace.findMany.mockResolvedValueOnce([
        { ...baseWorkspace, _count: { documents: 5 } },
      ]);

      const results = await adapter.findAllByUser('user-uuid-1', false);

      expect(results).toHaveLength(1);
      expect(results[0].documentCount).toBe(5);
    });

    it('should filter out archived workspaces when includeArchived=false', async () => {
      mockPrisma.workspace.findMany.mockResolvedValueOnce([]);
      await adapter.findAllByUser('user-uuid-1', false);

      const whereArg = mockPrisma.workspace.findMany.mock.calls[0][0].where;
      expect(whereArg.isArchived).toBe(false);
    });

    it('should include archived workspaces when includeArchived=true', async () => {
      mockPrisma.workspace.findMany.mockResolvedValueOnce([]);
      await adapter.findAllByUser('user-uuid-1', true);

      const whereArg = mockPrisma.workspace.findMany.mock.calls[0][0].where;
      expect(whereArg.isArchived).toBeUndefined();
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update only provided fields (partial update)', async () => {
      const updated = { ...baseWorkspace, name: 'Nouveau nom' };
      mockPrisma.workspace.update.mockResolvedValueOnce(updated);

      const result = await adapter.update('ws-uuid-1', { name: 'Nouveau nom' });

      const callData = mockPrisma.workspace.update.mock.calls[0][0].data;
      expect(callData).toEqual({ name: 'Nouveau nom' });
      expect(callData.description).toBeUndefined(); // non fourni → non écrasé
      expect(result.name).toBe('Nouveau nom');
    });

    it('should set isArchived to true', async () => {
      mockPrisma.workspace.update.mockResolvedValueOnce({ ...baseWorkspace, isArchived: true });
      await adapter.update('ws-uuid-1', { isArchived: true });

      const callData = mockPrisma.workspace.update.mock.calls[0][0].data;
      expect(callData.isArchived).toBe(true);
    });
  });

  // ── delete ──────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should call prisma.workspace.delete with correct id', async () => {
      mockPrisma.workspace.delete.mockResolvedValueOnce(baseWorkspace);
      await adapter.delete('ws-uuid-1');
      expect(mockPrisma.workspace.delete).toHaveBeenCalledWith({ where: { id: 'ws-uuid-1' } });
    });
  });

  // ── countActiveByUser ───────────────────────────────────────────────────────

  describe('countActiveByUser', () => {
    it('should count non-archived workspaces for user', async () => {
      mockPrisma.workspace.count.mockResolvedValueOnce(3);
      const count = await adapter.countActiveByUser('user-uuid-1');

      expect(count).toBe(3);
      expect(mockPrisma.workspace.count).toHaveBeenCalledWith({
        where: { ownerId: 'user-uuid-1', isArchived: false },
      });
    });
  });

  // ── countDocuments ──────────────────────────────────────────────────────────

  describe('countDocuments', () => {
    it('should count non-deleted documents in workspace', async () => {
      mockPrisma.document.count.mockResolvedValueOnce(12);
      const count = await adapter.countDocuments('ws-uuid-1');

      expect(count).toBe(12);
      expect(mockPrisma.document.count).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-uuid-1', isDeleted: false },
      });
    });
  });
});
