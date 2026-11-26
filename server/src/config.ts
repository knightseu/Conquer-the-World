export interface Config {
  databaseUrl: string;
  port: number;
  host: string;
  logLevel: string;
  version: string;
  debugRoutes: boolean;
  adminToken: string | undefined;
  sentryDsn: string | undefined;
  runWorker: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const debugRoutes = env.DEBUG_ROUTES === '1';
  if (debugRoutes && !env.ADMIN_TOKEN) throw new Error('DEBUG_ROUTES=1 requires ADMIN_TOKEN');
  return {
    databaseUrl,
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    logLevel: env.LOG_LEVEL ?? 'info',
    // Render sets RENDER_GIT_COMMIT for Git deploys; image deploys pass APP_VERSION.
    version: env.APP_VERSION ?? env.RENDER_GIT_COMMIT ?? 'dev',
    debugRoutes,
    adminToken: env.ADMIN_TOKEN || undefined,
    sentryDsn: env.SENTRY_DSN || undefined,
    runWorker: env.RUN_WORKER !== '0',
  };
}
