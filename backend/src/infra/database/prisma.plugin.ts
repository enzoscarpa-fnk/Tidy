import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

const prismaPlugin: FastifyPluginAsync = fp(async (fastify) => {
  const prisma = new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? [
          { emit: 'stdout', level: 'query' },
          { emit: 'stdout', level: 'error' },
          { emit: 'stdout', level: 'warn' },
        ]
        : [{ emit: 'stdout', level: 'error' }],
  });

  await prisma.$connect();
  fastify.log.info('✅ Prisma connected to PostgreSQL');

  fastify.decorate('prisma', prisma);

  fastify.addHook('onClose', async (instance) => {
    fastify.log.info('Disconnecting Prisma...');
    await instance.prisma.$disconnect();
  });
});

export default prismaPlugin;
