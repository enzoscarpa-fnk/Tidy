import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { setActivePinia, createPinia } from 'pinia'
import { makeDocument } from '../utils/factories'

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockSearchDocuments = vi.fn().mockResolvedValue([])

vi.mock('~/composables/useLocalDocumentRepository', () => ({
  useLocalDocumentRepository: () => ({
    searchDocuments: mockSearchDocuments,
  }),
}))

// ── Import après mocks ─────────────────────────────────────────────────────

import { useLocalSearchStore } from '~/stores/localSearch'

// ── Tests ──────────────────────────────────────────────────────────────────

describe('useLocalSearchStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockSearchDocuments.mockResolvedValue([])
  })

  describe('searchOffline()', () => {
    it('ne lance pas la recherche pour une query vide', async () => {
      const store = useLocalSearchStore()
      await store.searchOffline('ws-456', '')

      expect(mockSearchDocuments).not.toHaveBeenCalled()
      expect(store.results).toEqual([])
    })

    it('ne lance pas la recherche pour une query de whitespace', async () => {
      const store = useLocalSearchStore()
      await store.searchOffline('ws-456', '   ')

      expect(mockSearchDocuments).not.toHaveBeenCalled()
    })

    it('appelle searchDocuments avec le bon workspaceId et la query trimée', async () => {
      const store = useLocalSearchStore()
      await store.searchOffline('ws-456', '  facture  ')

      expect(mockSearchDocuments).toHaveBeenCalledWith('ws-456', 'facture')
      expect(store.query).toBe('facture')
    })

    it('met à jour results avec les documents retournés', async () => {
      const store = useLocalSearchStore()
      const docs = [makeDocument({ id: 'doc-1' }), makeDocument({ id: 'doc-2' })]
      mockSearchDocuments.mockResolvedValueOnce(docs)

      await store.searchOffline('ws-456', 'facture')

      expect(store.results).toHaveLength(2)
      expect(store.results[0]!.id).toBe('doc-1')
    })

    it('filtre les résultats par processingStatus en mémoire', async () => {
      const store = useLocalSearchStore()
      mockSearchDocuments.mockResolvedValueOnce([
        makeDocument({ id: 'doc-1', processingStatus: 'ENRICHED' }),
        makeDocument({ id: 'doc-2', processingStatus: 'FAILED' }),
      ])

      await store.searchOffline('ws-456', 'facture', { status: 'ENRICHED' })

      expect(store.results).toHaveLength(1)
      expect(store.results[0]!.id).toBe('doc-1')
    })

    it('filtre les résultats par userTags en mémoire', async () => {
      const store = useLocalSearchStore()
      mockSearchDocuments.mockResolvedValueOnce([
        makeDocument({ id: 'doc-1', metadata: { userTags: ['Adobe'], notes: null, userOverrideType: null, lastEditedAt: null } }),
        makeDocument({ id: 'doc-2', metadata: { userTags: ['Microsoft'], notes: null, userOverrideType: null, lastEditedAt: null } }),
      ])

      await store.searchOffline('ws-456', 'facture', { userTags: ['Adobe'] })

      expect(store.results).toHaveLength(1)
      expect(store.results[0]!.id).toBe('doc-1')
    })

    it('gère une erreur du repository sans throw', async () => {
      const store = useLocalSearchStore()
      mockSearchDocuments.mockRejectedValueOnce(new Error('SQLite error'))

      await store.searchOffline('ws-456', 'facture')

      expect(store.error).toBe('Recherche locale indisponible.')
      expect(store.results).toEqual([])
      expect(store.isLoading).toBe(false)
    })

    it('passe isLoading à true pendant la recherche puis false après', async () => {
      const store = useLocalSearchStore()
      let capturedLoading = false

      mockSearchDocuments.mockImplementationOnce(async () => {
        capturedLoading = store.isLoading
        return []
      })

      await store.searchOffline('ws-456', 'facture')

      expect(capturedLoading).toBe(true)
      expect(store.isLoading).toBe(false)
    })
  })

  describe('clearSearch()', () => {
    it('réinitialise tous les champs du store', async () => {
      const store = useLocalSearchStore()
      mockSearchDocuments.mockResolvedValueOnce([makeDocument()])
      await store.searchOffline('ws-456', 'facture')

      store.clearSearch()

      expect(store.results).toEqual([])
      expect(store.query).toBe('')
      expect(store.isLoading).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  describe('setFilter()', () => {
    it('met à jour un filtre sans relancer la recherche', async () => {
      const store = useLocalSearchStore()
      store.setFilter('status', 'ENRICHED')

      expect(store.filters.status).toBe('ENRICHED')
      expect(mockSearchDocuments).not.toHaveBeenCalled()
    })
  })

  describe('getters', () => {
    it('hasResults est false quand results est vide', () => {
      const store = useLocalSearchStore()
      expect(store.hasResults).toBe(false)
    })

    it('hasResults est true quand results contient des éléments', async () => {
      const store = useLocalSearchStore()
      mockSearchDocuments.mockResolvedValueOnce([makeDocument()])
      await store.searchOffline('ws-456', 'facture')
      expect(store.hasResults).toBe(true)
    })

    it('isEmpty est true après une recherche sans résultats', async () => {
      const store = useLocalSearchStore()
      mockSearchDocuments.mockResolvedValueOnce([])
      await store.searchOffline('ws-456', 'facture')
      expect(store.isEmpty).toBe(true)
    })

    it('isEmpty est false avant toute recherche', () => {
      const store = useLocalSearchStore()
      expect(store.isEmpty).toBe(false)
    })
  })
})
