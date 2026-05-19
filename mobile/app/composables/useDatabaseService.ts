import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite'

// ── Constantes ─────────────────────────────────────────────────────────────

const DB_NAME = 'tidy'
const DB_VERSION = 1
const ENCRYPTION_KEY_STORAGE_KEY = 'tidy_db_encryption_key'

// ── Singleton ──────────────────────────────────────────────────────────────

let _sqlite: SQLiteConnection | null = null
let _db: SQLiteDBConnection | null = null
let _initialized = false

// ── DDL complet ────────────────────────────────────────────────────────────

const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      -- ── app_state : config locale et curseur de sync ─────────────────────
      CREATE TABLE IF NOT EXISTS app_state (
        key   TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );

      -- ── documents : cache local du Document aggregate ────────────────────
      CREATE TABLE IF NOT EXISTS documents (
        id                     TEXT PRIMARY KEY NOT NULL,
        workspace_id           TEXT NOT NULL,
        title                  TEXT NOT NULL,
        original_filename      TEXT NOT NULL,
        mime_type              TEXT NOT NULL,
        file_size_bytes        INTEGER NOT NULL DEFAULT 0,
        processing_status      TEXT NOT NULL DEFAULT 'PENDING_UPLOAD',
        thumbnail_url          TEXT,
        local_path             TEXT,
        cloud_key              TEXT,

        -- DocumentIntelligence (READ-ONLY, pipeline auto)
        detected_type          TEXT,
        suggested_tags         TEXT,   -- JSON array
        global_confidence      REAL,
        extracted_entities     TEXT,   -- JSON array

        -- DocumentMetadata (éditable utilisateur)
        user_tags              TEXT    NOT NULL DEFAULT '[]', -- JSON array
        notes                  TEXT,
        user_override_type     TEXT,
        last_edited_at         TEXT,

        -- Texte extrait (FTS source)
        extracted_text         TEXT,
        text_extraction_method TEXT,
        page_count             INTEGER,

        -- Sync & timestamps
        ocr_status             TEXT    NOT NULL DEFAULT 'none',
        sync_status            TEXT    NOT NULL DEFAULT 'pending',
        uploaded_at            TEXT    NOT NULL,
        updated_at             TEXT    NOT NULL,
        client_updated_at      TEXT    NOT NULL,
        is_deleted             INTEGER NOT NULL DEFAULT 0
      );

      -- ── Index sur documents ───────────────────────────────────────────────
      CREATE INDEX IF NOT EXISTS idx_documents_workspace
        ON documents (workspace_id, is_deleted, updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_documents_sync_status
        ON documents (sync_status, is_deleted);

      CREATE INDEX IF NOT EXISTS idx_documents_ocr_status
        ON documents (ocr_status)
        WHERE ocr_status = 'pending';

      -- ── FTS5 : recherche plein texte locale ───────────────────────────────
      CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts
        USING fts5(
          id UNINDEXED,
          title,
          extracted_text,
          user_tags,
          notes,
          content=documents,
          content_rowid=rowid,
          tokenize='unicode61 remove_diacritics 1'
        );

      -- ── Triggers FTS5 ────────────────────────────────────────────────────
      CREATE TRIGGER IF NOT EXISTS documents_fts_insert
        AFTER INSERT ON documents BEGIN
          INSERT INTO documents_fts (rowid, id, title, extracted_text, user_tags, notes)
          VALUES (new.rowid, new.id, new.title, new.extracted_text, new.user_tags, new.notes);
        END;

      CREATE TRIGGER IF NOT EXISTS documents_fts_update
        AFTER UPDATE ON documents BEGIN
          INSERT INTO documents_fts (documents_fts, rowid, id, title, extracted_text, user_tags, notes)
          VALUES ('delete', old.rowid, old.id, old.title, old.extracted_text, old.user_tags, old.notes);
          INSERT INTO documents_fts (rowid, id, title, extracted_text, user_tags, notes)
          VALUES (new.rowid, new.id, new.title, new.extracted_text, new.user_tags, new.notes);
        END;

      CREATE TRIGGER IF NOT EXISTS documents_fts_delete
        AFTER DELETE ON documents BEGIN
          INSERT INTO documents_fts (documents_fts, rowid, id, title, extracted_text, user_tags, notes)
          VALUES ('delete', old.rowid, old.id, old.title, old.extracted_text, old.user_tags, old.notes);
        END;

      -- ── share_links ───────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS share_links (
        id            TEXT PRIMARY KEY NOT NULL,
        document_id   TEXT NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
        token         TEXT NOT NULL UNIQUE,
        expires_at    TEXT NOT NULL,
        is_revoked    INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_share_links_document
        ON share_links (document_id);

      -- ── sync_log : journal des opérations en attente ──────────────────────
      CREATE TABLE IF NOT EXISTS sync_log (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id   TEXT NOT NULL,
        operation     TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'pending',
        error_message TEXT,
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_sync_log_pending
        ON sync_log (status, operation)
        WHERE status = 'pending';

      -- ── local_logs ────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS local_logs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        level      TEXT    NOT NULL,
        context    TEXT    NOT NULL,
        message    TEXT    NOT NULL,
        payload    TEXT,
        created_at TEXT    NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
]

// ── Helpers privés ─────────────────────────────────────────────────────────

function _generateEncryptionKey(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function _getOrCreateEncryptionKey(): Promise<string> {
  const storage = useSecureStorage()
  const existing = await storage.getItem(ENCRYPTION_KEY_STORAGE_KEY)
  if (existing) return existing
  const newKey = _generateEncryptionKey()
  await storage.setItem(ENCRYPTION_KEY_STORAGE_KEY, newKey)
  return newKey
}

async function _getSchemaVersion(db: SQLiteDBConnection): Promise<number> {
  try {
    const result = await db.query(
      `SELECT value FROM app_state WHERE key = 'schema_version' LIMIT 1`
    )
    if (result.values && result.values.length > 0) {
      return parseInt(result.values[0].value, 10)
    }
  } catch {
    // app_state n'existe pas encore — base vierge
  }
  return 0
}

async function _setSchemaVersion(db: SQLiteDBConnection, version: number): Promise<void> {
  await db.run(
    `INSERT INTO app_state (key, value) VALUES ('schema_version', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [version.toString()]
  )
}

async function _runMigrations(db: SQLiteDBConnection): Promise<void> {
  const currentVersion = await _getSchemaVersion(db)

  const pending = MIGRATIONS.filter((m) => m.version > currentVersion).sort(
    (a, b) => a.version - b.version
  )

  if (pending.length === 0) {
    if (import.meta.dev) console.info(`[DB] Schéma à jour (v${currentVersion})`)
    return
  }

  for (const migration of pending) {
    if (import.meta.dev) console.info(`[DB] Migration v${migration.version} en cours…`)
    await db.execute(migration.sql)
    await _setSchemaVersion(db, migration.version)
    if (import.meta.dev) console.info(`[DB] Migration v${migration.version} appliquée ✓`)
  }
}

// ── API publique ───────────────────────────────────────────────────────────

export function useDatabaseService() {
  function _getDb(): SQLiteDBConnection {
    if (!_db || !_initialized) {
      throw new Error('[DB] Base non initialisée. Appeler initDatabase() au démarrage.')
    }
    return _db
  }

  // ── Cycle de vie ──────────────────────────────────────────────────────────

  async function initDatabase(): Promise<void> {
    if (_initialized) return
    if (!import.meta.client) return

    try {
      const { Capacitor } = await import('@capacitor/core')
      if (!Capacitor.isNativePlatform()) {
        if (import.meta.dev) console.info('[DB] Plateforme web détectée — SQLite natif ignoré.')
        return
      }

      const encryptionKey = await _getOrCreateEncryptionKey()
      // Note : encryptionKey est utilisé dans createConnection — conservé pour la doc
      void encryptionKey

      _sqlite = new SQLiteConnection(CapacitorSQLite)

      const { result: isAvailable } = await _sqlite.checkConnectionsConsistency()
      if (!isAvailable) {
        throw new Error('[DB] Connexions SQLite incohérentes détectées au démarrage.')
      }

      _db = await _sqlite.createConnection(DB_NAME, true, 'secret', DB_VERSION, false)
      await _db.open()
      await _runMigrations(_db)

      _initialized = true
      if (import.meta.dev) console.info(`[DB] Base "${DB_NAME}" initialisée ✓`)
    } catch (err) {
      console.error('[DB] Erreur initialisation SQLite :', err)
      throw err
    }
  }

  function getDatabase(): SQLiteDBConnection {
    return _getDb()
  }

  async function closeDatabase(): Promise<void> {
    if (!_db || !_sqlite) return
    try {
      await _db.close()
      await _sqlite.closeConnection(DB_NAME, false)
      _db = null
      _initialized = false
      if (import.meta.dev) console.info('[DB] Connexion SQLite fermée proprement.')
    } catch (err) {
      console.error('[DB] Erreur fermeture SQLite :', err)
    }
  }

  async function resetDatabase(): Promise<void> {
    if (!_db || !_sqlite) return
    try {
      await _db.delete()
    } catch (err) {
      console.error('[DB] Erreur suppression base :', err)
    }
    await _sqlite.closeConnection(DB_NAME, false)
    const storage = useSecureStorage()
    await storage.removeItem(ENCRYPTION_KEY_STORAGE_KEY)
    _db = null
    _sqlite = null
    _initialized = false
    if (import.meta.dev) console.info('[DB] Base supprimée et clé de chiffrement effacée.')
  }

  // ── app_state ─────────────────────────────────────────────────────────────

  async function getAppState(key: string): Promise<string | null> {
    const db = _getDb()
    const result = await db.query(
      `SELECT value FROM app_state WHERE key = ? LIMIT 1`,
      [key]
    )
    return result.values?.[0]?.value ?? null
  }

  async function setAppState(key: string, value: string): Promise<void> {
    const db = _getDb()
    await db.run(
      `INSERT INTO app_state (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value]
    )
  }

  // ── sync_log ──────────────────────────────────────────────────────────────

  async function addSyncLogEntry(
    documentId: string,
    operation: 'upload' | 'update_meta' | 'delete',
    _extra?: { localPath?: string; mimeType?: string; fileSizeBytes?: number }
  ): Promise<void> {
    const db = _getDb()
    await db.run(
      `INSERT INTO sync_log (document_id, operation, status, created_at, updated_at)
       VALUES (?, ?, 'pending', datetime('now'), datetime('now'))`,
      [documentId, operation]
    )
  }

  async function getPendingSyncLogEntries(...operations: string[]): Promise<any[]> {
    const db = _getDb()
    const placeholders = operations.map(() => '?').join(', ')
    const result = await db.query(
      `SELECT sl.*, d.mime_type, d.local_path, d.file_size_bytes
       FROM sync_log sl
       JOIN documents d ON d.id = sl.document_id
       WHERE sl.status = 'pending'
         AND sl.operation IN (${placeholders})
       ORDER BY sl.created_at ASC`,
      operations
    )
    return result.values ?? []
  }

  async function updateSyncLogEntry(
    id: number,
    status: 'done' | 'error' | 'in_progress',
    errorMessage?: string
  ): Promise<void> {
    const db = _getDb()
    await db.run(
      `UPDATE sync_log
       SET status = ?, error_message = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [status, errorMessage ?? null, id]
    )
  }

  async function getSyncLogByDocument(docId: string): Promise<any[]> {
    const db = _getDb()
    const result = await db.query(
      `SELECT * FROM sync_log WHERE document_id = ? ORDER BY created_at DESC`,
      [docId]
    )
    return result.values ?? []
  }

  // ── Return ────────────────────────────────────────────────────────────────

  return {
    initDatabase,
    getDatabase,
    closeDatabase,
    resetDatabase,
    // app_state
    getAppState,
    setAppState,
    // sync_log
    addSyncLogEntry,
    getPendingSyncLogEntries,
    updateSyncLogEntry,
    getSyncLogByDocument,
  }
}
