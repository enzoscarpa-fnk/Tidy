import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  IProcessingEventRepository,
  CreateProcessingEventData,
} from '../../../modules/document/domain/ports/processing-event.repository.port';

export class ProcessingEventRepositoryAdapter implements IProcessingEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateProcessingEventData): Promise<void> {
    await this.prisma.processingEvent.create({
      data: {
        document:     { connect: { id: data.documentId } },
        eventType:    data.eventType,
        occurredAt:   new Date(),
        isSuccess:    data.isSuccess,
        errorMessage: data.errorMessage ?? null,
        payload:      data.payload ? (data.payload as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  }
}
