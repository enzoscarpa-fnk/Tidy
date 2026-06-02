import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockDb = {
  open:    vi.fn().mockResolvedValue(undefined),
  close:   vi.fn().mockResolvedValue(undefined),
  delete:  vi.fn().mockResolvedValue(undefined),
  execute: vi.fn().mockResolvedValue(undefined),
  run:     vi.fn().mockResolvedValue(undefined),
  query:   vi.fn().mockResolvedValue({ values: [] }),
}

const mockSqlite = {
  // Appelé après _getOrCreateEncryptionKey()
  setEncryptionSecret:          vi.fn().mockResolvedValue(undefined),
  // Vérification cohérence des connexions existantes
  checkConnectionsConsistency:  vi.fn().mockResolvedValue({ result: true }),
  // Renvoie false → passe par createConnection (chemin nominal des tests)
  isConnection:                 vi.fn().mockResolvedValue({ result: false }),
  // Chemin alternatif : connexion déjà ouverte
  retrieveConnection:           vi.fn().mockResolvedValue(mockDb),
  // Chemin nominal
  createConnection:             vi.fn().mockResolvedValue(mockDb),
  // Fermeture propre
  closeConnection:              vi.fn().mockResolvedValue(undefined),
}

vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {},
  SQLiteConnection:   vi.fn().mockImplementation(() => mockSqlite),
  SQLiteDBConnection: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn().mockReturnValue(true),
    getPlatform:      vi.fn().mockReturnValue('ios'),
  },
}))

vi.mock('capacitor-secure-storage-plugin', () => ({
  SecureStoragePlugin: {
    set:    vi.fn(),
    get:    vi.fn().mockRejectedValue(new Error('not found')),
    remove: vi.fn(),
  },
}))

// ── Import après mocks ─────────────────────────────────────────────────────

async function freshService() {
  vi.resetModules()
  const mod = await import('~/composables/useDatabaseService')
  return mod.useDatabaseService()
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('useDatabaseService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Rétablir toutes les valeurs après clearAllMocks
    mockSqlite.setEncryptionSecret.mockResolvedValue(undefined)
    mockSqlite.checkConnectionsConsistency.mockResolvedValue({ result: true })
    mockSqlite.isConnection.mockResolvedValue({ result: false })
    mockSqlite.retrieveConnection.mockResolvedValue(mockDb)
    mockSqlite.createConnection.mockResolvedValue(mockDb)
    mockSqlite.closeConnection.mockResolvedValue(undefined)
    mockDb.open.mockResolvedValue(undefined)
    mockDb.close.mockResolvedValue(undefined)
    mockDb.delete.mockResolvedValue(undefined)
    mockDb.execute.mockResolvedValue(undefined)
    mockDb.run.mockResolvedValue(undefined)
    mockDb.query.mockResolvedValue({ values: [] })
  })

  describe('initDatabase()', () => {
    it('initialise la connexion SQLite et exécute les migrations', async () => {
      const { initDatabase } = await freshService()
      await initDatabase()

      expect(mockSqlite.createConnection).toHaveBeenCalledWith(
        'tidy', true, 'secret', 1, false
      )
      expect(mockDb.open).toHaveBeenCalledOnce()
      expect(mockDb.run).toHaveBeenCalled()
      expect(mockDb.run).toHaveBeenLastCalledWith(
        expect.stringContaining('schema_version'),
        ['1']
      )
    })

    it('est idempotent — un second appel ne réouvre pas la connexion', async () => {
      const { initDatabase } = await freshService()
      await initDatabase()
      await initDatabase()

      expect(mockDb.open).toHaveBeenCalledOnce()
    })

    it('applique les migrations manquantes (version 0 → 1)', async () => {
      // Base vierge : schema_version absente
      mockDb.query.mockResolvedValueOnce({ values: [] })

      const { initDatabase } = await freshService()
      await initDatabase()

      expect(mockDb.run).toHaveBeenCalledTimes(15)
      expect(mockDb.run).toHaveBeenLastCalledWith(
        expect.stringContaining('schema_version'),
        ['1']
      )
    })

    it('ne réapplique pas une migration déjà effectuée (idempotence migrations)', async () => {
      // schema_version = 1 déjà en base → aucune migration pending
      mockDb.query.mockResolvedValueOnce({ values: [{ value: '1' }] })

      const { initDatabase } = await freshService()
      await initDatabase()

      expect(mockDb.run).not.toHaveBeenCalled()
    })

    it('ne s\'initialise pas sur la plateforme web', async () => {
      const { Capacitor } = await import('@capacitor/core')
      vi.mocked(Capacitor.isNativePlatform).mockReturnValueOnce(false)

      const { initDatabase } = await freshService()
      await initDatabase()

      expect(mockSqlite.createConnection).not.toHaveBeenCalled()
    })
  })

  describe('getDatabase()', () => {
    it('retourne la connexion active après initDatabase()', async () => {
      const { initDatabase, getDatabase } = await freshService()
      await initDatabase()

      expect(() => getDatabase()).not.toThrow()
    })

    it('throw si appelé avant initDatabase()', async () => {
      const { getDatabase } = await freshService()

      expect(() => getDatabase()).toThrow('[DB] Base non initialisée')
    })
  })

  describe('closeDatabase()', () => {
    it('ferme proprement la connexion', async () => {
      const { initDatabase, closeDatabase } = await freshService()
      await initDatabase()
      await closeDatabase()

      expect(mockDb.close).toHaveBeenCalledOnce()
      expect(mockSqlite.closeConnection).toHaveBeenCalledWith('tidy', false)
    })

    it('est silencieux si la DB n\'est pas initialisée', async () => {
      const { closeDatabase } = await freshService()
      await expect(closeDatabase()).resolves.not.toThrow()
    })
  })

  describe('resetDatabase()', () => {
    it('supprime la base et efface la clé de chiffrement', async () => {
      const { initDatabase, resetDatabase } = await freshService()
      await initDatabase()
      await resetDatabase()

      expect(mockDb.delete).toHaveBeenCalledOnce()
      expect(mockSqlite.closeConnection).toHaveBeenCalledWith('tidy', false)
    })
  })
})
