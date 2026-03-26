<script setup lang="ts">
// Ticket 6.7 — Page d'inscription
// Pas de toast — erreurs affichées inline sous le formulaire.

definePageMeta({ layout: false })

const authStore = useAuthStore()

const displayName = ref('')
const email = ref('')
const password = ref('')
const showPassword = ref(false)

const fieldErrors = reactive({
  displayName: '',
  email: '',
  password: '',
})

function validate(): boolean {
  fieldErrors.displayName = ''
  fieldErrors.email = ''
  fieldErrors.password = ''
  let valid = true

  if (!displayName.value.trim() || displayName.value.trim().length < 2) {
    fieldErrors.displayName = 'Le prénom doit contenir au moins 2 caractères.'
    valid = false
  }
  if (!email.value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    fieldErrors.email = 'Adresse email invalide.'
    valid = false
  }
  if (!password.value || password.value.length < 8) {
    fieldErrors.password = 'Le mot de passe doit contenir au moins 8 caractères.'
    valid = false
  }
  return valid
}

async function handleSubmit(): Promise<void> {
  if (!validate()) return
  authStore.error = null
  try {
    await authStore.register(email.value, password.value, displayName.value.trim())
    await navigateTo('/')
  } catch {
    // authStore.error est déjà renseigné par le store
  }
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-tidy-surface px-6 pt-16">
    <!-- Logo / Titre -->
    <div class="mb-10 text-center">
      <h1 class="text-2xl font-bold text-tidy-text-primary">Tidy</h1>
      <p class="mt-1 text-sm text-tidy-text-secondary">
        Créez votre compte gratuitement
      </p>
    </div>

    <!-- Formulaire -->
    <form class="flex flex-col gap-5" novalidate @submit.prevent="handleSubmit">
      <!-- Prénom / Nom affiché -->
      <div>
        <label for="displayName" class="input-label">Prénom ou nom affiché</label>
        <input
          id="displayName"
          v-model="displayName"
          type="text"
          autocomplete="name"
          placeholder="Marie Dupont"
          :class="fieldErrors.displayName ? 'input-field-error' : 'input-field'"
          :disabled="authStore.isLoading"
        />
        <p
          v-if="fieldErrors.displayName"
          class="mt-1 text-xs text-tidy-status-error"
        >
          {{ fieldErrors.displayName }}
        </p>
      </div>

      <!-- Email -->
      <div>
        <label for="email" class="input-label">Email</label>
        <input
          id="email"
          v-model="email"
          type="email"
          autocomplete="email"
          placeholder="vous@exemple.com"
          :class="fieldErrors.email ? 'input-field-error' : 'input-field'"
          :disabled="authStore.isLoading"
        />
        <p v-if="fieldErrors.email" class="mt-1 text-xs text-tidy-status-error">
          {{ fieldErrors.email }}
        </p>
      </div>

      <!-- Mot de passe -->
      <div>
        <label for="password" class="input-label">Mot de passe</label>
        <div class="relative">
          <input
            id="password"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="new-password"
            placeholder="Minimum 8 caractères"
            :class="[
              fieldErrors.password ? 'input-field-error' : 'input-field',
              'pr-11',
            ]"
            :disabled="authStore.isLoading"
          />
          <button
            type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-tidy-text-tertiary"
            :aria-label="showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'"
            @click="showPassword = !showPassword"
          >
            <svg
              v-if="!showPassword"
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
            <svg
              v-else
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
              />
            </svg>
          </button>
        </div>
        <p
          v-if="fieldErrors.password"
          class="mt-1 text-xs text-tidy-status-error"
        >
          {{ fieldErrors.password }}
        </p>
      </div>

      <!-- Erreur globale (API) -->
      <div
        v-if="authStore.error"
        class="rounded-xl bg-red-50 px-4 py-3 text-sm text-tidy-status-error"
        role="alert"
      >
        {{ authStore.error }}
      </div>

      <!-- Bouton Créer le compte -->
      <button
        type="submit"
        class="btn-primary mt-2"
        :disabled="authStore.isLoading"
      >
        <span v-if="authStore.isLoading" class="flex items-center gap-2">
          <svg
            class="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Création du compte…
        </span>
        <span v-else>Créer mon compte</span>
      </button>
    </form>

    <!-- Lien connexion -->
    <p class="mt-8 text-center text-sm text-tidy-text-secondary">
      Déjà un compte ?
      <NuxtLink
        to="/auth/login"
        class="font-medium text-tidy-primary underline-offset-2 hover:underline"
      >
        Se connecter
      </NuxtLink>
    </p>

    <!-- Mention légale discrète -->
    <p class="mt-auto pb-8 pt-6 text-center text-xs text-tidy-text-tertiary">
      En créant un compte, vous acceptez nos conditions d'utilisation.
    </p>
  </div>
</template>
