import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reactive } from 'vue'
import UploadDropzone from '~/components/UploadDropzone.vue'
import { makeFile } from '../utils/factories'

const mockUploadDocument = vi.fn()
const mockResetUpload    = vi.fn()

const mockStore = reactive({
  uploadStatus:   'idle' as 'idle' | 'uploading' | 'success' | 'error',
  uploadProgress: 0,
  uploadError:    null as string | null,
})

mockNuxtImport('useDocumentStore', () => () => ({
  uploadDocument: mockUploadDocument,
  resetUpload:    mockResetUpload,
  get uploadStatus()   { return mockStore.uploadStatus },
  get uploadProgress() { return mockStore.uploadProgress },
  get uploadError()    { return mockStore.uploadError },
}))

const mockRouterPush    = vi.fn()
const mockRouterBack    = vi.fn()
const mockRouterReplace = vi.fn()

mockNuxtImport('useRouter', () => () => ({
  push:    mockRouterPush,
  back:    mockRouterBack,
  replace: mockRouterReplace,
}))

describe('UploadDropzone', () => {

  beforeEach(() => {
    mockUploadDocument.mockReset()
    mockResetUpload.mockReset()
    mockRouterPush.mockReset()
    mockRouterReplace.mockReset()
    mockStore.uploadStatus   = 'idle'
    mockStore.uploadProgress = 0
    mockStore.uploadError    = null
  })

  it('affiche une erreur et n\'appelle PAS uploadDocument si fichier > 50 Mo', async () => {
    const wrapper = await mountSuspended(UploadDropzone, {
      props: { workspaceId: 'ws-123' },
    })

    await wrapper.vm.handleFile(makeFile('lourd.pdf', 'application/pdf', 51 * 1024 * 1024))
    await wrapper.vm.$nextTick()

    expect(mockUploadDocument).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('50 Mo')
  })

  it('affiche une erreur et n\'appelle PAS uploadDocument pour un MIME non supporté', async () => {
    const wrapper = await mountSuspended(UploadDropzone, {
      props: { workspaceId: 'ws-123' },
    })

    await wrapper.vm.handleFile(makeFile('tableau.xlsx', 'application/vnd.ms-excel', 1024))
    await wrapper.vm.$nextTick()

    expect(mockUploadDocument).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Format non supporté')
  })

  it('appelle uploadDocument avec le bon workspaceId pour un fichier valide', async () => {
    mockUploadDocument.mockResolvedValue(undefined)

    const wrapper = await mountSuspended(UploadDropzone, {
      props: { workspaceId: 'ws-abc' },
    })

    const validFile = makeFile('facture.pdf', 'application/pdf', 1 * 1024 * 1024)
    await wrapper.vm.handleFile(validFile)

    expect(mockUploadDocument).toHaveBeenCalledWith('ws-abc', validFile)
  })

  it('accepte les fichiers image/jpeg et image/png', async () => {
    mockUploadDocument.mockResolvedValue(undefined)

    const wrapper = await mountSuspended(UploadDropzone, {
      props: { workspaceId: 'ws-abc' },
    })

    await wrapper.vm.handleFile(makeFile('scan.jpg', 'image/jpeg', 500_000))
    expect(mockUploadDocument).toHaveBeenCalledTimes(1)

    await wrapper.vm.handleFile(makeFile('scan.png', 'image/png', 500_000))
    expect(mockUploadDocument).toHaveBeenCalledTimes(2)
  })

  it('affiche UploadProgressBar quand uploadStatus !== "idle"', async () => {
    mockStore.uploadStatus   = 'uploading'
    mockStore.uploadProgress = 60

    const wrapper = await mountSuspended(UploadDropzone, {
      props: { workspaceId: 'ws-123' },
    })

    expect(wrapper.find('[role="button"]').exists()).toBe(false)
  })

  it('navigue vers le dashboard workspace après uploadStatus = "success"', async () => {
    const wrapper = await mountSuspended(UploadDropzone, {
      props: { workspaceId: 'ws-redirect' },
    })

    mockStore.uploadStatus = 'success'
    await wrapper.vm.$nextTick()

    expect(mockRouterPush).toHaveBeenCalledWith('/workspace/ws-redirect')
  })
})
