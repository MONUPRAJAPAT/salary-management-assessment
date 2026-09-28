import { defineConfig } from 'vitest/config';

/**
 * Root config: runs every package's suite in one command.
 * Each package also has its own config (jsdom for web, node for server),
 * which `projects` composes rather than duplicates.
 */
export default defineConfig({
  test: {
    projects: ['packages/shared', 'packages/server', 'packages/web'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts', 'packages/web/src/main.tsx'],
    },
  },
});
