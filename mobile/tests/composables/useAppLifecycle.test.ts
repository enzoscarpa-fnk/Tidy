import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAppLifecycle } from '~/composables/useAppLifecycle'

const { mockAppAddListener, mockNetworkGetStatus, mockDbExecute } = vi.hoisted(() => ({
  mockAppAddListener: vi.fn(),
  mockNetworkGetStatus: vi.fn(),
  mockDbExecute: vi.fn(),
}))

vi.mock('@capacitor/app', () => ({
  App: { addListener: mockAppAddListener },
}))

vi.mock('@capacitor/network', () => ({
  Network: { getStatus: mockNetworkGetStatus },
}))

vi.mock('~/composables/useDatabaseService', () => ({
  useDatabaseService: () => ({ execute: mockDbExecute }),
}))

describe('useAppLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNetworkGetStatus.mockResolvedValue({ connected: true })
    mockAppAddListener.mockResolvedValue({ remove: vi.fn() })
    mockDbExecute.mockResolvedValue(undefined)
  })

  it('devrait déclencher onForeground au passage en foreground avec réseau', async () => {
    const onForeground = vi.fn()
    const onBackground = vi.fn()
    let stateCallback!: (state: { isActive: boolean }) => void

    mockAppAddListener.mockImplementation((_event: string, cb: any) => {
      stateCallback = cb
      return Promise.resolve({ remove: vi.fn() })
    })

    const { init } = useAppLifecycle()
    await init('ws-1', onForeground, onBackground)

    stateCallback({ isActive: true })
    await Promise.resolve() // flush microtasks

    expect(onForeground).toHaveBeenCalledTimes(1)
  })

  it('devrait déclencher onBackground lors du passage en arrière-plan', async () => {
    const onForeground = vi.fn()
    const onBackground = vi.fn()
    let stateCallback!: (state: { isActive: boolean }) => void

    mockAppAddListener.mockImplementation((_event: string, cb: any) => {
      stateCallback = cb
      return Promise.resolve({ remove: vi.fn() })
    })

    const { init } = useAppLifecycle()
    await init('ws-1', onForeground, onBackground)

    stateCallback({ isActive: false })
    await Promise.resolve()

    expect(onBackground).toHaveBeenCalledTimes(1)
  })

  it('devrait suspendre la queue OCR au passage en background (_suspendOcrQueue)', async () => {
    let stateCallback!: (state: { isActive: boolean }) => void

    mockAppAddListener.mockImplementation((_event: string, cb: any) => {
      stateCallback = cb
      return Promise.resolve({ remove: vi.fn() })
    })

    const { init } = useAppLifecycle()
    await init('ws-1', vi.fn(), vi.fn())

    stateCallback({ isActive: false })
    await new Promise((r) => setTimeout(r, 10))

    expect(mockDbExecute).toHaveBeenCalledWith(
      expect.stringContaining("ocrStatus = 'pending'"),
      [],
    )
  })

  it('ne devrait PAS déclencher onForeground si le réseau est absent', async () => {
    mockNetworkGetStatus.mockResolvedValue({ connected: false })

    const onForeground = vi.fn()
    let stateCallback!: (state: { isActive: boolean }) => void

    mockAppAddListener.mockImplementation((_event: string, cb: any) => {
      stateCallback = cb
      return Promise.resolve({ remove: vi.fn() })
    })

    const { init } = useAppLifecycle()
    await init('ws-1', onForeground, vi.fn())

    stateCallback({ isActive: true })
    await Promise.resolve()

    expect(onForeground).not.toHaveBeenCalled()
  })

  it('devrait retirer le listener lors de destroy()', async () => {
    const removeSpy = vi.fn()
    mockAppAddListener.mockResolvedValue({ remove: removeSpy })

    const { init, destroy } = useAppLifecycle()
    await init('ws-1', vi.fn(), vi.fn())
    destroy()

    expect(removeSpy).toHaveBeenCalled()
  })
})
