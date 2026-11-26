// Loaded first (`node --import ./dist/instrument.js`) so Sentry can hook modules.
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    release: process.env.APP_VERSION,
    environment: process.env.SENTRY_ENVIRONMENT ?? 'production',
    tracesSampleRate: 0,
  });
}
