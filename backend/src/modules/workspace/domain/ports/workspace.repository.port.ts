import type { WorkspaceEntity, WorkspaceWithDocumentCount } from '../workspace.entity';

export interface CreateWorkspaceData {
  ownerId: string;
  name: string;
  description?: string | null;
}

export interface UpdateWorkspaceData {
  name?: string;
  description?: string | null;
  isArchived?: boolean;
}

export interface IWorkspaceRepository {
  create(data: CreateWorkspaceData): Promise<WorkspaceEntity>;
  findById(id: string): Promise<WorkspaceEntity | null>;
  findAllByUser(userId: string, includeArchived: boolean): Promise<WorkspaceWithDocumentCount[]>;
  update(id: string, data: UpdateWorkspaceData): Promise<WorkspaceEntity>;
  delete(id: string): Promise<void>;
  countActiveByUser(userId: string): Promise<number>;
  countDocuments(workspaceId: string): Promise<number>;
  hasActiveProcessingDocuments(workspaceId: string): Promise<boolean>;
}
