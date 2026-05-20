import { App } from '@capacitor/app'
import { Network } from '@capacitor/network'

export function useAppLifecycle() {
  let _listenerHandle: (() => void) | null = null

  async function init(
    workspaceId: string,
    onForeground: () => void,
    onBackground: () => void
  ): Promise<void> {
    await _resumePendingTasks(workspaceId)

    const handle = await App.addListener('appStateChange', async (state) => {
      const networkStatus = await Network.getStatus()

      if (state.isActive) {
        if (networkStatus.connected) onForeground()
        await _resumePendingTasks(workspaceId)
      } else {
        onBackground()
        await _suspendOcrQueue()
      }
    })

    _listenerHandle = () => handle.remove()
  }

  async function _resumePendingTasks(workspaceId: string): Promise<void> {
    console.debug('[AppLifecycle] Resuming pending tasks for workspace:', workspaceId)
  }

  async function _suspendOcrQueue(): Promise<void> {
    const db = useDatabaseService()
    await db.execute(
      `UPDATE documents SET ocrStatus = 'pending' WHERE ocrStatus = 'processing'`,
      []
    )
    console.debug('[AppLifecycle] OCR queue suspended')
  }

  function destroy(): void {
    _listenerHandle?.()
    _listenerHandle = null
  }

  return { init, destroy }
}
