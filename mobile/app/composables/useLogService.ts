import { Capacitor } from '@capacitor/core'

export type LogLevel   = 'debug' | 'info' | 'warn' | 'error'
export type LogContext = 'OCR' | 'SYNC' | 'CRYPTO' | 'SHARE' | 'UI'

export interface LogEntry {
  id:         number
  level:      LogLevel
  context:    LogContext
  message:    string
  payload:    string | null
  created_at: string
}

const LOG_RETENTION_DAYS = 7

export function useLogService() {

  /**
   * Tente de récupérer la connexion DB.
   * Retourne null silencieusement si la DB n'est pas encore initialisée
   * ou si on est sur plateforme web — les logs ne doivent jamais crasher l'app.
   */
  function _tryGetDb() {
    if (!Capacitor.isNativePlatform()) return null
    try {
      const { getDatabase } = useDatabaseService()
      return getDatabase()
    } catch {
      return null
    }
  }

  // ── Écriture ────────────────────────────────────────────────────────────────

  async function log(
    level:    LogLevel,
    context:  LogContext,
    message:  string,
    payload?: unknown,
  ): Promise<void> {
    const db = _tryGetDb()
    if (!db) return

    try {
      await db.run(
        `INSERT INTO local_logs (level, context, message, payload)
         VALUES (?, ?, ?, ?)`,
        [level, context, message, payload != null ? JSON.stringify(payload) : null],
      )
    } catch {
      // Silencieux — un log raté ne doit jamais impacter le flux principal
    }
  }

  // ── Purge auto ───────────────────────────────────────────────────────────────

  /**
   * Supprime les logs de plus de LOG_RETENTION_DAYS jours.
   * Appelé une fois au démarrage de l'app (app.vue onMounted).
   * Les logs ne quittent jamais le device.
   */
  async function purgeOldLogs(): Promise<void> {
    const db = _tryGetDb()
    if (!db) return

    try {
      await db.run(
        `DELETE FROM local_logs WHERE created_at < datetime('now', ?)`,
        [`-${LOG_RETENTION_DAYS} days`],
      )
      if (import.meta.dev) {
        console.debug(`[LogService] Logs de plus de ${LOG_RETENTION_DAYS} jours purgés`)
      }
    } catch (err) {
      console.warn('[LogService] Purge échouée :', err)
    }
  }

  // ── Lecture (debug / diagnostic) ─────────────────────────────────────────────

  async function getLogs(options: {
    level?:   LogLevel
    context?: LogContext
    limit?:   number
  } = {}): Promise<LogEntry[]> {
    const db = _tryGetDb()
    if (!db) return []

    const conditions: string[]       = []
    const params:     (string | number)[] = []

    if (options.level) {
      conditions.push('level = ?')
      params.push(options.level)
    }
    if (options.context) {
      conditions.push('context = ?')
      params.push(options.context)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    params.push(options.limit ?? 100)

    try {
      const result = await db.query(
        `SELECT * FROM local_logs ${where} ORDER BY created_at DESC LIMIT ?`,
        params,
      )
      return (result.values ?? []) as LogEntry[]
    } catch {
      return []
    }
  }

  return { log, purgeOldLogs, getLogs }
}
