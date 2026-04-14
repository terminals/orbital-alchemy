/**
 * Entry point for the central multi-project server.
 *
 * Reads environment variables set by bin/orbital.js:
 *   ORBITAL_LAUNCH_MODE=central
 *   ORBITAL_SERVER_PORT=<port>
 */
import { startCentralServer } from './index.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('launch');

const port = Number(process.env.ORBITAL_SERVER_PORT) || 4444;

startCentralServer({
  port,
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
