import type { UserTier } from '../../modules/user/domain/user.entity';

declare module 'fastify' {
  interface FastifyRequest {
    user: {
      sub:  string;    // userId
      tier: UserTier;
    };
  }
}
