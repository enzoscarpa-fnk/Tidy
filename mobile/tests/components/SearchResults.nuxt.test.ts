import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SearchResults from '~/components/SearchResults.vue'
import { makeSearchResultItem } from '../utils/factories'
import type { SearchFilters } from '~/stores/search'

// ── vi.hoisted ─────────────────────────────────────────────────────────────

const { mockSearch, mockClearSearch, mockClearFilters, mockPush, mockSearchState } =
  vi.hoisted(() => {
    const mockSearch      = vi.fn().mockResolvedValue(undefined)
    const mockClearSearch = vi.fn()
    const mockClearFilters = vi.fn()
    const mockPush        = vi.fn()

    const EMPTY_FILTERS: SearchFilters = { types: [], tags: [], dateRange: null }

    const mockSearchState = {
      query:           '',
      results:         [] as ReturnType<typeof makeSearchResultItem>[],
      filters:         EMPTY_FILTERS,
      isLoading:       false,
      error:           null as string | null,
      resultCount:     0,
      hasSearched:     false,
      hasActiveFilters: false,
    }

    return { mockSearch, mockClearSearch, mockClearFilters, mockPush, mockSearchState }
  })

// ── Mocks Nuxt ─────────────────────────────────────────────────────────────

mockNuxtImport('useSearchStore', () => {
  return () => ({
    get query()           { return mockSearchState.query },
    get results()         { return mockSearchState.results },
    get filters()         { return mockSearchState.filters },
    get isLoading()       { return mockSearchState.isLoading },
    get error()           { return mockSearchState.error },
    get resultCount()     { return mockSearchState.resultCount },
    get hasSearched()     { return mockSearchState.hasSearched },
    get hasActiveFilters(){ return mockSearchState.hasActiveFilters },
    search:       mockSearch,
    clearSearch:  mockClearSearch,
    clearFilters: mockClearFilters,
    setFilter:    vi.fn(),
  })
})

// Fix : mountSuspended appelle router.replace() en interne —
// le mock doit exposer TOUTES les méthodes du router, pas seulement push.
mockNuxtImport('useRouter', () => {
  return () => ({
    push:         mockPush,
    replace:      vi.fn(),
    back:         vi.fn(),
    forward:      vi.fn(),
    go:           vi.fn(),
    currentRoute: { value: { path: '/', params: {}, query: {}, hash: '' } },
  })
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SearchResults', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchState.query         = ''
    mockSearchState.results       = []
    mockSearchState.filters       = { types: [], tags: [], dateRange: null }
    mockSearchState.isLoading     = false
    mockSearchState.error         = null
    mockSearchState.resultCount   = 0
    mockSearchState.hasSearched   = false
    mockSearchState.hasActiveFilters = false
  })

  // ── État initial (aucune recherche lancée) ────────────────────────────────

  it("affiche un message d'invitation si aucune recherche n'a été lancée", async () => {
    const wrapper = await mountSuspended(SearchResults, {
      props: { workspaceId: 'ws-test' },
    })

    expect(wrapper.text()).toContain('Tapez un terme')
  })

  it("n'affiche PAS EmptyState si aucune recherche n'a été lancée", async () => {
    const wrapper = await mountSuspended(SearchResults, {
      props: { workspaceId: 'ws-test' },
    })

    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(false)
  })

  it("n'affiche PAS TagFilterBar si aucune recherche n'a été lancée", async () => {
    const wrapper = await mountSuspended(SearchResults, {
      props: { workspaceId: 'ws-test' },
    })

    expect(wrapper.findComponent({ name: 'TagFilterBar' }).exists()).toBe(false)
  })

  // ── État chargement ───────────────────────────────────────────────────────

  it('affiche SkeletonLoader pendant le chargement', async () => {
    mockSearchState.isLoading   = true
    mockSearchState.hasSearched = true

    const wrapper = await mountSuspended(SearchResults, {
      props: { workspaceId: 'ws-test' },
    })

    expect(wrapper.findComponent({ name: 'SkeletonLoader' }).exists()).toBe(true)
  })

  it('masque les résultats pendant le chargement', async () => {
    mockSearchState.isLoading   = true
    mockSearchState.hasSearched = true
    mockSearchState.results     = [makeSearchResultItem()]

    const wrapper = await mountSuspended(SearchResults, {
      props: { workspaceId: 'ws-test' },
    })

    expect(wrapper.findComponent({ name: 'SkeletonLoader' }).exists()).toBe(true)
    expect(wrapper.findAll('article')).toHaveLength(0)
  })

  // ── État erreur ───────────────────────────────────────────────────────────

  it("affiche ErrorState en cas d'erreur", async () => {
    mockSearchState.error       = "Impossible d'effectuer la recherche."
    mockSearchState.hasSearched = true

    const wrapper = await mountSuspended(SearchResults, {
      props: { workspaceId: 'ws-test' },
    })

    expect(wrapper.findComponent({ name: 'ErrorState' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'SkeletonLoader' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(false)
  })

  // ── État vide ─────────────────────────────────────────────────────────────

  it('affiche EmptyState quand la recherche retourne 0 résultats', async () => {
    mockSearchState.query       = 'introuvable xyz'
    mockSearchState.results     = []
    mockSearchState.hasSearched = true

    const wrapper = await mountSuspended(SearchResults, {
      props: { workspaceId: 'ws-test' },
    })

    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'ErrorState' }).exists()).toBe(false)
  })

  // ── Affichage des résultats ───────────────────────────────────────────────

  it('affiche les articles quand la recherche retourne des données', async () => {
    mockSearchState.query       = 'EDF'
    mockSearchState.hasSearched = true
    mockSearchState.resultCount = 2
    mockSearchState.results     = [
      makeSearchResultItem({ id: 'doc-1', title: 'Facture EDF Janvier' }),
      makeSearchResultItem({ id: 'doc-2', title: 'Facture EDF Février' }),
    ]

    const wrapper = await mountSuspended(SearchResults, {
      props: { workspaceId: 'ws-test' },
    })

    expect(wrapper.findAll('article')).toHaveLength(2)
    expect(wrapper.text()).toContain('Facture EDF Janvier')
    expect(wrapper.text()).toContain('Facture EDF Février')
  })

  it('affiche le compteur au singulier', async () => {
    mockSearchState.query       = 'contrat'
    mockSearchState.hasSearched = true
    mockSearchState.resultCount = 1
    mockSearchState.results     = [makeSearchResultItem({ title: 'Contrat prestation' })]

    const wrapper = await mountSuspended(SearchResults, {
      props: { workspaceId: 'ws-test' },
    })

    expect(wrapper.text()).toContain('1 résultat')
    expect(wrapper.text()).not.toContain('résultats')
  })

  it('affiche le compteur au pluriel', async () => {
    mockSearchState.query       = 'facture'
    mockSearchState.hasSearched = true
    mockSearchState.resultCount = 3
    mockSearchState.results     = [
      makeSearchResultItem({ id: 'doc-1' }),
      makeSearchResultItem({ id: 'doc-2' }),
      makeSearchResultItem({ id: 'doc-3' }),
    ]

    const wrapper = await mountSuspended(SearchResults, {
      props: { workspaceId: 'ws-test' },
    })

    expect(wrapper.text()).toContain('3 résultats')
  })

  it('affiche le terme de recherche dans le compteur', async () => {
    mockSearchState.query       = 'Adobe'
    mockSearchState.hasSearched = true
    mockSearchState.resultCount = 1
    mockSearchState.results     = [makeSearchResultItem()]

    const wrapper = await mountSuspended(SearchResults, {
      props: { workspaceId: 'ws-test' },
    })

    expect(wrapper.text()).toContain('Adobe')
  })

  it('affiche le headline surligné via v-html (balise <b>)', async () => {
    mockSearchState.query       = 'EDF'
    mockSearchState.hasSearched = true
    mockSearchState.resultCount = 1
    mockSearchState.results     = [
      makeSearchResultItem({
        id: 'doc-1',
        title: 'Facture EDF Janvier',
        headline: 'Facture <b>EDF</b> Janvier 2024',
      }),
    ]

    const wrapper = await mountSuspended(SearchResults, {
      props: { workspaceId: 'ws-test' },
    })

    const boldElements = wrapper.findAll('b')
    expect(boldElements.some((el) => el.text() === 'EDF')).toBe(true)
  })

  it("affiche l'originalFilename si le headline est absent", async () => {
    mockSearchState.query       = 'facture'
    mockSearchState.hasSearched = true
    mockSearchState.resultCount = 1
    mockSearchState.results     = [
      makeSearchResultItem({
        headline: null,
        originalFilename: 'facture_adobe_2025-01.pdf',
      }),
    ]

    const wrapper = await mountSuspended(SearchResults, {
      props: { workspaceId: 'ws-test' },
    })

    expect(wrapper.text()).toContain('facture_adobe_2025-01.pdf')
  })

  // ── TagFilterBar visible après recherche ──────────────────────────────────

  it('affiche TagFilterBar une fois la recherche effectuée', async () => {
    mockSearchState.hasSearched = true

    const wrapper = await mountSuspended(SearchResults, {
      props: { workspaceId: 'ws-test' },
    })

    expect(wrapper.findComponent({ name: 'TagFilterBar' }).exists()).toBe(true)
  })

  // ── initialQuery au mount ─────────────────────────────────────────────────

  it('appelle search au mount si initialQuery est fourni', async () => {
    await mountSuspended(SearchResults, {
      props: { workspaceId: 'ws-test', initialQuery: 'relevé bancaire' },
    })

    expect(mockSearch).toHaveBeenCalledWith('ws-test', 'relevé bancaire')
  })

  it("n'appelle PAS search au mount si initialQuery est absent", async () => {
    await mountSuspended(SearchResults, {
      props: { workspaceId: 'ws-test' },
    })

    expect(mockSearch).not.toHaveBeenCalled()
  })

  it("n'appelle PAS search au mount si initialQuery ne contient que des espaces", async () => {
    await mountSuspended(SearchResults, {
      props: { workspaceId: 'ws-test', initialQuery: '   ' },
    })

    expect(mockSearch).not.toHaveBeenCalled()
  })

  // ── Navigation au clic ────────────────────────────────────────────────────

  it('navigue vers la page de détail au clic sur un résultat', async () => {
    mockSearchState.query       = 'facture'
    mockSearchState.hasSearched = true
    mockSearchState.resultCount = 1
    mockSearchState.results     = [makeSearchResultItem({ id: 'doc-nav-test' })]

    const wrapper = await mountSuspended(SearchResults, {
      props: { workspaceId: 'ws-nav' },
    })

    await wrapper.find('article').trigger('click')

    expect(mockPush).toHaveBeenCalledWith('/workspace/ws-nav/document/doc-nav-test')
  })
})
