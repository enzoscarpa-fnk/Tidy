import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, it, expect } from 'vitest'
import UserMetadataSection from '~/components/UserMetadataSection.vue'

describe('UserMetadataSection', () => {

  // ── Mode affichage (editMode = false) ──────────────────────────────────
  it('n\'affiche pas de textarea ni d\'input de tag quand editMode=false', async () => {
    const wrapper = await mountSuspended(UserMetadataSection, {
      props: { userTags: ['Facture'], notes: 'Note existante', editMode: false },
    })

    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.find('input[type="text"]').exists()).toBe(false)
  })

  it('affiche les tags et les notes en lecture seule quand editMode=false', async () => {
    const wrapper = await mountSuspended(UserMetadataSection, {
      props: { userTags: ['Adobe', 'Logiciel'], notes: 'Renouvellement annuel', editMode: false },
    })

    expect(wrapper.text()).toContain('Adobe')
    expect(wrapper.text()).toContain('Logiciel')
    expect(wrapper.text()).toContain('Renouvellement annuel')
  })

  // ── Mode édition (editMode = true) ─────────────────────────────────────
  it('affiche le textarea et l\'input de tag quand editMode=true', async () => {
    const wrapper = await mountSuspended(UserMetadataSection, {
      props: { userTags: [], notes: null, editMode: true },
    })

    expect(wrapper.find('textarea').exists()).toBe(true)
    expect(wrapper.find('input[type="text"]').exists()).toBe(true)
  })

  // ── Événement addTag via touche Enter ──────────────────────────────────
  it('émet "addTag" avec la valeur saisie sur pression de la touche Enter', async () => {
    const wrapper = await mountSuspended(UserMetadataSection, {
      props: { userTags: [], notes: null, editMode: true },
    })

    const input = wrapper.find('input[type="text"]')
    await input.setValue('MonNouveauTag')
    await input.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('addTag')).toBeTruthy()
    expect(wrapper.emitted('addTag')![0]).toEqual(['MonNouveauTag'])
  })

  it('émet "addTag" au clic sur le bouton Ajouter', async () => {
    const wrapper = await mountSuspended(UserMetadataSection, {
      props: { userTags: [], notes: null, editMode: true },
    })

    await wrapper.find('input[type="text"]').setValue('TagBouton')
    await wrapper.find('button').trigger('click')

    expect(wrapper.emitted('addTag')![0]).toEqual(['TagBouton'])
  })

  // ── Événement removeTag ────────────────────────────────────────────────
  it('émet "removeTag" quand le bouton × d\'un TagChip est cliqué', async () => {
    const wrapper = await mountSuspended(UserMetadataSection, {
      props: { userTags: ['Facture'], notes: null, editMode: true },
    })

    // Le TagChip avec removable=true expose un bouton de suppression
    const removeBtn = wrapper.find('button[aria-label="Supprimer le tag Facture"]')
    expect(removeBtn.exists()).toBe(true)
    await removeBtn.trigger('click')

    expect(wrapper.emitted('removeTag')).toBeTruthy()
    expect(wrapper.emitted('removeTag')![0]).toEqual(['Facture'])
  })

  // ── Événement updateNotes ──────────────────────────────────────────────
  it('émet "updateNotes" à la saisie dans le textarea', async () => {
    const wrapper = await mountSuspended(UserMetadataSection, {
      props: { userTags: [], notes: null, editMode: true },
    })

    await wrapper.find('textarea').setValue('Nouvelle note de test')

    expect(wrapper.emitted('updateNotes')).toBeTruthy()
    expect(wrapper.emitted('updateNotes')!.at(-1)).toEqual(['Nouvelle note de test'])
  })

  // ── Tags non-removable en mode lecture ────────────────────────────────
  it('ne rend pas les TagChip removable quand editMode=false', async () => {
    const wrapper = await mountSuspended(UserMetadataSection, {
      props: { userTags: ['Contrat'], notes: null, editMode: false },
    })

    expect(wrapper.find('button[aria-label="Supprimer le tag Contrat"]').exists()).toBe(false)
  })
})
