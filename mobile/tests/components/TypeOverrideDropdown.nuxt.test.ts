import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, it, expect } from 'vitest'
import TypeOverrideDropdown from '~/components/TypeOverrideDropdown.vue'

describe('TypeOverrideDropdown', () => {

  // ── État initial fermé ─────────────────────────────────────────────────
  it('la liste déroulante est fermée par défaut', async () => {
    const wrapper = await mountSuspended(TypeOverrideDropdown, {
      props: { currentDetectedType: 'INVOICE', currentOverrideType: null },
    })

    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
  })

  // ── Ouverture au clic ──────────────────────────────────────────────────
  it('s\'ouvre au clic sur le bouton déclencheur', async () => {
    const wrapper = await mountSuspended(TypeOverrideDropdown, {
      props: { currentDetectedType: 'INVOICE', currentOverrideType: null },
    })

    await wrapper.find('button').trigger('click')

    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
  })

  // ── Labels en français — jamais les valeurs enum brutes ────────────────
  it('affiche les labels UX en français et non les valeurs enum brutes', async () => {
    const wrapper = await mountSuspended(TypeOverrideDropdown, {
      props: { currentDetectedType: null, currentOverrideType: null },
    })

    await wrapper.find('button').trigger('click')

    const listText = wrapper.find('[role="listbox"]').text()
    expect(listText).toContain('Facture')
    expect(listText).toContain('Contrat')
    expect(listText).toContain('Reçu')
    expect(listText).toContain("Relevé bancaire")
    // Valeurs enum brutes jamais exposées
    expect(listText).not.toContain('INVOICE')
    expect(listText).not.toContain('CONTRACT')
    expect(listText).not.toContain('BANK_STATEMENT')
  })

  // ── Émission de l'événement override ──────────────────────────────────
  it('émet "override" avec la valeur enum correcte au clic sur une option', async () => {
    const wrapper = await mountSuspended(TypeOverrideDropdown, {
      props: { currentDetectedType: 'INVOICE', currentOverrideType: null },
    })

    await wrapper.find('button').trigger('click')

    const options = wrapper.findAll('[role="option"]')
    // Trouver l'option "Contrat" (CONTRACT)
    const contratOption = options.find((o) => o.text().includes('Contrat'))
    expect(contratOption).toBeDefined()
    await contratOption!.trigger('click')

    expect(wrapper.emitted('override')).toBeTruthy()
    expect(wrapper.emitted('override')![0]).toEqual(['CONTRACT'])
  })

  // ── Fermeture après sélection ──────────────────────────────────────────
  it('se ferme après la sélection d\'une option', async () => {
    const wrapper = await mountSuspended(TypeOverrideDropdown, {
      props: { currentDetectedType: 'INVOICE', currentOverrideType: null },
    })

    await wrapper.find('button').trigger('click')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)

    const firstOption = wrapper.find('[role="option"]')
    await firstOption.trigger('click')

    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
  })

  // ── Option active marquée ──────────────────────────────────────────────
  it('marque l\'option active avec aria-selected="true"', async () => {
    const wrapper = await mountSuspended(TypeOverrideDropdown, {
      props: { currentDetectedType: 'INVOICE', currentOverrideType: null },
    })

    await wrapper.find('button').trigger('click')

    const activeOption = wrapper.find('[role="option"][aria-selected="true"]')
    expect(activeOption.exists()).toBe(true)
    expect(activeOption.text()).toContain('Facture')
  })

  // ── Priorité override > détection ─────────────────────────────────────
  it('affiche le label de currentOverrideType dans le bouton si override défini', async () => {
    const wrapper = await mountSuspended(TypeOverrideDropdown, {
      props: { currentDetectedType: 'INVOICE', currentOverrideType: 'CONTRACT' },
    })

    expect(wrapper.find('button').text()).toContain('Contrat')
    expect(wrapper.find('button').text()).not.toContain('Facture')
  })

  // ── Fermeture à la touche Escape ───────────────────────────────────────
  it('se ferme avec la touche Escape', async () => {
    const wrapper = await mountSuspended(TypeOverrideDropdown, {
      props: { currentDetectedType: 'INVOICE', currentOverrideType: null },
    })

    await wrapper.find('button').trigger('click')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)

    await wrapper.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
  })
})
