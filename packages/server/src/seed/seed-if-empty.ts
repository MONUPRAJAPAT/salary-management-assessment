import type { DatabaseHandle } from '../db/connection';
import { seedDatabase } from './seed-database';
import type { SeedResult } from './seed-database';

/**
 * Seeds a brand-new database at startup, for hosts with no persistent disk.
 *
 * On a free tier the filesystem is wiped whenever the container is replaced, so the app
 * would otherwise come back up with nothing in it. Because the seed is deterministic and
 * takes well under a second, generating it on boot gives every visitor the same complete
 * organisation.
 *
 * Two independent guards, because this writes 10,000 employees:
 *
 *   1. `enabled` must be explicitly switched on (SEED_ON_BOOT=true). It is off by default,
 *      so a normal deployment with a real disk can never reach this code.
 *   2. The database must be **empty**. Even switched on, it will not touch a database that
 *      already holds employees.
 *
 * Both must hold. There is no combination of settings under which this discards data.
 */
export function seedIfEmpty(
  handle: DatabaseHandle,
  { enabled }: { enabled: boolean },
): SeedResult | null {
  if (!enabled) return null;

  const existing = handle.sqlite.prepare('SELECT COUNT(*) AS count FROM employees').get() as {
    count: number;
  };
  if (existing.count > 0) return null;

  return seedDatabase(handle);
}
