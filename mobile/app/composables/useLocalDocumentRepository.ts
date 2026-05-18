// Repository local SQLite pour les documents.
// Mappe les rows SQLite ↔ types domaine (DocumentListItem, DocumentDetail).
// Utilisé par le DocumentStore en mode offline et par le SyncService (Phase 11).
//
// Conventions de mapping :
//   - snake_case en SQLite → camelCase en domaine
//   - JSON strings (tags, entities) → parsed au read, stringified au write
//   - Dates : ISO 8601 strings dans les deux sens

import type {
  DocumentDetail,
  DocumentFilters,
  DocumentIntelligence,
  DocumentListItem,
  DocumentMetadata,
  DetectedType,
  ExtractedEntity,
  ProcessingStatus,
  TextExtractionMethod,
} from '~/types/api'

// ── Types internes ─────────────────────────────────────────────────────────

/**
 * Shape d'une row SQLite brute retournée par @capacitor-community/sqlite.
 * Tous les champs sont string | number | null côté SQLite.
 */
interface DocumentRow {
  id: string
  workspace_id: string
  title: string
  original_filename: string
  mime_type: string
  file_size_bytes: number
  processing_status: string
  thumbnail_url: string | null
  local_path: string | null
  cloud_key: string | null
  detected_type: string | null
  suggested_tags: string | null       // JSON string
  global_confidence: number | null
  extracted_entities: string | null   // JSON string
  user_tags: string                   // JSON string, default '[]'
  notes: string | null
  user_override_type: string | null
  last_edited_at: string | null
  extracted_text: string | null
  text_extraction_method: string | null
  page_count: number | null
  ocr_status: string
  sync_status: string
  uploaded_at: string
  updated_at: string
  client_updated_at: string
  is_deleted: number                  // 0 | 1
}

/**
 * Payload pour upsertDocumentFromCloud — shape reçue du backend après sync pull.
 * Sous-ensemble de DocumentDetail enrichi des champs de sync.
 */
export interface CloudDocumentPayload extends DocumentListItem {
  extractedText?: string | null
  textExtractionMethod?: TextExtractionMethod | null
  pageCount?: number | null
  clientUpdatedAt: string
}

// ── Mappers privés ─────────────────────────────────────────────────────────

function _parseJsonArray<T>(json: string | null, fallback: T[] = []): T[] {
  if (!json) return fallback
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function _rowToIntelligence(row: DocumentRow): DocumentIntelligence | null {
  if (!row.detected_type) return null
  return {
    detectedType: row.detected_type as DetectedType,
    suggestedTags: _parseJsonArray<string>(row.suggested_tags),
    globalConfidenceScore: row.global_confidence ?? 0,
    extractedEntities: _parseJsonArray<ExtractedEntity>(row.extracted_entities),
  }
}

function _rowToMetadata(row: DocumentRow): DocumentMetadata {
  return {
    userTags: _parseJsonArray<string>(row.user_tags),
    notes: row.notes,
    userOverrideType: (row.user_override_type as DetectedType | null) ?? null,
    lastEditedAt: row.last_edited_at,
  }
}

function _rowToListItem(row: DocumentRow): DocumentListItem {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    processingStatus: row.processing_status as ProcessingStatus,
    thumbnailUrl: row.thumbnail_url,
    intelligence: _rowToIntelligence(row),
    metadata: _rowToMetadata(row),
    uploadedAt: row.uploaded_at,
    updatedAt: row.updated_at,
  }
}

function _rowToDetail(row: DocumentRow): DocumentDetail {
  return {
    ..._rowToListItem(row),
    uploadedBy: '',              // non stocké localement
    pageCount: row.page_count,
    textExtractionMethod: (row.text_extraction_method as TextExtractionMethod | null),
    extractedText: row.extracted_text,
    downloadUrl: row.local_path ?? '', // chemin local en offline
    processingEvents: [],        // non stockés localement (backend only)
  }
}

// ── Composable public ──────────────────────────────────────────────────────

export function useLocalDocumentRepository() {
  const { getDatabase } = useDatabaseService()

  // ── Écriture ─────────────────────────────────────────────────────────

  /**
   * Insère un nouveau document local.
   * Appelé lors d'un upload natif (Phase 13) ou d'un pull initial.
   */
  async function insertDocument(doc: DocumentListItem & {
    localPath?: string
    ocrStatus?: string
    syncStatus?: string
    clientUpdatedAt?: string
  }): Promise<void> {
    const db = getDatabase()
    const now = new Date().toISOString()

    await db.run(
      `INSERT INTO documents (
        id, workspace_id, title, original_filename, mime_type, file_size_bytes,
        processing_status, thumbnail_url, local_path,
        detected_type, suggested_tags, global_confidence, extracted_entities,
        user_tags, notes, user_override_type, last_edited_at,
        ocr_status, sync_status,
        uploaded_at, updated_at, client_updated_at, is_deleted
      ) VALUES (
                 ?, ?, ?, ?, ?, ?,
                 ?, ?, ?,
                 ?, ?, ?, ?,
                 ?, ?, ?, ?,
                 ?, ?,
                 ?, ?, ?, 0
               )`,
      [
        doc.id,
        doc.workspaceId,
        doc.title,
        doc.originalFilename,
        doc.mimeType,
        doc.fileSizeBytes,
        doc.processingStatus,
        doc.thumbnailUrl ?? null,
        doc.localPath ?? null,
        doc.intelligence?.detectedType ?? null,
        doc.intelligence ? JSON.stringify(doc.intelligence.suggestedTags) : null,
        doc.intelligence?.globalConfidenceScore ?? null,
        doc.intelligence ? JSON.stringify(doc.intelligence.extractedEntities) : null,
        JSON.stringify(doc.metadata?.userTags ?? []),
        doc.metadata?.notes ?? null,
        doc.metadata?.userOverrideType ?? null,
        doc.metadata?.lastEditedAt ?? null,
        doc.ocrStatus ?? 'none',
        doc.syncStatus ?? 'pending',
        doc.uploadedAt,
        doc.updatedAt,
        doc.clientUpdatedAt ?? now,
      ]
    )
  }

  /**
   * Récupère un document par son ID.
   * Retourne null si introuvable ou soft-deleted.
   */
  async function getDocumentById(id: string): Promise<DocumentDetail | null> {
    const db = getDatabase()
    const result = await db.query(
      `SELECT * FROM documents WHERE id = ? AND is_deleted = 0 LIMIT 1`,
      [id]
    )
    const rows = (result.values ?? []) as DocumentRow[]
    if (rows.length === 0) return null
    const row = rows[0]
    if (!row) return null
    return _rowToDetail(row)
  }

  /**
   * Récupère tous les documents d'un workspace avec filtres optionnels.
   * Tri par updated_at DESC par défaut.
   */
  async function getAllDocuments(
    workspaceId: string,
    filters: Pick<DocumentFilters, 'status' | 'detectedType' | 'userTags' | 'sortBy' | 'sortOrder'> = {}
  ): Promise<DocumentListItem[]> {
    const db = getDatabase()

    const conditions: string[] = [
      'workspace_id = ?',
      'is_deleted = 0',
    ]
    const params: (string | number)[] = [workspaceId]

    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status]
      conditions.push(`processing_status IN (${statuses.map(() => '?').join(',')})`)
      params.push(...statuses)
    }

    if (filters.detectedType) {
      const types = Array.isArray(filters.detectedType)
        ? filters.detectedType
        : [filters.detectedType]
      conditions.push(`detected_type IN (${types.map(() => '?').join(',')})`)
      params.push(...types)
    }

    // Filtre userTags : vérifie que chaque tag demandé est dans le JSON array
    if (filters.userTags?.length) {
      for (const tag of filters.userTags) {
        conditions.push(`user_tags LIKE ?`)
        params.push(`%"${tag}"%`)
      }
    }

    const sortColumn =
      filters.sortBy === 'title' ? 'title' :
        filters.sortBy === 'updatedAt' ? 'updated_at' :
          'updated_at'

    const sortDir = filters.sortOrder === 'asc' ? 'ASC' : 'DESC'

    const sql = `
      SELECT * FROM documents
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${sortColumn} ${sortDir}
    `

    const result = await db.query(sql, params)
    const rows = (result.values ?? []) as DocumentRow[]
    return rows.map(_rowToListItem)
  }

  /**
   * Met à jour les champs metadata éditables par l'utilisateur.
   * Utilisé par DocumentStore.updateDocument() en mode offline.
   */
  async function updateDocument(
    id: string,
    fields: {
      title?: string
      userTags?: string[]
      notes?: string | null
      userOverrideType?: string | null
      processingStatus?: ProcessingStatus
      thumbnailUrl?: string | null
      ocrStatus?: string
      syncStatus?: string
      extractedText?: string | null
      detectedType?: string | null
      suggestedTags?: string[] | null
      globalConfidence?: number | null
      extractedEntities?: ExtractedEntity[] | null
    }
  ): Promise<void> {
    const db = getDatabase()
    const setClauses: string[] = []
    const params: (string | number | null)[] = []
    const now = new Date().toISOString()

    if (fields.title !== undefined) {
      setClauses.push('title = ?')
      params.push(fields.title)
    }
    if (fields.userTags !== undefined) {
      setClauses.push('user_tags = ?')
      params.push(JSON.stringify(fields.userTags))
    }
    if (fields.notes !== undefined) {
      setClauses.push('notes = ?')
      params.push(fields.notes)
    }
    if (fields.userOverrideType !== undefined) {
      setClauses.push('user_override_type = ?')
      params.push(fields.userOverrideType)
    }
    if (fields.processingStatus !== undefined) {
      setClauses.push('processing_status = ?')
      params.push(fields.processingStatus)
    }
    if (fields.thumbnailUrl !== undefined) {
      setClauses.push('thumbnail_url = ?')
      params.push(fields.thumbnailUrl)
    }
    if (fields.ocrStatus !== undefined) {
      setClauses.push('ocr_status = ?')
      params.push(fields.ocrStatus)
    }
    if (fields.syncStatus !== undefined) {
      setClauses.push('sync_status = ?')
      params.push(fields.syncStatus)
    }
    if (fields.extractedText !== undefined) {
      setClauses.push('extracted_text = ?')
      params.push(fields.extractedText)
    }
    if (fields.detectedType !== undefined) {
      setClauses.push('detected_type = ?')
      params.push(fields.detectedType)
    }
    if (fields.suggestedTags !== undefined) {
      setClauses.push('suggested_tags = ?')
      params.push(fields.suggestedTags ? JSON.stringify(fields.suggestedTags) : null)
    }
    if (fields.globalConfidence !== undefined) {
      setClauses.push('global_confidence = ?')
      params.push(fields.globalConfidence)
    }
    if (fields.extractedEntities !== undefined) {
      setClauses.push('extracted_entities = ?')
      params.push(fields.extractedEntities ? JSON.stringify(fields.extractedEntities) : null)
    }

    if (setClauses.length === 0) return

    // Toujours mettre à jour updated_at + client_updated_at
    setClauses.push('updated_at = ?', 'client_updated_at = ?', 'last_edited_at = ?')
    params.push(now, now, now)
    params.push(id)

    await db.run(
      `UPDATE documents SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    )
  }

  /**
   * Soft-delete : marque le document comme supprimé sans l'effacer du disque.
   * Le SyncService utilisera cette entrée pour pousser le delete vers le backend.
   */
  async function softDeleteDocument(id: string): Promise<void> {
    const db = getDatabase()
    const now = new Date().toISOString()
    await db.run(
      `UPDATE documents
       SET is_deleted = 1, sync_status = 'pending', updated_at = ?, client_updated_at = ?
       WHERE id = ?`,
      [now, now, id]
    )
  }

  /**
   * Retourne les documents en attente d'OCR (ocr_status = 'pending').
   * Utilisé par useSyncService.processOcrQueue() (Phase 11).
   */
  async function getPendingOcrDocuments(): Promise<DocumentListItem[]> {
    const db = getDatabase()
    const result = await db.query(
      `SELECT * FROM documents
       WHERE ocr_status = 'pending' AND is_deleted = 0
       ORDER BY uploaded_at ASC`
    )
    const rows = (result.values ?? []) as DocumentRow[]
    return rows.map(_rowToListItem)
  }

  /**
   * Upsert LWW (Last Write Wins) depuis un payload cloud.
   * - Si le document n'existe pas → INSERT
   * - Si cloud.clientUpdatedAt > local.client_updated_at → UPDATE
   * - Sinon → SKIP (local plus récent)
   *
   * Retourne le résultat de l'opération.
   */
  async function upsertDocumentFromCloud(
    payload: CloudDocumentPayload
  ): Promise<'created' | 'updated' | 'skipped'> {
    const db = getDatabase()

    // Vérifier si le document existe localement
    const existing = await db.query(
      `SELECT id, client_updated_at FROM documents WHERE id = ? LIMIT 1`,
      [payload.id]
    )
    const rows = existing.values as { id: string; client_updated_at: string }[] | undefined

    if (!rows || rows.length === 0) {
      // Nouveau document → INSERT
      await insertDocument({
        ...payload,
        localPath: undefined,
        ocrStatus: 'none',
        syncStatus: 'synced',
        clientUpdatedAt: payload.clientUpdatedAt,
      })
      return 'created'
    }

    const existingRow = rows[0]
    if (!existingRow) return 'skipped'

    const localTs = existingRow.client_updated_at
    if (payload.clientUpdatedAt <= localTs) {
      return 'skipped'
    }

    // Cloud plus récent → UPDATE
    await updateDocument(payload.id, {
      title: payload.title,
      processingStatus: payload.processingStatus,
      thumbnailUrl: payload.thumbnailUrl,
      userTags: payload.metadata?.userTags,
      notes: payload.metadata?.notes,
      userOverrideType: payload.metadata?.userOverrideType,
      detectedType: payload.intelligence?.detectedType,
      suggestedTags: payload.intelligence?.suggestedTags,
      globalConfidence: payload.intelligence?.globalConfidenceScore,
      extractedEntities: payload.intelligence?.extractedEntities,
      extractedText: payload.extractedText,
      syncStatus: 'synced',
    })

    // Si soft-deleted côté cloud → propager le delete local
    if (payload.processingStatus === 'ARCHIVED') {
      await db.run(
        `UPDATE documents SET is_deleted = 0 WHERE id = ?`,
        [payload.id]
      )
    }

    return 'updated'
  }

  /**
   * Recherche full-text locale via FTS5.
   * Tokenizer unicode61 : gère les accents et majuscules automatiquement.
   * Les triggers SQLite maintiennent l'index à jour — aucune logique manuelle requise.
   *
   * Retourne les résultats triés par pertinence (rank FTS5, plus pertinent = valeur plus négative).
   */
  async function searchDocuments(
    workspaceId: string,
    query: string
  ): Promise<DocumentListItem[]> {
    const db = getDatabase()

    // Sanitiser la query FTS5 :
    // - Échapper les guillemets doubles (opérateur de phrase FTS5)
    // - Ajouter * pour la recherche par préfixe (ex: "fact" trouve "facture")
    const sanitized = query
      .trim()
      .replace(/"/g, '""')    // échapper les guillemets FTS5
      .replace(/\*/g, '')     // supprimer les wildcards utilisateur
      .split(/\s+/)           // découper en tokens
      .filter(Boolean)
      .map((token) => `"${token}"*`)  // préfixe sur chaque token
      .join(' ')

    if (!sanitized) return []

    const result = await db.query(
      `SELECT d.*
     FROM documents d
     INNER JOIN documents_fts fts ON d.rowid = fts.rowid
     WHERE fts.documents_fts MATCH ?
       AND d.workspace_id = ?
       AND d.is_deleted = 0
     ORDER BY fts.rank`,
      [sanitized, workspaceId]
    )

    const rows = (result.values ?? []) as DocumentRow[]
    return rows.map(_rowToListItem)
  }

  return {
    insertDocument,
    getDocumentById,
    getAllDocuments,
    updateDocument,
    softDeleteDocument,
    getPendingOcrDocuments,
    upsertDocumentFromCloud,
    searchDocuments,
  }
}
