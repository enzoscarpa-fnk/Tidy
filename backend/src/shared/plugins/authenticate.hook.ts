import type { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../../modules/auth/application/auth.service';
import { TokenInvalidError } from '../errors/domain-errors';

const authService = new AuthService();

/**
 * Hook onRequest — vérifie le Bearer token JWT et injecte request.user.
 *
 * Usage sur une route :
 *   fastify.get('/me', { onRequest: [authenticate] }, handler)
 *
 * Usage sur un plugin entier (toutes les routes) :
 *   fastify.addHook('onRequest', authenticate)
 */
export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers['authorization'];

  // 1. Header absent ou mal formé → 401 TOKEN_INVALID
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new TokenInvalidError();
  }

  const token = authHeader.slice(7).trim(); // "Bearer " = 7 chars

  if (!token) {
    throw new TokenInvalidError();
  }

  // 2. Vérification signature + expiration
  //    Lance TokenExpiredError (401) ou TokenInvalidError (401) si invalide
  const payload = authService.verifyAccessToken(token);

  // 3. Injection dans request.user — disponible dans tous les handlers suivants
  request.user = {
    sub:  payload.sub,
    tier: payload.tier,
  };
}
