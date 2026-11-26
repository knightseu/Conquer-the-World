import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Integration tests start a PostGIS container; give them room.
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
