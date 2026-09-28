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
 * Finds the built web bundle.
 *
 * An absolute path is taken as given — that is what the Docker image sets and it should
 * win outright. A relative one is ambiguous: relative to what? `npm start` runs the
 * server with its cwd set to packages/server, while a host's configuration is naturally
 * written relative to the repository root, so the same string means two different
 * directories depending on who wrote it.
 *
 * Rather than pick one and be wrong half the time, try each meaning and use the first
 * that exists — ending with the bundle's actual home relative to this module, which is
 * correct regardless of what was configured. An app should be able to find its own
 * assets; getting this wrong serves a healthy API and no user interface at all, which is
 * a far more confusing failure than crashing would be.
 */
function resolveWebDist(webDistPath: string): { root: string; tried: string[] } {
  if (isAbsolute(webDistPath)) return { root: webDistPath, tried: [webDistPath] };

  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const tried = [
    resolve(moduleDirectory, '..', webDistPath), // relative to packages/server
    resolve(process.cwd(), webDistPath), // relative to the working directory
    resolve(moduleDirectory, '../../web/dist'), // where the bundle actually lives
  ];

  return {
    root: tried.find((candidate) => existsSync(candidate)) ?? tried[0] ?? webDistPath,
    tried,
  };
}

export function createApp({ db, webDistPath }: AppOptions): Express {
  const app = express();
  const reference = new ReferenceRepository(db);
  let hasWebBundle = false;

  app.use(compression());
  // The API and the UI are same-origin in production, where the server hosts the bundle.
  // CORS exists for the Vite dev server on a different port.
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.disable('x-powered-by');

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      // Most hosts expose the deployed commit. Reporting it turns "which build is live?"
      // from guesswork into a request — it took a round of probing to answer that once.
      commit: process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? null,
      servingWebBundle: hasWebBundle,
    });
  });

  app.get('/api/reference', async (_req, res) => {
    res.json(await reference.load());
  });

  app.use('/api/employees', employeeRoutes(db));
  app.use('/api/analytics', analyticsRoutes(db));

  app.use('/api', notFoundHandler);

  if (webDistPath) {
    const { root, tried } = resolveWebDist(webDistPath);
    if (existsSync(root)) {
      hasWebBundle = true;
      app.use(express.static(root));
      // Anything not matched above is a client-side route: hand it the SPA shell and let
      // React Router decide. Registered after /api so a wrong API path still 404s as JSON.
      app.use((_req, res) => res.sendFile(join(root, 'index.html')));
    } else {
      // Loudly, because the failure mode is a perfectly healthy API serving no UI at all:
      // /api/health passes, the deploy goes green, and every page is a bare 404.
      console.error(
        `  No web bundle found for WEB_DIST_PATH="${webDistPath}". Tried:\n` +
          tried.map((candidate) => `    ${candidate}`).join('\n') +
          `\n  The API will run and NO user interface will be served. Run "npm run build" first.`,
      );
    }
  }

  app.use(errorHandler);
  return app;
}
