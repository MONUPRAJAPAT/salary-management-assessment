import BetterSqlite3 from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { SCHEMA_SQL } from './schema';
import type { Database } from './types';

export interface DatabaseHandle {
  db: Kysely<Database>;
  sqlite: BetterSqlite3.Database;
  close: () => Promise<void>;
}

export interface OpenDatabaseOptions {
  /** A file path, or ':memory:' for the throwaway database every test builds. */
  location: string;
  /** Creates the schema if the database is empty. */
  migrate?: boolean;
  /** Prints every statement — useful when a query plan is the thing under investigation. */
  logQueries?: boolean;
}

export function openDatabase({
  location,
  migrate = true,
  logQueries = false,
}: OpenDatabaseOptions): DatabaseHandle {
  const sqlite = new BetterSqlite3(location);

  // WAL lets reads proceed during a write, which matters while the seed is running.
  // It is meaningless for :memory:, and SQLite ignores it there rather than failing.
  sqlite.pragma('journal_mode = WAL');
  // Off by default in SQLite, which is a decades-old compatibility default rather than
  // a recommendation. The schema's foreign keys are only enforced with this on.
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');

  if (migrate && !hasSchema(sqlite)) {
    sqlite.exec(SCHEMA_SQL);
  }

  const db = new Kysely<Database>({
    dialect: new SqliteDialect({ database: sqlite }),
    ...(logQueries
      ? { log: (event: { level: string; query: { sql: string } }) => {
          if (event.level === 'query') console.info(event.query.sql);
        } }
      : {}),
  });

  return {
    db,
    sqlite,
    close: async () => {
      await db.destroy();
    },
  };
}

function hasSchema(sqlite: BetterSqlite3.Database): boolean {
  const row = sqlite
    .prepare(`SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get('employees') as { count: number } | undefined;
  return (row?.count ?? 0) > 0;
}

/** Builds an empty in-memory database. Used by every repository and API test. */
export function openTestDatabase(): DatabaseHandle {
  return openDatabase({ location: ':memory:', migrate: true });
}
