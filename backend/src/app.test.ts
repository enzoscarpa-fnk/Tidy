import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';

// ── Mock Prisma AVANT buildApp — vi.mock est hoisted automatiquement ──────────
vi.mock('@prisma/client', () => {
  const PrismaClient = vi.fn().mockImplementation(() => ({
    $connect:    vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  }));
  return { PrismaClient };
});

// ── Import APRÈS le mock ──────────────────────────────────────────────────────
import { buildApp } from './app';

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('retourne 200 avec { status: ok }, error: null', async () => {
    const response = await supertest(app.server)
      .get('/health')
      .expect(200);

    expect(response.body).toMatchObject({
    data: { status: 'ok' },
    meta: {},
    error: null,
  });
    expect(typeof response.body.data.timestamp).toBe('string');
  });

  it('retourne 404 avec error INTERNAL_ERROR sur route inconnue', async () => {
    const response = await supertest(app.server)
      .get('/api/v1/unknown-route')
      .expect(404);

    expect(response.body).toMatchObject({
      data: null,
      meta: {},
      error: {
        code: 'INTERNAL_ERROR',
      },
    });
  });
});
