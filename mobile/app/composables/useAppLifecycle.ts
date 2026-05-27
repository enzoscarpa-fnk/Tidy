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

const IOS_APP_GROUP_ID = 'group.be.studiofnk.tidy'
const IOS_SHARE_STAGING_FOLDER = 'tidy_share_inbox'
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set([
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
      console.debug('[AppLifecycle] No workspace selected, skip pending tasks resume')
      return
    }

    console.debug('[AppLifecycle] Resuming pending tasks for workspace:', effectiveWorkspaceId)

    await _importPendingSharedFiles(effectiveWorkspaceId)

    const documentStore = useDocumentStore()
    await documentStore.refreshFromDatabase(effectiveWorkspaceId)
  }

  function _resolveWorkspaceId(initialWorkspaceId: string): string {
    const workspaceStore = useWorkspaceStore()
    return workspaceStore.currentWorkspaceId || initialWorkspaceId || ''
  }

  async function _importPendingSharedFiles(workspaceId: string): Promise<void> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return
    if (_isImportingSharedFiles) return

    _isImportingSharedFiles = true

    try {
      const inboxEntries = await _listInboxEntries()
      if (inboxEntries.length === 0) return

      const manifests = inboxEntries
        .filter((name) => name.endsWith('.manifest.json'))
        .sort()

      if (manifests.length === 0) return

      const documentStore = useDocumentStore()

      for (const manifestName of manifests) {
        try {
          const manifest = await _readManifest(manifestName)

          if (!manifest) {
            await _deleteInboxFileIfExists(manifestName)
            continue
          }

          if (!ALLOWED_MIME_TYPES.has(manifest.mimeType)) {
            console.warn('[AppLifecycle] Unsupported shared MIME type:', manifest.mimeType)
            await _cleanupImportedFiles(manifest)
            continue
          }

          if (manifest.fileSizeBytes > MAX_FILE_SIZE_BYTES) {
            console.warn('[AppLifecycle] Shared file too large:', manifest.filename)
            await _cleanupImportedFiles(manifest)
            continue
          }

          const file = await _readSharedBinaryAsFile(manifest)
          await documentStore.uploadDocument(workspaceId, file)
          await _cleanupImportedFiles(manifest)
        } catch (error) {
          console.warn('[AppLifecycle] Failed to import shared file:', manifestName, error)
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
        directory: Directory.Library,
      })

      return result.files.map((entry) =>
        typeof entry === 'string' ? entry : entry.name
      )
    } catch {
      return []
    }
  }

  async function _readManifest(filename: string): Promise<SharedInboxManifest | null> {
    try {
      const result = await Filesystem.readFile({
        path: `${IOS_SHARE_STAGING_FOLDER}/${filename}`,
        directory: Directory.Library,
        encoding: Encoding.UTF8,
      })

      const raw = typeof result.data === 'string' ? result.data : ''
      return JSON.parse(raw) as SharedInboxManifest
    } catch (error) {
      console.warn('[AppLifecycle] Unable to read manifest:', filename, error)
      return null
    }
  }

  async function _readSharedBinaryAsFile(manifest: SharedInboxManifest): Promise<File> {
    const result = await Filesystem.readFile({
      path: `${IOS_SHARE_STAGING_FOLDER}/${manifest.binaryFilename}`,
      directory: Directory.Library,
    })

    const base64 = typeof result.data === 'string' ? result.data : ''
    const bytes = _base64ToUint8Array(base64)

    const arrayBuffer = new ArrayBuffer(bytes.length)
    new Uint8Array(arrayBuffer).set(bytes)

    return new File([arrayBuffer], manifest.filename, {
      type: manifest.mimeType,
      lastModified: Date.now(),
    })
  }


  function _base64ToUint8Array(base64: string): Uint8Array {
    const normalized = base64.includes(',')
      ? base64.substring(base64.indexOf(',') + 1)
      : base64

    const binary = atob(normalized)
    const bytes = new Uint8Array(binary.length)

    for (let i = 0; i < binary.length; i += 1) {
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
        path: `${IOS_SHARE_STAGING_FOLDER}/${filename}`,
        directory: Directory.Library,
      })
    } catch {
      // no-op
    }
  }

  async function _suspendOcrQueue(): Promise<void> {
    const db = useDatabaseService()
    await db.execute(
      `UPDATE documents SET ocrstatus = 'pending' WHERE ocrstatus = 'processing'`,
      []
    )
    console.debug('[AppLifecycle] OCR queue suspended')
  }

  function destroy(): void {
    _listenerHandle?.()
    _listenerHandle = null
    _isInitialized = false
    _isImportingSharedFiles = false
  }

  return { init, destroy }
}
