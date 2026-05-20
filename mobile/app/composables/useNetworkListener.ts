import { Network } from '@capacitor/network'

export function useNetworkListener() {
  const isOnline = ref(true)
  let _listenerHandle: (() => void) | null = null

  async function init(onOnline: () => void): Promise<void> {
    const status = await Network.getStatus()
    isOnline.value = status.connected

    const handle = await Network.addListener('networkStatusChange', (status) => {
      const wasOffline = !isOnline.value
      isOnline.value = status.connected

      if (wasOffline && status.connected) {
        onOnline()
      }
    })

    _listenerHandle = () => handle.remove()
  }

  function destroy(): void {
    _listenerHandle?.()
    _listenerHandle = null
  }

  return {
    isOnline: readonly(isOnline),
    init,
    destroy,
  }
}
