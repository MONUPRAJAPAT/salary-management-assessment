import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadConfig } from '../config';
import { openDatabase } from '../db/connection';
import { generateDataset, DEFAULT_SEED, SEED_AS_OF } from './generate';
import { seedDatabase } from './seed-database';

/**
 * CLI: `npm run seed [-- --force]`
 *
 * Refuses to overwrite an existing database unless --force is given. Re-seeding drops
 * every salary record in the system, which is not something to do by accident.
 */
function main(): void {
  const config = loadConfig();
  const force = process.argv.includes('--force');
  const databasePath = config.databasePath;

  mkdirSync(dirname(databasePath), { recursive: true });

  if (force) {
    for (const suffix of ['', '-wal', '-shm']) {
      rmSync(`${databasePath}${suffix}`, { force: true });
    }
  }

  const handle = openDatabase({ location: databasePath });
  const existing = handle.sqlite.prepare('SELECT COUNT(*) AS count FROM employees').get() as {
    count: number;
  };

  if (existing.count > 0) {
    console.error(
      `\n  ${databasePath} already holds ${existing.count.toLocaleString()} employees.` +
        `\n  Re-seeding would discard all of it. Run "npm run seed -- --force" if that is what you want.\n`,
    );
    process.exitCode = 1;
    return;
  }

  console.info(`\n  Generating ACME's organisation (seed ${DEFAULT_SEED}, as of ${SEED_AS_OF})...`);
  const generateStartedAt = performance.now();
  const dataset = generateDataset();
  const generateMs = Math.round(performance.now() - generateStartedAt);

  const result = seedDatabase(handle, dataset);

  console.info(`  Generated in ${generateMs} ms, written in ${result.durationMs} ms.\n`);
  console.info(`  ${result.employees.toLocaleString()} employees`);
  console.info(`  ${result.compensationRecords.toLocaleString()} compensation records`);
  console.info(`  ${result.bands} salary bands across ${result.countries} countries`);
  console.info(`\n  Database: ${databasePath}\n`);
}

main();
