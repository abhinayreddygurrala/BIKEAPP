import { buildApp } from './app.js';
import { config } from './config.js';
import { migrate, openDatabase } from './db.js';

const db = openDatabase(config.databasePath);
migrate(db, (message) => console.log(`[migrate] ${message}`));
console.log(`[db] using ${config.databasePath}`);

const app = await buildApp({ db, sessionDays: config.sessionDays, logger: true });

// Expired sessions are already rejected on use; this just keeps the table small.
const cleanup = setInterval(
  () => {
    try {
      db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    } catch (error) {
      app.log.error(error);
    }
  },
  60 * 60 * 1000
);
cleanup.unref();

async function shutdown(signal: string) {
  app.log.info(`${signal} received, shutting down`);
  clearInterval(cleanup);
  await app.close();
  db.close();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// 0.0.0.0 so Railway's proxy can reach it; localhost would only accept
// connections from inside the container.
await app.listen({ port: config.port, host: '0.0.0.0' });
