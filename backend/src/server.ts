import { buildApp } from './app';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

async function start(): Promise<void> {
  const app = await buildApp();

  try {
    const address = await app.listen({ port: PORT, host: HOST });
    app.log.info(`🚀 Tidy backend démarré sur ${address}`);
  } catch (err) {
    app.log.error({ err }, 'Erreur au démarrage du serveur');
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

start();
