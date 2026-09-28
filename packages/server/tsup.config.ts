import { defineConfig } from 'tsup';

export default defineConfig({
  // Two entries: the server, and the seed CLI. Compiling the seed means the runtime
  // image needs neither tsx nor the TypeScript source to create a database.
  entry: { index: 'src/index.ts', seed: 'src/seed/run-seed.ts' },
  format: ['esm'],
  target: 'node20',
  clean: true,
  sourcemap: true,
  // @acme/shared is workspace TypeScript source, so it must be bundled in.
  // Everything else (including the native better-sqlite3 binding) stays external.
  noExternal: ['@acme/shared'],
});
