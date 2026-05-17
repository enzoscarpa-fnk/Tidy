import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DetectedType } from '~/types/api'
import { DETECTED_TYPE_LABELS } from '~/types/api'
import TagFilterBar from '~/components/TagFilterBar.vue'

// Fix : définir SearchFilters localement plutôt que d'importer ~/stores/search.
// L'import du module store force le chargement de defineStore/useTidyApi
// (auto-imports Nuxt) qui ne sont pas disponibles hors contexte Nuxt complet,
// ce qui empêche Vitest d'enregistrer les describe blocks.
interface SearchFilters {
  types: DetectedType[]
  tags: string[]
  dateRange: 'month' | 'quarter' | 'year' | null
}

// ── Fixtures ──────────────────────────────────────────────────────────────

const TYPES: DetectedType[] = ['INVOICE', 'CONTRACT', 'RECEIPT']
const TAGS = ['urgent', 'client-a', 'fiscal']
const EMPTY_FILTERS: SearchFilters = { types: [], tags: [], dateRange: null }

describe('TagFilterBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Rendu ─────────────────────────────────────────────────────────────────

  it('affiche les labels UX des types (jamais les valeurs enum brutes)', async () => {
    const wrapper = await mountSuspended(TagFilterBar, {
      props: { availableTypes: TYPES, availableTags: [], activeFilters: EMPTY_FILTERS },
    })

    expect(wrapper.text()).toContain('Facture')
    expect(wrapper.text()).toContain('Contrat')
    expect(wrapper.text()).toContain('Reçu')
    expect(wrapper.text()).not.toContain('INVOICE')
    expect(wrapper.text()).not.toContain('CONTRACT')
  })

  it('affiche les tags personnels', async () => {
    const wrapper = await mountSuspended(TagFilterBar, {
      props: { availableTypes: [], availableTags: TAGS, activeFilters: EMPTY_FILTERS },
    })

    expect(wrapper.text()).toContain('urgent')
    expect(wrapper.text()).toContain('client-a')
    expect(wrapper.text()).toContain('fiscal')
  })

  it('affiche les options de plage de dates', async () => {
    const wrapper = await mountSuspended(TagFilterBar, {
      props: { availableTypes: [], availableTags: [], activeFilters: EMPTY_FILTERS },
    })

    expect(wrapper.text()).toContain('Ce mois-ci')
    expect(wrapper.text()).toContain('Ce trimestre')
    expect(wrapper.text()).toContain('Cette année')
  })

  // ── Toggle type ───────────────────────────────────────────────────────────

  it('émet filterChange avec le type ajouté lors du premier clic', async () => {
    const wrapper = await mountSuspended(TagFilterBar, {
      props: { availableTypes: TYPES, availableTags: [], activeFilters: EMPTY_FILTERS },
    })

    await wrapper.findAll('button').find((b) => b.text().includes('Facture'))!.trigger('click')

    const [[payload]] = wrapper.emitted('filterChange') as [[SearchFilters]]
    expect(payload.types).toContain('INVOICE')
  })

  it("retire le type lors d'un second clic (toggle)", async () => {
    const wrapper = await mountSuspended(TagFilterBar, {
      props: {
        availableTypes: TYPES,
        availableTags: [],
        activeFilters: { ...EMPTY_FILTERS, types: ['INVOICE'] },
      },
    })

    await wrapper.findAll('button').find((b) => b.text().includes('Facture'))!.trigger('click')

    const [[payload]] = wrapper.emitted('filterChange') as [[SearchFilters]]
    expect(payload.types).not.toContain('INVOICE')
  })

  it('accumule plusieurs types (filtres cumulatifs)', async () => {
    const wrapper = await mountSuspended(TagFilterBar, {
      props: {
        availableTypes: TYPES,
        availableTags: [],
        activeFilters: { ...EMPTY_FILTERS, types: ['INVOICE'] },
      },
    })

    await wrapper.findAll('button').find((b) => b.text().includes('Contrat'))!.trigger('click')

    const [[payload]] = wrapper.emitted('filterChange') as [[SearchFilters]]
    expect(payload.types).toEqual(expect.arrayContaining(['INVOICE', 'CONTRACT']))
  })

  // ── Toggle tag ────────────────────────────────────────────────────────────

  it('émet filterChange avec le tag ajouté', async () => {
    const wrapper = await mountSuspended(TagFilterBar, {
      props: { availableTypes: [], availableTags: TAGS, activeFilters: EMPTY_FILTERS },
    })

    await wrapper.findAll('button').find((b) => b.text().includes('urgent'))!.trigger('click')

    const [[payload]] = wrapper.emitted('filterChange') as [[SearchFilters]]
    expect(payload.tags).toContain('urgent')
  })

  it('accumule les tags (filtres cumulatifs)', async () => {
    const wrapper = await mountSuspended(TagFilterBar, {
      props: {
        availableTypes: [],
        availableTags: TAGS,
        activeFilters: { ...EMPTY_FILTERS, tags: ['urgent'] },
      },
    })

    await wrapper.findAll('button').find((b) => b.text().includes('client-a'))!.trigger('click')

    const [[payload]] = wrapper.emitted('filterChange') as [[SearchFilters]]
    expect(payload.tags).toEqual(expect.arrayContaining(['urgent', 'client-a']))
  })

  it("ne modifie pas les types lors du toggle d'un tag", async () => {
    const wrapper = await mountSuspended(TagFilterBar, {
      props: {
        availableTypes: TYPES,
        availableTags: TAGS,
        activeFilters: { ...EMPTY_FILTERS, types: ['INVOICE'] },
      },
    })

    await wrapper.findAll('button').find((b) => b.text().includes('urgent'))!.trigger('click')

    const [[payload]] = wrapper.emitted('filterChange') as [[SearchFilters]]
    expect(payload.types).toContain('INVOICE')
  })

  // ── Toggle dateRange ──────────────────────────────────────────────────────

  it('émet filterChange avec dateRange sélectionné', async () => {
    const wrapper = await mountSuspended(TagFilterBar, {
      props: { availableTypes: [], availableTags: [], activeFilters: EMPTY_FILTERS },
    })

    await wrapper.findAll('button').find((b) => b.text().includes('Ce mois-ci'))!.trigger('click')

    const [[payload]] = wrapper.emitted('filterChange') as [[SearchFilters]]
    expect(payload.dateRange).toBe('month')
  })

  it('désactive le dateRange si on reclique (toggle)', async () => {
    const wrapper = await mountSuspended(TagFilterBar, {
      props: {
        availableTypes: [],
        availableTags: [],
        activeFilters: { ...EMPTY_FILTERS, dateRange: 'month' },
      },
    })

    await wrapper.findAll('button').find((b) => b.text().includes('Ce mois-ci'))!.trigger('click')

    const [[payload]] = wrapper.emitted('filterChange') as [[SearchFilters]]
    expect(payload.dateRange).toBeNull()
  })

  // ── Bouton "Effacer les filtres" ──────────────────────────────────────────

  it("le bouton 'Effacer' est absent quand aucun filtre n'est actif", async () => {
    const wrapper = await mountSuspended(TagFilterBar, {
      props: { availableTypes: TYPES, availableTags: TAGS, activeFilters: EMPTY_FILTERS },
    })

    expect(wrapper.findAll('button').some((b) => b.text().includes('Effacer'))).toBe(false)
  })

  it("le bouton 'Effacer' est visible quand un type est actif", async () => {
    const wrapper = await mountSuspended(TagFilterBar, {
      props: {
        availableTypes: TYPES,
        availableTags: [],
        activeFilters: { ...EMPTY_FILTERS, types: ['CONTRACT'] },
      },
    })

    expect(wrapper.findAll('button').some((b) => b.text().includes('Effacer'))).toBe(true)
  })

  it("le bouton 'Effacer' est visible quand un tag est actif", async () => {
    const wrapper = await mountSuspended(TagFilterBar, {
      props: {
        availableTypes: [],
        availableTags: TAGS,
        activeFilters: { ...EMPTY_FILTERS, tags: ['urgent'] },
      },
    })

    expect(wrapper.findAll('button').some((b) => b.text().includes('Effacer'))).toBe(true)
  })

  it("le bouton 'Effacer' est visible quand dateRange est actif", async () => {
    const wrapper = await mountSuspended(TagFilterBar, {
      props: {
        availableTypes: [],
        availableTags: [],
        activeFilters: { ...EMPTY_FILTERS, dateRange: 'year' },
      },
    })

    expect(wrapper.findAll('button').some((b) => b.text().includes('Effacer'))).toBe(true)
  })

  it("émet clearAll au clic sur 'Effacer les filtres'", async () => {
    const wrapper = await mountSuspended(TagFilterBar, {
      props: {
        availableTypes: TYPES,
        availableTags: [],
        activeFilters: { ...EMPTY_FILTERS, types: ['INVOICE', 'CONTRACT'] },
      },
    })

    await wrapper.findAll('button').find((b) => b.text().includes('Effacer'))!.trigger('click')

    expect(wrapper.emitted('clearAll')).toHaveLength(1)
  })
})
