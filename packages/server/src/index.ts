import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadConfig } from './config';
import { openDatabase } from './db/connection';
import { createApp } from './http/app';
import { seedIfEmpty } from './seed/seed-if-empty';

const config = loadConfig();
mkdirSync(dirname(config.databasePath), { recursive: true });

const handle = openDatabase({ location: config.databasePath });

// Only ever runs when SEED_ON_BOOT is set *and* the database is empty.
const seeded = seedIfEmpty(handle, { enabled: config.seedOnBoot });
if (seeded) {
  console.info(
    `  Empty database seeded on boot: ${seeded.employees.toLocaleString()} employees, ` +
      `${seeded.compensationRecords.toLocaleString()} compensation records in ${seeded.durationMs} ms.`,
  );
}

const app = createApp({ db: handle.db, webDistPath: config.webDistPath });

const server = app.listen(config.port, () => {
  console.info(`  ACME salary management API listening on http://localhost:${config.port}`);
  console.info(`  Database: ${config.databasePath} (${config.nodeEnv})`);
});

const shutdown = (signal: string): void => {
  console.info(`\n  ${signal} received, shutting down.`);
  server.close(() => {
    void handle.close().then(() => process.exit(0));
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
