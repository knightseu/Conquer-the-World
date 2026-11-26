import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import type { DB } from './schema.js';

export type Database = Kysely<DB>;

export function createDb(databaseUrl: string, max = 5): Database {
  // Keep the pool small: the smallest managed Postgres tiers allow few connections,
  // and pg-boss holds its own pool.
  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: databaseUrl, max }) }),
  });
}

export async function pingDb(db: Database): Promise<boolean> {
  try {
    await sql`select postgis_version()`.execute(db);
    return true;
  } catch {
    return false;
  }
}
