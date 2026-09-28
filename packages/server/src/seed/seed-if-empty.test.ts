import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openTestDatabase, type DatabaseHandle } from '../db/connection';
import { createFixture } from '../testing/fixture';
import { seedIfEmpty } from './seed-if-empty';

let handle: DatabaseHandle;

afterEach(async () => {
  await handle.close();
});

const employeeCount = (): number =>
  (handle.sqlite.prepare('SELECT COUNT(*) AS count FROM employees').get() as { count: number })
    .count;

describe('seeding an empty database on boot', () => {
  it('does nothing at all when it is switched off', () => {
    handle = openTestDatabase();
    expect(seedIfEmpty(handle, { enabled: false })).toBeNull();
    expect(employeeCount()).toBe(0);
  });

  it('fills an empty database when switched on', () => {
    handle = openTestDatabase();
    const result = seedIfEmpty(handle, { enabled: true });

    expect(result?.employees).toBe(10_000);
    expect(employeeCount()).toBe(10_000);
  });

  it('refuses to touch a database that already holds employees', () => {
    // The guard that matters: even switched on, this must never discard real salary data.
    handle = createFixture();
    const before = employeeCount();

    expect(seedIfEmpty(handle, { enabled: true })).toBeNull();
    expect(employeeCount()).toBe(before);
  });

  it('is idempotent — a second boot leaves the data alone', () => {
    handle = openTestDatabase();
    seedIfEmpty(handle, { enabled: true });
    const afterFirst = employeeCount();

    expect(seedIfEmpty(handle, { enabled: true })).toBeNull();
    expect(employeeCount()).toBe(afterFirst);
  });

  it('produces the same organisation every time, so every visitor sees one dataset', () => {
    handle = openTestDatabase();
    seedIfEmpty(handle, { enabled: true });
    const first = handle.sqlite
      .prepare('SELECT employee_number, email FROM employees ORDER BY id LIMIT 1')
      .get();

    const second = openTestDatabase();
    seedIfEmpty(second, { enabled: true });
    const other = second.sqlite
      .prepare('SELECT employee_number, email FROM employees ORDER BY id LIMIT 1')
      .get();

    expect(other).toEqual(first);
    void second.close();
  });
});
