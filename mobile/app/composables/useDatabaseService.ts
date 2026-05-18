// Initialise la base SQLite chiffrée AES-256 et exécute les migrations.
// La clé de chiffrement est générée au premier lancement et persistée
// dans iOS Keychain / Android Keystore via useSecureStorage.
//
// Pattern singleton : une seule instance de connexion par session.
// Appeler initDatabase() au démarrage (plugin Nuxt), puis utiliser
// getDatabase() dans les autres composables.

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

/**
 * Schéma SQLite complet v1.
 * Ref : 03-technical-design-document.md §3.1 + §3.2
 */
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
      -- tokenizer unicode61 : gère les accents, majuscules, caractères spéciaux
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

      -- ── Triggers FTS5 : maintien automatique de l'index ──────────────────
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

      -- ── share_links : cache local des liens de partage ────────────────────
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

      -- ── sync_log : journal des opérations en attente d'upload ─────────────
      -- operation : 'upload' | 'update_meta' | 'delete'
      -- status    : 'pending' | 'in_progress' | 'done' | 'error'
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

      -- ── local_logs : logs d'erreurs locaux (debug / support) ─────────────
      CREATE TABLE IF NOT EXISTS local_logs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        level      TEXT    NOT NULL,  -- 'info' | 'warn' | 'error'
        context    TEXT    NOT NULL,
        message    TEXT    NOT NULL,
        payload    TEXT,              -- JSON optionnel
        created_at TEXT    NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
]

// ── Helpers privés ─────────────────────────────────────────────────────────

/**
 * Génère une clé de chiffrement cryptographiquement sûre (256 bits, base64url).
 * Utilisée uniquement au premier lancement.
 */
function _generateEncryptionKey(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Récupère la clé de chiffrement depuis le secure storage.
 * Si absente (premier lancement), en génère une nouvelle et la persiste.
 */
async function _getOrCreateEncryptionKey(): Promise<string> {
  const storage = useSecureStorage()
  const existing = await storage.getItem(ENCRYPTION_KEY_STORAGE_KEY)
  if (existing) return existing

  const newKey = _generateEncryptionKey()
  await storage.setItem(ENCRYPTION_KEY_STORAGE_KEY, newKey)
  return newKey
}

/**
 * Lit la version de schéma actuelle depuis app_state.
 * Retourne 0 si la table est vide (base fraîchement créée).
 */
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

/**
 * Met à jour la version de schéma dans app_state.
 */
async function _setSchemaVersion(db: SQLiteDBConnection, version: number): Promise<void> {
  await db.run(
    `INSERT INTO app_state (key, value) VALUES ('schema_version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [version.toString()]
  )
}

/**
 * Exécute les migrations manquantes dans l'ordre croissant.
 * Idempotent : une migration déjà appliquée n'est jamais ré-exécutée.
 */
async function _runMigrations(db: SQLiteDBConnection): Promise<void> {
  const currentVersion = await _getSchemaVersion(db)

  const pending = MIGRATIONS.filter((m) => m.version > currentVersion).sort(
    (a, b) => a.version - b.version
  )

  if (pending.length === 0) {
    if (import.meta.dev) {
      console.info(`[DB] Schéma à jour (v${currentVersion})`)
    }
    return
  }

  for (const migration of pending) {
    if (import.meta.dev) {
      console.info(`[DB] Migration v${migration.version} en cours…`)
    }

    await db.execute(migration.sql)
    await _setSchemaVersion(db, migration.version)

    if (import.meta.dev) {
      console.info(`[DB] Migration v${migration.version} appliquée ✓`)
    }
  }
}

// ── API publique ───────────────────────────────────────────────────────────

export function useDatabaseService() {
  /**
   * Initialise la connexion SQLite chiffrée et exécute les migrations.
   * Doit être appelé une seule fois au démarrage de l'app.
   * Appels suivants : retourne immédiatement (guard _initialized).
   */
  async function initDatabase(): Promise<void> {
    if (_initialized) return
    if (!import.meta.client) return

    try {
      // ── Guard plateforme EN PREMIER — avant toute interaction SQLite ──────
      // Sur web (Chrome/Safari dev), @capacitor-community/sqlite requiert
      // l'élément DOM <jeep-sqlite> qui n'est pas présent en mode Nuxt SPA.
      // La DB SQLite est une feature native uniquement — pas de fallback web.
      const { Capacitor } = await import('@capacitor/core')
      if (!Capacitor.isNativePlatform()) {
        if (import.meta.dev) {
          console.info('[DB] Plateforme web détectée — SQLite natif ignoré.')
        }
        return
      }

      // ── Init SQLite (natif uniquement) ────────────────────────────────────
      const encryptionKey = await _getOrCreateEncryptionKey()

      _sqlite = new SQLiteConnection(CapacitorSQLite)

      const { result: isAvailable } = await _sqlite.checkConnectionsConsistency()

      if (!isAvailable) {
        throw new Error('[DB] Connexions SQLite incohérentes détectées au démarrage.')
      }

      _db = await _sqlite.createConnection(
        DB_NAME,
        true,
        'secret',
        DB_VERSION,
        false
      )

      await _db.open()
      await _runMigrations(_db)

      _initialized = true

      if (import.meta.dev) {
        console.info(`[DB] Base "${DB_NAME}" initialisée et migrations appliquées ✓`)
      }
    } catch (err) {
      console.error('[DB] Erreur initialisation SQLite :', err)
      throw err
    }
  }

  /**
   * Retourne la connexion active.
   * Throw si initDatabase() n'a pas été appelé au préalable.
   */
  function getDatabase(): SQLiteDBConnection {
    if (!_db || !_initialized) {
      throw new Error(
        '[DB] Base non initialisée. Appeler initDatabase() au démarrage de l\'app.'
      )
    }
    return _db
  }

  /**
   * Ferme proprement la connexion SQLite.
   * À appeler lors du unmount de l'app (appStateChange → background profond).
   */
  async function closeDatabase(): Promise<void> {
    if (!_db || !_sqlite) return
    try {
      await _db.close()
      await _sqlite.closeConnection(DB_NAME, false)
      _db = null
      _initialized = false
      if (import.meta.dev) {
        console.info('[DB] Connexion SQLite fermée proprement.')
      }
    } catch (err) {
      console.error('[DB] Erreur fermeture SQLite :', err)
    }
  }

  /**
   * Réinitialise complètement la base (logout / reset account).
   * Supprime la base et la clé de chiffrement du secure storage.
   * DESTRUCTIF — irréversible.
   */
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

    if (import.meta.dev) {
      console.info('[DB] Base supprimée et clé de chiffrement effacée.')
    }
  }


  return {
    initDatabase,
    getDatabase,
    closeDatabase,
    resetDatabase,
  }
}
