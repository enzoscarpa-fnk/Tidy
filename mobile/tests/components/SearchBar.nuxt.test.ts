import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SearchBar from '~/components/SearchBar.vue'

describe('SearchBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Rendu de base ──────────────────────────────────────────────────────────

  it('affiche un champ input et le bouton loupe', async () => {
    const wrapper = await mountSuspended(SearchBar)

    expect(wrapper.find('input').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Lancer la recherche"]').exists()).toBe(true)
  })

  it('applique le placeholder par défaut', async () => {
    const wrapper = await mountSuspended(SearchBar)
    const input = wrapper.find('input').element as HTMLInputElement

    expect(input.placeholder).toContain('Rechercher')
  })

  it('applique le placeholder personnalisé via prop', async () => {
    const wrapper = await mountSuspended(SearchBar, {
      props: { placeholder: 'Mon placeholder custom' },
    })
    const input = wrapper.find('input').element as HTMLInputElement

    expect(input.placeholder).toBe('Mon placeholder custom')
  })

  it('pré-remplit le champ avec initialQuery', async () => {
    const wrapper = await mountSuspended(SearchBar, {
      props: { initialQuery: 'relevé bancaire' },
    })
    const input = wrapper.find('input').element as HTMLInputElement

    expect(input.value).toBe('relevé bancaire')
  })

  // ── Règle critique UX Flow §6 : PAS de live search ──────────────────────

  it("n'émet PAS search à chaque frappe clavier", async () => {
    const wrapper = await mountSuspended(SearchBar)
    const input = wrapper.find('input')

    await input.setValue('f')
    await input.setValue('fa')
    await input.setValue('fac')
    await input.setValue('fact')
    await input.setValue('factu')
    await input.setValue('facture')

    expect(wrapper.emitted('search')).toBeUndefined()
  })

  // ── Déclenchement à la soumission ─────────────────────────────────────────

  it('émet search avec la valeur trimée à la pression de Enter', async () => {
    const wrapper = await mountSuspended(SearchBar)
    const input = wrapper.find('input')

    await input.setValue('  facture EDF  ')
    await input.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('search')).toHaveLength(1)
    expect(wrapper.emitted('search')![0]).toEqual(['facture EDF'])
  })

  it('émet search au clic sur le bouton loupe', async () => {
    const wrapper = await mountSuspended(SearchBar)
    const input = wrapper.find('input')

    await input.setValue('contrat 2024')
    await wrapper.find('button[aria-label="Lancer la recherche"]').trigger('click')

    expect(wrapper.emitted('search')).toHaveLength(1)
    expect(wrapper.emitted('search')![0]).toEqual(['contrat 2024'])
  })

  it("n'émet PAS search si la valeur est vide ou uniquement des espaces", async () => {
    const wrapper = await mountSuspended(SearchBar)
    const input = wrapper.find('input')

    await input.setValue('   ')
    await input.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('search')).toBeUndefined()
  })

  it("n'émet PAS search si le champ est vide", async () => {
    const wrapper = await mountSuspended(SearchBar)

    await wrapper.find('button[aria-label="Lancer la recherche"]').trigger('click')

    expect(wrapper.emitted('search')).toBeUndefined()
  })

  // ── Bouton effacer ────────────────────────────────────────────────────────

  it("le bouton 'Effacer' n'est pas visible si le champ est vide", async () => {
    const wrapper = await mountSuspended(SearchBar)

    expect(
      wrapper.find('button[aria-label="Effacer la recherche"]').exists()
    ).toBe(false)
  })

  it("le bouton 'Effacer' est visible dès qu'il y a du texte", async () => {
    const wrapper = await mountSuspended(SearchBar)

    await wrapper.find('input').setValue('test')

    expect(
      wrapper.find('button[aria-label="Effacer la recherche"]').exists()
    ).toBe(true)
  })

  it('émet clear et vide le champ au clic sur Effacer', async () => {
    const wrapper = await mountSuspended(SearchBar)
    const input = wrapper.find('input')

    await input.setValue('test')
    await wrapper.find('button[aria-label="Effacer la recherche"]').trigger('click')

    expect(wrapper.emitted('clear')).toHaveLength(1)
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('le bouton Effacer disparaît après avoir vidé le champ', async () => {
    const wrapper = await mountSuspended(SearchBar)
    const input = wrapper.find('input')

    await input.setValue('test')
    await wrapper.find('button[aria-label="Effacer la recherche"]').trigger('click')

    // Après effacement, le bouton ne doit plus être rendu
    expect(
      wrapper.find('button[aria-label="Effacer la recherche"]').exists()
    ).toBe(false)
  })
})
