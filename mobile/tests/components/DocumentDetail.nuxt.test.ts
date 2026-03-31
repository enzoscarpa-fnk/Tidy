import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reactive } from 'vue'
import DocumentDetail from '~/components/DocumentDetail.vue'
import {
  makeDocumentDetail,
  makeDocumentIntelligence,
  makeDocumentMetadata,
} from '../utils/factories'

const mockFetchDocument     = vi.fn()
const mockUpdateDocument    = vi.fn()
const mockArchiveDocument   = vi.fn()
const mockReprocessDocument = vi.fn()

const mockStore = reactive({
  currentDocument: null as ReturnType<typeof makeDocumentDetail> | null,
  isLoadingDetail: false,
  errorDetail:     null as string | null,
})

mockNuxtImport('useDocumentStore', () => () => ({
  get currentDocument() { return mockStore.currentDocument },
  get isLoadingDetail() { return mockStore.isLoadingDetail },
  get errorDetail()     { return mockStore.errorDetail },
  fetchDocument:     mockFetchDocument,
  updateDocument:    mockUpdateDocument,
  archiveDocument:   mockArchiveDocument,
  reprocessDocument: mockReprocessDocument,
}))

mockNuxtImport('useRouter', () => () => ({
  push:    vi.fn(),
  back:    vi.fn(),
  replace: vi.fn(),
  resolve: vi.fn((to: string) => ({ href: to, fullPath: to, path: to })),
}))

describe('DocumentDetail', () => {

  beforeEach(() => {
    mockFetchDocument.mockReset()
    mockUpdateDocument.mockReset()
    mockArchiveDocument.mockReset()
    mockReprocessDocument.mockReset()
    mockStore.currentDocument = null
    mockStore.isLoadingDetail = false
    mockStore.errorDetail     = null
  })

  it('appelle fetchDocument avec le documentId au montage', async () => {
    mockStore.currentDocument = makeDocumentDetail({ id: 'doc-xyz' })

    await mountSuspended(DocumentDetail, {
      props: { documentId: 'doc-xyz', workspaceId: 'ws-123' },
    })

    expect(mockFetchDocument).toHaveBeenCalledWith('doc-xyz')
  })

  it('n\'affiche pas FailedDocumentActions pour un document ENRICHED', async () => {
    mockStore.currentDocument = makeDocumentDetail({
      processingStatus: 'ENRICHED',
      intelligence: makeDocumentIntelligence(),
      metadata: makeDocumentMetadata(),
    })

    const wrapper = await mountSuspended(DocumentDetail, {
      props: { documentId: 'doc-enriched', workspaceId: 'ws-123' },
    })

    const retryBtn = wrapper.findAll('button').find((b) => b.text().includes('Relancer'))
    expect(retryBtn).toBeUndefined()
  })

  it('n\'affiche pas FailedDocumentActions pour un document CLASSIFIED_ONLY', async () => {
    mockStore.currentDocument = makeDocumentDetail({
      processingStatus: 'CLASSIFIED_ONLY',
      intelligence: makeDocumentIntelligence(),
      metadata: makeDocumentMetadata(),
    })

    const wrapper = await mountSuspended(DocumentDetail, {
      props: { documentId: 'doc-classified', workspaceId: 'ws-123' },
    })

    const retryBtn = wrapper.findAll('button').find((b) => b.text().includes('Relancer'))
    expect(retryBtn).toBeUndefined()
  })

  it('affiche FailedDocumentActions pour un document FAILED', async () => {
    mockStore.currentDocument = makeDocumentDetail({
      processingStatus: 'FAILED',
      intelligence: null,
      metadata: makeDocumentMetadata(),
    })

    const wrapper = await mountSuspended(DocumentDetail, {
      props: { documentId: 'doc-failed', workspaceId: 'ws-123' },
    })

    const retryBtn = wrapper.findAll('button').find((b) => b.text().includes('Relancer'))
    expect(retryBtn).toBeDefined()
    expect(retryBtn!.exists()).toBe(true)
  })

  it('affiche le bouton Archiver pour un document ENRICHED', async () => {
    mockStore.currentDocument = makeDocumentDetail({
      processingStatus: 'ENRICHED',
      intelligence: makeDocumentIntelligence(),
      metadata: makeDocumentMetadata(),
    })

    const wrapper = await mountSuspended(DocumentDetail, {
      props: { documentId: 'doc-enriched', workspaceId: 'ws-123' },
    })

    const archiveBtn = wrapper.findAll('button').find((b) => b.text().includes('Archiver'))
    expect(archiveBtn).toBeDefined()
    expect(archiveBtn!.exists()).toBe(true)
  })

  it('n\'affiche pas le bouton Archiver pour un document FAILED', async () => {
    mockStore.currentDocument = makeDocumentDetail({
      processingStatus: 'FAILED',
      metadata: makeDocumentMetadata(),
    })

    const wrapper = await mountSuspended(DocumentDetail, {
      props: { documentId: 'doc-failed', workspaceId: 'ws-123' },
    })

    const archiveBtn = wrapper.findAll('button').find((b) => b.text().includes('Archiver'))
    expect(archiveBtn).toBeUndefined()
  })

  it('n\'affiche pas IntelligenceSection si intelligence est null', async () => {
    mockStore.currentDocument = makeDocumentDetail({
      processingStatus: 'UPLOADED',
      intelligence: null,
      metadata: null,
    })

    const wrapper = await mountSuspended(DocumentDetail, {
      props: { documentId: 'doc-pending', workspaceId: 'ws-123' },
    })

    expect(wrapper.text()).not.toContain('Détecté automatiquement')
  })
})
