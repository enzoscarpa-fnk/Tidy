import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'crypto';
import type { UserTier } from '../../user/domain/user.entity';
import { TokenExpiredError, TokenInvalidError } from '../../../shared/errors/domain-errors';

// ── Constantes ────────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_TTL = '1h';
const ACCESS_TOKEN_TTL_SECONDS = 3600;
const REFRESH_TOKEN_TTL_DAYS = 30;

// ── Types publics ─────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string;      // userId
  tier: UserTier;
  iat: number;
  exp: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;   // valeur brute (hex) — à stocker hashé en DB
  expiresIn: number;      // secondes
  refreshTokenExpiresAt: Date;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class AuthService {
  private readonly jwtSecret: string;

  constructor() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET env variable is required');
    }
    this.jwtSecret = secret;
  }

  // ── Password ─────────────────────────────────────────────────────────────

  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
  }

  async verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  // ── Access Token JWT HS256 ────────────────────────────────────────────────

  generateAccessToken(userId: string, tier: UserTier): string {
    return jwt.sign(
      { sub: userId, tier },
      this.jwtSecret,
      { algorithm: 'HS256', expiresIn: ACCESS_TOKEN_TTL },
    );
  }

  /**
   * Vérifie et décode un access token.
   * Lance TokenExpiredError ou TokenInvalidError si invalide.
   */
  verifyAccessToken(token: string): JwtPayload {
    // Import inline pour éviter la dépendance circulaire avec le plugin d'erreurs
    try {
      return jwt.verify(token, this.jwtSecret, { algorithms: ['HS256'] }) as JwtPayload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new TokenExpiredError();
      }
      throw new TokenInvalidError();
    }
  }

  // ── Refresh Token ─────────────────────────────────────────────────────────

  /**
   * Génère un refresh token brut (hex, 64 chars = 256 bits d'entropie).
   * Ne jamais stocker cette valeur brute en DB — utiliser hashToken().
   */
  generateRefreshToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Hash SHA-256 d'un token pour stockage sécurisé en DB.
   * Utilisé pour refresh tokens ET share tokens.
   */
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Génère une paire complète access + refresh token.
   * Retourne le refreshToken en clair (à envoyer au client)
   * et refreshTokenExpiresAt (à stocker en DB).
   */
  generateTokenPair(userId: string, tier: UserTier): TokenPair {
    const accessToken = this.generateAccessToken(userId, tier);
    const refreshToken = this.generateRefreshToken();

    const refreshTokenExpiresAt = new Date();
    refreshTokenExpiresAt.setDate(refreshTokenExpiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenExpiresAt,
    };
  }
}
