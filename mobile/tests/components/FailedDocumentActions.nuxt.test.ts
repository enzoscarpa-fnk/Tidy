import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, it, expect } from 'vitest'
import FailedDocumentActions from '~/components/FailedDocumentActions.vue'

describe('FailedDocumentActions', () => {

  // ── Bouton "Relancer" présent si failureCount < 3 ──────────────────────
  it('affiche le bouton "Relancer l\'analyse" quand failureCount < 3', async () => {
    const wrapper = await mountSuspended(FailedDocumentActions, {
      props: { failureCount: 1 },
    })

    const retryBtn = wrapper.findAll('button').find((b) =>
      b.text().includes('Relancer')
    )
    expect(retryBtn).toBeDefined()
    expect(retryBtn!.exists()).toBe(true)
  })

  it('affiche le bouton "Relancer" quand failureCount = 2', async () => {
    const wrapper = await mountSuspended(FailedDocumentActions, {
      props: { failureCount: 2 },
    })

    const retryBtn = wrapper.findAll('button').find((b) =>
      b.text().includes('Relancer')
    )
    expect(retryBtn?.exists()).toBe(true)
  })

  // ── TDD checkpoint : bouton "Relancer" absent si failureCount >= 3 ─────
  it('masque le bouton "Relancer l\'analyse" quand failureCount >= 3', async () => {
    const wrapper = await mountSuspended(FailedDocumentActions, {
      props: { failureCount: 3 },
    })

    const retryBtn = wrapper.findAll('button').find((b) =>
      b.text().includes('Relancer')
    )
    expect(retryBtn).toBeUndefined()
  })

  // ── Message adapté après plusieurs échecs ─────────────────────────────
  it('affiche un message différent quand failureCount >= 3', async () => {
    const singleWrapper = await mountSuspended(FailedDocumentActions, {
      props: { failureCount: 1 },
    })
    const multiWrapper = await mountSuspended(FailedDocumentActions, {
      props: { failureCount: 3 },
    })

    expect(singleWrapper.text()).not.toEqual(multiWrapper.text())
    expect(multiWrapper.text()).toContain('plusieurs fois')
  })

  // ── Événement retry ────────────────────────────────────────────────────
  it('émet "retry" au clic sur "Relancer l\'analyse"', async () => {
    const wrapper = await mountSuspended(FailedDocumentActions, {
      props: { failureCount: 1 },
    })

    const retryBtn = wrapper.findAll('button').find((b) =>
      b.text().includes('Relancer')
    )
    await retryBtn!.trigger('click')

    expect(wrapper.emitted('retry')).toBeTruthy()
  })

  // ── Événement keepWithoutAnalysis ──────────────────────────────────────
  it('émet "keepWithoutAnalysis" au clic sur "Conserver sans analyse"', async () => {
    const wrapper = await mountSuspended(FailedDocumentActions, {
      props: { failureCount: 1 },
    })

    const keepBtn = wrapper.findAll('button').find((b) =>
      b.text().includes('Conserver')
    )
    expect(keepBtn).toBeDefined()
    await keepBtn!.trigger('click')

    expect(wrapper.emitted('keepWithoutAnalysis')).toBeTruthy()
  })
})
