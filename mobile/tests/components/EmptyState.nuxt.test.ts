import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, it, expect, vi } from 'vitest'
import EmptyState from '~/components/EmptyState.vue'

describe('EmptyState', () => {

  // ── Cas 1 : workspace vide (contexte dashboard) ──────────────────────────
  it('affiche le bon message pour un workspace sans document (contexte dashboard)', async () => {
    const wrapper = await mountSuspended(EmptyState, {
      props: { context: 'dashboard' },
    })

    expect(wrapper.text()).toContain('Aucun document pour l\'instant')
    expect(wrapper.text()).toContain('Ajouter un document')
    // L'emoji est présent
    expect(wrapper.text()).toContain('📂')
  })

  // ── Cas 2 : émet primaryAction au clic sur le CTA ────────────────────────
  it('émet l\'événement primaryAction au clic sur le bouton CTA', async () => {
    const wrapper = await mountSuspended(EmptyState, {
      props: { context: 'dashboard' },
    })

    const cta = wrapper.find('button')
    await cta.trigger('click')

    expect(wrapper.emitted('primaryAction')).toBeTruthy()
    expect(wrapper.emitted('primaryAction')!.length).toBe(1)
  })

  // ── Cas 3 : contexte search avec query ───────────────────────────────────
  it('affiche le bon message pour une recherche sans résultats', async () => {
    const wrapper = await mountSuspended(EmptyState, {
      props: { context: 'search', query: 'facture adobe' },
    })

    expect(wrapper.text()).toContain('facture adobe')
    expect(wrapper.text()).toContain('Aucun résultat')
    // CTA = effacer la recherche
    expect(wrapper.find('button').text()).toContain('Effacer')
  })

  // ── Cas 4 : contexte search sans query ───────────────────────────────────
  it('affiche un message générique si pas de query dans le contexte search', async () => {
    const wrapper = await mountSuspended(EmptyState, {
      props: { context: 'search' },
    })

    expect(wrapper.text()).toContain('Aucun résultat')
    // Pas de guillemets sans query
    expect(wrapper.text()).not.toContain('«')
  })

  // ── Cas 5 : contexte search-empty-workspace ───────────────────────────────
  it('affiche un message d\'invitation pour un workspace vide en mode recherche', async () => {
    const wrapper = await mountSuspended(EmptyState, {
      props: { context: 'search-empty-workspace' },
    })

    expect(wrapper.text()).toContain('Cet espace de travail est vide')
    expect(wrapper.text()).toContain('Ajouter un document')
  })
})
