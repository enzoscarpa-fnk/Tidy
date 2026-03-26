import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSecureStorage } from '~/composables/useSecureStorage'

// vi.mock est automatiquement hissé (hoisted) avant les imports — ordre garanti
vi.mock('capacitor-secure-storage-plugin', () => ({
  SecureStoragePlugin: {
    set: vi.fn(),
    get: vi.fn(),
    remove: vi.fn(),
  },
}))

// ── Tests ──────────────────────────────────────────────────────────────────

describe('useSecureStorage (env web — fallback sessionStorage)', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('stocke et récupère une valeur', async () => {
    const { setItem, getItem } = useSecureStorage()
    await setItem('tidy_refresh_token', 'my-refresh-token')
    const value = await getItem('tidy_refresh_token')
    expect(value).toBe('my-refresh-token')
  })

  it('retourne null pour une clé inexistante', async () => {
    const { getItem } = useSecureStorage()
    const value = await getItem('nonexistent_key')
    expect(value).toBeNull()
  })

  it('supprime correctement une valeur', async () => {
    const { setItem, getItem, removeItem } = useSecureStorage()
    await setItem('key_to_delete', 'some_value')
    await removeItem('key_to_delete')
    const value = await getItem('key_to_delete')
    expect(value).toBeNull()
  })

  describe('Persistance du refreshToken JWT', () => {
    const REFRESH_TOKEN_KEY = 'tidy_refresh_token'
    const JWT_REFRESH = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMSJ9.signature'

    it('persiste le refreshToken', async () => {
      const { setItem, getItem } = useSecureStorage()
      await setItem(REFRESH_TOKEN_KEY, JWT_REFRESH)
      expect(await getItem(REFRESH_TOKEN_KEY)).toBe(JWT_REFRESH)
    })

    it('écrase un refreshToken existant avec le nouveau', async () => {
      const { setItem, getItem } = useSecureStorage()
      await setItem(REFRESH_TOKEN_KEY, 'old-token')
      await setItem(REFRESH_TOKEN_KEY, JWT_REFRESH)
      expect(await getItem(REFRESH_TOKEN_KEY)).toBe(JWT_REFRESH)
    })

    it('supprime le refreshToken au logout', async () => {
      const { setItem, getItem, removeItem } = useSecureStorage()
      await setItem(REFRESH_TOKEN_KEY, JWT_REFRESH)
      await removeItem(REFRESH_TOKEN_KEY)
      expect(await getItem(REFRESH_TOKEN_KEY)).toBeNull()
    })

    it('isole les clés les unes des autres', async () => {
      const { setItem, getItem } = useSecureStorage()
      await setItem('tidy_access_token', 'access-abc')
      await setItem('tidy_refresh_token', 'refresh-xyz')
      expect(await getItem('tidy_access_token')).toBe('access-abc')
      expect(await getItem('tidy_refresh_token')).toBe('refresh-xyz')
    })
  })
})
