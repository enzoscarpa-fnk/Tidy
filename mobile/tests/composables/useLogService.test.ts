import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useLogService } from '~/composables/useLogService'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockRun   = vi.fn()
const mockQuery = vi.fn()

const { mockIsNative } = vi.hoisted(() => ({
  mockIsNative: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mockIsNative },
}))

vi.mock('~/composables/useDatabaseService', () => ({
  useDatabaseService: () => ({
    getDatabase: () => ({ run: mockRun, query: mockQuery }),
  }),
}))

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useLogService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsNative.mockReturnValue(true)
    mockRun.mockResolvedValue(undefined)
    mockQuery.mockResolvedValue({ values: [] })
  })

  describe('log()', () => {
    it('insère une entrée dans local_logs avec les bons champs', async () => {
      const { log } = useLogService()
      await log('info', 'SYNC', 'Sync démarrée', { workspaceId: 'ws-1' })

      expect(mockRun).toHaveBeenCalledOnce()
      // log() appelle db.run(), pas db.query()
      const [sql, params] = (mockRun.mock.calls.at(0) ?? []) as [string, (string | null)[]]
      expect(sql).toContain('INSERT INTO local_logs')
      expect(params[0]).toBe('info')
      expect(params[1]).toBe('SYNC')
      expect(params[2]).toBe('Sync démarrée')
      expect(params[3]).toContain('ws-1')
    })

    it('insère null comme payload si aucun payload fourni', async () => {
      const { log } = useLogService()
      await log('warn', 'OCR', 'OCR timeout')

      // log() appelle db.run(), pas db.query()
      const [, params] = (mockRun.mock.calls.at(0) ?? []) as [string, (string | null)[]]
      expect(params[3]).toBeNull()
    })

    it('ne fait rien sur plateforme web', async () => {
      mockIsNative.mockReturnValue(false)
      const { log } = useLogService()
      await log('error', 'CRYPTO', 'Erreur chiffrement')

      expect(mockRun).not.toHaveBeenCalled()
    })

    it('est silencieux si db.run() lève une erreur', async () => {
      mockRun.mockRejectedValue(new Error('SQLite error'))
      const { log } = useLogService()

      await expect(log('debug', 'UI', 'Test')).resolves.not.toThrow()
    })
  })

  describe('purgeOldLogs()', () => {
    it('exécute un DELETE avec le bon seuil de rétention (7 jours)', async () => {
      const { purgeOldLogs } = useLogService()
      await purgeOldLogs()

      expect(mockRun).toHaveBeenCalledOnce()
      const [sql, params] = (mockRun.mock.calls.at(0) ?? []) as [string, string[]]
      expect(sql).toContain('DELETE FROM local_logs')
      expect(sql).toContain('datetime(')
      expect(params[0]).toBe('-7 days')
    })

    it('ne fait rien sur plateforme web', async () => {
      mockIsNative.mockReturnValue(false)
      const { purgeOldLogs } = useLogService()
      await purgeOldLogs()

      expect(mockRun).not.toHaveBeenCalled()
    })

    it('est silencieux si db.run() lève une erreur', async () => {
      mockRun.mockRejectedValue(new Error('SQLite error'))
      const { purgeOldLogs } = useLogService()

      await expect(purgeOldLogs()).resolves.not.toThrow()
    })
  })

  describe('getLogs()', () => {
    it('retourne les logs sans filtre', async () => {
      const fakeRows = [
        { id: 1, level: 'info', context: 'SYNC', message: 'ok', payload: null, created_at: '2026-05-28' },
      ]
      mockQuery.mockResolvedValue({ values: fakeRows })

      const { getLogs } = useLogService()
      const result = await getLogs()

      expect(result).toEqual(fakeRows)
      const [sql] = (mockQuery.mock.calls.at(0) ?? []) as [string]
      expect(sql).toContain('SELECT * FROM local_logs')
    })

    it('filtre par level et context', async () => {
      mockQuery.mockResolvedValue({ values: [] })
      const { getLogs } = useLogService()
      await getLogs({ level: 'error', context: 'CRYPTO' })

      const [sql, params] = (mockQuery.mock.calls.at(0) ?? []) as [string, (string | number)[]]
      expect(sql).toContain('level = ?')
      expect(sql).toContain('context = ?')
      expect(params).toContain('error')
      expect(params).toContain('CRYPTO')
    })

    it('retourne un tableau vide sur plateforme web', async () => {
      mockIsNative.mockReturnValue(false)
      const { getLogs } = useLogService()
      const result = await getLogs()

      expect(result).toEqual([])
      expect(mockQuery).not.toHaveBeenCalled()
    })
  })
})
