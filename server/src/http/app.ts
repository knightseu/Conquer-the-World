import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from '../config.js';
import { type Database, pingDb } from '../db/db.js';
import type { components } from './api-types.js';
import { debugRoutes } from './debug.js';
import { ref, registerSpecSchemas } from './spec.js';

type Health = components['schemas']['Health'];

export interface AppDeps {
  config: Pick<Config, 'version' | 'logLevel' | 'debugRoutes' | 'adminToken'>;
  db: Database;
}

export function buildApp({ config, db }: AppDeps): FastifyInstance {
  const app = Fastify({ logger: { level: config.logLevel } });
  registerSpecSchemas(app);

  app.get(
    '/health',
    { schema: { response: { 200: ref('Health'), 503: ref('Health') } } },
    async (_req, reply) => {
      const dbOk = await pingDb(db);
      const body: Health = {
        status: dbOk ? 'ok' : 'degraded',
        database: dbOk ? 'ok' : 'unreachable',
        version: config.version,
      };
      return reply.code(dbOk ? 200 : 503).send(body);
    },
  );

  if (config.debugRoutes && config.adminToken)
    app.register(debugRoutes, { adminToken: config.adminToken });
  return app;
}
