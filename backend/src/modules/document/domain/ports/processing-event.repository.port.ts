export interface CreateProcessingEventData {
  documentId:    string;
  eventType:     string;
  isSuccess:     boolean;
  errorMessage?: string | null;
  payload?:      Record<string, unknown> | null;
}

export interface IProcessingEventRepository {
  create(data: CreateProcessingEventData): Promise<void>;
}
