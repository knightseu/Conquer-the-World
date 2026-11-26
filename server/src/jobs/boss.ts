import { PgBoss } from 'pg-boss';

/**
 * Background work runs on pg-boss in the same Postgres. In v1 the worker lives in the
 * API process; in v2 it moves to its own process unchanged (N4). Scheduled work uses
 * pg-boss schedules (`boss.schedule`), not host cron.
 *
 * No queues yet: claim processing arrives with Track upload, scoring with its ticket.
 */
export async function startBoss(databaseUrl: string): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString: databaseUrl, max: 3 });
  boss.on('error', (err) => console.error('pg-boss error', err));
  await boss.start();
  return boss;
}
