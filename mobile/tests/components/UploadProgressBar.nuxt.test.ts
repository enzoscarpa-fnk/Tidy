import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, it, expect } from 'vitest'
import UploadProgressBar from '~/components/UploadProgressBar.vue'

describe('UploadProgressBar', () => {

  // ── Statut uploading ───────────────────────────────────────────────────
  it('affiche le pourcentage en cours et pas de bouton retry quand uploading', async () => {
    const wrapper = await mountSuspended(UploadProgressBar, {
      props: {
        progress: 42,
        filename: 'facture.pdf',
        status: 'uploading',
      },
    })

    expect(wrapper.text()).toContain('42')
    expect(wrapper.text()).toContain('facture.pdf')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  // ── Statut success ─────────────────────────────────────────────────────
  it('affiche "Envoyé" et pas de bouton retry quand success', async () => {
    const wrapper = await mountSuspended(UploadProgressBar, {
      props: {
        progress: 100,
        filename: 'contrat.pdf',
        status: 'success',
      },
    })

    expect(wrapper.text()).toContain('Envoyé')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  // ── Statut error ───────────────────────────────────────────────────────
  it('affiche le message d\'erreur et le bouton retry quand error', async () => {
    const wrapper = await mountSuspended(UploadProgressBar, {
      props: {
        progress: 0,
        filename: 'scan.jpg',
        status: 'error',
        errorMessage: 'Connexion interrompue.',
      },
    })

    expect(wrapper.text()).toContain('Connexion interrompue.')
    const retryBtn = wrapper.find('button')
    expect(retryBtn.exists()).toBe(true)
    expect(retryBtn.text()).toContain('Réessayer')
  })

  // ── Événement retry ────────────────────────────────────────────────────
  it('émet "retry" au clic sur le bouton Réessayer', async () => {
    const wrapper = await mountSuspended(UploadProgressBar, {
      props: {
        progress: 0,
        filename: 'doc.pdf',
        status: 'error',
        errorMessage: 'Erreur réseau.',
      },
    })

    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('retry')).toBeTruthy()
  })

  // ── Barre de couleur selon statut ─────────────────────────────────────
  it('la barre est rouge en statut error et verte en statut success', async () => {
    const errorWrapper = await mountSuspended(UploadProgressBar, {
      props: { progress: 0, filename: 'doc.pdf', status: 'error' },
    })
    expect(errorWrapper.find('.bg-red-500').exists()).toBe(true)

    const successWrapper = await mountSuspended(UploadProgressBar, {
      props: { progress: 100, filename: 'doc.pdf', status: 'success' },
    })
    expect(successWrapper.find('.bg-green-500').exists()).toBe(true)
  })
})
