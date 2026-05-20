import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useNetworkListener } from '~/composables/useNetworkListener'

const { mockAddListener, mockGetStatus } = vi.hoisted(() => ({
  mockAddListener: vi.fn(),
  mockGetStatus: vi.fn(),
}))

vi.mock('@capacitor/network', () => ({
  Network: {
    getStatus: mockGetStatus,
    addListener: mockAddListener,
  },
}))

describe('useNetworkListener', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetStatus.mockResolvedValue({ connected: true })
    mockAddListener.mockResolvedValue({ remove: vi.fn() })
  })

  it('devrait initialiser isOnline depuis le statut courant', async () => {
    mockGetStatus.mockResolvedValue({ connected: false })
    const { isOnline, init } = useNetworkListener()
    await init(() => {})
    expect(isOnline.value).toBe(false)
  })

  it('devrait appeler onOnline lorsque le réseau revient (offline → online)', async () => {
    const onOnline = vi.fn()
    let networkCallback!: (status: { connected: boolean }) => void

    mockGetStatus.mockResolvedValue({ connected: false })
    mockAddListener.mockImplementation((_event: string, cb: any) => {
      networkCallback = cb
      return Promise.resolve({ remove: vi.fn() })
    })

    const { isOnline, init } = useNetworkListener()
    await init(onOnline)

    expect(isOnline.value).toBe(false)

    // Simule retour réseau
    networkCallback({ connected: true })

    expect(onOnline).toHaveBeenCalledTimes(1)
    expect(isOnline.value).toBe(true)
  })

  it('ne devrait PAS appeler onOnline si le réseau était déjà online', async () => {
    const onOnline = vi.fn()
    let networkCallback!: (status: { connected: boolean }) => void

    mockGetStatus.mockResolvedValue({ connected: true })
    mockAddListener.mockImplementation((_event: string, cb: any) => {
      networkCallback = cb
      return Promise.resolve({ remove: vi.fn() })
    })

    const { init } = useNetworkListener()
    await init(onOnline)

    networkCallback({ connected: true }) // rester online → pas d'appel

    expect(onOnline).not.toHaveBeenCalled()
  })

  it('devrait retirer le listener lors de destroy()', async () => {
    const removeSpy = vi.fn()
    mockAddListener.mockResolvedValue({ remove: removeSpy })

    const { init, destroy } = useNetworkListener()
    await init(() => {})
    destroy()

    expect(removeSpy).toHaveBeenCalled()
  })
})
