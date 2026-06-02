import { App } from '@capacitor/app'
import { Network } from '@capacitor/network'
import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'

type ForegroundCallback = () => void | Promise<void>
type BackgroundCallback = () => void | Promise<void>

interface SharedInboxManifest {
  id: string
  filename: string
  mimeType: string
  title?: string
  fileSizeBytes: number
  sharedAt: string
  binaryFilename: string
}

const IOS_SHARE_STAGING_FOLDER     = 'tidy_share_inbox'
const ANDROID_SHARE_STAGING_FOLDER = 'tidy_share_inbox'
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set<string>([
  'application/pdf',
  'image/jpeg',
  'image/png',
])

export function useAppLifecycle() {
  let _listenerHandle: (() => void) | null = null
  let _isInitialized = false
  let _isImportingSharedFiles = false

  async function init(
    workspaceId: string,
    onForeground: ForegroundCallback,
    onBackground: BackgroundCallback
  ): Promise<void> {
    if (_isInitialized) return

    await _resumePendingTasks(workspaceId)

    const handle = await App.addListener('appStateChange', async (state) => {
      const networkStatus = await Network.getStatus()

      if (state.isActive) {
        await _resumePendingTasks(workspaceId)
        if (networkStatus.connected) {
          await onForeground()
        }
      } else {
        await onBackground()
        await _suspendOcrQueue()
      }
    })

    _listenerHandle = () => handle.remove()
    _isInitialized = true
  }

  async function _resumePendingTasks(workspaceId: string): Promise<void> {
    const effectiveWorkspaceId = _resolveWorkspaceId(workspaceId)

    if (!effectiveWorkspaceId) {
      console.debug('[AppLifecycle] Pas de workspace sélectionné, tâches ignorées')
      return
    }

    console.debug('[AppLifecycle] Reprise des tâches pour le workspace :', effectiveWorkspaceId)

    await _importPendingSharedFiles(effectiveWorkspaceId)

    const documentStore = useDocumentStore()
    await documentStore.refreshFromDatabase(effectiveWorkspaceId)
  }

  function _resolveWorkspaceId(initialWorkspaceId: string): string {
    const workspaceStore = useWorkspaceStore()
    return workspaceStore.currentWorkspaceId || initialWorkspaceId || ''
  }

  // ── Share inbox ─────────────────────────────────────────────────────────────

  /**
   * Retourne le Directory Capacitor adapté à la plateforme.
   *
   * iOS   → Directory.Library  (AppDelegate draine depuis App Group vers Library/)
   * Android → Directory.Data   (MainActivity écrit dans getFilesDir())
   */
  function _getInboxDirectory(): Directory {
    return Capacitor.getPlatform() === 'ios' ? Directory.Library : Directory.Data
  }

  async function _importPendingSharedFiles(workspaceId: string): Promise<void> {
    // Guard : uniquement sur device natif iOS ou Android
    if (!Capacitor.isNativePlatform()) return
    if (_isImportingSharedFiles) return

    _isImportingSharedFiles = true

    try {
      const allEntries = await _listInboxEntries()
      const manifestNames = allEntries
        .filter((name) => name.endsWith('.manifest.json'))
        .sort()

      if (manifestNames.length === 0) return

      const documentStore = useDocumentStore()
      let importedCount = 0

      for (const manifestName of manifestNames) {
        try {
          const manifest = await _readManifest(manifestName)

          if (!manifest) {
            await _deleteInboxFileIfExists(manifestName)
            continue
          }

          if (!ALLOWED_MIME_TYPES.has(manifest.mimeType)) {
            console.warn('[AppLifecycle] Type MIME non supporté, ignoré :', manifest.mimeType)
            await _cleanupImportedFiles(manifest)
            continue
          }

          if (manifest.fileSizeBytes > MAX_FILE_SIZE_BYTES) {
            console.warn('[AppLifecycle] Fichier trop lourd, ignoré :', manifest.filename)
            await _cleanupImportedFiles(manifest)
            continue
          }

          const file = await _readSharedBinaryAsFile(manifest)
          await documentStore.uploadDocument(workspaceId, file)
          await _cleanupImportedFiles(manifest)
          importedCount++
        } catch (err) {
          // Pas de cleanup en cas d'erreur : le fichier sera retenté au prochain foreground
          console.warn('[AppLifecycle] Échec import :', manifestName, err)
        }
      }

      if (importedCount > 0) {
        try {
          await documentStore.fetchDocuments(workspaceId)
          documentStore.startPolling(workspaceId)
        } catch (err) {
          console.warn('[AppLifecycle] Rafraîchissement post-import échoué :', err)
        }
      }
    } finally {
      _isImportingSharedFiles = false
    }
  }

  async function _listInboxEntries(): Promise<string[]> {
    try {
      const result = await Filesystem.readdir({
        path: IOS_SHARE_STAGING_FOLDER,
        directory: _getInboxDirectory(),
      })
      return result.files.map((e) => (typeof e === 'string' ? e : e.name))
    } catch {
      return []
    }
  }

  async function _readManifest(filename: string): Promise<SharedInboxManifest | null> {
    try {
      const result = await Filesystem.readFile({
        path: `${IOS_SHARE_STAGING_FOLDER}/${filename}`,
        directory: _getInboxDirectory(),
        encoding: Encoding.UTF8,
      })
      const raw = typeof result.data === 'string' ? result.data : ''
      return JSON.parse(raw) as SharedInboxManifest
    } catch (err) {
      console.warn('[AppLifecycle] Lecture manifest impossible :', filename, err)
      return null
    }
  }

  async function _readSharedBinaryAsFile(manifest: SharedInboxManifest): Promise<File> {
    const result = await Filesystem.readFile({
      path: `${IOS_SHARE_STAGING_FOLDER}/${manifest.binaryFilename}`,
      directory: _getInboxDirectory(),
    })

    const base64 = typeof result.data === 'string' ? result.data : ''
    const bytes = _base64ToUint8Array(base64)

    const buffer = new ArrayBuffer(bytes.length)
    new Uint8Array(buffer).set(bytes)

    return new File([buffer], manifest.filename, {
      type: manifest.mimeType,
      lastModified: Date.now(),
    })
  }

  function _base64ToUint8Array(base64: string): Uint8Array {
    const data = base64.includes(',') ? base64.substring(base64.indexOf(',') + 1) : base64
    const binary = atob(data)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }

  async function _cleanupImportedFiles(manifest: SharedInboxManifest): Promise<void> {
    await _deleteInboxFileIfExists(manifest.binaryFilename)
    await _deleteInboxFileIfExists(`${manifest.id}.manifest.json`)
  }

  async function _deleteInboxFileIfExists(filename: string): Promise<void> {
    try {
      await Filesystem.deleteFile({
        path: `${ANDROID_SHARE_STAGING_FOLDER}/${filename}`,
        directory: _getInboxDirectory(),
      })
    } catch {
      // no-op
    }
  }

  // ── OCR ─────────────────────────────────────────────────────────────────────

  async function _suspendOcrQueue(): Promise<void> {
    const db = useDatabaseService()
    await db.execute(
      `UPDATE documents SET ocr_status = 'pending' WHERE ocr_status = 'processing'`,
      []
    )
    console.debug('[AppLifecycle] Queue OCR suspendue')
  }

  // ── Public ──────────────────────────────────────────────────────────────────

  function destroy(): void {
    _listenerHandle?.()
    _listenerHandle = null
    _isInitialized = false
    _isImportingSharedFiles = false
  }

  return { init, destroy }
}
