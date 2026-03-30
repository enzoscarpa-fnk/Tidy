import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, it, expect, vi } from 'vitest'
import DocumentCard from '~/components/DocumentCard.vue'
import { makeDocument } from '../utils/factories'

describe('DocumentCard', () => {

  // ── Cas 1 : rendu avec statut ENRICHED ──────────────────────────────────
  it('affiche le titre et un badge vert pour un document ENRICHED', async () => {
    const doc = makeDocument({
      processingStatus: 'ENRICHED',
      title: 'Facture Adobe Janvier 2025',
    })

    const wrapper = await mountSuspended(DocumentCard, {
      props: { document: doc },
    })

    // Titre présent
    expect(wrapper.text()).toContain('Facture Adobe Janvier 2025')

    // Badge vert via DocumentStatusBadge
    const badge = wrapper.find('.badge-status')
    expect(badge.classes()).toContain('bg-green-100')
    expect(badge.classes()).toContain('text-green-700')
    expect(badge.text()).toBe('Prêt')
  })

  // ── Cas 2 : rendu avec statut PROCESSING → badge pulsant ────────────────
  it('affiche un badge pulsant pour un document PROCESSING', async () => {
    const doc = makeDocument({ processingStatus: 'PROCESSING' })

    const wrapper = await mountSuspended(DocumentCard, {
      props: { document: doc },
    })

    const badge = wrapper.find('.badge-status')
    expect(badge.classes()).toContain('animate-status-pulse')
    expect(badge.classes()).toContain('bg-blue-100')
  })

  // ── Cas 3 : émet l'événement click avec documentId ──────────────────────
  it('émet l\'événement click avec l\'id du document au clic', async () => {
    const doc = makeDocument({ id: 'doc-abc-123' })

    const wrapper = await mountSuspended(DocumentCard, {
      props: { document: doc },
    })

    await wrapper.trigger('click')

    expect(wrapper.emitted('click')).toBeTruthy()
    expect(wrapper.emitted('click')![0]).toEqual(['doc-abc-123'])
  })

  // ── Cas 4 : émet click via clavier (accessibilité) ──────────────────────
  it('émet l\'événement click avec la touche Enter (accessibilité clavier)', async () => {
    const doc = makeDocument({ id: 'doc-keyboard' })

    const wrapper = await mountSuspended(DocumentCard, {
      props: { document: doc },
    })

    await wrapper.trigger('keydown.enter')

    expect(wrapper.emitted('click')).toBeTruthy()
  })

  // ── Cas 5 : affiche les user tags ────────────────────────────────────────
  it('affiche les tags utilisateur (max 3 visible)', async () => {
    const doc = makeDocument({
      metadata: {
        userTags: ['tag-1', 'tag-2', 'tag-3', 'tag-4'],
        notes: null,
        userOverrideType: null,
        lastEditedAt: null,
      },
    })

    const wrapper = await mountSuspended(DocumentCard, {
      props: { document: doc },
    })

    // 3 tags visibles
    const chips = wrapper.findAll('.badge-status, [class*="rounded-full"]')
    // Indicateur +1 pour le 4ème tag
    expect(wrapper.text()).toContain('+1')
  })

  // ── Cas 6 : affiche le fallback icône si pas de thumbnail ────────────────
  it('affiche l\'icône SVG fallback si thumbnailUrl est null', async () => {
    const doc = makeDocument({ thumbnailUrl: null, mimeType: 'application/pdf' })

    const wrapper = await mountSuspended(DocumentCard, {
      props: { document: doc },
    })

    // Pas d'élément <img> — fallback SVG à la place
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('svg').exists()).toBe(true)
  })
})
