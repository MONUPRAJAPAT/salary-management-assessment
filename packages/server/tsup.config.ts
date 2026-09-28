import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  sourcemap: true,
  // @acme/shared is workspace TypeScript source, so it must be bundled in.
  // Everything else (including the native better-sqlite3 binding) stays external.
  noExternal: ['@acme/shared'],
});
