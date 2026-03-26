import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

// ── vi.hoisted : variables disponibles dès le hoist ───────────────────────

const { mockNavigateTo, mockRefreshTokens, mockAuthStore } = vi.hoisted(() => {
  const mockNavigateTo = vi.fn((path: string) => path)
  const mockRefreshTokens = vi.fn()
  const mockAuthStore = {
    isAuthenticated: false,
    accessToken: null as string | null,
    refreshToken: null as string | null,
    user: null,
    refreshTokens: mockRefreshTokens,
  }
  return { mockNavigateTo, mockRefreshTokens, mockAuthStore }
})

mockNuxtImport('navigateTo', () => mockNavigateTo)
mockNuxtImport('useAuthStore', () => () => mockAuthStore)

// ── Helper ─────────────────────────────────────────────────────────────────

async function callMiddleware(path: string) {
  const { default: middleware } = await import('../../app/middleware/auth.global')
  return middleware({ path, fullPath: path } as never, {} as never)
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('middleware/auth.global', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthStore.isAuthenticated = false
    mockAuthStore.accessToken = null
    mockAuthStore.refreshToken = null
  })

  describe('Routes protégées (non authentifié)', () => {
    it('redirige vers /auth/login sur /workspace/abc-123', async () => {
      await callMiddleware('/workspace/abc-123')
      expect(mockNavigateTo).toHaveBeenCalledWith('/auth/login')
    })

    it('redirige vers /auth/login sur /profile', async () => {
      await callMiddleware('/profile')
      expect(mockNavigateTo).toHaveBeenCalledWith('/auth/login')
    })

    it('redirige vers /auth/login sur /', async () => {
      await callMiddleware('/')
      expect(mockNavigateTo).toHaveBeenCalledWith('/auth/login')
    })
  })

  describe('Routes publiques (exclues du guard)', () => {
    it('ne redirige pas sur /auth/login', async () => {
      await callMiddleware('/auth/login')
      expect(mockNavigateTo).not.toHaveBeenCalled()
    })

    it('ne redirige pas sur /auth/register', async () => {
      await callMiddleware('/auth/register')
      expect(mockNavigateTo).not.toHaveBeenCalled()
    })

    it('ne redirige pas sur /s/:token', async () => {
      await callMiddleware('/s/abc123xyz')
      expect(mockNavigateTo).not.toHaveBeenCalled()
    })
  })

  describe('Utilisateur authentifié', () => {
    it('laisse passer sur /workspace/abc-123', async () => {
      mockAuthStore.isAuthenticated = true
      await callMiddleware('/workspace/abc-123')
      expect(mockNavigateTo).not.toHaveBeenCalled()
    })
  })

  describe('Refresh silencieux', () => {
    const EXPIRED_TOKEN =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMSIsImV4cCI6MX0.invalid'

    it('tente refreshTokens si accessToken expiré + refreshToken présent', async () => {
      mockAuthStore.accessToken = EXPIRED_TOKEN
      mockAuthStore.refreshToken = 'valid-rt'
      mockRefreshTokens.mockResolvedValueOnce(undefined)
      await callMiddleware('/workspace/abc')
      expect(mockRefreshTokens).toHaveBeenCalledOnce()
    })

    it('redirige si refreshTokens échoue', async () => {
      mockAuthStore.accessToken = EXPIRED_TOKEN
      mockAuthStore.refreshToken = 'expired-rt'
      mockRefreshTokens.mockRejectedValueOnce(new Error('REFRESH_TOKEN_INVALID'))
      await callMiddleware('/workspace/abc')
      expect(mockNavigateTo).toHaveBeenCalledWith('/auth/login')
    })

    it('ne tente pas le refresh si pas de refreshToken', async () => {
      mockAuthStore.accessToken = null
      mockAuthStore.refreshToken = null
      await callMiddleware('/workspace/abc')
      expect(mockRefreshTokens).not.toHaveBeenCalled()
      expect(mockNavigateTo).toHaveBeenCalledWith('/auth/login')
    })
  })
})
