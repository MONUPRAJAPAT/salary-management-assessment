import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'server',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Repository tests each build their own in-memory database, so they are
    // isolated by construction and safe to run in parallel.
  },
});
