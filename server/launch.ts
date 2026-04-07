/**
 * Entry point for `orbital launch` — starts the central multi-project server.
 *
 * Reads environment variables set by bin/orbital.js:
 *   ORBITAL_LAUNCH_MODE=central
 *   ORBITAL_AUTO_REGISTER=<path>  (if no projects registered yet)
 *   ORBITAL_SERVER_PORT=<port>
 */
import { startCentralServer } from './index.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('launch');

const port = Number(process.env.ORBITAL_SERVER_PORT) || 4444;
const autoRegisterPath = process.env.ORBITAL_AUTO_REGISTER || undefined;

startCentralServer({
  port,
  autoRegisterPath: autoRegisterPath || undefined,
}).then(({ shutdown }) => {
  process.on('SIGINT', async () => {
    await shutdown();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await shutdown();
    process.exit(0);
  });
}).catch((err) => {
  log.error('Failed to start central server', { error: err.message });
  process.exit(1);
});
