import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import DocumentList from '~/components/DocumentList.vue'
import { makeDocument } from '../utils/factories'

// ── Spies ──────────────────────────────────────────────────────────────────
const mockFetchDocuments = vi.fn().mockResolvedValue(undefined)
const mockStartPolling   = vi.fn()
const mockStopPolling    = vi.fn()
const mockReset          = vi.fn()

// État mutable partagé — les getters garantissent que chaque test
// lit l'état COURANT au moment du rendu, pas un snapshot figé
const mockState = {
  documents:            [] as ReturnType<typeof makeDocument>[],
  isLoading:            false,
  error:                null as string | null,
  hasDocumentsPending:  false,
  hasNextPage:          false,
}

// ── mockNuxtImport intercepte les auto-imports Nuxt ────────────────────────
// Doit être appelé au niveau module, PAS dans describe/it
mockNuxtImport('useDocumentStore', () => {
  // La factory est réévaluée à chaque appel du composant —
  // les getters lisent mockState en temps réel
  return () => ({
    get documents()           { return mockState.documents },
    get isLoading()           { return mockState.isLoading },
    get error()               { return mockState.error },
    get hasDocumentsPending() { return mockState.hasDocumentsPending },
    get hasNextPage()         { return mockState.hasNextPage },
    fetchDocuments:  mockFetchDocuments,
    startPolling:    mockStartPolling,
    stopPolling:     mockStopPolling,
    reset:           mockReset,
  })
})

// Mock useIntersectionObserver (auto-importé depuis @vueuse/core via Nuxt)
mockNuxtImport('useIntersectionObserver', () => {
  return () => ({ stop: vi.fn() })
})

// ── Tests ──────────────────────────────────────────────────────────────────
describe('DocumentList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.documents           = []
    mockState.isLoading           = false
    mockState.error               = null
    mockState.hasDocumentsPending = false
    mockState.hasNextPage         = false
  })

  // ── Cas 1 : polling s'arrête au unmount ──────────────────────────────────
  it('arrête le polling lorsque le composant est démonté (onUnmounted)', async () => {
    mockState.documents           = [makeDocument({ processingStatus: 'PROCESSING' })]
    mockState.hasDocumentsPending = true

    const wrapper = await mountSuspended(DocumentList, {
      props: { workspaceId: 'ws-123' },
    })

    wrapper.unmount()

    expect(mockStopPolling).toHaveBeenCalledTimes(1)
  })

  // ── Cas 2 : skeleton pendant le chargement initial ───────────────────────
  it('affiche SkeletonLoader pendant le chargement initial (liste vide + isLoading)', async () => {
    mockState.documents = []
    mockState.isLoading = true

    const wrapper = await mountSuspended(DocumentList, {
      props: { workspaceId: 'ws-123' },
    })

    expect(wrapper.findComponent({ name: 'SkeletonLoader' }).exists()).toBe(true)
    expect(wrapper.find('ul').exists()).toBe(false)
  })

  // ── Cas 3 : pas de skeleton si documents déjà présents ───────────────────
  it('n\'affiche PAS le skeleton si des documents sont présents (poll silencieux)', async () => {
    mockState.documents = [makeDocument()]
    mockState.isLoading = true  // poll en cours mais docs déjà là

    const wrapper = await mountSuspended(DocumentList, {
      props: { workspaceId: 'ws-123' },
    })

    expect(wrapper.findComponent({ name: 'SkeletonLoader' }).exists()).toBe(false)
  })

  // ── Cas 4 : polling démarre si docs en traitement ────────────────────────
  it('démarre le polling au mount si des documents sont en cours de traitement', async () => {
    mockState.documents           = [makeDocument({ processingStatus: 'PROCESSING' })]
    mockState.hasDocumentsPending = true

    const wrapper = await mountSuspended(DocumentList, {
      props: { workspaceId: 'ws-123' },
    })

    expect(mockStartPolling).toHaveBeenCalledWith('ws-123', {})

    wrapper.unmount()
  })

  // ── Cas 5 : pas de polling si tous les docs sont stables ─────────────────
  it('ne démarre PAS le polling si tous les documents sont dans un statut stable', async () => {
    mockState.documents           = [makeDocument({ processingStatus: 'ENRICHED' })]
    mockState.hasDocumentsPending = false

    const wrapper = await mountSuspended(DocumentList, {
      props: { workspaceId: 'ws-123' },
    })

    expect(mockStartPolling).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  // ── Cas 6 : ErrorState affiché en cas d'erreur ───────────────────────────
  it('affiche ErrorState quand le store a une erreur', async () => {
    mockState.documents = []
    mockState.isLoading = false
    mockState.error     = 'Impossible de charger les documents.'

    const wrapper = await mountSuspended(DocumentList, {
      props: { workspaceId: 'ws-123' },
    })

    expect(wrapper.findComponent({ name: 'ErrorState' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'SkeletonLoader' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(false)
  })

  // ── Cas 7 : EmptyState si liste vide sans erreur ──────────────────────────
  it('affiche EmptyState quand la liste est vide sans erreur', async () => {
    mockState.documents = []
    mockState.isLoading = false
    mockState.error     = null

    const wrapper = await mountSuspended(DocumentList, {
      props: { workspaceId: 'ws-123' },
    })

    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(true)
  })

  // ── Cas 8 : reset() puis fetchDocuments() au mount ───────────────────────
  it('appelle reset() puis fetchDocuments() avec le bon [workspaceId] au mount', async () => {
    await mountSuspended(DocumentList, {
      props: { workspaceId: 'ws-456' },
    })

    expect(mockReset).toHaveBeenCalledTimes(1)
    expect(mockFetchDocuments).toHaveBeenCalledWith('ws-456', {})
  })
})
