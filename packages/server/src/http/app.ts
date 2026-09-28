import express, { type Express } from 'express';
import compression from 'compression';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types';
import { ReferenceRepository } from '../repositories/reference.repository';
import { employeeRoutes } from './routes/employees';
import { analyticsRoutes } from './routes/analytics';
import { errorHandler, notFoundHandler } from './error-handler';

export interface AppOptions {
  db: Kysely<Database>;
  /** Directory holding the built web bundle. Omitted in tests and in development. */
  webDistPath?: string;
}

/**
 * Resolves the web bundle relative to this module rather than to the working directory.
 *
 * `npm start` runs the server with its cwd set to packages/server, but a host's build
 * config is naturally written relative to the repository root — so a cwd-relative path
 * silently points at packages/server/packages/web/dist and nothing is served. Anchoring
 * to the module makes the default correct wherever it is started from, and absolute
 * paths (as the Docker image uses) still win.
 */
function resolveWebDist(webDistPath: string): string {
  if (isAbsolute(webDistPath)) return webDistPath;
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  return resolve(moduleDirectory, '..', webDistPath);
}

export function createApp({ db, webDistPath }: AppOptions): Express {
  const app = express();
  const reference = new ReferenceRepository(db);

  app.use(compression());
  // The API and the UI are same-origin in production, where the server hosts the bundle.
  // CORS exists for the Vite dev server on a different port.
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.disable('x-powered-by');

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
  });

  app.get('/api/reference', async (_req, res) => {
    res.json(await reference.load());
  });

  app.use('/api/employees', employeeRoutes(db));
  app.use('/api/analytics', analyticsRoutes(db));

  app.use('/api', notFoundHandler);

  if (webDistPath) {
    const root = resolveWebDist(webDistPath);
    if (existsSync(root)) {
      app.use(express.static(root));
      // Anything not matched above is a client-side route: hand it the SPA shell and let
      // React Router decide. Registered after /api so a wrong API path still 404s as JSON.
      app.use((_req, res) => res.sendFile(join(root, 'index.html')));
    } else {
      // Loudly, because the failure mode is a perfectly healthy API serving no UI at all:
      // /api/health passes, the deploy goes green, and every page is a bare 404.
      console.error(
        `  WEB_DIST_PATH is set to "${webDistPath}" but nothing exists at ${root}.\n` +
          `  The API will run and NO user interface will be served. Run "npm run build" first.`,
      );
    }
  }

  app.use(errorHandler);
  return app;
}
