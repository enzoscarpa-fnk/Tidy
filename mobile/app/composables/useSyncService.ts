import { useDocumentStore } from '~/stores/document'

let _isSyncing = false

export function useSyncService() {
  const db = useDatabaseService()
  const localRepo = useLocalDocumentRepository()
  const { request } = useTidyApi()
  const documentStore = useDocumentStore()

  // ── Ticket 11.1 : Pull ────────────────────────────────────────────────────

  async function pullFromCloud(workspaceId: string): Promise<void> {
    try {
      const lastSyncAt = await db.getAppState(`lastSyncAt_${workspaceId}`)
      const since = lastSyncAt ?? '1970-01-01T00:00:00.000Z'

      const sinceEncoded = encodeURIComponent(since)
      const url = `/documents/sync?since=${sinceEncoded}&workspaceId=${workspaceId}`

      const res = await request<{
        data: any[] | null
        meta: { serverTimestamp: string }
      }>(url)

      const docs: any[] | null = res?.data ?? (res as any)?.cloudDocs ?? null
      if (!docs) return

      for (const cloudDoc of docs) {
        await localRepo.upsertDocumentFromCloud(cloudDoc)
      }

      if (res?.meta?.serverTimestamp) {
        await db.setAppState(`lastSyncAt_${workspaceId}`, res.meta.serverTimestamp)
      }
    } catch (err) {
      console.warn('[SyncService] pullFromCloud error:', err)
    }
  }

  // ── Ticket 11.2 : OCR Queue ───────────────────────────────────────────────

  async function processOcrQueue(): Promise<void> {
    const pending = await localRepo.getPendingOcrDocuments()
    for (const doc of pending) {
      await _processOcr(doc)
    }
  }

  async function _processOcr(doc: any, attempt = 1): Promise<void> {
    const MAX_ATTEMPTS = 3
    const DELAYS: [number, number, number] = [0, 0, 0]

    try {
      const fileSystem = useFileSystem()
      const localPath: string = (doc as any).localPath ?? (doc as any).local_path
      const fileData = await fileSystem.readDecryptedFile(localPath)
      if (!fileData) return

      const res = await request<{ data:  { ocrText: string; confidence: number } | null }>(
        '/ocr/process',
          {
            method: 'POST',
            body: {
              documentId: doc.id,
              fileBase64: fileData,
              mimeType: (doc as any).mimeType ?? (doc as any).mime_type,
            },
          }
      )

      if (res?.data) {
        await localRepo.updateDocument(doc.id, {
          extractedText: res.data.ocrText,
          ocrStatus: 'done',
        })
      }
    } catch {
      if (attempt < MAX_ATTEMPTS) {
        await _sleep(DELAYS[attempt - 1] as number)
        await _processOcr(doc, attempt + 1)
      } else {
        await localRepo.updateDocument(doc.id, { ocrStatus: 'failed' })
      }
    }
  }

  // ── Ticket 11.3 : Upload S3 ───────────────────────────────────────────────

  async function uploadPendingFiles(): Promise<void> {
    const pending = await db.getPendingSyncLogEntries('upload')

    for (const entry of pending) {
      try {
        await db.updateSyncLogEntry(entry.id, 'in_progress')

        const presignedRes = await request<{
          data: { uploadUrl: string; s3Key: string }
      }>('/files/upload-url', {
          method: 'POST',
          body: {
            documentId: entry.documentId ?? entry.document_id,
            mimeType: entry.mimeType ?? entry.mime_type,
            fileSizeBytes: entry.fileSizeBytes ?? entry.file_size_bytes,
          },
        })

        if (!presignedRes?.data) {
          await db.updateSyncLogEntry(entry.id, 'error', 'No presigned URL returned')
          continue
        }

        const { uploadUrl, s3Key } = presignedRes.data

        const fileSystem = useFileSystem()
        const localPath: string = entry.localPath ?? entry.local_path
        const fileData = await fileSystem.readRawFile(localPath)

        if (!fileData) {
          await db.updateSyncLogEntry(entry.id, 'error', 'File not found')
          continue
        }

        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          body: fileData as BodyInit,
          headers: { 'Content-Type': 'application/octet-stream' },
        })

        if (!putRes.ok) throw new Error(`S3 PUT failed: ${putRes.status}`)

        await db.updateSyncLogEntry(entry.id, 'done')

        const docId: string = entry.documentId ?? entry.document_id
        await localRepo.updateDocument(docId, {
          syncStatus: 'synced',
          cloudKey: s3Key,
        })

      } catch (err) {
        await db.updateSyncLogEntry(entry.id, 'error', String(err))
      }
    }
  }

  // ── Ticket 11.4 : Push metadata ───────────────────────────────────────────

  async function pushToCloud(): Promise<void> {
    const pendingEntries = await db.getPendingSyncLogEntries('update_meta', 'delete')
    if (pendingEntries.length === 0) return

    const docIds = [
      ...new Set(pendingEntries.map((e: any) => e.documentId ?? e.document_id)),
    ] as string[]

    const docsToSync = await Promise.all(
      docIds.map((id) => localRepo.getDocumentById(id))
    )
    const validDocs = docsToSync.filter(Boolean)
    if (validDocs.length === 0) return

    try {
      const res = await request<{
        data: Array<{ id: string; status: string; serverUpdatedAt: string }>
    }>('/documents/sync', { method: 'POST', body: { documents: validDocs } })

      if (!res?.data) return

      for (const result of res.data) {
        const matching = pendingEntries.filter(
          (e: any) => (e.documentId ?? e.document_id) === result.id
        )
        for (const entry of matching) {
          await db.updateSyncLogEntry(entry.id, 'done')
        }
      }
    } catch (err) {
      console.warn('[SyncService] pushToCloud error:', err)
    }
  }

  // ── Orchestration ─────────────────────────────────────────────────────────

  async function syncAll(workspaceId: string): Promise<void> {
    if (_isSyncing) return
    _isSyncing = true
    try {
      await pullFromCloud(workspaceId)
      await uploadPendingFiles()
      await pushToCloud()
      await processOcrQueue()
      await documentStore.refreshFromDatabase(workspaceId)
    } finally {
      _isSyncing = false
    }
  }

  function triggerAsync(workspaceId: string): void {
    syncAll(workspaceId)
      .catch((err) => console.warn('[SyncService] triggerAsync error:', err))
  }

  function _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  return {
    isSyncing: readonly(ref(_isSyncing)),
    triggerAsync,
    syncAll,
    pullFromCloud,
    processOcrQueue,
    uploadPendingFiles,
    pushToCloud,
  }
}
