import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, it, expect } from 'vitest'
import IntelligenceSection from '~/components/IntelligenceSection.vue'
import { makeDocumentIntelligence } from '../utils/factories'

describe('IntelligenceSection', () => {

  // ── Règle critique : composant READ ONLY ───────────────────────────────
  it('ne contient aucun champ modifiable (input / textarea / select)', async () => {
    const intelligence = makeDocumentIntelligence()

    const wrapper = await mountSuspended(IntelligenceSection, {
      props: { intelligence, userOverrideType: null },
    })

    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.find('select').exists()).toBe(false)
  })

  // ── Alerte détection incertaine ────────────────────────────────────────
  it('affiche "Détection incertaine" quand globalConfidenceScore < 0.6', async () => {
    const intelligence = makeDocumentIntelligence({ globalConfidenceScore: 0.45 })

    const wrapper = await mountSuspended(IntelligenceSection, {
      props: { intelligence, userOverrideType: null },
    })

    expect(wrapper.text()).toContain('Détection incertaine')
  })

  it('n\'affiche pas l\'alerte quand globalConfidenceScore >= 0.6', async () => {
    const intelligence = makeDocumentIntelligence({ globalConfidenceScore: 0.85 })

    const wrapper = await mountSuspended(IntelligenceSection, {
      props: { intelligence, userOverrideType: null },
    })

    expect(wrapper.text()).not.toContain('Détection incertaine')
  })

  // ── Score brut jamais exposé dans le template ──────────────────────────
  it('n\'affiche jamais la valeur numérique brute du score de confiance', async () => {
    const intelligence = makeDocumentIntelligence({ globalConfidenceScore: 0.92 })

    const wrapper = await mountSuspended(IntelligenceSection, {
      props: { intelligence, userOverrideType: null },
    })

    expect(wrapper.text()).not.toContain('0.92')
    expect(wrapper.text()).not.toContain('92%')
  })

  // ── Labels UX (jamais les valeurs enum brutes) ─────────────────────────
  it('affiche "Facture" et non la valeur brute "INVOICE"', async () => {
    const intelligence = makeDocumentIntelligence({ detectedType: 'INVOICE' })

    const wrapper = await mountSuspended(IntelligenceSection, {
      props: { intelligence, userOverrideType: null },
    })

    expect(wrapper.text()).toContain('Facture')
    expect(wrapper.text()).not.toContain('INVOICE')
  })

  // ── Événement addSuggestedTag ──────────────────────────────────────────
  it('émet "addSuggestedTag" avec le bon tag au clic sur "+ Ajouter"', async () => {
    const intelligence = makeDocumentIntelligence({ suggestedTags: ['Adobe', 'Logiciel'] })

    const wrapper = await mountSuspended(IntelligenceSection, {
      props: { intelligence, userOverrideType: null },
    })

    const firstAddButton = wrapper.findAll('button').find((b) =>
      b.text().includes('Ajouter')
    )
    expect(firstAddButton).toBeDefined()
    await firstAddButton!.trigger('click')

    expect(wrapper.emitted('addSuggestedTag')).toBeTruthy()
    expect(wrapper.emitted('addSuggestedTag')![0]).toEqual(['Adobe'])
  })


  // ── Événement requestTypeOverride ─────────────────────────────────────
  it('émet "requestTypeOverride" au clic sur "Ce n\'est pas le bon type ?"', async () => {
    const intelligence = makeDocumentIntelligence()

    const wrapper = await mountSuspended(IntelligenceSection, {
      props: { intelligence, userOverrideType: null },
    })

    const overrideBtn = wrapper.findAll('button').find((b) =>
      b.text().includes("Ce n'est pas le bon type")
    )
    expect(overrideBtn).toBeDefined()
    await overrideBtn!.trigger('click')

    expect(wrapper.emitted('requestTypeOverride')).toBeTruthy()
  })

  // ── Affichage détection originale en secondaire si override actif ──────
  it('affiche la détection originale barrée quand userOverrideType est défini', async () => {
    const intelligence = makeDocumentIntelligence({ detectedType: 'INVOICE' })

    const wrapper = await mountSuspended(IntelligenceSection, {
      props: { intelligence, userOverrideType: 'CONTRACT' },
    })

    // Le type override (Contrat) est affiché en principal
    expect(wrapper.text()).toContain('Contrat')
    // La détection originale (Facture) est affichée en secondaire (barrée)
    const struckText = wrapper.find('.line-through')
    expect(struckText.exists()).toBe(true)
    expect(struckText.text()).toContain('Facture')
  })
})
