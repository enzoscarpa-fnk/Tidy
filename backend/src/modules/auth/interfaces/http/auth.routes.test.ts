import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockUser = {
  id:           'user-uuid-1',
  email:        'marc@example.com',
  passwordHash: '$2b$12$hashedpassword',
  displayName:  'Marc',
  tier:         'FREE' as const,
  status:       'ACTIVE' as const,
  createdAt:    new Date('2026-01-01'),
  updatedAt:    new Date('2026-01-01'),
};

const mockRefreshToken = {
  id:         'token-uuid-1',
  userId:     'user-uuid-1',
  tokenHash:  'hashed-token',
  expiresAt:  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  revokedAt:  null,
  createdAt:  new Date(),
};

// Prisma mock — instanciation interceptée avant buildApp
vi.mock('@prisma/client', () => {
  const PrismaClient = vi.fn().mockImplementation(() => ({
    $connect:    vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    user: {
      findUnique: vi.fn(),
      create:     vi.fn(),
      update:     vi.fn(),
    },
    workspace: {
      create: vi.fn(),
    },
    refreshToken: {
      create:     vi.fn(),
      findUnique: vi.fn(),
      update:     vi.fn(),
      updateMany: vi.fn(),
    },
  }));
  return { PrismaClient };
});

import { buildApp } from '../../../../app';
import { PrismaClient } from '@prisma/client';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPrisma() {
  return (PrismaClient as ReturnType<typeof vi.fn>).mock.results[0].value;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Auth routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  // ── POST /register ──────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/register', () => {
    it('201 — crée un user et retourne les tokens', async () => {
      const prisma = getPrisma();
      prisma.user.findUnique.mockResolvedValueOnce(null);
      prisma.user.create.mockResolvedValueOnce(mockUser);
      prisma.workspace.create.mockResolvedValueOnce({ id: 'ws-uuid-1', name: 'Mon espace' });
      prisma.refreshToken.create.mockResolvedValueOnce(mockRefreshToken);

      const res = await supertest(app.server)
        .post('/api/v1/auth/register')
        .send({ email: 'marc@example.com', password: 'password123', displayName: 'Marc' })
        .expect(201);

      expect(res.body.data.user.email).toBe('marc@example.com');
      expect(res.body.data.tokens.accessToken).toBeDefined();
      expect(res.body.data.tokens.refreshToken).toBeDefined();
      expect(res.body.data.defaultWorkspace.name).toBe('Mon espace');
      expect(res.body.error).toBeNull();
    });

    it('409 EMAIL_ALREADY_EXISTS — email déjà utilisé', async () => {
      const prisma = getPrisma();
      prisma.user.findUnique.mockResolvedValueOnce(mockUser);

      const res = await supertest(app.server)
        .post('/api/v1/auth/register')
        .send({ email: 'marc@example.com', password: 'password123', displayName: 'Marc' })
        .expect(409);

      expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
    });

    it('400 VALIDATION_ERROR — password trop court', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/auth/register')
        .send({ email: 'marc@example.com', password: '123', displayName: 'Marc' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('normalise l\'email en lowercase avant stockage', async () => {
    const prisma = getPrisma();
    prisma.user.findUnique.mockResolvedValueOnce(null);
    prisma.user.create.mockResolvedValueOnce({ ...mockUser, email: 'marc@example.com' });
    prisma.workspace.create.mockResolvedValueOnce({ id: 'ws-uuid-1', name: 'Mon espace' });
    prisma.refreshToken.create.mockResolvedValueOnce(mockRefreshToken);

    await supertest(app.server)
      .post('/api/v1/auth/register')
      .send({ email: 'MARC@EXAMPLE.COM', password: 'password123', displayName: 'Marc' })
      .expect(201);

    // findUnique appelé avec l'email en lowercase
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'marc@example.com' },
    });
  });
});

// ── POST /login ─────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  it('200 — retourne les tokens avec credentials valides', async () => {
    const bcrypt = await import('bcrypt');
    const hash   = await bcrypt.hash('password123', 12);

    const prisma = getPrisma();
    prisma.user.findUnique.mockResolvedValueOnce({ ...mockUser, passwordHash: hash });
    prisma.refreshToken.create.mockResolvedValueOnce(mockRefreshToken);

    const res = await supertest(app.server)
      .post('/api/v1/auth/login')
      .send({ email: 'marc@example.com', password: 'password123' })
      .expect(200);

    expect(res.body.data.tokens.accessToken).toBeDefined();
    expect(res.body.data.tokens.refreshToken).toBeDefined();
  });

  it('401 INVALID_CREDENTIALS — email inconnu', async () => {
    const prisma = getPrisma();
    prisma.user.findUnique.mockResolvedValueOnce(null);

    const res = await supertest(app.server)
      .post('/api/v1/auth/login')
      .send({ email: 'inconnu@example.com', password: 'password123' })
      .expect(401);

    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('401 INVALID_CREDENTIALS — mauvais mot de passe (même code qu\'email inconnu)', async () => {
  const prisma = getPrisma();
  prisma.user.findUnique.mockResolvedValueOnce(mockUser);

  const res = await supertest(app.server)
    .post('/api/v1/auth/login')
    .send({ email: 'marc@example.com', password: 'wrongpassword' })
    .expect(401);

  // Anti-énumération : même code d'erreur que email inconnu
  expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
});
});

// ── POST /refresh ───────────────────────────────────────────────────────────

describe('POST /api/v1/auth/refresh', () => {
  it('200 — rotation : retourne une nouvelle paire de tokens', async () => {
    const prisma = getPrisma();
    prisma.refreshToken.findUnique.mockResolvedValueOnce(mockRefreshToken);
    prisma.refreshToken.update.mockResolvedValueOnce({ ...mockRefreshToken, revokedAt: new Date() });
    prisma.user.findUnique.mockResolvedValueOnce(mockUser);
    prisma.refreshToken.create.mockResolvedValueOnce({ ...mockRefreshToken, id: 'token-uuid-2' });

    const res = await supertest(app.server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'valid-raw-token' })
      .expect(200);

    expect(res.body.data.tokens.accessToken).toBeDefined();
    expect(res.body.data.tokens.refreshToken).toBeDefined();
  });

  it('401 REFRESH_TOKEN_INVALID — token inconnu', async () => {
    const prisma = getPrisma();
    prisma.refreshToken.findUnique.mockResolvedValueOnce(null);

    const res = await supertest(app.server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'unknown-token' })
      .expect(401);

    expect(res.body.error.code).toBe('REFRESH_TOKEN_INVALID');
  });

  it('401 + révocation cascade — double-soumission d\'un token révoqué', async () => {
  const prisma = getPrisma();
  // Token déjà révoqué (revokedAt != null)
  prisma.refreshToken.findUnique.mockResolvedValueOnce({
    ...mockRefreshToken,
    revokedAt: new Date('2026-01-01'),
  });
  prisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 3 });

  const res = await supertest(app.server)
    .post('/api/v1/auth/refresh')
    .send({ refreshToken: 'revoked-token' })
    .expect(401);

  expect(res.body.error.code).toBe('REFRESH_TOKEN_INVALID');
  // Vérifier que TOUS les tokens du user ont été révoqués
  expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
    where: { userId: mockUser.id, revokedAt: null },
    data: { revokedAt: expect.any(Date) },
  });
});

it('401 REFRESH_TOKEN_INVALID — token expiré', async () => {
  const prisma = getPrisma();
  prisma.refreshToken.findUnique.mockResolvedValueOnce({
    ...mockRefreshToken,
    expiresAt: new Date('2020-01-01'), // passé
  });
  prisma.refreshToken.update.mockResolvedValueOnce({});

  const res = await supertest(app.server)
    .post('/api/v1/auth/refresh')
    .send({ refreshToken: 'expired-token' })
    .expect(401);

  expect(res.body.error.code).toBe('REFRESH_TOKEN_INVALID');
});
});

// ── GET /me ─────────────────────────────────────────────────────────────────

describe('GET /api/v1/me', () => {
  it('200 — retourne le profil du user authentifié', async () => {
    const { AuthService } = await import('../../application/auth.service');
    const authService     = new AuthService();
    const token           = authService.generateAccessToken(mockUser.id, mockUser.tier);

    const prisma = getPrisma();
    prisma.user.findUnique.mockResolvedValueOnce(mockUser);

    const res = await supertest(app.server)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.id).toBe(mockUser.id);
    expect(res.body.data.email).toBe(mockUser.email);
    expect(res.body.data.tier).toBe('free');    // normalisé en lowercase
  });

  it('401 TOKEN_INVALID — header Authorization absent', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/me')
      .expect(401);

    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  it('401 TOKEN_EXPIRED — token expiré', async () => {
    const jwt   = await import('jsonwebtoken');
    const token = jwt.sign(
      { sub: mockUser.id, tier: mockUser.tier },
      process.env['JWT_SECRET']!,
      { expiresIn: -1 },   // expiré immédiatement
    );

    const res = await supertest(app.server)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });
});

// ── PATCH /me ───────────────────────────────────────────────────────────────

describe('PATCH /api/v1/me', () => {
  it('200 — met à jour le displayName', async () => {
    const { AuthService } = await import('../../application/auth.service');
    const token           = new AuthService().generateAccessToken(mockUser.id, mockUser.tier);

    const prisma = getPrisma();
    prisma.user.findUnique
      .mockResolvedValueOnce(mockUser)                                           // premier findById
      .mockResolvedValueOnce({ ...mockUser, displayName: 'Marc Updated' });      // rechargement
    prisma.user.update.mockResolvedValueOnce({});

    const res = await supertest(app.server)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: 'Marc Updated' })
      .expect(200);

    expect(res.body.data.displayName).toBe('Marc Updated');
  });

  it('400 VALIDATION_ERROR — displayName trop court', async () => {
    const { AuthService } = await import('../../application/auth.service');
    const token           = new AuthService().generateAccessToken(mockUser.id, mockUser.tier);

    const res = await supertest(app.server)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: 'X' })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
});
