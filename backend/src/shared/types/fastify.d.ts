import type { UserTier } from '../../modules/user/domain/user.entity';
import type { PrismaClient } from '@prisma/client';
import type { IEventBus }    from '../events/domain-event';

declare module 'fastify' {
  interface FastifyInstance {
    prisma:   PrismaClient;
    eventBus: IEventBus;
  }

  interface FastifyRequest {
    user: {
      sub:  string;    // userId
      tier: UserTier;
    };
  }
}
