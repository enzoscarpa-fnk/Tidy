// Initialise le store auth depuis le stockage sécurisé au démarrage de l'app.
// Le suffixe .client.ts garantit l'exécution côté client uniquement (SPA + Capacitor).

export default defineNuxtPlugin(async () => {
  const authStore = useAuthStore()
  await authStore.init()
})
