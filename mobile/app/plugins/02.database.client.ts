// Initialise la base SQLite chiffrée au démarrage de l'app.
// S'exécute après 01.capacitor.client.ts (ordre alphabétique garanti).
// En mode web/dev, l'init est silencieusement skippée (guard natif dans useDatabaseService).

export default defineNuxtPlugin(async () => {
  const { initDatabase } = useDatabaseService()
  await initDatabase()
})
