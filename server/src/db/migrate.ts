import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';

/** The migrations folder, which ships next to `dist/` in the image. */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));

/** Applies pending migrations. Production runs the CLI as Render's pre-deploy command. */
export async function migrateUp(databaseUrl: string): Promise<void> {
  await runner({
    databaseUrl,
    dir: MIGRATIONS_DIR,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    useGlob: false,
    log: () => {},
  } as Parameters<typeof runner>[0]);
}
