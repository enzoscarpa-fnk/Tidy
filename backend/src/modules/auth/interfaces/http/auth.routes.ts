import type { FastifyPluginAsync } from 'fastify';
import { UserRepositoryAdapter } from '../../../../infra/database/repositories/user.repository.adapter';
import { RefreshTokenRepositoryAdapter } from '../../../../infra/database/repositories/refresh-token.repository.adapter';
import { AuthService } from '../../application/auth.service';
import {
  EmailAlreadyExistsError,
  InvalidCredentialsError,
  RefreshTokenInvalidError,
} from '../../../../shared/errors/domain-errors';
import { createSuccessResponse } from '../../../../shared/response.helpers';

// ── JSON Schemas ──────────────────────────────────────────────────────────────

const registerBodySchema = {
  type: 'object',
  required: ['email', 'password', 'displayName'],
  additionalProperties: false,
  properties: {
    email:       { type: 'string', format: 'email' },
    password:    { type: 'string', minLength: 8 },
    displayName: { type: 'string', minLength: 2, maxLength: 100 },
  },
} as const;

const loginBodySchema = {
  type: 'object',
  required: ['email', 'password'],
  additionalProperties: false,
  properties: {
    email:    { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 1 },
  },
} as const;

const refreshBodySchema = {
  type: 'object',
  required: ['refreshToken'],
  additionalProperties: false,
  properties: {
    refreshToken: { type: 'string', minLength: 1 },
  },
} as const;

// ── Types body ────────────────────────────────────────────────────────────────

interface RegisterBody {
  email: string;
  password: string;
  displayName: string;
}

interface LoginBody {
  email: string;
  password: string;
}

interface RefreshBody {
  refreshToken: string;
}

// ── Plugin ────────────────────────────────────────────────────────────────────

const authRoutes: FastifyPluginAsync = async (fastify) => {
  const userRepo         = new UserRepositoryAdapter(fastify.prisma);
  const refreshTokenRepo = new RefreshTokenRepositoryAdapter(fastify.prisma);
  const authService      = new AuthService();

  // ── POST /api/v1/auth/register ────────────────────────────────────────────

  fastify.post<{ Body: RegisterBody }>('/register', {
    schema: { body: registerBodySchema },
    handler: async (request, reply) => {
      const { email, password, displayName } = request.body;

      const normalizedEmail = email.toLowerCase().trim();

      const existing = await userRepo.findByEmail(normalizedEmail);
      if (existing) throw new EmailAlreadyExistsError();

      const passwordHash = await authService.hashPassword(password);

      const user = await userRepo.create({
        email: normalizedEmail,
        passwordHash,
        displayName: displayName.trim(),
      });

      const defaultWorkspace = await fastify.prisma.workspace.create({
        data: { ownerId: user.id, name: 'Mon espace' },
      });

      const tokenPair = authService.generateTokenPair(user.id, user.tier);

      await refreshTokenRepo.create(
        user.id,
        authService.hashToken(tokenPair.refreshToken),
        tokenPair.refreshTokenExpiresAt,
      );

      return reply.status(201).send(
        createSuccessResponse({
          user: {
            id:          user.id,
            email:       user.email,
            displayName: user.displayName,
            createdAt:   user.createdAt,
          },
          tokens: {
            accessToken:  tokenPair.accessToken,
            refreshToken: tokenPair.refreshToken,
            expiresIn:    tokenPair.expiresIn,
          },
          defaultWorkspace: {
            id:   defaultWorkspace.id,
            name: defaultWorkspace.name,
          },
        }),
      );
    },
  });

  // ── POST /api/v1/auth/login ───────────────────────────────────────────────

  fastify.post<{ Body: LoginBody }>('/login', {
    schema: { body: loginBodySchema },
    handler: async (request, reply) => {
      const { email, password } = request.body;

      const normalizedEmail = email.toLowerCase().trim();

      const user = await userRepo.findByEmail(normalizedEmail);
      if (!user) throw new InvalidCredentialsError();

      const isValid = await authService.verifyPassword(password, user.passwordHash);
      if (!isValid) throw new InvalidCredentialsError();

      const tokenPair = authService.generateTokenPair(user.id, user.tier);

      await refreshTokenRepo.create(
        user.id,
        authService.hashToken(tokenPair.refreshToken),
        tokenPair.refreshTokenExpiresAt,
      );

      return reply.status(200).send(
        createSuccessResponse({
          user: {
            id:          user.id,
            email:       user.email,
            displayName: user.displayName,
          },
          tokens: {
            accessToken:  tokenPair.accessToken,
            refreshToken: tokenPair.refreshToken,
            expiresIn:    tokenPair.expiresIn,
          },
        }),
      );
    },
  });

  // ── POST /api/v1/auth/refresh ─────────────────────────────────────────────

  fastify.post<{ Body: RefreshBody }>('/refresh', {
    schema: { body: refreshBodySchema },
    handler: async (request, reply) => {
      const { refreshToken } = request.body;

      // 1. Hasher le token reçu pour le lookup en DB (jamais de valeur brute en DB)
      const tokenHash = authService.hashToken(refreshToken);
      const record    = await refreshTokenRepo.findByHash(tokenHash);

      // 2. Token inconnu → 401
      if (!record) throw new RefreshTokenInvalidError();

      // 3. Token déjà révoqué → détection de vol potentiel
      //    Révoquer TOUS les tokens de l'utilisateur + log incident
      if (record.revokedAt !== null) {
        request.log.warn(
          { userId: record.userId, tokenId: record.id },
          'Security: revoked refresh token re-submitted — revoking all user tokens',
        );
        await refreshTokenRepo.revokeAllForUser(record.userId);
        throw new RefreshTokenInvalidError();
      }

      // 4. Token expiré → 401
      if (record.expiresAt < new Date()) {
        await refreshTokenRepo.revoke(record.id);
        throw new RefreshTokenInvalidError();
      }

      // 5. Révoquer l'ancien token (rotation obligatoire)
      await refreshTokenRepo.revoke(record.id);

      // 6. Charger le user pour récupérer son tier actuel
      const user = await userRepo.findById(record.userId);
      if (!user) throw new RefreshTokenInvalidError();

      // 7. Générer une nouvelle paire et stocker le hash du nouveau refresh token
      const tokenPair = authService.generateTokenPair(user.id, user.tier);

      await refreshTokenRepo.create(
        user.id,
        authService.hashToken(tokenPair.refreshToken),
        tokenPair.refreshTokenExpiresAt,
      );

      return reply.status(200).send(
        createSuccessResponse({
          tokens: {
            accessToken:  tokenPair.accessToken,
            refreshToken: tokenPair.refreshToken,
            expiresIn:    tokenPair.expiresIn,
          },
        }),
      );
    },
  });
};

export default authRoutes;
