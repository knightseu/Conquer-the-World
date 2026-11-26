import * as Sentry from '@sentry/node';
import { loadConfig } from './config.js';
import { createDb } from './db/db.js';
import { buildApp } from './http/app.js';
import { startBoss } from './jobs/boss.js';

const config = loadConfig();
const db = createDb(config.databaseUrl);
const app = buildApp({ config, db });
if (config.sentryDsn) Sentry.setupFastifyErrorHandler(app);
const boss = config.runWorker ? await startBoss(config.databaseUrl) : undefined;

await app.listen({ port: config.port, host: config.host });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await boss?.stop({ graceful: true });
    await db.destroy();
    process.exit(0);
  });
}
