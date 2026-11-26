import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Database } from '../src/db/db.js';
import { migrateUp } from '../src/db/migrate.js';
import { buildApp } from '../src/http/app.js';
import { startBoss } from '../src/jobs/boss.js';

// Multi-arch build of postgis/postgis (that one is amd64-only). Override with POSTGIS_IMAGE.
const IMAGE = process.env.POSTGIS_IMAGE ?? 'imresamu/postgis:17-3.5';

let pg: StartedPostgreSqlContainer;
let db: Database;
const config = {
  version: 'test',
  logLevel: 'silent',
  debugRoutes: true,
  adminToken: 'secret-token',
};

beforeAll(async () => {
  pg = await new PostgreSqlContainer(IMAGE).start();
  await migrateUp(pg.getConnectionUri());
  db = createDb(pg.getConnectionUri());
});

afterAll(async () => {
  await db?.destroy();
  await pg?.stop();
});

describe('server against PostGIS', () => {
  it('GET /health is ok once migrations ran', async () => {
    const app = buildApp({ config, db });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', database: 'ok', version: 'test' });
    await app.close();
  });

  it('GET /health is 503 when the database is unreachable', async () => {
    const dead = createDb('postgres://nobody:nothing@127.0.0.1:1/none');
    const app = buildApp({ config, db: dead });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: 'degraded', database: 'unreachable' });
    await app.close();
    await dead.destroy();
  });

  it('debug routes need the admin token', async () => {
    const app = buildApp({ config, db });
    expect((await app.inject({ url: '/debug/tracks/1' })).statusCode).toBe(401);
    const ok = await app.inject({ url: '/debug/tracks/1?token=secret-token' });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toContain('text/html');
    await app.close();
  });

  it('debug routes are absent unless enabled', async () => {
    const app = buildApp({ config: { ...config, debugRoutes: false }, db });
    expect((await app.inject({ url: '/debug/tracks/1?token=secret-token' })).statusCode).toBe(404);
    await app.close();
  });

  it('pg-boss starts on the same database and can schedule', async () => {
    const boss = await startBoss(pg.getConnectionUri());
    await boss.createQueue('smoke');
    await boss.schedule('smoke', '0 3 * * *', {}, { tz: 'UTC' });
    expect((await boss.getSchedules()).map((s) => s.name)).toContain('smoke');
    await boss.stop({ graceful: false });
  });
});
