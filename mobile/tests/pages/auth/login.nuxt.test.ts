import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import LoginPage from '~/pages/auth/login.vue'

// ── vi.hoisted : variables disponibles dès le hoist ───────────────────────

const { mockLogin, mockNavigateTo, mockAuthStore } = vi.hoisted(() => {
  const mockLogin = vi.fn()
  const mockNavigateTo = vi.fn()
  const mockAuthStore = {
    isLoading: false,
    error: null as string | null,
    isAuthenticated: false,
    accessToken: null as string | null,
    login: mockLogin,
  }
  return { mockLogin, mockNavigateTo, mockAuthStore }
})

mockNuxtImport('useAuthStore', () => () => mockAuthStore)
mockNuxtImport('navigateTo', () => mockNavigateTo)

// ── Tests ──────────────────────────────────────────────────────────────────

describe('pages/auth/login.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthStore.error = null
    mockAuthStore.isLoading = false
    mockAuthStore.isAuthenticated = false
  })

  it('affiche le champ email, le champ password et le bouton soumettre', async () => {
    const wrapper = await mountSuspended(LoginPage)
    expect(wrapper.find('#email').exists()).toBe(true)
    expect(wrapper.find('#password').exists()).toBe(true)
    expect(wrapper.find('button[type="submit"]').text()).toContain('Se connecter')
  })

  it('affiche une erreur inline si email invalide', async () => {
    const wrapper = await mountSuspended(LoginPage)
    await wrapper.find('#email').setValue('invalid-email')
    await wrapper.find('#password').setValue('password123')
    await wrapper.find('form').trigger('submit')
    await nextTick()
    expect(wrapper.text()).toContain('Adresse email invalide')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('affiche une erreur inline si password trop court', async () => {
    const wrapper = await mountSuspended(LoginPage)
    await wrapper.find('#email').setValue('test@example.com')
    await wrapper.find('#password').setValue('short')
    await wrapper.find('form').trigger('submit')
    await nextTick()
    expect(wrapper.text()).toContain('au moins 8 caractères')
  })

  it("n'appelle pas login si la validation échoue", async () => {
    const wrapper = await mountSuspended(LoginPage)
    await wrapper.find('#email').setValue('')
    await wrapper.find('form').trigger('submit')
    await nextTick()
    expect(mockLogin).not.toHaveBeenCalled()
  })

  it('appelle authStore.login avec email et password corrects', async () => {
    mockLogin.mockResolvedValueOnce(undefined)
    const wrapper = await mountSuspended(LoginPage)
    await wrapper.find('#email').setValue('marie@example.com')
    await wrapper.find('#password').setValue('motdepasse123')
    await wrapper.find('form').trigger('submit')
    await nextTick()
    expect(mockLogin).toHaveBeenCalledOnce()
    expect(mockLogin).toHaveBeenCalledWith('marie@example.com', 'motdepasse123')
  })

  it('navigue vers / après un login réussi', async () => {
    mockLogin.mockResolvedValueOnce(undefined)
    const wrapper = await mountSuspended(LoginPage)
    await wrapper.find('#email').setValue('marie@example.com')
    await wrapper.find('#password').setValue('motdepasse123')
    await wrapper.find('form').trigger('submit')
    await nextTick()
    expect(mockNavigateTo).toHaveBeenCalledWith('/')
  })

  it("affiche le message d'erreur API inline sans naviguer", async () => {
    mockLogin.mockRejectedValueOnce(new Error('Unauthorized'))
    mockAuthStore.error = 'Email ou mot de passe incorrect.'
    const wrapper = await mountSuspended(LoginPage)
    await wrapper.find('#email').setValue('marie@example.com')
    await wrapper.find('#password').setValue('wrongpassword')
    await wrapper.find('form').trigger('submit')
    await nextTick()
    expect(wrapper.find('[role="alert"]').text()).toContain('Email ou mot de passe incorrect.')
    expect(mockNavigateTo).not.toHaveBeenCalled()
  })

  it('désactive le bouton submit pendant le chargement', async () => {
    mockAuthStore.isLoading = true
    const wrapper = await mountSuspended(LoginPage)
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('contient un lien vers /auth/register', async () => {
    const wrapper = await mountSuspended(LoginPage)
    const link = wrapper.find('a[href="/auth/register"]')
    expect(link.exists()).toBe(true)
    expect(link.text()).toContain('Créer un compte')
  })
})
