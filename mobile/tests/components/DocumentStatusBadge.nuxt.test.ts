import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, it, expect } from 'vitest'
import DocumentStatusBadge from '~/components/DocumentStatusBadge.vue'

describe('DocumentStatusBadge', () => {

  // ── Cas 1 : statut ENRICHED → badge vert ────────────────────────────────
  it('affiche un badge vert pour le statut ENRICHED', async () => {
    const wrapper = await mountSuspended(DocumentStatusBadge, {
      props: { status: 'ENRICHED' },
    })

    const badge = wrapper.find('span')
    expect(badge.classes()).toContain('bg-green-100')
    expect(badge.classes()).toContain('text-green-700')
    expect(badge.text()).toBe('Prêt')
  })

  // ── Cas 2 : statut CLASSIFIED_ONLY → même badge vert que ENRICHED ───────
  it('affiche un badge vert pour le statut CLASSIFIED_ONLY (label : Prêt)', async () => {
    const wrapper = await mountSuspended(DocumentStatusBadge, {
      props: { status: 'CLASSIFIED_ONLY' },
    })

    const badge = wrapper.find('span')
    expect(badge.classes()).toContain('bg-green-100')
    expect(badge.classes()).toContain('text-green-700')
    expect(badge.text()).toBe('Prêt')
  })

  // ── Cas 3 : statut PROCESSING → badge pulsant ───────────────────────────
  it('affiche un badge pulsant avec le dot indicator pour le statut PROCESSING', async () => {
    const wrapper = await mountSuspended(DocumentStatusBadge, {
      props: { status: 'PROCESSING' },
    })

    const badge = wrapper.find('span')
    // Classes de couleur bleue
    expect(badge.classes()).toContain('bg-blue-100')
    expect(badge.classes()).toContain('text-blue-700')
    // Animation pulsation
    expect(badge.classes()).toContain('animate-status-pulse')
    // Dot indicator visible
    const dot = badge.find('span[aria-hidden="true"]')
    expect(dot.exists()).toBe(true)
    // Label correct
    expect(badge.text()).toContain('Analyse en cours')
  })

  // ── Cas 4 : PARTIALLY_ENRICHED → même apparence que PROCESSING ──────────
  it('affiche un badge pulsant pour PARTIALLY_ENRICHED (jamais le label brut)', async () => {
    const wrapper = await mountSuspended(DocumentStatusBadge, {
      props: { status: 'PARTIALLY_ENRICHED' },
    })

    const badge = wrapper.find('span')
    expect(badge.classes()).toContain('animate-status-pulse')
    // Règle absolue blueprint : PARTIALLY_ENRICHED n'est JAMAIS affiché en label
    expect(badge.text()).not.toContain('PARTIALLY_ENRICHED')
    expect(badge.text()).toContain('Analyse en cours')
  })

  // ── Cas 5 : FAILED → badge ambre, pas de dot, pas de pulsation ──────────
  it('affiche un badge ambre sans pulsation pour le statut FAILED', async () => {
    const wrapper = await mountSuspended(DocumentStatusBadge, {
      props: { status: 'FAILED' },
    })

    const badge = wrapper.find('span')
    expect(badge.classes()).toContain('bg-amber-100')
    expect(badge.classes()).toContain('text-amber-700')
    expect(badge.classes()).not.toContain('animate-status-pulse')
    expect(badge.find('span[aria-hidden="true"]').exists()).toBe(false)
  })

  // ── Cas 6 : ARCHIVED → badge gris désaturé ──────────────────────────────
  it('affiche un badge gris pour le statut ARCHIVED', async () => {
    const wrapper = await mountSuspended(DocumentStatusBadge, {
      props: { status: 'ARCHIVED' },
    })

    const badge = wrapper.find('span')
    expect(badge.classes()).toContain('bg-gray-100')
    expect(badge.text()).toBe('Archivé')
  })
})
