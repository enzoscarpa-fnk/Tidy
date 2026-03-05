export interface WorkspaceEntity {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceWithDocumentCount extends WorkspaceEntity {
  documentCount: number;
}
